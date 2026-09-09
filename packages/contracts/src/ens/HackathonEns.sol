// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Hackathon-frozen ENSv2 UserRegistry / PermissionedResolver (permres-inode), not namechain@48b3e2d.
///      Selectors verified against Sepolia UserRegistryImpl 0x47b4…2546 and PermissionedResolverImpl 0xa9d3…614e.
///      Parent writes use labelhash/anyId; never persist tokenIds (docs/RISKS.md R3).

/// @notice Registry EAC nybbles (Permissioned Registry docs).
library RegistryRoles {
    uint256 internal constant ROLE_REGISTRAR = 1 << 0;
    uint256 internal constant ROLE_REGISTRAR_ADMIN = ROLE_REGISTRAR << 128;
    uint256 internal constant ROLE_REGISTER_RESERVED = 1 << 4;
    uint256 internal constant ROLE_UNREGISTER = 1 << 12;
    uint256 internal constant ROLE_UNREGISTER_ADMIN = ROLE_UNREGISTER << 128;
    uint256 internal constant ROLE_RENEW = 1 << 16;
    uint256 internal constant ROLE_RENEW_ADMIN = ROLE_RENEW << 128;
    uint256 internal constant ROLE_SET_SUBREGISTRY = 1 << 20;
    uint256 internal constant ROLE_SET_SUBREGISTRY_ADMIN = ROLE_SET_SUBREGISTRY << 128;
    uint256 internal constant ROLE_SET_RESOLVER = 1 << 24;
    uint256 internal constant ROLE_SET_RESOLVER_ADMIN = ROLE_SET_RESOLVER << 128;
    /// @dev Admin-only; omit at mint to make the name non-transferable.
    uint256 internal constant ROLE_CAN_TRANSFER_ADMIN = (1 << 28) << 128;
}

/// @notice Resolver EAC nybbles (hackathon Permissioned Resolver / inode refactor).
library ResolverRoles {
    uint256 internal constant ROLE_SET_ADDRESS = 1 << 0;
    uint256 internal constant ROLE_SET_ADDRESS_ADMIN = ROLE_SET_ADDRESS << 128;
    uint256 internal constant ROLE_SET_TEXT = 1 << 4;
    uint256 internal constant ROLE_SET_TEXT_ADMIN = ROLE_SET_TEXT << 128;
    uint256 internal constant ROLE_SET_CONTENTHASH = 1 << 8;
    uint256 internal constant ROLE_SET_ABI = 1 << 12;
    uint256 internal constant ROLE_SET_INTERFACE = 1 << 16;
    uint256 internal constant ROLE_SET_NAME = 1 << 20;
    uint256 internal constant ROLE_SET_DATA = 1 << 24;
    uint256 internal constant ROLE_LINK = 1 << 28;
}

/// @dev DNS wire encoding for `{label}.{town}.eth` (setters take DNS names, not namehash).
library DnsCodec {
    function encodeTownName(string memory label, string memory town) internal pure returns (bytes memory) {
        bytes memory a = bytes(label);
        bytes memory b = bytes(town);
        uint256 aLen = a.length;
        uint256 bLen = b.length;
        if (aLen == 0 || aLen > 255 || bLen == 0 || bLen > 255) revert InvalidDnsLabel();
        // Safe: lengths bounded to 1..255 above.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint8 a8 = uint8(aLen);
        // forge-lint: disable-next-line(unsafe-typecast)
        uint8 b8 = uint8(bLen);
        return abi.encodePacked(a8, a, b8, b, uint8(3), "eth", bytes1(0));
    }

    error InvalidDnsLabel();
}

/// @notice Minimal UserRegistry / PermissionedRegistry surface (live selectors).
interface ITownRegistry {
    enum Status {
        AVAILABLE,
        RESERVED,
        REGISTERED
    }

    struct State {
        Status status;
        uint64 expiry;
        address latestOwner;
        uint256 tokenId;
        uint256 resource;
    }

    function register(
        string calldata label,
        address owner,
        address registry,
        address resolver,
        uint256 roleBitmap,
        uint64 expiry
    ) external returns (uint256 tokenId);

    function renew(uint256 anyId, uint64 newExpiry) external;
    function getState(uint256 anyId) external view returns (State memory state);
    function getOwner(uint256 anyId) external view returns (address);
    function ownerOf(uint256 tokenId) external view returns (address);
    function getExpiry(uint256 anyId) external view returns (uint64);
    function grantRootRoles(uint256 roleBitmap, address account) external returns (bool);
    function grantRoles(uint256 anyId, uint256 roleBitmap, address account) external returns (bool);
    function hasRoles(uint256 anyId, uint256 roleBitmap, address account) external view returns (bool);
    function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes calldata data) external;

    error EACUnauthorizedAccountRoles(uint256 resource, uint256 roleBitmap, address account);
    error TransferDisallowed(uint256 tokenId, address from);
    error LabelAlreadyRegistered(string label);
}

/// @notice Minimal hackathon PermissionedResolver surface (live selectors).
/// @dev `grantRoles` exists on the impl but reverts (`EACCannotGrantRoles`); use `grantSetterRoles`.
///      Setters take DNS-encoded names (`bytes`), not namehash. Address writes are `setAddress`
///      (inode), not namechain `setAddr`.
interface ITownResolver {
    function setText(bytes calldata name, string calldata key, string calldata value) external;
    function setAddress(bytes calldata name, uint256 coinType, bytes calldata addressBytes) external;
    function grantSetterRoles(bytes calldata setter, address account) external;
    function grantRootRoles(uint256 roleBitmap, address account) external returns (bool);
    function revokeRootRoles(uint256 roleBitmap, address account) external returns (bool);
    function hasRoles(uint256 resource, uint256 roleBitmap, address account) external view returns (bool);
    function roles(uint256 resource, address account) external view returns (uint256);

    error EACUnauthorizedAccountRoles(uint256 resource, uint256 roleBitmap, address account);
}
