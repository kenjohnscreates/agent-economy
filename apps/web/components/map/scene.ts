// One layered Pixi scene consumes the frozen MapSlot props.
// Controllers and display objects are retained across updates; only incoming
// props build paths, text and line geometry. The ticker mutates existing objects.
import { Application, Container, Graphics, Sprite, Texture, type Ticker } from "pixi.js";
import type { Building } from "@agent-town/shared";
import type { MapSlotProps } from "../MapSlot";
import { zonePoint } from "../MapSlot";
import { txDirection, isMonetary } from "../../lib/direction";
import { formatUsdc } from "../../lib/usdc";
import { AgentMotion } from "./agents";
import { CoinPool } from "./coins";
import { makePath, route, type Point } from "./paths";
import { Chip, stackChips, wrapText, type ChipBox } from "./hud";
import { loadAssets, type MapAssets, type Frames } from "./assets";

interface AgentView {
  motion: AgentMotion;
  sprite: Sprite;
  frames: Frames;
  label: Chip;
  speech: Chip;
  ring: Graphics;
  emote: Sprite;
}
interface CoinView {
  sprite: Sprite;
  amount: Chip;
  line: Graphics;
}
interface Place extends Point {
  building: Building;
  approach: Point[];
  destination: Point;
}
const RINGS = ["ring_0", "ring_1", "ring_2", "ring_3"];
const LAYERS = ["sky", "far", "mid", "zones", "agents", "coins", "hud"] as const;

export class TownScene {
  readonly pool = new CoinPool();
  private props: MapSlotProps;
  private readonly layers = Object.fromEntries(
    LAYERS.map((name) => [name, new Container()]),
  ) as Record<(typeof LAYERS)[number], Container>;
  private readonly agents: AgentView[] = [];
  /** Agents with a live speech chip this frame, and their reused layout rectangles. */
  private readonly speakers: AgentView[] = [];
  private readonly speechBoxes: ChipBox[] = [];
  private readonly coins: CoinView[] = [];
  private readonly clouds: Sprite[] = [];
  private readonly foam: Sprite[] = [];
  private readonly leaves: Sprite[] = [];
  private readonly hover: Chip;
  private hovered: string | null = null;
  private readonly node: Sprite;
  private elapsed = 0;
  private pulseUntil = 0;
  private sampleAt = 0;
  private sampleFrames = 0;
  private warned = false;
  private dead = false;

  private constructor(
    readonly app: Application,
    private readonly assets: MapAssets,
    props: MapSlotProps,
  ) {
    this.props = { ...props, lastTx: null };
    for (const name of LAYERS) {
      this.layers[name].label = name;
      this.layers[name].eventMode = "none";
      app.stage.addChild(this.layers[name]);
    }
    this.layers.sky.addChild(new Sprite(assets.tiles.sky));
    this.layers.zones.addChild(new Sprite(assets.tiles.world));
    this.hover = new Chip(assets.tiles);
    this.hover.visible = false;
    this.layers.hud.addChild(this.hover);
    this.node = new Sprite(Texture.WHITE);
    this.node.position.set(315, 45);
    this.node.width = 8;
    this.node.height = 8;
    this.node.tint = 0x7cb342;
    this.node.visible = false;
    this.layers.zones.addChild(this.node);
    this.createAmbient();
    for (let i = 0; i < 32; i++) {
      const sprite = new Sprite(assets.tiles.coin);
      sprite.visible = false;
      const amount = new Chip(assets.tiles, 32);
      amount.visible = false;
      const line = new Graphics();
      line.visible = false;
      this.layers.coins.addChild(line, sprite, amount);
      this.coins.push({ sprite, amount, line });
    }
    this.set(props);
    app.ticker.add(this.update);
    app.canvas.addEventListener("pointermove", this.pointerMove);
    app.canvas.addEventListener("pointerleave", this.pointerLeave);
    app.canvas.addEventListener("click", this.click);
  }

  static async create(
    canvas: HTMLCanvasElement,
    props: MapSlotProps,
    cancelled: () => boolean,
  ): Promise<TownScene | null> {
    const assets = await loadAssets();
    if (cancelled()) return null;
    const app = new Application();
    try {
      await app.init({
        canvas,
        width: 640,
        height: 360,
        resolution: 1,
        antialias: false,
        background: 0x0b2e1b,
        preference: "webgl",
        autoStart: false,
        sharedTicker: false,
        roundPixels: true,
      });
    } catch (error) {
      if (app.renderer) app.destroy(false, { children: true });
      throw error;
    }
    if (cancelled()) {
      app.destroy(false, { children: true });
      return null;
    }
    const scene = new TownScene(app, assets, props);
    app.start();
    return scene;
  }

