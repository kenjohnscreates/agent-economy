"use client";
import { useEffect, useState } from "react";
import { IntroVideo } from "../../components/intro/IntroVideo";
import styles from "../../components/intro/intro.module.css";
export default function IntroDemo() {
  const [reduced, setReduced] = useState(true);
  const [known, setKnown] = useState(false);
  const [replay, setReplay] = useState(0);
  const [error, setError] = useState(false);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    setKnown(true);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return (
    <main className={styles.demo} data-intro-demo>
      {known && (
        <IntroVideo key={replay} reduced={reduced} controls onError={() => setError(true)} />
      )}
      <div className={styles.controls}>
        <button onClick={() => setReplay((value) => value + 1)} disabled={reduced}>
          Replay
        </button>
        <a href="/intro/reveal.mp4" download="botanica-cloud-reveal.mp4">
          Download video
        </a>
        {reduced && <span>Reduced motion: still preview</span>}
        {error && <span role="alert">Video could not load. Download it or refresh to retry.</span>}
      </div>
    </main>
  );
}
