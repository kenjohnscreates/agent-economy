// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ArcConfig
/// @notice Reference constants for Arc Testnet used by scripts and tests.
/// @dev USDC is Arc's native gas token. The ERC-20 interface at `USDC` reports 6 decimals; the native
///      gas balance (`eth_getBalance`) is 18 decimals. Contracts and app math MUST use the ERC-20
///      interface only and never mix the two representations. Production contracts do not import
///      these constants into logic: addresses are passed via constructor so deployments stay
///      mainnet-portable (see docs/RISKS.md R4, R6).
library ArcConfig {
    /// @notice Arc Testnet chain id.
    uint256 internal constant CHAIN_ID = 5_042_002;

    /// @notice USDC ERC-20 interface on Arc (6 decimals).
    address internal constant USDC = 0x3600000000000000000000000000000000000000;

    /// @notice Decimals reported by the USDC ERC-20 interface. Never use 18 here.
    uint8 internal constant USDC_DECIMALS = 6;

    /// @notice ERC-8183 AgenticCommerce reference deployment on Arc Testnet.
    address internal constant ERC8183 = 0x0747EEf0706327138c69792bF28Cd525089e4583;
}
