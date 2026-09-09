// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {TownRegistrar} from "../src/TownRegistrar.sol";
import {ITownRegistry, ITownResolver, DnsCodec, RegistryRoles, ResolverRoles} from "../src/ens/HackathonEns.sol";

/// @title MintAgentNames
/// @notice Mints ada|bo|cy|dee|eli|fay|gus|hal under botanica.eth and sets §4.4 records.
/// @dev Dry-run by default. `--broadcast` is refused unless `ALLOW_BROADCAST=true`.
///      Never writes tokenIds (R3) — re-reads `getState(labelhash)` after grants/register.
///      Env: ENS_TOWN_REGISTRY, ENS_TOWN_RESOLVER, ENS_TOWN_REGISTRAR (deploy if unset),
///      REGISTRAR_OWNER / TREASURY_OWNER, ENS_TREASURER_ADDRESS, PUBLIC_APP_URL,
///      NAME_DURATION_SECONDS, CONSUMER_DURATION_SECONDS, ALLOW_BROADCAST.
///
///      Usage:
///        forge script script/MintAgentNames.s.sol --rpc-url $SEPOLIA_RPC_URL --evm-version paris
///        ALLOW_BROADCAST=true forge script script/MintAgentNames.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast --evm-version paris
contract MintAgentNames is Script {
    uint256 internal constant ROLE_REGISTRAR_AND_RENEW = RegistryRoles.ROLE_REGISTRAR | RegistryRoles.ROLE_RENEW;
    uint256 internal constant RESOLVER_REGISTRAR_ROLES = ResolverRoles.ROLE_SET_TEXT | ResolverRoles.ROLE_SET_TEXT_ADMIN
        | ResolverRoles.ROLE_SET_ADDRESS | ResolverRoles.ROLE_SET_ADDRESS_ADMIN;
    uint256 internal constant COIN_TYPE_ARC = 2_152_525_650;
    uint256 internal constant COIN_TYPE_ETH = 60;

    string[8] internal NAMES = ["ada", "bo", "cy", "dee", "eli", "fay", "gus", "hal"];

    struct Config {
        address registry;
        address resolver;
        address registrar;
        address owner;
        address treasurer;
        string townLabel;
        string appOrigin;
        uint64 nameDuration;
        uint64 consumerDuration;
    }

    function run() external {
        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast) && !vm.envOr("ALLOW_BROADCAST", false)) {
            revert("refusing --broadcast: set ALLOW_BROADCAST=true (this PR is dry-run only)");
        }

        Config memory cfg = _readConfig();
        address[] memory wallets = _readWallets();
        _log(cfg);

        TownRegistrar registrar;
        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
            vm.startBroadcast();
            registrar = _ensureRegistrar(cfg);
            cfg.registrar = address(registrar);
            ITownRegistry(cfg.registry).grantRootRoles(ROLE_REGISTRAR_AND_RENEW, cfg.registrar);
            ITownResolver(cfg.resolver).grantRootRoles(RESOLVER_REGISTRAR_ROLES, cfg.registrar);
            _rereadParent(cfg);
            for (uint256 i; i < 8; i++) {
                _mintOne(cfg, registrar, NAMES[i], wallets[i]);
            }
            vm.stopBroadcast();
        } else {
            registrar = _ensureRegistrar(cfg);
            cfg.registrar = address(registrar);
            console.log("TownRegistrar %s (simulated)", cfg.registrar);
            console.log("grant plan: registry.grantRootRoles(%s, registrar)", ROLE_REGISTRAR_AND_RENEW);
            console.log("grant plan: resolver.grantRootRoles(%s, registrar)", RESOLVER_REGISTRAR_ROLES);
            console.log("Dry run: grants + register + setAddress/setText not broadcast");
            _rereadParent(cfg);
            for (uint256 i; i < 8; i++) {
                bytes memory dns = DnsCodec.encodeTownName(NAMES[i], cfg.townLabel);
                console.log("name %s wallet %s", NAMES[i], wallets[i]);
                console.logBytes(dns);
            }
        }
        console.log("TownRegistrar %s", cfg.registrar);
    }

    function _ensureRegistrar(Config memory cfg) internal returns (TownRegistrar registrar) {
        if (cfg.registrar != address(0)) {
            return TownRegistrar(cfg.registrar);
        }
        registrar = new TownRegistrar(
            ITownRegistry(cfg.registry),
            ITownResolver(cfg.resolver),
            cfg.owner,
            cfg.treasurer,
            cfg.townLabel,
            cfg.nameDuration,
            cfg.consumerDuration
        );
        if (!vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
            console.log("Dry run: TownRegistrar simulated at %s (not broadcast)", address(registrar));
        }
    }

    function _mintOne(Config memory cfg, TownRegistrar registrar, string memory name, address wallet) internal {
        uint256 anyId = uint256(keccak256(bytes(name)));
        ITownRegistry.State memory before = ITownRegistry(cfg.registry).getState(anyId);
        if (before.status != ITownRegistry.Status.REGISTERED) {
            registrar.register(name, wallet, _roleOf(name));
        }
        ITownRegistry.State memory live = ITownRegistry(cfg.registry).getState(anyId);
        console.log("  %s tokenId (live, NOT persisted R3) %s", name, live.tokenId);

        bytes memory dns = DnsCodec.encodeTownName(name, cfg.townLabel);
        bytes memory packed = abi.encodePacked(wallet);
        ITownResolver res = ITownResolver(cfg.resolver);
        res.setAddress(dns, COIN_TYPE_ARC, packed);
        res.setAddress(dns, COIN_TYPE_ETH, packed);
        res.setText(dns, "agent-context", _context(cfg, name, wallet));
        res.setText(dns, "town.role", _roleName(name));
        res.setText(dns, "avatar", string.concat(cfg.appOrigin, "/sprites/", name, ".png"));
    }

    function _rereadParent(Config memory cfg) internal view {
        address ethRegistry = _readEthRegistry();
        if (ethRegistry == address(0) || ethRegistry.code.length == 0) {
            console.log("parent tokenId skip (no ETHRegistry code on this RPC)");
            return;
        }
        uint256 anyId = uint256(keccak256(bytes(cfg.townLabel)));
        ITownRegistry.State memory st = ITownRegistry(ethRegistry).getState(anyId);
        console.log("parent %s.eth tokenId after grants (NOT persisted R3) %s", cfg.townLabel, st.tokenId);
    }

    function _readEthRegistry() internal view returns (address ethRegistry) {
        string memory path = "../ens/deployments.json";
        if (!vm.exists(path)) return address(0);
        string memory json = vm.readFile(path);
        if (vm.keyExistsJson(json, ".contracts.ETHRegistry")) {
            ethRegistry = vm.parseJsonAddress(json, ".contracts.ETHRegistry");
        }
    }

    function _readConfig() internal view returns (Config memory cfg) {
        (address jsonReg, address jsonRes, address jsonRegar, string memory jsonLabel) = _readTownJson();
        cfg.townLabel = vm.envOr("ENS_TOWN_NAME", jsonLabel);
        if (bytes(cfg.townLabel).length == 0) cfg.townLabel = "botanica";
        cfg.registry = vm.envOr("ENS_TOWN_REGISTRY", jsonReg);
        cfg.resolver = vm.envOr("ENS_TOWN_RESOLVER", jsonRes);
        cfg.registrar = vm.envOr("ENS_TOWN_REGISTRAR", jsonRegar);
        cfg.owner = vm.envOr("REGISTRAR_OWNER", vm.envOr("TREASURY_OWNER", address(0)));
        cfg.treasurer = vm.envOr("ENS_TREASURER_ADDRESS", cfg.owner);
        cfg.appOrigin = vm.envOr("PUBLIC_APP_URL", string("http://localhost:3000"));
        uint256 nameDur = vm.envOr("NAME_DURATION_SECONDS", uint256(365 days));
        uint256 consDur = vm.envOr("CONSUMER_DURATION_SECONDS", uint256(30 days));
        require(cfg.registry != address(0), "ENS_TOWN_REGISTRY missing");
        require(cfg.resolver != address(0), "ENS_TOWN_RESOLVER missing");
        if (cfg.registrar == address(0)) {
            require(cfg.owner != address(0), "REGISTRAR_OWNER or TREASURY_OWNER required to deploy");
        }
        // forge-lint: disable-next-line(unsafe-typecast)
        cfg.nameDuration = uint64(nameDur);
        // forge-lint: disable-next-line(unsafe-typecast)
        cfg.consumerDuration = uint64(consDur);
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

    function _readWallets() internal view returns (address[] memory wallets) {
        string memory json = vm.readFile("../circle/roster.json");
        wallets = new address[](8);
        for (uint256 i; i < 9; i++) {
            string memory idx = vm.toString(i);
            string memory n = vm.parseJsonString(json, string.concat(".wallets[", idx, "].name"));
            address a = vm.parseJsonAddress(json, string.concat(".wallets[", idx, "].address"));
            for (uint256 j; j < 8; j++) {
                if (_eq(n, NAMES[j])) wallets[j] = a;
            }
        }
        for (uint256 j; j < 8; j++) {
            require(wallets[j] != address(0), "roster.json missing agent wallet");
        }
    }

    function _log(Config memory cfg) internal view {
        console.log("chainId        %s", block.chainid);
        console.log("townLabel      %s", cfg.townLabel);
        console.log("TownRegistry   %s", cfg.registry);
        console.log("TownResolver   %s", cfg.resolver);
        console.log("TownRegistrar  %s", cfg.registrar);
        console.log("no tokenIds persisted (R3)");
    }

    function _roleOf(string memory name) internal pure returns (TownRegistrar.Role) {
        if (_eq(name, "ada")) return TownRegistrar.Role.Treasurer;
        if (_eq(name, "bo") || _eq(name, "cy")) return TownRegistrar.Role.Merchant;
        if (_eq(name, "dee") || _eq(name, "eli") || _eq(name, "fay")) return TownRegistrar.Role.Worker;
        if (_eq(name, "gus") || _eq(name, "hal")) return TownRegistrar.Role.Consumer;
        revert InvalidLabel();
    }

    function _roleName(string memory name) internal pure returns (string memory) {
        if (_eq(name, "ada")) return "treasurer";
        if (_eq(name, "bo") || _eq(name, "cy")) return "merchant";
        if (_eq(name, "dee") || _eq(name, "eli") || _eq(name, "fay")) return "worker";
        return "consumer";
    }

    function _context(Config memory cfg, string memory name, address wallet) internal pure returns (string memory) {
        return string.concat(
            "# ",
            name,
            ".",
            cfg.townLabel,
            ".eth\n\n- role: ",
            _roleName(name),
            "\n- town: ",
            cfg.townLabel,
            "\n- chain: Arc Testnet (5042002)\n- wallet: ",
            vm.toString(wallet),
            "\n- endpoint[web]: ",
            cfg.appOrigin,
            "/agents/",
            name,
            "\n- registry: ",
            vm.toString(cfg.registry),
            "\n- resolver: ",
            vm.toString(cfg.resolver)
        );
    }

    function _eq(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }

    error InvalidLabel();
}