  private createAmbient(): void {
    for (let i = 0; i < 6; i++) {
      const cloud = new Sprite(this.assets.tiles[i % 2 ? "cloud_small" : "cloud_large"]);
      cloud.position.set(i * 113 + 16, 12 + (i % 3) * 28);
      this.layers.far.addChild(cloud);
      this.clouds.push(cloud);
    }
    for (let i = 0; i < 14; i++) {
      const fleck = new Sprite(Texture.WHITE);
      fleck.tint = 0xd9f0c6;
      fleck.width = i % 3 === 0 ? 2 : 1;
      fleck.height = 3;
      this.layers.zones.addChild(fleck);
      this.foam.push(fleck);
    }
    for (let i = 0; i < 8; i++) {
      const leaf = new Sprite(Texture.WHITE);
      leaf.tint = 0x7cb342;
      leaf.width = 2;
      leaf.height = 1;
      leaf.position.set(250 + ((i * 17) % 142), 35 + ((i * 11) % 24));
      this.layers.zones.addChild(leaf);
      this.leaves.push(leaf);
    }
  }

  private addAgent(data: MapSlotProps["agents"][number]): AgentView | null {
    const frames = this.assets.agents[data.name];
    if (!frames) return null;
    const motion = new AgentMotion(
      data,
      zonePoint(data.position.building, data.position.x, data.position.y),
    );
    const sprite = new Sprite(frames.idle_0);
    const label = new Chip(this.assets.tiles, 32);
    label.setText(data.name);
    const speech = new Chip(this.assets.tiles, 160);
    speech.setText(wrapText(data.narration ?? ""));
    const ring = new Graphics()
      .rect(-10, -2, 20, 1)
      .rect(-12, -1, 2, 3)
      .rect(10, -1, 2, 3)
      .rect(-10, 2, 20, 1)
      .fill(0x7cb342);
    const emote = new Sprite(this.assets.tiles.sprout_emote);
    this.layers.agents.addChild(ring, sprite);
    this.layers.hud.addChild(label, speech, emote);
    const view = { motion, sprite, frames, label, speech, ring, emote };
    this.agents.push(view);
    return view;
  }

  set(props: MapSlotProps): void {
    const txChanged = props.lastTx !== this.props.lastTx;
    const reset = props.tick < this.props.tick;
    if (reset) {
      this.pool.clear();
      for (const a of this.agents) a.motion.defaultUntilTick = -1;
    }
    if (props.reducedMotion && !this.props.reducedMotion) this.pool.reduceMotion();
    for (let i = this.agents.length - 1; i >= 0; i--) {
      const a = this.agents[i]!;
      if (props.agents.some((data) => data.name === a.motion.data.name)) continue;
      a.sprite.destroy();
      a.ring.destroy();
      a.label.destroy({ children: true });
      a.speech.destroy({ children: true });
      a.emote.destroy();
      this.agents.splice(i, 1);
    }
    for (const data of props.agents) {
      const a = this.agents.find((v) => v.motion.data.name === data.name) ?? this.addAgent(data);
      if (!a) continue;
      if (data.narration !== a.motion.data.narration)
        a.speech.setText(wrapText(data.narration ?? ""));
      a.motion.set(
        data,
        zonePoint(data.position.building, data.position.x, data.position.y),
        props.reducedMotion,
      );
      a.ring.visible = props.selected === data.name;
    }
    this.props = props;
    if (txChanged && props.lastTx) this.transaction();
    if (this.hovered) this.showHover(this.hovered);
    this.paintAgents(0);
  }

  private locate(party: string | null): Place | null {
    const agent = this.agents.find((a) => a.motion.data.name === party);
    if (agent)
      return {
        x: agent.motion.x,
        y: agent.motion.y,
        building: agent.motion.data.position.building,
        approach: agent.motion.approach(),
        destination: zonePoint(
          agent.motion.data.position.building,
          agent.motion.data.position.x,
          agent.motion.data.position.y,
        ),
      };
    if (party === "treasury" || party === "mayor") {
      const point = zonePoint("bank", 0.5, party === "mayor" ? 0 : 0.5);
      return { ...point, building: "bank", approach: [point], destination: point };
    }
    if (party === "escrow") {
      const point = zonePoint("workshop", 0.5, 0.5);
      return { ...point, building: "workshop", approach: [point], destination: point };
    }
    return null;
  }

