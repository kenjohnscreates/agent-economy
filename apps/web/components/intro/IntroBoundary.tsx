"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { INTRO_SESSION_KEY, introFinished, introMode } from "../../lib/intro";
import { CoastalScene } from "./CoastalScene";
import { IntroReadiness } from "./readiness";
import styles from "./intro.module.css";

let seenInMemory = false;
export function IntroBoundary({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(true);
  const [assetsReady, setAssetsReady] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [time, setTime] = useState(0);
  const mapReady = useRef(false);
  const readyAt = useRef<number | null>(null);
  const content = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const finish = useCallback(() => {
    seenInMemory = true;
    try {
      sessionStorage.setItem(INTRO_SESSION_KEY, "1");
    } catch {
      /* Storage can be unavailable. */
    }
    const restoreFocus = overlay.current?.contains(document.activeElement);
    setActive(false);
    if (restoreFocus && content.current) {
      content.current.inert = false;
      content.current.focus({ preventScroll: true });
    }
  }, []);
  const notify = useCallback(
    (status: "ready" | "error") => {
      mapReady.current = true;
      if (status === "error") finish();
    },
    [finish],
  );
  const loaded = useCallback(() => setAssetsReady(true), []);
  useEffect(() => {
    let seen = seenInMemory;
    try {
      seen ||= !!sessionStorage.getItem(INTRO_SESSION_KEY);
    } catch {
      /* Use memory fallback. */
    }
    if (!introMode(location.search, seen)) setActive(false);
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!active) return;
    const timeout = setTimeout(finish, 12000);
    return () => clearTimeout(timeout);
  }, [active, finish]);
  useEffect(() => {
    if (!active || !assetsReady) return;
    let frame = 0;
    const start = performance.now();
    readyAt.current = null;
    const tick = (now: number) => {
      const elapsed = now - start;
      if (mapReady.current && readyAt.current === null) readyAt.current = elapsed;
      setTime(elapsed);
      if (introFinished(elapsed, readyAt.current, reduced)) finish();
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, assetsReady, reduced, finish]);
  const fade =
    !reduced && readyAt.current !== null
      ? Math.max(0, Math.min(1, (time - Math.max(2100, readyAt.current)) / 400))
      : 0;
  return (
    <IntroReadiness.Provider value={notify}>
      <div
        ref={content}
        data-intro-content
        suppressHydrationWarning
        inert={active}
        tabIndex={-1}
        className={styles.content}
      >
        {children}
      </div>
      {active && (
        <div
          ref={overlay}
          className={styles.overlay}
          style={{ opacity: 1 - fade }}
          data-intro-overlay
        >
          <CoastalScene time={time} reduced={reduced} onReady={loaded} onError={finish} />
          <div className={styles.footer}>
            <span role="status">Opening Botanica</span>
            <button onClick={finish}>Skip intro</button>
          </div>
        </div>
      )}
    </IntroReadiness.Provider>
  );
}
