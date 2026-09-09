// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TownTreasury} from "../src/TownTreasury.sol";
import {ArcConfig} from "../src/config/ArcConfig.sol";

/// @title DeployTownTreasury
/// @notice Deploys `TownTreasury` with constructor args from env and records the address in
///         `deployments/<network>.json` (`.contracts.TownTreasury`), preserving any other entries in that file.
/// @dev Env: ARC_USDC_ADDRESS (default ArcConfig.USDC), TREASURY_OWNER (required), TREASURER_ADDRESS (optional,
///      address(0) = grant later), BASE_RATE_BPS (default 600), GRACE_SECONDS (default 120).
///      Dry run (no `--broadcast`) simulates only and does not touch the deployments file.
///      Usage: forge script script/DeployTownTreasury.s.sol --rpc-url $ARC_RPC_URL [--broadcast --private-key ...]
contract DeployTownTreasury is Script {
    struct Config {
        address usdc;
        address owner;
        address treasurer;
        uint16 baseRateBps;
        uint32 gracePeriodSeconds;
    }

    function run() external returns (TownTreasury treasury) {
        Config memory cfg = _readConfig();
        _log(cfg);

        vm.broadcast();
        treasury = new TownTreasury(IERC20(cfg.usdc), cfg.owner, cfg.treasurer, cfg.baseRateBps, cfg.gracePeriodSeconds);

        console.log("TownTreasury deployed at %s (usdcDecimals=%s)", address(treasury), treasury.usdcDecimals());

        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
            _writeDeployment(address(treasury));
        } else {
            console.log("Dry run: deployments/%s.json not updated", _networkName());
        }
    }

    function _readConfig() internal view returns (Config memory cfg) {
        cfg.usdc = vm.envOr("ARC_USDC_ADDRESS", ArcConfig.USDC);
        cfg.owner = vm.envAddress("TREASURY_OWNER");
        cfg.treasurer = vm.envOr("TREASURER_ADDRESS", address(0));
        uint256 rate = vm.envOr("BASE_RATE_BPS", uint256(600));
        uint256 grace = vm.envOr("GRACE_SECONDS", uint256(120));
        require(rate <= type(uint16).max, "BASE_RATE_BPS overflow");
        require(grace <= type(uint32).max, "GRACE_SECONDS overflow");
        // Safe: bounds checked by the requires above.
        // forge-lint: disable-next-line(unsafe-typecast)
        cfg.baseRateBps = uint16(rate);
        // forge-lint: disable-next-line(unsafe-typecast)
        cfg.gracePeriodSeconds = uint32(grace);
    }

    function _log(Config memory cfg) internal view {
        console.log("chainId      %s", block.chainid);
        console.log("usdc         %s", cfg.usdc);
        console.log("owner        %s", cfg.owner);
        console.log("treasurer    %s", cfg.treasurer);
        console.log("baseRateBps  %s", cfg.baseRateBps);
        console.log("graceSeconds %s", cfg.gracePeriodSeconds);
    }

    function _networkName() internal view returns (string memory) {
        if (block.chainid == ArcConfig.CHAIN_ID) return "arc-testnet";
        if (block.chainid == 11_155_111) return "sepolia";
        return vm.toString(block.chainid);
    }

    /// @dev Re-runnable: rebuilds `contracts` from the existing file so other entries survive, then overwrites
    ///      `TownTreasury`. Creates the file if missing.
    function _writeDeployment(address treasury) internal {
        string memory network = _networkName();
        string memory path = string.concat("deployments/", network, ".json");
        string memory contractsObj = "contracts";
        string memory contractsJson = "";

        if (vm.exists(path)) {
            string memory existing = vm.readFile(path);
            if (vm.keyExistsJson(existing, ".contracts")) {
                string[] memory keys = vm.parseJsonKeys(existing, ".contracts");
                for (uint256 i = 0; i < keys.length; i++) {
                    address a = vm.parseJsonAddress(existing, string.concat(".contracts.", keys[i]));
                    contractsJson = vm.serializeAddress(contractsObj, keys[i], a);
                }
            }
        }
        contractsJson = vm.serializeAddress(contractsObj, "TownTreasury", treasury);

        string memory root = "root";
        vm.serializeUint(root, "chainId", block.chainid);
        vm.serializeString(root, "network", network);
        string memory out = vm.serializeString(root, "contracts", contractsJson);
        vm.writeJson(out, path);
        console.log("wrote %s", path);
    }
}
