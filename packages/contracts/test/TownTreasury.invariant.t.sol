// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TownTreasury} from "../src/TownTreasury.sol";
import {MockUSDC6} from "./mocks/MockUSDC6.sol";

/// @dev Random walk over every token-moving entrypoint. Ghost variables mirror per-actor savings and loans.
contract TreasuryHandler is Test {
    TownTreasury public immutable treasury;
    MockUSDC6 public immutable usdc;
    address public immutable treasurer;

    address[] public actors;
    mapping(address => uint256) public ghostDeposits;
    uint256 public ghostTotalDeposits;
    uint256 public ghostInterestCollected;
    uint256 public ghostFunded;
    uint256 public ghostStipends;
    uint256 public ghostDefaultedPrincipal;
    uint256 public ghostPrincipalOut; // lent − principal repaid − defaulted

    constructor(TownTreasury treasury_, MockUSDC6 usdc_, address treasurer_) {
        treasury = treasury_;
        usdc = usdc_;
        treasurer = treasurer_;
        for (uint256 i = 0; i < 4; i++) {
            address a = makeAddr(string(abi.encodePacked("actor", i)));
            actors.push(a);
            usdc.mint(a, 1000e6);
            vm.prank(a);
            usdc.approve(address(treasury), type(uint256).max);
        }
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function deposit(uint256 seed, uint256 amount) external {
        address a = _actor(seed);
        uint256 bal = usdc.balanceOf(a);
        if (bal == 0) return;
        amount = bound(amount, 1, bal);
        vm.prank(a);
        treasury.deposit(amount);
        ghostDeposits[a] += amount;
        ghostTotalDeposits += amount;
    }

    function withdraw(uint256 seed, uint256 amount) external {
        address a = _actor(seed);
        uint256 max = ghostDeposits[a];
        if (max == 0) return;
        amount = bound(amount, 1, max);
        if (amount > treasury.balance()) return; // liquidity lent out; contract would revert
        vm.prank(a);
        treasury.withdraw(amount);
        ghostDeposits[a] -= amount;
        ghostTotalDeposits -= amount;
    }

    function fund(uint256 seed, uint256 amount) external {
        address a = _actor(seed);
        uint256 bal = usdc.balanceOf(a);
        if (bal == 0) return;
        amount = bound(amount, 1, bal);
        vm.prank(a);
        treasury.fund(amount);
        ghostFunded += amount;
    }

    function requestAndApprove(uint256 seed, uint256 amount, uint32 term) external {
        address a = _actor(seed);
        if (treasury.activeLoanOf(a) != 0) return;
        amount = bound(amount, 1, treasury.maxLoan());
        term = uint32(bound(term, 1, 30 days));
        if (amount > treasury.balance()) return;
        vm.prank(a);
        uint256 id = treasury.requestLoan(amount, term);
        vm.prank(treasurer);
        treasury.approveLoan(id);
        ghostPrincipalOut += amount;
    }

    function repay(uint256 seed, uint256 amount, uint32 elapsed) external {
        address a = _actor(seed);
        uint256 id = treasury.activeLoanOf(a);
        if (id == 0 || treasury.loan(id).status != TownTreasury.LoanStatus.Active) return;
        vm.warp(block.timestamp + bound(elapsed, 0, 7 days));
        (uint256 p, uint256 i) = treasury.owed(id);
        amount = bound(amount, 1, p + i);
        if (amount > usdc.balanceOf(a)) return;
        vm.prank(a);
        treasury.repay(id, amount);
        uint256 toInterest = amount > i ? i : amount;
        ghostInterestCollected += toInterest;
        ghostPrincipalOut -= amount - toInterest;
    }

    function markDefault(uint256 seed) external {
        address a = _actor(seed);
        uint256 id = treasury.activeLoanOf(a);
        if (id == 0) return;
        TownTreasury.Loan memory l = treasury.loan(id);
        if (l.status != TownTreasury.LoanStatus.Active) return;
        uint256 defaultable = uint256(l.dueAt) + treasury.gracePeriodSeconds() + 1;
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < defaultable) vm.warp(defaultable); // time only moves forward
        vm.prank(treasurer);
        treasury.markDefault(id);
        ghostDefaultedPrincipal += l.principalRemaining;
        ghostPrincipalOut -= l.principalRemaining;
    }

    function payStipend(uint256 seed, uint256 amount) external {
        uint256 free = treasury.freeLiquidity();
        if (free == 0) return;
        amount = bound(amount, 1, free);
        vm.prank(treasurer);
        treasury.payStipend(_actor(seed), amount);
        ghostStipends += amount;
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }
}

contract TownTreasuryInvariantTest is Test {
    MockUSDC6 usdc;
    TownTreasury treasury;
    TreasuryHandler handler;
    address owner = makeAddr("owner");
    address treasurer = makeAddr("treasurer");

    function setUp() public {
        usdc = new MockUSDC6();
        treasury = new TownTreasury(IERC20(address(usdc)), owner, treasurer, 600, 120);
        handler = new TreasuryHandler(treasury, usdc, treasurer);
        targetContract(address(handler));
        vm.warp(1_700_000_000);
    }

    /// @dev `balance()` is exactly the ERC-20 balance held — nothing is cached or double counted.
    function invariant_BalanceMatchesToken() public view {
        assertEq(usdc.balanceOf(address(treasury)), treasury.balance());
    }

    /// @dev Savings ledger matches per-actor ghosts; outstanding matches lent − repaid − defaulted.
    function invariant_LedgersMatchGhosts() public view {
        assertEq(treasury.totalDeposits(), handler.ghostTotalDeposits(), "totalDeposits");
        uint256 sum;
        for (uint256 i = 0; i < handler.actorCount(); i++) {
            address a = handler.actors(i);
            assertEq(treasury.depositOf(a), handler.ghostDeposits(a), "depositOf");
            sum += treasury.depositOf(a);
        }
        assertEq(sum, treasury.totalDeposits(), "sum of deposits");
        assertEq(treasury.outstanding(), handler.ghostPrincipalOut(), "outstanding");
    }

    /// @dev Conservation: tokens held = deposits + funded + interest − stipends − principal still out − defaults.
    function invariant_Conservation() public view {
        uint256 expected = handler.ghostTotalDeposits() + handler.ghostFunded() + handler.ghostInterestCollected()
            - handler.ghostStipends() - treasury.outstanding() - handler.ghostDefaultedPrincipal();
        assertEq(treasury.balance(), expected, "conservation");
    }

    /// @dev Utilisation never exceeds 100% and the rate never underflows the base.
    function invariant_RateBounds() public view {
        assertLe(treasury.utilisationBps(), 10_000);
        assertGe(treasury.currentRateBps(), treasury.baseRateBps());
    }
}
