// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Test-only ERC-20 with configurable decimals (6 to mirror Arc USDC, 18 to prove no 1e6 assumptions).
contract MockUSDC is ERC20 {
    uint8 private immutable _decimals;

    constructor(uint8 decimals_) ERC20("Mock USDC", "USDC") {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev 6-decimal mock matching the Arc USDC ERC-20 interface.
contract MockUSDC6 is MockUSDC {
    constructor() MockUSDC(6) {}
}

/// @dev 18-decimal mock used to prove the treasury never hardcodes 1e6.
contract MockUSDC18 is MockUSDC {
    constructor() MockUSDC(18) {}
}
