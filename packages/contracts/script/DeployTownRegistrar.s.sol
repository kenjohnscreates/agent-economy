// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {TownRegistrar} from "../src/TownRegistrar.sol";
import {ITownRegistry, ITownResolver, RegistryRoles, ResolverRoles} from "../src/ens/HackathonEns.sol";

/// @title DeployTownRegistrar
/// @notice Deploys `TownRegistrar` with constructor args from env / `packages/ens/town.json`.
/// @dev Dry-run by default. `--broadcast` is refused unless `ALLOW_BROADCAST=true`.
///      Does not grant live EAC roles (treasurer must send those txs). Simulates the grants
///      when the town registry has code on the selected RPC. Never writes tokenIds (R3).
///
///      Env: ENS_TOWN_REGISTRY, ENS_TOWN_RESOLVER, ENS_TOWN_NAME (default botanica),
///      REGISTRAR_OWNER (or TREASURY_OWNER), ENS_TREASURER_ADDRESS (credit-score grantee),
///      NAME_DURATION_SECONDS (default 365 days), CONSUMER_DURATION_SECONDS (default 30 days),
///      ALLOW_BROADCAST (must be true to actually send).
///
///      Usage:
///        forge script script/DeployTownRegistrar.s.sol --rpc-url $SEPOLIA_RPC_URL
///        ALLOW_BROADCAST=true forge script script/DeployTownRegistrar.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast
contract DeployTownRegistrar is Script {
    uint256 internal constant ROLE_REGISTRAR_AND_RENEW = RegistryRoles.ROLE_REGISTRAR | RegistryRoles.ROLE_RENEW;
    uint256 internal constant RESOLVER_REGISTRAR_ROLES = ResolverRoles.ROLE_SET_TEXT | ResolverRoles.ROLE_SET_TEXT_ADMIN
        | ResolverRoles.ROLE_SET_ADDRESS | ResolverRoles.ROLE_SET_ADDRESS_ADMIN;

    struct Config {
        address registry;
        address resolver;
        address owner;
        address treasurer;
        string townLabel;
        uint64 nameDuration;
        uint64 consumerDuration;
    }

    function run() external returns (TownRegistrar registrar) {
        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast) && !vm.envOr("ALLOW_BROADCAST", false)) {
            revert("refusing --broadcast: set ALLOW_BROADCAST=true (this PR is dry-run only)");
        }

        Config memory cfg = _readConfig();
        _log(cfg);

        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
            vm.broadcast();
            registrar = new TownRegistrar(
                ITownRegistry(cfg.registry),
                ITownResolver(cfg.resolver),
                cfg.owner,
                cfg.treasurer,
                cfg.townLabel,
                cfg.nameDuration,
                cfg.consumerDuration
            );
        } else {
            registrar = new TownRegistrar(
                ITownRegistry(cfg.registry),
                ITownResolver(cfg.resolver),
                cfg.owner,
                cfg.treasurer,
                cfg.townLabel,
                cfg.nameDuration,
                cfg.consumerDuration
            );
            console.log("Dry run: TownRegistrar simulated at %s (not broadcast)", address(registrar));
        }

        console.log("TownRegistrar %s", address(registrar));
        _logGrantPlan(address(registrar), cfg);
        _simulateGrants(address(registrar), cfg);
        return registrar;
    }

    function _readConfig() internal view returns (Config memory cfg) {
        (address jsonReg, address jsonRes, string memory jsonLabel) = _readTownJson();
        cfg.townLabel = vm.envOr("ENS_TOWN_NAME", jsonLabel);
        if (bytes(cfg.townLabel).length == 0) cfg.townLabel = "botanica";

        cfg.registry = vm.envOr("ENS_TOWN_REGISTRY", jsonReg);
        cfg.resolver = vm.envOr("ENS_TOWN_RESOLVER", jsonRes);
        cfg.owner = vm.envOr("REGISTRAR_OWNER", vm.envOr("TREASURY_OWNER", address(0)));
        cfg.treasurer = vm.envOr("ENS_TREASURER_ADDRESS", cfg.owner);
        uint256 nameDur = vm.envOr("NAME_DURATION_SECONDS", uint256(365 days));
        uint256 consDur = vm.envOr("CONSUMER_DURATION_SECONDS", uint256(30 days));
        require(cfg.registry != address(0), "ENS_TOWN_REGISTRY missing (env or packages/ens/town.json)");
        require(cfg.resolver != address(0), "ENS_TOWN_RESOLVER missing");
        require(cfg.owner != address(0), "REGISTRAR_OWNER or TREASURY_OWNER required");
        require(cfg.treasurer != address(0), "ENS_TREASURER_ADDRESS / owner required");
        require(nameDur > 0 && nameDur <= type(uint64).max, "NAME_DURATION_SECONDS");
        require(consDur > 0 && consDur <= type(uint64).max, "CONSUMER_DURATION_SECONDS");
        // forge-lint: disable-next-line(unsafe-typecast)
        cfg.nameDuration = uint64(nameDur);
        // forge-lint: disable-next-line(unsafe-typecast)
        cfg.consumerDuration = uint64(consDur);
    }

    function _readTownJson() internal view returns (address registry, address resolver, string memory label) {
        string memory path = "../ens/town.json";
        if (!vm.exists(path)) return (address(0), address(0), "");
        string memory json = vm.readFile(path);
        if (vm.keyExistsJson(json, ".contracts.TownRegistry")) {
            registry = vm.parseJsonAddress(json, ".contracts.TownRegistry");
        }
        if (vm.keyExistsJson(json, ".contracts.TownResolver")) {
            resolver = vm.parseJsonAddress(json, ".contracts.TownResolver");
        }
        if (vm.keyExistsJson(json, ".label")) {
            label = vm.parseJsonString(json, ".label");
        }
    }

    function _log(Config memory cfg) internal view {
        console.log("chainId           %s", block.chainid);
        console.log("townLabel         %s", cfg.townLabel);
        console.log("TownRegistry      %s", cfg.registry);
        console.log("TownResolver      %s", cfg.resolver);
        console.log("owner             %s", cfg.owner);
        console.log("treasurer         %s", cfg.treasurer);
        console.log("nameDuration      %s", cfg.nameDuration);
        console.log("consumerDuration  %s", cfg.consumerDuration);
        console.log("no tokenIds in constructor / storage (R3)");
    }

    function _logGrantPlan(address registrar, Config memory cfg) internal pure {
        console.log("");
        console.log("Treasurer %s must grant (do not broadcast from this script):", cfg.treasurer);
        console.log("  registry.grantRootRoles(ROLE_REGISTRAR | ROLE_RENEW, registrar)");
        console.log("    bitmap %s  to %s  on %s", ROLE_REGISTRAR_AND_RENEW, registrar, cfg.registry);
        console.log("  resolver.grantRootRoles(ROLE_SET_TEXT(+ADMIN) | ROLE_SET_ADDRESS(+ADMIN), registrar)");
        console.log("    bitmap %s  to %s  on %s", RESOLVER_REGISTRAR_ROLES, registrar, cfg.resolver);
    }

    function _simulateGrants(address registrar, Config memory cfg) internal {
        console.log("");
        console.log("Simulating treasurer grants via RPC eth_call (NOTHING is broadcast).");
        console.log("Hackathon ENS bytecode uses PUSH0; local paris EVM cannot execute the proxies.");
        _simGrant(cfg.registry, cfg.treasurer, ROLE_REGISTRAR_AND_RENEW, registrar, "registry");
        _simGrant(cfg.resolver, cfg.treasurer, RESOLVER_REGISTRAR_ROLES, registrar, "resolver");
    }

    function _simGrant(address target, address from, uint256 bitmap, address to, string memory tag) internal {
        bytes memory payload = abi.encodeWithSelector(ITownRegistry.grantRootRoles.selector, bitmap, to);
        string memory params = string.concat(
            '[{"from":"',
            vm.toString(from),
            '","to":"',
            vm.toString(target),
            '","data":"',
            vm.toString(payload),
            '"},"latest"]'
        );
        try vm.rpc("eth_call", params) returns (bytes memory res) {
            console.log("  %s.grantRootRoles     eth_call %s", tag, vm.toString(res));
        } catch {
            console.log("  %s.grantRootRoles     eth_call skipped (no RPC)", tag);
        }
    }
}
