// ═══════════════════════════════════════
// LOAD ORDER: journeys-data.js → elements-data.js → dragon.js → constellation.js
//
// PROVIDES (globals used by other files — all guarded with typeof checks in callers):
//   isConstellationActive()       — true if thread overlay is currently shown
//   enterConstellationMode(pathId)— draw journey thread for one Wonder Path
//   enterConstellationModeAll()   — draw all discovered journey threads
//   exitConstellationMode()       — hide and clean up thread overlay
//
// CONSUMES (from other files):
//   WONDER_PATHS   — journeys-data.js
//   isDisc()       — game.js  (which elements the child has found)
// ═══════════════════════════════════════
// CONSTELLATION MAP — Opt-in Journey Thread Overlay
// Threads are hidden by default. Revealed via the ✦ toggle button.
// ═══════════════════════════════════════

var THREAD_STYLES = {
  body:    { color: '#D06878', glow: 'rgba(208,104,120,0.4)',  glowStrong: 'rgba(208,104,120,0.7)' },
  shiny:   { color: '#C0B090', glow: 'rgba(192,176,144,0.4)', glowStrong: 'rgba(192,176,144,0.7)' },
  kitchen: { color: '#D4884A', glow: 'rgba(212,136,74,0.4)',  glowStrong: 'rgba(212,136,74,0.7)'  },
  boom:    { color: '#EF5350', glow: 'rgba(239,83,80,0.4)',   glowStrong: 'rgba(239,83,80,0.7)'   },
  glow:    { color: '#7DF9FF', glow: 'rgba(125,249,255,0.4)', glowStrong: 'rgba(125,249,255,0.7)' }
};

// ─── Mode state ──────────────────────────────────────────────────────────────
var _consActive  = false;
var _consPathId  = null;   // path id string, 'all', or null
var _exitTimer   = null;

function isConstellationActive() { return _consActive; }

// Called at the top of renderMap() to ensure clean state on each re-render
function _resetConstellationState() {
  if (_exitTimer) { clearTimeout(_exitTimer); _exitTimer = null; }
  _consActive = false;
  _consPathId = null;
  var svg = document.getElementById('constellationSVG');
  if (svg) { svg.innerHTML = ''; svg.style.opacity = ''; svg.style.transition = ''; }
}

// ─── SVG position helpers ────────────────────────────────────────────────────

// Sync the SVG overlay to exactly cover #dmapGrid
function _syncSVG() {
  var grid = document.getElementById('dmapGrid');
  var svg  = document.getElementById('constellationSVG');
  if (!grid || !svg) return false;
  var wrap     = svg.parentElement;
  var gridRect = grid.getBoundingClientRect();
  var wrapRect = wrap.getBoundingClientRect();
  svg.style.left   = (gridRect.left - wrapRect.left) + 'px';
  svg.style.top    = (gridRect.top  - wrapRect.top)  + 'px';
  svg.style.width  = gridRect.width  + 'px';
  svg.style.height = gridRect.height + 'px';
  return true;
}

// Anchor point for thread connections — top-left corner of cell with 5px inset.
// Keeps thread lines clear of the element symbol (center) and element number (top-center).
function _cellCenter(atomicNum) {
  var grid = document.getElementById('dmapGrid');
  var svg  = document.getElementById('constellationSVG');
  if (!grid || !svg) return null;
  var cell = grid.querySelector('[data-num="' + atomicNum + '"]');
  if (!cell) return null;
  var cr = cell.getBoundingClientRect();
  var sr = svg.getBoundingClientRect();
  return {
    x: (cr.left - sr.left) + 5,
    y: (cr.top  - sr.top)  + 5
  };
}

// SVG path d-string connecting element centers in journey order
function _buildPath(elements) {
  var pts = [];
  for (var i = 0; i < elements.length; i++) {
    var pt = _cellCenter(elements[i]);
    if (pt) pts.push(pt);
  }
  if (pts.length < 2) return '';
  var d = 'M ' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
  for (var j = 1; j < pts.length; j++) {
    d += ' L ' + pts[j].x.toFixed(1) + ' ' + pts[j].y.toFixed(1);
  }
  return d;
}

// How many of the given path objects include atomicNum
function _intersectionCount(atomicNum, paths) {
  var n = 0;
  paths.forEach(function(p) { if (p.elements.indexOf(atomicNum) !== -1) n++; });
  return n;
}

// ─── SVG element factories ───────────────────────────────────────────────────

