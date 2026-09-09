// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title TownTreasury
/// @notice Agent Town's bank on Arc: agents deposit USDC savings, borrow against treasury liquidity, repay with
///         simple interest, and receive stipends. Every state change emits an event for the `agent-town` subgraph.
/// @dev Roles: OWNER (mayor/deployer, `Ownable2Step`, also `DEFAULT_ADMIN_ROLE`) and TREASURER (`TREASURER_ROLE`,
///      a Circle SCA wallet, granted/revoked by the owner). All `amount`s are in the USDC token's base units
///      (`usdcDecimals`, 6 on Arc); nothing here assumes a specific decimal count. Rates are bps (1e4 = 100%).
///      Liquidity model: every USDC held is lendable (a fractional-reserve bank); `withdraw` reverts when liquidity
///      is short. Stipends (non-recoverable) may only be paid from equity = balance − totalDeposits. One Pending or
///      Active loan per borrower at a time. Interest is simple, accrued on remaining principal at the rate
///      snapshotted on approval; repayments cover interest first, then principal; overpayments are capped.
///      Mainnet-portable: all addresses come from the constructor (docs/RISKS.md R4, R6).
contract TownTreasury is Ownable2Step, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Types ───────────────────────────────────────────────────────────────────

    enum LoanStatus {
        None,
        Pending,
        Active,
        Repaid,
        Denied,
        Defaulted
    }

    struct Loan {
        address borrower;
        LoanStatus status;
        uint16 rateBps; // snapshot of currentRateBps() at approval
        uint32 termSeconds;
        uint64 requestedAt;
        uint64 approvedAt;
        uint64 lastAccrualAt; // interest accrued on principalRemaining up to this timestamp
        uint64 dueAt; // approvedAt + termSeconds
        uint256 principal; // original amount
        uint256 principalRemaining;
        uint256 interestOwed; // accrued but unpaid interest as of lastAccrualAt
        uint256 interestPaid; // cumulative
    }

    struct Stats {
        uint256 outstanding;
        uint256 totalDeposits;
        uint256 loanCount;
        uint256 defaults;
        uint16 baseRateBps;
    }

    // ─── Constants ───────────────────────────────────────────────────────────────

    bytes32 public constant TREASURER_ROLE = keccak256("TREASURER_ROLE");
    uint16 public constant BPS = 10_000;
    /// @notice Bounds for the base rate, matching `packages/shared/src/rules.ts` BASE_RATE_MIN/MAX_BPS.
    uint16 public constant MIN_BASE_RATE_BPS = 100;
    uint16 public constant MAX_BASE_RATE_BPS = 2000;
    uint32 public constant MAX_TERM_SECONDS = 365 days;
    uint256 internal constant YEAR = 365 days;

    // ─── Immutables ──────────────────────────────────────────────────────────────

    IERC20 public immutable usdc;
    /// @notice Decimals reported by the USDC ERC-20 interface at deploy time (informational; never assumed).
    uint8 public immutable usdcDecimals;
    uint32 public immutable gracePeriodSeconds;

    // ─── Storage ─────────────────────────────────────────────────────────────────

    uint16 public baseRateBps;
    uint16 public spreadBps = 200;
    uint256 public maxLoan;
    uint256 public totalDeposits;
    uint256 public outstanding; // sum of principalRemaining over Active loans
    uint256 public loanCount;
    uint256 public defaultCount;

    mapping(address => uint256) internal _deposits;
    mapping(uint256 => Loan) internal _loans;
    /// @notice Pending or Active loan id per borrower (0 = none).
    mapping(address => uint256) public activeLoanOf;
    mapping(address => string) public ensNameOf;

    // ─── Events ──────────────────────────────────────────────────────────────────

    event Deposited(address indexed agent, uint256 amount);
    event Withdrawn(address indexed agent, uint256 amount);
    event LoanRequested(uint256 indexed loanId, address indexed borrower, uint256 amount, uint32 termSeconds);
    event LoanApproved(uint256 indexed loanId, address indexed borrower, uint256 amount, uint16 rateBps, uint64 dueAt);
    event LoanDenied(uint256 indexed loanId, address indexed borrower);
    /// @param amount USDC pulled in this repayment. @param interestPaid interest portion of this repayment.
    event Repaid(
        uint256 indexed loanId,
        address indexed borrower,
        uint256 amount,
        uint256 principalRemaining,
        uint256 interestPaid
    );
    event Defaulted(uint256 indexed loanId, address indexed borrower, uint256 principalRemaining);
    event BaseRateSet(uint16 bps);
    event SpreadSet(uint16 bps);
    event MaxLoanSet(uint256 amount);
    event Funded(address indexed from, uint256 amount);
    event StipendPaid(address indexed to, uint256 amount);
    event AgentRegistered(address indexed agent, string ensName);

    // ─── Errors ──────────────────────────────────────────────────────────────────

    error ZeroAmount();
    error ZeroAddress();
    error NotAuthorized();
    error InvalidRate(uint16 bps);
    error InvalidSpread(uint16 bps);
    error InvalidTerm(uint32 termSeconds);
    error ExceedsMaxLoan(uint256 amount, uint256 maxLoan);
    error BorrowerHasActiveLoan(uint256 loanId);
    error LoanNotFound(uint256 loanId);
    error InvalidLoanStatus(uint256 loanId, LoanStatus status);
    error NotBorrower(uint256 loanId);
    error InsufficientDeposit(uint256 available, uint256 requested);
    error InsufficientLiquidity(uint256 available, uint256 requested);
    error NotYetDefaultable(uint256 loanId, uint64 defaultableAt);

    // ─── Modifiers ───────────────────────────────────────────────────────────────

    modifier onlyTreasurerOrOwner() {
        if (!hasRole(TREASURER_ROLE, _msgSender()) && _msgSender() != owner()) revert NotAuthorized();
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────────────────

    /// @param usdc_ USDC ERC-20 interface (Arc: 0x3600…0000, 6 decimals). Must implement `decimals()`.
    /// @param owner_ Mayor / deployer; receives ownership and DEFAULT_ADMIN_ROLE.
    /// @param treasurer_ Initial TREASURER_ROLE holder (Circle SCA). May be address(0) to grant later.
    /// @param baseRateBps_ Initial base rate, within [MIN_BASE_RATE_BPS, MAX_BASE_RATE_BPS].
    /// @param gracePeriodSeconds_ Seconds after `dueAt` before a loan can be marked defaulted.
    constructor(IERC20 usdc_, address owner_, address treasurer_, uint16 baseRateBps_, uint32 gracePeriodSeconds_)
        Ownable(owner_)
    {
        if (address(usdc_) == address(0)) revert ZeroAddress();
        if (baseRateBps_ < MIN_BASE_RATE_BPS || baseRateBps_ > MAX_BASE_RATE_BPS) revert InvalidRate(baseRateBps_);
        usdc = usdc_;
        usdcDecimals = IERC20Metadata(address(usdc_)).decimals();
        gracePeriodSeconds = gracePeriodSeconds_;
        baseRateBps = baseRateBps_;
        // Default cap: 100 whole USDC expressed in token base units (RISKS R8: keep amounts small).
        maxLoan = 100 * 10 ** usdcDecimals;
        if (treasurer_ != address(0)) _grantRole(TREASURER_ROLE, treasurer_);
        emit BaseRateSet(baseRateBps_);
        emit SpreadSet(spreadBps);
        emit MaxLoanSet(maxLoan);
    }

    // ─── Savings ─────────────────────────────────────────────────────────────────

    /// @notice Deposit USDC savings. Caller must have approved this contract for `amount`.
    /// @param amount USDC base units.
    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _deposits[_msgSender()] += amount;
        totalDeposits += amount;
        emit Deposited(_msgSender(), amount);
        usdc.safeTransferFrom(_msgSender(), address(this), amount);
    }

    /// @notice Withdraw own savings. Reverts if the treasury has lent out too much to honour it right now.
    /// @param amount USDC base units.
    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 have = _deposits[_msgSender()];
        if (amount > have) revert InsufficientDeposit(have, amount);
        uint256 liquid = balance();
        if (amount > liquid) revert InsufficientLiquidity(liquid, amount);
        _deposits[_msgSender()] = have - amount;
        totalDeposits -= amount;
        emit Withdrawn(_msgSender(), amount);
        usdc.safeTransfer(_msgSender(), amount);
    }

    // ─── Loans ───────────────────────────────────────────────────────────────────

    /// @notice Request a loan; it sits Pending until the treasurer approves or denies it.
    /// @param amount Principal in USDC base units; must be ≤ `maxLoan`.
    /// @param termSeconds Loan term; `dueAt = approvedAt + termSeconds`. Bounded by MAX_TERM_SECONDS.
    /// @return loanId Sequential id starting at 1.
    function requestLoan(uint256 amount, uint32 termSeconds) external returns (uint256 loanId) {
        if (amount == 0) revert ZeroAmount();
        if (amount > maxLoan) revert ExceedsMaxLoan(amount, maxLoan);
        if (termSeconds == 0 || termSeconds > MAX_TERM_SECONDS) revert InvalidTerm(termSeconds);
        address borrower = _msgSender();
        uint256 existing = activeLoanOf[borrower];
        if (existing != 0) revert BorrowerHasActiveLoan(existing);

        loanId = ++loanCount;
        Loan storage l = _loans[loanId];
        l.borrower = borrower;
        l.status = LoanStatus.Pending;
        l.termSeconds = termSeconds;
        l.requestedAt = uint64(block.timestamp);
        l.principal = amount;
        l.principalRemaining = amount;
        activeLoanOf[borrower] = loanId;
        emit LoanRequested(loanId, borrower, amount, termSeconds);
    }

    /// @notice Approve a Pending loan, snapshot the current rate, and transfer principal to the borrower.
    /// @dev Draws from all liquidity (`balance()`), including agent deposits.
    function approveLoan(uint256 loanId) external nonReentrant onlyTreasurerOrOwner {
        Loan storage l = _getLoan(loanId);
        if (l.status != LoanStatus.Pending) revert InvalidLoanStatus(loanId, l.status);
        uint256 liquid = balance();
        if (l.principal > liquid) revert InsufficientLiquidity(liquid, l.principal);

        uint16 rate = currentRateBps();
        uint64 nowTs = uint64(block.timestamp);
        l.status = LoanStatus.Active;
        l.rateBps = rate;
        l.approvedAt = nowTs;
        l.lastAccrualAt = nowTs;
        l.dueAt = nowTs + l.termSeconds;
        outstanding += l.principal;
        emit LoanApproved(loanId, l.borrower, l.principal, rate, l.dueAt);
        usdc.safeTransfer(l.borrower, l.principal);
    }

    /// @notice Deny a Pending loan and free the borrower's slot.
    function denyLoan(uint256 loanId) external onlyTreasurerOrOwner {
        Loan storage l = _getLoan(loanId);
        if (l.status != LoanStatus.Pending) revert InvalidLoanStatus(loanId, l.status);
        l.status = LoanStatus.Denied;
        l.principalRemaining = 0;
        delete activeLoanOf[l.borrower];
        emit LoanDenied(loanId, l.borrower);
    }

    /// @notice Repay an Active loan. Interest is settled first, then principal. Partial repayments are allowed;
    ///         `amount` above what is owed is capped (only the owed amount is pulled). Borrower must have approved.
    /// @param amount Maximum USDC base units to pull from the borrower.
    function repay(uint256 loanId, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        Loan storage l = _getLoan(loanId);
        if (l.borrower != _msgSender()) revert NotBorrower(loanId);
        if (l.status != LoanStatus.Active) revert InvalidLoanStatus(loanId, l.status);

        _accrue(l);
        uint256 totalOwed = l.principalRemaining + l.interestOwed;
        uint256 pay = amount > totalOwed ? totalOwed : amount;
        uint256 toInterest = pay > l.interestOwed ? l.interestOwed : pay;
        uint256 toPrincipal = pay - toInterest;

        l.interestOwed -= toInterest;
        l.interestPaid += toInterest;
        l.principalRemaining -= toPrincipal;
        outstanding -= toPrincipal;
        if (l.principalRemaining == 0 && l.interestOwed == 0) {
            l.status = LoanStatus.Repaid;
            delete activeLoanOf[l.borrower];
        }
        emit Repaid(loanId, l.borrower, pay, l.principalRemaining, toInterest);
        usdc.safeTransferFrom(l.borrower, address(this), pay);
    }

    /// @notice Mark an Active loan defaulted once `dueAt + gracePeriodSeconds` has passed. Terminal: no repay after.
    function markDefault(uint256 loanId) external onlyRole(TREASURER_ROLE) {
        Loan storage l = _getLoan(loanId);
        if (l.status != LoanStatus.Active) revert InvalidLoanStatus(loanId, l.status);
        uint64 defaultableAt = l.dueAt + gracePeriodSeconds;
        // Grace is measured in seconds by design (tick-agnostic); validator skew is immaterial at this scale.
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp <= defaultableAt) revert NotYetDefaultable(loanId, defaultableAt);
        _accrue(l);
        uint256 lost = l.principalRemaining;
        l.status = LoanStatus.Defaulted;
        outstanding -= lost;
        defaultCount += 1;
        delete activeLoanOf[l.borrower];
        emit Defaulted(loanId, l.borrower, lost);
    }

    // ─── Treasury administration ─────────────────────────────────────────────────

    /// @notice Set the base rate in bps, bounded to [MIN_BASE_RATE_BPS, MAX_BASE_RATE_BPS].
    function setBaseRateBps(uint16 bps) external onlyTreasurerOrOwner {
        if (bps < MIN_BASE_RATE_BPS || bps > MAX_BASE_RATE_BPS) revert InvalidRate(bps);
        baseRateBps = bps;
        emit BaseRateSet(bps);
    }

    /// @notice Set the utilisation spread in bps (rate = base + utilisation × spread / 1e4). Max 1e4.
    function setSpreadBps(uint16 bps) external onlyTreasurerOrOwner {
        if (bps > BPS) revert InvalidSpread(bps);
        spreadBps = bps;
        emit SpreadSet(bps);
    }

    /// @notice Set the maximum principal a single loan request may ask for (USDC base units).
    function setMaxLoan(uint256 amount) external onlyTreasurerOrOwner {
        if (amount == 0) revert ZeroAmount();
        maxLoan = amount;
        emit MaxLoanSet(amount);
    }

    /// @notice Top up treasury equity. Anyone may fund. Caller must have approved this contract for `amount`.
    function fund(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        emit Funded(_msgSender(), amount);
        usdc.safeTransferFrom(_msgSender(), address(this), amount);
    }

    /// @notice Pay a consumer stipend (UBI) out of treasury equity (balance − totalDeposits). Never to address(0).
    function payStipend(address to, uint256 amount) external nonReentrant onlyRole(TREASURER_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        uint256 free = freeLiquidity();
        if (amount > free) revert InsufficientLiquidity(free, amount);
        emit StipendPaid(to, amount);
        usdc.safeTransfer(to, amount);
    }

    /// @notice Record an agent's ENS name on-chain so the subgraph can join names without off-chain input.
    ///         Re-registering updates the name.
    function registerAgent(address agent, string calldata ensName) external onlyTreasurerOrOwner {
        if (agent == address(0)) revert ZeroAddress();
        ensNameOf[agent] = ensName;
        emit AgentRegistered(agent, ensName);
    }

    // ─── Views ───────────────────────────────────────────────────────────────────

    /// @notice USDC currently held by the treasury (base units).
    function balance() public view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    /// @notice Treasury equity available for stipends: balance − totalDeposits (0 if deposits exceed balance).
    function freeLiquidity() public view returns (uint256) {
        uint256 bal = balance();
        return bal > totalDeposits ? bal - totalDeposits : 0;
    }

    /// @notice outstanding / (balance + outstanding) in bps; 0 when the treasury is empty.
    function utilisationBps() public view returns (uint16) {
        uint256 total = balance() + outstanding;
        if (total == 0) return 0;
        // Safe: outstanding <= total, so the ratio is <= BPS (10_000) and fits uint16.
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint16(outstanding * BPS / total);
    }

    /// @notice Rate applied to newly approved loans: base + utilisation × spread / 1e4.
    function currentRateBps() public view returns (uint16) {
        return baseRateBps + uint16(uint256(utilisationBps()) * spreadBps / BPS);
    }

    /// @notice Full loan record as stored (interest accrued only up to `lastAccrualAt`; see `owed`).
    function loan(uint256 loanId) external view returns (Loan memory) {
        return _loans[loanId];
    }

    /// @notice Live amounts owed on a loan, including interest accrued since `lastAccrualAt`.
    function owed(uint256 loanId) external view returns (uint256 principalRemaining, uint256 interestOwed) {
        Loan storage l = _loans[loanId];
        principalRemaining = l.principalRemaining;
        interestOwed = l.interestOwed;
        if (l.status == LoanStatus.Active) interestOwed += _pendingInterest(l);
    }

    /// @notice Aggregate treasury figures for the scoreboard.
    function stats() external view returns (Stats memory) {
        return Stats({
            outstanding: outstanding,
            totalDeposits: totalDeposits,
            loanCount: loanCount,
            defaults: defaultCount,
            baseRateBps: baseRateBps
        });
    }

    /// @notice Savings balance of an agent (base units).
    function depositOf(address agent) external view returns (uint256) {
        return _deposits[agent];
    }

    // ─── Internals ───────────────────────────────────────────────────────────────

    /// @dev Simple interest on remaining principal since last accrual: P × rate × elapsed / (1e4 × 365 days).
    function _pendingInterest(Loan storage l) internal view returns (uint256) {
        uint256 elapsed = block.timestamp - l.lastAccrualAt;
        return l.principalRemaining * l.rateBps * elapsed / (uint256(BPS) * YEAR);
    }

    function _accrue(Loan storage l) internal {
        l.interestOwed += _pendingInterest(l);
        l.lastAccrualAt = uint64(block.timestamp);
    }

    function _getLoan(uint256 loanId) internal view returns (Loan storage l) {
        l = _loans[loanId];
        if (l.status == LoanStatus.None) revert LoanNotFound(loanId);
    }

    /// @dev Keep DEFAULT_ADMIN_ROLE (grants/revokes TREASURER_ROLE) attached to the current owner across
    ///      Ownable2Step transfers so the mayor always controls the treasurer role.
    function _transferOwnership(address newOwner) internal override {
        address previous = owner();
        if (previous != address(0)) _revokeRole(DEFAULT_ADMIN_ROLE, previous);
        if (newOwner != address(0)) _grantRole(DEFAULT_ADMIN_ROLE, newOwner);
        super._transferOwnership(newOwner);
    }
}
