// Generated PNG strips and atlas metadata, cached across React remounts.
// Imported only by the lazy client scene, never during server rendering.
// Shared texture sources survive scene disposal and use nearest sampling.
import { Assets, Rectangle, Texture } from "pixi.js";
import { ROSTER } from "@agent-town/shared";

type Frame = { x: number; y: number; w: number; h: number };
export type Frames = Record<string, Texture>;
export interface MapAssets {
  tiles: Frames;
  agents: Record<string, Frames>;
}
let pending: Promise<MapAssets> | undefined;

async function sheet(path: string): Promise<Frames> {
  const [texture, response] = await Promise.all([
    Assets.load<Texture>(`${path}.png`),
    fetch(`${path}.json`),
  ]);
  if (!response.ok) throw new Error(`Cannot load map atlas: ${path}`);
  const metadata = (await response.json()) as { frames: Record<string, Frame> };
  texture.source.scaleMode = "nearest";
  texture.source.autoGenerateMipmaps = false;
  const frames: Frames = {};
  for (const [name, r] of Object.entries(metadata.frames)) {
    frames[name] = new Texture({
      source: texture.source,
      frame: new Rectangle(r.x, r.y, r.w, r.h),
    });
  }
  return frames;
}

export function loadAssets(): Promise<MapAssets> {
  if (!pending)
    pending = Promise.all([
      sheet("/tiles/atlas"),
      Promise.all(ROSTER.map(async (a) => [a.name, await sheet(`/sprites/${a.name}`)] as const)),
    ])
      .then(([tiles, agents]) => ({ tiles, agents: Object.fromEntries(agents) }))
      .catch((e: unknown) => {
        pending = undefined;
        throw e;
      });
  return pending;
}
