// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {TownRegistrar} from "../src/TownRegistrar.sol";
import {ITownRegistry, ITownResolver, DnsCodec, ResolverRoles} from "../src/ens/HackathonEns.sol";

/// @title RecordBankAlias
/// @notice Registers `bank.botanica.eth` and `linkToNode` → ada treasurer records (M2.4).
/// @dev Dry-run by default. `--broadcast` is refused unless `ALLOW_BROADCAST=true`.
///      Never writes tokenIds (R3). Sepolia eth_call against hackathon proxies needs
///      `--evm-version cancun` (paris local EVM: NotActivated on PUSH0 proxyLogic).
///
///      Usage:
///        forge script script/RecordBankAlias.s.sol --rpc-url $SEPOLIA_RPC_URL --evm-version cancun
///        ALLOW_BROADCAST=true forge script script/RecordBankAlias.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast --evm-version cancun
contract RecordBankAlias is Script {
    uint256 internal constant COIN_TYPE_ARC = 2_152_525_650;
    uint256 internal constant COIN_TYPE_ETH = 60;

    struct Config {
        address registry;
        address resolver;
        address registrar;
        address adaWallet;
        string townLabel;
    }

    function run() external {
        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast) && !vm.envOr("ALLOW_BROADCAST", false)) {
            revert("refusing --broadcast: set ALLOW_BROADCAST=true (this PR is dry-run only)");
        }

        Config memory cfg = _readConfig();
        bytes memory bankDns = DnsCodec.encodeTownName("bank", cfg.townLabel);
        bytes32 adaNode = _namehash(string.concat("ada.", cfg.townLabel, ".eth"));
        bytes32 bankNode = _namehash(string.concat("bank.", cfg.townLabel, ".eth"));
        if (cfg.registrar.code.length == 0) {
            console.log("no TownRegistrar code on this RPC - print plan only (use --fork-url sepolia or TS script)");
            console.log("bank dns");
            console.logBytes(bankDns);
            console.log("ada node (namehash ada.%s.eth)", cfg.townLabel);
            console.logBytes32(adaNode);
            console.log("Dry run: register(bank) + linkToNode not broadcast");
            return;
        }

        address owner = TownRegistrar(cfg.registrar).owner();

        console.log("chainId        %s", block.chainid);
        console.log("townLabel      %s", cfg.townLabel);
        console.log("TownRegistry   %s", cfg.registry);
        console.log("TownResolver   %s", cfg.resolver);
        console.log("TownRegistrar  %s", cfg.registrar);
        console.log("registrar.owner (ROLE_LINK signer) %s", owner);
        console.log("ada wallet     %s", cfg.adaWallet);
        console.log("alias          linkToNode(bank -> ada)");
        console.log("ROLE_LINK      %s", ResolverRoles.ROLE_LINK);
        console.log("no tokenIds persisted (R3)");

        ITownRegistry.State memory ada = ITownRegistry(cfg.registry).getState(uint256(keccak256("ada")));
        console.log("ada tokenId (live, NOT persisted R3) %s", ada.tokenId);
        uint256 adaRecord = ITownResolver(cfg.resolver).getRecordId(adaNode);
        console.log("ada getRecordId %s", adaRecord);

        _logResolve("ada", DnsCodec.encodeTownName("ada", cfg.townLabel), adaNode);
        _logResolve("bank", bankDns, bankNode);

        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
            vm.startBroadcast();
            uint256 anyId = uint256(keccak256("bank"));
            ITownRegistry.State memory before = ITownRegistry(cfg.registry).getState(anyId);
            if (before.status != ITownRegistry.Status.REGISTERED) {
                TownRegistrar(cfg.registrar).register("bank", ada.latestOwner, TownRegistrar.Role.Treasurer);
            }
            ITownRegistry.State memory live = ITownRegistry(cfg.registry).getState(anyId);
            console.log("bank tokenId (live, NOT persisted R3) %s", live.tokenId);
            ITownResolver(cfg.resolver).linkToNode(bankDns, adaNode);
            vm.stopBroadcast();
        } else {
            console.log("Dry run: register(bank) + linkToNode not broadcast");
            console.logBytes(bankDns);
            console.log("ada node");
            console.logBytes32(adaNode);
        }
    }

    function _logResolve(string memory tag, bytes memory dns, bytes32 node) internal view {
        address ur = _readUr();
        if (ur == address(0) || ur.code.length == 0) {
            console.log("%s UR.resolve skip (no UR code)", tag);
            return;
        }
        bytes memory callArc = abi.encodeWithSignature("addr(bytes32,uint256)", node, COIN_TYPE_ARC);
        bytes memory callEth = abi.encodeWithSignature("addr(bytes32,uint256)", node, COIN_TYPE_ETH);
        (bool okA, bytes memory resA) = ur.staticcall(abi.encodeWithSignature("resolve(bytes,bytes)", dns, callArc));
        (bool okE, bytes memory resE) = ur.staticcall(abi.encodeWithSignature("resolve(bytes,bytes)", dns, callEth));
        console.log("%s resolve(Arc) ok=%s", tag, okA);
        console.logBytes(resA);
        console.log("%s resolve(60)  ok=%s", tag, okE);
        console.logBytes(resE);
    }

    function _readConfig() internal view returns (Config memory cfg) {
        (address jsonReg, address jsonRes, address jsonRegar, string memory jsonLabel) = _readTownJson();
        cfg.townLabel = vm.envOr("ENS_TOWN_NAME", jsonLabel);
        if (bytes(cfg.townLabel).length == 0) cfg.townLabel = "botanica";
        cfg.registry = vm.envOr("ENS_TOWN_REGISTRY", jsonReg);
        cfg.resolver = vm.envOr("ENS_TOWN_RESOLVER", jsonRes);
        cfg.registrar = vm.envOr("ENS_TOWN_REGISTRAR", jsonRegar);
        cfg.adaWallet = _readAdaWallet();
        require(cfg.registry != address(0), "ENS_TOWN_REGISTRY missing");
        require(cfg.resolver != address(0), "ENS_TOWN_RESOLVER missing");
        require(cfg.registrar != address(0), "ENS_TOWN_REGISTRAR missing");
        require(cfg.adaWallet != address(0), "roster.json missing ada");
    }

    function _readTownJson()
        internal
        view
        returns (address registry, address resolver, address registrar, string memory label)
    {
        string memory path = "../ens/town.json";
        if (!vm.exists(path)) return (address(0), address(0), address(0), "");
        string memory json = vm.readFile(path);
        if (vm.keyExistsJson(json, ".contracts.TownRegistry")) {
            registry = vm.parseJsonAddress(json, ".contracts.TownRegistry");
        }
        if (vm.keyExistsJson(json, ".contracts.TownResolver")) {
            resolver = vm.parseJsonAddress(json, ".contracts.TownResolver");
        }
        if (vm.keyExistsJson(json, ".contracts.TownRegistrar")) {
            registrar = vm.parseJsonAddress(json, ".contracts.TownRegistrar");
        }
        if (vm.keyExistsJson(json, ".label")) {
            label = vm.parseJsonString(json, ".label");
        }
    }

    function _readAdaWallet() internal view returns (address wallet) {
        string memory json = vm.readFile("../circle/roster.json");
        for (uint256 i; i < 9; i++) {
            string memory idx = vm.toString(i);
            string memory n = vm.parseJsonString(json, string.concat(".wallets[", idx, "].name"));
            if (keccak256(bytes(n)) == keccak256("ada")) {
                return vm.parseJsonAddress(json, string.concat(".wallets[", idx, "].address"));
            }
        }
    }

    function _readUr() internal view returns (address ur) {
        string memory path = "../ens/deployments.json";
        if (!vm.exists(path)) return address(0);
        string memory json = vm.readFile(path);
        if (vm.keyExistsJson(json, ".contracts.UpgradableUniversalResolverProxy")) {
            ur = vm.parseJsonAddress(json, ".contracts.UpgradableUniversalResolverProxy");
        }
    }

    function _namehash(string memory name) internal pure returns (bytes32 node) {
        bytes memory s = bytes(name);
        uint256 end = s.length;
        while (end > 0) {
            uint256 start = end;
            while (start > 0 && s[start - 1] != ".") start--;
            bytes memory label = new bytes(end - start);
            for (uint256 j; j < label.length; j++) {
                label[j] = s[start + j];
            }
            node = keccak256(abi.encodePacked(node, keccak256(label)));
            end = start == 0 ? 0 : start - 1;
        }
    }
}
