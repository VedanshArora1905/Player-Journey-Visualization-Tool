import type { MapId, MapConfig } from "@/lib/maps";

export type MatchIndexRow = {
  matchId: string;
  mapId: MapId;
  date: string;
  durationMs: number;
  humans: number;
  bots: number;
  path: string;
};

export type DataIndex = {
  maps: MapId[];
  dates: string[];
  matches: MatchIndexRow[];
  mapConfig: Record<MapId, MapConfig>;
};

export type PositionPoint = { t: number; x: number; z: number };
export type EventPoint = { t: number; x: number; z: number; type: string };

export type MatchBlob = {
  matchId: string;
  mapId: MapId;
  date: string;
  durationMs: number;
  players: Array<{
    userId: string;
    isBot: boolean;
    positions: PositionPoint[];
    events: EventPoint[];
  }>;
};

