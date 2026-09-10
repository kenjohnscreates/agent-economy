"use client";
// useTown: the one hook the UI calls. Loads the snapshot (retrying with backoff while
// the API is unreachable or its real source is still warming), attaches the stream
// (live SSE or recorded replay) to the reducer, refetches /agents and /loans on every
// tick in live mode (positions, balances and the loan book only live there), and
// exposes controls including reconnect.
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { StateResponse } from "@agent-town/shared";
import { api, type HealthResponse } from "./api";
import { backoffMs, describeConnect, type ConnectPhase } from "./connect";
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
  /** Tear the live connection down and start over: snapshot, then stream. */
  reconnect(): void;
}

export interface ConnectError {
  phase: ConnectPhase;
  text: string;
  attempt: number;
}

export function useTown(source: TownSource | null): {
  state: TownState;
  controls: TownControls;
  /** Null while connected. While the snapshot keeps failing, what is wrong and how many tries so far. */
  error: ConnectError | null;
  /** `/state` from the API (flags, tickMs), once loaded. */
  info: StateResponse | null;
  /** `/health` from the API (mode), once loaded. Not part of the frozen contract; may stay null. */
  health: HealthResponse | null;
  speed: number;
  paused: boolean;
} {
  const [state, dispatch] = useReducer(reduce, undefined, initialState);
  const [error, setError] = useState<ConnectError | null>(null);
  const [info, setInfo] = useState<StateResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [speed, setSpeedState] = useState(1);
  const [paused, setPaused] = useState(false);
  const [generation, setGeneration] = useState(0);
  const replayRef = useRef<ReplayControls | null>(null);
  const liveRef = useRef<StreamHandle | null>(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
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
    const apiUrl = api.baseUrl(base);

    // Optional, non-contract: tells the header whether this is the mock or the real source.
    api
      .health(base)
      .then((h) => {
        if (!cancelled) setHealth(h);
      })
      .catch(() => undefined);

    const snapshot = async (attempt: number): Promise<void> => {
      try {
        const [agents, scoreboard, loans, st] = await Promise.all([
          api.agents(base),
          api.scoreboard(base),
          api.loans(undefined, base),
          api.state(base),
        ]);
        if (cancelled) return;
        dispatch({ event: "agents", data: agents });
        dispatch({ event: "scoreboard", data: scoreboard });
        dispatch({ event: "loans", data: loans });
        setInfo(st);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError({ ...describeConnect(e, apiUrl), attempt });
        timer = setTimeout(() => void snapshot(attempt + 1), backoffMs(attempt));
        return;
      }
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
    };
    void snapshot(1);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      liveRef.current?.close();
      liveRef.current = null;
    };
    // `speed` is applied through controls, not by reconnecting, so it is not a dependency.
    // `generation` is bumped by reconnect() to rerun this effect on purpose.
  }, [source, generation]);

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
  const reconnect = useCallback(() => setGeneration((g) => g + 1), []);

  return {
    state,
    controls: { pause, resume, setSpeed, seekTick, refreshLoans, reconnect },
    error,
    info,
    health,
    speed,
    paused,
  };
}
