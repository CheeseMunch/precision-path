# Precision Path 🎯

**Live Game:** [https://precisionpath.pro](https://precisionpath.pro) | [https://www.precisionpath.pro](https://www.precisionpath.pro)  
**Repository:** [https://github.com/CheeseMunch/precision-path](https://github.com/CheeseMunch/precision-path)

A real-time multiplayer top-down dodging & gate-clearing arcade game built with **React 19 + HTML5 Canvas**, a **dedicated Node.js + Socket.io authoritative server**, **MikroORM + PostgreSQL 16**, **local Ollama AI level generation**, and hosted on an Apple Silicon **Mac mini** via **PM2** and **Cloudflare Tunnel (`cloudflared`)**.

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

### 4. Generate AI Level (Local Ollama)
* Powered by local models running on the Mac mini (**`qwen3.5:9b`**, **`gemma4:12b`**, **`gpt-oss:20b`**).
* **3 Difficulty Tiers:** `Easy` (`7–9` waves), `Medium` (`10–13` waves), and `Hard` (`24–30` waves, 4-cardinal blitz, `5+` multi-gate walls).
* **5-Step Completability Validator:** Clamps arena bounds, enforces direction-change clearances & lateral reachability, attaches sequential gates (`1..N`) only onto obstacle-framed openings, and runs a simulated playthrough before launching.
* **FIFO Generation Queue & Cancel:** Serializes concurrent requests (`/api/ai-queue-status`) with live queue position and a `✕` stop-generating confirmation popup.

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
* **MikroORM v6** + **PostgreSQL 16** (`users`, `match_history`, `community_levels` entities, with automatic in-memory fallback)
* **Local Admin Consoles** *(localhost-only via `isDirectLocalhost` + `.admin-token`)*:
  * `/campaign-admin` — Campaign & Community Level Designer
  * `/db-admin` — Live Tuning & PostgreSQL Studio

---

## 🚀 Development & Mac mini Production Hosting

### 1. Local Development (Windows)
Run the local game server and Vite dev client independently of production:

```powershell
# Terminal 1: Dedicated game server + embedded PostgreSQL (http://127.0.0.1:4000)
cd server
npm install
npm run dev

# Terminal 2: Vite React dev server (http://localhost:5173)
cd client
npm install
npm run dev -- --port 5173
```

* Local Admin Consoles: `http://127.0.0.1:4000/campaign-admin` and `http://127.0.0.1:4000/db-admin`.

---

### 2. Production Hosting (`macmini` → `https://precisionpath.pro`)
Production runs on an Apple Silicon **Mac mini** (`ssh macmini`):
* **PostgreSQL 16**: Homebrew `postgresql@16` (`brew services start postgresql@16`, DB `precision_path`).
* **PM2 Processes**:
  * `precision-path-server` — `NODE_ENV=production` on port `4000` (serves REST API, Socket.io, AI level generation via local Ollama `http://127.0.0.1:11434`, and compiled `client/dist`).
  * `precision-path-tunnel` — `cloudflared tunnel run precision-path` (`8bcdd1cc-ba69-4da6-b130-05f9eb6bd991`) routing `precisionpath.pro` & `www.precisionpath.pro` to `http://localhost:4000`.

#### One-Command Deploy from Windows
After committing changes on Windows, deploy to `macmini`:

```powershell
.\deploy-macmini.ps1
```
This script:
1. Checks `macmini` for any live `server/campaign-config.json` edits (from `:4001/campaign-admin`) and syncs/commits them back to Windows automatically.
2. Pushes `main` to `origin` and transfers a `git bundle` to `macmini`.
3. Builds `client` and `server` on `macmini`, restarts `precision-path-server` in PM2, and verifies `https://precisionpath.pro/api/health`.

#### SSH Port Forwarding to Mac mini Admin Consoles
```powershell
ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -L 4001:127.0.0.1:4000 macmini
```
Then open `http://127.0.0.1:4001/campaign-admin` or `http://127.0.0.1:4001/db-admin` in your Windows browser.

---

## 🛠️ Health & Diagnostic Commands

```powershell
# Check local dev server health
Invoke-RestMethod -Uri "http://127.0.0.1:4000/api/health"

# Check live production health
Invoke-RestMethod -Uri "https://precisionpath.pro/api/health"

# Check Mac mini Ollama models
Invoke-RestMethod -Uri "https://precisionpath.pro/api/ai-models"
```
