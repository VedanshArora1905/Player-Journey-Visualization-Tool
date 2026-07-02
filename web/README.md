## Web app

This folder is the Next.js (React) app that renders:
- Minimaps per map
- Player paths (humans vs bots)
- Event markers (kills, deaths, loot, storm deaths)
- Timeline playback
- Heatmap overlays (traffic/kills/deaths)

### Local dev
From `web/`:

```bash
npm install
npm run preprocess
npm run dev
```

Open `http://localhost:3000`.

### Preprocessing
`npm run preprocess` reads from `../data/player_data/player_data/` and writes:
- `public/data/index.json`
- `public/data/matches/<match_id>.json`
- `public/minimaps/*` (copied from dataset)

### Hosting
Deploy this folder (`web/`) to Vercel (free tier) and share the URL.
