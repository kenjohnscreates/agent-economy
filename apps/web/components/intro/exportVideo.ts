import { revealProgress } from "../../lib/intro";
import { drawClouds } from "./CoastalScene";

// Shares the artwork, font families, cloud renderer and timeline with the page.
// Export is explicit and always uses the cinematic motion, even on reduced-motion devices.
export async function exportVideo(signal: AbortSignal): Promise<Blob> {
  if (typeof MediaRecorder === "undefined")
    throw new Error("Video export is unavailable in this browser.");
  const load = async (src: string) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    return img;
  };
  const [landscape, robot, mark] = await Promise.all([
    load("/intro/landscape.webp"),
    load("/intro/robot.png"),
    load("/brand/mark.png"),
    document.fonts.ready,
  ]);
  signal.throwIfAborted();
  const canvas = document.createElement("canvas");
  canvas.width = 1920;
  canvas.height = 1080;
  const clouds = document.createElement("canvas");
  clouds.width = 640;
  clouds.height = 360;
  const ctx = canvas.getContext("2d")!,
    cloudCtx = clouds.getContext("2d")!;
  const fonts = getComputedStyle(document.documentElement);
  const titleFont = fonts.getPropertyValue("--font-space-grotesk").trim();
  const monoFont = fonts.getPropertyValue("--font-space-mono").trim();
  const paint = (time: number) => {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(landscape, 0, 0, 1920, 1080);
    ctx.drawImage(
      robot,
      (300 / 1672) * 1920,
      (580 / 941) * 1080 + Math.round(Math.sin((time / 1800) * Math.PI * 2) * 3),
      (139 / 1672) * 1920,
      (242 / 941) * 1080,
    );
    ctx.fillStyle = "#0b2e1b";
    ctx.textBaseline = "alphabetic";
    ctx.font = `700 172.8px ${titleFont}`;
    ctx.letterSpacing = "-8.64px";
    const width = ctx.measureText("Botanica").width;
    const left = (1920 - width - 111.36 - 42.24) / 2;
    ctx.drawImage(mark, left, 300.72, 111.36, 111.36);
    ctx.fillText("Botanica", left + 153.6, 410);
    ctx.font = `400 34.56px ${monoFont}`;
    ctx.letterSpacing = "8.256px";
    const subtitle = "THE AGENT ECONOMY";
    ctx.fillText(subtitle, 1032 - ctx.measureText(subtitle).width / 2, 513);
    ctx.letterSpacing = "0px";
    drawClouds(cloudCtx, revealProgress(time, true));
    ctx.drawImage(clouds, 0, 0, 1920, 1080);
  };
  paint(0);
  const stream = canvas.captureStream(30);
  const mimeType = ["video/mp4;codecs=avc1.42001E", "video/webm;codecs=vp9", "video/webm"].find(
    (type) => MediaRecorder.isTypeSupported(type),
  );
  if (!mimeType) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error("No supported video encoder.");
  }
  return new Promise((resolve, reject) => {
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 10000000 });
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      reject(error);
      return;
    }
    const chunks: Blob[] = [];
    let frame = 0;
    const cleanup = () => {
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
      stream.getTracks().forEach((track) => track.stop());
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      if (recorder.state !== "inactive") recorder.stop();
      cleanup();
      reject(new DOMException("Export cancelled", "AbortError"));
    };
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onerror = () => {
      cleanup();
      reject(new Error("Video recording failed."));
    };
    recorder.onstop = () => {
      cleanup();
      if (!signal.aborted) resolve(new Blob(chunks, { type: mimeType.split(";")[0] }));
    };
    signal.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, 15000);
    try {
      recorder.start();
    } catch (error) {
      cleanup();
      reject(error);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      paint(Math.min(9000, now - start));
      if (now - start < 9000) frame = requestAnimationFrame(tick);
      else recorder.stop();
    };
    frame = requestAnimationFrame(tick);
    // A background tab may stop receiving animation frames. Never leave recording running.
  });
}
