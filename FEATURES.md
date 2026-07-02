# Features — Player Journey Visualization Tool

A complete guide to everything the tool does, how each feature works, and how a Level Designer should use it.

---

## Overview

**Journey Intel** turns raw LILA BLACK telemetry (parquet files) into an interactive browser experience. Level Designers can:

- See where players actually move on each map
- Distinguish humans from bots
- Spot kills, deaths, loot pickups, and storm deaths
- Filter by map, date, and match
- Replay a match over time
- Overlay heatmaps for traffic, kills, and deaths

**Tech stack:** Next.js (React) + TypeScript frontend, DuckDB preprocessing, static JSON served from `web/public/data/`.

---

## 1. Data loading & preprocessing

### What it does
Reads all raw parquet journey files and converts them into web-friendly JSON the browser can load quickly.

### How it works
- Run `npm run preprocess` from the `web/` folder.
- `web/scripts/preprocess.mjs` uses **DuckDB** to read every `.nakama-0` file under `data/player_data/player_data/February_*/`.
- Each file = one player (or bot) in one match.
- Rows are grouped by `match_id` into full match reconstructions.
- Timestamps are normalized so each match starts at **t = 0 ms**.
- Outputs:
  - `web/public/data/index.json` — searchable list of all matches
  - `web/public/data/matches/<match_id>.json` — full match data (paths + events)
  - `web/public/minimaps/*` — copied minimap images

### Dataset coverage
| Metric | Value |
|--------|-------|
| Date range | Feb 10–14, 2026 |
| Total matches | 796 |
| Maps | Ambrose Valley, Grand Rift, Lockdown |
| Unique players | 339 humans + bots |

---

## 2. Minimap visualization

### What it does
Renders the correct top-down minimap image for the selected map and plots all player activity on top of it.

### Supported maps
| Map | Minimap file |
|-----|--------------|
| Ambrose Valley | `AmbroseValley_Minimap.png` |
| Grand Rift | `GrandRift_Minimap.png` |
| Lockdown | `Lockdown_Minimap.jpg` |

### Coordinate mapping
World coordinates `(x, z)` from telemetry are converted to minimap pixels using per-map scale and origin values from the dataset README. The `y` column (elevation) is ignored for 2D plotting.

```
u = (x - origin_x) / scale
v = (z - origin_z) / scale
pixel_x = u × 1024
pixel_y = (1 - v) × 1024   ← Y flipped for image coordinates
```

Implementation: `web/src/lib/maps.ts` → `worldToMinimapPixel()`

---

## 3. Player journey paths

### What it does
Draws movement trails for every player in the selected match, sampled from `Position` (humans) and `BotPosition` (bots) events.

### Visual distinction
| Population | Path color | Style |
|------------|-----------|-------|
| **Humans** | Gold (`#fbbf24`) | Thicker line, higher opacity |
| **Bots** | Cyan (`#22d3ee`) | Thinner line, slightly transparent |

### Trail window
Controls how much of each path is visible at the current playback time:

| Setting | Behavior |
|---------|----------|
| **10s** | Only the last 10 seconds of movement |
| **30s** | Last 30 seconds (default) |
| **60s** | Last 60 seconds |
| **All** | Full path from match start to current time |

**Why it matters:** long matches with many players get cluttered. A short trail keeps the map readable while still showing direction of travel.

---

## 4. Event markers

### What it does
Places distinct markers on the minimap for discrete gameplay events (not movement samples).

### Event types & markers
| Event | Meaning | Marker | Color |
|-------|---------|--------|-------|
| `Kill` | Human killed another human | Diamond | Red |
| `Killed` | Human was killed by another human | X | Dark red |
| `BotKill` | Human killed a bot | Diamond | Orange |
| `BotKilled` | Human was killed by a bot | X | Burnt orange |
| `Loot` | Player picked up an item | Dot | Green |
| `KilledByStorm` | Player died to the storm | X | Purple |

### Behavior
- Events appear on the map as playback time reaches their timestamp.
- Toggle **Events** in the Layers panel to show/hide all markers.
- A dynamic legend below the map lists only event types present in the current match.

---

## 5. Humans vs bots

### Detection logic
| `user_id` format | Classification |
|------------------|----------------|
| UUID (e.g. `f4e072fa-b7af-...`) | Human |
| Numeric (e.g. `1440`) | Bot |

### UI controls
- **Humans** chip — toggle human paths and their events
- **Bots** chip — toggle bot paths and their events
- Match dropdown shows `H{n}/B{n}` counts per match
- Sidebar stat pills show human/bot counts for the selected match

