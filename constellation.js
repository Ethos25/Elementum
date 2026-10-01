// ═══════════════════════════════════════
// CONSTELLATION MAP — Journey Threads
// Renders colored thread paths connecting elements of completed Wonder Paths
// on the Dragon's Map (periodic table grid).
// ═══════════════════════════════════════

var THREAD_STYLES = {
  body:    { color: '#D06878', glow: 'rgba(208,104,120,0.4)' },
  shiny:   { color: '#C0B090', glow: 'rgba(192,176,144,0.4)' },
  kitchen: { color: '#D4884A', glow: 'rgba(212,136,74,0.4)' },
  boom:    { color: '#EF5350', glow: 'rgba(239,83,80,0.4)' },
  glow:    { color: '#7DF9FF', glow: 'rgba(125,249,255,0.4)' }
};

// ─── Position helpers ────────────────────────────────────────────────────────

// Sync SVG overlay position and size to exactly cover #dmapGrid.
// Returns true if successful, false if elements not found.
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

// Get center of an element cell relative to the SVG overlay's top-left corner.
// Since the SVG is synced to cover #dmapGrid, SVG coords === grid-relative coords.
function _cellCenter(atomicNum) {
  var grid = document.getElementById('dmapGrid');
  var svg  = document.getElementById('constellationSVG');
  if (!grid || !svg) return null;
  var cell = grid.querySelector('[data-num="' + atomicNum + '"]');
  if (!cell) return null;
  var cr = cell.getBoundingClientRect();
  var sr = svg.getBoundingClientRect();
  return {
    x: (cr.left - sr.left) + cr.width  / 2,
    y: (cr.top  - sr.top)  + cr.height / 2
  };
}

// Build SVG "d" path string connecting element centers in journey order.
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

// Count how many of the given path objects include a given atomic number.
function _intersectionCount(atomicNum, paths) {
  var n = 0;
  paths.forEach(function(p) { if (p.elements.indexOf(atomicNum) !== -1) n++; });
  return n;
}

// ─── SVG element factories ───────────────────────────────────────────────────

// Create an SVG <path> for a thread line.
// style param: 'wonder' | 'detective' | 'inventor'  (future-proofed)
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
    // 'wonder' default
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

// Create an SVG <circle> node dot at an element's position.
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

// ─── Render helpers ──────────────────────────────────────────────────────────