// style: 'wonder' | 'detective' | 'inventor'
function _makePathEl(d, color, glowColor, pathId, threadStyle) {
  var el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  el.setAttribute('d', d);
  el.setAttribute('fill', 'none');
  el.setAttribute('stroke', color);
  el.setAttribute('stroke-linecap', 'round');
  el.setAttribute('stroke-linejoin', 'round');
  el.setAttribute('data-pathid', pathId);
  if (threadStyle === 'detective') {
    el.setAttribute('stroke-width', '3');
    el.setAttribute('stroke-dasharray', '8 4');
  } else if (threadStyle === 'inventor') {
    el.setAttribute('stroke-width', '4');
  } else {
    el.setAttribute('stroke-width', '2');
  }
  el.setAttribute('opacity', '0.7');
  if (pathId === 'glow') {
    el.style.filter = 'drop-shadow(0 0 6px #7DF9FF) drop-shadow(0 0 12px rgba(125,249,255,0.3))';
  } else {
    el.style.filter = 'drop-shadow(0 0 4px ' + glowColor + ')';
  }
  return el;
}

function _makeNodeEl(x, y, color, isIntersection) {
  var el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  el.setAttribute('cx', x.toFixed(1));
  el.setAttribute('cy', y.toFixed(1));
  el.setAttribute('r',  isIntersection ? '6' : '4');
  el.setAttribute('fill', color);
  el.setAttribute('opacity', isIntersection ? '1' : '0.9');
  el.classList.add('ct-node');
  if (isIntersection) {
    el.classList.add('ct-intersection');
    el.style.filter = 'drop-shadow(0 0 6px rgba(240,242,248,0.6))';
  }
  return el;
}

// ─── Cell helpers ────────────────────────────────────────────────────────────

// Fade non-journey cells to 15% opacity (400ms), keep journey cells at full
function _dimCells(keepNums) {
  var grid = document.getElementById('dmapGrid');
  if (!grid) return;
  grid.querySelectorAll('.dm-cell').forEach(function(cell) {
    cell.style.transition = 'opacity .4s ease, box-shadow .4s ease';
    var num = parseInt(cell.dataset.num);
    if (keepNums.indexOf(num) === -1) {
      cell.style.opacity = '0.15';
    }
  });
}

// Apply glow box-shadow to a single element cell
function _glowCell(num, glowColor) {
  var grid = document.getElementById('dmapGrid');
  if (!grid) return;
  var cell = grid.querySelector('[data-num="' + num + '"]');
  if (!cell) return;
  cell.style.transition = 'opacity .4s ease, box-shadow .4s ease';
  cell.style.opacity    = '1';
  cell.style.boxShadow  = '0 0 8px 2px ' + glowColor;
}

// Restore all cells to their natural opacity and remove glow
function _restoreCells() {
  var grid = document.getElementById('dmapGrid');
  if (!grid) return;
  grid.querySelectorAll('.dm-cell').forEach(function(cell) {
    cell.style.transition = 'opacity .4s ease, box-shadow .4s ease';
    cell.style.opacity    = '';
    cell.style.boxShadow  = '';
  });
}

// ─── Title bar ───────────────────────────────────────────────────────────────

function _showConstellationTitle(text, color) {
  var el = document.getElementById('dmConstellationTitle');
  if (!el) return;
  el.textContent = text;
  el.style.color = color;
  el.classList.add('active');
}

function _hideConstellationTitle() {
  var el = document.getElementById('dmConstellationTitle');
  if (el) el.classList.remove('active');
}

// ─── Animated thread draw ────────────────────────────────────────────────────
// Appends to the SVG (does not clear it). startDelay in ms for staggered "show all".

function _drawThreadAnimated(path, allForIntersection, startDelay, onDone) {
  var ts  = THREAD_STYLES[path.id]; if (!ts) return;
  var svg = document.getElementById('constellationSVG'); if (!svg) return;

  var d = _buildPath(path.elements);
  if (!d) { if (onDone) setTimeout(onDone, startDelay || 0); return; }

  // Create path and nodes, initially hidden
  var pathEl = _makePathEl(d, ts.color, ts.glow, path.id, 'wonder');
  pathEl.style.opacity = '0';
  svg.appendChild(pathEl);

  var nEls      = path.elements.length;
  var nodeItems = [];
  path.elements.forEach(function(num, idx) {
    var pt = _cellCenter(num); if (!pt) return;
    var isX = _intersectionCount(num, allForIntersection) > 1;
    var node = _makeNodeEl(pt.x, pt.y, ts.color, isX);
    node.setAttribute('opacity', '0');
    node.style.transformOrigin = pt.x.toFixed(1) + 'px ' + pt.y.toFixed(1) + 'px';
    node.style.transform = 'scale(0)';
    node.style.transition = 'transform 0.3s cubic-bezier(.34,1.56,.64,1), opacity 0.2s';
    svg.appendChild(node);
    nodeItems.push({ el: node, idx: idx, isX: isX });
  });

  setTimeout(function() {
    // Reveal and animate line
    pathEl.style.opacity = '0.7';
    var totalLen = pathEl.getTotalLength();
    pathEl.style.strokeDasharray  = totalLen;
    pathEl.style.strokeDashoffset = totalLen;

    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        pathEl.style.transition = 'stroke-dashoffset 1.5s ease-out';
        pathEl.style.strokeDashoffset = '0';
      });
    });

    // Stagger node pop-ins as the line reaches each element
    nodeItems.forEach(function(item) {
      var delay = nEls > 1 ? 100 + (item.idx / (nEls - 1)) * 1400 : 100;
      setTimeout(function() {
        item.el.setAttribute('opacity', item.isX ? '1' : '0.9');
        item.el.style.transform = 'scale(1)';
      }, delay);
    });

    if (onDone) setTimeout(onDone, 1600);
  }, startDelay || 0);
}

