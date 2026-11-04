// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Subset of Aerodrome Slipstream's SwapRouter.
/// Source: github.com/aerodrome-finance/slipstream contracts/periphery/interfaces/ISwapRouter.sol
/// Deployed (Gauges V3): 0x698Cb2b6dd822994581fEa6eA4Fc755d1363A92F — see docs/VERIFIED.md
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
