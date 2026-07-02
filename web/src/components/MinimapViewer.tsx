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
};

const EVENT_STYLES: Record<
  string,
  { label: string; color: string; kind: "dot" | "x" | "diamond" }
> = {
  Kill: { label: "Kill (PvP)", color: "#ef4444", kind: "diamond" },
  Killed: { label: "Killed (PvP)", color: "#7f1d1d", kind: "x" },
  BotKill: { label: "Kill (vs bot)", color: "#f97316", kind: "diamond" },
  BotKilled: { label: "Killed (by bot)", color: "#9a3412", kind: "x" },
  Loot: { label: "Loot", color: "#22c55e", kind: "dot" },
  KilledByStorm: { label: "Storm death", color: "#60a5fa", kind: "x" },
};

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function drawMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  style: { color: string; kind: "dot" | "x" | "diamond" },
) {
  ctx.save();
  ctx.strokeStyle = style.color;
  ctx.fillStyle = style.color;
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

export function MinimapViewer({
  match,
  mapConfig,
  currentTimeMs,
  showHumans,
  showBots,
  showEvents,
  trailWindowMs,
  heatmap,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const image = new Image();
    image.src = MAP_MINIMAP_IMAGE[match.mapId];
    image.onload = () => setImg(image);
    image.onerror = () => setImg(null);
  }, [match.mapId]);

  const legend = useMemo(() => {
    const seen = new Set<string>();
    for (const p of match.players) {
      for (const e of p.events) seen.add(e.type);
    }
    const types = Array.from(seen).sort();
    return types.map((t) => ({ type: t, style: EVENT_STYLES[t] }));
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

    // Draw minimap image
    if (img) {
      ctx.drawImage(img, 0, 0, width, height);
    } else {
      ctx.fillStyle = "#0b0b0b";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#e5e7eb";
      ctx.font = "14px ui-sans-serif, system-ui";
      ctx.fillText("Minimap image not found under /public/minimaps", 12, 22);
    }

    const scaleX = width / 1024;
    const scaleY = height / 1024;

    // Heatmap (simple: draw blurred circles)
    if (heatmap !== "none") {
      const points: Array<{ x: number; y: number; w: number }> = [];
      for (const p of match.players) {
        const isVisible = p.isBot ? showBots : showHumans;
        if (!isVisible) continue;

        if (heatmap === "traffic") {
          for (const pt of p.positions) {
            if (pt.t > currentTimeMs) break;
            const { px, py } = worldToMinimapPixel(mapConfig, pt.x, pt.z, 1024);
            points.push({ x: px, y: py, w: 0.08 });
          }
        } else {
          for (const e of p.events) {
            if (e.t > currentTimeMs) break;
            const isKill = e.type === "Kill" || e.type === "BotKill";
            const isDeath = e.type === "Killed" || e.type === "BotKilled" || e.type === "KilledByStorm";
            if (heatmap === "kills" && !isKill) continue;
            if (heatmap === "deaths" && !isDeath) continue;
            const { px, py } = worldToMinimapPixel(mapConfig, e.x, e.z, 1024);
            points.push({ x: px, y: py, w: 0.9 });
          }
        }
      }

      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 0.75;

      for (const p of points) {
        const x = p.x * scaleX;
        const y = p.y * scaleY;
        const r = heatmap === "traffic" ? 14 : 22;

        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, "rgba(255,0,0,0.45)");
        grad.addColorStop(1, "rgba(255,0,0,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    // Paths + markers
    for (const p of match.players) {
      const isVisible = p.isBot ? showBots : showHumans;
      if (!isVisible) continue;

      const lineColor = p.isBot ? "rgba(59,130,246,0.55)" : "rgba(234,179,8,0.70)";
      const lineWidth = p.isBot ? 1.5 : 2.2;

      const tStart = trailWindowMs == null ? 0 : Math.max(0, currentTimeMs - trailWindowMs);
      const tEnd = currentTimeMs;

      ctx.save();
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = lineWidth;
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

    // HUD time label
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(10, height - 44, 160, 34);
    ctx.fillStyle = "#fff";
    ctx.font = "12px ui-sans-serif, system-ui";
    const seconds = Math.floor(currentTimeMs / 1000);
    ctx.fillText(`t = ${seconds}s`, 20, height - 22);
    ctx.restore();
  }, [
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

  return (
    <div className="flex h-full w-full flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-zinc-700 dark:text-zinc-200">
          <span className="font-medium">{match.mapId}</span>{" "}
          <span className="text-zinc-500 dark:text-zinc-400">·</span>{" "}
          <span className="font-mono text-xs">{match.matchId}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
          <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 dark:border-zinc-800 dark:bg-zinc-950">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
            Humans
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 dark:border-zinc-800 dark:bg-zinc-950">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
            Bots
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-950 shadow-sm dark:border-zinc-800"
      >
        <canvas ref={canvasRef} className="absolute inset-0" />
      </div>

      {legend.length > 0 ? (
        <div className="flex flex-wrap gap-2 text-xs text-zinc-700 dark:text-zinc-300">
          {legend.map(({ type, style }) => (
            <span
              key={type}
              className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: style?.color ?? "#a1a1aa" }}
              />
              {style?.label ?? type}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

