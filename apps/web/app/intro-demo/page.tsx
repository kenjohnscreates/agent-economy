"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CoastalScene } from "../../components/intro/CoastalScene";
import styles from "../../components/intro/intro.module.css";
export default function IntroDemo() {
  const [time, setTime] = useState(0);
  const currentTime = useRef(0);
  currentTime.current = time;
  const [playing, setPlaying] = useState(true);
  const [ready, setReady] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [capture, setCapture] = useState(false);
  const [error, setError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null);
  const exportAbort = useRef<AbortController | null>(null);
  const downloadUrl = useRef<string | null>(null);
  useEffect(
    () => () => {
      exportAbort.current?.abort();
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
    },
    [],
  );
  const saveVideo = async () => {
    setExporting(true);
    setExportError("");
    const controller = new AbortController();
    exportAbort.current = controller;
    try {
      const { exportVideo } = await import("../../components/intro/exportVideo");
      const blob = await exportVideo(controller.signal);
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
      const url = URL.createObjectURL(blob);
      downloadUrl.current = url;
      setDownload({
        url,
        name: `botanica-cloud-reveal.${blob.type === "video/mp4" ? "mp4" : "webm"}`,
      });
    } catch (e) {
      if (!controller.signal.aborted)
        setExportError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      if (!controller.signal.aborted) setExporting(false);
    }
  };
  const loaded = useCallback(() => setReady(true), []);
  const failed = useCallback(() => setError(true), []);
  useEffect(() => {
    const query = new URLSearchParams(location.search);
    setCapture(query.has("capture"));
    if (query.has("still")) {
      setTime(Math.max(0, Math.min(9000, Number(query.get("still")) || 0)));
      setPlaying(false);
    }
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!ready || !playing || reduced) return;
    let frame = 0;
    let previous = performance.now();
    let elapsed = currentTime.current;
    const tick = (now: number) => {
      const delta = now - previous;
      previous = now;
      elapsed = Math.min(9000, elapsed + delta);
      setTime(elapsed);
      if (elapsed < 9000) frame = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ready, playing, reduced]);
  return (
    <main className={styles.demo} data-intro-demo data-assets-ready={ready}>
      <CoastalScene time={time} movie reduced={reduced} onReady={loaded} onError={failed} />
      {!capture && (
        <div className={styles.controls}>
          <button
            onClick={() => {
              setTime(0);
              setPlaying(true);
            }}
          >
            Replay
          </button>
          <button onClick={() => setPlaying((old) => !old)} disabled={reduced}>
            {playing ? "Pause" : "Play"}
          </button>
          <input
            type="range"
            aria-label="Preview time"
            min="0"
            max="9000"
            step="40"
            value={time}
            onChange={(event) => {
              setPlaying(false);
              setTime(Number(event.target.value));
            }}
          />
          <output>{reduced ? "Still" : `${(time / 1000).toFixed(1)}s`}</output>
          <button onClick={saveVideo} disabled={!ready || exporting}>
            {exporting ? "Recording…" : "Export video"}
          </button>
          {download && (
            <a href={download.url} download={download.name}>
              Download video
            </a>
          )}
          {exportError && <span role="alert">{exportError}</span>}
          {error && <span role="alert">Artwork could not load. Refresh to retry.</span>}
        </div>
      )}
    </main>
  );
}
