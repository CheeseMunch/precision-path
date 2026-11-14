# Precision Path 🎯

A high-octane, radial survival browser multiplayer game built with a **dedicated Node.js server**, **MikroORM + PostgreSQL**, and **React + HTML5 Canvas**.

---

## 🕹️ Gameplay & Controls

* **Objective:** Keep your craft circle alive inside the inner arena boundary while avoiding converging barriers and obstacles.
* **Controls:** 
  * **Desktop:** Mouse cursor guides your craft smoothly inside the arena disc.
  * **Mobile:** Direct touch-and-drag steering with real-time low-latency response.
* **Tier Progression:**
  1. **Tier 1 (Unidirectional):** Barriers approaching from 1 direction with navigation gaps.
  2. **Tier 2 (Dual Intersect):** 2 simultaneous perpendicular or opposing directions.
  3. **Tier 3 (Tri-Pinch):** 3-way converging pinch.
  4. **Tier 4 (4-Way Crossfire):** All 4 cardinal sides collapsing inward.
  5. **Tier 5 (Endless Survival):** Speed scaling, rotating hazard orbs, and ultimate leaderboard survival score!

---

## 👥 Multiplayer Architecture

* **Dedicated Game Loop:** High-tick rate authoritative Node.js server with room management and real-time state synchronization via **Socket.io**.
* **Spectator / Ghost Mode:** Players who hit an obstacle transform into transparent ghosts, watching the surviving pilots battle for the championship.
* **Database & Persistence (MikroORM + PostgreSQL):**
  * Auto-persists match records, survival durations, and pilot high scores using MikroORM's Unit of Work pattern.
  * Includes graceful in-memory fallback if local PostgreSQL is not running.

---

## 🚀 Quick Start

### 1. Run the Dedicated Game Server
```bash
cd server
npm install
npm run dev
```
*Server starts on `http://localhost:4000`.*

### 2. Run the React Client
```bash
cd client
npm install
npm run dev
```
*Frontend opens on `http://localhost:5173`.*

---

## 🗄️ PostgreSQL Setup (Optional)
If you wish to connect a live PostgreSQL database (e.g. Neon, Supabase, or local PostgreSQL):
1. Copy `server/.env.example` to `server/.env`
2. Set your `DATABASE_URL`:
```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/precision_path
```
MikroORM will automatically detect the database and synchronize schemas on startup.
