## Insights (3)

### 1) AmbroseValley dominates playtests / production usage
**What caught my eye**: the match distribution is heavily skewed toward one map.

**Evidence**
- **Matches by map** (distinct `match_id`):
  - AmbroseValley: **566**
  - Lockdown: **171**
  - GrandRift: **59**

**Actionable takeaway**
- If level design iteration time is limited, AmbroseValley is the highest leverage target for traversal tuning, POI placement, and encounter shaping.
- **Metrics likely affected**: session length, engagement, loot-per-minute, extraction rate (downstream).

**Why a level designer should care**
- This tool is primarily a window into what players do most often; the data says AmbroseValley is where most of that behavior happens.

---

### 2) PvP is extremely rare in this telemetry slice; most “combat” is vs bots
**What caught my eye**: PvP kill/death markers barely show up compared to bot combat events.

**Evidence**
- Event counts:
  - `BotKill`: **2,415**
  - `BotKilled`: **700**
  - `Kill` (human killed human): **3**
  - `Killed` (human died to human): **3**

**Actionable takeaway**
- If this is representative, the map may not be driving frequent player-vs-player encounters (or PvP isn’t being captured as often as bot combat).
- Consider:
  - Rebalancing POIs / objectives to create more contested routes
  - Making extraction lanes intersect more often
- **Metrics likely affected**: PvP encounter rate, average time-to-first-contact, player retention (for competitive audiences).

**Why a level designer should care**
- Encounter cadence is a core “feel” lever. A journey tool makes it obvious when fights cluster—or when they don’t.

---

### 3) Movement concentrates into a small set of hotspots / corridors (per map)
**What caught my eye**: the traffic heatmap shows strong concentration rather than uniform exploration.

**Evidence**
- Using a coarse 64×64 binning in minimap UV space:
  - AmbroseValley top traffic bin: **(bx=25, by=13)** with **505** movement samples
  - Lockdown top traffic bin: **(bx=34, by=47)** with **147** movement samples
  - GrandRift top traffic bin: **(bx=32, by=29)** with **63** movement samples

**Actionable takeaway**
- These hotspots are candidates for:
  - Additional cover variation (if too lethal)
  - Loot/objective redistribution (if too dominant)
  - New connective paths (if the map is funneling too hard)
- **Metrics likely affected**: traversal diversity, area utilization, kill density, perceived “staleness” of routes.

**Why a level designer should care**
- If 80% of players run the same corridors, large parts of the map may be effectively “dead space”. Heatmaps make that visible quickly.

