// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FamilyVault} from "./FamilyVault.sol";
import {ISlipstreamRouter} from "./interfaces/ISlipstreamRouter.sol";

/// @title FamilyVaultFactory
/// @notice Deploys one FamilyVault per parent wallet. The caller becomes the vault's owner.
/// The factory fixes at deploy time: the default operator (the app's relayer), the starting caps,
/// and the verified stock tokens with their pool tick spacings. Each parent can change all of
/// these on their own vault afterwards.
contract FamilyVaultFactory {
    IERC20 public immutable usdc;
    ISlipstreamRouter public immutable router;
    address public immutable defaultOperator;
    uint256 public immutable defaultMaxPerTx;
    uint256 public immutable defaultMaxPerKidPerWindow;
    uint256 public immutable defaultMaxTotalInflow;

    address[] internal _tokens;
    int24[] internal _tickSpacings;

    mapping(address => address) public vaultOf;

    event VaultCreated(address indexed parent, address vault);

    error VaultExists(address vault);
    error LengthMismatch();

    constructor(
        IERC20 usdc_,
        ISlipstreamRouter router_,
        address defaultOperator_,
        uint256 maxPerTx_,
        uint256 maxPerKidPerWindow_,
        uint256 maxTotalInflow_,
        address[] memory tokens_,
        int24[] memory tickSpacings_
    ) {
        if (tokens_.length != tickSpacings_.length) revert LengthMismatch();
        usdc = usdc_;
        router = router_;
        defaultOperator = defaultOperator_;
        defaultMaxPerTx = maxPerTx_;
        defaultMaxPerKidPerWindow = maxPerKidPerWindow_;
        defaultMaxTotalInflow = maxTotalInflow_;
        _tokens = tokens_;
        _tickSpacings = tickSpacings_;
    }

    function defaultTokens() external view returns (address[] memory, int24[] memory) {
        return (_tokens, _tickSpacings);
    }

    /// @notice Creates the caller's family vault, owned by the caller.
    function createVault() external returns (FamilyVault vault) {
        if (vaultOf[msg.sender] != address(0)) revert VaultExists(vaultOf[msg.sender]);
        vault = new FamilyVault(
            msg.sender,
            defaultOperator,
            usdc,
            router,
            defaultMaxPerTx,
            defaultMaxPerKidPerWindow,
            defaultMaxTotalInflow,
            _tokens,
            _tickSpacings
        );
        vaultOf[msg.sender] = address(vault);
        emit VaultCreated(msg.sender, address(vault));
    }
}