// Render one completed path (line + nodes) into the SVG, no animation.
function _renderStaticPath(svg, path, allCompletedPaths) {
  var ts = THREAD_STYLES[path.id];
  if (!ts) return;
  var d = _buildPath(path.elements);
  if (!d) return;
  svg.appendChild(_makePathEl(d, ts.color, ts.glow, path.id, 'wonder'));
  path.elements.forEach(function(num) {
    var pt = _cellCenter(num);
    if (!pt) return;
    var isX = _intersectionCount(num, allCompletedPaths) > 1;
    svg.appendChild(_makeNodeEl(pt.x, pt.y, ts.color, isX));
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

// Render all completed journey threads immediately (no animation).
// Called every time the Dragon's Map opens.
function renderPersistentThreads() {
  if (!_syncSVG()) return;
  var svg = document.getElementById('constellationSVG');
  svg.innerHTML = '';

  if (!state || !state.journeys || !state.journeys.completed) return;
  var completed = WONDER_PATHS.filter(function(p) {
    return state.journeys.completed.indexOf(p.id) !== -1;
  });
  if (completed.length === 0) return;

  // Lines first (below nodes)
  completed.forEach(function(path) {
    var ts = THREAD_STYLES[path.id]; if (!ts) return;
    var d = _buildPath(path.elements); if (!d) return;
    svg.appendChild(_makePathEl(d, ts.color, ts.glow, path.id, 'wonder'));
  });
  // Nodes on top
  completed.forEach(function(path) {
    var ts = THREAD_STYLES[path.id]; if (!ts) return;
    path.elements.forEach(function(num) {
      var pt = _cellCenter(num); if (!pt) return;
      var isX = _intersectionCount(num, completed) > 1;
      svg.appendChild(_makeNodeEl(pt.x, pt.y, ts.color, isX));
    });
  });
}

// Animate a newly-completed thread drawing itself across the Dragon's Map.
// Called once right after the map opens on journey completion.
// pathId:  the completed path's id string
// onDone:  callback fired when the animation finishes (~2s)
function animateNewThread(pathId, onDone) {
  if (!_syncSVG()) { if (onDone) onDone(); return; }

  var path = WONDER_PATHS.find(function(p) { return p.id === pathId; });
  if (!path) { if (onDone) onDone(); return; }
  var ts = THREAD_STYLES[pathId];
  if (!ts) { if (onDone) onDone(); return; }

  var svg = document.getElementById('constellationSVG');
  svg.innerHTML = '';

  // Render previously-completed threads statically (all except the new one)
  var prevCompleted = WONDER_PATHS.filter(function(p) {
    return state.journeys.completed.indexOf(p.id) !== -1 && p.id !== pathId;
  });
  // All paths that will eventually be on screen (for intersection calc)
  var allOnScreen = prevCompleted.concat([path]);

  prevCompleted.forEach(function(p) { _renderStaticPath(svg, p, allOnScreen); });

  // Build the new path
  var d = _buildPath(path.elements);
  if (!d) { if (onDone) onDone(); return; }

  // Line element — starts fully hidden via dashoffset
  var pathEl = _makePathEl(d, ts.color, ts.glow, pathId, 'wonder');
  svg.appendChild(pathEl);
  var totalLen = pathEl.getTotalLength();
  pathEl.style.strokeDasharray  = totalLen;
  pathEl.style.strokeDashoffset = totalLen;

  // Node elements — start hidden, will pop in as line reaches them
  var nEls = path.elements.length;
  var nodeItems = [];
  path.elements.forEach(function(num, idx) {
    var pt = _cellCenter(num); if (!pt) return;
    var isX = _intersectionCount(num, allOnScreen) > 1;
    var node = _makeNodeEl(pt.x, pt.y, ts.color, isX);
    node.setAttribute('opacity', '0');
    node.style.transformOrigin = pt.x.toFixed(1) + 'px ' + pt.y.toFixed(1) + 'px';
    node.style.transform = 'scale(0)';
    node.style.transition = 'transform 0.3s cubic-bezier(.34,1.56,.64,1), opacity 0.2s';
    svg.appendChild(node);
    nodeItems.push({ el: node, idx: idx, isX: isX });
  });

  // Kick off line draw animation
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      pathEl.style.transition = 'stroke-dashoffset 1.5s ease-out';
      pathEl.style.strokeDashoffset = '0';
    });
  });

  // Stagger node appearances: node i appears when the line reaches it
  // Line takes 1500ms total; node i fires at idx/(nEls-1) * 1400ms + 100ms head-start
  nodeItems.forEach(function(item) {
    var delay = nEls > 1
      ? 100 + (item.idx / (nEls - 1)) * 1400
      : 100;
    setTimeout(function() {
      item.el.setAttribute('opacity', item.isX ? '1' : '0.9');
      item.el.style.transform = 'scale(1)';
    }, delay);
  });

  // Play a gentle ascending tone sequence (reuses existing audio engine)
  if (typeof playTone === 'function') {
    playTone(440, 'sine', 0.07);
    setTimeout(function() { playTone(523, 'sine', 0.06); }, 250);
    setTimeout(function() { playTone(659, 'sine', 0.08); }, 600);
    setTimeout(function() { playTone(784, 'sine', 0.06); }, 1000);
  }

  // Fire done callback after animation completes
  setTimeout(function() { if (onDone) onDone(); }, 2000);
}
