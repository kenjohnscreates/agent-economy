// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TownRegistrar} from "../src/TownRegistrar.sol";
import {DnsCodec, ITownRegistry, ITownResolver, RegistryRoles, ResolverRoles} from "../src/ens/HackathonEns.sol";
import {MockTownRegistry} from "./mocks/MockTownRegistry.sol";
import {MockTownResolver} from "./mocks/MockTownResolver.sol";

/// @dev M2.4 encoding: bank.botanica.eth DNS + inode linkToNode (ROLE_LINK). No tokenIds (R3).
contract BankAliasEncodingTest is Test {
    uint64 constant NAME_DUR = 365 days;
    uint64 constant CONSUMER_DUR = 30 days;

    MockTownRegistry registry;
    MockTownResolver resolver;
    TownRegistrar registrar;

    address owner = makeAddr("owner");
    address treasurer = makeAddr("treasurer");
    address adaWallet = makeAddr("adaWallet");

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
                | ResolverRoles.ROLE_SET_ADDRESS_ADMIN | ResolverRoles.ROLE_LINK,
            address(registrar)
        );
        vm.warp(1_700_000_000);
    }

    function test_RoleLink_IsBit28() public pure {
        assertEq(ResolverRoles.ROLE_LINK, 1 << 28);
    }

    function test_DnsEncode_BankBotanicaEth() public view {
        assertEq(DnsCodec.encodeTownName("bank", "botanica"), hex"0462616e6b08626f74616e6963610365746800");
        assertEq(registrar.dnsName("bank"), hex"0462616e6b08626f74616e6963610365746800");
    }

    function test_Namehash_AdaBotanicaEth() public pure {
        assertEq(namehash("ada.botanica.eth"), 0xa976f2110c164348f21b3e671855a2cb8d6a3a048e294f15c29d05e3f508c40b);
        assertEq(namehash("bank.botanica.eth"), 0x731b1b636831e64c5904f1a8e5456faa86906ec87cadd567a36c76b823bfae8c);
    }

    function test_LinkToNode_Selector() public pure {
        assertEq(ITownResolver.linkToNode.selector, bytes4(keccak256("linkToNode(bytes,bytes32)")));
        assertTrue(ITownResolver.linkToNode.selector != bytes4(keccak256("setAlias(bytes,bytes)")));
    }

    function test_RegisterBank_ThenLinkToAda_NoTokenIdStorage() public {
        vm.prank(owner);
        uint256 adaId = registrar.register("ada", adaWallet, TownRegistrar.Role.Treasurer);
        bytes memory adaDns = registrar.dnsName("ada");
        bytes memory packed = abi.encodePacked(adaWallet);
        resolver.setAddress(adaDns, 2_152_525_650, packed);
        resolver.setAddress(adaDns, 60, packed);

        vm.prank(owner);
        uint256 bankId = registrar.register("bank", adaWallet, TownRegistrar.Role.Treasurer);
        bytes32 adaNode = namehash("ada.botanica.eth");
        resolver.linkToNode(registrar.dnsName("bank"), adaNode);

        assertEq(resolver.linkedNode(keccak256(registrar.dnsName("bank"))), adaNode);
        assertTrue(adaId != 0 && bankId != 0);
        uint256 afterGrant = registry.getState(uint256(keccak256("bank"))).tokenId;
        registry.grantRoles(uint256(keccak256("bank")), RegistryRoles.ROLE_RENEW, owner);
        assertTrue(registry.getState(uint256(keccak256("bank"))).tokenId != afterGrant, "tokenId must change (R3)");
    }

    function namehash(string memory name) internal pure returns (bytes32 node) {
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
