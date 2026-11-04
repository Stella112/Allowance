// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FamilyVault} from "../src/FamilyVault.sol";
import {FamilyVaultFactory} from "../src/FamilyVaultFactory.sol";
import {ISlipstreamRouter} from "../src/interfaces/ISlipstreamRouter.sol";

/// Deploys the factory, then the Adeyemi demo vault, which the deployer creates and owns.
/// The deployer is the single hot wallet: it owns the demo vault, operates it, and is the
/// factory's default operator for real families.
///
/// Dry run on a fork (no keys, nothing sent):
///   forge script script/Deploy.s.sol --fork-url base --sender <hot wallet address>
/// Mainnet (ONLY after the owner's explicit approval):
///   forge script script/Deploy.s.sol --rpc-url base --account <keystore> --broadcast --verify
contract Deploy is Script {
    // Verified addresses: docs/VERIFIED.md
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant ROUTER = 0x698Cb2b6dd822994581fEa6eA4Fc755d1363A92F;
    address constant AAPLC = 0xb200000000000000000000C2e324d24d7eEcd1fb;
    address constant NVDAC = 0xb20000000000000000000078ee7ce2fE4908108C;
    int24 constant TS = 10;

    // Default caps for real families (prompt section 4)
    uint256 constant FAMILY_MAX_TX = 5e6; // $5
    uint256 constant FAMILY_MAX_KID = 20e6; // $20 per kid per 30 days
    uint256 constant FAMILY_MAX_VAULT = 100e6; // $100 cumulative inflow

    // Demo vault caps (the $3 budget plan): the contract backstops the server's demo limits
    uint256 constant DEMO_MAX_TX = 5e4; // $0.05
    uint256 constant DEMO_MAX_KID = 1e5; // $0.10 per demo kid
    uint256 constant DEMO_MAX_VAULT = 3e6; // $3 total ever

    function run() external returns (FamilyVaultFactory factory, FamilyVault demoVault) {
        address deployer = msg.sender;
        address[] memory tokens = new address[](2);
        tokens[0] = AAPLC;
        tokens[1] = NVDAC;
        int24[] memory spacings = new int24[](2);
        spacings[0] = TS;
        spacings[1] = TS;

        vm.startBroadcast();
        factory = new FamilyVaultFactory(
            IERC20(USDC), ISlipstreamRouter(ROUTER), deployer, FAMILY_MAX_TX, FAMILY_MAX_KID, FAMILY_MAX_VAULT, tokens, spacings
        );
        demoVault = factory.createVault();
        demoVault.setCaps(DEMO_MAX_TX, DEMO_MAX_KID, DEMO_MAX_VAULT);
        vm.stopBroadcast();

        console2.log("FamilyVaultFactory", address(factory));
        console2.log("Demo FamilyVault  ", address(demoVault));
        console2.log("Owner/operator    ", deployer);

        if (block.chainid == 8453 && vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
            string memory json = "deploy";
            vm.serializeAddress(json, "factory", address(factory));
            vm.serializeAddress(json, "demoVault", address(demoVault));
            vm.serializeAddress(json, "owner", deployer);
            string memory out = vm.serializeUint(json, "chainId", block.chainid);
            vm.writeJson(out, "./deployments/base-mainnet.json");
        }
    }
}

import {VmSafe} from "forge-std/Vm.sol";
