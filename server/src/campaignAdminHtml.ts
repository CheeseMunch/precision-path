/**
 * HTML/JS renderer for the Campaign Level Admin visual editor (/campaign-admin).
 * Uses center-relative arena coordinates (-225..225 x -400..400) matching GameEngine & GameCanvas.
 * Checkpoints are axis-aligned gates with automatic opening detection (treating arena walls as endgates)
 * and explicit Gate Numbering (order: 1, 2, 3...).
 */

export function renderCampaignAdminPage(adminToken: string): string {
  const safeToken = JSON.stringify(adminToken);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Precision Path — Campaign Level Admin</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background: #070a12; color: #e2e8f0; font-family: ui-sans-serif, system-ui, sans-serif; }
    .cyber-panel { background: #0d1322; border: 1px solid rgba(34, 211, 238, 0.22); }
    .input-dark { background: #060913; border: 1px solid #1e293b; color: #f8fafc; border-radius: 0.375rem; padding: 0.375rem 0.5rem; font-size: 0.75rem; width: 100%; }
    .input-dark:focus { outline: none; border-color: #22d3ee; }
    .tool-btn { background: #111827; border: 1px solid #334155; color: #cbd5e1; padding: 0.45rem 0.7rem; border-radius: 0.5rem; font-size: 0.75rem; font-weight: 700; cursor: pointer; transition: all 0.15s; }
    .tool-btn:hover { border-color: #22d3ee; color: #fff; }
    .tool-btn.active { background: #06b6d4; border-color: #22d3ee; color: #04101a; }
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
          <h1 class="text-xl font-black tracking-wide text-white">Structured Gate Path Designer</h1>
        </div>
        <p class="text-xs text-slate-400 mt-1">Place obstacles, scan horizontal/vertical lines to pick any gate opening (walls act as endgates), and number gates (1, 2, 3...) to define the path.</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <a href="/db-admin" class="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 font-bold rounded-lg text-xs uppercase tracking-wider border border-gray-700 transition">
          &larr; DB &amp; Endless Admin
        </a>
        <button id="btnResetDefaults" onclick="resetCampaignConfig()" class="px-3 py-2 bg-rose-950/70 hover:bg-rose-900 text-rose-200 font-bold rounded-lg text-xs uppercase tracking-wider border border-rose-500/40 transition">
          Reset Defaults
        </button>
        <button id="btnSaveAll" onclick="saveCampaignConfig()" class="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black rounded-lg text-xs uppercase tracking-wider shadow-lg shadow-cyan-500/20 transition">
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
      <!-- Left: Canvas & Placement Toolbar -->
      <div class="lg:col-span-6 cyber-panel rounded-xl p-4 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="text-xs font-bold uppercase tracking-wider text-cyan-300">Visual Arena (450 &times; 800, Center 0,0)</div>
          <label class="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
            <input type="checkbox" id="chkSnapGrid" checked class="accent-cyan-400" />
            Snap 10px
          </label>
        </div>

        <div class="flex flex-wrap gap-1.5" id="toolPalette">
          <button class="tool-btn active" data-tool="select" onclick="setTool('select')">Select / Drag</button>
          <button class="tool-btn" data-tool="spawn" onclick="setTool('spawn')">Set Spawn</button>
          <button class="tool-btn" data-tool="gate-h" onclick="setTool('gate-h')">+ Gate (Horiz)</button>
          <button class="tool-btn" data-tool="gate-v" onclick="setTool('gate-v')">+ Gate (Vert)</button>
          <button class="tool-btn" data-tool="wall" onclick="setTool('wall')">+ Gate Wall</button>
          <button class="tool-btn" data-tool="spinner" onclick="setTool('spinner')">+ Spinner</button>
          <button class="tool-btn" data-tool="orb" onclick="setTool('orb')">+ Orb</button>
        </div>

        <div class="flex justify-center bg-[#04060c] rounded-xl p-3 border border-slate-800">
          <canvas id="editorCanvas" width="450" height="800" class="rounded-lg border border-cyan-500/30 shadow-2xl cursor-crosshair max-w-full h-auto"></canvas>
        </div>

        <div class="flex items-center justify-between text-[11px] text-slate-400">
          <span id="cursorCoords">X: 0, Y: 0</span>
          <span>Hover with + Gate (Horiz/Vert) to pick any opening (walls = endgates)</span>
        </div>
      </div>

      <!-- Right: Level Metadata + Selected Item Inspector + Lists -->
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
            <div>
              <label class="block text-[11px] text-slate-400 mb-1">Spawn X</label>
              <input id="metaSpawnX" type="number" class="input-dark" oninput="updateSpawn('x', Number(this.value))" />
            </div>
            <div>
              <label class="block text-[11px] text-slate-400 mb-1">Spawn Y</label>
              <input id="metaSpawnY" type="number" class="input-dark" oninput="updateSpawn('y', Number(this.value))" />
            </div>
          </div>
        </div>

        <!-- Selected Element Inspector -->
        <div class="cyber-panel rounded-xl p-4 space-y-3">
          <div class="flex items-center justify-between">
            <div class="text-xs font-bold uppercase tracking-wider text-amber-300" id="inspectorTitle">Inspector (Nothing Selected)</div>
            <div class="flex gap-2" id="inspectorActions"></div>
          </div>
          <div id="inspectorBody" class="text-xs text-slate-400">
            Click a checkpoint gate or obstacle on the canvas (or in the lists below) to edit its properties.
          </div>
        </div>

        <!-- Checkpoints & Obstacles Lists -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="cyber-panel rounded-xl p-3 space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-emerald-300">Checkpoint Gates (Path Order)</span>
              <button onclick="addQuickGate()" class="text-[11px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30">+ Gate</button>
            </div>
            <div id="checkpointList" class="space-y-1 max-h-60 overflow-y-auto pr-1"></div>
          </div>

          <div class="cyber-panel rounded-xl p-3 space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-rose-300">Obstacles</span>
              <button onclick="addQuickObstacle('wall')" class="text-[11px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30">+ Wall</button>
            </div>
            <div id="obstacleList" class="space-y-1 max-h-60 overflow-y-auto pr-1"></div>
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
    const PLAYER_RADIUS = 13;

    let levels = [];
    let currentLevelIdx = 0;
    let activeTool = 'select';
    let selected = null;
    let dragState = null;
    let hoverPointer = null; // { x, y }

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

    function snap(val) {
      if (!document.getElementById('chkSnapGrid').checked) return Math.round(val);
      return Math.round(val / 10) * 10;
    }

    function setTool(tool) {
      activeTool = tool;
      document.querySelectorAll('#toolPalette .tool-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.tool === tool);
      });
      drawCanvas();
    }

    function gateMidpoint(cp) {
      const mid = (cp.start + cp.end) / 2;
      return cp.axis === 'vertical' ? { x: cp.coord, y: mid } : { x: mid, y: cp.coord };
    }

    function nextGateOrder(lvl) {
      if (!lvl.checkpoints.length) return 1;
      return Math.max(...lvl.checkpoints.map((c) => Number(c.order || 1))) + 1;
    }

    /**
     * Scans a horizontal (Y = coord) or vertical (X = coord) line across the arena,
     * treating the outer arena walls (-225/+225 or -400/+400) as endgates and returning
     * all open intervals not blocked by any obstacle.
     */
    function computeLineOpenings(lvl, axis, coord) {
      const spanLimit = axis === 'horizontal' ? HALF_W : HALF_H;
      const blocked = [];

      for (const obs of lvl.obstacles) {
        if (obs.type === 'circle') {
          const r = obs.radius || 20;
          const centerLine = axis === 'horizontal' ? obs.y : obs.x;
          const centerPerp = axis === 'horizontal' ? obs.x : obs.y;
          const d = Math.abs(coord - centerLine);
          if (d < r) {
            const hc = Math.sqrt(r * r - d * d);
            blocked.push([centerPerp - hc, centerPerp + hc]);
          }
        } else {
          const hw = (obs.width || 180) / 2;
          const hh = (obs.height || 20) / 2;
          const ang = obs.rotation || 0;
          const cos = Math.cos(ang);
          const sin = Math.sin(ang);
          const corners = [
            [-hw, -hh],
            [hw, -hh],
            [hw, hh],
            [-hw, hh],
          ].map(([lx, ly]) => ({
            x: obs.x + lx * cos - ly * sin,
            y: obs.y + lx * sin + ly * cos,
          }));

          const hits = [];
          for (let i = 0; i < 4; i++) {
            const a = corners[i];
            const b = corners[(i + 1) % 4];
            const aLine = axis === 'horizontal' ? a.y : a.x;
            const bLine = axis === 'horizontal' ? b.y : b.x;
            const aPerp = axis === 'horizontal' ? a.x : a.y;
            const bPerp = axis === 'horizontal' ? b.x : b.y;
            if ((aLine <= coord && bLine >= coord) || (bLine <= coord && aLine >= coord)) {
              if (Math.abs(bLine - aLine) < 1e-6) {
                hits.push(aPerp, bPerp);
              } else {
                const t = (coord - aLine) / (bLine - aLine);
                hits.push(aPerp + t * (bPerp - aPerp));
              }
            }
          }
          if (hits.length >= 2) {
            blocked.push([Math.min(...hits), Math.max(...hits)]);
          }
        }
      }

      blocked.sort((a, b) => a[0] - b[0]);
      const merged = [];
      for (const iv of blocked) {
        if (!merged.length || iv[0] > merged[merged.length - 1][1]) {
          merged.push([iv[0], iv[1]]);
        } else {
          merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], iv[1]);
        }
      }

      const openings = [];
      let cursor = -spanLimit;
      for (const [bStart, bEnd] of merged) {
        const s = Math.max(-spanLimit, cursor);
        const e = Math.min(spanLimit, bStart);
        if (e - s >= 18) openings.push({ start: Math.round(s), end: Math.round(e) });
        cursor = Math.max(cursor, bEnd);
      }
      if (spanLimit - cursor >= 18) {
        openings.push({ start: Math.round(cursor), end: spanLimit });
      }
      return openings;
    }

    async function loadConfig() {
      try {
        const res = await fetch('/api/campaign-config');
        const data = await res.json();
        if (!Array.isArray(data.levels) || data.levels.length === 0) {
          throw new Error('Invalid campaign config payload');
        }
        levels = data.levels;
        currentLevelIdx = 0;
        selected = null;
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
          headers: {
            'Content-Type': 'application/json',
            'x-admin-token': ADMIN_TOKEN,
          },
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
      if (!confirm('Reset all campaign levels back to the built-in 2-level defaults?')) return;
      try {
        const res = await fetch('/api/campaign-config/reset', {
          method: 'POST',
          headers: { 'x-admin-token': ADMIN_TOKEN },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Reset failed');
        levels = data.levels;
        currentLevelIdx = 0;
        selected = null;
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
        description: 'Custom structured gate path',
        spawn: { x: 0, y: 340 },
        clearBonusPoints: 500,
        parTimeSeconds: 25,
        checkpoints: [
          { id: 'cp-' + nextNum + '-1', order: 1, axis: 'horizontal', coord: -40, start: 50, end: 225, points: 200, label: 'GATE 1' },
          { id: 'cp-' + nextNum + '-2', order: 2, axis: 'horizontal', coord: -360, start: -140, end: 140, points: 300, label: 'FINISH' },
        ],
        obstacles: [
          { id: 'obs-' + nextNum + '-1', type: 'rectangle', x: -85, y: -40, width: 270, height: 20, rotation: 0, rotationSpeed: 0, patrolAxis: 'none', patrolRange: 0, patrolSpeed: 0, color: '#ff2a6d' },
        ],
      });
      currentLevelIdx = levels.length - 1;
      selected = null;
      renderAll();
    }

    function deleteCurrentLevel() {
      if (levels.length <= 1) {
        showBanner('At least 1 campaign level must remain.', true);
        return;
      }
      if (!confirm('Delete ' + curLevel().name + '?')) return;
      levels.splice(currentLevelIdx, 1);
      levels.forEach((lvl, idx) => { lvl.levelNumber = idx + 1; });
      currentLevelIdx = Math.max(0, currentLevelIdx - 1);
      selected = null;
      renderAll();
    }

    function updateLevelMeta(field, val) {
      const lvl = curLevel();
      if (!lvl) return;
      lvl[field] = val;
      if (field === 'name') renderTabs();
    }

    function updateSpawn(axis, val) {
      const lvl = curLevel();
      if (!lvl) return;
      lvl.spawn[axis] = val;
      drawCanvas();
    }

    function addQuickGate() {
      const lvl = curLevel();
      if (!lvl) return;
      const ord = nextGateOrder(lvl);
      lvl.checkpoints.push({
        id: 'cp-' + Date.now(),
        order: ord,
        axis: 'horizontal',
        coord: Math.max(-360, 260 - ord * 110),
        start: -100,
        end: 100,
        points: 200,
        label: 'GATE ' + ord,
      });
      selected = { kind: 'checkpoint', index: lvl.checkpoints.length - 1 };
      renderAll();
    }

    function makeObstacleSpec(tool, x, y) {
      const isOrb = tool === 'orb';
      const isSpinner = tool === 'spinner';
      return {
        id: 'obs-' + Date.now(),
        type: isOrb ? 'circle' : 'rectangle',
        x,
        y,
        width: isOrb ? 36 : isSpinner ? 180 : 220,
        height: isOrb ? 36 : isSpinner ? 16 : 20,
        radius: isOrb ? 18 : undefined,
        rotation: 0,
        rotationSpeed: isSpinner ? 1.4 : 0,
        patrolAxis: 'none',
        patrolRange: 0,
        patrolSpeed: 0,
        color: isSpinner ? '#f59e0b' : isOrb ? '#a855f7' : '#ff2a6d',
      };
    }

    function addQuickObstacle(tool) {
      const lvl = curLevel();
      if (!lvl) return;
      lvl.obstacles.push(makeObstacleSpec(tool, 0, 0));
      selected = { kind: 'obstacle', index: lvl.obstacles.length - 1 };
      renderAll();
    }

    function renderAll() {
      renderTabs();
      renderMeta();
      renderLists();
      renderInspector();
      drawCanvas();
    }

    function renderTabs() {
      const container = document.getElementById('levelTabs');
      container.innerHTML = '';
      levels.forEach((lvl, idx) => {
        const btn = document.createElement('button');
        btn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition border ' +
          (idx === currentLevelIdx
            ? 'bg-cyan-500 text-black border-cyan-400'
            : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-cyan-500/50');
        btn.textContent = 'L' + (idx + 1) + ': ' + lvl.name;
        btn.onclick = () => {
          currentLevelIdx = idx;
          selected = null;
          renderAll();
        };
        container.appendChild(btn);
      });
    }

    function renderMeta() {
      const lvl = curLevel();
      if (!lvl) return;
      document.getElementById('metaName').value = lvl.name || '';
      document.getElementById('metaDesc').value = lvl.description || '';
      document.getElementById('metaClearBonus').value = lvl.clearBonusPoints ?? 500;
      document.getElementById('metaParTime').value = lvl.parTimeSeconds ?? 25;
      document.getElementById('metaSpawnX').value = lvl.spawn.x;
      document.getElementById('metaSpawnY').value = lvl.spawn.y;
    }

    function renderLists() {
      const lvl = curLevel();
      if (!lvl) return;

      const cpList = document.getElementById('checkpointList');
      cpList.innerHTML = '';
      lvl.checkpoints
        .map((cp, idx) => ({ cp, idx }))
        .sort((a, b) => a.cp.order - b.cp.order)
        .forEach(({ cp, idx }) => {
          const isSel = selected && selected.kind === 'checkpoint' && selected.index === idx;
          const row = document.createElement('div');
          row.className = 'flex items-center justify-between px-2 py-1.5 rounded text-xs cursor-pointer border ' +
            (isSel ? 'bg-emerald-950/60 border-emerald-400 text-emerald-200' : 'bg-slate-900/80 border-slate-800 hover:border-slate-600');
          const axLabel = cp.axis === 'vertical' ? 'V@X=' + cp.coord : 'H@Y=' + cp.coord;
          row.innerHTML = '<span><strong class="text-emerald-300">#' + cp.order + '</strong> ' + (cp.label || 'GATE') + ' <span class="text-slate-400 font-mono">(' + axLabel + ')</span></span><span class="text-emerald-400 font-mono">+' + cp.points + '</span>';
          row.onclick = () => { selected = { kind: 'checkpoint', index: idx }; renderAll(); };
          cpList.appendChild(row);
        });

      const obsList = document.getElementById('obstacleList');
      obsList.innerHTML = '';
      lvl.obstacles.forEach((obs, idx) => {
        const isSel = selected && selected.kind === 'obstacle' && selected.index === idx;
        const row = document.createElement('div');
        row.className = 'flex items-center justify-between px-2 py-1.5 rounded text-xs cursor-pointer border ' +
          (isSel ? 'bg-rose-950/60 border-rose-400 text-rose-200' : 'bg-slate-900/80 border-slate-800 hover:border-slate-600');
        const label = obs.type === 'circle' ? 'ORB' : (obs.rotationSpeed ? 'SPINNER' : 'WALL');
        row.innerHTML = '<span class="uppercase font-mono">' + label + '</span><span class="text-slate-400">(' + Math.round(obs.x) + ',' + Math.round(obs.y) + ')</span>';
        row.onclick = () => { selected = { kind: 'obstacle', index: idx }; renderAll(); };
        obsList.appendChild(row);
      });
    }

    function renderInspector() {
      const titleEl = document.getElementById('inspectorTitle');
      const actionsEl = document.getElementById('inspectorActions');
      const bodyEl = document.getElementById('inspectorBody');
      actionsEl.innerHTML = '';
      const lvl = curLevel();

      if (!lvl || !selected) {
        titleEl.textContent = 'Inspector (Nothing Selected)';
        bodyEl.innerHTML = 'Click a checkpoint gate or obstacle on the canvas (or in the lists below) to edit its properties.';
        return;
      }

      if (selected.kind === 'checkpoint') {
        const cp = lvl.checkpoints[selected.index];
        if (!cp) return;
        titleEl.textContent = 'Checkpoint Gate #' + cp.order;

        const btnDel = makeActionBtn('Delete', () => {
          lvl.checkpoints.splice(selected.index, 1);
          selected = null;
          renderAll();
        }, true);
        actionsEl.append(btnDel);

        bodyEl.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-2 gap-2';

        const axDiv = document.createElement('div');
        axDiv.innerHTML = '<label class="block text-[11px] text-slate-400 mb-1">Axis</label>';
        const axSel = document.createElement('select');
        axSel.className = 'input-dark';
        ['horizontal', 'vertical'].forEach((ax) => {
          const o = document.createElement('option');
          o.value = ax;
          o.textContent = ax;
          o.selected = cp.axis === ax;
          axSel.appendChild(o);
        });
        axSel.onchange = () => { cp.axis = axSel.value; renderLists(); drawCanvas(); };
        axDiv.appendChild(axSel);

        grid.append(
          makeField('Gate Number (Order)', 'number', cp.order, (v) => { cp.order = Math.max(1, Math.round(Number(v))); renderLists(); drawCanvas(); }),
          makeField('Label', 'text', cp.label || '', (v) => { cp.label = v; renderLists(); drawCanvas(); }),
          axDiv,
          makeField('Points', 'number', cp.points, (v) => { cp.points = Number(v); renderLists(); }),
          makeField(cp.axis === 'horizontal' ? 'Y Coord (-400..400)' : 'X Coord (-225..225)', 'number', cp.coord, (v) => { cp.coord = Number(v); renderLists(); drawCanvas(); }),
          makeField('Span Start', 'number', cp.start, (v) => { cp.start = Number(v); drawCanvas(); }),
          makeField('Span End', 'number', cp.end, (v) => { cp.end = Number(v); drawCanvas(); })
        );
        bodyEl.appendChild(grid);
        return;
      }

      if (selected.kind === 'obstacle') {
        const obs = lvl.obstacles[selected.index];
        if (!obs) return;
        titleEl.textContent = 'Obstacle: ' + obs.type.toUpperCase();

        const btnDup = makeActionBtn('Duplicate', () => {
          const clone = JSON.parse(JSON.stringify(obs));
          clone.id = 'obs-' + Date.now();
          clone.x = Math.min(HALF_W - 20, clone.x + 20);
          clone.y = Math.min(HALF_H - 20, clone.y + 20);
          lvl.obstacles.push(clone);
          selected = { kind: 'obstacle', index: lvl.obstacles.length - 1 };
          renderAll();
        });
        const btnDel = makeActionBtn('Delete', () => {
          lvl.obstacles.splice(selected.index, 1);
          selected = null;
          renderAll();
        }, true);
        actionsEl.append(btnDup, btnDel);

        bodyEl.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-2 gap-2';

        const typeSelect = document.createElement('div');
        typeSelect.innerHTML = '<label class="block text-[11px] text-slate-400 mb-1">Shape Type</label>';
        const sel = document.createElement('select');
        sel.className = 'input-dark';
        ['rectangle', 'circle'].forEach((t) => {
          const o = document.createElement('option');
          o.value = t;
          o.textContent = t;
          o.selected = obs.type === t;
          sel.appendChild(o);
        });
        sel.onchange = () => {
          obs.type = sel.value;
          if (obs.type === 'circle' && !obs.radius) obs.radius = 20;
          if (obs.type === 'rectangle' && !obs.width) { obs.width = 180; obs.height = 20; }
          renderAll();
        };
        typeSelect.appendChild(sel);
        grid.appendChild(typeSelect);

        grid.appendChild(makeField('Color', 'color', obs.color || '#ff2a6d', (v) => { obs.color = v; drawCanvas(); }));
        grid.appendChild(makeField('X (-225..225)', 'number', obs.x, (v) => { obs.x = Number(v); drawCanvas(); }));
        grid.appendChild(makeField('Y (-400..400)', 'number', obs.y, (v) => { obs.y = Number(v); drawCanvas(); }));

        if (obs.type === 'circle') {
          grid.appendChild(makeField('Radius', 'number', obs.radius ?? 20, (v) => { obs.radius = Math.max(6, Number(v)); drawCanvas(); }));
        } else {
          grid.appendChild(makeField('Width', 'number', obs.width ?? 180, (v) => { obs.width = Math.max(10, Number(v)); drawCanvas(); }));
          grid.appendChild(makeField('Height', 'number', obs.height ?? 20, (v) => { obs.height = Math.max(8, Number(v)); drawCanvas(); }));
          grid.appendChild(makeField('Rotation (rad)', 'number', obs.rotation ?? 0, (v) => { obs.rotation = Number(v); drawCanvas(); }, '0.1'));
          grid.appendChild(makeField('Rot Speed (rad/s)', 'number', obs.rotationSpeed ?? 0, (v) => { obs.rotationSpeed = Number(v); drawCanvas(); }, '0.1'));
        }

        const patrolDiv = document.createElement('div');
        patrolDiv.innerHTML = '<label class="block text-[11px] text-slate-400 mb-1">Patrol Axis</label>';
        const pSel = document.createElement('select');
        pSel.className = 'input-dark';
        ['none', 'x', 'y'].forEach((ax) => {
          const o = document.createElement('option');
          o.value = ax;
          o.textContent = ax;
          o.selected = (obs.patrolAxis || 'none') === ax;
          pSel.appendChild(o);
        });
        pSel.onchange = () => { obs.patrolAxis = pSel.value; drawCanvas(); };
        patrolDiv.appendChild(pSel);
        grid.appendChild(patrolDiv);

        grid.appendChild(makeField('Patrol Range (px)', 'number', obs.patrolRange ?? 0, (v) => { obs.patrolRange = Number(v); drawCanvas(); }));
        grid.appendChild(makeField('Patrol Speed (rad/s)', 'number', obs.patrolSpeed ?? 0, (v) => { obs.patrolSpeed = Number(v); drawCanvas(); }, '0.2'));

        bodyEl.appendChild(grid);
      }
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
      inp.type = type;
      inp.className = 'input-dark';
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

      // Center-aligned 50px grid
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
      ctx.lineWidth = 1;
      for (let x = -200; x <= 200; x += 50) {
        ctx.beginPath(); ctx.moveTo(x, -HALF_H); ctx.lineTo(x, HALF_H); ctx.stroke();
      }
      for (let y = -350; y <= 350; y += 50) {
        ctx.beginPath(); ctx.moveTo(-HALF_W, y); ctx.lineTo(HALF_W, y); ctx.stroke();
      }

      const lvl = curLevel();
      if (!lvl) {
        ctx.restore();
        return;
      }

      // Structured numbered path lines: Spawn -> Gate #1 -> Gate #2 ...
      const ordered = [...lvl.checkpoints].sort((a, b) => a.order - b.order);
      ctx.save();
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.35)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(lvl.spawn.x, lvl.spawn.y);
      ordered.forEach((cp) => {
        const m = gateMidpoint(cp);
        ctx.lineTo(m.x, m.y);
      });
      ctx.stroke();
      ctx.restore();

      // Patrol range preview lines
      lvl.obstacles.forEach((obs) => {
        if (obs.patrolAxis && obs.patrolAxis !== 'none' && obs.patrolRange > 0) {
          ctx.save();
          ctx.strokeStyle = 'rgba(250, 204, 21, 0.35)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          if (obs.patrolAxis === 'x') {
            ctx.moveTo(obs.x - obs.patrolRange, obs.y);
            ctx.lineTo(obs.x + obs.patrolRange, obs.y);
          } else {
            ctx.moveTo(obs.x, obs.y - obs.patrolRange);
            ctx.lineTo(obs.x, obs.y + obs.patrolRange);
          }
          ctx.stroke();
          ctx.restore();
        }
      });

      // Obstacles
      lvl.obstacles.forEach((obs, idx) => {
        const isSel = selected && selected.kind === 'obstacle' && selected.index === idx;
        ctx.save();
        ctx.translate(obs.x, obs.y);
        if (obs.rotation) ctx.rotate(obs.rotation);
        ctx.fillStyle = obs.color || '#ff2a6d';
        ctx.shadowColor = obs.color || '#ff2a6d';
        ctx.shadowBlur = isSel ? 16 : 8;

        if (obs.type === 'circle') {
          const r = obs.radius || 20;
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fill();
          if (isSel) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        } else {
          const w = obs.width || 180;
          const h = obs.height || 20;
          ctx.fillRect(-w / 2, -h / 2, w, h);
          if (isSel) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.strokeRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4);
          }
        }
        ctx.restore();
      });

      // Checkpoint Gates
      lvl.checkpoints.forEach((cp, idx) => {
        const isSel = selected && selected.kind === 'checkpoint' && selected.index === idx;
        const x1 = cp.axis === 'horizontal' ? cp.start : cp.coord;
        const y1 = cp.axis === 'horizontal' ? cp.coord : cp.start;
        const x2 = cp.axis === 'horizontal' ? cp.end : cp.coord;
        const y2 = cp.axis === 'horizontal' ? cp.coord : cp.end;
        const mid = gateMidpoint(cp);

        ctx.save();
        ctx.strokeStyle = isSel ? '#ffffff' : '#34d399';
        ctx.shadowColor = '#10b981';
        ctx.shadowBlur = isSel ? 16 : 10;
        ctx.lineWidth = isSel ? 5 : 4;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        // End-posts
        ctx.fillStyle = isSel ? '#ffffff' : '#6ee7b7';
        ctx.beginPath(); ctx.arc(x1, y1, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x2, y2, 4, 0, Math.PI * 2); ctx.fill();

        // Gate Number badge
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(mid.x, mid.y, 12, 0, Math.PI * 2);
        ctx.fillStyle = '#064e3b';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = isSel ? '#ffffff' : '#34d399';
        ctx.stroke();

        ctx.fillStyle = '#ecfdf5';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(cp.order), mid.x, mid.y);
        ctx.restore();
      });

      // Live Gate Scan-Line Preview
      if ((activeTool === 'gate-h' || activeTool === 'gate-v') && hoverPointer) {
        const axis = activeTool === 'gate-h' ? 'horizontal' : 'vertical';
        const scanCoord = snap(axis === 'horizontal' ? hoverPointer.y : hoverPointer.x);
        const perpVal = axis === 'horizontal' ? hoverPointer.x : hoverPointer.y;
        const openings = computeLineOpenings(lvl, axis, scanCoord);

        ctx.save();
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.25)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        if (axis === 'horizontal') {
          ctx.moveTo(-HALF_W, scanCoord);
          ctx.lineTo(HALF_W, scanCoord);
        } else {
          ctx.moveTo(scanCoord, -HALF_H);
          ctx.lineTo(scanCoord, HALF_H);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        openings.forEach((op) => {
          const hovered = perpVal >= op.start && perpVal <= op.end;
          ctx.strokeStyle = hovered ? '#a7f3d0' : 'rgba(52, 211, 153, 0.5)';
          ctx.lineWidth = hovered ? 6 : 3;
          ctx.beginPath();
          if (axis === 'horizontal') {
            ctx.moveTo(op.start, scanCoord);
            ctx.lineTo(op.end, scanCoord);
          } else {
            ctx.moveTo(scanCoord, op.start);
            ctx.lineTo(scanCoord, op.end);
          }
          ctx.stroke();
        });
        ctx.restore();
      }

      // Spawn + 13px ball clearance ring
      ctx.save();
      ctx.beginPath();
      ctx.arc(lvl.spawn.x, lvl.spawn.y, PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(34, 211, 238, 0.35)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#22d3ee';
      ctx.stroke();
      ctx.fillStyle = '#cffafe';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SPAWN', lvl.spawn.x, lvl.spawn.y - 18);
      ctx.restore();

      ctx.restore();
    }

    function getCanvasCoords(evt) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = ARENA_W / rect.width;
      const scaleY = ARENA_H / rect.height;
      return {
        x: (evt.clientX - rect.left) * scaleX - HALF_W,
        y: (evt.clientY - rect.top) * scaleY - HALF_H,
      };
    }

    function distToSegment(px, py, x1, y1, x2, y2) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) return Math.hypot(px - x1, py - y1);
      const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
      return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    function hitTest(x, y) {
      const lvl = curLevel();
      if (!lvl) return null;

      if (Math.hypot(x - lvl.spawn.x, y - lvl.spawn.y) <= 18) {
        return { kind: 'spawn' };
      }
      for (let i = lvl.checkpoints.length - 1; i >= 0; i--) {
        const cp = lvl.checkpoints[i];
        const x1 = cp.axis === 'horizontal' ? cp.start : cp.coord;
        const y1 = cp.axis === 'horizontal' ? cp.coord : cp.start;
        const x2 = cp.axis === 'horizontal' ? cp.end : cp.coord;
        const y2 = cp.axis === 'horizontal' ? cp.coord : cp.end;
        if (distToSegment(x, y, x1, y1, x2, y2) <= 14) {
          return { kind: 'checkpoint', index: i };
        }
      }
      for (let i = lvl.obstacles.length - 1; i >= 0; i--) {
        const obs = lvl.obstacles[i];
        if (obs.type === 'circle') {
          if (Math.hypot(x - obs.x, y - obs.y) <= (obs.radius || 20) + 6) {
            return { kind: 'obstacle', index: i };
          }
        } else {
          const w = obs.width || 180;
          const h = obs.height || 20;
          const dx = x - obs.x;
          const dy = y - obs.y;
          const ang = -(obs.rotation || 0);
          const lx = dx * Math.cos(ang) - dy * Math.sin(ang);
          const ly = dx * Math.sin(ang) + dy * Math.cos(ang);
          if (Math.abs(lx) <= w / 2 + 6 && Math.abs(ly) <= h / 2 + 6) {
            return { kind: 'obstacle', index: i };
          }
        }
      }
      return null;
    }

    canvas.addEventListener('pointerdown', (e) => {
      const lvl = curLevel();
      if (!lvl) return;
      const { x, y } = getCanvasCoords(e);
      const sx = snap(x);
      const sy = snap(y);

      if (activeTool === 'spawn') {
        lvl.spawn.x = sx;
        lvl.spawn.y = sy;
        selected = { kind: 'spawn' };
        renderMeta();
        drawCanvas();
        return;
      }
      if (activeTool === 'gate-h' || activeTool === 'gate-v') {
        const axis = activeTool === 'gate-h' ? 'horizontal' : 'vertical';
        const scanCoord = axis === 'horizontal' ? sy : sx;
        const perpVal = axis === 'horizontal' ? x : y;
        const openings = computeLineOpenings(lvl, axis, scanCoord);
        const picked = openings.find((op) => perpVal >= op.start && perpVal <= op.end) || openings[0];
        if (!picked) {
          showBanner('No open gate segment detected on that line.', true);
          return;
        }
        const ord = nextGateOrder(lvl);
        lvl.checkpoints.push({
          id: 'cp-' + Date.now(),
          order: ord,
          axis,
          coord: scanCoord,
          start: picked.start,
          end: picked.end,
          points: 200,
          label: 'GATE ' + ord,
        });
        selected = { kind: 'checkpoint', index: lvl.checkpoints.length - 1 };
        setTool('select');
        renderAll();
        return;
      }
      if (activeTool === 'wall' || activeTool === 'spinner' || activeTool === 'orb') {
        lvl.obstacles.push(makeObstacleSpec(activeTool, sx, sy));
        selected = { kind: 'obstacle', index: lvl.obstacles.length - 1 };
        setTool('select');
        renderAll();
        return;
      }

      const hit = hitTest(x, y);
      selected = hit;
      if (hit) {
        if (hit.kind === 'spawn') {
          dragState = { kind: 'spawn', offsetX: lvl.spawn.x - x, offsetY: lvl.spawn.y - y };
        } else if (hit.kind === 'obstacle') {
          dragState = { kind: 'obstacle', index: hit.index, offsetX: lvl.obstacles[hit.index].x - x, offsetY: lvl.obstacles[hit.index].y - y };
        } else if (hit.kind === 'checkpoint') {
          const cp = lvl.checkpoints[hit.index];
          dragState = { kind: 'checkpoint', index: hit.index, offsetCoord: cp.coord - (cp.axis === 'horizontal' ? y : x) };
        }
      }
      renderLists();
      renderInspector();
      drawCanvas();
    });

    canvas.addEventListener('pointermove', (e) => {
      const { x, y } = getCanvasCoords(e);
      hoverPointer = { x, y };
      document.getElementById('cursorCoords').textContent = 'X: ' + Math.round(x) + ', Y: ' + Math.round(y);
      if (!dragState) {
        if (activeTool === 'gate-h' || activeTool === 'gate-v') drawCanvas();
        return;
      }
      const lvl = curLevel();
      if (!lvl) return;
      if (dragState.kind === 'spawn') {
        lvl.spawn.x = Math.max(-HALF_W, Math.min(HALF_W, snap(x + dragState.offsetX)));
        lvl.spawn.y = Math.max(-HALF_H, Math.min(HALF_H, snap(y + dragState.offsetY)));
        renderMeta();
      } else if (dragState.kind === 'checkpoint') {
        const cp = lvl.checkpoints[dragState.index];
        const limit = cp.axis === 'horizontal' ? HALF_H : HALF_W;
        const raw = (cp.axis === 'horizontal' ? y : x) + dragState.offsetCoord;
        cp.coord = Math.max(-limit, Math.min(limit, snap(raw)));
        renderInspector();
        renderLists();
      } else if (dragState.kind === 'obstacle') {
        lvl.obstacles[dragState.index].x = Math.max(-HALF_W, Math.min(HALF_W, snap(x + dragState.offsetX)));
        lvl.obstacles[dragState.index].y = Math.max(-HALF_H, Math.min(HALF_H, snap(y + dragState.offsetY)));
        renderInspector();
        renderLists();
      }
      drawCanvas();
    });

    canvas.addEventListener('pointerleave', () => {
      hoverPointer = null;
      if (activeTool === 'gate-h' || activeTool === 'gate-v') drawCanvas();
    });

    window.addEventListener('pointerup', () => {
      dragState = null;
    });

    loadConfig();
  </script>
</body>
</html>`;
}
