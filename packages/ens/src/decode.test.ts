// UR.resolve payload decoding: ABI-encoded bytes (live 194-hex) vs 20-byte packed.
import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { decodeUrAddress, decodeUrBytes, decodeUrString } from "./decode.js";

const ADA = getAddress("0x97847b3c015994784ae8cf776ef9a4d563618cf2");

/** Live 2026-09-09: UR.resolve(ada.botanica.eth, addr(node, 2152525650)) inner bytes. */
const UR_ADDR_194 =
  "0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000001497847b3c015994784ae8cf776ef9a4d563618cf2000000000000000000000000" as const;

const PACKED_20 = "0x97847b3c015994784ae8cf776ef9a4d563618cf2" as const;

/** ABI-encoded string "treasurer" (live town.role). */
const ROLE_STRING =
  "0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000097472656173757265720000000000000000000000000000000000000000000000" as const;

const EMPTY_STRING =
  "0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000" as const;

describe("decodeUrAddress", () => {
  it("decodes the 194-hex UR bytes payload to the Arc wallet", () => {
    expect(UR_ADDR_194.length).toBe(194);
    expect(decodeUrAddress(UR_ADDR_194)).toBe(ADA);
  });

  it("decodes a 20-byte packed address", () => {
    expect(PACKED_20.length).toBe(42);
    expect(decodeUrAddress(PACKED_20)).toBe(ADA);
    expect(decodeUrBytes(PACKED_20)).toBe(PACKED_20);
  });

  it("returns undefined for empty / zero", () => {
    expect(decodeUrAddress("0x")).toBeUndefined();
    expect(
      decodeUrAddress("0x0000000000000000000000000000000000000000000000000000000000000000"),
    ).toBeUndefined();
  });
});

describe("decodeUrString", () => {
  it("decodes ABI-encoded town.role", () => {
    expect(decodeUrString(ROLE_STRING)).toBe("treasurer");
  });

  it("decodes empty text records to empty string", () => {
    expect(decodeUrString(EMPTY_STRING)).toBe("");
    expect(decodeUrString("0x")).toBe("");
  });
});
