## UI walkthrough

### 1) Preprocess the dataset
From `web/`:

```bash
npm install
npm run preprocess
npm run dev
```

### 2) Choose what to explore (left panel)
- **Map**: pick `AmbroseValley`, `GrandRift`, or `Lockdown`
- **Date**: choose one of the `February_*` days
- **Match**: select a specific `match_id` (shows duration and human/bot counts)

### 3) Playback
- **Play / Pause**: animates match progression over time
- **Scrubber**: drag to jump to any time
- **Speed**: 0.5× / 1× / 2× / 4×
- **Trail**: limits how much of each path is shown (10s/30s/60s/All)

### 4) Layers
- **Humans / Bots**: show/hide each population
- **Events**: show/hide event markers (kills, deaths, loot, storm)
- **Heatmap**: switch to overlays for **Traffic**, **Kills**, or **Deaths**

### 5) Reading the visualization
- **Paths**: humans (amber) vs bots (blue)
- **Events**: distinct marker types + a legend under the minimap
- **Heatmaps**: quick “where things happen” overview; combine with Trail to reduce clutter

