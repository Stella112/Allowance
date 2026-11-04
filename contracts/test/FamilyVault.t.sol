// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {FamilyVault} from "../src/FamilyVault.sol";
import {FamilyVaultFactory} from "../src/FamilyVaultFactory.sol";
import {ISlipstreamRouter} from "../src/interfaces/ISlipstreamRouter.sol";

/// Source: aerodrome-finance/slipstream contracts/periphery/interfaces/IQuoterV2.sol
interface IQuoterV2 {
    struct QuoteExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        int24 tickSpacing;
        uint160 sqrtPriceLimitX96;
    }

    function quoteExactInputSingle(QuoteExactInputSingleParams memory params)
        external
        returns (uint256 amountOut, uint160, uint32, uint256);
}

interface IB20Asset {
    function uiMultiplier() external view returns (uint256);
    function balanceOfUI(address account) external view returns (uint256);
    function policyId(bytes32 scope) external view returns (uint64);
}

interface IPolicyRegistry {
    function isAuthorized(uint64 policyId, address account) external view returns (bool);
}

/// All tests run on a Base mainnet fork against the real USDC, stock tokens and Aerodrome pools.
contract FamilyVaultTest is Test {
    uint256 constant FORK_BLOCK = 53_515_412;
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant ROUTER = 0x698Cb2b6dd822994581fEa6eA4Fc755d1363A92F;
    address constant QUOTER = 0x514c8B5f54112481E28028F1166Bd78501089259;
    address constant AAPLC = 0xb200000000000000000000C2e324d24d7eEcd1fb;
    address constant NVDAC = 0xb20000000000000000000078ee7ce2fE4908108C;
    address constant MSFTC = 0xB200000000000000000000Ab99cFa739E253872B; // real token, not allowlisted
    address constant POLICY_REGISTRY = 0x8453000000000000000000000000000000000002;
    bytes32 constant TRANSFER_RECEIVER = 0x8a4b3fa2d8b921852bc0089c6ef0958aa6961897be36fd731330fe2cd23f8363;
    bytes32 constant TRANSFER_SENDER = 0xb81736c875ab819dd97f59f2a6542cfb731ad52b4ae15a6f24df2fb02b0327f5;
    int24 constant TS = 10;

    uint256 constant MAX_TX = 5e6; // $5
    uint256 constant MAX_KID = 20e6; // $20 per 30 days
    uint256 constant MAX_VAULT = 100e6; // $100 cumulative inflow

    FamilyVaultFactory factory;
    FamilyVault vault;
    address parent = makeAddr("parent");
    address relayer = makeAddr("relayer");
    address aunty = makeAddr("auntyFunmi");
    address stranger = makeAddr("stranger");
    bytes32 tobi = keccak256("demo-kid-tobi");
    bytes32 ada = keccak256("demo-kid-ada");

    function setUp() public {
        vm.createSelectFork("base", FORK_BLOCK);
        address[] memory tokens = new address[](2);
        tokens[0] = AAPLC;
        tokens[1] = NVDAC;
        int24[] memory spacings = new int24[](2);
        spacings[0] = TS;
        spacings[1] = TS;
        factory = new FamilyVaultFactory(
            IERC20(USDC), ISlipstreamRouter(ROUTER), relayer, MAX_TX, MAX_KID, MAX_VAULT, tokens, spacings
        );
        vm.prank(parent);
        vault = factory.createVault();
    }

    // ------------------------------------------------------------ helpers

    function _quote(address token, uint256 amountIn) internal returns (uint256 out) {
        (out,,,) = IQuoterV2(QUOTER).quoteExactInputSingle(
            IQuoterV2.QuoteExactInputSingleParams(USDC, token, amountIn, TS, 0)
        );
    }

    function _minOut(address token, uint256 amountIn) internal returns (uint256) {
        return (_quote(token, amountIn) * 99) / 100; // 1% slippage
    }

    function _fundFamily(uint256 amount) internal {
        deal(USDC, parent, amount);
        vm.startPrank(parent);
        IERC20(USDC).approve(address(vault), amount);
        vault.deposit(amount);
        vm.stopPrank();
    }

    /// Fund the pool and release one allowance of `amount` to `kid`.
    function _giveKidSavings(bytes32 kid, uint128 amount) internal {
        _fundFamily(amount);
        vm.prank(parent);
        vault.setAllowance(kid, amount, 7 days);
        vm.prank(relayer);
        vault.releaseAllowance(kid);
    }

    function _gift(address from, bytes32 kid, address token, uint256 amount) internal returns (uint256) {
        deal(USDC, from, amount);
        uint256 minOut = _minOut(token, amount);
        vm.startPrank(from);
        IERC20(USDC).approve(address(vault), amount);
        uint256 out = vault.depositGift(kid, token, amount, minOut, block.timestamp + 300, bytes32("Aunty Funmi"));
        vm.stopPrank();
        return out;
    }

    // ------------------------------------------------------------ factory

    function test_factory_createsVaultOwnedByCaller() public view {
        assertEq(vault.owner(), parent);
        assertEq(vault.operator(), relayer);
        assertEq(address(vault.usdc()), USDC);
        assertEq(address(vault.router()), ROUTER);
        assertEq(vault.maxPerTx(), MAX_TX);
        assertEq(vault.maxPerKidPerWindow(), MAX_KID);
        assertEq(vault.maxTotalInflow(), MAX_VAULT);
        assertEq(vault.tickSpacingOf(AAPLC), TS);
        assertEq(vault.tickSpacingOf(NVDAC), TS);
        assertEq(vault.tickSpacingOf(MSFTC), 0);
        assertEq(factory.vaultOf(parent), address(vault));
    }

    function test_factory_oneVaultPerParent() public {
        vm.prank(parent);
        vm.expectRevert(abi.encodeWithSelector(FamilyVaultFactory.VaultExists.selector, address(vault)));
        factory.createVault();
    }

    function test_tokenPolicies_authorizeTheVault() public view {
        for (uint256 i; i < 2; ++i) {
            address t = i == 0 ? AAPLC : NVDAC;
            assertTrue(IPolicyRegistry(POLICY_REGISTRY).isAuthorized(IB20Asset(t).policyId(TRANSFER_RECEIVER), address(vault)));
            assertTrue(IPolicyRegistry(POLICY_REGISTRY).isAuthorized(IB20Asset(t).policyId(TRANSFER_SENDER), address(vault)));
        }
    }

    // ------------------------------------------------------------ deposit + vault cap

    function test_deposit_creditsFamilyPool() public {
        _fundFamily(10e6);
        assertEq(vault.familyUsdc(), 10e6);
        assertEq(vault.totalInflow(), 10e6);
        assertEq(IERC20(USDC).balanceOf(address(vault)), 10e6);
    }

    function test_deposit_revertsOverVaultCap() public {
        _fundFamily(MAX_VAULT);
        deal(USDC, parent, 1);
        vm.startPrank(parent);
        IERC20(USDC).approve(address(vault), 1);
        vm.expectRevert(abi.encodeWithSelector(FamilyVault.OverVaultCap.selector, MAX_VAULT + 1, MAX_VAULT));
        vault.deposit(1);
        vm.stopPrank();
    }

    function test_deposit_revertsOnZero() public {
        vm.prank(parent);
        vm.expectRevert(FamilyVault.ZeroAmount.selector);
        vault.deposit(0);
    }

    // ------------------------------------------------------------ allowance

    function test_allowance_releaseOncePerPeriod() public {
        _fundFamily(10e6);
        vm.prank(parent);
        vault.setAllowance(tobi, 1e6, 7 days);

        vm.prank(relayer);
        vault.releaseAllowance(tobi);
        assertEq(vault.kidUsdc(tobi), 1e6);
        assertEq(vault.familyUsdc(), 9e6);

        (,, uint64 next) = vault.allowanceOf(tobi);
        assertEq(next, block.timestamp + 7 days);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(FamilyVault.AllowanceNotDue.selector, uint256(next)));
        vault.releaseAllowance(tobi);

        vm.warp(block.timestamp + 7 days);
        vm.prank(parent); // owner can also release
        vault.releaseAllowance(tobi);
        assertEq(vault.kidUsdc(tobi), 2e6);
    }

    function test_allowance_changingAmountDoesNotResetPeriod() public {
        _fundFamily(10e6);
        vm.startPrank(parent);
        vault.setAllowance(tobi, 1e6, 7 days);
        vault.releaseAllowance(tobi);
        vault.setAllowance(tobi, 2e6, 7 days);
        vm.expectRevert();
        vault.releaseAllowance(tobi);
        vm.stopPrank();
    }

    function test_allowance_onlyOwnerOrOperatorCanRelease() public {
        _fundFamily(10e6);
        vm.prank(parent);
        vault.setAllowance(tobi, 1e6, 7 days);
        vm.prank(stranger);
        vm.expectRevert(FamilyVault.NotAuthorized.selector);
        vault.releaseAllowance(tobi);
    }

    function test_allowance_onlyOwnerCanSet() public {
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, relayer));
        vault.setAllowance(tobi, 1e6, 7 days);
    }

    function test_allowance_revertsWithoutScheduleOrFunds() public {
        vm.prank(relayer);
        vm.expectRevert(FamilyVault.NoAllowance.selector);
        vault.releaseAllowance(tobi);

        vm.prank(parent);
        vault.setAllowance(tobi, 1e6, 7 days);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(FamilyVault.InsufficientFamilyUsdc.selector, 0, 1e6));
        vault.releaseAllowance(tobi);
    }

    // ------------------------------------------------------------ pitch buy

    function test_pitchBuy_realSwapCreditsKid() public {
        _giveKidSavings(tobi, 1e6);
        uint256 minOut = _minOut(AAPLC, 25e4);
        vm.prank(relayer);
        uint256 out = vault.approvePitchBuy(tobi, AAPLC, 25e4, 0, minOut, block.timestamp + 300);

        assertGe(out, minOut);
        assertEq(vault.kidTokens(tobi, AAPLC), out);
        assertEq(vault.balanceOf(tobi, AAPLC), out);
        assertEq(vault.balanceOf(tobi, USDC), 75e4);
        assertEq(IERC20(AAPLC).balanceOf(address(vault)), out);
        assertEq(IERC20(USDC).allowance(address(vault), ROUTER), 0, "router approval cleared");
        emit log_named_uint("AAPLc raw for $0.25", out);
    }

    function test_pitchBuy_parentMatch50pct() public {
        _giveKidSavings(tobi, 1e6);
        _fundFamily(1e6); // pool for the match
        uint256 poolBefore = vault.familyUsdc();
        uint256 total = 15e4; // kid $0.10 + 50% match $0.05
        uint256 minOut = _minOut(NVDAC, total);

        vm.expectEmit(true, true, false, false, address(vault));
        emit FamilyVault.PitchBought(tobi, NVDAC, 1e5, 5e4, 0);
        vm.prank(relayer);
        uint256 out = vault.approvePitchBuy(tobi, NVDAC, 1e5, 5_000, minOut, block.timestamp + 300);

        assertEq(vault.kidUsdc(tobi), 1e6 - 1e5);
        assertEq(vault.familyUsdc(), poolBefore - 5e4);
        assertEq(vault.kidTokens(tobi, NVDAC), out);
        (, uint192 spent) = vault.kidWindow(tobi);
        assertEq(spent, total, "match counts toward the kid window");
    }

    function test_pitchBuy_kidCannotCallIt() public {
        _giveKidSavings(tobi, 1e6);
        vm.prank(stranger);
        vm.expectRevert(FamilyVault.NotAuthorized.selector);
        vault.approvePitchBuy(tobi, AAPLC, 1e5, 0, 1, block.timestamp + 300);
    }

    function test_pitchBuy_revertsOverTxCap() public {
        _giveKidSavings(tobi, 10e6);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(FamilyVault.OverTxCap.selector, MAX_TX + 1, MAX_TX));
        vault.approvePitchBuy(tobi, AAPLC, MAX_TX + 1, 0, 1, block.timestamp + 300);
    }

    function test_pitchBuy_matchCountsTowardTxCap() public {
        _giveKidSavings(tobi, 10e6);
        _fundFamily(10e6);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(FamilyVault.OverTxCap.selector, 6e6, MAX_TX));
        vault.approvePitchBuy(tobi, AAPLC, 4e6, 5_000, 1, block.timestamp + 300);
    }

    function test_pitchBuy_kidWindowCapAndReset() public {
        _giveKidSavings(tobi, 25e6);
        for (uint256 i; i < 4; ++i) {
            uint256 m = _minOut(AAPLC, MAX_TX);
            vm.prank(relayer);
            vault.approvePitchBuy(tobi, AAPLC, MAX_TX, 0, m, block.timestamp + 300);
        }
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(FamilyVault.OverKidCap.selector, MAX_KID + 1e6, MAX_KID));
        vault.approvePitchBuy(tobi, AAPLC, 1e6, 0, 1, block.timestamp + 300);

        // a different kid has their own window
        _giveKidSavings(ada, 1e6);
        uint256 mAda = _minOut(AAPLC, 1e6);
        vm.prank(relayer);
        vault.approvePitchBuy(ada, AAPLC, 1e6, 0, mAda, block.timestamp + 300);

        // after 30 days Tobi's window resets (quote reused: pool state is unchanged by warp)
        uint256 m2 = _minOut(AAPLC, 1e6);
        vm.warp(block.timestamp + 30 days);
        vm.prank(relayer);
        vault.approvePitchBuy(tobi, AAPLC, 1e6, 0, m2, block.timestamp + 300);
    }

    function test_pitchBuy_revertsWithoutSavings() public {
        _fundFamily(1e6);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(FamilyVault.InsufficientKidUsdc.selector, 0, 1e5));
        vault.approvePitchBuy(tobi, AAPLC, 1e5, 0, 1, block.timestamp + 300);
    }

    function test_pitchBuy_revertsOnUnlistedToken() public {
        _giveKidSavings(tobi, 1e6);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(FamilyVault.TokenNotAllowed.selector, MSFTC));
        vault.approvePitchBuy(tobi, MSFTC, 1e5, 0, 1, block.timestamp + 300);
    }

    function test_pitchBuy_revertsOnZeroMinOut() public {
        _giveKidSavings(tobi, 1e6);
        vm.prank(relayer);
        vm.expectRevert(FamilyVault.ZeroMinOut.selector);
        vault.approvePitchBuy(tobi, AAPLC, 1e5, 0, 0, block.timestamp + 300);
    }

    function test_pitchBuy_revertsOnSlippage() public {
        _giveKidSavings(tobi, 1e6);
        uint256 tooHigh = _quote(AAPLC, 1e5) * 2;
        vm.prank(relayer);
        vm.expectRevert(); // the router rejects before the vault's own check
        vault.approvePitchBuy(tobi, AAPLC, 1e5, 0, tooHigh, block.timestamp + 300);
        assertEq(vault.kidUsdc(tobi), 1e6, "failed swap leaves savings untouched");
    }

    function test_pitchBuy_revertsWhenExpired() public {
        _giveKidSavings(tobi, 1e6);
        vm.prank(relayer);
        vm.expectRevert(FamilyVault.Expired.selector);
        vault.approvePitchBuy(tobi, AAPLC, 1e5, 0, 1, block.timestamp - 1);
    }

    function test_pitchBuy_revertsOnMatchOver100pct() public {
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(FamilyVault.MatchTooHigh.selector, 10_001));
        vault.approvePitchBuy(tobi, AAPLC, 1e5, 10_001, 1, block.timestamp + 300);
    }

    // ------------------------------------------------------------ gifts

    function test_gift_relativePaysAndKidIsCredited() public {
        uint256 out = _gift(aunty, tobi, AAPLC, 25e4);
        assertGt(out, 0);
        assertEq(vault.kidTokens(tobi, AAPLC), out);
        assertEq(vault.totalInflow(), 25e4);
        assertEq(IERC20(USDC).balanceOf(aunty), 0);
        // dividend-aware display: shares = raw x multiplier
        assertEq(IB20Asset(AAPLC).balanceOfUI(address(vault)), out * IB20Asset(AAPLC).uiMultiplier() / 1e18);
    }

    function test_gift_capsApply() public {
        deal(USDC, aunty, MAX_TX + 1);
        vm.startPrank(aunty);
        IERC20(USDC).approve(address(vault), MAX_TX + 1);
        vm.expectRevert(abi.encodeWithSelector(FamilyVault.OverTxCap.selector, MAX_TX + 1, MAX_TX));
        vault.depositGift(tobi, AAPLC, MAX_TX + 1, 1, block.timestamp + 300, bytes32(0));
        vm.stopPrank();
    }

    function test_gift_vaultCapApplies() public {
        _fundFamily(MAX_VAULT - 1e5);
        deal(USDC, aunty, 2e5);
        vm.startPrank(aunty);
        IERC20(USDC).approve(address(vault), 2e5);
        vm.expectRevert(abi.encodeWithSelector(FamilyVault.OverVaultCap.selector, MAX_VAULT + 1e5, MAX_VAULT));
        vault.depositGift(tobi, AAPLC, 2e5, 1, block.timestamp + 300, bytes32(0));
        vm.stopPrank();
    }

    // ------------------------------------------------------------ pause + emergency

    function test_pause_blocksMoneyPaths() public {
        _giveKidSavings(tobi, 1e6);
        vm.prank(parent);
        vault.pause();

        vm.prank(relayer);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.approvePitchBuy(tobi, AAPLC, 1e5, 0, 1, block.timestamp + 300);

        vm.prank(relayer);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.releaseAllowance(tobi);

        deal(USDC, aunty, 1e5);
        vm.startPrank(aunty);
        IERC20(USDC).approve(address(vault), 1e5);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.depositGift(tobi, AAPLC, 1e5, 1, block.timestamp + 300, bytes32(0));
        vm.stopPrank();

        vm.prank(parent);
        vault.unpause();
        uint256 m = _minOut(AAPLC, 1e5);
        vm.prank(relayer);
        vault.approvePitchBuy(tobi, AAPLC, 1e5, 0, m, block.timestamp + 300);
    }

    function test_pause_onlyOwner() public {
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, relayer));
        vault.pause();
    }

    function test_emergencyWithdraw_ownerGetsEverythingEvenWhilePaused() public {
        uint256 out = _gift(aunty, tobi, AAPLC, 25e4);
        _fundFamily(1e6);
        vm.startPrank(parent);
        vault.pause();
        vault.emergencyWithdraw(AAPLC, out);
        vault.emergencyWithdraw(USDC, 1e6);
        vm.stopPrank();
        assertEq(IERC20(AAPLC).balanceOf(parent), out);
        assertEq(IERC20(USDC).balanceOf(parent), 1e6);
    }

    function test_emergencyWithdraw_operatorCannot() public {
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, relayer));
        vault.emergencyWithdraw(USDC, 1);
    }

    // ------------------------------------------------------------ admin

    function test_admin_onlyOwnerSetsCapsOperatorTokens() public {
        vm.startPrank(relayer);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, relayer));
        vault.setCaps(1, 1, 1);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, relayer));
        vault.setOperator(relayer);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, relayer));
        vault.setTokenAllowed(MSFTC, TS);
        vm.stopPrank();

        vm.startPrank(parent);
        vault.setCaps(1e6, 2e6, 3e6);
        assertEq(vault.maxPerTx(), 1e6);
        vault.setOperator(address(0)); // revoke the relayer
        vm.stopPrank();
        vm.prank(relayer);
        vm.expectRevert(FamilyVault.NotAuthorized.selector);
        vault.releaseAllowance(tobi);
    }

    function test_admin_cannotAllowUsdcAsStock() public {
        vm.prank(parent);
        vm.expectRevert(FamilyVault.InvalidAddress.selector);
        vault.setTokenAllowed(USDC, TS);
    }
}
