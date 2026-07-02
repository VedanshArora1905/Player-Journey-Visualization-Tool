"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DataIndex, MatchBlob, MatchIndexRow } from "@/lib/dataTypes";
import type { MapId } from "@/lib/maps";
import { MinimapViewer, type HeatmapMode } from "@/components/MinimapViewer";

const MAP_LABELS: Record<MapId, string> = {
  AmbroseValley: "Ambrose Valley",
  GrandRift: "Grand Rift",
  Lockdown: "Lockdown",
};

function formatDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function clampRange(v: number, lo: number, hi: number) {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function shortMatchId(id: string) {
  const core = id.replace(".nakama-0", "");
  return core.length > 20 ? `${core.slice(0, 8)}…${core.slice(-6)}` : core;
}

export default function HomePage() {
  const [index, setIndex] = useState<DataIndex | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);

  const [mapId, setMapId] = useState<MapId>("AmbroseValley");
  const [date, setDate] = useState<string>("");
  const [matchId, setMatchId] = useState<string>("");
  const [match, setMatch] = useState<MatchBlob | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [speed, setSpeed] = useState<0.5 | 1 | 2 | 4>(1);
  const [trailWindowMs, setTrailWindowMs] = useState<number | null>(30_000);

  const [showHumans, setShowHumans] = useState(true);
  const [showBots, setShowBots] = useState(true);
  const [showEvents, setShowEvents] = useState(true);
  const [heatmap, setHeatmap] = useState<HeatmapMode>("none");

  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadIndex() {
      try {
        setIndexError(null);
        const res = await fetch("/data/index.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as DataIndex;
        if (cancelled) return;
        setIndex(data);

        const defaultDate = data.dates[0] ?? "";
        setDate(defaultDate);

        const firstMatch =
          data.matches.find((m) => m.mapId === mapId && m.date === defaultDate) ?? data.matches[0];
        if (firstMatch) setMatchId(firstMatch.matchId);
      } catch {
        if (cancelled) return;
        setIndexError("Failed to load /data/index.json. Run preprocessing first.");
      }
    }
    loadIndex();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredMatches: MatchIndexRow[] = useMemo(() => {
    if (!index) return [];
    return index.matches.filter((m) => m.mapId === mapId && (!date || m.date === date));
  }, [date, index, mapId]);

  const availableDates = useMemo(() => {
    if (!index) return [];
    const datesForMap = new Set(index.matches.filter((m) => m.mapId === mapId).map((m) => m.date));
    return index.dates.filter((d) => datesForMap.has(d));
  }, [index, mapId]);

  // Reset date when switching to a map that doesn't include the current date
  useEffect(() => {
    if (!index || availableDates.length === 0) return;
    if (!date || !availableDates.includes(date)) {
      setDate(availableDates[0]);
    }
  }, [availableDates, date, index]);

  // Keep matchId valid when map/date filters change
  useEffect(() => {
    if (!index) return;
    if (filteredMatches.length === 0) {
      setMatchId("");
      setMatch(null);
      setIsPlaying(false);
      return;
    }
    setMatchId((current) => {
      if (current && filteredMatches.some((m) => m.matchId === current)) return current;
      return filteredMatches[0].matchId;
    });
  }, [filteredMatches, index]);

  const selectedMatchRow = useMemo(() => {
    return filteredMatches.find((m) => m.matchId === matchId) ?? null;
  }, [filteredMatches, matchId]);

  const progressPct = useMemo(() => {
    if (!match?.durationMs) return 0;
    return (currentTimeMs / match.durationMs) * 100;
  }, [currentTimeMs, match?.durationMs]);

  useEffect(() => {
    let cancelled = false;
    async function loadMatch() {
      if (!index) return;
      if (!matchId) {
        setMatch(null);
        return;
      }

      const row = index.matches.find((m) => m.matchId === matchId);

      if (!row) {
        setMatch(null);
        return;
      }

      try {
        setMatchLoading(true);
        setMatchError(null);
        const res = await fetch(row.path, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = (await res.json()) as MatchBlob;
        if (cancelled) return;
        setMatch(blob);
        setCurrentTimeMs(0);
        setIsPlaying(false);
        lastTickRef.current = null;
      } catch {
        if (cancelled) return;
        setMatch(null);
        setMatchError(`Failed to load match blob for ${matchId}.`);
      } finally {
        if (!cancelled) setMatchLoading(false);
      }
    }
    loadMatch();
    return () => {
      cancelled = true;
    };
  }, [date, index, mapId, matchId]);

  useEffect(() => {
    if (!isPlaying || !match) return;

    lastTickRef.current = null;

    const step = (now: number) => {
      const last = lastTickRef.current ?? now;
      lastTickRef.current = now;
      const dt = (now - last) * speed;

      setCurrentTimeMs((t) => Math.min(t + dt, match.durationMs));

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTickRef.current = null;
    };
  }, [isPlaying, match, speed]);

  // Stop playback when timeline reaches match end
  useEffect(() => {
    if (!match || !isPlaying) return;
    if (currentTimeMs >= match.durationMs) {
      setIsPlaying(false);
    }
  }, [currentTimeMs, isPlaying, match]);

  const mapConfig = match
    ? (index?.mapConfig?.[match.mapId] ?? null)
    : (index?.mapConfig?.[mapId] ?? null);

  return (
    <div className="lila-bg flex min-h-screen flex-1 flex-col text-zinc-100">
      {/* Header */}
      <header className="relative border-b border-white/[0.06] px-5 py-5">
        <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="font-display flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br from-[#ff4d00] to-[#a855f7] text-sm font-extrabold tracking-tighter text-black shadow-[0_0_24px_rgba(255,77,0,0.4)]">
              LB
            </div>
            <div>
              <h1 className="font-display text-xl font-extrabold tracking-tight md:text-2xl">
                <span className="lila-gradient-text">Journey Intel</span>
              </h1>
              <p className="mt-0.5 text-xs text-zinc-500">
                LILA BLACK · Level Design Telemetry ·{" "}
                <span className="text-zinc-400">Strive for greatness.</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {index ? (
              <>
                <span className="lila-stat text-[#ff7a3d]">
                  {index.matches.length} matches
                </span>
                <span className="lila-stat text-zinc-400">Feb 10–14, 2026</span>
                {isPlaying ? (
                  <span className="lila-stat border-[#ff4d00]/40 text-[#ff4d00]">
                    <span className="lila-live-dot inline-block h-1.5 w-1.5 rounded-full bg-[#ff4d00]" />
                    Live
                  </span>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-5 p-5 lg:flex-row">
        {/* Sidebar */}
        <aside className="w-full shrink-0 lg:w-[340px]">
          <div className="lila-panel lila-panel-glow sticky top-5 flex max-h-[calc(100vh-7rem)] flex-col gap-5 overflow-y-auto rounded-2xl p-5">
            <div>
              <p className="lila-label">Mission Control</p>
              <h2 className="font-display mt-1 text-lg font-bold tracking-tight">
                Explore the map
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                Filter a match, hit play, and watch the storm chase players across the minimap.
              </p>
            </div>

            {indexError ? (
              <div className="rounded-lg border border-red-500/30 bg-red-950/30 p-3 text-sm text-red-300">
                {indexError}
                <div className="mt-2 font-mono text-xs text-red-400/80">
                  Run <span className="text-red-200">npm run preprocess</span> from{" "}
                  <span className="text-red-200">web/</span>
                </div>
              </div>
            ) : null}

            {/* Filters */}
            <div className="space-y-3">
              <p className="lila-label">Filters</p>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-zinc-400">Map</span>
                <select
                  className="lila-select"
                  value={mapId}
                  onChange={(e) => setMapId(e.target.value as MapId)}
                >
                  {(index?.maps ?? ["AmbroseValley", "GrandRift", "Lockdown"]).map((m) => (
                    <option key={m} value={m}>
                      {MAP_LABELS[m as MapId] ?? m}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-zinc-400">Date</span>
                <select
                  className="lila-select"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                >
                  {(availableDates.length > 0 ? availableDates : (index?.dates ?? [])).map((d) => (
                    <option key={d} value={d}>
                      {d.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-zinc-400">
                  Match <span className="text-zinc-600">({filteredMatches.length})</span>
                </span>
                <select
                  className="lila-select font-mono text-xs"
                  value={matchId}
                  onChange={(e) => setMatchId(e.target.value)}
                  disabled={filteredMatches.length === 0}
                >
                  {filteredMatches.length === 0 ? (
                    <option value="">No matches for this filter</option>
                  ) : (
                    filteredMatches.slice(0, 800).map((m) => (
                      <option key={m.matchId} value={m.matchId}>
                        {shortMatchId(m.matchId)} · {formatDuration(m.durationMs)} · H{m.humans}/B
                        {m.bots}
                      </option>
                    ))
                  )}
                </select>
              </label>
            </div>

            {/* Playback */}
            <div className="space-y-3 border-t border-white/[0.06] pt-4">
              <p className="lila-label">Playback</p>

              <div className="flex gap-2">
                <button
                  className="lila-btn-primary h-10 flex-1"
                  onClick={() => setIsPlaying((v) => !v)}
                  disabled={!match}
                >
                  {isPlaying ? "⏸ Pause" : "▶ Play"}
                </button>
                <button
                  className="lila-btn-ghost h-10 px-4"
                  onClick={() => {
                    setIsPlaying(false);
                    setCurrentTimeMs(0);
                    lastTickRef.current = null;
                  }}
                  disabled={!match}
                >
                  Reset
                </button>
              </div>

              <div className="space-y-2">
                <input
                  type="range"
                  className="lila-range"
                  min={0}
                  max={match?.durationMs ?? 0}
                  value={clampRange(currentTimeMs, 0, match?.durationMs ?? 0)}
                  onChange={(e) => {
                    setCurrentTimeMs(Number(e.target.value));
                    setIsPlaying(false);
                    lastTickRef.current = null;
                  }}
                  disabled={!match}
                />
                <div className="flex items-center justify-between font-mono text-xs">
                  <span className="text-[#ff7a3d]">{formatDuration(currentTimeMs)}</span>
                  <span className="text-zinc-600">{Math.round(progressPct)}%</span>
                  <span className="text-zinc-500">{formatDuration(match?.durationMs ?? 0)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-zinc-400">Speed</span>
                  <select
                    className="lila-select"
                    value={String(speed)}
                    onChange={(e) => setSpeed(Number(e.target.value) as 0.5 | 1 | 2 | 4)}
                    disabled={!match}
                  >
                    <option value="0.5">0.5×</option>
                    <option value="1">1×</option>
                    <option value="2">2×</option>
                    <option value="4">4×</option>
                  </select>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-zinc-400">Trail</span>
                  <select
                    className="lila-select"
                    value={trailWindowMs == null ? "all" : String(trailWindowMs)}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTrailWindowMs(v === "all" ? null : Number(v));
                    }}
                    disabled={!match}
                  >
                    <option value="10000">10s</option>
                    <option value="30000">30s</option>
                    <option value="60000">60s</option>
                    <option value="all">All</option>
                  </select>
                </label>
              </div>

              {selectedMatchRow ? (
                <div className="flex gap-2">
                  <span className="lila-stat text-[#fbbf24]">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#fbbf24]" />
                    {selectedMatchRow.humans} humans
                  </span>
                  <span className="lila-stat text-[#22d3ee]">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#22d3ee]" />
                    {selectedMatchRow.bots} bots
                  </span>
                </div>
              ) : null}
            </div>

            {/* Layers */}
            <div className="space-y-3 border-t border-white/[0.06] pt-4">
              <p className="lila-label">Layers</p>

              <div className="flex flex-wrap gap-2">
                <label className={`lila-chip ${showHumans ? "lila-chip-active" : ""}`}>
                  <input
                    type="checkbox"
                    checked={showHumans}
                    onChange={(e) => setShowHumans(e.target.checked)}
                  />
                  <span className="inline-block h-2 w-2 rounded-full bg-[#fbbf24]" />
                  Humans
                </label>
                <label className={`lila-chip ${showBots ? "lila-chip-active" : ""}`}>
                  <input
                    type="checkbox"
                    checked={showBots}
                    onChange={(e) => setShowBots(e.target.checked)}
                  />
                  <span className="inline-block h-2 w-2 rounded-full bg-[#22d3ee]" />
                  Bots
                </label>
                <label className={`lila-chip ${showEvents ? "lila-chip-active" : ""}`}>
                  <input
                    type="checkbox"
                    checked={showEvents}
                    onChange={(e) => setShowEvents(e.target.checked)}
                  />
                  <span className="inline-block h-2 w-2 rounded-full bg-[#22c55e]" />
                  Events
                </label>
              </div>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-zinc-400">Heatmap</span>
                <select
                  className="lila-select"
                  value={heatmap}
                  onChange={(e) => setHeatmap(e.target.value as HeatmapMode)}
                >
                  <option value="none">Off</option>
                  <option value="traffic">Traffic zones</option>
                  <option value="kills">Kill zones</option>
                  <option value="deaths">Death zones</option>
                </select>
              </label>
            </div>

            {matchError ? (
              <div className="rounded-lg border border-red-500/30 bg-red-950/30 p-3 text-sm text-red-300">
                {matchError}
              </div>
            ) : null}

            <p className="mt-auto text-[11px] leading-relaxed text-zinc-600">
              Pro tip: set Trail to 10s and toggle bots off to see human routes clearly.
            </p>
          </div>
        </aside>

        {/* Main viz */}
        <section className="min-w-0 flex-1">
          <div className="lila-panel lila-panel-glow flex h-full min-h-[600px] flex-col rounded-2xl p-5">
            {match && mapConfig ? (
              <MinimapViewer
                match={match}
                mapConfig={mapConfig}
                currentTimeMs={currentTimeMs}
                showHumans={showHumans}
                showBots={showBots}
                showEvents={showEvents}
                trailWindowMs={trailWindowMs}
                heatmap={heatmap}
                isPlaying={isPlaying}
              />
            ) : matchLoading ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#ff4d00]/30 border-t-[#ff4d00]" />
                <p className="text-sm text-zinc-500">Loading match telemetry…</p>
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
                <div className="font-display text-5xl font-extrabold tracking-tighter text-white/[0.04]">
                  LILA
                </div>
                <p className="text-sm text-zinc-500">
                  {index ? "Select a match to begin recon." : "Loading telemetry index…"}
                </p>
                {index ? (
                  <div className="h-1 w-32 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-gradient-to-r from-[#ff4d00] to-[#a855f7]" />
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.04] px-5 py-3 text-center text-[10px] tracking-widest text-zinc-700 uppercase">
        Built for LILA Games · Project Black · Level Design Intelligence
      </footer>
    </div>
  );
}
