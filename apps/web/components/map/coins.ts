// Fixed storage for payment animation, independent of Pixi and React.
// A slot lives for a 900ms flight plus four 100ms arrival frames, or a
// 400ms static line. No objects are created by the per-frame update.
import { samplePath, type Path, type Point } from "./paths";

export interface Coin extends Point {
  active: boolean;
  stage: "flight" | "ring" | "line";
  elapsed: number;
  amount: string;
  path: Path | null;
}
export class CoinPool {
  readonly slots: Coin[] = Array.from({ length: 32 }, () => ({
    active: false,
    stage: "flight",
    elapsed: 0,
    amount: "",
    path: null,
    x: 0,
    y: 0,
  }));
  get activeCount(): number {
    let count = 0;
    for (let i = 0; i < 32; i++) if (this.slots[i]!.active) count++;
    return count;
  }
  spawn(path: Path, amount: string, reduced: boolean): Coin | null {
    let flights = 0;
    for (const s of this.slots) if (s.active && s.stage !== "ring") flights++;
    if (flights >= 20) return null;
    const coin = this.slots.find((s) => !s.active);
    if (!coin) return null;
    coin.active = true;
    coin.elapsed = 0;
    coin.amount = amount;
    coin.path = path;
    coin.stage = reduced ? "line" : "flight";
    samplePath(path, 0, coin);
    return coin;
  }
  reduceMotion(): void {
    for (const coin of this.slots)
      if (coin.active && coin.stage !== "line") {
        coin.stage = "line";
        coin.elapsed = 0;
      }
  }
  clear(): void {
    for (const coin of this.slots) coin.active = false;
  }
  update(ms: number): void {
    for (let i = 0; i < 32; i++) {
      const coin = this.slots[i]!;
      if (!coin.active || !coin.path) continue;
      coin.elapsed += ms;
      if (coin.stage === "line") {
        coin.active = coin.elapsed < 400;
        continue;
      }
      const t = Math.min(1, coin.elapsed / 900);
      samplePath(coin.path, t * t * (3 - 2 * t), coin);
      if (coin.elapsed >= 900) coin.stage = "ring";
      if (coin.elapsed >= 1300) coin.active = false;
    }
  }
}
