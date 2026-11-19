# Precision Path 🎯

**Live Game:** [https://precisionpath.pro](https://precisionpath.pro) | [https://www.precisionpath.pro](https://www.precisionpath.pro)  
**Repository:** [https://github.com/CheeseMunch/precision-path](https://github.com/CheeseMunch/precision-path)

A real-time multiplayer top-down dodging & gate-clearing arcade game built with **React 19 + HTML5 Canvas**, an **authoritative Node.js + Socket.io server**, **MikroORM + PostgreSQL**, **local LLM level generation**, and served behind a **Cloudflare Tunnel**.

---

## 🕹️ Game Modes & Features

* **Controls:**
  * **Desktop:** Smooth mouse tracking or click-to-teleport inside the `450×800` portrait arena.
  * **Mobile / Touch:** Direct touch-and-drag steering with responsive viewport scaling.
  * **Pause:** Press **`ESC`** (or tap **PAUSE**) to freeze both obstacles and gates.

### 1. Campaign Mode (3 Stories • 15 Levels)
* **`1. Training`** *(Levels 1–5)* — Introduces gate-clearing, orbs, multi-wave side-steps, rotational dodging, and orb entry patterns.
* **`2. Gauntlet`** *(Levels 6–10)* — Crossfire relays, orb matrices, and faster multi-axis gauntlets.
* **`3. Gatekeeper`** *(Levels 11–15)* — Gate-heavy, tightly spaced corridors (`0.4–0.5s`) with overlapping direction transitions.
* Deterministic `triggerAt` server scheduling paired with a shared client `renderElapsedTime` clock keeps wave spacing locked regardless of network jitter.

### 2. Play Survival & Survival Leaderboard
* Solo or multiplayer (`Create Multiplayer Lobby` / `Join with Code`) tiered directional survival scaling into Endless mode.
* **Survival Leaderboard** persists pilot high scores, survival times, and match history in PostgreSQL.

### 3. Community Level Creator & Browser
* **Browse Community Levels** from the Lobby, play custom 1-level challenges, and track **Player Clears** stored in PostgreSQL (`community_levels`).
* **Community Level Creator**: Interactive `450×800` live map editor with timeline scrubber, spawn & dummy collision testing, click-to-attach gates, bulk wave schedule actions, and creator-only edit/delete permissions.

### 4. Generate AI Level
* Powered by local LLM inference on the game host.
* **3 Difficulty Tiers:** `Easy` (`7–9` waves), `Medium` (`10–13` waves), and `Hard` (`24–30` waves, 4-cardinal blitz, `5+` multi-gate walls).
* **5-Step Completability Validator:** Clamps arena bounds, enforces direction-change clearances & lateral reachability, attaches sequential gates (`1..N`) only onto obstacle-framed openings, and runs a simulated playthrough before launching.
* **Generation Queue & Cancel:** Serializes concurrent requests with live queue position and a confirmation prompt when cancelling.

### 6 Obstacle Archetypes
1. `single-gap-wall` — Barrier wall with a single navigable gap.
2. `double-gap-wall` — Split barrier with a center island and two openings.
3. `sweeping-half-wall` — Flank sweeper anchored to one side of the arena.
4. `staggered-blocks` — Staggered chicane blocks with center and outer lanes.
5. `orb-cluster` — Pulse orb barrage with staggered openings.
6. `diagonal-spinner` — Drifting, rotating bar hazard.

---

## 🧱 Tech Stack

### Frontend (`client/`)
* **React 19** + **TypeScript** (`^5.7.2`) + **Vite** (`^6.x`)
* **HTML5 2D Canvas** renderer with shared [`levelEditorUtils.ts`](./shared/levelEditorUtils.ts) geometry & collision math
* **Tailwind CSS** + **Lucide React** + **Socket.io Client**

### Backend (`server/`)
* **Node.js** + **TypeScript** (`tsx` / `tsc`) + **Express.js** + **Socket.io**
* **MikroORM v6** + **PostgreSQL** (`users`, `match_history`, `community_levels` entities, with automatic in-memory fallback)

---

## 🚀 Development & Hosting

### 1. Local Development
Run the local game server and Vite dev client:

```bash
# Terminal 1: Dedicated game server
cd server
npm install
npm run dev

# Terminal 2: Vite React dev server
cd client
npm install
npm run dev
```

### 2. Production Hosting
* Production runs on a dedicated self-hosted server running PostgreSQL, the compiled Node.js + Express + Socket.io backend (serving the production `client/dist` bundle), local LLM inference, and an outbound Cloudflare Tunnel for TLS and edge routing.
