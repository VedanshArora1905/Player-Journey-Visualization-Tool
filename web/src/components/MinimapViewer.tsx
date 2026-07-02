"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MatchBlob } from "@/lib/dataTypes";
import { MAP_MINIMAP_IMAGE, worldToMinimapPixel, type MapConfig } from "@/lib/maps";

export type HeatmapMode = "none" | "traffic" | "kills" | "deaths";

type Props = {
  match: MatchBlob;
  mapConfig: MapConfig;
  currentTimeMs: number;
  showHumans: boolean;
  showBots: boolean;
  showEvents: boolean;
  trailWindowMs: number | null;
  heatmap: HeatmapMode;
  isPlaying?: boolean;
};

const MAP_LABELS: Record<string, string> = {
  AmbroseValley: "Ambrose Valley",
  GrandRift: "Grand Rift",
  Lockdown: "Lockdown",
};

const EVENT_STYLES: Record<
  string,
  { label: string; color: string; kind: "dot" | "x" | "diamond" }
> = {
  Kill: { label: "PvP Kill", color: "#ef4444", kind: "diamond" },
  Killed: { label: "PvP Death", color: "#991b1b", kind: "x" },
  BotKill: { label: "Bot Kill", color: "#ff4d00", kind: "diamond" },
  BotKilled: { label: "Bot Death", color: "#c2410c", kind: "x" },
  Loot: { label: "Loot", color: "#22c55e", kind: "dot" },
  KilledByStorm: { label: "Storm", color: "#a855f7", kind: "x" },
};

function drawMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  style: { color: string; kind: "dot" | "x" | "diamond" },
) {
  ctx.save();
  ctx.strokeStyle = style.color;
  ctx.fillStyle = style.color;
  ctx.shadowColor = style.color;
  ctx.shadowBlur = 8;
  ctx.lineWidth = 2;

  if (style.kind === "dot") {
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (style.kind === "x") {
    ctx.beginPath();
    ctx.moveTo(x - 5, y - 5);
    ctx.lineTo(x + 5, y + 5);
    ctx.moveTo(x + 5, y - 5);
    ctx.lineTo(x - 5, y + 5);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(x, y - 6);
    ctx.lineTo(x + 6, y);
    ctx.lineTo(x, y + 6);
    ctx.lineTo(x - 6, y);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function shortId(id: string) {
  const core = id.replace(".nakama-0", "");
  return core.length > 28 ? `${core.slice(0, 12)}…${core.slice(-8)}` : core;
}

export function MinimapViewer({
  match,
  mapConfig,
  currentTimeMs,
  showHumans,
  showBots,
  showEvents,
  trailWindowMs,
  heatmap,
  isPlaying = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    let cancelled = false;
    setImg(null);
    const image = new Image();
    image.src = MAP_MINIMAP_IMAGE[match.mapId];
    image.onload = () => {
      if (!cancelled) setImg(image);
    };
    image.onerror = () => {
      if (!cancelled) setImg(null);
    };
    return () => {
      cancelled = true;
    };
  }, [match.mapId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setContainerSize({ w: width, h: height });
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  const legend = useMemo(() => {
    const seen = new Set<string>();
    for (const p of match.players) {
      for (const e of p.events) seen.add(e.type);
    }
    return Array.from(seen)
      .sort()
      .map((t) => ({ type: t, style: EVENT_STYLES[t] }));
  }, [match.players]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    if (img) {
      ctx.drawImage(img, 0, 0, width, height);
    } else {
      ctx.fillStyle = "#070708";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#71717a";
      ctx.font = "13px system-ui";
      ctx.fillText("Minimap not found — run npm run preprocess", 16, 28);
    }

    const scaleX = width / 1024;
    const scaleY = height / 1024;

    if (heatmap !== "none") {
      const points: Array<{ x: number; y: number }> = [];
      for (const p of match.players) {
        const isVisible = p.isBot ? showBots : showHumans;
        if (!isVisible) continue;

        if (heatmap === "traffic") {
          const positions = p.positions;
          const stride =
            positions.length > 300 ? Math.ceil(positions.length / 300) : 1;
          for (let i = 0; i < positions.length; i += stride) {
            const pt = positions[i];
            if (pt.t > currentTimeMs) break;
            const { px, py } = worldToMinimapPixel(mapConfig, pt.x, pt.z, 1024);
            points.push({ x: px, y: py });
          }
        } else {
          for (const e of p.events) {
            if (e.t > currentTimeMs) break;
            const isKill = e.type === "Kill" || e.type === "BotKill";
            const isDeath =
              e.type === "Killed" || e.type === "BotKilled" || e.type === "KilledByStorm";
            if (heatmap === "kills" && !isKill) continue;
            if (heatmap === "deaths" && !isDeath) continue;
            const { px, py } = worldToMinimapPixel(mapConfig, e.x, e.z, 1024);
            points.push({ x: px, y: py });
          }
        }
      }

      ctx.save();
      ctx.globalAlpha = 0.8;

      for (const p of points) {
        const x = p.x * scaleX;
        const y = p.y * scaleY;
        const r = heatmap === "traffic" ? 14 : 22;

        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        if (heatmap === "traffic") {
          grad.addColorStop(0, "rgba(34,211,238,0.5)");
          grad.addColorStop(1, "rgba(34,211,238,0)");
        } else if (heatmap === "kills") {
          grad.addColorStop(0, "rgba(255,77,0,0.55)");
          grad.addColorStop(1, "rgba(255,77,0,0)");
        } else {
          grad.addColorStop(0, "rgba(168,85,247,0.55)");
          grad.addColorStop(1, "rgba(168,85,247,0)");
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    for (const p of match.players) {
      const isVisible = p.isBot ? showBots : showHumans;
      if (!isVisible) continue;

      const lineColor = p.isBot ? "rgba(34,211,238,0.65)" : "rgba(251,191,36,0.8)";
      const lineWidth = p.isBot ? 1.5 : 2.2;

      const tStart = trailWindowMs == null ? 0 : Math.max(0, currentTimeMs - trailWindowMs);
      const tEnd = currentTimeMs;

      ctx.save();
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowColor = lineColor;
      ctx.shadowBlur = 4;
      ctx.beginPath();

      let started = false;
      for (const pt of p.positions) {
        if (pt.t < tStart) continue;
        if (pt.t > tEnd) break;

        const { px, py } = worldToMinimapPixel(mapConfig, pt.x, pt.z, 1024);
        const x = px * scaleX;
        const y = py * scaleY;
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
      ctx.restore();

      if (showEvents) {
        for (const e of p.events) {
          if (e.t > currentTimeMs) break;
          const style = EVENT_STYLES[e.type];
          if (!style) continue;
          const { px, py } = worldToMinimapPixel(mapConfig, e.x, e.z, 1024);
          drawMarker(ctx, px * scaleX, py * scaleY, style);
        }
      }
    }

  }, [
    containerSize.h,
    containerSize.w,
    currentTimeMs,
    heatmap,
    img,
    mapConfig,
    match.mapId,
    match.players,
    showBots,
    showEvents,
    showHumans,
    trailWindowMs,
  ]);

  const elapsedSec = Math.floor(currentTimeMs / 1000);

  return (
    <div className="flex h-full w-full flex-col gap-4">
      {/* Map header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="lila-label">Active sector</p>
          <h3 className="font-display text-lg font-bold tracking-tight">
            {MAP_LABELS[match.mapId] ?? match.mapId}
          </h3>
          <p className="mt-0.5 font-mono text-[10px] text-zinc-600">{shortId(match.matchId)}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="lila-stat text-[#fbbf24]">
            <span className="inline-block h-2 w-2 rounded-full bg-[#fbbf24] shadow-[0_0_8px_#fbbf24]" />
            Humans
          </span>
          <span className="lila-stat text-[#22d3ee]">
            <span className="inline-block h-2 w-2 rounded-full bg-[#22d3ee] shadow-[0_0_8px_#22d3ee]" />
            Bots
          </span>
          {heatmap !== "none" ? (
            <span className="lila-stat border-[#a855f7]/40 text-[#a855f7]">
              Heatmap: {heatmap}
            </span>
          ) : null}
        </div>
      </div>

      {/* Canvas container */}
      <div
        ref={containerRef}
        className="relative min-h-[480px] flex-1 overflow-hidden rounded-xl border border-white/[0.08] bg-[#070708] shadow-[inset_0_0_60px_rgba(0,0,0,0.6)]"
      >
        {/* Corner accents */}
        <div className="pointer-events-none absolute top-0 left-0 h-8 w-8 border-t-2 border-l-2 border-[#ff4d00]/50" />
        <div className="pointer-events-none absolute top-0 right-0 h-8 w-8 border-t-2 border-r-2 border-[#a855f7]/50" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-8 w-8 border-b-2 border-l-2 border-[#a855f7]/50" />
        <div className="pointer-events-none absolute right-0 bottom-0 h-8 w-8 border-r-2 border-b-2 border-[#ff4d00]/50" />

        <canvas ref={canvasRef} className="absolute inset-0" />

        <div
          className={`pointer-events-none absolute bottom-3 left-3 rounded-md border px-3 py-1.5 font-mono text-xs font-bold ${
            isPlaying
              ? "border-[#ff4d00]/40 bg-black/70 text-[#ff4d00]"
              : "border-white/10 bg-black/60 text-zinc-500"
          }`}
        >
          T+{elapsedSec}s
        </div>

        {isPlaying ? (
          <div className="pointer-events-none absolute top-3 right-3 flex items-center gap-1.5 rounded-md border border-[#ff4d00]/30 bg-black/60 px-2 py-1 text-[10px] font-bold tracking-widest text-[#ff4d00] uppercase">
            <span className="lila-live-dot inline-block h-1.5 w-1.5 rounded-full bg-[#ff4d00]" />
            REC
          </div>
        ) : null}
      </div>

      {/* Legend */}
      {legend.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {legend.map(({ type, style }) => (
            <span
              key={type}
              className="lila-chip text-[11px]"
              style={
                style
                  ? { borderColor: `${style.color}44`, background: `${style.color}11` }
                  : undefined
              }
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{
                  backgroundColor: style?.color ?? "#a1a1aa",
                  boxShadow: style ? `0 0 8px ${style.color}` : undefined,
                }}
              />
              {style?.label ?? type}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
