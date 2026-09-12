import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readSeedLoans } from "./seedLoans.js";

describe("readSeedLoans", () => {
  it("returns [] when unset", () => {
    expect(readSeedLoans({})).toEqual([]);
  });

  it("parses a GET /loans dump", () => {
    const dir = mkdtempSync(join(tmpdir(), "seed-loans-"));
    const path = join(dir, "loans.json");
    writeFileSync(
      path,
      JSON.stringify([
        {
          id: "11",
          borrower: "0xc0469ad2ee2acac0c9bd50e07481a5325f9c8950",
          principalUsdc: "200000",
          rateBps: 0,
          status: "pending",
          requestedAtTick: 1,
          approvedAtTick: null,
          dueAtTick: null,
          repaidUsdc: "0",
          defaultedAtTick: null,
          advisor: null,
        },
      ]),
    );
    const loans = readSeedLoans({ GRAPH_LAST_GOOD_LOANS: path });
    expect(loans).toHaveLength(1);
    expect(loans[0]?.id).toBe("11");
    expect(loans[0]?.status).toBe("pending");
  });
});
