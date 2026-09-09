// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockUSDC} from "./MockUSDC6.sol";
import {TownTreasury} from "../../src/TownTreasury.sol";

/// @dev Recipient hook so a malicious token can re-enter the treasury mid-transfer.
interface ITransferHook {
    function onTokenTransfer(uint256 amount) external;
}

/// @dev ERC-20 that calls the recipient back on every `transfer` (ERC-777-style), used to prove `nonReentrant`.
contract ReentrantUSDC is MockUSDC {
    constructor() MockUSDC(6) {}

    function transfer(address to, uint256 amount) public override returns (bool) {
        bool ok = super.transfer(to, amount);
        if (to.code.length > 0) ITransferHook(to).onTokenTransfer(amount);
        return ok;
    }
}

/// @dev Deposits, then tries to withdraw twice by re-entering from the token callback.
contract ReentrantAttacker is ITransferHook {
    TownTreasury public immutable treasury;
    ReentrantUSDC public immutable token;
    uint256 public reentered;

    constructor(TownTreasury treasury_, ReentrantUSDC token_) {
        treasury = treasury_;
        token = token_;
    }

    function depositAll() external {
        uint256 bal = token.balanceOf(address(this));
        token.approve(address(treasury), bal);
        treasury.deposit(bal);
    }

    function attackWithdraw(uint256 amount) external {
        treasury.withdraw(amount);
    }

    function onTokenTransfer(uint256 amount) external {
        reentered += 1;
        // Second withdraw of the same savings should be blocked by ReentrancyGuard.
        treasury.withdraw(amount);
    }
}
