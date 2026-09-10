// STALE badge (M5.4): shown wherever a number came from `scoreboard.signals` and the
// backend reports the last external fetch failed, so it is showing last-known values.
export function StaleBadge({ detail = false }: { detail?: boolean }) {
  return (
    <span className="stale" title="The last signal fetch failed. Showing last known values.">
      <span className="dot" aria-hidden="true" />
      stale
      {detail ? (
        <span className="stale-detail">last fetch failed, showing last known values</span>
      ) : null}
    </span>
  );
}
