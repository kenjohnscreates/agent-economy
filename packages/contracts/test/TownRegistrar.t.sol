// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TownRegistrar} from "../src/TownRegistrar.sol";
import {ITownRegistry, ITownResolver, RegistryRoles, ResolverRoles} from "../src/ens/HackathonEns.sol";
import {MockTownRegistry} from "./mocks/MockTownRegistry.sol";
import {MockTownResolver} from "./mocks/MockTownResolver.sol";

contract TownRegistrarTest is Test {
    uint64 constant NAME_DUR = 365 days;
    uint64 constant CONSUMER_DUR = 30 days;

    MockTownRegistry registry;
    MockTownResolver resolver;
    TownRegistrar registrar;

    address owner = makeAddr("owner");
    address treasurer = makeAddr("treasurer");
    address merchant = makeAddr("merchant");
    address worker = makeAddr("worker");
    address consumer = makeAddr("consumer");
    address rando = makeAddr("rando");

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

    function _dns(string memory label) internal view returns (bytes memory) {
        return registrar.dnsName(label);
    }

    function _register(string memory label, address who, TownRegistrar.Role role) internal returns (uint256 tokenId) {
        vm.prank(owner);
        tokenId = registrar.register(label, who, role);
    }

    // ─── 1. Negative: worker cannot set town.credit-score; treasurer can ─────────

    function test_WorkerCannotSetCreditScore_TreasurerCan() public {
        _register("ada", worker, TownRegistrar.Role.Worker);
        bytes memory name = _dns("ada");

        vm.prank(worker);
        vm.expectRevert(
            abi.encodeWithSelector(
                ITownResolver.EACUnauthorizedAccountRoles.selector,
                uint256(keccak256(bytes("town.credit-score"))),
                ResolverRoles.ROLE_SET_TEXT,
                worker
            )
        );
        resolver.setText(name, "town.credit-score", "12");

        vm.prank(treasurer);
        resolver.setText(name, "town.credit-score", "88");
        assertEq(resolver.text(name, "town.credit-score"), "88");
    }

    // ─── 2. Worker name is non-transferable ──────────────────────────────────────

    function test_WorkerName_TransferReverts() public {
        uint256 tokenId = _register("bo", worker, TownRegistrar.Role.Worker);
        vm.prank(worker);
        vm.expectRevert(abi.encodeWithSelector(ITownRegistry.TransferDisallowed.selector, tokenId, worker));
        registry.safeTransferFrom(worker, rando, tokenId, 1, "");
        assertEq(registry.ownerOf(tokenId), worker);
    }

    function test_MerchantName_IsTransferable() public {
        uint256 tokenId = _register("cy", merchant, TownRegistrar.Role.Merchant);
        vm.prank(merchant);
        registry.safeTransferFrom(merchant, rando, tokenId, 1, "");
        assertEq(registry.ownerOf(tokenId), rando);
    }

    // ─── 3. Consumer expiry is shorter ───────────────────────────────────────────

    function test_ConsumerExpiry_ShorterThanOthers() public {
        uint256 w = _register("dee", worker, TownRegistrar.Role.Worker);
        _register("eli", merchant, TownRegistrar.Role.Merchant);
        _register("mayor", treasurer, TownRegistrar.Role.Treasurer);
        uint256 c = _register("fay", consumer, TownRegistrar.Role.Consumer);

        uint64 wExp = registry.getExpiry(uint256(keccak256("dee")));
        uint64 mExp = registry.getExpiry(uint256(keccak256("eli")));
        uint64 tExp = registry.getExpiry(uint256(keccak256("mayor")));
        uint64 cExp = registry.getExpiry(uint256(keccak256("fay")));

        assertEq(wExp, uint64(block.timestamp) + NAME_DUR);
        assertEq(mExp, uint64(block.timestamp) + NAME_DUR);
        assertEq(tExp, uint64(block.timestamp) + NAME_DUR);
        assertEq(cExp, uint64(block.timestamp) + CONSUMER_DUR);
        assertLt(cExp, wExp);
        assertLt(cExp, mExp);
        assertLt(cExp, tExp);
        assertTrue(w != 0 && c != 0);
    }

    function test_Consumer_RenewableByRegistrarViaLabelhash() public {
        _register("gus", consumer, TownRegistrar.Role.Consumer);
        uint256 anyId = uint256(keccak256("gus"));
        uint64 before = registry.getExpiry(anyId);
        vm.prank(owner);
        registrar.renew("gus", CONSUMER_DUR);
        assertEq(registry.getExpiry(anyId), before + CONSUMER_DUR);
    }

    // ─── 4. Merchant can set town.price; worker cannot ───────────────────────────

    function test_MerchantCanSetPrice_WorkerCannot() public {
        _register("hal", merchant, TownRegistrar.Role.Merchant);
        _register("ada", worker, TownRegistrar.Role.Worker);
        bytes memory merchName = _dns("hal");
        bytes memory workName = _dns("ada");

        vm.prank(merchant);
        resolver.setText(merchName, "town.price", "1500000");
        assertEq(resolver.text(merchName, "town.price"), "1500000");

        vm.prank(worker);
        vm.expectRevert(
            abi.encodeWithSelector(
                ITownResolver.EACUnauthorizedAccountRoles.selector,
                uint256(keccak256(bytes("town.price"))),
                ResolverRoles.ROLE_SET_TEXT,
                worker
            )
        );
        resolver.setText(workName, "town.price", "1");
    }

    function test_WorkerCanSetDescription_NotCreditScore() public {
        _register("ada", worker, TownRegistrar.Role.Worker);
        bytes memory name = _dns("ada");
        vm.prank(worker);
        resolver.setText(name, "description", "weaver");
        assertEq(resolver.text(name, "description"), "weaver");
        assertEq(resolver.text(name, "town.role"), "worker");
    }

    // ─── 5. register does not store tokenIds ─────────────────────────────────────

    function test_Register_DoesNotStoreTokenIds() public {
        uint256 tokenId = _register("ada", worker, TownRegistrar.Role.Worker);
        for (uint256 slot; slot < 32; slot++) {
            uint256 word = uint256(vm.load(address(registrar), bytes32(slot)));
            assertTrue(word != tokenId, "tokenId persisted in registrar storage");
        }

        // Role grant regenerates tokenId (R3). Registrar still operates via labelhash.
        uint256 labelhash = uint256(keccak256("ada"));
        uint256 before = registry.getState(labelhash).tokenId;
        assertEq(before, tokenId);
        registry.grantRoles(labelhash, RegistryRoles.ROLE_RENEW, owner);
        uint256 afterId = registry.getState(labelhash).tokenId;
        assertTrue(afterId != before, "tokenId must change after grant");
        vm.prank(owner);
        registrar.renew("ada", 1 days);
        assertEq(registry.getState(labelhash).tokenId, afterId);
    }

    function test_Register_OnlyOwner() public {
        vm.prank(rando);
        vm.expectRevert();
        registrar.register("ada", worker, TownRegistrar.Role.Worker);
    }

    function test_TreasurerGetsCreditScoreOnEveryName() public {
        _register("bo", merchant, TownRegistrar.Role.Merchant);
        uint256 resource = uint256(keccak256(bytes("town.credit-score")));
        assertTrue(resolver.hasRoles(resource, ResolverRoles.ROLE_SET_TEXT, treasurer));
    }

    function test_Constructor_RevertsOnBadInputs() public {
        vm.expectRevert(TownRegistrar.ZeroAddress.selector);
        new TownRegistrar(
            ITownRegistry(address(0)),
            ITownResolver(address(resolver)),
            owner,
            treasurer,
            "botanica",
            NAME_DUR,
            CONSUMER_DUR
        );
        vm.expectRevert(TownRegistrar.ConsumerDurationNotShorter.selector);
        new TownRegistrar(
            ITownRegistry(address(registry)),
            ITownResolver(address(resolver)),
            owner,
            treasurer,
            "botanica",
            CONSUMER_DUR,
            NAME_DUR
        );
    }

    function test_RuntimeHasNoPush0() public {
        bytes memory code = address(registrar).code;
        assertGt(code.length, 0);
        assertFalse(_containsPush0(code), "PUSH0 in TownRegistrar runtime");
    }

    function _containsPush0(bytes memory code) internal pure returns (bool) {
        uint256 i = 0;
        while (i < code.length) {
            uint8 op = uint8(code[i]);
            if (op == 0x5f) return true;
            if (op == 0xfe) break;
            if (op >= 0x60 && op <= 0x7f) i += (op - 0x60) + 1;
            i += 1;
        }
        return false;
    }
}
