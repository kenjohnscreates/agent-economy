// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ArcConfig} from "../src/config/ArcConfig.sol";

/// @dev Trivial contract used to check that the toolchain produces deployable bytecode.
contract Probe {
    uint256 public x = 1;
}

contract SmokeTest is Test {
    function test_ArcConfigConstants() public pure {
        assertEq(ArcConfig.USDC, 0x3600000000000000000000000000000000000000, "USDC address");
        assertEq(ArcConfig.USDC_DECIMALS, 6, "USDC decimals");
        assertEq(ArcConfig.CHAIN_ID, 5_042_002, "chain id");
        assertEq(ArcConfig.ERC8183, 0x0747EEf0706327138c69792bF28Cd525089e4583, "ERC-8183 address");
    }

    /// @dev Arc lacks PUSH0 (0x5f). `evm_version = "paris"` in foundry.toml is what guarantees solc
    ///      never emits it. This test checks the runtime bytecode is non-empty and scans it with a
    ///      push-data-aware walk so a 0x5f byte inside PUSHn immediates is not mistaken for an opcode.
    function test_ProbeDeploysWithoutPush0() public {
        Probe probe = new Probe();
        bytes memory code = address(probe).code;

        assertGt(code.length, 0, "empty runtime code");
        assertTrue(keccak256(code) != keccak256(""), "empty runtime code hash");
        assertEq(probe.x(), 1, "probe state");

        assertFalse(_containsPush0(code), "PUSH0 found in runtime bytecode");
    }

    /// @dev Walk opcodes, skipping PUSH1..PUSH32 immediates. Stops at the first INVALID (0xfe) since
    ///      solc appends non-code metadata after it.
    function _containsPush0(bytes memory code) internal pure returns (bool) {
        uint256 i = 0;
        while (i < code.length) {
            uint8 op = uint8(code[i]);
            if (op == 0x5f) return true;
            if (op == 0xfe) break;
            if (op >= 0x60 && op <= 0x7f) {
                i += (op - 0x60) + 1;
            }
            i += 1;
        }
        return false;
    }
}
