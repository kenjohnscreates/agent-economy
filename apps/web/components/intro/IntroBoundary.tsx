"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { INTRO_SESSION_KEY, videoIntroFinished, introMode } from "../../lib/intro";
import { IntroVideo } from "./IntroVideo";
import { IntroReadiness } from "./readiness";
import styles from "./intro.module.css";

let seenInMemory = false;
export function IntroBoundary({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(true);
  const [reduced, setReduced] = useState(true);
  const [motionKnown, setMotionKnown] = useState(false);
  const [ended, setEnded] = useState(false);
  const [mapReady, setMapReady] = useState(false);
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
      setMapReady(true);
      if (status === "error") finish();
    },
    [finish],
  );
  const movieEnded = useCallback(() => setEnded(true), []);
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
    setMotionKnown(true);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!active) return;
    const timeout = setTimeout(finish, 20000);
    return () => clearTimeout(timeout);
  }, [active, finish]);
  useEffect(() => {
    if (active && motionKnown && videoIntroFinished(mapReady, ended, reduced)) finish();
  }, [active, motionKnown, mapReady, ended, reduced, finish]);
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
        <div ref={overlay} className={styles.overlay} data-intro-overlay>
          {motionKnown && <IntroVideo reduced={reduced} onEnded={movieEnded} onError={finish} />}
          <div className={styles.footer}>
            <span role="status">Opening Botanica</span>
            <button onClick={finish}>Skip intro</button>
          </div>
        </div>
      )}
    </IntroReadiness.Provider>
  );
}
