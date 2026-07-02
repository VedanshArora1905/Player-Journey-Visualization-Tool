import fs from "node:fs";
import path from "node:path";
import url from "node:url";

import duckdb from "duckdb";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const RAW_DATA_DEFAULT = path.resolve(__dirname, "..", "..", "data", "player_data", "player_data");
const OUT_DATA_DEFAULT = path.resolve(__dirname, "..", "public", "data");
const OUT_MATCHES_DIRNAME = "matches";

const MAP_CONFIG = {
  AmbroseValley: { scale: 900, origin_x: -370, origin_z: -473 },
  GrandRift: { scale: 581, origin_x: -290, origin_z: -290 },
  Lockdown: { scale: 1000, origin_x: -500, origin_z: -500 },
};

function decodeEvent(v) {
  if (Buffer.isBuffer(v)) return v.toString("utf8");
  if (v instanceof Uint8Array) return Buffer.from(v).toString("utf8");
  return String(v);
}

function isBotUserId(userId) {
  return /^\d+$/.test(userId);
}

function isDayFolder(name) {
  return name.startsWith("February_");
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function safeReaddir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function writeJson(filePath, obj, pretty = false) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, pretty ? 2 : 0), "utf8");
}

function toMs(ts) {
  // parquetjs-lite returns JS Date for timestamp columns
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === "number") return ts; // already ms
  return new Date(ts).getTime();
}

function duckdbAll(db, sql) {
  return new Promise((resolve, reject) => {
    db.all(sql, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function extractDayFromFilename(filename) {
  // .../February_10/<file>
  const m = String(filename).match(/February_\d{2}/);
  return m?.[0] ?? "Unknown";
}

async function main() {
  const rawRoot = path.resolve(process.env.RAW_PLAYER_DATA_DIR ?? RAW_DATA_DEFAULT);
  const outRoot = path.resolve(process.env.OUT_PUBLIC_DATA_DIR ?? OUT_DATA_DEFAULT);
  const outMatches = path.join(outRoot, OUT_MATCHES_DIRNAME);

  if (!fs.existsSync(rawRoot)) {
    console.error(`Raw data folder not found: ${rawRoot}`);
    process.exit(1);
  }

  ensureDir(outMatches);

  // Copy minimaps
  const minimapsSrc = path.join(rawRoot, "minimaps");
  const minimapsDst = path.resolve(outRoot, "..", "minimaps");
  ensureDir(minimapsDst);
  for (const ent of safeReaddir(minimapsSrc)) {
    if (!ent.isFile()) continue;
    const ext = path.extname(ent.name).toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) continue;
    fs.copyFileSync(path.join(minimapsSrc, ent.name), path.join(minimapsDst, ent.name));
  }

  const matches = new Map(); // matchId -> { matchId,mapId,date, players: Map<userId, {...}> }

  const db = new duckdb.Database(":memory:");

  // DuckDB can read all parquet files (even without .parquet extension) via glob.
  // filename=true adds a 'filename' column so we can infer the day folder.
  const parquetGlob = path
    .join(rawRoot, "February_*", "*.nakama-0")
    .replaceAll("\\", "/"); // DuckDB prefers forward slashes

  let rows;
  try {
    rows = await duckdbAll(
      db,
      `
      SELECT
        user_id,
        match_id,
        map_id,
        x,
        z,
        ts,
        event,
        filename
      FROM read_parquet('${parquetGlob}', filename=true);
      `,
    );
  } catch (e) {
    console.error("Failed to read parquet via DuckDB. Double-check dataset path:", parquetGlob);
    console.error(e);
    process.exit(1);
  }

  for (const r of rows) {
    const userId = String(r.user_id);
    const matchId = String(r.match_id);
    const mapId = String(r.map_id);
    if (!MAP_CONFIG[mapId]) continue;

    const day = extractDayFromFilename(r.filename);
    const isBot = isBotUserId(userId);

    const match = matches.get(matchId) ?? {
      matchId,
      mapId,
      date: day,
      players: new Map(),
    };
    if (match.mapId !== mapId) continue;
    matches.set(matchId, match);

    const player = match.players.get(userId) ?? {
      userId,
      isBot,
      positions: [],
      events: [],
    };
    match.players.set(userId, player);

    const tMs = toMs(r.ts);
    const x = Number(r.x);
    const z = Number(r.z);
    const event = decodeEvent(r.event);

    if (event === "Position" || event === "BotPosition") {
      player.positions.push({ tMs, x, z });
    } else {
      player.events.push({ tMs, x, z, type: event });
    }
  }

  const indexMatches = [];

  for (const match of matches.values()) {
    let t0 = Number.POSITIVE_INFINITY;
    let t1 = Number.NEGATIVE_INFINITY;

    for (const p of match.players.values()) {
      for (const pt of p.positions) {
        t0 = Math.min(t0, pt.tMs);
        t1 = Math.max(t1, pt.tMs);
      }
      for (const e of p.events) {
        t0 = Math.min(t0, e.tMs);
        t1 = Math.max(t1, e.tMs);
      }
    }
    if (!Number.isFinite(t0) || !Number.isFinite(t1)) continue;

    let humans = 0;
    let bots = 0;

    const playersOut = [];
    for (const p of match.players.values()) {
      if (p.isBot) bots += 1;
      else humans += 1;

      p.positions.sort((a, b) => a.tMs - b.tMs);
      p.events.sort((a, b) => a.tMs - b.tMs);

      playersOut.push({
        userId: p.userId,
        isBot: p.isBot,
        positions: p.positions.map((pt) => ({ t: Math.max(0, pt.tMs - t0), x: pt.x, z: pt.z })),
        events: p.events.map((e) => ({ t: Math.max(0, e.tMs - t0), x: e.x, z: e.z, type: e.type })),
      });
    }

    const durationMs = Math.max(0, t1 - t0);
    const outName = `${match.matchId}.json`;
    writeJson(path.join(outMatches, outName), {
      matchId: match.matchId,
      mapId: match.mapId,
      date: match.date,
      durationMs,
      players: playersOut,
    });

    indexMatches.push({
      matchId: match.matchId,
      mapId: match.mapId,
      date: match.date,
      durationMs,
      humans,
      bots,
      path: `/data/${OUT_MATCHES_DIRNAME}/${outName}`,
    });
  }

  const index = {
    maps: Object.keys(MAP_CONFIG),
    dates: Array.from(new Set(indexMatches.map((m) => m.date))).sort(),
    matches: indexMatches.sort((a, b) => `${a.date}|${a.mapId}|${a.matchId}`.localeCompare(`${b.date}|${b.mapId}|${b.matchId}`)),
    mapConfig: MAP_CONFIG,
  };

  ensureDir(outRoot);
  writeJson(path.join(outRoot, "index.json"), index, true);

  console.log(`Wrote ${indexMatches.length} matches to ${outMatches}`);
  console.log(`Wrote index to ${path.join(outRoot, "index.json")}`);
}

main();

