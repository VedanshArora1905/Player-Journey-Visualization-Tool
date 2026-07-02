## Requirements checklist (from PDF)

### Core (must have)
- **Load and parse parquet data**: `web/scripts/preprocess.mjs` reads parquet with DuckDB and outputs static JSON.
- **Correct minimap mapping**: implemented in `web/src/lib/maps.ts` using the dataset README constants and formula.
- **Humans vs bots**: `user_id` numeric → bot; UUID → human. Toggle in UI.
- **Event markers**: kill, death, loot, storm deaths rendered as distinct markers.
- **Filtering**: map/date/match filtering available in left panel.
- **Timeline/playback**: play/pause, scrubber, speed, and trail window.
- **Heatmap overlays**: traffic/kills/deaths overlay modes.
- **Hosted tool**: deploy `web/` to Vercel (free tier) and share the URL.

### Submission artifacts
- **Repo contains everything**: code + preprocessing + generated static assets.
- **`README.md`**: setup steps and deployment notes.
- **`ARCHITECTURE.md`**: one page, includes coordinate mapping and tradeoffs.
- **`INSIGHTS.md`**: 3 evidence-backed insights from exploring the data in the tool.

