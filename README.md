## Player Journey Visualization Tool (LILA Written Test)

This repo contains a web-based tool for exploring **LILA BLACK** player telemetry on top of minimap images: player paths, event markers, timeline playback, and heatmap overlays.

### What it does
- Loads preprocessed match data from parquet telemetry
- Renders player paths on the correct minimap (world coordinates → pixels)
- Distinguishes **humans** (gold) vs **bots** (cyan)
- Marks kills, deaths, loot, and storm deaths
- Filters by **map**, **date**, and **match**
- **Timeline playback** with speed and trail controls
- **Heatmap** overlays for traffic, kills, and deaths

Additional notes live under `docs/` (dataset schema, coordinate mapping, UI walkthrough).

### Repository structure
- `data/`: raw provided dataset (zip + extracted `player_data/` folder)
- `docs/`: supplementary documentation (requirements, dataset notes, coordinate mapping)
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

### Deployment (free — Vercel)

**Recommended settings (Vercel dashboard → Settings → General):**

| Setting | Value |
|--------|--------|
| **Root Directory** | `web` |
| **Framework** | Next.js |
| **Build Command** | *(leave default — override OFF)* |
| **Output Directory** | *(leave default — override OFF)* |
| **Install Command** | *(leave default — override OFF)* |

> **If you see `404: NOT_FOUND`:** Root Directory is almost certainly wrong, or **Output Directory** was overridden manually. Set Root Directory to `web`, turn **off** all command/directory overrides, then **Redeploy** without cache.

1. Run `npm run preprocess` locally so `web/public/data/` and `web/public/minimaps/` exist.
2. Commit and push those folders to GitHub.
3. Import repo on [Vercel](https://vercel.com) (free tier).
4. Set **Root Directory** = `web` before the first deploy (or in Settings → redeploy).
5. Add your live URL below once it works.

**Live demo:** _(add your Vercel URL here after deploy)_

