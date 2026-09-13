"use client";
import { useEffect, useRef } from "react";
import { revealProgress } from "../../lib/intro";
import styles from "./intro.module.css";
import { Wordmark } from "../Wordmark";

const cells = Array.from({ length: 160 * 90 }, (_, i) => {
  const x = (i % 160) * 4,
    y = Math.floor(i / 160) * 4;
  const wave = Math.sin(x / 47 + Math.sin(y / 38)) + Math.cos(y / 27 + x / 94);
  const noise = ((((x * 17431 + y * 31337) ^ (x * y * 17)) >>> 0) % 101) / 650;
  return {
    x,
    y,
    shade: Math.max(0, Math.min(4, Math.floor(2 + wave * 1.2))),
    clear: Math.min(0.99, 0.08 + Math.hypot((x - 205) / 520, (y - 285) / 440) * 0.72 + noise),
  };
});
const colors = ["#edf9eb", "#dcefe6", "#cae6e4", "#b5dce1", "#a2d2dc"];
// Two nearer banks sit over the distant cloud plate. Retain every pixel once.
const banks = [1, 2].map((depth) =>
  cells.flatMap((cell) => {
    const side = cell.x < 320 ? -1 : 1;
    const centerX = side < 0 ? (depth === 1 ? 115 : -20) : depth === 1 ? 525 : 660;
    const centerY = Math.round((cell.y - 45) / 125) * 125 + 45;
    const shape =
      ((cell.x - centerX) / (depth === 1 ? 175 : 220)) ** 2 + ((cell.y - centerY) / 87) ** 2;
    if (shape > 1) return [];
    const light = shape;
    return [
      {
        ...cell,
        side,
        shade: Math.max(0, Math.min(3, Math.floor(light * 2.8))),
        clear: 0.56 + cell.clear * 0.4,
      },
    ];
  }),
);
export function drawClouds(ctx: CanvasRenderingContext2D, progress: number) {
  ctx.clearRect(0, 0, 640, 360);
  if (progress >= 1) return;
  const eased = progress * progress * (3 - 2 * progress);
  for (const cell of cells) {
    if (eased >= cell.clear) continue;
    ctx.fillStyle = colors[cell.shade]!;
    ctx.fillRect(cell.x, cell.y, 4, 4);
  }
  for (let layer = 0; layer < banks.length; layer++) {
    for (const cell of banks[layer]!) {
      if (eased >= cell.clear) continue;
      const drift = Math.round((eased * (layer === 0 ? 64 : 112)) / 4) * 4;
      ctx.fillStyle = colors[cell.shade]!;
      ctx.fillRect(
        cell.x + cell.side * drift,
        cell.y - Math.round(eased * (layer + 1) * 2) * 4,
        4,
        4,
      );
    }
  }
}

export function CoastalScene({
  time,
  reduced = false,
  movie = false,
  onReady,
  onError,
}: {
  time: number;
  reduced?: boolean;
  movie?: boolean;
  onReady?: () => void;
  onError?: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const progress = reduced ? 1 : revealProgress(time, movie);
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      ...Array.from(root.current?.querySelectorAll("img") ?? []).map((img) => img.decode()),
      document.fonts.ready,
    ])
      .then(() => {
        if (!cancelled) onReady?.();
      })
      .catch(() => {
        if (!cancelled) onError?.();
      });
    return () => {
      cancelled = true;
    };
  }, [onReady, onError]);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    drawClouds(ctx, progress);
  }, [progress]);
  const bob = reduced ? 0 : Math.round(Math.sin((time / 1800) * Math.PI * 2) * 3);
  return (
    <div
      ref={root}
      role="img"
      className={styles.scene}
      data-coastal-scene
      data-progress={progress.toFixed(3)}
      aria-label="Botanica, the agent economy. A robot overlooking a sunny island coast."
    >
      <img className={styles.landscape} src="/intro/landscape.webp" alt="" fetchPriority="high" />
      <div className={styles.robotPlane}>
        <img
          className={styles.robot}
          src="/intro/robot.png"
          alt=""
          style={{ transform: `translateY(${bob}px)` }}
        />
      </div>
      <div className={styles.identity}>
        <div className={styles.wordmark}>
          <Wordmark />
        </div>
        <p>THE AGENT ECONOMY</p>
      </div>
      <canvas
        ref={canvas}
        width={640}
        height={360}
        className={styles.clouds}
        aria-hidden="true"
        style={{ background: progress === 0 ? "#dcefe6" : "transparent" }}
      />
    </div>
  );
}
