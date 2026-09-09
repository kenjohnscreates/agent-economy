// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {TownTreasury} from "../src/TownTreasury.sol";
import {MockUSDC, MockUSDC6, MockUSDC18} from "./mocks/MockUSDC6.sol";
import {ReentrantUSDC, ReentrantAttacker} from "./mocks/ReentrantUSDC.sol";

/// @dev Unit + fuzz tests for TownTreasury. Amounts are in token base units; `ONE` = 1 whole token so every
///      assertion works for 6- and 18-decimal mocks alike.
contract TownTreasuryTest is Test {
    uint16 constant BASE_RATE = 600;
    uint32 constant GRACE = 120;
    uint32 constant TERM = 30 days;

    MockUSDC usdc;
    TownTreasury treasury;
    uint256 ONE;

    address owner = makeAddr("owner");
    address treasurer = makeAddr("treasurer");
    address alice = makeAddr("alice"); // worker: deposits
    address bob = makeAddr("bob"); // merchant: borrows
    address carol = makeAddr("carol"); // consumer: stipend
    address rando = makeAddr("rando");

    function setUp() public virtual {
        _deploy(new MockUSDC6());
    }

    function _deploy(MockUSDC token) internal {
        usdc = token;
        ONE = 10 ** usdc.decimals();
        treasury = new TownTreasury(IERC20(address(usdc)), owner, treasurer, BASE_RATE, GRACE);
        usdc.mint(owner, 1000 * ONE);
        usdc.mint(alice, 100 * ONE);
        usdc.mint(bob, 100 * ONE);
        vm.prank(owner);
        usdc.approve(address(treasury), type(uint256).max);
        vm.prank(alice);
        usdc.approve(address(treasury), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(treasury), type(uint256).max);
        vm.warp(1_700_000_000);
    }

    // ─── helpers ─────────────────────────────────────────────────────────────────

    function _fund(uint256 amount) internal {
        vm.prank(owner);
        treasury.fund(amount);
    }

    function _requestAndApprove(address borrower, uint256 amount) internal returns (uint256 id) {
        vm.prank(borrower);
        id = treasury.requestLoan(amount, TERM);
        vm.prank(treasurer);
        treasury.approveLoan(id);
    }

    /// @dev Reference implementation of the contract's interest formula, kept separate for hand checks.
    function _interest(uint256 principal, uint16 rateBps, uint256 elapsed) internal pure returns (uint256) {
        return principal * rateBps * elapsed / (10_000 * 365 days);
    }

    // ─── constructor ─────────────────────────────────────────────────────────────

    function test_Constructor_State() public view {
        assertEq(treasury.usdcDecimals(), usdc.decimals(), "decimals stored");
        assertEq(treasury.owner(), owner, "owner");
        assertTrue(treasury.hasRole(treasury.TREASURER_ROLE(), treasurer), "treasurer role");
        assertTrue(treasury.hasRole(treasury.DEFAULT_ADMIN_ROLE(), owner), "owner is role admin");
        assertEq(treasury.baseRateBps(), BASE_RATE, "base rate");
        assertEq(treasury.spreadBps(), 200, "default spread");
        assertEq(treasury.maxLoan(), 100 * ONE, "default max loan = 100 whole units");
        assertEq(treasury.gracePeriodSeconds(), GRACE, "grace");
    }

    function test_Constructor_RevertsOnBadInputs() public {
        vm.expectRevert(TownTreasury.ZeroAddress.selector);
        new TownTreasury(IERC20(address(0)), owner, treasurer, BASE_RATE, GRACE);
        vm.expectRevert(abi.encodeWithSelector(TownTreasury.InvalidRate.selector, uint16(50)));
        new TownTreasury(IERC20(address(usdc)), owner, treasurer, 50, GRACE);
        vm.expectRevert(abi.encodeWithSelector(TownTreasury.InvalidRate.selector, uint16(2001)));
        new TownTreasury(IERC20(address(usdc)), owner, treasurer, 2001, GRACE);
    }

    // ─── deposit / withdraw ──────────────────────────────────────────────────────

    function test_Deposit_UpdatesAccountingAndEmits() public {
        vm.expectEmit(address(treasury));
        emit TownTreasury.Deposited(alice, 10 * ONE);
        vm.prank(alice);
        treasury.deposit(10 * ONE);

        assertEq(treasury.depositOf(alice), 10 * ONE);
        assertEq(treasury.totalDeposits(), 10 * ONE);
        assertEq(treasury.balance(), 10 * ONE);
        assertEq(usdc.balanceOf(alice), 90 * ONE);
    }

    function test_Deposit_RevertsZero() public {
        vm.prank(alice);
        vm.expectRevert(TownTreasury.ZeroAmount.selector);
        treasury.deposit(0);
    }

    function test_Withdraw_ReturnsSavingsAndEmits() public {
        vm.startPrank(alice);
        treasury.deposit(10 * ONE);
        vm.expectEmit(address(treasury));
        emit TownTreasury.Withdrawn(alice, 4 * ONE);
        treasury.withdraw(4 * ONE);
        vm.stopPrank();

        assertEq(treasury.depositOf(alice), 6 * ONE);
        assertEq(treasury.totalDeposits(), 6 * ONE);
        assertEq(usdc.balanceOf(alice), 94 * ONE);
    }

    function test_Withdraw_RevertsOnOthersSavings() public {
        vm.prank(alice);
        treasury.deposit(10 * ONE);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(TownTreasury.InsufficientDeposit.selector, 0, 1 * ONE));
        treasury.withdraw(1 * ONE);
    }

    function test_Withdraw_RevertsWhenLiquidityLentOut() public {
        vm.prank(alice);
        treasury.deposit(10 * ONE);
        _requestAndApprove(bob, 8 * ONE); // deposits are lendable
        assertEq(treasury.balance(), 2 * ONE);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TownTreasury.InsufficientLiquidity.selector, 2 * ONE, 10 * ONE));
        treasury.withdraw(10 * ONE);

        vm.prank(alice);
        treasury.withdraw(2 * ONE); // partial still fine
        assertEq(treasury.depositOf(alice), 8 * ONE);
    }

    // ─── loan request / approve / deny ───────────────────────────────────────────

    function test_RequestLoan_CreatesPending() public {
        vm.expectEmit(address(treasury));
        emit TownTreasury.LoanRequested(1, bob, 10 * ONE, TERM);
        vm.prank(bob);
        uint256 id = treasury.requestLoan(10 * ONE, TERM);

        assertEq(id, 1);
        TownTreasury.Loan memory l = treasury.loan(id);
        assertEq(uint8(l.status), uint8(TownTreasury.LoanStatus.Pending));
        assertEq(l.borrower, bob);
        assertEq(l.principal, 10 * ONE);
        assertEq(l.principalRemaining, 10 * ONE);
        assertEq(l.requestedAt, block.timestamp);
        assertEq(treasury.activeLoanOf(bob), id);
        assertEq(treasury.outstanding(), 0, "pending is not outstanding");
    }

    function test_RequestLoan_RevertsOnCapsAndDuplicates() public {
        vm.startPrank(bob);
        vm.expectRevert(TownTreasury.ZeroAmount.selector);
        treasury.requestLoan(0, TERM);
        vm.expectRevert(abi.encodeWithSelector(TownTreasury.ExceedsMaxLoan.selector, 101 * ONE, 100 * ONE));
        treasury.requestLoan(101 * ONE, TERM);
        vm.expectRevert(abi.encodeWithSelector(TownTreasury.InvalidTerm.selector, uint32(0)));
        treasury.requestLoan(1 * ONE, 0);
        vm.expectRevert(abi.encodeWithSelector(TownTreasury.InvalidTerm.selector, uint32(366 days)));
        treasury.requestLoan(1 * ONE, 366 days);

        uint256 id = treasury.requestLoan(1 * ONE, TERM);
        vm.expectRevert(abi.encodeWithSelector(TownTreasury.BorrowerHasActiveLoan.selector, id));
        treasury.requestLoan(1 * ONE, TERM);
        vm.stopPrank();
    }

    function test_ApproveLoan_TransfersAndSnapshotsRate() public {
        _fund(50 * ONE);
        vm.prank(bob);
        uint256 id = treasury.requestLoan(10 * ONE, TERM);

        uint64 dueAt = uint64(block.timestamp + TERM);
        vm.expectEmit(address(treasury));
        emit TownTreasury.LoanApproved(id, bob, 10 * ONE, BASE_RATE, dueAt);
        vm.prank(treasurer);
        treasury.approveLoan(id);

        TownTreasury.Loan memory l = treasury.loan(id);
        assertEq(uint8(l.status), uint8(TownTreasury.LoanStatus.Active));
        assertEq(l.rateBps, BASE_RATE, "utilisation was 0 so rate = base");
        assertEq(l.dueAt, dueAt);
        assertEq(l.approvedAt, block.timestamp);
        assertEq(treasury.outstanding(), 10 * ONE);
        assertEq(treasury.balance(), 40 * ONE);
        assertEq(usdc.balanceOf(bob), 110 * ONE);
    }

    function test_ApproveLoan_OwnerMayApprove() public {
        _fund(50 * ONE);
        vm.prank(bob);
        uint256 id = treasury.requestLoan(10 * ONE, TERM);
        vm.prank(owner);
        treasury.approveLoan(id);
        assertEq(uint8(treasury.loan(id).status), uint8(TownTreasury.LoanStatus.Active));
    }

    function test_ApproveLoan_RevertsWithoutLiquidity() public {
        _fund(5 * ONE);
        vm.prank(bob);
        uint256 id = treasury.requestLoan(10 * ONE, TERM);
        vm.prank(treasurer);
        vm.expectRevert(abi.encodeWithSelector(TownTreasury.InsufficientLiquidity.selector, 5 * ONE, 10 * ONE));
        treasury.approveLoan(id);
    }

    function test_ApproveLoan_RevertsNonTreasurerAndUnknownOrNonPending() public {
        _fund(50 * ONE);
        vm.prank(bob);
        uint256 id = treasury.requestLoan(10 * ONE, TERM);

        vm.prank(rando);
        vm.expectRevert(TownTreasury.NotAuthorized.selector);
        treasury.approveLoan(id);

        vm.startPrank(treasurer);
        vm.expectRevert(abi.encodeWithSelector(TownTreasury.LoanNotFound.selector, 99));
        treasury.approveLoan(99);
        treasury.approveLoan(id);
        vm.expectRevert(
            abi.encodeWithSelector(TownTreasury.InvalidLoanStatus.selector, id, TownTreasury.LoanStatus.Active)
        );
        treasury.approveLoan(id);
        vm.stopPrank();
    }

    function test_DenyLoan_FreesBorrowerSlot() public {
        vm.prank(bob);
        uint256 id = treasury.requestLoan(10 * ONE, TERM);

        vm.prank(rando);
        vm.expectRevert(TownTreasury.NotAuthorized.selector);
        treasury.denyLoan(id);

        vm.expectEmit(address(treasury));
        emit TownTreasury.LoanDenied(id, bob);
        vm.prank(treasurer);
        treasury.denyLoan(id);

        assertEq(uint8(treasury.loan(id).status), uint8(TownTreasury.LoanStatus.Denied));
        assertEq(treasury.loan(id).principalRemaining, 0);
        assertEq(treasury.activeLoanOf(bob), 0);
        vm.prank(bob);
        assertEq(treasury.requestLoan(1 * ONE, TERM), 2, "can request again");
    }

    // ─── repay ───────────────────────────────────────────────────────────────────

    function test_Repay_FullWithHandComputedInterest() public {
        _fund(50 * ONE);
        uint256 id = _requestAndApprove(bob, 10 * ONE);
        vm.warp(block.timestamp + 30 days);

        // 10 USDC × 6% × 30/365 = 0.049315 USDC → 49_315 base units at 6 decimals.
        uint256 expectedInterest = _interest(10 * ONE, BASE_RATE, 30 days);
        if (usdc.decimals() == 6) assertEq(expectedInterest, 49_315, "hand-computed interest");
        (uint256 p, uint256 i) = treasury.owed(id);
        assertEq(p, 10 * ONE);
        assertEq(i, expectedInterest);

        vm.expectEmit(address(treasury));
        emit TownTreasury.Repaid(id, bob, 10 * ONE + expectedInterest, 0, expectedInterest);
        vm.prank(bob);
        treasury.repay(id, 10 * ONE + expectedInterest);

        TownTreasury.Loan memory l = treasury.loan(id);
        assertEq(uint8(l.status), uint8(TownTreasury.LoanStatus.Repaid));
        assertEq(l.interestPaid, expectedInterest);
        assertEq(treasury.outstanding(), 0);
        assertEq(treasury.activeLoanOf(bob), 0);
        assertEq(treasury.balance(), 50 * ONE + expectedInterest, "treasury earned the interest");
    }

    function test_Repay_PartialInterestFirstThenPrincipal() public {
        _fund(50 * ONE);
        uint256 id = _requestAndApprove(bob, 10 * ONE);
        vm.warp(block.timestamp + 30 days);
        uint256 i1 = _interest(10 * ONE, BASE_RATE, 30 days);

        vm.expectEmit(address(treasury));
        emit TownTreasury.Repaid(id, bob, 5 * ONE, 10 * ONE - (5 * ONE - i1), i1);
        vm.prank(bob);
        treasury.repay(id, 5 * ONE);

        TownTreasury.Loan memory l = treasury.loan(id);
        uint256 remaining = 10 * ONE - (5 * ONE - i1);
        assertEq(uint8(l.status), uint8(TownTreasury.LoanStatus.Active));
        assertEq(l.principalRemaining, remaining);
        assertEq(l.interestOwed, 0);
        assertEq(l.interestPaid, i1);
        assertEq(treasury.outstanding(), remaining);

        // Second period accrues on the *remaining* principal only.
        vm.warp(block.timestamp + 30 days);
        uint256 i2 = _interest(remaining, BASE_RATE, 30 days);
        (uint256 p, uint256 i) = treasury.owed(id);
        assertEq(p, remaining);
        assertEq(i, i2);

        vm.prank(bob);
        treasury.repay(id, remaining + i2);
        l = treasury.loan(id);
        assertEq(uint8(l.status), uint8(TownTreasury.LoanStatus.Repaid));
        assertEq(l.interestPaid, i1 + i2);
        assertEq(treasury.outstanding(), 0);
    }

    function test_Repay_OverpaymentIsCapped() public {
        _fund(50 * ONE);
        uint256 id = _requestAndApprove(bob, 10 * ONE);
        vm.warp(block.timestamp + 1 days);
        uint256 owedTotal = 10 * ONE + _interest(10 * ONE, BASE_RATE, 1 days);
        uint256 bobBefore = usdc.balanceOf(bob);

        vm.prank(bob);
        treasury.repay(id, type(uint256).max);

        assertEq(bobBefore - usdc.balanceOf(bob), owedTotal, "only owed amount pulled");
        assertEq(uint8(treasury.loan(id).status), uint8(TownTreasury.LoanStatus.Repaid));
    }

    function test_Repay_RevertsForNonBorrowerPendingOrZero() public {
        _fund(50 * ONE);
        vm.prank(bob);
        uint256 id = treasury.requestLoan(10 * ONE, TERM);

        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(TownTreasury.InvalidLoanStatus.selector, id, TownTreasury.LoanStatus.Pending)
        );
        treasury.repay(id, 1);

        vm.prank(treasurer);
        treasury.approveLoan(id);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TownTreasury.NotBorrower.selector, id));
        treasury.repay(id, 1);

        vm.prank(bob);
        vm.expectRevert(TownTreasury.ZeroAmount.selector);
        treasury.repay(id, 0);
    }

    // ─── default ─────────────────────────────────────────────────────────────────

    function test_MarkDefault_RevertsBeforeGraceElapsed() public {
        _fund(50 * ONE);
        uint256 id = _requestAndApprove(bob, 10 * ONE);
        uint64 defaultableAt = uint64(block.timestamp + TERM + GRACE);

        vm.warp(defaultableAt); // exactly at the boundary is still too early
        vm.prank(treasurer);
        vm.expectRevert(abi.encodeWithSelector(TownTreasury.NotYetDefaultable.selector, id, defaultableAt));
        treasury.markDefault(id);
    }

    function test_MarkDefault_AfterGraceRecordsLoss() public {
        _fund(50 * ONE);
        uint256 id = _requestAndApprove(bob, 10 * ONE);
        vm.warp(block.timestamp + TERM + GRACE + 1);

        vm.expectEmit(address(treasury));
        emit TownTreasury.Defaulted(id, bob, 10 * ONE);
        vm.prank(treasurer);
        treasury.markDefault(id);

        TownTreasury.Loan memory l = treasury.loan(id);
        assertEq(uint8(l.status), uint8(TownTreasury.LoanStatus.Defaulted));
        assertEq(treasury.outstanding(), 0);
        assertEq(treasury.defaultCount(), 1);
        assertEq(treasury.activeLoanOf(bob), 0, "slot freed");

        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(TownTreasury.InvalidLoanStatus.selector, id, TownTreasury.LoanStatus.Defaulted)
        );
        treasury.repay(id, 1); // terminal
    }

    function test_MarkDefault_RevertsForNonTreasurer() public {
        _fund(50 * ONE);
        uint256 id = _requestAndApprove(bob, 10 * ONE);
        vm.warp(block.timestamp + TERM + GRACE + 1);

        bytes32 role = treasury.TREASURER_ROLE();
        vm.prank(rando);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, rando, role));
        treasury.markDefault(id);
        vm.prank(owner); // owner is not a treasurer by default
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, owner, role));
        treasury.markDefault(id);
    }

    // ─── rate ────────────────────────────────────────────────────────────────────

    function test_Rate_BasePlusUtilisationTimesSpread() public {
        assertEq(treasury.utilisationBps(), 0, "empty treasury");
        assertEq(treasury.currentRateBps(), BASE_RATE);

        _fund(100 * ONE);
        _requestAndApprove(bob, 50 * ONE); // 50 / (50 + 50) = 50%
        assertEq(treasury.utilisationBps(), 5000);
        assertEq(treasury.currentRateBps(), BASE_RATE + 100, "600 + 5000*200/10000");

        vm.prank(treasurer);
        treasury.setSpreadBps(1000);
        assertEq(treasury.currentRateBps(), BASE_RATE + 500);

        // Next loan snapshots the utilisation-adjusted rate.
        vm.prank(alice);
        uint256 id = treasury.requestLoan(25 * ONE, TERM);
        vm.prank(treasurer);
        treasury.approveLoan(id);
        assertEq(treasury.loan(id).rateBps, BASE_RATE + 500);
        assertEq(treasury.utilisationBps(), 7500);
    }

    function test_SetBaseRate_BoundsEventsAndAuth() public {
        vm.expectEmit(address(treasury));
        emit TownTreasury.BaseRateSet(1000);
        vm.prank(treasurer);
        treasury.setBaseRateBps(1000);
        assertEq(treasury.baseRateBps(), 1000);

        vm.prank(owner);
        treasury.setBaseRateBps(100);
        vm.prank(owner);
        treasury.setBaseRateBps(2000);

        vm.startPrank(treasurer);
        vm.expectRevert(abi.encodeWithSelector(TownTreasury.InvalidRate.selector, uint16(99)));
        treasury.setBaseRateBps(99);
        vm.expectRevert(abi.encodeWithSelector(TownTreasury.InvalidRate.selector, uint16(2001)));
        treasury.setBaseRateBps(2001);
        vm.stopPrank();

        vm.prank(rando);
        vm.expectRevert(TownTreasury.NotAuthorized.selector);
        treasury.setBaseRateBps(500);
    }

    function test_SetSpreadAndMaxLoan() public {
        vm.expectEmit(address(treasury));
        emit TownTreasury.SpreadSet(300);
        vm.prank(owner);
        treasury.setSpreadBps(300);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(TownTreasury.InvalidSpread.selector, uint16(10_001)));
        treasury.setSpreadBps(10_001);

        vm.expectEmit(address(treasury));
        emit TownTreasury.MaxLoanSet(5 * ONE);
        vm.prank(treasurer);
        treasury.setMaxLoan(5 * ONE);
        vm.prank(treasurer);
        vm.expectRevert(TownTreasury.ZeroAmount.selector);
        treasury.setMaxLoan(0);

        vm.prank(rando);
        vm.expectRevert(TownTreasury.NotAuthorized.selector);
        treasury.setMaxLoan(1);
        vm.prank(rando);
        vm.expectRevert(TownTreasury.NotAuthorized.selector);
        treasury.setSpreadBps(1);
    }

    // ─── fund / stipend / register ───────────────────────────────────────────────

    function test_Fund_AnyoneCanTopUp() public {
        vm.expectEmit(address(treasury));
        emit TownTreasury.Funded(owner, 20 * ONE);
        _fund(20 * ONE);
        assertEq(treasury.balance(), 20 * ONE);
        assertEq(treasury.freeLiquidity(), 20 * ONE);
        assertEq(treasury.totalDeposits(), 0, "funding is equity, not a deposit");

        vm.prank(alice);
        treasury.fund(1 * ONE);
        assertEq(treasury.balance(), 21 * ONE);

        vm.prank(alice);
        vm.expectRevert(TownTreasury.ZeroAmount.selector);
        treasury.fund(0);
    }

    function test_PayStipend_FromEquityOnly() public {
        _fund(2 * ONE);
        vm.prank(alice);
        treasury.deposit(10 * ONE);
        assertEq(treasury.freeLiquidity(), 2 * ONE, "deposits are not stipend money");

        vm.startPrank(treasurer);
        vm.expectRevert(abi.encodeWithSelector(TownTreasury.InsufficientLiquidity.selector, 2 * ONE, 3 * ONE));
        treasury.payStipend(carol, 3 * ONE);
        vm.expectRevert(TownTreasury.ZeroAddress.selector);
        treasury.payStipend(address(0), 1 * ONE);
        vm.expectRevert(TownTreasury.ZeroAmount.selector);
        treasury.payStipend(carol, 0);

        vm.expectEmit(address(treasury));
        emit TownTreasury.StipendPaid(carol, ONE / 2);
        treasury.payStipend(carol, ONE / 2);
        vm.stopPrank();
        assertEq(usdc.balanceOf(carol), ONE / 2);
        assertEq(treasury.freeLiquidity(), 2 * ONE - ONE / 2);
    }

    function test_PayStipend_RevertsForNonTreasurer() public {
        _fund(2 * ONE);
        bytes32 role = treasury.TREASURER_ROLE();
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, owner, role));
        treasury.payStipend(carol, 1);
    }

    function test_RegisterAgent_EmitsAndAllowsRename() public {
        vm.expectEmit(address(treasury));
        emit TownTreasury.AgentRegistered(bob, "bob.botanica.eth");
        vm.prank(treasurer);
        treasury.registerAgent(bob, "bob.botanica.eth");
        assertEq(treasury.ensNameOf(bob), "bob.botanica.eth");

        vm.prank(owner);
        treasury.registerAgent(bob, "robert.botanica.eth");
        assertEq(treasury.ensNameOf(bob), "robert.botanica.eth");

        vm.prank(rando);
        vm.expectRevert(TownTreasury.NotAuthorized.selector);
        treasury.registerAgent(bob, "x");
        vm.prank(owner);
        vm.expectRevert(TownTreasury.ZeroAddress.selector);
        treasury.registerAgent(address(0), "x");
    }

    // ─── roles / ownership ───────────────────────────────────────────────────────

    function test_Roles_OwnerGrantsAndRevokesTreasurer() public {
        bytes32 role = treasury.TREASURER_ROLE();
        vm.prank(owner);
        treasury.grantRole(role, rando);
        assertTrue(treasury.hasRole(role, rando));
        vm.prank(owner);
        treasury.revokeRole(role, treasurer);
        assertFalse(treasury.hasRole(role, treasurer));

        bytes32 admin = treasury.DEFAULT_ADMIN_ROLE();
        vm.prank(treasurer);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, treasurer, admin)
        );
        treasury.grantRole(role, treasurer);
    }

    function test_Ownership_TwoStepTransferMovesAdminRole() public {
        address newOwner = makeAddr("newOwner");
        vm.prank(owner);
        treasury.transferOwnership(newOwner);
        assertEq(treasury.owner(), owner, "not yet accepted");
        assertTrue(treasury.hasRole(treasury.DEFAULT_ADMIN_ROLE(), owner));

        vm.prank(newOwner);
        treasury.acceptOwnership();
        assertEq(treasury.owner(), newOwner);
        assertTrue(treasury.hasRole(treasury.DEFAULT_ADMIN_ROLE(), newOwner));
        assertFalse(treasury.hasRole(treasury.DEFAULT_ADMIN_ROLE(), owner));
    }

    // ─── reentrancy ──────────────────────────────────────────────────────────────

    function test_Reentrancy_WithdrawIsGuarded() public {
        ReentrantUSDC evil = new ReentrantUSDC();
        TownTreasury t = new TownTreasury(IERC20(address(evil)), owner, treasurer, BASE_RATE, GRACE);
        ReentrantAttacker attacker = new ReentrantAttacker(t, evil);
        evil.mint(address(attacker), 10e6);
        attacker.depositAll();

        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        attacker.attackWithdraw(5e6);

        assertEq(t.depositOf(address(attacker)), 10e6, "state rolled back");
        assertEq(evil.balanceOf(address(t)), 10e6);
    }

    // ─── fuzz ────────────────────────────────────────────────────────────────────

    /// @dev Interest owed never decreases as time passes, and never exceeds principal within one term at max rate.
    function testFuzz_InterestMonotonicInTime(uint256 principal, uint16 rate, uint32 t1, uint32 t2) public {
        principal = bound(principal, 1, 100 * ONE);
        rate = uint16(bound(rate, treasury.MIN_BASE_RATE_BPS(), treasury.MAX_BASE_RATE_BPS()));
        t1 = uint32(bound(t1, 0, 365 days));
        t2 = uint32(bound(t2, t1, 365 days));

        _fund(100 * ONE);
        vm.prank(treasurer);
        treasury.setBaseRateBps(rate);
        uint256 id = _requestAndApprove(bob, principal);
        uint256 t0 = block.timestamp;

        vm.warp(t0 + t1);
        (, uint256 i1) = treasury.owed(id);
        vm.warp(t0 + t2);
        (, uint256 i2) = treasury.owed(id);

        assertGe(i2, i1, "interest monotonic");
        assertEq(i1, _interest(principal, rate, t1), "matches reference formula");
        assertLe(i2, principal * 20 / 100, "<= 20% APR over <= 1 year");
    }

    /// @dev Repaying in two chunks never costs more than one lump sum at the later time (interest-first ordering).
    function testFuzz_SplitRepayNeverExceedsLumpSum(uint256 first, uint32 gap) public {
        _fund(100 * ONE);
        uint256 principal = 10 * ONE;
        gap = uint32(bound(gap, 1, 60 days));
        first = bound(first, 1, principal);
        uint256 id = _requestAndApprove(bob, principal);
        uint256 t0 = block.timestamp;
        uint256 bobBefore = usdc.balanceOf(bob);

        vm.warp(t0 + gap);
        vm.prank(bob);
        treasury.repay(id, first);
        vm.warp(t0 + 2 * uint256(gap));
        if (treasury.loan(id).status == TownTreasury.LoanStatus.Active) {
            vm.prank(bob);
            treasury.repay(id, type(uint256).max);
        }

        uint256 paid = bobBefore - usdc.balanceOf(bob);
        uint256 lump = principal + _interest(principal, BASE_RATE, 2 * uint256(gap));
        assertLe(paid, lump);
        assertGe(paid, principal);
        assertEq(uint8(treasury.loan(id).status), uint8(TownTreasury.LoanStatus.Repaid));
    }
}

/// @dev Same suite against an 18-decimal token: proves nothing in the contract hardcodes 1e6.
contract TownTreasury18Test is TownTreasuryTest {
    function setUp() public override {
        _deploy(new MockUSDC18());
    }

    function test_Decimals18_Stored() public view {
        assertEq(treasury.usdcDecimals(), 18);
        assertEq(ONE, 1e18);
        assertEq(treasury.maxLoan(), 100e18);
    }
}
