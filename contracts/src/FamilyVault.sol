// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ISlipstreamRouter} from "./interfaces/ISlipstreamRouter.sol";
import {IB20Policy, IPolicyRegistry} from "./interfaces/IB20.sol";

/// @title FamilyVault
/// @notice One vault per family, owned by the parent's wallet. Holds USDC and tokenized stocks and
/// tracks them per kid on-chain by an anonymous `bytes32 kidId` (never a name).
///
/// Money model:
/// - `familyUsdc` is the parent's pool. It funds allowances and parent matches.
/// - `kidUsdc[kid]` is a kid's savings. Allowance releases move USDC from the pool into it.
/// - A pitch the parent approves spends the kid's savings, plus an optional match from the pool,
///   and swaps it for a stock token, which is credited to the kid in raw B20 units.
/// - A gift pulls USDC from the gifter and swaps it for a stock token, which is credited to the kid.
/// - A group gift holds several relatives' USDC in escrow (`escrowUsdc`) until the organizer closes it
///   or it reaches its target; then it is swapped for the stock and credited to the kid. Until then,
///   each contributor can take their own contribution back.
/// - Graduation (owner only) sends all of one kid's shares and savings to the kid's own wallet, after
///   checking the stock's transfer rules, and closes that kid's ledger for good.
///
/// Safety:
/// - Hard caps per transaction, per kid per 30-day window, and on cumulative inflow. Only the owner
///   can change them.
/// - Only the owner and one operator (the app's relayer) can spend. Kids have no on-chain role at all.
/// - Swaps go only to the immutable router and only for tokens the owner has allowlisted. There are
///   no arbitrary external calls, no delegatecall and no proxy.
/// - The owner can pause, and can emergency-withdraw any token to the owner even while paused.
contract FamilyVault is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;
    uint256 public constant CAP_WINDOW = 30 days;

    IERC20 public immutable usdc;
    ISlipstreamRouter public immutable router;

    address public operator;

    // ---- caps (USDC, 6 decimals) ----
    uint256 public maxPerTx;
    uint256 public maxPerKidPerWindow;
    uint256 public maxTotalInflow;
    uint256 public totalInflow; // cumulative USDC that entered via deposit() and depositGift()

    // ---- token allowlist: stock token => Slipstream tick spacing (0 = not allowed) ----
    mapping(address => int24) public tickSpacingOf;

    // ---- ledgers ----
    uint256 public familyUsdc;
    mapping(bytes32 => uint256) public kidUsdc;
    mapping(bytes32 => mapping(address => uint256)) public kidTokens; // raw B20 units

    struct Window {
        uint64 start;
        uint192 spent;
    }

    mapping(bytes32 => Window) public kidWindow;

    struct AllowanceSchedule {
        uint128 amount;
        uint64 period;
        uint64 nextReleaseAt;
    }

    mapping(bytes32 => AllowanceSchedule) public allowanceOf;

    // ---- B20 transfer rules. Sources: docs/VERIFIED.md ----
    IPolicyRegistry public constant POLICY_REGISTRY = IPolicyRegistry(0x8453000000000000000000000000000000000002);
    bytes32 public constant TRANSFER_RECEIVER = 0x8a4b3fa2d8b921852bc0089c6ef0958aa6961897be36fd731330fe2cd23f8363;

    // Every token ever allowlisted, so graduation can move a kid's shares even after a token is disallowed.
    address[] internal _tokenList;
    mapping(address => bool) internal _everListed;

    // ---- graduation ----
    mapping(bytes32 => address) public graduatedTo;

    // ---- group gifts ----
    enum GroupStatus {
        None,
        Open,
        Settled,
        Cancelled
    }

    struct GroupGift {
        bytes32 kidId;
        address token;
        address organizer;
        GroupStatus status;
        uint256 target;
        uint256 raised;
    }

    uint256 public groupGiftCount;
    mapping(uint256 => GroupGift) public groupGifts;
    mapping(uint256 => mapping(address => uint256)) public contributionOf;
    uint256 public escrowUsdc; // USDC held for open or cancelled group gifts

    // ---- events ----
    event OperatorSet(address indexed operator);
    event CapsSet(uint256 maxPerTx, uint256 maxPerKidPerWindow, uint256 maxTotalInflow);
    event TokenAllowed(address indexed token, int24 tickSpacing);
    event Deposited(address indexed from, uint256 amount);
    event AllowanceSet(bytes32 indexed kidId, uint256 amount, uint256 period);
    event AllowanceReleased(bytes32 indexed kidId, uint256 amount, uint256 nextReleaseAt);
    event PitchBought(
        bytes32 indexed kidId, address indexed token, uint256 kidUsdcSpent, uint256 matchUsdc, uint256 tokensOut
    );
    event GiftReceived(
        bytes32 indexed kidId, address indexed token, address indexed from, bytes32 gifterTag, uint256 usdcIn, uint256 tokensOut
    );
    event EmergencyWithdraw(address indexed token, uint256 amount);
    event Graduated(bytes32 indexed kidId, address indexed to, uint256 usdc);
    event SharesGraduated(bytes32 indexed kidId, address indexed token, address indexed to, uint256 amount);
    event GroupGiftOpened(uint256 indexed id, bytes32 indexed kidId, address indexed token, address organizer, uint256 target);
    event GroupGiftContributed(uint256 indexed id, address indexed from, bytes32 gifterTag, uint256 amount, uint256 raised);
    event GroupGiftSettled(uint256 indexed id, bytes32 indexed kidId, address indexed token, uint256 usdcIn, uint256 tokensOut);
    event GroupGiftCancelled(uint256 indexed id);
    event GroupGiftRefunded(uint256 indexed id, address indexed to, uint256 amount);

    // ---- errors ----
    error NotAuthorized();
    error ZeroAmount();
    error TokenNotAllowed(address token);
    error ZeroMinOut();
    error Expired();
    error OverTxCap(uint256 amount, uint256 cap);
    error OverKidCap(uint256 newSpent, uint256 cap);
    error OverVaultCap(uint256 newInflow, uint256 cap);
    error InsufficientKidUsdc(uint256 have, uint256 need);
    error InsufficientFamilyUsdc(uint256 have, uint256 need);
    error MatchTooHigh(uint256 bps);
    error NoAllowance();
    error AllowanceNotDue(uint256 nextReleaseAt);
    error SlippageExceeded(uint256 out, uint256 minOut);
    error InvalidAddress();
    error KidGraduated(bytes32 kidId);
    error NotEligible(address token, address to);
    error GroupGiftNotOpen(uint256 id);
    error TargetNotReached(uint256 raised, uint256 target);
    error NothingToRefund();

    modifier onlyOwnerOrOperator() {
        if (msg.sender != owner() && msg.sender != operator) revert NotAuthorized();
        _;
    }

    constructor(
        address owner_,
        address operator_,
        IERC20 usdc_,
        ISlipstreamRouter router_,
        uint256 maxPerTx_,
        uint256 maxPerKidPerWindow_,
        uint256 maxTotalInflow_,
        address[] memory tokens_,
        int24[] memory tickSpacings_
    ) Ownable(owner_) {
        if (address(usdc_) == address(0) || address(router_) == address(0)) revert InvalidAddress();
        if (tokens_.length != tickSpacings_.length) revert InvalidAddress();
        usdc = usdc_;
        router = router_;
        operator = operator_;
        emit OperatorSet(operator_);
        _setCaps(maxPerTx_, maxPerKidPerWindow_, maxTotalInflow_);
        for (uint256 i; i < tokens_.length; ++i) {
            _setTokenAllowed(tokens_[i], tickSpacings_[i]);
        }
    }

    // =============================== owner admin ===============================

    function setOperator(address operator_) external onlyOwner {
        operator = operator_;
        emit OperatorSet(operator_);
    }

    function setCaps(uint256 maxPerTx_, uint256 maxPerKidPerWindow_, uint256 maxTotalInflow_) external onlyOwner {
        _setCaps(maxPerTx_, maxPerKidPerWindow_, maxTotalInflow_);
    }

    /// @param tickSpacing the Slipstream USDC/token pool's tick spacing; 0 disallows the token.
    function setTokenAllowed(address token, int24 tickSpacing) external onlyOwner {
        _setTokenAllowed(token, tickSpacing);
    }

    function _setTokenAllowed(address token, int24 tickSpacing) internal {
        if (token == address(0) || token == address(usdc)) revert InvalidAddress();
        if (!_everListed[token]) {
            _everListed[token] = true;
            _tokenList.push(token);
        }
        tickSpacingOf[token] = tickSpacing;
        emit TokenAllowed(token, tickSpacing);
    }

    function setAllowance(bytes32 kidId, uint128 amount, uint64 period) external onlyOwner {
        _notGraduated(kidId);
        if (amount == 0 || period == 0) revert ZeroAmount();
        AllowanceSchedule storage s = allowanceOf[kidId];
        s.amount = amount;
        s.period = period;
        // nextReleaseAt is kept, so changing the amount can't be used to release twice in one period
        emit AllowanceSet(kidId, amount, period);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Owner-only escape hatch. It works while paused and does not touch the ledgers.
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner nonReentrant {
        IERC20(token).safeTransfer(owner(), amount);
        emit EmergencyWithdraw(token, amount);
    }

    // =============================== money in ===============================

    /// @notice The parent (or anyone) funds the family pool, which pays for allowances and matches.
    function deposit(uint256 amount) external whenNotPaused nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _addInflow(amount);
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        familyUsdc += amount;
        emit Deposited(msg.sender, amount);
    }

    /// @notice A relative gifts a slice of a stock: their USDC is swapped and credited to the kid.
    function depositGift(bytes32 kidId, address token, uint256 usdcAmount, uint256 minOut, uint256 deadline, bytes32 gifterTag)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 out)
    {
        _notGraduated(kidId);
        if (usdcAmount == 0) revert ZeroAmount();
        _checkTxCap(usdcAmount);
        _spendKidWindow(kidId, usdcAmount);
        _addInflow(usdcAmount);
        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);
        out = _swap(token, usdcAmount, minOut, deadline);
        kidTokens[kidId][token] += out;
        emit GiftReceived(kidId, token, msg.sender, gifterTag, usdcAmount, out);
    }

    // =============================== night shift ===============================

    /// @notice Moves one period's allowance from the family pool into the kid's savings.
    /// Callable once per period. The first release is allowed as soon as an allowance is set.
    function releaseAllowance(bytes32 kidId) external onlyOwnerOrOperator whenNotPaused nonReentrant {
        _notGraduated(kidId);
        AllowanceSchedule storage s = allowanceOf[kidId];
        if (s.amount == 0) revert NoAllowance();
        if (block.timestamp < s.nextReleaseAt) revert AllowanceNotDue(s.nextReleaseAt);
        uint256 amount = s.amount;
        if (familyUsdc < amount) revert InsufficientFamilyUsdc(familyUsdc, amount);
        familyUsdc -= amount;
        kidUsdc[kidId] += amount;
        s.nextReleaseAt = uint64(block.timestamp) + s.period;
        emit AllowanceReleased(kidId, amount, s.nextReleaseAt);
    }

    /// @notice Executes a pitch the parent has approved. The server verifies the parent's passkey
    /// before the operator calls this.
    /// @param matchBps the parent's match on top of the kid's amount, paid from the family pool (0..10000)
    function approvePitchBuy(
        bytes32 kidId,
        address token,
        uint256 usdcAmount,
        uint256 matchBps,
        uint256 minOut,
        uint256 deadline
    ) external onlyOwnerOrOperator whenNotPaused nonReentrant returns (uint256 out) {
        _notGraduated(kidId);
        if (usdcAmount == 0) revert ZeroAmount();
        if (matchBps > BPS) revert MatchTooHigh(matchBps);
        uint256 matchUsdc = (usdcAmount * matchBps) / BPS;
        uint256 total = usdcAmount + matchUsdc;
        _checkTxCap(total);
        _spendKidWindow(kidId, total);
        uint256 have = kidUsdc[kidId];
        if (have < usdcAmount) revert InsufficientKidUsdc(have, usdcAmount);
        if (familyUsdc < matchUsdc) revert InsufficientFamilyUsdc(familyUsdc, matchUsdc);
        kidUsdc[kidId] = have - usdcAmount;
        familyUsdc -= matchUsdc;
        out = _swap(token, total, minOut, deadline);
        kidTokens[kidId][token] += out;
        emit PitchBought(kidId, token, usdcAmount, matchUsdc, out);
    }

    // =============================== group gifts ===============================

    /// @notice A relative starts a group gift for a kid. Anyone can then chip in until it is settled.
    function openGroupGift(bytes32 kidId, address token, uint256 target) external whenNotPaused returns (uint256 id) {
        _notGraduated(kidId);
        if (target == 0) revert ZeroAmount();
        if (tickSpacingOf[token] == 0) revert TokenNotAllowed(token);
        id = ++groupGiftCount;
        groupGifts[id] = GroupGift(kidId, token, msg.sender, GroupStatus.Open, target, 0);
        emit GroupGiftOpened(id, kidId, token, msg.sender, target);
    }

    /// @notice Chip in USDC. It is held in escrow, not swapped, until the gift is settled.
    function contributeToGroupGift(uint256 id, uint256 amount, bytes32 gifterTag) external whenNotPaused nonReentrant {
        GroupGift storage g = groupGifts[id];
        if (g.status != GroupStatus.Open) revert GroupGiftNotOpen(id);
        if (amount == 0) revert ZeroAmount();
        _checkTxCap(amount);
        _addInflow(amount);
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        contributionOf[id][msg.sender] += amount;
        g.raised += amount;
        escrowUsdc += amount;
        emit GroupGiftContributed(id, msg.sender, gifterTag, amount, g.raised);
    }

    /// @notice Turns the escrow into shares for the kid. The organizer can close it at any time;
    /// the owner or operator can settle it once it has reached its target.
    function settleGroupGift(uint256 id, uint256 minOut, uint256 deadline)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 out)
    {
        GroupGift storage g = groupGifts[id];
        if (g.status != GroupStatus.Open) revert GroupGiftNotOpen(id);
        if (msg.sender != g.organizer) {
            if (msg.sender != owner() && msg.sender != operator) revert NotAuthorized();
            if (g.raised < g.target) revert TargetNotReached(g.raised, g.target);
        }
        if (g.raised == 0) revert ZeroAmount();
        _notGraduated(g.kidId);
        uint256 amount = g.raised;
        _spendKidWindow(g.kidId, amount);
        g.status = GroupStatus.Settled;
        escrowUsdc -= amount;
        out = _swap(g.token, amount, minOut, deadline);
        kidTokens[g.kidId][g.token] += out;
        emit GroupGiftSettled(id, g.kidId, g.token, amount, out);
    }

    /// @notice The organizer or the owner calls off a group gift. Contributors then take their USDC back.
    function cancelGroupGift(uint256 id) external {
        GroupGift storage g = groupGifts[id];
        if (g.status != GroupStatus.Open) revert GroupGiftNotOpen(id);
        if (msg.sender != g.organizer && msg.sender != owner()) revert NotAuthorized();
        g.status = GroupStatus.Cancelled;
        emit GroupGiftCancelled(id);
    }

    /// @notice A contributor takes back their own contribution before the gift is settled.
    /// Works while paused, so a contributor's money is never stuck.
    function refundGroupGift(uint256 id) external nonReentrant {
        GroupGift storage g = groupGifts[id];
        if (g.status != GroupStatus.Open && g.status != GroupStatus.Cancelled) revert GroupGiftNotOpen(id);
        uint256 amount = contributionOf[id][msg.sender];
        if (amount == 0) revert NothingToRefund();
        contributionOf[id][msg.sender] = 0;
        g.raised -= amount;
        escrowUsdc -= amount;
        totalInflow -= amount; // refunded money no longer counts towards the vault cap
        usdc.safeTransfer(msg.sender, amount);
        emit GroupGiftRefunded(id, msg.sender, amount);
    }

    // =============================== graduation ===============================

    /// @notice At 18, the parent sends all of a kid's shares and savings to the kid's own wallet.
    /// Each stock's transfer rules are checked first, so an ineligible wallet is rejected up front.
    /// Afterwards the kid's ledger is closed: no more allowances, pitches or gifts through this vault.
    function graduate(bytes32 kidId, address to) external onlyOwner nonReentrant {
        _notGraduated(kidId);
        if (to == address(0) || to == address(this)) revert InvalidAddress();
        graduatedTo[kidId] = to;
        uint256 n = _tokenList.length;
        for (uint256 i; i < n; ++i) {
            address token = _tokenList[i];
            uint256 amount = kidTokens[kidId][token];
            if (amount == 0) continue;
            uint64 policy = IB20Policy(token).policyId(TRANSFER_RECEIVER);
            if (!POLICY_REGISTRY.isAuthorized(policy, to)) revert NotEligible(token, to);
            kidTokens[kidId][token] = 0;
            IERC20(token).safeTransfer(to, amount);
            emit SharesGraduated(kidId, token, to, amount);
        }
        uint256 savings = kidUsdc[kidId];
        if (savings > 0) {
            kidUsdc[kidId] = 0;
            usdc.safeTransfer(to, savings);
        }
        delete allowanceOf[kidId];
        emit Graduated(kidId, to, savings);
    }

    /// @notice Whether `to` passes `token`'s receiver rules (the same check graduation runs).
    function canReceive(address token, address to) external view returns (bool) {
        return POLICY_REGISTRY.isAuthorized(IB20Policy(token).policyId(TRANSFER_RECEIVER), to);
    }

    function tokenList() external view returns (address[] memory) {
        return _tokenList;
    }

    // =============================== views ===============================

    /// @notice A kid's balance: USDC savings for `usdc`, or raw B20 units for a stock token.
    /// Shares = raw x token.uiMultiplier() / 1e18.
    function balanceOf(bytes32 kidId, address token) external view returns (uint256) {
        return token == address(usdc) ? kidUsdc[kidId] : kidTokens[kidId][token];
    }

    // =============================== internals ===============================

    function _setCaps(uint256 a, uint256 b, uint256 c) internal {
        if (a == 0 || b == 0 || c == 0) revert ZeroAmount();
        maxPerTx = a;
        maxPerKidPerWindow = b;
        maxTotalInflow = c;
        emit CapsSet(a, b, c);
    }

    function _notGraduated(bytes32 kidId) internal view {
        if (graduatedTo[kidId] != address(0)) revert KidGraduated(kidId);
    }

    function _checkTxCap(uint256 amount) internal view {
        if (amount > maxPerTx) revert OverTxCap(amount, maxPerTx);
    }

    function _addInflow(uint256 amount) internal {
        uint256 newInflow = totalInflow + amount;
        if (newInflow > maxTotalInflow) revert OverVaultCap(newInflow, maxTotalInflow);
        totalInflow = newInflow;
    }

    /// @dev A 30-day window starts at the kid's first spend and resets once it has elapsed.
    function _spendKidWindow(bytes32 kidId, uint256 amount) internal {
        Window storage w = kidWindow[kidId];
        if (block.timestamp >= uint256(w.start) + CAP_WINDOW) {
            w.start = uint64(block.timestamp);
            w.spent = 0;
        }
        uint256 newSpent = uint256(w.spent) + amount;
        if (newSpent > maxPerKidPerWindow) revert OverKidCap(newSpent, maxPerKidPerWindow);
        w.spent = uint192(newSpent);
    }

    function _swap(address token, uint256 amountIn, uint256 minOut, uint256 deadline) internal returns (uint256 out) {
        int24 tickSpacing = tickSpacingOf[token];
        if (tickSpacing == 0) revert TokenNotAllowed(token);
        if (minOut == 0) revert ZeroMinOut();
        if (deadline < block.timestamp) revert Expired();
        uint256 before = IERC20(token).balanceOf(address(this));
        usdc.forceApprove(address(router), amountIn);
        router.exactInputSingle(
            ISlipstreamRouter.ExactInputSingleParams({
                tokenIn: address(usdc),
                tokenOut: token,
                tickSpacing: tickSpacing,
                recipient: address(this),
                deadline: deadline,
                amountIn: amountIn,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: 0
            })
        );
        usdc.forceApprove(address(router), 0);
        out = IERC20(token).balanceOf(address(this)) - before;
        if (out < minOut) revert SlippageExceeded(out, minOut);
    }
}
