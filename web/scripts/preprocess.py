import json
import os
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Tuple

import pandas as pd
import pyarrow.parquet as pq


RAW_DATA_DEFAULT = Path(__file__).resolve().parents[2] / "data" / "player_data" / "player_data"
OUT_DATA_DEFAULT = Path(__file__).resolve().parents[1] / "public" / "data"
OUT_MATCHES_DIRNAME = "matches"


MAP_CONFIG: dict[str, dict[str, float]] = {
    "AmbroseValley": {"scale": 900, "origin_x": -370, "origin_z": -473},
    "GrandRift": {"scale": 581, "origin_x": -290, "origin_z": -290},
    "Lockdown": {"scale": 1000, "origin_x": -500, "origin_z": -500},
}


def is_numeric_user_id(user_id: str) -> bool:
    return user_id.isdigit()


def decode_event(v: Any) -> str:
    if isinstance(v, (bytes, bytearray)):
        return v.decode("utf-8", errors="replace")
    return str(v)


def datetime_to_ms(dt_series: pd.Series) -> pd.Series:
    # parquet timestamps come as datetime64[ns] in pandas; convert to integer ms
    return (dt_series.astype("int64") // 1_000_000).astype("int64")


@dataclass
class PlayerBlob:
    user_id: str
    is_bot: bool
    positions: List[Tuple[int, float, float]]  # (t_ms_abs, x, z)
    events: List[Dict[str, Any]]  # {t_ms_abs, x, z, type}


@dataclass
class MatchBlob:
    match_id: str
    map_id: str
    date: str
    players: Dict[str, PlayerBlob]


def iter_player_files(raw_root: Path) -> List[Tuple[str, Path]]:
    days: list[tuple[str, Path]] = []
    for child in sorted(raw_root.iterdir()):
        if child.is_dir() and child.name.startswith("February_"):
            days.append((child.name, child))

    out: list[tuple[str, Path]] = []
    for day_name, day_path in days:
        for f in day_path.iterdir():
            if not f.is_file():
                continue
            if f.name.startswith("."):
                continue
            out.append((day_name, f))
    return out


def parse_user_id_from_filename(filename: str) -> str:
    # {user_id}_{match_id}.nakama-0
    base = filename.split(".")[0]  # drop .nakama-0 and anything after first dot
    return base.split("_")[0]


def main() -> None:
    raw_root = Path(os.environ.get("RAW_PLAYER_DATA_DIR", str(RAW_DATA_DEFAULT))).resolve()
    out_root = Path(os.environ.get("OUT_PUBLIC_DATA_DIR", str(OUT_DATA_DEFAULT))).resolve()
    out_matches = out_root / OUT_MATCHES_DIRNAME

    if not raw_root.exists():
        raise SystemExit(f"Raw data folder not found: {raw_root}")

    out_matches.mkdir(parents=True, exist_ok=True)

    # Copy minimaps into web/public/minimaps (so Next can serve them)
    minimaps_src = raw_root / "minimaps"
    minimaps_dst = out_root.parents[0] / "minimaps"
    minimaps_dst.mkdir(parents=True, exist_ok=True)
    if minimaps_src.exists():
        for img in minimaps_src.iterdir():
            if img.is_file() and img.suffix.lower() in [".png", ".jpg", ".jpeg", ".webp"]:
                shutil.copy2(img, minimaps_dst / img.name)

    files = iter_player_files(raw_root)
    matches: Dict[str, MatchBlob] = {}

    for day_name, file_path in files:
        user_id = parse_user_id_from_filename(file_path.name)
        bot = is_numeric_user_id(user_id)

        try:
            table = pq.read_table(file_path)
            df = table.to_pandas()
        except Exception:
            # skip any unreadable file
            continue

        if df.empty:
            continue

        df["event"] = df["event"].apply(decode_event)
        df["t_ms"] = datetime_to_ms(df["ts"])

        match_id = str(df["match_id"].iloc[0])
        map_id = str(df["map_id"].iloc[0])

        # sanity: keep only maps we know
        if map_id not in MAP_CONFIG:
            continue

        match = matches.get(match_id)
        if match is None:
            match = MatchBlob(match_id=match_id, map_id=map_id, date=day_name, players={})
            matches[match_id] = match

        # If a match appears in multiple day folders (unlikely), keep the first date we saw.
        if match.map_id != map_id:
            # ignore inconsistent data
            continue

        pb = match.players.get(user_id)
        if pb is None:
            pb = PlayerBlob(user_id=user_id, is_bot=bot, positions=[], events=[])
            match.players[user_id] = pb

        pos_mask = df["event"].isin(["Position", "BotPosition"])
        pos_df = df.loc[pos_mask, ["t_ms", "x", "z"]].sort_values("t_ms")
        if not pos_df.empty:
            pb.positions.extend([(int(t), float(x), float(z)) for t, x, z in pos_df.itertuples(index=False, name=None)])

        ev_df = df.loc[~pos_mask, ["t_ms", "x", "z", "event"]].sort_values("t_ms")
        if not ev_df.empty:
            pb.events.extend(
                [{"t_ms": int(t), "x": float(x), "z": float(z), "type": str(ev)} for t, x, z, ev in ev_df.itertuples(index=False, name=None)]
            )

    index_matches: list[dict[str, Any]] = []

    for match_id, match in matches.items():
        # normalize time per match
        all_t: list[int] = []
        for p in match.players.values():
            all_t.extend([t for (t, _, _) in p.positions])
            all_t.extend([int(e["t_ms"]) for e in p.events])

        if not all_t:
            continue

        t0 = min(all_t)
        t1 = max(all_t)
        duration_ms = int(max(0, t1 - t0))

        humans = 0
        bots = 0

        players_out: list[dict[str, Any]] = []
        for p in match.players.values():
            if p.is_bot:
                bots += 1
            else:
                humans += 1

            players_out.append(
                {
                    "userId": p.user_id,
                    "isBot": p.is_bot,
                    "positions": [{"t": int(t - t0), "x": x, "z": z} for (t, x, z) in p.positions],
                    "events": [{"t": int(e["t_ms"] - t0), "x": e["x"], "z": e["z"], "type": e["type"]} for e in p.events],
                }
            )

        match_out = {
            "matchId": match.match_id,
            "mapId": match.map_id,
            "date": match.date,
            "durationMs": duration_ms,
            "players": players_out,
        }

        out_name = f"{match_id}.json"
        out_path = out_matches / out_name
        out_path.write_text(json.dumps(match_out, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")

        index_matches.append(
            {
                "matchId": match.match_id,
                "mapId": match.map_id,
                "date": match.date,
                "durationMs": duration_ms,
                "humans": humans,
                "bots": bots,
                "path": f"/data/{OUT_MATCHES_DIRNAME}/{out_name}",
            }
        )

    index = {
        "maps": list(MAP_CONFIG.keys()),
        "dates": sorted({m["date"] for m in index_matches}),
        "matches": sorted(index_matches, key=lambda m: (m["date"], m["mapId"], m["matchId"])),
        "mapConfig": MAP_CONFIG,
    }

    out_root.mkdir(parents=True, exist_ok=True)
    (out_root / "index.json").write_text(json.dumps(index, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"Wrote {len(index_matches)} matches to {out_matches}")
    print(f"Wrote index to {out_root / 'index.json'}")


if __name__ == "__main__":
    main()

