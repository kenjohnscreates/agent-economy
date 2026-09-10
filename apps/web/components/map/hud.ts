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
    this.x = Math.max(1, Math.min(639 - this.chipWidth, Math.round(x)));
    this.y = Math.max(1, Math.min(359 - this.chipHeight, Math.round(y)));
  }
}
