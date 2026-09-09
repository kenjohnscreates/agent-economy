// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ITownResolver, ResolverRoles} from "../../src/ens/HackathonEns.sol";

/// @dev Hackathon inode PermissionedResolver stand-in: text keys scoped as keccak256(key), not per-name.
contract MockTownResolver is ITownResolver {
    mapping(uint256 => mapping(address => uint256)) internal _eac;
    mapping(bytes32 => mapping(bytes32 => string)) internal _text;
    mapping(bytes32 => mapping(uint256 => bytes)) internal _addr;

    constructor(address admin) {
        _eac[0][admin] = type(uint256).max;
    }

    function setText(bytes calldata name, string calldata key, string calldata value) external {
        uint256 resource = uint256(keccak256(bytes(key)));
        if (!_has(resource, msg.sender, ResolverRoles.ROLE_SET_TEXT)) {
            revert EACUnauthorizedAccountRoles(resource, ResolverRoles.ROLE_SET_TEXT, msg.sender);
        }
        _text[keccak256(name)][keccak256(bytes(key))] = value;
    }

    function setAddress(bytes calldata name, uint256 coinType, bytes calldata addressBytes) external {
        uint256 resource = uint256(keccak256(abi.encode(coinType)));
        if (!_has(resource, msg.sender, ResolverRoles.ROLE_SET_ADDRESS)) {
            revert EACUnauthorizedAccountRoles(resource, ResolverRoles.ROLE_SET_ADDRESS, msg.sender);
        }
        _addr[keccak256(name)][coinType] = addressBytes;
    }

    mapping(bytes32 => bytes32) public linkedNode;
    mapping(bytes32 => uint256) internal _recordByNode;

    function linkToNode(bytes calldata sourceName, bytes32 targetNode) external {
        if (!_has(0, msg.sender, ResolverRoles.ROLE_LINK)) {
            revert EACUnauthorizedAccountRoles(0, ResolverRoles.ROLE_LINK, msg.sender);
        }
        if (targetNode == bytes32(0)) revert InvalidRecord();
        linkedNode[keccak256(sourceName)] = targetNode;
        _recordByNode[keccak256(sourceName)] = _recordByNode[targetNode] == 0 ? 1 : _recordByNode[targetNode];
    }

    function linkToRecord(bytes calldata sourceName, uint256 recordId) external {
        if (!_has(0, msg.sender, ResolverRoles.ROLE_LINK)) {
            revert EACUnauthorizedAccountRoles(0, ResolverRoles.ROLE_LINK, msg.sender);
        }
        _recordByNode[keccak256(sourceName)] = recordId;
    }

    function getRecordId(bytes32 node) external view returns (uint256) {
        return _recordByNode[node];
    }

    function grantSetterRoles(bytes calldata setter, address account) external {
        if (!_has(0, msg.sender, ResolverRoles.ROLE_SET_TEXT_ADMIN)) {
            revert EACUnauthorizedAccountRoles(0, ResolverRoles.ROLE_SET_TEXT_ADMIN, msg.sender);
        }
        if (setter.length < 4) revert UnsupportedSetter(0);
        bytes4 sel = bytes4(setter[:4]);
        if (sel != ITownResolver.setText.selector) revert UnsupportedSetter(sel);
        (, string memory key,) = abi.decode(setter[4:], (bytes, string, string));
        uint256 resource = uint256(keccak256(bytes(key)));
        _eac[resource][account] |= ResolverRoles.ROLE_SET_TEXT;
    }

    function grantRootRoles(uint256 roleBitmap, address account) external returns (bool) {
        if (!_canGrant(msg.sender, roleBitmap)) {
            revert EACUnauthorizedAccountRoles(0, roleBitmap << 128, msg.sender);
        }
        _eac[0][account] |= roleBitmap;
        return true;
    }

    function revokeRootRoles(uint256 roleBitmap, address account) external returns (bool) {
        _eac[0][account] &= ~roleBitmap;
        return true;
    }

    function hasRoles(uint256 resource, uint256 roleBitmap, address account) external view returns (bool) {
        return _has(resource, account, roleBitmap);
    }

    function roles(uint256 resource, address account) external view returns (uint256) {
        return _eac[resource][account] | _eac[0][account];
    }

    function text(bytes calldata name, string calldata key) external view returns (string memory) {
        return _text[keccak256(name)][keccak256(bytes(key))];
    }

    function addr(bytes calldata name, uint256 coinType) external view returns (bytes memory) {
        return _addr[keccak256(name)][coinType];
    }

    function _has(uint256 resource, address account, uint256 roleBitmap) internal view returns (bool) {
        uint256 have = _eac[resource][account] | _eac[0][account];
        return (have & roleBitmap) == roleBitmap;
    }

    function _canGrant(address account, uint256 roleBitmap) internal view returns (bool) {
        uint256 adminNeed = (roleBitmap & ((uint256(1) << 128) - 1)) << 128;
        return _has(0, account, adminNeed == 0 ? roleBitmap : adminNeed);
    }

    error UnsupportedSetter(bytes4 selector);
}
