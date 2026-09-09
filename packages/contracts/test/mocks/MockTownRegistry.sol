// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ITownRegistry, RegistryRoles} from "../../src/ens/HackathonEns.sol";

/// @dev Minimal PermissionedRegistry stand-in: labelhash anyId, versioned tokenIds, EAC transfer bit.
///      Does not inherit OZ ERC1155 (v5.7 Arrays.sol uses mcopy / Cancun; this package targets paris).
contract MockTownRegistry is ITownRegistry {
    uint256 internal constant VERSION_MASK = type(uint32).max;

    struct Name {
        bool registered;
        uint32 version;
        uint64 expiry;
        address owner;
        address resolver;
        uint256 tokenId;
        uint256 roles;
    }

    mapping(uint256 => Name) internal _names;
    mapping(uint256 => uint256) internal _tokenToLabel;
    mapping(uint256 => mapping(address => uint256)) internal _eac;
    mapping(uint256 => mapping(address => uint256)) internal _balance;

    constructor(address admin) {
        _eac[0][admin] = type(uint256).max;
    }

    function register(
        string calldata label,
        address owner,
        address,
        address resolver_,
        uint256 roleBitmap,
        uint64 expiry
    ) external returns (uint256 tokenId) {
        if (!_has(0, msg.sender, RegistryRoles.ROLE_REGISTRAR)) {
            revert EACUnauthorizedAccountRoles(0, RegistryRoles.ROLE_REGISTRAR, msg.sender);
        }
        uint256 labelhash = uint256(keccak256(bytes(label)));
        Name storage n = _names[labelhash];
        if (n.registered && n.expiry > block.timestamp) revert LabelAlreadyRegistered(label);
        n.registered = true;
        n.expiry = expiry;
        n.owner = owner;
        n.resolver = resolver_;
        n.roles = roleBitmap;
        n.version += 1;
        tokenId = _tokenId(labelhash, n.version);
        n.tokenId = tokenId;
        _tokenToLabel[tokenId] = labelhash;
        _eac[labelhash][owner] = roleBitmap;
        _balance[tokenId][owner] = 1;
    }

    function renew(uint256 anyId, uint64 newExpiry) external {
        if (!_has(0, msg.sender, RegistryRoles.ROLE_RENEW)) {
            revert EACUnauthorizedAccountRoles(0, RegistryRoles.ROLE_RENEW, msg.sender);
        }
        uint256 labelhash = _labelhash(anyId);
        Name storage n = _names[labelhash];
        if (!n.registered) revert NameNotFound();
        if (newExpiry < n.expiry) revert CannotReduceExpiry(n.expiry, newExpiry);
        n.expiry = newExpiry;
    }

    function getState(uint256 anyId) external view returns (State memory state) {
        uint256 labelhash = _labelhash(anyId);
        Name storage n = _names[labelhash];
        if (!n.registered) return state;
        bool live = n.expiry > block.timestamp;
        state.status = live ? Status.REGISTERED : Status.AVAILABLE;
        state.expiry = n.expiry;
        state.latestOwner = n.owner;
        state.tokenId = n.tokenId;
        state.resource = labelhash;
    }

    function getOwner(uint256 anyId) external view returns (address) {
        Name storage n = _names[_labelhash(anyId)];
        if (!n.registered || n.expiry <= block.timestamp) return address(0);
        return n.owner;
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        uint256 labelhash = _tokenToLabel[tokenId];
        if (labelhash == 0) return address(0);
        Name storage n = _names[labelhash];
        if (n.tokenId != tokenId || n.expiry <= block.timestamp) return address(0);
        return n.owner;
    }

    function getExpiry(uint256 anyId) external view returns (uint64) {
        return _names[_labelhash(anyId)].expiry;
    }

    function grantRootRoles(uint256 roleBitmap, address account) external returns (bool) {
        _eac[0][account] |= roleBitmap;
        return true;
    }

    function grantRoles(uint256 anyId, uint256 roleBitmap, address account) external returns (bool) {
        uint256 labelhash = _labelhash(anyId);
        Name storage n = _names[labelhash];
        if (!n.registered) revert NameNotFound();
        _eac[labelhash][account] |= roleBitmap;
        _regenerate(labelhash, n);
        return true;
    }

    function hasRoles(uint256 anyId, uint256 roleBitmap, address account) external view returns (bool) {
        uint256 labelhash = anyId == 0 ? 0 : _labelhash(anyId);
        return _has(labelhash, account, roleBitmap);
    }

    function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes calldata) external {
        require(msg.sender == from, "not owner");
        require(value == 1 && _balance[id][from] == 1, "no token");
        uint256 labelhash = _tokenToLabel[id];
        Name storage n = _names[labelhash];
        if ((n.roles & RegistryRoles.ROLE_CAN_TRANSFER_ADMIN) == 0) {
            revert TransferDisallowed(id, from);
        }
        _balance[id][from] = 0;
        _balance[id][to] = 1;
        n.owner = to;
        _eac[labelhash][to] = _eac[labelhash][from];
        delete _eac[labelhash][from];
    }

    function _regenerate(uint256 labelhash, Name storage n) internal {
        uint256 oldId = n.tokenId;
        address owner_ = n.owner;
        if (oldId != 0) _balance[oldId][owner_] = 0;
        delete _tokenToLabel[oldId];
        n.version += 1;
        uint256 newId = _tokenId(labelhash, n.version);
        n.tokenId = newId;
        _tokenToLabel[newId] = labelhash;
        _balance[newId][owner_] = 1;
    }

    function _tokenId(uint256 labelhash, uint32 version) internal pure returns (uint256) {
        return (labelhash & ~VERSION_MASK) | uint256(version);
    }

    function _labelhash(uint256 anyId) internal view returns (uint256) {
        uint256 fromToken = _tokenToLabel[anyId];
        if (fromToken != 0) return fromToken;
        return anyId;
    }

    function _has(uint256 resource, address account, uint256 roleBitmap) internal view returns (bool) {
        uint256 have = _eac[resource][account] | _eac[0][account];
        return roleBitmap == 0 || (have & roleBitmap) == roleBitmap;
    }

    error NameNotFound();
    error CannotReduceExpiry(uint64 oldExpiry, uint64 newExpiry);
}
