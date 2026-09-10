"use client";
// useTown: the one hook the UI calls. Loads the snapshot, attaches the stream
// (live SSE or recorded replay) to the reducer, refetches /agents and /loans on every
// tick in live mode (positions, balances and the loan book only live there), and
// exposes controls.
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { api } from "./api";
import { openReplay, type ReplayControls, type ReplayFile } from "./replay";
import { openTownStream, type StreamHandle } from "./sse";
import { initialState, reduce, type TownAction, type TownState } from "./store";

export type TownSource = { mode: "live"; apiUrl?: string } | { mode: "replay"; file: ReplayFile };

export interface TownControls {
  pause(): void;
  resume(): void;
  setSpeed(x: number): void;
  seekTick(tick: number): void;
  /** Refetch `/loans` now (live only), e.g. after a mayor decision, so the queue updates before the next tick. */
  refreshLoans(): void;
}

export function useTown(source: TownSource | null): {
  state: TownState;
  controls: TownControls;
  error: string | null;
  speed: number;
  paused: boolean;
} {
  const [state, dispatch] = useReducer(reduce, undefined, initialState);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeedState] = useState(1);
  const [paused, setPaused] = useState(false);
  const replayRef = useRef<ReplayControls | null>(null);
  const liveRef = useRef<StreamHandle | null>(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    setError(null);
    dispatch({ event: "status", data: "connecting" });

    const guarded = (a: TownAction) => {
      if (cancelled || (pausedRef.current && source.mode === "live")) return;
      dispatch(a);
    };

    if (source.mode === "replay") {
      replayRef.current = openReplay(source.file, guarded, { speed });
      dispatch({ event: "status", data: "replay" });
      return () => {
        cancelled = true;
        replayRef.current?.close();
        replayRef.current = null;
      };
    }

    const base = source.apiUrl;
    (async () => {
      try {
        const [agents, scoreboard, loans] = await Promise.all([
          api.agents(base),
          api.scoreboard(base),
          api.loans(undefined, base),
        ]);
        if (cancelled) return;
        dispatch({ event: "agents", data: agents });
        dispatch({ event: "scoreboard", data: scoreboard });
        dispatch({ event: "loans", data: loans });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
      if (cancelled) return;
      liveRef.current = openTownStream(
        api.eventsUrl(base),
        (e) => {
          guarded(e);
          if (e.event === "tick") {
            api
              .agents(base)
              .then((agents) => guarded({ event: "agents", data: agents }))
              .catch(() => undefined);
          }
          if (e.event === "tick" || e.event === "loan_flagged") {
            api
              .loans(undefined, base)
              .then((l) => guarded({ event: "loans", data: l }))
              .catch(() => undefined);
          }
        },
        (s) => guarded({ event: "status", data: s }),
      );
    })();

    return () => {
      cancelled = true;
      liveRef.current?.close();
      liveRef.current = null;
    };
    // `speed` is applied through controls, not by reconnecting, so it is not a dependency.
  }, [source]);

  const pause = useCallback(() => {
    pausedRef.current = true;
    setPaused(true);
    replayRef.current?.pause();
  }, []);
  const resume = useCallback(() => {
    pausedRef.current = false;
    setPaused(false);
    replayRef.current?.resume();
  }, []);
  const setSpeed = useCallback((x: number) => {
    setSpeedState(x);
    replayRef.current?.setSpeed(x);
  }, []);
  const seekTick = useCallback((t: number) => replayRef.current?.seekTick(t), []);
  const refreshLoans = useCallback(() => {
    if (!source || source.mode !== "live") return;
    api
      .loans(undefined, source.apiUrl)
      .then((l) => dispatch({ event: "loans", data: l }))
      .catch(() => undefined);
  }, [source]);

  return {
    state,
    controls: { pause, resume, setSpeed, seekTick, refreshLoans },
    error,
    speed,
    paused,
  };
}