  private transaction(): void {
    const tx = this.props.lastTx!;
    if (["approve_loan", "deny_loan", "mark_default", "set_rate"].includes(tx.kind))
      this.pulseUntil = this.elapsed + 480;
    if (tx.kind === "mark_default") {
      const borrower = this.agents.find(
        (a) => a.motion.data.name === (tx.counterparty ?? tx.agent),
      );
      if (borrower) borrower.motion.defaultUntilTick = tx.tick + 2;
    }
    if (!isMonetary(tx)) return;
    const direction = txDirection(tx.kind, tx.agent, tx.counterparty);
    const from = this.locate(direction.from),
      to = this.locate(direction.to);
    if (!from || !to) return;
    const between = route(from.building, from.approach.at(-1)!, to.building, to.destination);
    // The receiver completes its 750ms walk before this 900ms flight arrives.
    const path = makePath([...from.approach, ...between.points.slice(1)]);
    const coin = this.pool.spawn(path, formatUsdc(tx.amountUsdc), this.props.reducedMotion);
    if (!coin) return;
    const view = this.coins[this.pool.slots.indexOf(coin)]!;
    view.amount.setText(coin.amount);
    // Bresenham-like integer pixels, so even reduced-motion diagonals have hard edges.
    view.line.clear();
    const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
    for (let i = 0; i <= steps; i++)
      view.line.rect(
        Math.round(from.x + ((to.x - from.x) * i) / (steps || 1)),
        Math.round(from.y + ((to.y - from.y) * i) / (steps || 1)),
        1,
        1,
      );
    view.line.fill(0x7cb342);
  }

