// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {DnsCodec, ITownRegistry, ITownResolver, RegistryRoles, ResolverRoles} from "./ens/HackathonEns.sol";

/// @title TownRegistrar
/// @notice Mints role subnames into the town UserRegistry (ENSv2 hackathon, Sepolia) and grants
///         per-role EAC on the shared PermissionedResolver. Owns the subregistry operationally
///         via `ROLE_REGISTRAR` / `ROLE_RENEW` on `ROOT_RESOURCE` (ARCHITECTURE §4.3).
/// @dev Constructor addresses come from `packages/ens/town.json` / env (RISKS R2). `register` returns
///      the live `tokenId` for the caller to use immediately and does **not** store tokenIds
///      (RISKS R3 — they change on any registry role grant/revoke). Parent writes use labelhash.
///      Resolver text permissions are **per key, resolver-wide** on the hackathon inode resolver
///      (`grantSetterRoles` / `setText(bytes,string,string)`); there is no per-name text scope.
contract TownRegistrar is Ownable2Step {
    // ─── Types ───────────────────────────────────────────────────────────────────

    enum Role {
        Treasurer,
        Merchant,
        Worker,
        Consumer
    }

    // ─── Constants ───────────────────────────────────────────────────────────────

    string public constant KEY_CREDIT_SCORE = "town.credit-score";
    string public constant KEY_REVIEWS = "town.reviews";
    string public constant KEY_PRICE = "town.price";
    string public constant KEY_AGENT_CONTEXT = "agent-context";
    string public constant KEY_DESCRIPTION = "description";
    string public constant KEY_ROLE = "town.role";

    /// @dev ETH-registrar-like owner bits minus transfer (worker / soulbound).
    uint256 public constant OWNER_ROLES = RegistryRoles.ROLE_SET_SUBREGISTRY | RegistryRoles.ROLE_SET_SUBREGISTRY_ADMIN
        | RegistryRoles.ROLE_SET_RESOLVER | RegistryRoles.ROLE_SET_RESOLVER_ADMIN;

    uint256 public constant TRANSFERABLE_ROLES = OWNER_ROLES | RegistryRoles.ROLE_CAN_TRANSFER_ADMIN;

    uint256 public constant TREASURER_NAME_ROLES = TRANSFERABLE_ROLES | RegistryRoles.ROLE_UNREGISTER
        | RegistryRoles.ROLE_UNREGISTER_ADMIN | RegistryRoles.ROLE_RENEW | RegistryRoles.ROLE_RENEW_ADMIN;

    uint256 public constant TREASURER_RESOLVER_ROLES = ResolverRoles.ROLE_SET_TEXT | ResolverRoles.ROLE_SET_ADDRESS;

    // ─── Immutables ──────────────────────────────────────────────────────────────

    ITownRegistry public immutable registry;
    ITownResolver public immutable resolver;
    /// @notice Account granted `town.credit-score` / `town.reviews` setter roles on every mint.
    address public immutable treasurer;
    uint64 public immutable nameDuration;
    uint64 public immutable consumerDuration;

    // ─── Storage ─────────────────────────────────────────────────────────────────
    // Intentionally no `mapping(...) tokenId` (R3). `townLabel` is the only extra slot besides Ownable2Step.

    string public townLabel;

    // ─── Events ──────────────────────────────────────────────────────────────────

    event NameRegistered(uint256 indexed tokenId, string label, address indexed owner, Role role, uint64 expiry);
    event NameRenewed(string label, uint64 newExpiry);

    // ─── Errors ──────────────────────────────────────────────────────────────────

    error ZeroAddress();
    error InvalidLabel();
    error InvalidDuration(uint64 duration);
    error NameNotRegistered(string label);
    error ConsumerDurationNotShorter();

    // ─── Constructor ─────────────────────────────────────────────────────────────

    /// @param registry_ Town UserRegistry proxy (`packages/ens/town.json` TownRegistry).
    /// @param resolver_ Town PermissionedResolver proxy (same file, TownResolver).
    /// @param owner_ Ownable2Step owner (treasurer EOA / mayor); sole `register`/`renew` caller.
    /// @param treasurer_ Receives credit-score/reviews setter grants. Use owner if the same account.
    /// @param townLabel_ Parent label only (`botanica`), not `botanica.eth`.
    /// @param nameDuration_ Seconds until expiry for treasurer/merchant/worker (not `type(uint64).max`).
    /// @param consumerDuration_ Shorter consumer expiry; must be < `nameDuration_`.
    constructor(
        ITownRegistry registry_,
        ITownResolver resolver_,
        address owner_,
        address treasurer_,
        string memory townLabel_,
        uint64 nameDuration_,
        uint64 consumerDuration_
    ) Ownable(owner_) {
        if (address(registry_) == address(0) || address(resolver_) == address(0)) {
            revert ZeroAddress();
        }
        if (treasurer_ == address(0)) revert ZeroAddress();
        if (bytes(townLabel_).length == 0 || bytes(townLabel_).length > 255) revert InvalidLabel();
        if (nameDuration_ == 0 || consumerDuration_ == 0) revert InvalidDuration(0);
        if (consumerDuration_ >= nameDuration_) revert ConsumerDurationNotShorter();
        registry = registry_;
        resolver = resolver_;
        treasurer = treasurer_;
        townLabel = townLabel_;
        nameDuration = nameDuration_;
        consumerDuration = consumerDuration_;
    }

    // ─── Registration ────────────────────────────────────────────────────────────

    /// @notice Mint `label.town.eth` with per-role registry bitmap + resolver setter grants.
    /// @dev Returns the live tokenId for immediate use in this call only. Does not cache it.
    function register(string calldata label, address owner, Role role) external onlyOwner returns (uint256 tokenId) {
        if (owner == address(0)) revert ZeroAddress();
        _validateLabel(label);

        uint64 expiry = uint64(block.timestamp) + durationOf(role);
        tokenId = registry.register(label, owner, address(0), address(resolver), roleBitmapOf(role), expiry);

        _grantResolverRoles(label, owner, role);
        emit NameRegistered(tokenId, label, owner, role, expiry);
    }

    /// @notice Extend expiry by `duration` seconds. Uses labelhash as anyId (R3); re-reads `getState` first.
    function renew(string calldata label, uint64 duration) external onlyOwner {
        if (duration == 0) revert InvalidDuration(duration);
        _validateLabel(label);
        uint256 anyId = uint256(keccak256(bytes(label)));
        ITownRegistry.State memory state = registry.getState(anyId);
        if (state.status != ITownRegistry.Status.REGISTERED) revert NameNotRegistered(label);
        // Expiry is tick-agnostic by design; validator skew is immaterial at this scale.
        // forge-lint: disable-next-line(block-timestamp)
        uint64 base = state.expiry > uint64(block.timestamp) ? state.expiry : uint64(block.timestamp);
        uint64 newExpiry = base + duration;
        registry.renew(anyId, newExpiry);
        emit NameRenewed(label, newExpiry);
    }

    // ─── Views ───────────────────────────────────────────────────────────────────

    function durationOf(Role role) public view returns (uint64) {
        return role == Role.Consumer ? consumerDuration : nameDuration;
    }

    function roleBitmapOf(Role role) public pure returns (uint256) {
        if (role == Role.Treasurer) return TREASURER_NAME_ROLES;
        if (role == Role.Worker) return OWNER_ROLES;
        return TRANSFERABLE_ROLES;
    }

    function dnsName(string memory label) public view returns (bytes memory) {
        return DnsCodec.encodeTownName(label, townLabel);
    }

    // ─── Internals ───────────────────────────────────────────────────────────────

    function _grantResolverRoles(string calldata label, address owner, Role role) internal {
        // Treasurer accountability keys on every agent name (resolver-wide per key on live EAC).
        _grantTextKey(KEY_CREDIT_SCORE, treasurer);
        _grantTextKey(KEY_REVIEWS, treasurer);

        if (role == Role.Treasurer) {
            resolver.grantRootRoles(TREASURER_RESOLVER_ROLES, owner);
        } else if (role == Role.Merchant) {
            _grantTextKey(KEY_AGENT_CONTEXT, owner);
            _grantTextKey(KEY_DESCRIPTION, owner);
            _grantTextKey(KEY_PRICE, owner);
        } else if (role == Role.Worker) {
            _grantTextKey(KEY_AGENT_CONTEXT, owner);
            _grantTextKey(KEY_DESCRIPTION, owner);
        }

        resolver.setText(dnsName(label), KEY_ROLE, _roleName(role));
    }

    function _grantTextKey(string memory key, address account) internal {
        bytes memory setter = abi.encodeCall(ITownResolver.setText, (bytes(""), key, ""));
        resolver.grantSetterRoles(setter, account);
    }

    function _roleName(Role role) internal pure returns (string memory) {
        if (role == Role.Treasurer) return "treasurer";
        if (role == Role.Merchant) return "merchant";
        if (role == Role.Worker) return "worker";
        return "consumer";
    }

    function _validateLabel(string calldata label) internal pure {
        bytes memory b = bytes(label);
        uint256 n = b.length;
        if (n == 0 || n > 255) revert InvalidLabel();
        for (uint256 i = 0; i < n; i++) {
            if (b[i] == ".") revert InvalidLabel();
        }
    }
}
