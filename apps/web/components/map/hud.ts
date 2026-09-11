// Pixel-only text chips backed by the generated 5x7 atlas.
// Glyph sprites are allocated once; content changes only in response to props.
// Positioning and visibility in the animation loop never rebuild geometry.
import { Container, Sprite, Texture } from "pixi.js";
import type { Frames } from "./assets";

export function wrapText(text: string, columns = 24): string {
  const words = text.slice(0, 120).replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (let word of words) {
    if (line && line.length + word.length + 1 > columns) {
      lines.push(line);
      line = "";
    }
    while (word.length > columns) {
      lines.push(word.slice(0, columns));
      word = word.slice(columns);
    }
    line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

export class Chip extends Container {
  private readonly background = new Sprite(Texture.WHITE);
  private readonly glyphs: Sprite[];
  private text = "";
  chipWidth = 0;
  chipHeight = 0;
  constructor(
    private readonly atlas: Frames,
    capacity = 120,
  ) {
    super();
    this.eventMode = "none";
    this.background.tint = 0x0b2e1b;
    this.addChild(this.background);
    this.glyphs = Array.from({ length: capacity }, () => {
      const s = new Sprite();
      s.visible = false;
      this.addChild(s);
      return s;
    });
  }
  setText(text: string): void {
    if (this.text === text) return;
    this.text = text;
    const content = text
      .toUpperCase()
      .replace(/[\u2019\u2018]/g, "'")
      .replace(/\u2026/g, "...")
      .replace(/[\u2013\u2014]/g, "-");
    let x = 0,
      y = 0,
      width = 0,
      index = 0;
    for (const char of content) {
      if (char === "\n") {
        width = Math.max(width, x);
        x = 0;
        y += 10;
        continue;
      }
      const sprite = this.glyphs[index++];
      if (!sprite) break;
      sprite.visible = char !== " ";
      sprite.texture = this.atlas[`glyph_${char}`] ?? this.atlas["glyph_?"]!;
      sprite.position.set(x + 4, y + 3);
      x += 6;
    }
    for (let i = index; i < this.glyphs.length; i++) this.glyphs[i]!.visible = false;
    this.chipWidth = Math.max(width, x) + 7;
    this.chipHeight = y + 13;
    this.background.width = this.chipWidth;
    this.background.height = this.chipHeight;
  }
  place(x: number, y: number): void {
    this.x = clampX(x, this.chipWidth);
    this.y = clampY(y, this.chipHeight);
  }
}

/** Native frame from the brand book, the same 640x360 the scene renders into. */
export const MAP_WIDTH = 640;
export const MAP_HEIGHT = 360;
/** Whole pixels of clear space kept between two chips, horizontally and vertically. */
export const CHIP_GAP = 2;

function clampX(x: number, width: number): number {
  return Math.max(1, Math.min(MAP_WIDTH - 1 - width, Math.round(x)));
}
function clampY(y: number, height: number): number {
  return Math.max(1, Math.min(MAP_HEIGHT - 1 - height, Math.round(y)));
}

/** A chip's wanted rectangle on the way in, its resolved rectangle on the way out. */
export interface ChipBox {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
}

/**
 * Keeps speech chips off each other (M5.13). Boxes arrive in priority order, newest
 * speech first, each one asking for the spot directly above its own agent. The first box
 * gets what it asked for; every later box that would land on an already placed one is
 * lifted to sit a whole `gap` of pixels above it, so it still points down at its own
 * agent and still reads as that agent's line. A box with no room left above the frame is
 * hidden instead, which caps how many chips show at once with the newest winning.
 *
 * Boxes are resolved in place so the animation loop allocates nothing, and the result is
 * a pure function of the wanted rectangles: same input, same integer output, no easing,
 * no per-frame drift, nothing that could bounce.
 */
export function stackChips(boxes: ChipBox[], count = boxes.length, gap = CHIP_GAP): void {
  for (let i = 0; i < count; i++) {
    const box = boxes[i]!;
    box.x = clampX(box.x, box.width);
    let y = clampY(box.y, box.height);
    // Each pass lifts above at least one placed box and y only ever decreases, so the
    // worst case is one pass per box already on the map.
    for (let pass = 0; pass <= i; pass++) {
      let lifted = false;
      for (let j = 0; j < i; j++) {
        const other = boxes[j]!;
        if (!other.visible) continue;
        if (box.x >= other.x + other.width + gap) continue;
        if (other.x >= box.x + box.width + gap) continue;
        if (y >= other.y + other.height + gap) continue;
        if (other.y >= y + box.height + gap) continue;
        y = other.y - box.height - gap;
        lifted = true;
      }
      if (!lifted) break;
    }
    box.visible = y >= 1;
    box.y = Math.max(1, y);
  }
}
