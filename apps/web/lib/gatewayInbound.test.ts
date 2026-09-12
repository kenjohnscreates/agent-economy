import { describe, expect, it } from "vitest";
import { GATEWAY_INBOUND, gatewayMintExplorerUrl } from "./gatewayInbound";

describe("gateway inbound", () => {
  it("points at the settled Arc mint, not a live bridge", () => {
    expect(GATEWAY_INBOUND.agent).toBe("gus");
    expect(GATEWAY_INBOUND.amountUsdc).toBe("800000");
    expect(gatewayMintExplorerUrl()).toBe(
      `https://testnet.arcscan.app/tx/${GATEWAY_INBOUND.mintTxHash}`,
    );
  });
});