  private paintAgents(ms: number): void {
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i]!,
        m = a.motion;
      m.update(ms, this.props.tick, this.props.reducedMotion);
      a.sprite.texture = a.frames[m.frame]!;
      a.sprite.position.set(Math.round(m.x) - 24, Math.round(m.y) - 47);
      a.ring.position.set(Math.round(m.x), Math.round(m.y));
      a.label.place(m.x - a.label.chipWidth / 2, m.y - 54);
      a.emote.visible = m.elapsed < m.emoteUntil;
      a.emote.position.set(
        Math.max(0, Math.min(624, Math.round(m.x) + 13)),
        Math.max(0, Math.round(m.y) - 46),
      );
      if (m.data.name === this.hovered) this.hover.place(m.x + 18, m.y - 30);
    }
    this.layoutSpeech();
  }

  /**
   * Speech chips used to sit at a fixed height above each head, so two agents standing
   * together drew their lines on top of each other and neither could be read (M5.13).
   * Chips are laid out together now: newest speech keeps the spot beside its own head and
   * older chips are lifted clear of it, or dropped when there is no room left.
   *
   * Remaining speech time is the sort key. It compares across agents because every
   * controller advances by the same ms each frame, and the agent name breaks ties, so the
   * order holds still from frame to frame and no chip can shuffle or bounce.
   */
  private layoutSpeech(): void {
    this.speakers.length = 0;
    for (const a of this.agents) {
      a.speech.visible = false;
      if (a.motion.elapsed < a.motion.speechUntil) this.speakers.push(a);
    }
    if (this.speakers.length === 0) return;
    this.speakers.sort((p, q) => {
      const left =
        q.motion.speechUntil - q.motion.elapsed - (p.motion.speechUntil - p.motion.elapsed);
      return left !== 0 ? left : p.motion.data.name < q.motion.data.name ? -1 : 1;
    });
    for (let i = 0; i < this.speakers.length; i++) {
      const { motion: m, speech } = this.speakers[i]!;
      let box = this.speechBoxes[i];
      if (!box) {
        box = { x: 0, y: 0, width: 0, height: 0, visible: false };
        this.speechBoxes[i] = box;
      }
      box.width = speech.chipWidth;
      box.height = speech.chipHeight;
      box.x = m.x - speech.chipWidth / 2;
      box.y = m.y - 58 - speech.chipHeight;
      box.visible = false;
    }
    stackChips(this.speechBoxes, this.speakers.length);
    for (let i = 0; i < this.speakers.length; i++) {
      const speech = this.speakers[i]!.speech,
        box = this.speechBoxes[i]!;
      speech.visible = box.visible;
      speech.place(box.x, box.y);
    }
  }

  private paintCoins(): void {
    for (let i = 0; i < 32; i++) {
      const c = this.pool.slots[i]!,
        v = this.coins[i]!;
      v.sprite.visible = c.active && c.stage !== "line";
      v.line.visible = c.active && c.stage === "line";
      v.amount.visible = c.active && c.stage === "flight" && c.elapsed < 300;
      if (!c.active) continue;
      const ring = c.stage === "ring";
      v.sprite.texture = ring
        ? this.assets.tiles[RINGS[Math.min(3, Math.floor((c.elapsed - 900) / 100))]!]!
        : this.assets.tiles.coin!;
      v.sprite.position.set(Math.round(c.x) - (ring ? 8 : 3), Math.round(c.y) - (ring ? 8 : 3));
      v.amount.place(c.x + 7, c.y - 10);
    }
  }

  private update = (ticker: Ticker): void => {
    const ms = ticker.deltaMS;
    this.elapsed += ms;
    this.pool.update(ms);
    this.paintAgents(ms);
    this.paintCoins();
    this.paintAmbient(ms);
    const pulse =
      this.elapsed < this.pulseUntil &&
      Math.floor((this.pulseUntil - this.elapsed) / 120) % 2 === 1;
    this.node.visible = pulse;
    this.sampleFrames++;
    if (this.elapsed - this.sampleAt >= 1000) this.measure(ticker);
  };

  private paintAmbient(ms: number): void {
    const reduced = this.props.reducedMotion;
    const rate = this.props.phase === "default" || this.props.phase === "hike" ? 0.5 : 1;
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i]!;
      if (!reduced) {
        c.x -= ms * 0.002 * rate;
        if (c.x < -64) c.x = 640;
      }
    }
    const frame = Math.floor(this.elapsed / 250);
    for (let i = 0; i < this.foam.length; i++) {
      const f = this.foam[i]!;
      f.x = i < 10 ? 340 + (i % 5) * 2 : 411 + (i % 2);
      f.y = i < 10 ? 120 + ((i * 11 + frame * 3) % 41) : 340 + ((i * 7 + frame * 2) % 17);
    }
    for (let i = 0; i < this.leaves.length; i++) this.leaves[i]!.visible = (frame + i) % 4 !== 0;
  }

  private measure(ticker: Ticker): void {
    const canvas = this.app.canvas;
    canvas.dataset.fps = ticker.FPS.toFixed(1);
    canvas.dataset.activeCoins = String(this.pool.activeCount);
    const fps = (this.sampleFrames * 1000) / (this.elapsed - this.sampleAt);
    if (this.elapsed > 3000 && document.visibilityState === "visible" && fps < 55 && !this.warned) {
      console.warn(`Town map: ${fps.toFixed(1)} FPS (target 60)`);
      this.warned = true;
    }
    if (fps >= 55) this.warned = false;
    this.sampleAt = this.elapsed;
    this.sampleFrames = 0;
  }

  private pick(event: MouseEvent): string | null {
    const rect = this.app.canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) * 640) / rect.width,
      y = ((event.clientY - rect.top) * 360) / rect.height;
    let hit: string | null = null,
      distance = Infinity;
    for (const a of this.agents) {
      const dx = x - a.motion.x,
        dy = y - (a.motion.y - 20);
      const d = dx * dx + dy * dy;
      if (Math.abs(dx) <= 17 && Math.abs(dy) <= 21 && d < distance) {
        hit = a.motion.data.name;
        distance = d;
      }
    }
    return hit;
  }
  private showHover(name: string | null): void {
    this.hovered = name;
    const a = this.agents.find((v) => v.motion.data.name === name);
    this.hover.visible = !!a;
    if (a) {
      this.hover.setText(
        `${a.motion.data.name} / ${a.motion.data.role}\n${formatUsdc(a.motion.data.balanceUsdc)} USDC`,
      );
      this.layers.hud.addChild(this.hover);
    }
    this.app.canvas.style.cursor = a ? "pointer" : "default";
  }
  private pointerMove = (event: PointerEvent): void => {
    const name = this.pick(event);
    if (name !== this.hovered) this.showHover(name);
  };
  private pointerLeave = (): void => this.showHover(null);
  private click = (event: MouseEvent): void => {
    const name = this.pick(event);
    this.props.onSelectAgent(name === this.props.selected ? null : name);
  };
  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    this.app.canvas.removeEventListener("pointermove", this.pointerMove);
    this.app.canvas.removeEventListener("pointerleave", this.pointerLeave);
    this.app.canvas.removeEventListener("click", this.click);
    this.app.ticker.remove(this.update);
    this.app.destroy(false, { children: true, texture: false, textureSource: false });
  }
}
