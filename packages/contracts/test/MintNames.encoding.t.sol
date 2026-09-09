// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TownRegistrar} from "../src/TownRegistrar.sol";
import {DnsCodec, ITownRegistry, ITownResolver, RegistryRoles, ResolverRoles} from "../src/ens/HackathonEns.sol";
import {MockTownRegistry} from "./mocks/MockTownRegistry.sol";
import {MockTownResolver} from "./mocks/MockTownResolver.sol";

/// @dev M2.3 encoding: ENSIP-11 coinType, DNS wire names, shared ROSTER → Role enum.
contract MintNamesEncodingTest is Test {
    uint64 constant NAME_DUR = 365 days;
    uint64 constant CONSUMER_DUR = 30 days;

    MockTownRegistry registry;
    MockTownResolver resolver;
    TownRegistrar registrar;

    address owner = makeAddr("owner");
    address treasurer = makeAddr("treasurer");

    function setUp() public {
        registry = new MockTownRegistry(address(this));
        resolver = new MockTownResolver(address(this));
        registrar = new TownRegistrar(
            ITownRegistry(address(registry)),
            ITownResolver(address(resolver)),
            owner,
            treasurer,
            "botanica",
            NAME_DUR,
            CONSUMER_DUR
        );
        registry.grantRootRoles(RegistryRoles.ROLE_REGISTRAR | RegistryRoles.ROLE_RENEW, address(registrar));
        resolver.grantRootRoles(
            ResolverRoles.ROLE_SET_TEXT | ResolverRoles.ROLE_SET_TEXT_ADMIN | ResolverRoles.ROLE_SET_ADDRESS
                | ResolverRoles.ROLE_SET_ADDRESS_ADMIN,
            address(registrar)
        );
        vm.warp(1_700_000_000);
    }

    function test_ArcCoinType_Ensip11() public pure {
        assertEq(uint256(0x80000000) | 5_042_002, 2_152_525_650);
    }

    function test_DnsEncode_AdaBotanicaEth() public view {
        assertEq(DnsCodec.encodeTownName("ada", "botanica"), hex"0361646108626f74616e6963610365746800");
        assertEq(registrar.dnsName("ada"), hex"0361646108626f74616e6963610365746800");
    }

    function test_DnsEncode_EightRosterNames() public view {
        string[8] memory names = ["ada", "bo", "cy", "dee", "eli", "fay", "gus", "hal"];
        for (uint256 i; i < 8; i++) {
            bytes memory dns = DnsCodec.encodeTownName(names[i], "botanica");
            assertEq(uint8(dns[dns.length - 5]), 3);
            assertEq(uint8(dns[dns.length - 1]), 0);
            assertEq(registrar.dnsName(names[i]), dns);
        }
    }

    function test_RosterRoleMapping_EightAgents() public {
        _reg("ada", TownRegistrar.Role.Treasurer);
        _reg("bo", TownRegistrar.Role.Merchant);
        _reg("cy", TownRegistrar.Role.Merchant);
        _reg("dee", TownRegistrar.Role.Worker);
        _reg("eli", TownRegistrar.Role.Worker);
        _reg("fay", TownRegistrar.Role.Worker);
        _reg("gus", TownRegistrar.Role.Consumer);
        _reg("hal", TownRegistrar.Role.Consumer);

        assertEq(resolver.text(registrar.dnsName("ada"), "town.role"), "treasurer");
        assertEq(resolver.text(registrar.dnsName("bo"), "town.role"), "merchant");
        assertEq(resolver.text(registrar.dnsName("cy"), "town.role"), "merchant");
        assertEq(resolver.text(registrar.dnsName("dee"), "town.role"), "worker");
        assertEq(resolver.text(registrar.dnsName("eli"), "town.role"), "worker");
        assertEq(resolver.text(registrar.dnsName("fay"), "town.role"), "worker");
        assertEq(resolver.text(registrar.dnsName("gus"), "town.role"), "consumer");
        assertEq(resolver.text(registrar.dnsName("hal"), "town.role"), "consumer");

        uint256 adaId = uint256(keccak256("ada"));
        uint256 afterGrant = registry.getState(adaId).tokenId;
        registry.grantRoles(adaId, RegistryRoles.ROLE_RENEW, owner);
        assertTrue(registry.getState(adaId).tokenId != afterGrant, "tokenId must change after grant (R3)");
    }

    function test_SetAddress_ArcAndEthCoinTypes() public {
        _reg("ada", TownRegistrar.Role.Treasurer);
        address wallet = makeAddr("adaWallet");
        bytes memory dns = registrar.dnsName("ada");
        bytes memory packed = abi.encodePacked(wallet);
        resolver.setAddress(dns, 2_152_525_650, packed);
        resolver.setAddress(dns, 60, packed);
        assertEq(resolver.addr(dns, 2_152_525_650), packed);
        assertEq(resolver.addr(dns, 60), packed);
        assertEq(resolver.text(dns, "town.credit-score"), "");
    }

    function _reg(string memory label, TownRegistrar.Role role) internal {
        vm.prank(owner);
        registrar.register(label, makeAddr(label), role);
    }
}