// ─── Public API ──────────────────────────────────────────────────────────────

// Reveal a single Wonder Path thread with dimmed background + dragon speech.
function enterConstellationMode(pathId) {
  var path = WONDER_PATHS.find(function(p) { return p.id === pathId; });
  if (!path) return;
  var ts = THREAD_STYLES[pathId]; if (!ts) return;

  if (_exitTimer) { clearTimeout(_exitTimer); _exitTimer = null; }
  _consActive = true;
  _consPathId = pathId;

  // Button active state
  var btn = document.getElementById('dmConstellationBtn');
  if (btn) btn.classList.add('active');

  // Dim + glow
  _dimCells(path.elements);
  path.elements.forEach(function(num) { _glowCell(num, ts.glowStrong); });

  _showConstellationTitle(path.emoji + ' ' + path.title, ts.color);

  // Clear SVG and draw
  var svg = document.getElementById('constellationSVG');
  if (svg) svg.innerHTML = '';
  if (!_syncSVG()) return;

  _drawThreadAnimated(path, [path], 0, function() {
    var sp = document.getElementById('mspText');
    if (sp) sp.textContent = '🐉 Eternatus: "' + path.dragonLine + '"';
    if (typeof triggerExcited === 'function') triggerExcited();
  });

  if (typeof playTone === 'function') {
    playTone(440, 'sine', 0.07);
    setTimeout(function() { playTone(523, 'sine', 0.06); }, 250);
    setTimeout(function() { playTone(659, 'sine', 0.08); }, 600);
    setTimeout(function() { playTone(784, 'sine', 0.06); }, 1000);
  }
}

// Reveal all completed Wonder Path threads with 300ms stagger.
function enterConstellationModeAll() {
  var completed = WONDER_PATHS.filter(function(p) {
    return state.journeys && state.journeys.completed &&
           state.journeys.completed.indexOf(p.id) !== -1;
  });
  if (completed.length === 0) return;

  if (_exitTimer) { clearTimeout(_exitTimer); _exitTimer = null; }
  _consActive = true;
  _consPathId = 'all';

  var btn = document.getElementById('dmConstellationBtn');
  if (btn) btn.classList.add('active');

  // Collect every element that belongs to any completed path
  var allJourneyEls = [];
  completed.forEach(function(p) {
    p.elements.forEach(function(n) { if (allJourneyEls.indexOf(n) === -1) allJourneyEls.push(n); });
  });

  _dimCells(allJourneyEls);

  // Glow each element: intersection elements get white glow
  completed.forEach(function(p) {
    var ts = THREAD_STYLES[p.id]; if (!ts) return;
    p.elements.forEach(function(num) {
      var isX = _intersectionCount(num, completed) > 1;
      _glowCell(num, isX ? 'rgba(240,242,248,0.7)' : ts.glowStrong);
    });
  });

  _showConstellationTitle('✨ All Wonder Paths', 'var(--cyan)');

  var svg = document.getElementById('constellationSVG');
  if (svg) svg.innerHTML = '';
  if (!_syncSVG()) return;

  // Stagger each thread 300ms after the previous
  completed.forEach(function(path, idx) {
    _drawThreadAnimated(path, completed, idx * 300, null);
  });

  if (typeof playTone === 'function') {
    playTone(440, 'sine', 0.07);
    setTimeout(function() { playTone(523, 'sine', 0.06); }, 250);
    setTimeout(function() { playTone(659, 'sine', 0.08); }, 600);
  }
}

// Fade out all threads and restore the map to its clean default state.
function exitConstellationMode() {
  if (!_consActive) return;
  _consActive = false;
  _consPathId = null;

  if (_exitTimer) clearTimeout(_exitTimer);

  var svg = document.getElementById('constellationSVG');
  if (svg) {
    svg.style.transition = 'opacity 0.4s';
    svg.style.opacity    = '0';
    _exitTimer = setTimeout(function() {
      if (svg) { svg.innerHTML = ''; svg.style.opacity = ''; svg.style.transition = ''; }
      _exitTimer = null;
    }, 400);
  }

  _restoreCells();
  _hideConstellationTitle();

  var btn = document.getElementById('dmConstellationBtn');
  if (btn) btn.classList.remove('active');
}
