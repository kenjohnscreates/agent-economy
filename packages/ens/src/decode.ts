// UniversalResolverV2.resolve returns (bytes, address). viem often leaves the
// inner `bytes` ABI-encoded (offset + length + payload). Confirmed live 2026-09-09:
// ada.botanica.eth addr → hex length 194 wrapping a 20-byte EVM address.
import {
  decodeAbiParameters,
  getAddress,
  hexToString,
  isAddress,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";

/** Strip one layer of ABI `bytes` encoding. Passes through packed payloads. */
export function decodeUrBytes(data: Hex): Hex {
  if (!data || data === "0x") return "0x";
  if (data.length >= 130) {
    try {
      const [inner] = decodeAbiParameters([{ type: "bytes" }], data);
      if (inner) return inner;
    } catch {
      /* not ABI-encoded bytes */
    }
  }
  return data;
}

/**
 * Decode an addr() profile result to a checksummed EVM address.
 * Handles: ABI-encoded `bytes` (194-hex UR payload), 20-byte packed, 32-byte padded.
 */
export function decodeUrAddress(data: Hex): Address | undefined {
  if (!data || data === "0x") return undefined;

  const fromPacked = (hex: Hex): Address | undefined => {
    if (hex.length === 42 && isAddress(hex)) {
      const addr = getAddress(hex);
      return addr === zeroAddress ? undefined : addr;
    }
    if (hex.length > 42) {
      const packed = `0x${hex.slice(2, 42)}` as Hex;
      if (isAddress(packed)) {
        const addr = getAddress(packed);
        return addr === zeroAddress ? undefined : addr;
      }
    }
    return undefined;
  };

  const packed = fromPacked(data);
  if (packed) return packed;

  const inner = decodeUrBytes(data);
  if (inner !== data) {
    const fromInner = fromPacked(inner);
    if (fromInner) return fromInner;
  }

  try {
    const [addr] = decodeAbiParameters([{ type: "address" }], data);
    if (addr && addr !== zeroAddress) return getAddress(addr);
  } catch {
    /* not an ABI address */
  }
  return undefined;
}

/** Decode a text() profile result. Empty record → `""`. */
export function decodeUrString(data: Hex): string {
  if (!data || data === "0x") return "";
  try {
    const [s] = decodeAbiParameters([{ type: "string" }], data);
    return s;
  } catch {
    const inner = decodeUrBytes(data);
    if (!inner || inner === "0x") return "";
    try {
      return hexToString(inner);
    } catch {
      return "";
    }
  }
}
