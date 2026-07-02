## Dataset notes (from provided README)

### Scope
- **Dates**: Feb 10–14, 2026 (Feb 14 partial)
- **Files**: 1,243 parquet files (no `.parquet` extension)
- **Rows**: ~89,000
- **Matches**: 796
- **Maps**: `AmbroseValley`, `GrandRift`, `Lockdown`

### Schema (per row)
- `user_id` (string): UUID = human, numeric string = bot
- `match_id` (string): includes `.nakama-0`
- `map_id` (string)
- `x`, `y`, `z` (float32): use **x and z** for minimap; `y` is elevation
- `ts` (timestamp ms): **elapsed time within match**
- `event` (binary/bytes): decode as UTF-8 string

### Event types
- **Movement**: `Position`, `BotPosition`
- **Combat**: `Kill`, `Killed`, `BotKill`, `BotKilled`
- **Environment**: `KilledByStorm`
- **Items**: `Loot`

### Bots vs humans
- Humans: UUID user_id, typically `Position`, `Kill`, `Killed`, `Loot`, `KilledByStorm`
- Bots: numeric user_id, typically `BotPosition`, `BotKill`, `BotKilled`

