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
        <div class="flex items-center bg-slate-900/90 p-1 rounded-lg border border-slate-700">
          <button id="viewTabLevels" onclick="setViewMode('levels')" class="px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider transition bg-cyan-500 text-black">
            Level Designer
          </button>
          <button id="viewTabPatterns" onclick="setViewMode('patterns')" class="px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider transition text-slate-300 hover:text-white">
            Pattern Library
          </button>
        </div>
        <a href="/db-admin" class="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 font-bold rounded-lg text-xs uppercase tracking-wider border border-gray-700 transition">
          &larr; DB &amp; Endless Admin
        </a>
        <button onclick="saveCampaignConfig()" class="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black rounded-lg text-xs uppercase tracking-wider shadow-lg shadow-cyan-500/20 transition">
          Save All Config
        </button>
      </div>
    </div>

    <!-- Status banner -->
    <div id="statusBanner" class="hidden rounded-lg px-4 py-2 text-xs font-semibold"></div>

    <!-- Story Grouping Panel -->
    <div id="storyGroupingPanel" class="cyber-panel rounded-xl p-4 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="text-xs font-bold uppercase tracking-wider text-cyan-300">Story Grouping</span>
          <span id="storySummaryLabel" class="text-[11px] font-mono text-slate-400">0 stories</span>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <input id="newStoryNameInput" type="text" placeholder="New story name..." class="input-dark !w-44" onkeydown="if(event.key==='Enter'){event.preventDefault();createStory();}" />
          <button onclick="createStory()" class="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/35 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-bold uppercase tracking-wider transition">
            + Create Story
          </button>
          <button onclick="saveCampaignConfig()" class="px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/35 text-cyan-200 border border-cyan-500/40 rounded-lg text-xs font-bold uppercase tracking-wider transition">
            Save Stories &amp; Levels
          </button>
        </div>
      </div>
      <div id="storyGroupsList" class="grid grid-cols-1 md:grid-cols-2 gap-3"></div>
    </div>

    <!-- Level / Pattern Tabs -->
    <div class="cyber-panel rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
      <div id="levelTabs" class="flex flex-wrap items-center gap-2"></div>
      <div id="levelTabActions" class="flex flex-wrap items-center gap-1.5">
        <button id="btnMoveLevelLeft" onclick="moveLevel(-1)" class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-35 disabled:pointer-events-none text-slate-200 border border-slate-600 rounded-lg text-xs font-bold transition" title="Move current level earlier">
          &larr;
        </button>
        <button id="btnMoveLevelRight" onclick="moveLevel(1)" class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-35 disabled:pointer-events-none text-slate-200 border border-slate-600 rounded-lg text-xs font-bold transition" title="Move current level later">
          &rarr;
        </button>
        <button onclick="addLevel()" class="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/35 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-bold uppercase tracking-wider transition">
          + Add Level
        </button>
        <button onclick="deleteCurrentLevel()" class="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/35 text-rose-300 border border-rose-500/40 rounded-lg text-xs font-bold uppercase tracking-wider transition">
          Delete Level
        </button>
      </div>
      <div id="patternTabActions" class="hidden flex items-center gap-2">
        <button onclick="addPattern()" class="px-3 py-1.5 bg-violet-600/20 hover:bg-violet-600/35 text-violet-300 border border-violet-500/40 rounded-lg text-xs font-bold uppercase tracking-wider transition">
          + New Pattern
        </button>
        <button onclick="deleteCurrentPattern()" class="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/35 text-rose-300 border border-rose-500/40 rounded-lg text-xs font-bold uppercase tracking-wider transition">
          Delete Pattern
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
        <div id="levelMetaPanel" class="cyber-panel rounded-xl p-4 space-y-3">
          <div class="flex items-center justify-between gap-2">
            <div class="text-xs font-bold uppercase tracking-wider text-cyan-300">Level Settings</div>
            <button onclick="saveCurrentLevel()" class="px-3 py-1 bg-cyan-500/20 hover:bg-cyan-500/35 text-cyan-200 border border-cyan-500/40 rounded-lg text-[11px] font-bold uppercase tracking-wider transition">
              Save This Level
            </button>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[11px] text-slate-400 mb-1">Level Name</label>
              <input id="metaName" type="text" class="input-dark" oninput="updateLevelMeta('name', this.value)" />
            </div>
            <div>
              <label class="block text-[11px] text-slate-400 mb-1">Story / Chapter (groups sectors)</label>
              <input id="metaStoryName" type="text" class="input-dark" placeholder="Story 1" oninput="updateLevelMeta('storyName', this.value)" />
            </div>
            <div class="col-span-2">
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

        <!-- Pattern Metadata (Pattern Library View) -->
        <div id="patternMetaPanel" class="hidden cyber-panel rounded-xl p-4 space-y-3">
          <div class="text-xs font-bold uppercase tracking-wider text-violet-300">Pattern Settings</div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[11px] text-slate-400 mb-1">Pattern Name</label>
              <input id="patMetaName" type="text" class="input-dark" oninput="updatePatternMeta('name', this.value)" />
            </div>
            <div>
              <label class="block text-[11px] text-slate-400 mb-1">Description</label>
              <input id="patMetaDesc" type="text" class="input-dark" oninput="updatePatternMeta('description', this.value)" />
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
          <div id="bundledPatternRow" class="pt-2 border-t border-slate-800/90 space-y-1.5">
            <div class="text-[11px] font-bold uppercase tracking-wider text-violet-300">Or Insert Bundled Pattern</div>
            <div class="flex gap-2">
              <select id="bundledPatternSelect" class="input-dark flex-1"></select>
              <button onclick="insertBundledPattern()" class="px-4 py-1.5 bg-violet-500 hover:bg-violet-400 text-black font-black rounded-lg text-xs uppercase tracking-wider shrink-0 transition">
                + Add Pattern
              </button>
              <button id="btnDeleteBundledPattern" onclick="deleteSelectedBundledPattern()" class="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/35 disabled:opacity-40 disabled:pointer-events-none text-rose-300 border border-rose-500/40 rounded-lg text-xs font-bold uppercase tracking-wider shrink-0 transition" title="Delete selected pattern from library">
                Delete
              </button>
            </div>
          </div>
        </div>

        <!-- Wave Queue -->
        <div class="cyber-panel rounded-xl p-4 space-y-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-xs font-bold uppercase tracking-wider text-cyan-300">Wave Schedule (Order &amp; Delay)</span>
            <div class="flex items-center gap-2">
              <button onclick="saveSelectedOrAllAsPattern()" class="px-2.5 py-1 bg-violet-600/25 hover:bg-violet-600/40 text-violet-200 border border-violet-500/40 rounded text-[11px] font-bold uppercase tracking-wider transition" title="Save checked waves (or all waves if none checked) as a reusable pattern">
                Save as Pattern
              </button>
              <span id="waveCountLabel" class="text-[11px] font-mono text-slate-400">0 waves</span>
            </div>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-2 bg-slate-900/60 border border-slate-800 rounded-lg px-2.5 py-1.5">
            <div class="flex items-center gap-1.5">
              <button id="btnSelectAllWaves" onclick="toggleSelectAllWaves()" class="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded text-[11px] font-bold transition">
                Select All
              </button>
              <span id="selectedWavesCountLabel" class="text-[11px] font-mono text-slate-400">0 selected</span>
            </div>
            <div class="flex items-center gap-1.5">
              <button id="btnDupSelected" onclick="duplicateSelectedWaves()" disabled class="px-2 py-0.5 bg-cyan-600/20 hover:bg-cyan-600/35 disabled:opacity-40 disabled:pointer-events-none text-cyan-200 border border-cyan-500/40 rounded text-[11px] font-bold transition">
                Duplicate
              </button>
              <button id="btnDelSelected" onclick="deleteSelectedWaves()" disabled class="px-2 py-0.5 bg-rose-600/20 hover:bg-rose-600/35 disabled:opacity-40 disabled:pointer-events-none text-rose-200 border border-rose-500/40 rounded text-[11px] font-bold transition">
                Delete
              </button>
            </div>
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
    let patterns = [];
    let emptyStories = [];
    let draggedStoryIdx = null;
    let draggedStoryLevelId = null;
    let currentLevelIdx = 0;
    let currentPatternIdx = 0;
    let viewMode = 'levels'; // 'levels' | 'patterns'
    let selectedWaveIdx = 0;
    let selectedWaveIds = new Set();
    let builderSide = 'north';

    let simTime = 0;
    let isPlaying = false;
    let lastRafMs = null;
    let dragSpawn = false;
    let dragDummy = false;
    let dummyPos = { x: 0, y: 120 };
    let ripples = [];
    let popups = [];
    let clearedPreviewGateIds = new Set();
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

    function curPattern() {
      return patterns[currentPatternIdx] || null;
    }

    function activeContainer() {
      return viewMode === 'levels' ? curLevel() : curPattern();
    }

    function setViewMode(mode) {
      viewMode = mode === 'patterns' ? 'patterns' : 'levels';
      selectedWaveIdx = 0;
      selectedWaveIds.clear();
      resetPlayback();
      renderAll();
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
        patterns = Array.isArray(data.patterns) ? data.patterns : [];
        currentLevelIdx = 0;
        currentPatternIdx = 0;
        selectedWaveIdx = 0;
        selectedWaveIds.clear();
        resetPlayback();
        renderAll();
      } catch (err) {
        showBanner('Failed to load campaign config: ' + err.message, true);
      }
    }

    async function saveCampaignConfig(silent) {
      levels.forEach((lvl, idx) => {
        lvl.levelNumber = idx + 1;
        if (!lvl.id) lvl.id = 'level-' + (idx + 1);
      });
      patterns.forEach((pat, idx) => {
        if (!pat.id) pat.id = 'pattern-' + (idx + 1);
      });
      try {
        const res = await fetch('/api/campaign-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-token': ADMIN_TOKEN },
          body: JSON.stringify({ levels, patterns }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Save failed');
        levels = data.levels;
        if (Array.isArray(data.patterns)) patterns = data.patterns;
        currentLevelIdx = Math.max(0, Math.min(currentLevelIdx, levels.length - 1));
        currentPatternIdx = Math.max(0, Math.min(currentPatternIdx, Math.max(0, patterns.length - 1)));
        renderAll();
        if (!silent) {
          showBanner('Saved ' + levels.length + ' level(s) and ' + patterns.length + ' pattern(s) to campaign-config.json!', false);
        }
      } catch (err) {
        showBanner('Error saving config: ' + err.message, true);
      }
    }

    async function saveCurrentLevel() {
      const lvl = curLevel();
      if (!lvl) return;
      try {
        const res = await fetch('/api/campaign-config/level', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-token': ADMIN_TOKEN },
          body: JSON.stringify({ level: lvl }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Save level failed');
        if (Array.isArray(data.levels)) {
          levels = data.levels;
          const idx = levels.findIndex((l) => l.id === data.level?.id);
          if (idx >= 0) currentLevelIdx = idx;
        }
        renderAll();
        showBanner('Saved "' + lvl.name + '" (Level ' + (currentLevelIdx + 1) + ') to campaign-config.json!', false);
      } catch (err) {
        showBanner('Error saving level: ' + err.message, true);
      }
    }

    function addLevel() {
      const nextNum = levels.length + 1;
      levels.push({
        id: 'level-' + Date.now(),
        levelNumber: nextNum,
        name: 'Level ' + nextNum + ' Sector',
        storyName: (curLevel() && curLevel().storyName) ? curLevel().storyName : 'Story 1',
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
      saveCampaignConfig(true);
      showBanner('Added Level ' + nextNum + ' and saved.', false);
    }

    function deleteCurrentLevel() {
      if (levels.length <= 1) return showBanner('At least 1 level must remain.', true);
      const name = curLevel().name;
      if (!confirm('Are you sure you want to delete "' + name + '"?')) return;
      levels.splice(currentLevelIdx, 1);
      levels.forEach((l, i) => { l.levelNumber = i + 1; });
      currentLevelIdx = Math.max(0, currentLevelIdx - 1);
      selectedWaveIdx = 0;
      resetPlayback();
      renderAll();
      saveCampaignConfig(true);
      showBanner('Deleted "' + name + '" and saved.', false);
    }

    function moveLevel(delta) {
      const targetIdx = currentLevelIdx + delta;
      if (targetIdx < 0 || targetIdx >= levels.length) return;
      const [moved] = levels.splice(currentLevelIdx, 1);
      levels.splice(targetIdx, 0, moved);
      levels.forEach((l, i) => { l.levelNumber = i + 1; });
      currentLevelIdx = targetIdx;
      renderAll();
      saveCampaignConfig(true);
    }

    let draggedLevelIdx = null;
    function reorderLevelByDrop(fromIdx, toIdx) {
      if (fromIdx === null || toIdx === null || fromIdx === toIdx) return;
      const activeId = curLevel() ? curLevel().id : null;
      const [moved] = levels.splice(fromIdx, 1);
      levels.splice(toIdx, 0, moved);
      levels.forEach((l, i) => { l.levelNumber = i + 1; });
      if (activeId) {
        const newIdx = levels.findIndex((l) => l.id === activeId);
        if (newIdx >= 0) currentLevelIdx = newIdx;
      }
      renderAll();
      saveCampaignConfig(true);
    }

    function updateLevelMeta(field, val) {
      const lvl = curLevel();
      if (!lvl) return;
      lvl[field] = val;
      if (field === 'name') {
        renderTabs();
        renderStoryGroups();
      } else if (field === 'storyName') {
        renderStoryGroups();
      }
    }

    function normalizeStoryName(name) {
      const s = String(name || '').trim().slice(0, 60);
      return s || 'Story 1';
    }

    function getStoryGroups() {
      const groups = [];
      levels.forEach((lvl, idx) => {
        const sName = normalizeStoryName(lvl.storyName);
        const last = groups[groups.length - 1];
        if (last && last.storyName === sName) {
          last.levels.push({ lvl, idx });
        } else {
          groups.push({ storyName: sName, levels: [{ lvl, idx }] });
        }
      });
      // Keep empty stories that do not yet have any levels
      emptyStories = emptyStories.filter((name) => !groups.some((g) => g.storyName === name));
      emptyStories.forEach((name) => {
        groups.push({ storyName: name, levels: [], isEmpty: true });
      });
      return groups;
    }

    function rebuildLevelsFromPopulatedGroups(popGroups, activeId) {
      levels = popGroups.reduce((acc, g) => acc.concat(g.levels.map((x) => x.lvl)), []);
      levels.forEach((l, i) => { l.levelNumber = i + 1; });
      if (activeId) {
        const newIdx = levels.findIndex((l) => l.id === activeId);
        if (newIdx >= 0) currentLevelIdx = newIdx;
      }
    }

    function createStory() {
      const inp = document.getElementById('newStoryNameInput');
      const raw = inp ? inp.value.trim() : '';
      const groups = getStoryGroups();
      const name = (raw || ('Story ' + (groups.length + 1))).slice(0, 60);
      if (groups.some((g) => g.storyName.toLowerCase() === name.toLowerCase())) {
        return showBanner('Story "' + name + '" already exists.', true);
      }
      emptyStories.push(name);
      if (inp) inp.value = '';
      renderStoryGroups();
      showBanner('Created story "' + name + '". Add levels or drag existing levels into it.', false);
    }

    function renameStory(groupIdx, newName) {
      const groups = getStoryGroups();
      const grp = groups[groupIdx];
      if (!grp) return;
      const trimmed = String(newName || '').trim().slice(0, 60);
      if (!trimmed || trimmed === grp.storyName) {
        renderStoryGroups();
        return;
      }
      if (grp.isEmpty) {
        const eIdx = emptyStories.indexOf(grp.storyName);
        if (eIdx >= 0) {
          if (groups.some((g, i) => i !== groupIdx && g.storyName.toLowerCase() === trimmed.toLowerCase())) {
            showBanner('Story "' + trimmed + '" already exists.', true);
            renderStoryGroups();
            return;
          }
          emptyStories[eIdx] = trimmed;
        }
        renderStoryGroups();
        return;
      }
      grp.levels.forEach((item) => { item.lvl.storyName = trimmed; });
      renderAll();
      saveCampaignConfig(true);
      showBanner('Renamed story to "' + trimmed + '" and saved.', false);
    }

    function moveStory(groupIdx, delta) {
      const groups = getStoryGroups();
      const grp = groups[groupIdx];
      if (!grp || grp.isEmpty) return;
      const popGroups = groups.filter((g) => !g.isEmpty);
      const popIdx = popGroups.indexOf(grp);
      const targetIdx = popIdx + delta;
      if (popIdx < 0 || targetIdx < 0 || targetIdx >= popGroups.length) return;
      const activeId = curLevel() ? curLevel().id : null;
      const [moved] = popGroups.splice(popIdx, 1);
      popGroups.splice(targetIdx, 0, moved);
      rebuildLevelsFromPopulatedGroups(popGroups, activeId);
      renderAll();
      saveCampaignConfig(true);
    }

    function reorderStoryByDrop(fromGroupIdx, toGroupIdx) {
      if (fromGroupIdx === null || toGroupIdx === null || fromGroupIdx === toGroupIdx) return;
      const groups = getStoryGroups();
      const fromGrp = groups[fromGroupIdx];
      const toGrp = groups[toGroupIdx];
      if (!fromGrp || !toGrp || fromGrp.isEmpty || toGrp.isEmpty) return;
      const popGroups = groups.filter((g) => !g.isEmpty);
      const fromPop = popGroups.indexOf(fromGrp);
      const toPop = popGroups.indexOf(toGrp);
      if (fromPop < 0 || toPop < 0 || fromPop === toPop) return;
      const activeId = curLevel() ? curLevel().id : null;
      const [moved] = popGroups.splice(fromPop, 1);
      popGroups.splice(toPop, 0, moved);
      rebuildLevelsFromPopulatedGroups(popGroups, activeId);
      renderAll();
      saveCampaignConfig(true);
    }

    function deleteStory(groupIdx) {
      const groups = getStoryGroups();
      const grp = groups[groupIdx];
      if (!grp) return;
      if (grp.isEmpty) {
        emptyStories = emptyStories.filter((n) => n !== grp.storyName);
        renderStoryGroups();
        showBanner('Removed empty story "' + grp.storyName + '".', false);
        return;
      }
      const otherPop = groups.find((g, i) => i !== groupIdx && !g.isEmpty);
      const otherAny = groups.find((g, i) => i !== groupIdx);
      const fallbackName = otherPop ? otherPop.storyName : (otherAny ? otherAny.storyName : (grp.storyName === 'Unassigned' ? '' : 'Unassigned'));
      if (!fallbackName) {
        return showBanner('Cannot delete the only remaining story while it has levels. Create another story first.', true);
      }
      if (!confirm('Delete story "' + grp.storyName + '"? Its ' + grp.levels.length + ' level(s) will be moved to "' + fallbackName + '".')) return;
      const activeId = curLevel() ? curLevel().id : null;
      grp.levels.forEach((item) => { item.lvl.storyName = fallbackName; });
      emptyStories = emptyStories.filter((n) => n !== fallbackName);
      // Regroup so any levels moved into an existing story become contiguous
      const movedSet = new Set(grp.levels.map((x) => x.lvl));
      const remaining = levels.filter((l) => !movedSet.has(l));
      const targetLastIdx = remaining.reduce((acc, l, i) => (normalizeStoryName(l.storyName) === fallbackName ? i : acc), -1);
      if (targetLastIdx >= 0) {
        remaining.splice(targetLastIdx + 1, 0, ...grp.levels.map((x) => x.lvl));
        levels = remaining;
      } else {
        levels = remaining.concat(grp.levels.map((x) => x.lvl));
      }
      levels.forEach((l, i) => { l.levelNumber = i + 1; });
      if (activeId) {
        const newIdx = levels.findIndex((l) => l.id === activeId);
        if (newIdx >= 0) currentLevelIdx = newIdx;
      }
      renderAll();
      saveCampaignConfig(true);
      showBanner('Deleted story "' + grp.storyName + '" and moved its levels to "' + fallbackName + '".', false);
    }

    function addLevelToStory(storyName) {
      const targetName = normalizeStoryName(storyName);
      const nextNum = levels.length + 1;
      const newLevel = {
        id: 'level-' + Date.now(),
        levelNumber: nextNum,
        name: 'Level ' + nextNum + ' Sector',
        storyName: targetName,
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
      };
      emptyStories = emptyStories.filter((n) => n !== targetName);
      const insertAfter = levels.reduce((acc, l, i) => (normalizeStoryName(l.storyName) === targetName ? i : acc), -1);
      const insertIdx = insertAfter >= 0 ? insertAfter + 1 : levels.length;
      levels.splice(insertIdx, 0, newLevel);
      levels.forEach((l, i) => { l.levelNumber = i + 1; });
      currentLevelIdx = insertIdx;
      selectedWaveIdx = 0;
      resetPlayback();
      renderAll();
      saveCampaignConfig(true);
      showBanner('Added "' + newLevel.name + '" to "' + targetName + '" and saved.', false);
    }

    function assignLevelToStory(levelId, targetStoryName) {
      const targetName = normalizeStoryName(targetStoryName);
      const srcIdx = levels.findIndex((l) => l.id === levelId);
      if (srcIdx < 0) return;
      const activeId = curLevel() ? curLevel().id : null;
      const [lvl] = levels.splice(srcIdx, 1);
      lvl.storyName = targetName;
      emptyStories = emptyStories.filter((n) => n !== targetName);
      const insertAfter = levels.reduce((acc, l, i) => (normalizeStoryName(l.storyName) === targetName ? i : acc), -1);
      const insertIdx = insertAfter >= 0 ? insertAfter + 1 : levels.length;
      levels.splice(insertIdx, 0, lvl);
      levels.forEach((l, i) => { l.levelNumber = i + 1; });
      if (activeId) {
        const newIdx = levels.findIndex((l) => l.id === activeId);
        if (newIdx >= 0) currentLevelIdx = newIdx;
      }
      renderAll();
      saveCampaignConfig(true);
      showBanner('Moved "' + lvl.name + '" into "' + targetName + '" and saved.', false);
    }

    function removeLevelFromStory(levelId) {
      const lvl = levels.find((l) => l.id === levelId);
      if (!lvl) return;
      const curStory = normalizeStoryName(lvl.storyName);
      if (curStory === 'Unassigned') {
        return showBanner('"' + lvl.name + '" is already in "Unassigned". Use Delete Level to remove it permanently.', true);
      }
      assignLevelToStory(levelId, 'Unassigned');
    }

    function renderStoryGroups() {
      const listEl = document.getElementById('storyGroupsList');
      const summaryEl = document.getElementById('storySummaryLabel');
      if (!listEl) return;
      const groups = getStoryGroups();
      const popGroups = groups.filter((g) => !g.isEmpty);
      if (summaryEl) {
        summaryEl.textContent = groups.length + ' stor' + (groups.length === 1 ? 'y' : 'ies') + ' • ' + levels.length + ' level' + (levels.length === 1 ? '' : 's');
      }
      listEl.innerHTML = '';

      groups.forEach((grp, gIdx) => {
        const popIdx = grp.isEmpty ? -1 : popGroups.indexOf(grp);
        const card = document.createElement('div');
        card.className = 'bg-[#060913] border border-slate-800 rounded-xl p-3 space-y-2.5 transition';
        card.draggable = !grp.isEmpty;

        card.ondragstart = (ev) => {
          if (draggedStoryLevelId || grp.isEmpty) return;
          draggedStoryIdx = gIdx;
          ev.dataTransfer.effectAllowed = 'move';
        };
        card.ondragover = (ev) => {
          ev.preventDefault();
          card.classList.add('border-cyan-400');
        };
        card.ondragleave = () => {
          card.classList.remove('border-cyan-400');
        };
        card.ondrop = (ev) => {
          ev.preventDefault();
          card.classList.remove('border-cyan-400');
          if (draggedStoryLevelId) {
            const lid = draggedStoryLevelId;
            draggedStoryLevelId = null;
            assignLevelToStory(lid, grp.storyName);
            return;
          }
          if (draggedStoryIdx !== null) {
            const fromIdx = draggedStoryIdx;
            draggedStoryIdx = null;
            reorderStoryByDrop(fromIdx, gIdx);
          }
        };

        // Header row
        const header = document.createElement('div');
        header.className = 'flex items-center justify-between gap-2';

        const left = document.createElement('div');
        left.className = 'flex items-center gap-1.5 min-w-0 flex-1';

        const handle = document.createElement('span');
        handle.className = 'text-slate-500 select-none text-xs ' + (grp.isEmpty ? 'opacity-30' : 'cursor-grab');
        handle.innerHTML = '&#8942;&#8942;';
        handle.title = grp.isEmpty ? 'Add a level to reorder this story' : 'Drag to reorder story';

        const badge = document.createElement('span');
        badge.className = 'px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-mono text-[10px] font-bold shrink-0';
        badge.textContent = '#' + (gIdx + 1);

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = grp.storyName;
        nameInput.className = 'input-dark !py-1 !text-xs font-bold flex-1 min-w-0';
        nameInput.title = 'Rename story';
        nameInput.onchange = () => renameStory(gIdx, nameInput.value);
        nameInput.onkeydown = (ev) => {
          if (ev.key === 'Enter') { ev.preventDefault(); nameInput.blur(); }
        };

        const countSpan = document.createElement('span');
        countSpan.className = 'text-[10px] font-mono text-slate-400 shrink-0';
        countSpan.textContent = grp.levels.length + ' lvl';

        left.appendChild(handle);
        left.appendChild(badge);
        left.appendChild(nameInput);
        left.appendChild(countSpan);

        const actions = document.createElement('div');
        actions.className = 'flex items-center gap-1 shrink-0';

        const btnUp = document.createElement('button');
        btnUp.type = 'button';
        btnUp.innerHTML = '&uarr;';
        btnUp.title = 'Move story earlier';
        btnUp.disabled = grp.isEmpty || popIdx <= 0;
        btnUp.className = 'px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-slate-200 text-[11px] font-bold';
        btnUp.onclick = () => moveStory(gIdx, -1);

        const btnDown = document.createElement('button');
        btnDown.type = 'button';
        btnDown.innerHTML = '&darr;';
        btnDown.title = 'Move story later';
        btnDown.disabled = grp.isEmpty || popIdx < 0 || popIdx >= popGroups.length - 1;
        btnDown.className = 'px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-slate-200 text-[11px] font-bold';
        btnDown.onclick = () => moveStory(gIdx, 1);

        const btnAddLvl = document.createElement('button');
        btnAddLvl.type = 'button';
        btnAddLvl.textContent = '+ Level';
        btnAddLvl.title = 'Create a new level inside this story';
        btnAddLvl.className = 'px-2 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/35 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold uppercase tracking-wider';
        btnAddLvl.onclick = () => addLevelToStory(grp.storyName);

        const btnDel = document.createElement('button');
        btnDel.type = 'button';
        btnDel.innerHTML = '&times;';
        btnDel.title = 'Delete story';
        btnDel.className = 'px-2 py-1 rounded bg-rose-600/20 hover:bg-rose-600/35 text-rose-300 border border-rose-500/40 text-[11px] font-bold';
        btnDel.onclick = () => deleteStory(gIdx);

        actions.appendChild(btnUp);
        actions.appendChild(btnDown);
        actions.appendChild(btnAddLvl);
        actions.appendChild(btnDel);

        header.appendChild(left);
        header.appendChild(actions);
        card.appendChild(header);

        // Levels inside this story
        const chipsRow = document.createElement('div');
        chipsRow.className = 'flex flex-wrap items-center gap-1.5 min-h-[28px]';
        if (!grp.levels.length) {
          const emptyMsg = document.createElement('span');
          emptyMsg.className = 'text-[11px] text-slate-500 italic';
          emptyMsg.textContent = 'No levels yet — click + Level, choose below, or drag a level here.';
          chipsRow.appendChild(emptyMsg);
        } else {
          grp.levels.forEach((item) => {
            const isSel = item.idx === currentLevelIdx;
            const chip = document.createElement('div');
            chip.draggable = true;
            chip.className = 'inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer transition ' +
              (isSel ? 'bg-cyan-500/25 border-cyan-400 text-cyan-100' : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-cyan-500/50');
            chip.title = 'Click to edit level, drag onto another story to move';
            chip.ondragstart = (ev) => {
              ev.stopPropagation();
              draggedStoryLevelId = item.lvl.id;
              ev.dataTransfer.effectAllowed = 'move';
            };
            chip.ondragend = () => {
              draggedStoryLevelId = null;
            };

            const label = document.createElement('span');
            label.textContent = 'L' + (item.idx + 1) + ': ' + item.lvl.name;
            label.onclick = () => {
              currentLevelIdx = item.idx;
              selectedWaveIdx = 0;
              selectedWaveIds.clear();
              resetPlayback();
              renderAll();
            };

            const rm = document.createElement('button');
            rm.type = 'button';
            rm.innerHTML = '&times;';
            rm.title = 'Remove level from this story';
            rm.className = 'ml-0.5 text-slate-400 hover:text-rose-300 font-bold leading-none';
            rm.onclick = (ev) => {
              ev.stopPropagation();
              removeLevelFromStory(item.lvl.id);
            };

            chip.appendChild(label);
            chip.appendChild(rm);
            chipsRow.appendChild(chip);
          });
        }
        card.appendChild(chipsRow);

        // Assign existing level dropdown
        const otherLevels = levels
          .map((l, idx) => ({ l, idx }))
          .filter((x) => !grp.levels.some((gItem) => gItem.lvl.id === x.l.id));
        if (otherLevels.length) {
          const assignSel = document.createElement('select');
          assignSel.className = 'input-dark !text-[11px] !py-1 text-slate-300';
          const defOpt = document.createElement('option');
          defOpt.value = '';
          defOpt.textContent = '+ Add existing level to "' + grp.storyName + '"...';
          assignSel.appendChild(defOpt);
          otherLevels.forEach((x) => {
            const opt = document.createElement('option');
            opt.value = x.l.id;
            opt.textContent = 'L' + (x.idx + 1) + ': ' + x.l.name + ' (' + normalizeStoryName(x.l.storyName) + ')';
            assignSel.appendChild(opt);
          });
          assignSel.onchange = () => {
            if (assignSel.value) assignLevelToStory(assignSel.value, grp.storyName);
          };
          card.appendChild(assignSel);
        }

        listEl.appendChild(card);
      });
    }

    function addPattern() {
      const nextNum = patterns.length + 1;
      patterns.push({
        id: 'pattern-' + Date.now(),
        name: 'Custom Pattern ' + nextNum,
        description: 'Reusable wave combo',
        waves: [
          {
            id: 'pw-' + Date.now(),
            order: 1,
            delayAfterPrev: 0.4,
            side: 'north',
            patternType: 'single-gap-wall',
            speed: 175,
            gapCenter: 0,
            gapSize: 125,
            barThickness: 18,
            attachedGates: [],
          },
        ],
      });
      currentPatternIdx = patterns.length - 1;
      selectedWaveIdx = 0;
      selectedWaveIds.clear();
      resetPlayback();
      renderAll();
    }

    function deleteCurrentPattern() {
      const pat = curPattern();
      if (!pat) return;
      if (!confirm('Are you sure you want to delete pattern "' + pat.name + '"?')) return;
      patterns.splice(currentPatternIdx, 1);
      currentPatternIdx = Math.max(0, currentPatternIdx - 1);
      selectedWaveIdx = 0;
      selectedWaveIds.clear();
      resetPlayback();
      renderAll();
      showBanner('Deleted pattern "' + pat.name + '". Click Save All Config to persist.', false);
    }

    function deleteSelectedBundledPattern() {
      const sel = document.getElementById('bundledPatternSelect');
      const patId = sel ? sel.value : '';
      const idx = patterns.findIndex((p) => p.id === patId);
      if (idx < 0) return;
      const pat = patterns[idx];
      if (!confirm('Are you sure you want to delete pattern "' + pat.name + '"?')) return;
      patterns.splice(idx, 1);
      currentPatternIdx = Math.max(0, Math.min(currentPatternIdx, patterns.length - 1));
      renderAll();
      showBanner('Deleted pattern "' + pat.name + '". Click Save All Config to persist.', false);
    }

    function updatePatternMeta(field, val) {
      const pat = curPattern();
      if (!pat) return;
      pat[field] = val;
      if (field === 'name') {
        renderTabs();
        renderBundledPatternSelect();
      }
    }

    function cloneWavesForInsert(sourceWaves, startOrder, nextGateOrdStart, groupMeta) {
      const stamp = Date.now() + '-' + Math.floor(Math.random() * 10000);
      let gOrd = nextGateOrdStart;
      return (sourceWaves || []).slice().sort((a, b) => a.order - b.order).map((w, idx) => {
        const cloned = JSON.parse(JSON.stringify(w));
        cloned.id = 'wave-' + stamp + '-' + idx;
        cloned.order = startOrder + idx;
        if (groupMeta) {
          cloned.patternGroupId = groupMeta.id;
          cloned.patternGroupName = groupMeta.name;
        } else {
          delete cloned.patternGroupId;
          delete cloned.patternGroupName;
        }
        cloned.attachedGates = (cloned.attachedGates || []).map((g, gIdx) => ({
          ...g,
          id: 'gate-' + stamp + '-' + idx + '-' + gIdx,
          order: gOrd,
          label: 'GATE ' + (gOrd++),
        }));
        return cloned;
      });
    }

    function insertBundledPattern() {
      const target = activeContainer();
      if (!target) return;
      const sel = document.getElementById('bundledPatternSelect');
      const patId = sel ? sel.value : '';
      const pat = patterns.find((p) => p.id === patId);
      if (!pat || !pat.waves || pat.waves.length === 0) {
        return showBanner('No waves in selected pattern.', true);
      }
      if (!target.waves) target.waves = [];
      const maxOrd = target.waves.length ? Math.max(...target.waves.map((w) => Number(w.order || 1))) : 0;
      const groupMeta = { id: 'pg-' + Date.now() + '-' + Math.floor(Math.random() * 1000), name: pat.name };
      const inserted = cloneWavesForInsert(pat.waves, maxOrd + 1, nextGateOrder(target), groupMeta);
      target.waves.push(...inserted);
      selectedWaveIdx = target.waves.length - inserted.length;
      renderAll();
      if (inserted[0]) jumpToWave(inserted[0].id);
      showBanner('Inserted "' + pat.name + '" (' + inserted.length + ' waves).', false);
    }

    function removePatternGroup(groupId) {
      const target = activeContainer();
      if (!target || !target.waves) return;
      const before = target.waves.length;
      target.waves = target.waves.filter((w) => {
        if (w.patternGroupId === groupId) {
          selectedWaveIds.delete(w.id);
          return false;
        }
        return true;
      });
      const removed = before - target.waves.length;
      if (removed === 0) return;
      selectedWaveIdx = Math.max(0, Math.min(selectedWaveIdx, target.waves.length - 1));
      renderAll();
      showBanner('Removed ' + removed + ' wave(s) from inserted pattern.', false);
    }

    function toggleSelectAllWaves() {
      const target = activeContainer();
      if (!target || !target.waves || target.waves.length === 0) return;
      const allSelected = target.waves.every((w) => selectedWaveIds.has(w.id));
      selectedWaveIds.clear();
      if (!allSelected) {
        target.waves.forEach((w) => selectedWaveIds.add(w.id));
      }
      renderWaveList();
    }

    function duplicateSelectedWaves() {
      const target = activeContainer();
      if (!target || !target.waves) return;
      const ordered = getOrderedWaves(target);
      const chosen = ordered.filter((w) => selectedWaveIds.has(w.id));
      if (chosen.length === 0) return;
      const maxOrd = target.waves.length ? Math.max(...target.waves.map((w) => Number(w.order || 1))) : 0;
      const dupes = cloneWavesForInsert(chosen, maxOrd + 1, nextGateOrder(target));
      target.waves.push(...dupes);
      selectedWaveIds.clear();
      dupes.forEach((w) => selectedWaveIds.add(w.id));
      selectedWaveIdx = target.waves.length - dupes.length;
      renderAll();
      if (dupes[0]) jumpToWave(dupes[0].id);
      showBanner('Duplicated ' + dupes.length + ' wave(s).', false);
    }

    function deleteSelectedWaves() {
      const target = activeContainer();
      if (!target || !target.waves || selectedWaveIds.size === 0) return;
      const count = target.waves.filter((w) => selectedWaveIds.has(w.id)).length;
      if (count === 0) return;
      if (!confirm('Delete ' + count + ' selected wave(s)?')) return;
      target.waves = target.waves.filter((w) => !selectedWaveIds.has(w.id));
      selectedWaveIds.clear();
      selectedWaveIdx = Math.max(0, Math.min(selectedWaveIdx, target.waves.length - 1));
      renderAll();
      showBanner('Deleted ' + count + ' wave(s).', false);
    }

    function applyOrderedWaves(target, newOrdered, focusWaveId) {
      newOrdered.forEach((w, i) => { w.order = i + 1; });
      target.waves = newOrdered;
      if (focusWaveId) {
        const idx = target.waves.findIndex((w) => w.id === focusWaveId);
        if (idx >= 0) selectedWaveIdx = idx;
      }
      renderAll();
    }

    function moveWaveInSchedule(waveId, delta) {
      const target = activeContainer();
      if (!target || !target.waves) return;
      const ordered = getOrderedWaves(target);
      const idx = ordered.findIndex((w) => w.id === waveId);
      const nextIdx = idx + delta;
      if (idx < 0 || nextIdx < 0 || nextIdx >= ordered.length) return;
      const [moved] = ordered.splice(idx, 1);
      ordered.splice(nextIdx, 0, moved);
      applyOrderedWaves(target, ordered, moved.id);
    }

    let draggedWaveId = null;
    function reorderWaveByDrop(fromId, toId) {
      if (!fromId || !toId || fromId === toId) return;
      const target = activeContainer();
      if (!target || !target.waves) return;
      const ordered = getOrderedWaves(target);
      const fromIdx = ordered.findIndex((w) => w.id === fromId);
      const toIdx = ordered.findIndex((w) => w.id === toId);
      if (fromIdx < 0 || toIdx < 0) return;
      const [moved] = ordered.splice(fromIdx, 1);
      ordered.splice(toIdx, 0, moved);
      applyOrderedWaves(target, ordered, moved.id);
    }

    function updateBulkActionUI(ordered) {
      const total = ordered ? ordered.length : 0;
      const selCount = ordered ? ordered.filter((w) => selectedWaveIds.has(w.id)).length : 0;
      const lbl = document.getElementById('selectedWavesCountLabel');
      const btnAll = document.getElementById('btnSelectAllWaves');
      const btnDup = document.getElementById('btnDupSelected');
      const btnDel = document.getElementById('btnDelSelected');
      if (lbl) lbl.textContent = selCount + ' selected';
      if (btnAll) btnAll.textContent = (total > 0 && selCount === total) ? 'Clear' : 'Select All';
      if (btnDup) {
        btnDup.disabled = selCount === 0;
        btnDup.textContent = selCount > 0 ? 'Duplicate (' + selCount + ')' : 'Duplicate';
      }
      if (btnDel) {
        btnDel.disabled = selCount === 0;
        btnDel.textContent = selCount > 0 ? 'Delete (' + selCount + ')' : 'Delete';
      }
    }

    function saveSelectedOrAllAsPattern() {
      const target = activeContainer();
      if (!target || !target.waves || target.waves.length === 0) {
        return showBanner('Current schedule has no waves to save.', true);
      }
      const ordered = getOrderedWaves(target);
      const checked = ordered.filter((w) => selectedWaveIds.has(w.id));
      const chosen = checked.length > 0 ? checked : ordered;
      const defaultName = (target.name || 'Wave') + (checked.length > 0 ? ' Slice' : ' Pattern');
      const name = prompt('Save ' + chosen.length + ' wave(s) as Pattern name:', defaultName);
      if (!name || !name.trim()) return;
      const clonedWaves = cloneWavesForInsert(chosen, 1, 1);
      patterns.push({
        id: 'pattern-' + Date.now(),
        name: name.trim(),
        description: 'Saved from ' + (target.name || 'schedule') + ' (' + clonedWaves.length + ' waves)',
        waves: clonedWaves,
      });
      selectedWaveIds.clear();
      renderAll();
      showBanner('Saved pattern "' + name.trim() + '" (' + clonedWaves.length + ' waves). Click Save All Config to persist.', false);
    }

    function addWaveFromBuilder() {
      const lvl = activeContainer();
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
      const lvl = activeContainer();
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
      clearedPreviewGateIds.clear();
      const lvl = activeContainer();
      dummyPos = (lvl && lvl.spawn) ? { x: lvl.spawn.x, y: lvl.spawn.y } : { x: 0, y: 120 };
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
      const lvl = activeContainer();
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
        const lvl = activeContainer();
        if (lvl) {
          const { totalDuration } = computeWaveSchedule(lvl);
          if (simTime > totalDuration) {
            simTime = 0;
            clearedPreviewGateIds.clear();
          }
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
      const isLvl = viewMode === 'levels';
      const btnLvl = document.getElementById('viewTabLevels');
      const btnPat = document.getElementById('viewTabPatterns');
      if (btnLvl && btnPat) {
        btnLvl.className = 'px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider transition ' +
          (isLvl ? 'bg-cyan-500 text-black' : 'text-slate-300 hover:text-white');
        btnPat.className = 'px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider transition ' +
          (!isLvl ? 'bg-violet-500 text-black' : 'text-slate-300 hover:text-white');
      }
      document.getElementById('storyGroupingPanel').classList.toggle('hidden', !isLvl);
      document.getElementById('levelTabActions').classList.toggle('hidden', !isLvl);
      document.getElementById('patternTabActions').classList.toggle('hidden', isLvl);
      document.getElementById('levelMetaPanel').classList.toggle('hidden', !isLvl);
      document.getElementById('patternMetaPanel').classList.toggle('hidden', isLvl);
      document.getElementById('bundledPatternRow').classList.toggle('hidden', !isLvl);

      if (isLvl) renderStoryGroups();
      renderTabs();
      renderMeta();
      renderBundledPatternSelect();
      renderWaveList();
      renderWaveInspector();
      updateScrubberUI();
      drawCanvas();
    }

    function renderBundledPatternSelect() {
      const sel = document.getElementById('bundledPatternSelect');
      const delBtn = document.getElementById('btnDeleteBundledPattern');
      if (!sel) return;
      const prev = sel.value;
      sel.innerHTML = '';
      if (delBtn) delBtn.disabled = !patterns.length;
      if (!patterns.length) {
        const o = document.createElement('option');
        o.value = '';
        o.textContent = 'No patterns saved yet';
        sel.appendChild(o);
        return;
      }
      patterns.forEach((p) => {
        const o = document.createElement('option');
        o.value = p.id;
        o.textContent = p.name + ' (' + (p.waves ? p.waves.length : 0) + ' waves)';
        sel.appendChild(o);
      });
      if (prev && patterns.some((p) => p.id === prev)) sel.value = prev;
    }

    function renderTabs() {
      const c = document.getElementById('levelTabs');
      c.innerHTML = '';
      if (viewMode === 'levels') {
        const btnLeft = document.getElementById('btnMoveLevelLeft');
        const btnRight = document.getElementById('btnMoveLevelRight');
        if (btnLeft) btnLeft.disabled = currentLevelIdx <= 0;
        if (btnRight) btnRight.disabled = currentLevelIdx >= levels.length - 1;
        levels.forEach((lvl, idx) => {
          const b = document.createElement('button');
          b.draggable = true;
          b.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition border ' +
            (idx === currentLevelIdx ? 'bg-cyan-500 text-black border-cyan-400' : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-cyan-500/50');
          b.textContent = 'L' + (idx + 1) + ': ' + lvl.name;
          b.title = 'Click to edit, drag to reorder';
          b.onclick = () => { currentLevelIdx = idx; selectedWaveIdx = 0; selectedWaveIds.clear(); resetPlayback(); renderAll(); };
          b.ondragstart = (ev) => { draggedLevelIdx = idx; ev.dataTransfer.effectAllowed = 'move'; };
          b.ondragover = (ev) => { ev.preventDefault(); b.classList.add('ring-2', 'ring-cyan-400'); };
          b.ondragleave = () => { b.classList.remove('ring-2', 'ring-cyan-400'); };
          b.ondrop = (ev) => {
            ev.preventDefault();
            b.classList.remove('ring-2', 'ring-cyan-400');
            reorderLevelByDrop(draggedLevelIdx, idx);
            draggedLevelIdx = null;
          };
          c.appendChild(b);
        });
      } else {
        if (!patterns.length) {
          c.innerHTML = '<span class="text-xs text-slate-400">No patterns yet. Click "+ New Pattern" or save from a Level schedule.</span>';
          return;
        }
        patterns.forEach((pat, idx) => {
          const b = document.createElement('button');
          b.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition border ' +
            (idx === currentPatternIdx ? 'bg-violet-500 text-black border-violet-400' : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-violet-500/50');
          b.textContent = pat.name + ' (' + (pat.waves ? pat.waves.length : 0) + ')';
          b.onclick = () => { currentPatternIdx = idx; selectedWaveIdx = 0; selectedWaveIds.clear(); resetPlayback(); renderAll(); };
          c.appendChild(b);
        });
      }
    }

    function renderMeta() {
      if (viewMode === 'levels') {
        const lvl = curLevel();
        if (!lvl) return;
        document.getElementById('metaName').value = lvl.name || '';
        document.getElementById('metaStoryName').value = lvl.storyName || 'Story 1';
        document.getElementById('metaDesc').value = lvl.description || '';
        document.getElementById('metaClearBonus').value = lvl.clearBonusPoints ?? 500;
        document.getElementById('metaParTime').value = lvl.parTimeSeconds ?? 20;
      } else {
        const pat = curPattern();
        document.getElementById('patMetaName').value = pat ? (pat.name || '') : '';
        document.getElementById('patMetaDesc').value = pat ? (pat.description || '') : '';
      }
    }

    function renderWaveList() {
      const lvl = activeContainer();
      const listEl = document.getElementById('waveList');
      listEl.innerHTML = '';
      if (!lvl) {
        document.getElementById('waveCountLabel').textContent = '0 waves';
        updateBulkActionUI([]);
        return;
      }
      const ordered = getOrderedWaves(lvl);
      document.getElementById('waveCountLabel').textContent = ordered.length + ' wave(s)';

      let acc = 0;
      ordered.forEach((w, ordIdx) => {
        acc += Number(w.delayAfterPrev || 0);
        const origIdx = lvl.waves.indexOf(w);
        const isSel = origIdx === selectedWaveIdx;
        const isChecked = selectedWaveIds.has(w.id);
        const row = document.createElement('div');
        row.draggable = true;
        row.className = 'flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs cursor-pointer border ' +
          (isSel ? 'bg-cyan-950/60 border-cyan-400 text-cyan-100' : 'bg-slate-900/80 border-slate-800 hover:border-slate-600');
        const gateCount = (w.attachedGates || []).length;
        const patBadge = w.patternGroupId
          ? '<button type="button" data-rm-group="' + w.patternGroupId + '" class="px-1.5 py-0.5 rounded bg-violet-500/20 hover:bg-rose-500/30 text-violet-200 hover:text-rose-200 border border-violet-500/30 text-[10px] font-semibold transition" title="Remove entire inserted pattern">' +
              (w.patternGroupName || 'Pattern') + ' &times;' +
            '</button>'
          : '';
        row.innerHTML =
          '<div class="flex items-center gap-1.5 min-w-0">' +
            '<span class="text-slate-500 cursor-grab select-none px-0.5" title="Drag to reorder">&#8942;&#8942;</span>' +
            '<input type="checkbox" class="accent-violet-400 cursor-pointer shrink-0" ' + (isChecked ? 'checked' : '') + ' title="Select wave for duplicate / delete / save pattern" />' +
            '<span class="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-cyan-300 font-bold shrink-0">#' + w.order + '</span>' +
            '<span class="uppercase font-bold text-rose-300 shrink-0">' + w.side + '</span>' +
            '<span class="text-slate-300 truncate">' + w.patternType + '</span>' +
            patBadge +
          '</div>' +
          '<div class="flex items-center gap-1.5 font-mono text-[11px] shrink-0">' +
            '<span class="text-slate-400">@' + acc.toFixed(1) + 's</span>' +
            '<span class="px-1.5 py-0.5 rounded ' + (gateCount ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-500') + '">' + gateCount + 'g</span>' +
            '<button type="button" data-move="-1" ' + (ordIdx === 0 ? 'disabled' : '') + ' class="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200" title="Move up">&uarr;</button>' +
            '<button type="button" data-move="1" ' + (ordIdx === ordered.length - 1 ? 'disabled' : '') + ' class="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200" title="Move down">&darr;</button>' +
          '</div>';
        const cb = row.querySelector('input[type="checkbox"]');
        cb.onclick = (ev) => {
          ev.stopPropagation();
          if (cb.checked) selectedWaveIds.add(w.id);
          else selectedWaveIds.delete(w.id);
          updateBulkActionUI(ordered);
        };
        const rmBtn = row.querySelector('[data-rm-group]');
        if (rmBtn) {
          rmBtn.onclick = (ev) => {
            ev.stopPropagation();
            removePatternGroup(w.patternGroupId);
          };
        }
        row.querySelectorAll('[data-move]').forEach((btn) => {
          btn.onclick = (ev) => {
            ev.stopPropagation();
            moveWaveInSchedule(w.id, Number(btn.dataset.move));
          };
        });
        row.ondragstart = (ev) => {
          draggedWaveId = w.id;
          ev.dataTransfer.effectAllowed = 'move';
        };
        row.ondragover = (ev) => {
          ev.preventDefault();
          row.classList.add('ring-1', 'ring-cyan-400');
        };
        row.ondragleave = () => {
          row.classList.remove('ring-1', 'ring-cyan-400');
        };
        row.ondrop = (ev) => {
          ev.preventDefault();
          row.classList.remove('ring-1', 'ring-cyan-400');
          reorderWaveByDrop(draggedWaveId, w.id);
          draggedWaveId = null;
        };
        row.onclick = () => {
          selectedWaveIdx = origIdx;
          renderWaveList();
          renderWaveInspector();
          jumpToWave(w.id);
        };
        listEl.appendChild(row);
      });
      updateBulkActionUI(ordered);
    }

    function renderWaveInspector() {
      const titleEl = document.getElementById('waveInspectorTitle');
      const actionsEl = document.getElementById('waveInspectorActions');
      const bodyEl = document.getElementById('waveInspectorBody');
      actionsEl.innerHTML = '';
      const lvl = activeContainer();
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
      if (w.patternGroupId) {
        const btnRmPat = makeActionBtn('Remove Pattern', () => removePatternGroup(w.patternGroupId), true);
        actionsEl.append(btnDup, btnDel, btnRmPat);
      } else {
        actionsEl.append(btnDup, btnDel);
      }

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

      const lvl = activeContainer();
      if (!lvl) { ctx.restore(); return; }

      const { items } = computeWaveSchedule(lvl);
      const selWave = lvl.waves && lvl.waves[selectedWaveIdx];

      const getActivePreviewGateId = () => {
        const upcomingGates = [];
        for (const it of items) {
          if (simTime > it.spawnAt + it.duration) continue;
          for (const g of (it.wave.attachedGates || [])) {
            if (!clearedPreviewGateIds.has(g.id)) upcomingGates.push(g);
          }
        }
        upcomingGates.sort((a, b) => Number(a.order) - Number(b.order));
        return upcomingGates.length ? upcomingGates[0].id : null;
      };

      // Sequential dummy-ball gate clearing (matches GameEngine.ts active gate progression)
      let activeGateId = getActivePreviewGateId();
      if (activeGateId) {
        for (const item of items) {
          const tSince = simTime - item.spawnAt;
          if (tSince < 0 || tSince > item.duration) continue;
          const w = item.wave;
          const activeGate = (w.attachedGates || []).find((g) => g.id === activeGateId);
          if (!activeGate) continue;
          const geom = computeWaveGeometry(w, tSince);
          const coordVal = geom.isVert ? dummyPos.y : dummyPos.x;
          const perpVal = geom.isVert ? dummyPos.x : dummyPos.y;
          const minSpan = Math.min(activeGate.start, activeGate.end);
          const maxSpan = Math.max(activeGate.start, activeGate.end);
          if (Math.abs(coordVal - geom.coord) <= PLAYER_RADIUS + 4 && perpVal >= minSpan && perpVal <= maxSpan) {
            clearedPreviewGateIds.add(activeGate.id);
            popups.push({ x: dummyPos.x, y: dummyPos.y - 24, text: '+' + (activeGate.points || 200), color: '#34d399', alpha: 1 });
            activeGateId = getActivePreviewGateId();
          }
        }
      }
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.006);
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
            const isCleared = clearedPreviewGateIds.has(attached.id);
            const isCurrent = !isCleared && attached.id === activeGateId;

            if (isCleared) {
              ctx.shadowColor = 'transparent';
              ctx.shadowBlur = 0;
              ctx.strokeStyle = isHov ? '#ffffff' : 'rgba(16, 185, 129, 0.35)';
              ctx.lineWidth = 2;
            } else if (isCurrent) {
              ctx.shadowColor = '#10b981';
              ctx.shadowBlur = 16 + pulse * 10;
              ctx.strokeStyle = isHov ? '#ffffff' : 'rgba(52, 211, 153, ' + (0.75 + pulse * 0.25) + ')';
              ctx.lineWidth = 4.5;
            } else {
              ctx.shadowColor = 'transparent';
              ctx.shadowBlur = 0;
              ctx.strokeStyle = isHov ? '#ffffff' : 'rgba(148, 163, 184, 0.4)';
              ctx.lineWidth = 2;
              ctx.setLineDash([6, 5]);
            }

            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            ctx.setLineDash([]);

            // Gate end-posts
            ctx.fillStyle = isCleared ? 'rgba(16, 185, 129, 0.45)' : isCurrent ? '#6ee7b7' : 'rgba(148, 163, 184, 0.5)';
            ctx.beginPath(); ctx.arc(x1, y1, isCurrent ? 4.5 : 3, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(x2, y2, isCurrent ? 4.5 : 3, 0, Math.PI * 2); ctx.fill();

            // Gate Number badge
            ctx.shadowBlur = 0;
            ctx.beginPath(); ctx.arc(midX, midY, isCurrent ? 13 : 11, 0, Math.PI * 2);
            ctx.fillStyle = isCleared ? 'rgba(6, 78, 59, 0.7)' : isCurrent ? '#065f46' : 'rgba(15, 23, 42, 0.85)';
            ctx.fill();
            ctx.lineWidth = isCurrent ? 2.5 : 1.5;
            ctx.strokeStyle = isCleared ? 'rgba(16, 185, 129, 0.5)' : isCurrent ? '#34d399' : 'rgba(148, 163, 184, 0.45)';
            ctx.stroke();

            ctx.fillStyle = isCleared ? 'rgba(110, 231, 183, 0.85)' : '#ffe600';
            ctx.shadowColor = isCleared ? 'transparent' : '#ffe600';
            ctx.shadowBlur = isCleared ? 0 : isCurrent ? 10 : 5;
            ctx.font = 'bold 12px Orbitron, monospace';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(isCleared ? '\u2713' : String(attached.order), midX, midY);
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

      // Player Spawn (dashed ring, levels only)
      if (lvl.spawn) {
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
      }

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
      const lvl = activeContainer();
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
      const lvl = activeContainer();
      if (!lvl) return;
      const { x, y } = getCanvasCoords(e);

      if (Math.hypot(x - dummyPos.x, y - dummyPos.y) <= 18) {
        dragDummy = true;
        return;
      }

      if (lvl.spawn && Math.hypot(x - lvl.spawn.x, y - lvl.spawn.y) <= 18) {
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
      const lvl = activeContainer();
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
