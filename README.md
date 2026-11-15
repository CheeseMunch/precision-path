# Precision Path 🎯

**Live Game:** [https://precisionpath.pro](https://precisionpath.pro) | [https://www.precisionpath.pro](https://www.precisionpath.pro)  
**Repository:** [https://github.com/CheeseMunch/precision-path](https://github.com/CheeseMunch/precision-path)

A real-time multiplayer top-down radial survival browser game built with **React 19 + HTML5 Canvas**, a **dedicated Node.js + Socket.io authoritative server**, **MikroORM + PostgreSQL**, and hosted via **Cloudflare Tunnel (`cloudflared`)** & **Docker**.

---

## 🕹️ Gameplay & Level Progression

* **Objective:** Keep your pilot circle inside the `325px`-radius circular arena while dodging procedurally generated obstacles collapsing inward.
* **Controls:**
  * **Desktop:** Smooth mouse tracking inside the arena boundary.
  * **Mobile / Touch:** Direct touch-and-drag steering with automatic viewport coordinate scaling.
  * **Pause:** Press **`ESC`** at any time to pause/resume the simulation (`togglePause`).
* **Tiered Directional Progression (7 Seconds per Round):**
  * **Level 1 (7s):** Obstacles attack from **1 Side**.
  * **Level 2 (7s):** Obstacles attack from **2 Sides**.
  * **Level 3 (7s):** Obstacles attack from **3 Sides**.
  * **Level 4 (7s):** Obstacles attack from **All 4 Sides** (`north`, `east`, `south`, `west`).
  * **Level 5 (Endless Mode):** All 4 sides active with continuous speed scaling and high-score tracking.
* **5 Procedural Obstacle Archetypes:**
  1. `single-gap-wall` — Classic barrier wall with a single randomized gate.
  2. `double-gap-wall` — Split barrier with a center island and two navigable gates.
  3. `sweeping-half-wall` — Flank sweeper anchored to one side of the arena.
  4. `staggered-blocks` *(Level 2+)* — 3 staggered chicane blocks at varying depths and widths.
  5. `orb-cluster` *(Level 3+)* — Barrage of circular pulse orbs with depth stagger and lateral drift.

---

## ⚙️ Master Configuration (`shared/gameConfig.ts`)

All gameplay timings, arena geometry, and procedural randomness parameters live in [`shared/gameConfig.ts`](./shared/gameConfig.ts) and can also be adjusted live in the browser via the **Tune Config** modal (`GET/POST /api/config`):

* **`rounds.tierDurations`:** Duration in seconds for Levels 1–4 (default: `7` seconds each).
* **`randomness`:**
  * `seed`: `null` for fresh random runs every match, or any integer for deterministic seeded runs.
  * `gapPositionVariance`, `gapSizeVariance`, `speedVariance`, `waveIntervalJitter`, `staggerVariance`, `randomizeRound1Direction`.
* **`obstacleTypes`:** Individual enable/disable flags, minimum level (`minTier`), and spawn probability weights (`weight`) for each of the 5 obstacle archetypes.
* **`arena`:** Playable circle radius (`325px`), player radius (`13px`), and hitbox forgiveness (`1.5px`).

---

## 🧱 Tech Stack (Frontend & Backend)

### Frontend (`client/`)
* **Framework & Language:** **React 19** (`react`, `react-dom` `^19.0.0`) + **TypeScript** (`^5.7.2`)
* **Rendering Engine:** **HTML5 2D Canvas** for the arena, obstacle patterns, edge warning bars, and player rendering
* **Styling & Icons:** **Tailwind CSS** (`^3.4.17`), **PostCSS**, **Autoprefixer**, and **Lucide React** (`^1.16.0`)
* **Real-Time Client:** **Socket.io Client** (`^4.8.1`) for live `gameState` updates and throttled pointer/touch input
* **Build Tooling:** **Vite** (`^6.0.7`) + `@vitejs/plugin-react` (HMR dev server on `:5173` and production bundle to `client/dist`)

### Backend (`server/`)
* **Runtime & Language:** **Node.js** + **TypeScript** (`tsx` `^4.19.2` for dev watch, `tsc` for production builds)
* **HTTP & API Server:** **Express.js** (`^4.21.2`), **CORS** (`^2.8.5`), and **dotenv** (`^16.4.7`) serving static builds, REST endpoints (`/api/health`, `/api/leaderboard`, `/api/config`), and the localhost-only Admin Studio (`/db-admin`)
* **Authoritative Multiplayer:** **Socket.io** (`^4.8.1`) driving the server-side `GameEngine` and `RoomManager`
* **Database & ORM:** **MikroORM v6** (`@mikro-orm/core`, `@mikro-orm/postgresql`, `@mikro-orm/reflection` `^6.4.0`) + **`pg`** (`^8.13.1`) backed by **Embedded PostgreSQL** (`embedded-postgres` `^18.6.0-beta.19`, `.pgdata`) with automatic in-memory fallback

---

## 🌐 Networking Stack & Tools Used

| Layer | Tool / Technology | Purpose |
| :--- | :--- | :--- |
| **Real-Time Transport** | **Socket.io** (`ws://` / `wss://`) | Authoritative 30Hz server state broadcast (`gameState`, `tierUp`) & ~55Hz throttled client pointer input (`playerInput`). |
| **HTTP & Static Server** | **Express.js** (`PORT=4000`) | Single-origin server that serves the compiled Vite React bundle (`client/dist`), REST API (`/api/health`, `/api/leaderboard`, `/api/config`), and Socket.io on one port. |
| **Database & ORM** | **PostgreSQL 16 + MikroORM v6** | Unit-of-Work persistence for `User` high scores and `MatchHistory` records, with automatic in-memory fallback when PostgreSQL is offline. |
| **Edge Reverse Tunnel** | **Cloudflare Tunnel (`cloudflared`)** | Encrypted outbound QUIC tunnel from the host PC (`localhost:4000`) to Cloudflare's global edge (`precisionpath.pro`), requiring zero router port-forwarding and hiding the host IP. |
| **Domain & DNS** | **Porkbun + Cloudflare DNS** | Domain `precisionpath.pro` registered on Porkbun, delegated to Cloudflare authoritative nameservers (`ophelia.ns.cloudflare.com`, `zac.ns.cloudflare.com`) with proxied `CNAME` tunnel routes and Universal SSL. |
| **Containerization** | **Docker & Docker Compose** | Optional `Dockerfile` and `docker-compose.yml` bundling the Node.js server, built React frontend, and `postgres:16-alpine`. |

---

## 🚀 Complete Deployment Process

### 1. Local Development (Two-Port Hot Reload)

Run the dedicated game server and Vite dev server in separate terminals:

```powershell
# Terminal 1: Start dedicated game server (http://localhost:4000)
cd server
npm install
npm run dev

# Terminal 2: Start Vite React dev server (http://localhost:5173)
cd client
npm install
npm run dev
```

---

### 2. PC Self-Hosting via Cloudflare Tunnel (`precisionpath.pro`)

#### Quick Start (One-Click Launcher)
Whenever you restart your PC and want to host `https://precisionpath.pro`:

```powershell
cd C:\Users\ankit\precision-path
.\start-pc-host.ps1
```
This script automatically:
1. Builds the latest production React frontend into `client/dist`.
2. Starts the dedicated Node.js + Socket.io server on `http://localhost:4000`.
3. Starts the permanent `precision-path` Cloudflare Tunnel routing `https://precisionpath.pro` and `https://www.precisionpath.pro` to `http://localhost:4000`.

---

#### Full Step-by-Step Cloudflare Tunnel Setup (From Scratch)

If setting up on a new Windows machine:

1. **Install `cloudflared` via Winget:**
   ```powershell
   winget install --id Cloudflare.cloudflared --accept-package-agreements --accept-source-agreements
   ```

2. **Authenticate `cloudflared` with Cloudflare:**
   ```powershell
   & "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel login
   ```
   *Select `precisionpath.pro` in the browser prompt and click **Authorize**. If `cert.pem` downloads to your `Downloads` folder, copy it into `C:\Users\<username>\.cloudflared\cert.pem`.*

3. **Create the Named Tunnel (Only Needed Once):**
   ```powershell
   & "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel create precision-path
   ```
   *Current Tunnel ID:* `8bcdd1cc-ba69-4da6-b130-05f9eb6bd991`

4. **Route Cloudflare DNS Records to the Tunnel:**
   ```powershell
   & "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --overwrite-dns route dns precision-path precisionpath.pro
   & "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --overwrite-dns route dns precision-path www.precisionpath.pro
   ```

5. **Configure Ingress Rules (`C:\Users\<username>\.cloudflared\config.yml`):**
   ```yaml
   tunnel: 8bcdd1cc-ba69-4da6-b130-05f9eb6bd991
   credentials-file: C:\Users\ankit\.cloudflared\8bcdd1cc-ba69-4da6-b130-05f9eb6bd991.json

   ingress:
     - hostname: precisionpath.pro
       service: http://localhost:4000
     - hostname: www.precisionpath.pro
       service: http://localhost:4000
     - service: http_status:404
   ```

6. **Run the Tunnel:**
   ```powershell
   & "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel run precision-path
   ```

---

### 3. Docker Compose (Optional Containerized Run)

The repository includes an optional [`Dockerfile`](./Dockerfile) and [`docker-compose.yml`](./docker-compose.yml) that bundle the React UI, Node.js server, and PostgreSQL 16:

```bash
docker compose up -d --build
```
*Exposes the full application + WebSockets on port `4000` with persistent PostgreSQL storage.*

---

## 🛠️ Networking & DNS Diagnostic Commands

Useful commands for verifying DNS propagation, Cloudflare edge routing, and local server health on Windows PowerShell:

```powershell
# 1. Check local game server health
Invoke-RestMethod -Uri "http://localhost:4000/api/health"

# 2. Check live production health over HTTPS
Invoke-RestMethod -Uri "https://precisionpath.pro/api/health"

# 3. Verify authoritative nameservers at the .pro registry (RDAP)
(Invoke-RestMethod -Uri "https://rdap.identitydigital.services/rdap/domain/precisionpath.pro").nameservers.ldhName

# 4. Query Cloudflare's authoritative nameserver directly
Resolve-DnsName -Name precisionpath.pro -Server ophelia.ns.cloudflare.com -Type A

# 5. Flush Windows DNS cache if switching DNS records
ipconfig /flushdns
```
*(In Chrome/Edge, you can also clear the browser's internal DNS cache at `chrome://net-internals/#dns`.)*
