/**
 * HTML/JS renderer for the Campaign Level Admin visual wave & gate designer (/campaign-admin).
 * Supports per-side offscreen obstacle waves, configurable order & delay between waves,
 * live timeline playback on the 450x800 map, and clicking openings on incoming waves
 * to attach/remove numbered checkpoint gates (with arena walls acting as endgates).
 */

export function renderCampaignAdminPage(adminToken: string): string {
  const safeToken = JSON.stringify(adminToken);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Precision Path — Campaign Wave &amp; Gate Designer</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background: #070a12; color: #e2e8f0; font-family: ui-sans-serif, system-ui, sans-serif; }
    .cyber-panel { background: #0d1322; border: 1px solid rgba(34, 211, 238, 0.22); }
    .input-dark { background: #060913; border: 1px solid #1e293b; color: #f8fafc; border-radius: 0.375rem; padding: 0.375rem 0.5rem; font-size: 0.75rem; width: 100%; }
    .input-dark:focus { outline: none; border-color: #22d3ee; }
    .side-btn { background: #0f172a; border: 1px solid #334155; color: #cbd5e1; padding: 0.4rem 0.65rem; border-radius: 0.5rem; font-size: 0.72rem; font-weight: 700; cursor: pointer; transition: all 0.15s; }
    .side-btn:hover { border-color: #22d3ee; color: #fff; }
    .side-btn.active { background: #06b6d4; border-color: #22d3ee; color: #04101a; }
    canvas { touch-action: none; }
  </style>
</head>
<body class="min-h-screen p-4 md:p-6">
  <div class="max-w-7xl mx-auto space-y-4">
    <!-- Header -->
    <div class="cyber-panel rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <div class="flex items-center gap-2">
          <span class="text-xs font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">Campaign Admin</span>
          <h1 class="text-xl font-black tracking-wide text-white">Offscreen Wave &amp; Attached Gate Designer</h1>
        </div>
        <p class="text-xs text-slate-400 mt-1">Choose a side, configure incoming obstacle waves &amp; timing, then press Play on the map and click wave openings to attach numbered checkpoint gates.</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <a href="/db-admin" class="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 font-bold rounded-lg text-xs uppercase tracking-wider border border-gray-700 transition">
          &larr; DB &amp; Endless Admin
        </a>
        <button onclick="saveCampaignConfig()" class="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black rounded-lg text-xs uppercase tracking-wider shadow-lg shadow-cyan-500/20 transition">
          Save All Levels
        </button>
      </div>
    </div>

    <!-- Status banner -->
    <div id="statusBanner" class="hidden rounded-lg px-4 py-2 text-xs font-semibold"></div>

    <!-- Level Tabs -->
    <div class="cyber-panel rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
      <div id="levelTabs" class="flex flex-wrap items-center gap-2"></div>
      <div class="flex items-center gap-2">
        <button onclick="addLevel()" class="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/35 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-bold uppercase tracking-wider transition">
          + Add Level
        </button>
        <button onclick="deleteCurrentLevel()" class="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/35 text-rose-300 border border-rose-500/40 rounded-lg text-xs font-bold uppercase tracking-wider transition">
          Delete Level
        </button>
      </div>
    </div>

    <!-- Main Editor Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
      <!-- Left: Interactive Map Playback + Gate Clicking -->
      <div class="lg:col-span-6 cyber-panel rounded-xl p-4 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="text-xs font-bold uppercase tracking-wider text-cyan-300">Live Map Timeline (450 &times; 800)</div>
          <div class="flex items-center gap-1.5">
            <button id="btnPlayPause" onclick="togglePlay()" class="px-3 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider transition">
              &#9654; Play
            </button>
            <button onclick="resetPlayback()" class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-600 transition">
              &#9198; 0.0s
            </button>
          </div>
        </div>

        <!-- Timeline Scrubber -->
        <div class="flex items-center gap-3 bg-[#060913] px-3 py-2 rounded-lg border border-slate-800">
          <input id="timeScrubber" type="range" min="0" max="15" step="0.05" value="0" oninput="scrubTime(Number(this.value))" class="flex-1 accent-cyan-400 cursor-pointer" />
          <span id="timeLabel" class="text-xs font-mono text-cyan-300 w-24 text-right">0.00s / 0.00s</span>
        </div>

        <div class="text-[11px] text-emerald-300/90 bg-emerald-950/30 border border-emerald-500/25 rounded-lg px-3 py-1.5">
          Tip: Press <strong>Play</strong> (or scrub the slider), then <strong>click any opening on an incoming wave</strong> on the map to attach or toggle a numbered Checkpoint Gate!
        </div>

        <div class="flex justify-center bg-[#04060c] rounded-xl p-3 border border-slate-800">
          <canvas id="editorCanvas" width="450" height="800" class="rounded-lg border border-cyan-500/30 shadow-2xl cursor-crosshair max-w-full h-auto"></canvas>
        </div>

        <div class="flex items-center justify-between text-[11px] text-slate-400">
          <span id="cursorCoords">X: 0, Y: 0</span>
          <span>Drag DUMMY ball anytime to test collisions &amp; gates (turns red on hit)</span>
        </div>
      </div>

      <!-- Right: Level Metadata + Side/Obstacle Builder + Wave Queue & Attached Gates -->
      <div class="lg:col-span-6 space-y-4">
        <!-- Level Metadata -->
        <div class="cyber-panel rounded-xl p-4 space-y-3">
          <div class="text-xs font-bold uppercase tracking-wider text-cyan-300">Level Settings</div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[11px] text-slate-400 mb-1">Level Name</label>
              <input id="metaName" type="text" class="input-dark" oninput="updateLevelMeta('name', this.value)" />
            </div>
            <div>
              <label class="block text-[11px] text-slate-400 mb-1">Description</label>
              <input id="metaDesc" type="text" class="input-dark" oninput="updateLevelMeta('description', this.value)" />
            </div>
            <div>
              <label class="block text-[11px] text-slate-400 mb-1">Clear Bonus Points</label>
              <input id="metaClearBonus" type="number" class="input-dark" oninput="updateLevelMeta('clearBonusPoints', Number(this.value))" />
            </div>
            <div>
              <label class="block text-[11px] text-slate-400 mb-1">Par Time (seconds)</label>
              <input id="metaParTime" type="number" class="input-dark" oninput="updateLevelMeta('parTimeSeconds', Number(this.value))" />
            </div>
          </div>
        </div>

        <!-- Add Wave by Side -->
        <div class="cyber-panel rounded-xl p-4 space-y-3">
          <div class="text-xs font-bold uppercase tracking-wider text-amber-300">Send Obstacle Wave From Side</div>
          <div class="grid grid-cols-4 gap-1.5" id="sideSelector">
            <button class="side-btn active" data-side="north" onclick="setBuilderSide('north')">North &darr;</button>
            <button class="side-btn" data-side="south" onclick="setBuilderSide('south')">South &uarr;</button>
            <button class="side-btn" data-side="west" onclick="setBuilderSide('west')">West &rarr;</button>
            <button class="side-btn" data-side="east" onclick="setBuilderSide('east')">East &larr;</button>
          </div>
          <div class="flex gap-2">
            <select id="builderPattern" class="input-dark flex-1">
              <option value="single-gap-wall">Single Gap Wall</option>
              <option value="double-gap-wall">Double Gap Wall (2 Openings)</option>
              <option value="sweeping-half-wall">Sweeping Half Wall</option>
              <option value="staggered-blocks">Staggered Blocks (3 Openings)</option>
              <option value="orb-cluster">Orb Cluster</option>
              <option value="diagonal-spinner">Diagonal Spinner</option>
            </select>
            <button onclick="addWaveFromBuilder()" class="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-black rounded-lg text-xs uppercase tracking-wider shrink-0 transition">
              + Add Wave
            </button>
          </div>
        </div>

        <!-- Wave Queue -->
        <div class="cyber-panel rounded-xl p-4 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold uppercase tracking-wider text-cyan-300">Wave Schedule (Order &amp; Delay)</span>
            <span id="waveCountLabel" class="text-[11px] font-mono text-slate-400">0 waves</span>
          </div>
          <div id="waveList" class="space-y-1.5 max-h-48 overflow-y-auto pr-1"></div>
        </div>

        <!-- Selected Wave Config & Attached Gates -->
        <div class="cyber-panel rounded-xl p-4 space-y-3">
          <div class="flex items-center justify-between">
            <div class="text-xs font-bold uppercase tracking-wider text-rose-300" id="waveInspectorTitle">Wave Inspector</div>
            <div class="flex gap-1.5" id="waveInspectorActions"></div>
          </div>
          <div id="waveInspectorBody" class="text-xs text-slate-400">
            Select a wave above (or click it on the map) to configure its side, obstacle type, speed, gap, delay, and attached gates.
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const ADMIN_TOKEN = ${safeToken};
    const ARENA_W = 450;
    const ARENA_H = 800;
    const HALF_W = ARENA_W / 2;
    const HALF_H = ARENA_H / 2;
    const SPAWN_OFFSET = 18;
    const PLAYER_RADIUS = 13;
    const HITBOX_RADIUS = 6.5;

    let levels = [];
    let currentLevelIdx = 0;
    let selectedWaveIdx = 0;
    let builderSide = 'north';

    let simTime = 0;
    let isPlaying = false;
    let lastRafMs = null;
    let dragSpawn = false;
    let dragDummy = false;
    let dummyPos = { x: 0, y: 120 };
    let ripples = [];
    let popups = [];
    let hoverOpening = null; // { waveIdx, start, end }

    const canvas = document.getElementById('editorCanvas');
    const ctx = canvas.getContext('2d');

    function showBanner(msg, isError) {
      const el = document.getElementById('statusBanner');
      el.textContent = msg;
      el.className = 'rounded-lg px-4 py-2 text-xs font-semibold border ' +
        (isError ? 'bg-rose-950/80 border-rose-500/50 text-rose-200' : 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200');
      el.classList.remove('hidden');
      setTimeout(() => el.classList.add('hidden'), 4000);
    }

    function curLevel() {
      return levels[currentLevelIdx] || null;
    }

    function setBuilderSide(side) {
      builderSide = side;
      document.querySelectorAll('#sideSelector .side-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.side === side);
      });
    }

    function getOrderedWaves(lvl) {
      return (lvl.waves || []).slice().sort((a, b) => a.order - b.order);
    }

    function computeWaveSchedule(lvl) {
      const waves = getOrderedWaves(lvl);
      let acc = 0;
      let maxEnd = 2;
      const items = waves.map((w) => {
        acc += Math.max(0, Number(w.delayAfterPrev || 0));
        const isVert = w.side === 'north' || w.side === 'south';
        const halfBound = isVert ? HALF_H : HALF_W;
        const travelDist = (halfBound + SPAWN_OFFSET) * 2 + 40;
        const dur = travelDist / Math.max(40, Number(w.speed || 175));
        maxEnd = Math.max(maxEnd, acc + dur);
        return { wave: w, spawnAt: acc, duration: dur };
      });
      return { items, totalDuration: Math.ceil(maxEnd * 10) / 10 };
    }

    function computeWaveGeometry(w, tSinceSpawn) {
      const isVert = w.side === 'north' || w.side === 'south';
      const latHalf = isVert ? HALF_W : HALF_H;
      const halfBound = isVert ? HALF_H : HALF_W;
      const spawnDist = halfBound + SPAWN_OFFSET;
      const travelSign = (w.side === 'north' || w.side === 'west') ? 1 : -1;
      const startCoord = -travelSign * spawnDist;
      const speed = Math.max(40, Number(w.speed || 175));
      const coord = startCoord + travelSign * speed * tSinceSpawn;

      const gapSize = Math.max(60, Number(w.gapSize || 120));
      const gapCenter = Number(w.gapCenter || 0);
      const thickness = Number(w.barThickness || 18);

      const dirColors = { north: '#ff2a6d', south: '#ff7700', east: '#d300c5', west: '#05d5fa' };
      const color = w.color || dirColors[w.side] || '#ff2a6d';

      let gaps = [];
      let rects = []; // { x, y, w, h, rot }
      let circles = []; // { x, y, r }

      if (w.patternType === 'single-gap-wall') {
        gaps = [{ start: Math.max(-latHalf, gapCenter - gapSize / 2), end: Math.min(latHalf, gapCenter + gapSize / 2) }];
      } else if (w.patternType === 'double-gap-wall') {
        const island = 56;
        const sideGap = Math.max(76, gapSize * 0.95);
        const secondCenter = gapCenter <= 0 ? gapCenter + sideGap + island : gapCenter - (sideGap + island);
        gaps = [
          { start: gapCenter - sideGap / 2, end: gapCenter + sideGap / 2 },
          { start: secondCenter - sideGap / 2, end: secondCenter + sideGap / 2 },
        ];
      } else if (w.patternType === 'sweeping-half-wall') {
        const openPos = gapCenter >= 0;
        gaps = [{ start: openPos ? gapCenter - gapSize / 2 : -latHalf, end: openPos ? latHalf : gapCenter + gapSize / 2 }];
      } else if (w.patternType === 'staggered-blocks') {
        const cg = Math.max(84, gapSize);
        const outer = 54;
        gaps = [
          { start: -latHalf, end: -latHalf + outer },
          { start: gapCenter - cg / 2, end: gapCenter + cg / 2 },
          { start: latHalf - outer, end: latHalf },
        ];
      } else if (w.patternType === 'orb-cluster') {
        const orbR = 12;
        const count = isVert ? 4 : 5;
        const usable = latHalf - 28;
        const orbs = [];
        for (let i = 0; i < count; i++) {
          const lat = -usable + (i / (count - 1)) * (usable * 2);
          if (Math.abs(lat - gapCenter) < gapSize * 0.6 + orbR) continue;
          orbs.push(lat);
          circles.push({ x: isVert ? lat : coord, y: isVert ? coord : lat, r: orbR });
        }
        let cur = -latHalf;
        for (const lat of orbs.sort((a, b) => a - b)) {
          if (lat - orbR - cur >= 24) gaps.push({ start: Math.round(cur), end: Math.round(lat - orbR) });
          cur = lat + orbR;
        }
        if (latHalf - cur >= 24) gaps.push({ start: Math.round(cur), end: latHalf });
      } else if (w.patternType === 'diagonal-spinner') {
        const len = 152;
        const driftSign = gapCenter >= 0 ? -1 : 1;
        const drift = speed * 0.45 * driftSign;
        const latPos = gapCenter + drift * tSinceSpawn;
        rects.push({
          x: isVert ? latPos : coord,
          y: isVert ? coord : latPos,
          w: isVert ? len : 16,
          h: isVert ? 16 : len,
          rot: 0.4 + 2.0 * tSinceSpawn,
        });
        const br = len / 2 + 12;
        if (latPos - br > -latHalf + 24) gaps.push({ start: -latHalf, end: Math.round(latPos - br) });
        if (latPos + br < latHalf - 24) gaps.push({ start: Math.round(latPos + br), end: latHalf });
      }

      if (w.patternType !== 'orb-cluster' && w.patternType !== 'diagonal-spinner') {
        const sortedGaps = gaps.map((g) => [Math.max(-latHalf, g.start), Math.min(latHalf, g.end)]).sort((a, b) => a[0] - b[0]);
        let cursor = -latHalf;
        const cleanGaps = [];
        for (const [gs, ge] of sortedGaps) {
          if (gs > cursor + 2) {
            const segLen = gs - cursor;
            const segMid = (cursor + gs) / 2;
            rects.push({
              x: isVert ? segMid : coord,
              y: isVert ? coord : segMid,
              w: isVert ? segLen : thickness,
              h: isVert ? thickness : segLen,
              rot: 0,
            });
          }
          if (ge - gs >= 16) cleanGaps.push({ start: Math.round(gs), end: Math.round(ge) });
          cursor = Math.max(cursor, ge);
        }
        if (latHalf > cursor + 2) {
          const segLen = latHalf - cursor;
          const segMid = (cursor + latHalf) / 2;
          rects.push({
            x: isVert ? segMid : coord,
            y: isVert ? coord : segMid,
            w: isVert ? segLen : thickness,
            h: isVert ? thickness : segLen,
            rot: 0,
          });
        }
        gaps = cleanGaps;
      }

      return { isVert, coord, gaps, rects, circles, color };
    }

    function nextGateOrder(lvl) {
      let maxOrd = 0;
      for (const w of lvl.waves || []) {
        for (const g of w.attachedGates || []) {
          if (Number(g.order) > maxOrd) maxOrd = Number(g.order);
        }
      }
      return maxOrd + 1;
    }

    async function loadConfig() {
      try {
        const res = await fetch('/api/campaign-config');
        const data = await res.json();
        if (!Array.isArray(data.levels) || data.levels.length === 0) throw new Error('Invalid payload');
        levels = data.levels;
        currentLevelIdx = 0;
        selectedWaveIdx = 0;
        resetPlayback();
        renderAll();
      } catch (err) {
        showBanner('Failed to load campaign config: ' + err.message, true);
      }
    }

    async function saveCampaignConfig() {
      levels.forEach((lvl, idx) => {
        lvl.levelNumber = idx + 1;
        if (!lvl.id) lvl.id = 'level-' + (idx + 1);
      });
      try {
        const res = await fetch('/api/campaign-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-token': ADMIN_TOKEN },
          body: JSON.stringify({ levels }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Save failed');
        levels = data.levels;
        renderAll();
        showBanner('Saved ' + levels.length + ' campaign level(s) to campaign-config.json!', false);
      } catch (err) {
        showBanner('Error saving config: ' + err.message, true);
      }
    }

    async function resetCampaignConfig() {
      if (!confirm('Reset all campaign levels back to defaults?')) return;
      try {
        const res = await fetch('/api/campaign-config/reset', {
          method: 'POST',
          headers: { 'x-admin-token': ADMIN_TOKEN },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Reset failed');
        levels = data.levels;
        currentLevelIdx = 0;
        selectedWaveIdx = 0;
        resetPlayback();
        renderAll();
        showBanner('Campaign config reset to built-in defaults.', false);
      } catch (err) {
        showBanner('Error resetting config: ' + err.message, true);
      }
    }

    function addLevel() {
      const nextNum = levels.length + 1;
      levels.push({
        id: 'level-' + nextNum,
        levelNumber: nextNum,
        name: 'Level ' + nextNum + ' Sector',
        description: 'Custom wave sequence',
        spawn: { x: 0, y: 120 },
        clearBonusPoints: 500,
        parTimeSeconds: 20,
        waves: [
          {
            id: 'w-' + Date.now(),
            order: 1,
            delayAfterPrev: 0.5,
            side: 'north',
            patternType: 'single-gap-wall',
            speed: 175,
            gapCenter: 0,
            gapSize: 125,
            barThickness: 18,
            attachedGates: [{ id: 'g-' + Date.now(), order: 1, start: -62, end: 62, points: 200, label: 'GATE 1' }],
          },
        ],
        obstacles: [],
        checkpoints: [],
      });
      currentLevelIdx = levels.length - 1;
      selectedWaveIdx = 0;
      resetPlayback();
      renderAll();
    }

    function deleteCurrentLevel() {
      if (levels.length <= 1) return showBanner('At least 1 level must remain.', true);
      if (!confirm('Delete ' + curLevel().name + '?')) return;
      levels.splice(currentLevelIdx, 1);
      levels.forEach((l, i) => { l.levelNumber = i + 1; });
      currentLevelIdx = Math.max(0, currentLevelIdx - 1);
      selectedWaveIdx = 0;
      resetPlayback();
      renderAll();
    }

    function updateLevelMeta(field, val) {
      const lvl = curLevel();
      if (!lvl) return;
      lvl[field] = val;
      if (field === 'name') renderTabs();
    }

    function addWaveFromBuilder() {
      const lvl = curLevel();
      if (!lvl) return;
      if (!lvl.waves) lvl.waves = [];
      const pattern = document.getElementById('builderPattern').value;
      const maxOrd = lvl.waves.length ? Math.max(...lvl.waves.map((w) => Number(w.order || 1))) : 0;
      const newWave = {
        id: 'wave-' + Date.now(),
        order: maxOrd + 1,
        delayAfterPrev: lvl.waves.length === 0 ? 0.5 : 1.8,
        side: builderSide,
        patternType: pattern,
        speed: 175,
        gapCenter: 0,
        gapSize: 125,
        barThickness: 18,
        attachedGates: [],
      };
      lvl.waves.push(newWave);
      selectedWaveIdx = lvl.waves.length - 1;
      renderAll();
      jumpToWave(newWave.id);
    }

    function jumpToWave(waveId) {
      const lvl = curLevel();
      if (!lvl) return;
      const { items } = computeWaveSchedule(lvl);
      const item = items.find((it) => it.wave.id === waveId);
      if (!item) return;
      const w = item.wave;
      const isVert = w.side === 'north' || w.side === 'south';
      const halfBound = isVert ? HALF_H : HALF_W;
      const centerOffset = (halfBound + SPAWN_OFFSET) / Math.max(40, Number(w.speed || 175));
      isPlaying = false;
      lastRafMs = null;
      document.getElementById('btnPlayPause').innerHTML = '&#9654; Play';
      simTime = item.spawnAt + centerOffset;
      updateScrubberUI();
      drawCanvas();
    }

    function togglePlay() {
      isPlaying = !isPlaying;
      lastRafMs = null;
      document.getElementById('btnPlayPause').innerHTML = isPlaying ? '&#9208; Pause' : '&#9654; Play';
      if (isPlaying) requestAnimationFrame(animLoop);
    }

    function resetPlayback() {
      isPlaying = false;
      simTime = 0;
      lastRafMs = null;
      const lvl = curLevel();
      if (lvl && lvl.spawn) {
        dummyPos = { x: lvl.spawn.x, y: lvl.spawn.y };
      }
      document.getElementById('btnPlayPause').innerHTML = '&#9654; Play';
      updateScrubberUI();
      drawCanvas();
    }

    function scrubTime(val) {
      simTime = val;
      updateScrubberUI();
      drawCanvas();
    }

    function updateScrubberUI() {
      const lvl = curLevel();
      if (!lvl) return;
      const { totalDuration } = computeWaveSchedule(lvl);
      const scrub = document.getElementById('timeScrubber');
      scrub.max = Math.max(2, totalDuration);
      scrub.value = Math.min(simTime, Number(scrub.max));
      document.getElementById('timeLabel').textContent = simTime.toFixed(2) + 's / ' + totalDuration.toFixed(2) + 's';
    }

    function animLoop(nowMs) {
      if (!isPlaying) return;
      if (lastRafMs !== null) {
        const dt = Math.min(0.05, (nowMs - lastRafMs) / 1000);
        simTime += dt;
        const lvl = curLevel();
        if (lvl) {
          const { totalDuration } = computeWaveSchedule(lvl);
          if (simTime > totalDuration) simTime = 0;
        }
        ripples = ripples.filter((r) => {
          r.radius += (r.maxRadius - r.radius) * Math.min(1, dt * 14);
          r.alpha -= dt * 2.7;
          return r.alpha > 0.02;
        });
        popups = popups.filter((p) => {
          p.y -= dt * 54;
          p.alpha -= dt * 1.35;
          return p.alpha > 0.02;
        });
      }
      lastRafMs = nowMs;
      updateScrubberUI();
      drawCanvas();
      requestAnimationFrame(animLoop);
    }

    function renderAll() {
      renderTabs();
      renderMeta();
      renderWaveList();
      renderWaveInspector();
      updateScrubberUI();
      drawCanvas();
    }

    function renderTabs() {
      const c = document.getElementById('levelTabs');
      c.innerHTML = '';
      levels.forEach((lvl, idx) => {
        const b = document.createElement('button');
        b.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition border ' +
          (idx === currentLevelIdx ? 'bg-cyan-500 text-black border-cyan-400' : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-cyan-500/50');
        b.textContent = 'L' + (idx + 1) + ': ' + lvl.name;
        b.onclick = () => { currentLevelIdx = idx; selectedWaveIdx = 0; resetPlayback(); renderAll(); };
        c.appendChild(b);
      });
    }

    function renderMeta() {
      const lvl = curLevel();
      if (!lvl) return;
      document.getElementById('metaName').value = lvl.name || '';
      document.getElementById('metaDesc').value = lvl.description || '';
      document.getElementById('metaClearBonus').value = lvl.clearBonusPoints ?? 500;
      document.getElementById('metaParTime').value = lvl.parTimeSeconds ?? 20;
    }

    function renderWaveList() {
      const lvl = curLevel();
      if (!lvl) return;
      const listEl = document.getElementById('waveList');
      listEl.innerHTML = '';
      const ordered = getOrderedWaves(lvl);
      document.getElementById('waveCountLabel').textContent = ordered.length + ' wave(s)';

      let acc = 0;
      ordered.forEach((w) => {
        acc += Number(w.delayAfterPrev || 0);
        const origIdx = lvl.waves.indexOf(w);
        const isSel = origIdx === selectedWaveIdx;
        const row = document.createElement('div');
        row.className = 'flex items-center justify-between px-2.5 py-2 rounded-lg text-xs cursor-pointer border ' +
          (isSel ? 'bg-cyan-950/60 border-cyan-400 text-cyan-100' : 'bg-slate-900/80 border-slate-800 hover:border-slate-600');
        const gateCount = (w.attachedGates || []).length;
        row.innerHTML =
          '<div class="flex items-center gap-2">' +
            '<span class="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-cyan-300 font-bold">#' + w.order + '</span>' +
            '<span class="uppercase font-bold text-rose-300">' + w.side + '</span>' +
            '<span class="text-slate-300">' + w.patternType + '</span>' +
          '</div>' +
          '<div class="flex items-center gap-2 font-mono text-[11px]">' +
            '<span class="text-slate-400">@' + acc.toFixed(1) + 's</span>' +
            '<span class="px-1.5 py-0.5 rounded ' + (gateCount ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-500') + '">' + gateCount + ' gate</span>' +
          '</div>';
        row.onclick = () => {
          selectedWaveIdx = origIdx;
          renderWaveList();
          renderWaveInspector();
          jumpToWave(w.id);
        };
        listEl.appendChild(row);
      });
    }

    function renderWaveInspector() {
      const titleEl = document.getElementById('waveInspectorTitle');
      const actionsEl = document.getElementById('waveInspectorActions');
      const bodyEl = document.getElementById('waveInspectorBody');
      actionsEl.innerHTML = '';
      const lvl = curLevel();
      const w = lvl && lvl.waves ? lvl.waves[selectedWaveIdx] : null;
      if (!w) {
        titleEl.textContent = 'Wave Inspector';
        bodyEl.innerHTML = 'No wave selected.';
        return;
      }
      titleEl.textContent = 'Wave #' + w.order + ' (' + w.side.toUpperCase() + ')';

      const btnDup = makeActionBtn('Duplicate', () => {
        const clone = JSON.parse(JSON.stringify(w));
        clone.id = 'wave-' + Date.now();
        clone.order = (lvl.waves.length ? Math.max(...lvl.waves.map((x) => x.order)) : 0) + 1;
        clone.attachedGates = [];
        lvl.waves.push(clone);
        selectedWaveIdx = lvl.waves.length - 1;
        renderAll();
        jumpToWave(clone.id);
      });
      const btnDel = makeActionBtn('Delete', () => {
        lvl.waves.splice(selectedWaveIdx, 1);
        selectedWaveIdx = Math.max(0, selectedWaveIdx - 1);
        renderAll();
      }, true);
      actionsEl.append(btnDup, btnDel);

      bodyEl.innerHTML = '';
      const grid = document.createElement('div');
      grid.className = 'grid grid-cols-2 gap-2';

      const sideDiv = document.createElement('div');
      sideDiv.innerHTML = '<label class="block text-[11px] text-slate-400 mb-1">Side</label>';
      const sSel = document.createElement('select');
      sSel.className = 'input-dark';
      ['north', 'south', 'west', 'east'].forEach((s) => {
        const o = document.createElement('option'); o.value = s; o.textContent = s; o.selected = w.side === s;
        sSel.appendChild(o);
      });
      sSel.onchange = () => { w.side = sSel.value; renderWaveList(); drawCanvas(); };
      sideDiv.appendChild(sSel);

      const patDiv = document.createElement('div');
      patDiv.innerHTML = '<label class="block text-[11px] text-slate-400 mb-1">Obstacle Pattern</label>';
      const pSel = document.createElement('select');
      pSel.className = 'input-dark';
      ['single-gap-wall', 'double-gap-wall', 'sweeping-half-wall', 'staggered-blocks', 'orb-cluster', 'diagonal-spinner'].forEach((p) => {
        const o = document.createElement('option'); o.value = p; o.textContent = p; o.selected = w.patternType === p;
        pSel.appendChild(o);
      });
      pSel.onchange = () => { w.patternType = pSel.value; renderWaveList(); drawCanvas(); };
      patDiv.appendChild(pSel);

      grid.append(
        makeField('Wave Order (#)', 'number', w.order, (v) => { w.order = Math.max(1, Math.round(Number(v))); renderWaveList(); drawCanvas(); }),
        makeField('Delay After Prev (s)', 'number', w.delayAfterPrev, (v) => { w.delayAfterPrev = Math.max(0, Number(v)); renderWaveList(); updateScrubberUI(); drawCanvas(); }, '0.1'),
        sideDiv,
        patDiv,
        makeField('Speed (px/s)', 'number', w.speed, (v) => { w.speed = Math.max(40, Number(v)); updateScrubberUI(); drawCanvas(); }),
        makeField('Gap Center', 'number', w.gapCenter, (v) => { w.gapCenter = Number(v); drawCanvas(); }),
        makeField('Gap Size (px)', 'number', w.gapSize, (v) => { w.gapSize = Math.max(60, Number(v)); drawCanvas(); }),
        makeField('Color', 'color', w.color || '#ff2a6d', (v) => { w.color = v; drawCanvas(); })
      );
      bodyEl.appendChild(grid);

      // Attached gates list for this wave
      const gWrap = document.createElement('div');
      gWrap.className = 'mt-3 pt-3 border-t border-slate-800 space-y-2';
      gWrap.innerHTML = '<div class="flex items-center justify-between"><span class="text-[11px] font-bold uppercase tracking-wider text-emerald-300">Attached Checkpoint Gates</span><span class="text-[10px] text-slate-400">Click wave openings on the map to toggle</span></div>';

      if (!w.attachedGates || w.attachedGates.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'text-[11px] text-slate-500 italic';
        empty.textContent = 'No gates attached to this wave yet. Scrub/Play and click an opening on the map!';
        gWrap.appendChild(empty);
      } else {
        w.attachedGates.forEach((g, gi) => {
          const row = document.createElement('div');
          row.className = 'grid grid-cols-12 gap-1.5 items-center bg-[#060913] p-1.5 rounded border border-emerald-500/30';

          const ordInp = document.createElement('input');
          ordInp.type = 'number'; ordInp.className = 'input-dark col-span-2 text-center'; ordInp.value = g.order;
          ordInp.title = 'Gate Number';
          ordInp.oninput = () => { g.order = Math.max(1, Math.round(Number(ordInp.value))); drawCanvas(); };

          const lblInp = document.createElement('input');
          lblInp.type = 'text'; lblInp.className = 'input-dark col-span-4'; lblInp.value = g.label || '';
          lblInp.placeholder = 'Label';
          lblInp.oninput = () => { g.label = lblInp.value; };

          const ptsInp = document.createElement('input');
          ptsInp.type = 'number'; ptsInp.className = 'input-dark col-span-3'; ptsInp.value = g.points;
          ptsInp.title = 'Points';
          ptsInp.oninput = () => { g.points = Number(ptsInp.value); };

          const spanTxt = document.createElement('span');
          spanTxt.className = 'col-span-2 text-[10px] font-mono text-slate-400 text-center';
          spanTxt.textContent = g.start + '..' + g.end;

          const delBtn = document.createElement('button');
          delBtn.className = 'col-span-1 text-rose-400 hover:text-rose-200 font-bold text-xs';
          delBtn.textContent = '×';
          delBtn.onclick = () => { w.attachedGates.splice(gi, 1); renderWaveList(); renderWaveInspector(); drawCanvas(); };

          row.append(ordInp, lblInp, ptsInp, spanTxt, delBtn);
          gWrap.appendChild(row);
        });
      }
      bodyEl.appendChild(gWrap);
    }

    function makeActionBtn(label, onClick, isDanger) {
      const b = document.createElement('button');
      b.textContent = label;
      b.className = 'text-[11px] px-2 py-0.5 rounded font-bold border ' +
        (isDanger ? 'bg-rose-900/50 border-rose-500/40 text-rose-200 hover:bg-rose-800/60' : 'bg-slate-800 border-slate-600 text-slate-200 hover:border-cyan-400');
      b.onclick = onClick;
      return b;
    }

    function makeField(label, type, value, onChange, step) {
      const wrap = document.createElement('div');
      const lbl = document.createElement('label');
      lbl.className = 'block text-[11px] text-slate-400 mb-1';
      lbl.textContent = label;
      const inp = document.createElement('input');
      inp.type = type; inp.className = 'input-dark';
      if (step) inp.step = step;
      inp.value = value;
      inp.oninput = () => onChange(inp.value);
      wrap.append(lbl, inp);
      return wrap;
    }

    function drawCanvas() {
      ctx.clearRect(0, 0, ARENA_W, ARENA_H);
      ctx.fillStyle = '#070b14';
      ctx.fillRect(0, 0, ARENA_W, ARENA_H);

      ctx.save();
      ctx.translate(HALF_W, HALF_H);

      // Arena boundary walls (endgates)
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(-HALF_W + 1, -HALF_H + 1, ARENA_W - 2, ARENA_H - 2);

      // Center grid
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
      ctx.lineWidth = 1;
      for (let x = -200; x <= 200; x += 50) { ctx.beginPath(); ctx.moveTo(x, -HALF_H); ctx.lineTo(x, HALF_H); ctx.stroke(); }
      for (let y = -350; y <= 350; y += 50) { ctx.beginPath(); ctx.moveTo(-HALF_W, y); ctx.lineTo(HALF_W, y); ctx.stroke(); }

      const lvl = curLevel();
      if (!lvl) { ctx.restore(); return; }

      const { items } = computeWaveSchedule(lvl);
      const selWave = lvl.waves && lvl.waves[selectedWaveIdx];
      for (const item of items) {
        const tSince = simTime - item.spawnAt;
        if (tSince < 0 || tSince > item.duration) continue;
        const w = item.wave;
        const isSelWave = selWave && w.id === selWave.id;
        const geom = computeWaveGeometry(w, tSince);

        // Draw wave obstacles
        ctx.save();
        ctx.globalAlpha = selWave ? (isSelWave ? 1.0 : 0.42) : 1.0;
        ctx.fillStyle = geom.color;
        ctx.shadowColor = isSelWave ? '#ffffff' : geom.color;
        ctx.shadowBlur = isSelWave ? 18 : 8;
        for (const r of geom.rects) {
          ctx.save();
          ctx.translate(r.x, r.y);
          if (r.rot) ctx.rotate(r.rot);
          ctx.fillRect(-r.w / 2, -r.h / 2, r.w, r.h);
          if (isSelWave) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            ctx.strokeRect(-r.w / 2 - 1, -r.h / 2 - 1, r.w + 2, r.h + 2);
          }
          ctx.restore();
        }
        for (const c of geom.circles) {
          ctx.beginPath();
          ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
          ctx.fill();
          if (isSelWave) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            ctx.stroke();
          }
        }
        if (isSelWave) {
          const anchor = geom.rects[0] || geom.circles[0];
          if (anchor) {
            ctx.shadowBlur = 0;
            const lx = Math.max(-HALF_W + 42, Math.min(HALF_W - 42, anchor.x));
            const ly = anchor.y - 22;
            ctx.fillStyle = '#0f172a';
            ctx.strokeStyle = '#22d3ee';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(lx - 34, ly - 10, 68, 18, 4);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('WAVE #' + w.order, lx, ly - 1);
          }
        }
        ctx.restore();

        // Draw clickable opening hints + attached numbered gates
        for (const op of geom.gaps) {
          const attached = (w.attachedGates || []).find((g) => Math.abs(g.start - op.start) <= 14 && Math.abs(g.end - op.end) <= 14);
          const isHov = hoverOpening && hoverOpening.waveId === w.id && hoverOpening.start === op.start && hoverOpening.end === op.end;

          const x1 = geom.isVert ? op.start : geom.coord;
          const y1 = geom.isVert ? geom.coord : op.start;
          const x2 = geom.isVert ? op.end : geom.coord;
          const y2 = geom.isVert ? geom.coord : op.end;
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;

          ctx.save();
          if (attached) {
            ctx.strokeStyle = isHov ? '#ffffff' : '#34d399';
            ctx.shadowColor = '#10b981';
            ctx.shadowBlur = 14;
            ctx.lineWidth = 4.5;
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();

            ctx.shadowBlur = 0;
            ctx.beginPath(); ctx.arc(midX, midY, 12, 0, Math.PI * 2);
            ctx.fillStyle = '#065f46'; ctx.fill();
            ctx.lineWidth = 2; ctx.strokeStyle = '#34d399'; ctx.stroke();
            ctx.fillStyle = '#ffffff'; ctx.font = 'bold 11px monospace';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(String(attached.order), midX, midY);
          } else {
            ctx.strokeStyle = isHov ? '#6ee7b7' : 'rgba(52, 211, 153, 0.32)';
            ctx.lineWidth = isHov ? 4 : 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            if (isHov) {
              ctx.setLineDash([]);
              ctx.fillStyle = '#a7f3d0';
              ctx.font = 'bold 10px monospace';
              ctx.textAlign = 'center';
              ctx.fillText('+ GATE', midX, midY - 10);
            }
          }
          ctx.restore();
        }
      }

      // Player Spawn (dashed ring)
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(lvl.spawn.x, lvl.spawn.y, PLAYER_RADIUS + 3, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(207, 250, 254, 0.75)';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SPAWN', lvl.spawn.x, lvl.spawn.y + 24);
      ctx.restore();

      // Dummy Test Ball collision check against active waves (never stops timeline)
      let dummyHit = false;
      for (const item of items) {
        const tSince = simTime - item.spawnAt;
        if (tSince < 0 || tSince > item.duration) continue;
        const geom = computeWaveGeometry(item.wave, tSince);
        for (const r of geom.rects) {
          const hw = r.w / 2;
          const hh = r.h / 2;
          let px = dummyPos.x - r.x;
          let py = dummyPos.y - r.y;
          if (r.rot) {
            const cos = Math.cos(-r.rot);
            const sin = Math.sin(-r.rot);
            const rx = px * cos - py * sin;
            const ry = px * sin + py * cos;
            px = rx;
            py = ry;
          }
          const cx = Math.max(-hw, Math.min(px, hw));
          const cy = Math.max(-hh, Math.min(py, hh));
          const dx = px - cx;
          const dy = py - cy;
          if (dx * dx + dy * dy < HITBOX_RADIUS * HITBOX_RADIUS) {
            dummyHit = true;
            break;
          }
        }
        if (!dummyHit) {
          for (const c of geom.circles) {
            if (Math.hypot(dummyPos.x - c.x, dummyPos.y - c.y) < HITBOX_RADIUS + c.r) {
              dummyHit = true;
              break;
            }
          }
        }
        if (dummyHit) break;
      }

      // Draw Dummy Test Ball (turns red on hit, cyan when clear)
      ctx.save();
      ctx.translate(dummyPos.x, dummyPos.y);
      ctx.shadowColor = dummyHit ? '#ef4444' : '#22d3ee';
      ctx.shadowBlur = dummyHit ? 20 : 12;
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = dummyHit ? '#ef4444' : '#22d3ee';
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_RADIUS * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = dummyHit ? '#fee2e2' : '#ffffff';
      ctx.fill();
      ctx.fillStyle = dummyHit ? '#fca5a5' : '#cffafe';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(dummyHit ? 'HIT!' : 'DUMMY', 0, -PLAYER_RADIUS - 8);
      ctx.restore();

      // Teleport ripples & popups
      for (const r of ripples) {
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 240, 255, ' + r.alpha + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      for (const p of popups) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.fillStyle = p.color;
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(p.text, p.x, p.y);
        ctx.restore();
      }

      ctx.restore();
    }

    function getCanvasCoords(evt) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (evt.clientX - rect.left) * (ARENA_W / rect.width) - HALF_W,
        y: (evt.clientY - rect.top) * (ARENA_H / rect.height) - HALF_H,
      };
    }

    function findHoveredWaveOpening(x, y) {
      const lvl = curLevel();
      if (!lvl) return null;
      const { items } = computeWaveSchedule(lvl);
      for (const item of items) {
        const tSince = simTime - item.spawnAt;
        if (tSince < 0 || tSince > item.duration) continue;
        const w = item.wave;
        const geom = computeWaveGeometry(w, tSince);
        const coordDiff = Math.abs((geom.isVert ? y : x) - geom.coord);
        if (coordDiff <= 18) {
          const perp = geom.isVert ? x : y;
          const op = geom.gaps.find((g) => perp >= g.start && perp <= g.end);
          if (op) {
            return { waveId: w.id, start: op.start, end: op.end };
          }
        }
      }
      return null;
    }

    canvas.addEventListener('pointerdown', (e) => {
      const lvl = curLevel();
      if (!lvl) return;
      const { x, y } = getCanvasCoords(e);

      if (Math.hypot(x - dummyPos.x, y - dummyPos.y) <= 18) {
        dragDummy = true;
        return;
      }

      if (Math.hypot(x - lvl.spawn.x, y - lvl.spawn.y) <= 18) {
        dragSpawn = true;
        return;
      }

      const hit = findHoveredWaveOpening(x, y);
      if (hit) {
        const wIdx = lvl.waves.findIndex((w) => w.id === hit.waveId);
        if (wIdx >= 0) {
          const w = lvl.waves[wIdx];
          if (!w.attachedGates) w.attachedGates = [];
          const existingIdx = w.attachedGates.findIndex(
            (g) => Math.abs(g.start - hit.start) <= 14 && Math.abs(g.end - hit.end) <= 14
          );
          if (existingIdx >= 0) {
            w.attachedGates.splice(existingIdx, 1);
          } else {
            const ord = nextGateOrder(lvl);
            w.attachedGates.push({
              id: 'gate-' + Date.now(),
              order: ord,
              start: hit.start,
              end: hit.end,
              points: 200,
              label: 'GATE ' + ord,
            });
          }
          selectedWaveIdx = wIdx;
          renderWaveList();
          renderWaveInspector();
          drawCanvas();
        }
        return;
      }

      // Click anywhere else on the map to teleport the dummy ball (same as real game)
      const cx = Math.max(-HALF_W + PLAYER_RADIUS, Math.min(HALF_W - PLAYER_RADIUS, x));
      const cy = Math.max(-HALF_H + PLAYER_RADIUS, Math.min(HALF_H - PLAYER_RADIUS, y));
      const dist = Math.hypot(cx - dummyPos.x, cy - dummyPos.y);
      dummyPos.x = cx;
      dummyPos.y = cy;
      dragDummy = true;
      if (dist > 38) {
        ripples.push({ x: cx, y: cy, radius: 8, maxRadius: 34, alpha: 0.9 });
        popups.push({ x: cx, y: cy - 22, text: 'TELEPORT', color: '#00f0ff', alpha: 0.9 });
      }
      drawCanvas();
    });

    canvas.addEventListener('pointermove', (e) => {
      const { x, y } = getCanvasCoords(e);
      document.getElementById('cursorCoords').textContent = 'X: ' + Math.round(x) + ', Y: ' + Math.round(y);
      const lvl = curLevel();
      if (!lvl) return;

      if (dragDummy) {
        dummyPos.x = Math.max(-HALF_W + PLAYER_RADIUS, Math.min(HALF_W - PLAYER_RADIUS, x));
        dummyPos.y = Math.max(-HALF_H + PLAYER_RADIUS, Math.min(HALF_H - PLAYER_RADIUS, y));
        drawCanvas();
        return;
      }

      if (dragSpawn) {
        lvl.spawn.x = Math.max(-HALF_W + 15, Math.min(HALF_W - 15, Math.round(x / 10) * 10));
        lvl.spawn.y = Math.max(-HALF_H + 15, Math.min(HALF_H - 15, Math.round(y / 10) * 10));
        drawCanvas();
        return;
      }

      hoverOpening = findHoveredWaveOpening(x, y);
      if (!isPlaying) drawCanvas();
    });

    window.addEventListener('pointerup', () => { dragSpawn = false; dragDummy = false; });

    loadConfig();
  </script>
</body>
</html>`;
}
