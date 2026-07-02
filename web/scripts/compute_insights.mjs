import path from "node:path";
import url from "node:url";
import duckdb from "duckdb";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const RAW_ROOT = path.resolve(__dirname, "..", "..", "data", "player_data", "player_data");

const MAP_CONFIG = {
  AmbroseValley: { scale: 900, origin_x: -370, origin_z: -473 },
  GrandRift: { scale: 581, origin_x: -290, origin_z: -290 },
  Lockdown: { scale: 1000, origin_x: -500, origin_z: -500 },
};

function all(db, sql) {
  return new Promise((resolve, reject) => {
    db.all(sql, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function globForDuckdb() {
  return path.join(RAW_ROOT, "February_*", "*.nakama-0").replaceAll("\\", "/");
}

async function main() {
  const db = new duckdb.Database(":memory:");
  const glob = globForDuckdb();

  const overview = await all(
    db,
    `
    SELECT
      map_id,
      COUNT(*) AS rows,
      COUNT(DISTINCT match_id) AS matches,
      COUNT(DISTINCT user_id) AS unique_users
    FROM read_parquet('${glob}')
    GROUP BY 1
    ORDER BY matches DESC;
    `,
  );

  const eventCounts = await all(
    db,
    `
    SELECT
      CAST(event AS VARCHAR) AS event_type,
      COUNT(*) AS cnt
    FROM read_parquet('${glob}')
    GROUP BY 1
    ORDER BY cnt DESC;
    `,
  );

  const stormVsPvpTiming = await all(
    db,
    `
    WITH base AS (
      SELECT
        CAST(event AS VARCHAR) AS event_type,
        EXTRACT(EPOCH FROM ts) AS t_sec
      FROM read_parquet('${glob}')
      WHERE CAST(event AS VARCHAR) IN ('KilledByStorm','Killed','BotKilled')
    )
    SELECT
      event_type,
      COUNT(*) AS cnt,
      AVG(t_sec) AS avg_t_sec,
      QUANTILE_CONT(t_sec, 0.5) AS median_t_sec
    FROM base
    GROUP BY 1
    ORDER BY cnt DESC;
    `,
  );

  // Bin points into a 64x64 grid in minimap UV space to find hotspots.
  // We only use x,z (ignore y), consistent with dataset README.
  const hotspotByMap = [];
  for (const [mapId, cfg] of Object.entries(MAP_CONFIG)) {
    const { scale, origin_x, origin_z } = cfg;
    const traffic = await all(
      db,
      `
      WITH pts AS (
        SELECT
          (x - ${origin_x}) / ${scale} AS u,
          (z - ${origin_z}) / ${scale} AS v
        FROM read_parquet('${glob}')
        WHERE map_id='${mapId}' AND CAST(event AS VARCHAR) IN ('Position','BotPosition')
      ),
      b AS (
        SELECT
          CAST(FLOOR(u*64) AS INTEGER) AS bx,
          CAST(FLOOR(v*64) AS INTEGER) AS by_
        FROM pts
        WHERE u BETWEEN 0 AND 1 AND v BETWEEN 0 AND 1
      )
      SELECT bx, by_ AS by, COUNT(*) AS cnt
      FROM b
      GROUP BY 1,2
      ORDER BY cnt DESC
      LIMIT 5;
      `,
    );

    const kills = await all(
      db,
      `
      WITH pts AS (
        SELECT
          (x - ${origin_x}) / ${scale} AS u,
          (z - ${origin_z}) / ${scale} AS v
        FROM read_parquet('${glob}')
        WHERE map_id='${mapId}' AND CAST(event AS VARCHAR) IN ('Kill','BotKill')
      ),
      b AS (
        SELECT
          CAST(FLOOR(u*64) AS INTEGER) AS bx,
          CAST(FLOOR(v*64) AS INTEGER) AS by_
        FROM pts
        WHERE u BETWEEN 0 AND 1 AND v BETWEEN 0 AND 1
      )
      SELECT bx, by_ AS by, COUNT(*) AS cnt
      FROM b
      GROUP BY 1,2
      ORDER BY cnt DESC
      LIMIT 5;
      `,
    );

    hotspotByMap.push({ mapId, trafficTop5: traffic, killsTop5: kills });
  }

  const result = { overview, eventCounts, stormVsPvpTiming, hotspotByMap };
  const json = JSON.stringify(
    result,
    (_k, v) => (typeof v === "bigint" ? Number(v) : v),
    2,
  );
  console.log(json);
}

main();

