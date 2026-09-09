import { describe, expect, it } from "vitest";
import { mapGdpSeriesPoints, timestampToUnixSec, toTick } from "./map.js";

describe("timestampToUnixSec", () => {
  it("passes through unix seconds", () => {
    expect(timestampToUnixSec("1788935601")).toBe(1788935601);
  });

  it("converts day-bucket keys to unix", () => {
    expect(timestampToUnixSec("20705")).toBe(20705 * 86_400);
  });
});

describe("toTick / mapGdpSeriesPoints", () => {
  const anchorSec = 1_788_935_601;
  const tickMs = 15_000;

  it("maps unix timestamp at anchor to tick 1", () => {
    expect(toTick("1788935601", anchorSec, tickMs)).toBe(1);
  });

  it("maps day-bucket key via unix conversion", () => {
    const bucketUnix = 20_705 * 86_400;
    expect(toTick("20705", bucketUnix, tickMs)).toBe(1);
    expect(toTick("1788935601", bucketUnix, tickMs)).toBe(
      Math.floor((1_788_935_601 - bucketUnix) / 15) + 1,
    );
  });

  it("mapGdpSeriesPoints handles unix and bucket timestamps", () => {
    const points = mapGdpSeriesPoints(
      [
        { timestamp: "20705", gdpUsdc: "100000" },
        { timestamp: "1788935601", gdpUsdc: "200000" },
      ],
      anchorSec,
      tickMs,
    );
    expect(points).toHaveLength(2);
    expect(points[0]?.gdpUsdc).toBe("100000");
    expect(points[1]?.gdpUsdc).toBe("300000");
  });
});
