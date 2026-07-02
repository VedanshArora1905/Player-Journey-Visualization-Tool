## Player Journey Visualization Tool (LILA Written Test)

This repo contains a web-based tool for exploring **LILA BLACK** player telemetry on top of minimap images: player paths, event markers, timeline playback, and heatmap overlays.

See **[FEATURES.md](FEATURES.md)** for a full explanation of every feature.

### Repository structure
- `data/`: raw provided dataset (zip + extracted `player_data/` folder)
- `web/`: Next.js (React) application that renders the visualization

### Prerequisites
- Node.js \(18+\) and npm

### Setup (local)
From `web/`:

```bash
npm install
npm run preprocess
npm run dev
```

Then open `http://localhost:3000`.

### Dataset location
Preprocessing reads the dataset from:
- `../data/player_data/player_data/`

Specifically it expects:
- `February_10/ ... February_14/` files (parquet without `.parquet` extension)
- `minimaps/` images
- `README.md` describing schema + coordinate mapping

### Deployment (free)
The intended deployment target is **Vercel Free Tier**.

- In the Vercel project settings, set **Root Directory** to `web/`.
- Build command: `npm run build`
- Output: Next.js default

Important: run `npm run preprocess` locally before deploying so that `web/public/data/` is generated and committed (static assets served by Vercel).

