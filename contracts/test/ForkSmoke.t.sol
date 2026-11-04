// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// Minimal interfaces copied from the verified sources listed in docs/VERIFIED.md.
interface ISlipstreamRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        int24 tickSpacing;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

interface IB20Asset {
    function uiMultiplier() external view returns (uint256);
    function balanceOfUI(address account) external view returns (uint256);
    function policyId(bytes32 scope) external view returns (uint64);
}

interface IPolicyRegistry {
    function isAuthorized(uint64 policyId, address account) external view returns (bool);
}

/// @notice Phase 0 blocker proof: on a Base mainnet fork, the B20 precompiles run and a
/// fresh contract address can receive AAPLc and NVDAc from a real Aerodrome swap.
contract ForkSmokeTest is Test {
    uint256 constant FORK_BLOCK = 53_515_412;
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant ROUTER = 0x698Cb2b6dd822994581fEa6eA4Fc755d1363A92F;
    address constant AAPLC = 0xb200000000000000000000C2e324d24d7eEcd1fb;
    address constant NVDAC = 0xb20000000000000000000078ee7ce2fE4908108C;
    address constant POLICY_REGISTRY = 0x8453000000000000000000000000000000000002;
    bytes32 constant TRANSFER_RECEIVER = 0x8a4b3fa2d8b921852bc0089c6ef0958aa6961897be36fd731330fe2cd23f8363;
    int24 constant TICK_SPACING = 10;

    Holder holder; // stands in for a FamilyVault: a brand-new contract address

    function setUp() public {
        vm.createSelectFork("base", FORK_BLOCK);
        holder = new Holder();
    }

    function _buy(address token, uint256 usdcAmount, address recipient) internal returns (uint256 out) {
        deal(USDC, address(this), usdcAmount);
        IERC20(USDC).approve(ROUTER, usdcAmount);
        out = ISlipstreamRouter(ROUTER).exactInputSingle(
            ISlipstreamRouter.ExactInputSingleParams({
                tokenIn: USDC,
                tokenOut: token,
                tickSpacing: TICK_SPACING,
                recipient: recipient,
                deadline: block.timestamp + 300,
                amountIn: usdcAmount,
                amountOutMinimum: 1, // smoke test only; production code computes a real minOut from a quote
                sqrtPriceLimitX96: 0
            })
        );
    }

    function test_precompilesRespondOnFork() public view {
        assertEq(IERC20Metadata(AAPLC).decimals(), 8);
        assertGe(IB20Asset(NVDAC).uiMultiplier(), 1e18);
        uint64 pid = IB20Asset(AAPLC).policyId(TRANSFER_RECEIVER);
        assertTrue(IPolicyRegistry(POLICY_REGISTRY).isAuthorized(pid, address(holder)));
    }

    function test_swapUsdcForAaplIntoFreshContract() public {
        uint256 out = _buy(AAPLC, 250_000, address(holder)); // $0.25
        assertGt(out, 0);
        assertEq(IERC20(AAPLC).balanceOf(address(holder)), out);
        emit log_named_uint("AAPLc raw units for $0.25", out);
    }

    function test_swapUsdcForNvdaIntoFreshContract() public {
        uint256 out = _buy(NVDAC, 250_000, address(holder));
        assertGt(out, 0);
        assertEq(IERC20(NVDAC).balanceOf(address(holder)), out);
        // balanceOfUI = raw x multiplier (WAD)
        assertEq(IB20Asset(NVDAC).balanceOfUI(address(holder)), out * IB20Asset(NVDAC).uiMultiplier() / 1e18);
    }

    function test_contractCanSendTokensOnward() public {
        uint256 out = _buy(AAPLC, 250_000, address(holder));
        address relative = makeAddr("relative");
        holder.send(AAPLC, relative, out);
        assertEq(IERC20(AAPLC).balanceOf(relative), out);
    }
}

interface IERC20Metadata {
    function decimals() external view returns (uint8);
}

contract Holder {
    function send(address token, address to, uint256 amount) external {
        require(IERC20(token).transfer(to, amount), "transfer failed");
    }
}
