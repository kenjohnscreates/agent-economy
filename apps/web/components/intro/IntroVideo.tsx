"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./intro.module.css";

export function IntroVideo({
  reduced,
  controls = false,
  onEnded,
  onError,
}: {
  reduced: boolean;
  controls?: boolean;
  onEnded?: () => void;
  onError?: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const element = video.current;
    if (!element || reduced) return;
    let cancelled = false;
    void element.play().catch(() => {
      if (!cancelled) setBlocked(true);
    });
    return () => {
      cancelled = true;
      element.pause();
    };
  }, [reduced]);
  return (
    <div className={styles.scene} data-intro-video>
      {reduced ? (
        <img
          className={styles.videoStill}
          src="/intro/ending.webp"
          alt="A small robot overlooking the Botanica island coast"
          onError={onError}
        />
      ) : (
        <video
          ref={video}
          className={styles.video}
          src="/intro/reveal.mp4"
          muted
          playsInline
          preload="auto"
          controls={controls}
          onEnded={onEnded}
          onError={onError}
          aria-label="Botanica coastal cloud reveal"
        />
      )}
      {blocked && !reduced && (
        <button
          className={styles.playVideo}
          onClick={() => {
            void video.current
              ?.play()
              .then(() => setBlocked(false))
              .catch(() => onError?.());
          }}
        >
          Play intro
        </button>
      )}
    </div>
  );
}
