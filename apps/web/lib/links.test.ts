import { describe, expect, it } from "vitest";
import { arcAddressUrl, displayEnsName, ensExplorerUrl } from "./links";

describe("links", () => {
  it("swaps the mock town placeholder for the configured town", () => {
    expect(displayEnsName("ada.<town>.eth", "botanica")).toBe("ada.botanica.eth");
    expect(displayEnsName("ada.botanica.eth", "botanica")).toBe("ada.botanica.eth");
  });
  it("builds the arcscan wallet link from the shared explorer constant", () => {
    expect(arcAddressUrl("0x97847b3C015994784Ae8Cf776ef9a4d563618cF2")).toBe(
      "https://testnet.arcscan.app/address/0x97847b3C015994784Ae8Cf776ef9a4d563618cF2",
    );
  });
  it("fills the ENS explorer template when it has {name}, else lands on the root", () => {
    expect(ensExplorerUrl("ada.<town>.eth", "botanica", "https://x.dev/name/{name}")).toBe(
      "https://x.dev/name/ada.botanica.eth",
    );
    expect(ensExplorerUrl("ada.<town>.eth", "botanica", "https://explorer.ens.dev/")).toBe(
      "https://explorer.ens.dev/",
    );
  });
});
