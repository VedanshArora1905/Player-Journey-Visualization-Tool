"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DataIndex, MatchBlob, MatchIndexRow } from "@/lib/dataTypes";
import type { MapId } from "@/lib/maps";
import { MinimapViewer, type HeatmapMode } from "@/components/MinimapViewer";

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

export default function HomePage() {
  const [index, setIndex] = useState<DataIndex | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);

  const [mapId, setMapId] = useState<MapId>("AmbroseValley");
  const [date, setDate] = useState<string>("");
  const [matchId, setMatchId] = useState<string>("");
  const [match, setMatch] = useState<MatchBlob | null>(null);
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

        const firstMatch = data.matches.find((m) => m.mapId === mapId && m.date === defaultDate) ?? data.matches[0];
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

  const selectedMatchRow = useMemo(() => {
    return filteredMatches.find((m) => m.matchId === matchId) ?? null;
  }, [filteredMatches, matchId]);

  useEffect(() => {
    let cancelled = false;
    async function loadMatch() {
      if (!index) return;
      if (!matchId) return;

      const row =
        index.matches.find((m) => m.matchId === matchId) ??
        index.matches.find((m) => m.mapId === mapId && (!date || m.date === date));

      if (!row) return;

      try {
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
        setMatchError(`Failed to load match blob for ${matchId}.`);
      }
    }
    loadMatch();
    return () => {
      cancelled = true;
    };
  }, [date, index, mapId, matchId]);

  useEffect(() => {
    if (!isPlaying || !match) return;

    const step = (now: number) => {
      const last = lastTickRef.current ?? now;
      lastTickRef.current = now;
      const dt = (now - last) * speed;

      setCurrentTimeMs((t) => {
        const next = t + dt;
        if (next >= match.durationMs) {
          setIsPlaying(false);
          return match.durationMs;
        }
        return next;
      });

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [isPlaying, match, speed]);

  const mapConfig = index?.mapConfig?.[mapId] ?? null;

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 text-zinc-950 dark:bg-black dark:text-zinc-50">
      <header className="border-b border-zinc-200 bg-white px-5 py-4 dark:border-zinc-900 dark:bg-zinc-950">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
          <div className="flex flex-col">
            <div className="text-sm font-semibold">Player Journey Visualization Tool</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              Telemetry → minimap paths, events, playback, and heatmaps
            </div>
          </div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Data: Feb 10–14, 2026</div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 gap-4 p-4">
        <aside className="w-[360px] shrink-0">
          <div className="flex h-full flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-900 dark:bg-zinc-950">
            <div className="space-y-1">
              <div className="text-sm font-semibold">Explore</div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Filter a match, then use playback to watch it unfold.
              </div>
            </div>

            {indexError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
                {indexError}
                <div className="mt-2 font-mono text-xs">
                  Run: <span className="font-semibold">npm run preprocess</span> (from{" "}
                  <span className="font-semibold">web/</span>)
                </div>
              </div>
            ) : null}

            <div className="grid gap-3">
              <label className="grid gap-1">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Map</span>
                <select
                  className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                  value={mapId}
                  onChange={(e) => setMapId(e.target.value as MapId)}
                >
                  {(index?.maps ?? ["AmbroseValley", "GrandRift", "Lockdown"]).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Date</span>
                <select
                  className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                >
                  {(index?.dates ?? []).map((d) => (
                    <option key={d} value={d}>
                      {d.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                  Match ({filteredMatches.length})
                </span>
                <select
                  className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                  value={matchId}
                  onChange={(e) => setMatchId(e.target.value)}
                >
                  {filteredMatches.slice(0, 800).map((m) => (
                    <option key={m.matchId} value={m.matchId}>
                      {m.matchId} · {formatDuration(m.durationMs)} · H{m.humans}/B{m.bots}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-2 space-y-2">
              <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Playback</div>

              <div className="flex items-center gap-2">
                <button
                  className="h-10 flex-1 rounded-lg bg-zinc-950 px-3 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
                  onClick={() => setIsPlaying((v) => !v)}
                  disabled={!match}
                >
                  {isPlaying ? "Pause" : "Play"}
                </button>
                <button
                  className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
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

              <input
                type="range"
                min={0}
                max={match?.durationMs ?? 0}
                value={clampRange(currentTimeMs, 0, match?.durationMs ?? 0)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setCurrentTimeMs(v);
                  setIsPlaying(false);
                  lastTickRef.current = null;
                }}
                className="w-full"
                disabled={!match}
              />

              <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span>
                  {formatDuration(currentTimeMs)} / {formatDuration(match?.durationMs ?? 0)}
                </span>
                <span className="font-mono">
                  {selectedMatchRow ? `H${selectedMatchRow.humans}/B${selectedMatchRow.bots}` : ""}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Speed</span>
                  <select
                    className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
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

                <label className="grid gap-1">
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Trail</span>
                  <select
                    className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
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
            </div>

            <div className="mt-2 space-y-2">
              <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Layers</div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={showHumans}
                    onChange={(e) => setShowHumans(e.target.checked)}
                  />
                  Humans
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={showBots} onChange={(e) => setShowBots(e.target.checked)} />
                  Bots
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={showEvents}
                    onChange={(e) => setShowEvents(e.target.checked)}
                  />
                  Events
                </label>
              </div>

              <label className="grid gap-1">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Heatmap</span>
                <select
                  className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                  value={heatmap}
                  onChange={(e) => setHeatmap(e.target.value as HeatmapMode)}
                >
                  <option value="none">None</option>
                  <option value="traffic">Traffic</option>
                  <option value="kills">Kills</option>
                  <option value="deaths">Deaths</option>
                </select>
              </label>
            </div>

            {matchError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
                {matchError}
              </div>
            ) : null}

            <div className="mt-auto text-xs text-zinc-500 dark:text-zinc-400">
              Tip: if playback feels cluttered, set Trail to 10s and toggle Bots/Humans separately.
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <div className="flex h-full flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-900 dark:bg-zinc-950">
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
              />
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
                {index ? "Select a match to begin." : "Loading index…"}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