**Designer use case:** toggle bots off to see only real player behavior, or compare human routes vs bot patrol patterns.

---

## 6. Filtering

### Map filter
Choose one of three maps. Only matches played on that map appear in the match list.

### Date filter
Choose a production day (`February_10` through `February_14`). Narrows matches to that day's data.

### Match filter
Select a specific `match_id` from the filtered list. Each entry shows:
- Short match ID
- Match duration (`m:ss`)
- Human/bot count (`H{n}/B{n}`)

Filters are applied in the left **Mission Control** sidebar under **Filters**.

---

## 7. Timeline playback

### What it does
Animates the match from start to finish, revealing paths and events as they happened in time.

### Controls
| Control | Description |
|---------|-------------|
| **▶ Play / ⏸ Pause** | Start or stop animation |
| **Reset** | Jump back to t = 0 and stop |
| **Scrubber** | Drag to any point in the match timeline |
| **Speed** | 0.5×, 1×, 2×, or 4× playback speed |
| **Progress %** | Shows how far through the match you are |

### On-screen indicators
- **T+{n}s** badge (bottom-left of map) — current elapsed time
- **REC** badge (top-right) — appears while playback is active
- **Live** pill in the header — pulses during playback

### How time works
- Each match's events are sorted by timestamp.
- The earliest event in a match is normalized to **t = 0**.
- Playback advances `currentTimeMs` using `requestAnimationFrame` scaled by the selected speed.

---

## 8. Heatmap overlays

### What it does
Shows density hotspots on the minimap — where players spend time, where kills happen, or where deaths cluster.

### Modes
| Mode | Data source | Color | Use case |
|------|------------|-------|----------|
| **Off** | — | — | Clean path view |
| **Traffic zones** | Position + BotPosition samples | Cyan glow | Find high-traffic corridors and ignored areas |
| **Kill zones** | Kill + BotKill events | Orange glow | Identify combat hotspots |
| **Death zones** | Killed + BotKilled + KilledByStorm | Purple glow | Find lethal areas (PvP, bots, or storm) |

Heatmaps respect the current playback time — only events/positions up to the current timestamp contribute.

---

## 9. Match reconstruction

### What it does
Rebuilds a full multi-player match from individual per-player parquet files.

### How it works
1. All files sharing the same `match_id` are merged.
2. Each player's positions and events are kept separate (for individual path rendering).
3. All timestamps are normalized to a shared match timeline.
4. The result is one JSON blob per match with all players' data.

This means you see the **entire match** — not just one player's perspective.

---

## 10. UI & UX features

### LILA-inspired design
- Dark gaming aesthetic with orange/violet accent gradients
- **Syne** display font + **DM Sans** body font
- Glowing panel borders, grid background texture
- Branded header: "Journey Intel" with LB badge

### Layout
| Area | Purpose |
|------|---------|
| **Header** | Branding, match count, date range, live indicator |
| **Left sidebar** | Filters, playback, layers |
| **Main panel** | Minimap canvas with corner accents |
| **Footer** | "Built for LILA Games · Project Black" |

### Responsive details
- Sticky sidebar scrolls independently on smaller viewports
- Match IDs are shortened in dropdowns for readability
- Full match ID shown in the map header bar

---

## 11. Error handling

| Situation | What you see |
|-----------|-------------|
| Preprocessing not run | Red alert: "Failed to load /data/index.json. Run preprocessing first." |
| Match blob missing | Red alert with the match ID that failed to load |
| Minimap image missing | Canvas shows fallback message |

---

## Quick reference — designer workflow

1. **Preprocess** the dataset once: `npm run preprocess`
2. **Start** the app: `npm run dev`
3. **Pick a map** (start with Ambrose Valley — most data)
4. **Pick a date** and **match**
5. Hit **▶ Play** and watch paths unfold
6. Toggle **Humans / Bots / Events** to focus your view
7. Switch **Heatmap** to Traffic, Kills, or Deaths for zone analysis
8. Use **Trail = 10s** if the map feels cluttered

---

## Related docs

| File | Contents |
|------|----------|
| [README.md](README.md) | Setup and deployment |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design and tradeoffs |
| [INSIGHTS.md](INSIGHTS.md) | Three data-driven insights |
| [docs/01-dataset-notes.md](docs/01-dataset-notes.md) | Schema and event types |
| [docs/02-coordinate-mapping.md](docs/02-coordinate-mapping.md) | Coordinate math |
| [docs/03-ui-walkthrough.md](docs/03-ui-walkthrough.md) | Short UI tour |
