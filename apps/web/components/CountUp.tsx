"use client";
// Numbers count up (brand book §16: "Numbers count up. Nothing bounces.").
// 180 ms ease-out; static under prefers-reduced-motion.
import { useEffect, useRef, useState } from "react";

export function CountUp({
  value,
  format,
  reducedMotion,
}: {
  value: number;
  format: (n: number) => string;
  reducedMotion: boolean;
}) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  useEffect(() => {
    if (reducedMotion) {
      setShown(value);
      fromRef.current = value;
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    const dur = 180;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - (1 - p) * (1 - p);
      setShown(from + (value - from) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, reducedMotion]);
  return <>{format(shown)}</>;
}
