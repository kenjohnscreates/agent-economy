"use client";
// Client boundary for the Pixi scene: props, native keyboard access and resize.
// Async initialization is cancellable across Strict Mode remounts.
// The renderer stays at 640x360; CSS applies whole-number nearest scaling.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MapSlotProps } from "../MapSlot";
import type { TownScene } from "./scene";
import { isMonetary, txDirection } from "../../lib/direction";
import { formatUsdc } from "../../lib/usdc";

export function mapDescription(p: MapSlotProps): string {
  let description = `Town map, round ${p.tick}, phase ${p.phase}, ${p.agents.length} agents`;
  if (p.lastTx && isMonetary(p.lastTx)) {
    const d = txDirection(p.lastTx.kind, p.lastTx.agent, p.lastTx.counterparty);
    description += `, last payment ${d.from} to ${d.to} ${formatUsdc(p.lastTx.amountUsdc)} USDC`;
  }
  if (p.selected) description += `, selected ${p.selected}`;
  return description;
}

export function TownMap(props: MapSlotProps) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props);
  const scene = useRef<TownScene | null>(null);
  const queued = useRef<MapSlotProps[]>([]);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    latest.current = props;
    if (scene.current) scene.current.set(props);
    else queued.current.push(props);
  }, [props]);

  useEffect(() => {
    if (typeof window === "undefined" || !canvas.current || !host.current) return;
    let cancelled = false;
    let owned: TownScene | null = null;
    const element = canvas.current;
    const container = host.current;
    const fit = () => {
      const width = container.clientWidth,
        height = container.clientHeight;
      const scale = Math.max(1, Math.min(4, Math.floor(Math.min(width / 640, height / 360))));
      element.style.width = `${640 * scale}px`;
      element.style.height = `${360 * scale}px`;
      element.style.left = `${Math.max(0, Math.floor((width - 640 * scale) / 2))}px`;
      element.style.top = `${Math.max(0, Math.floor((height - 360 * scale) / 2))}px`;
      element.dataset.scale = String(scale);
    };
    const resize = new ResizeObserver(fit);
    resize.observe(container);
    fit();
    void import("./scene")
      .then(async ({ TownScene }) => {
        if (cancelled) return;
        const first = queued.current[0] ?? latest.current;
        owned = await TownScene.create(element, first, () => cancelled);
        if (cancelled || !owned) return;
        scene.current = owned;
        for (const p of queued.current) owned.set(p);
        queued.current = [];
        element.dataset.ready = "true";
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Unable to initialize the town map");
      });
    return () => {
      cancelled = true;
      resize.disconnect();
      owned?.destroy();
      if (scene.current === owned) scene.current = null;
      delete element.dataset.ready;
    };
  }, []);

  return (
    <div
      ref={host}
      data-town-map="true"
      style={{ position: "absolute", inset: 0, overflow: "auto", background: "#0B2E1B" }}
    >
      <link rel="icon" href="/brand/mark.png" />
      <canvas
        ref={canvas}
        width={640}
        height={360}
        role="img"
        tabIndex={0}
        aria-label={mapDescription(props)}
        data-tick={props.tick}
        data-phase={props.phase}
        data-selected={props.selected ?? ""}
        data-reduced-motion={props.reducedMotion}
        style={{ position: "absolute", display: "block", imageRendering: "pixelated" }}
        onKeyDown={(event) => {
          const p = latest.current;
          if (event.key.startsWith("Arrow") && p.agents.length) {
            event.preventDefault();
            const backward = event.key === "ArrowLeft" || event.key === "ArrowUp";
            const index = p.agents.findIndex((a) => a.name === p.selected);
            const next =
              index < 0
                ? backward
                  ? p.agents.length - 1
                  : 0
                : (index + (backward ? -1 : 1) + p.agents.length) % p.agents.length;
            p.onSelectAgent(p.agents[next]!.name);
          } else if (event.key === "Enter") {
            event.preventDefault();
            p.onSelectAgent(p.selected ?? p.agents[0]?.name ?? null);
          } else if (event.key === "Escape") {
            event.preventDefault();
            p.onSelectAgent(null);
          }
        }}
      />
      {error && (
        <div
          role="alert"
          style={{ position: "absolute", inset: 24, color: "#D9F0C6", background: "#0B2E1B" }}
        >
          The town map could not load. {error}
        </div>
      )}
      <style>{`.agent img[src^="/sprites/"] { object-fit: none; object-position: left top; }`}</style>
    </div>
  );
}
