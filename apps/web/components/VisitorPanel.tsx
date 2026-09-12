"use client";
// M9.6 visitor panel: name an off-roster agent, wait for Arc USDC, chat to deposit.
// Opened from the white "Add your agent" button in the header (M5.14). Replay is read-only.
import { useEffect, useState, type FormEvent } from "react";
import { ensNameFor, normalizeVisitorLabel, validateVisitorLabel } from "@agent-town/shared";
import { api, ApiRequestError } from "@/lib/api";
import { TOWN_NAME } from "@/lib/config";
import { formatUsdc } from "@/lib/usdc";

interface ChatLine {
  who: "you" | "agent";
  text: string;
  href?: string;
}

export function VisitorPanel({
  enabled,
  visitorName,
  onChanged,
}: {
  enabled: boolean;
  visitorName: string | null;
  onChanged: () => void;
}) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chat, setChat] = useState("");
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [info, setInfo] = useState<{
    name: string;
    ensName: string;
    arcAddress: string;
    balanceUsdc: string;
    explorerUrl: string;
  } | null>(null);

  const preview = (() => {
    try {
      return ensNameFor(validateVisitorLabel(label), TOWN_NAME);
    } catch {
      const n = normalizeVisitorLabel(label);
      return n ? `${n}.${TOWN_NAME}.eth` : `….${TOWN_NAME}.eth`;
    }
  })();

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    api
      .visitor()
      .then((v) => {
        if (cancelled) return;
        setInfo({
          name: v.name,
          ensName: v.ensName,
          arcAddress: v.arcAddress,
          balanceUsdc: v.balanceUsdc,
          explorerUrl: v.explorerUrl,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiRequestError && err.status === 404) setInfo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, visitorName]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!enabled) return;
    setError(null);
    setBusy("create");
    try {
      const v = await api.createVisitor({ label });
      setInfo({
        name: v.name,
        ensName: v.ensName,
        arcAddress: v.arcAddress,
        balanceUsdc: v.balanceUsdc,
        explorerUrl: v.explorerUrl,
      });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function onRefresh() {
    if (!enabled) return;
    setBusy("refresh");
    try {
      const v = await api.visitor();
      setInfo({
        name: v.name,
        ensName: v.ensName,
        arcAddress: v.arcAddress,
        balanceUsdc: v.balanceUsdc,
        explorerUrl: v.explorerUrl,
      });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function onChat(e: FormEvent) {
    e.preventDefault();
    if (!enabled || !info) return;
    const text = chat.trim();
    if (!text) return;
    setChat("");
    setLines((prev) => [...prev, { who: "you", text }]);
    setBusy("chat");
    setError(null);
    try {
      const res = await api.visitorChat({ text });
      setLines((prev) => [
        ...prev,
        { who: "agent", text: res.reply, href: res.explorerUrl ?? undefined },
      ]);
      onChanged();
      const v = await api.visitor().catch(() => null);
      if (v) {
        setInfo({
          name: v.name,
          ensName: v.ensName,
          arcAddress: v.arcAddress,
          balanceUsdc: v.balanceUsdc,
          explorerUrl: v.explorerUrl,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const funded = info != null && BigInt(info.balanceUsdc) > 0n;

  return (
    <section className="card visitor" aria-label="Your agent">
      <div className="card-title">
        <span className="h3">Your agent</span>
        <span className="label">{enabled ? "live" : "live town only"}</span>
      </div>
      {!enabled ? (
        <p className="small visitor-copy">
          Switch to <span className="mono">api · real</span> to mint a name and deposit USDC.
        </p>
      ) : !info ? (
        <form className="field" onSubmit={onCreate}>
          <p className="small visitor-copy">
            Mint <span className="mono">{preview}</span>, get a Circle wallet, then tell it to
            deposit.
          </p>
          <label className="label" htmlFor="visitor-label">
            Name
          </label>
          <div className="field-row">
            <input
              id="visitor-label"
              className="input"
              value={label}
              onChange={(ev) => setLabel(ev.target.value)}
              placeholder="kenny"
              autoComplete="off"
              disabled={busy != null}
            />
            <button className="btn primary" type="submit" disabled={busy != null || !label.trim()}>
              {busy === "create" ? "Creating…" : "Create agent"}
            </button>
          </div>
        </form>
      ) : (
        <div className="visitor-live">
          <p className="small visitor-copy">
            <span className="mono">{info.ensName}</span>
            {" · "}
            <a href={info.explorerUrl} target="_blank" rel="noreferrer">
              {info.arcAddress.slice(0, 8)}…
            </a>
            {" · "}
            {formatUsdc(info.balanceUsdc)} USDC
          </p>
          {!funded ? (
            <p className="small visitor-copy">
              Send Arc USDC to that wallet, then refresh. (Not Sepolia USDC.)
            </p>
          ) : null}
          <div className="field-row">
            <button
              className="btn"
              type="button"
              onClick={() => void onRefresh()}
              disabled={busy != null}
            >
              {busy === "refresh" ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          <ul className="visitor-chat" aria-live="polite">
            {lines.map((l, i) => (
              <li key={`${i}-${l.who}`} data-who={l.who}>
                <span className="label">{l.who === "you" ? "you" : info.name}</span>
                <span>{l.text}</span>
                {l.href ? (
                  <a href={l.href} target="_blank" rel="noreferrer">
                    arcscan
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
          <form className="field" onSubmit={onChat}>
            <label className="label" htmlFor="visitor-chat">
              Tell {info.name} what to do
            </label>
            <div className="field-row">
              <input
                id="visitor-chat"
                className="input"
                value={chat}
                onChange={(ev) => setChat(ev.target.value)}
                placeholder="deposit 50% of our usdc into the town bank"
                disabled={busy != null}
              />
              <button className="btn primary" type="submit" disabled={busy != null || !chat.trim()}>
                {busy === "chat" ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        </div>
      )}
      {error ? (
        <p className="small" style={{ color: "var(--danger)", margin: "8px 0 0" }}>
          {error}
        </p>
      ) : null}
    </section>
  );
}
