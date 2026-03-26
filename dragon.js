// ═══════════════════════════════════════════════════════════════
// ETERNATUS DRAGON ANIMATION ENGINE  v3.0
// Idle personality · Eye tracking · Tap reactions
// Discovery evolution · Breathing · Contextual emotion
// Sleep behavioral inference · Tier ceremonies · Rare backflip
// Element 118 cinematic · Accessibility (prefers-reduced-motion)
// ─────────────────────────────────────────────────────────────
// FIX 1: Particle pool (max 30) + IntersectionObserver pause/resume
// FIX 2: Tier-1 opacity floor raised to 0.80
// FIX 3: Full .mbar tap zone (44 px min) triggers reactions
// NEW:   All v3 upgrades per spec
// ═══════════════════════════════════════════════════════════════

// ── Internal state ───────────────────────────────────────────────
var DS = {
  tier:             1,
  sleeping:         false,
  busy:             false,
  visible:          true,    // controlled by IntersectionObserver
  idleTimer:        null,
  sleepCheckInterval: null,  // replaces single sleepTimer
  breathRAF:        null,
  zInterval:        null,
  t5Interval:       null,
  idleResumeTimer:  null,
  lastReaction:     -1,
  initialized:      false,
  extraOrbits:      [],
  // v3 sleep tracking
  lastTapTime:      Date.now(),
  lastScrollTime:   Date.now(),
  lastTabTime:      Date.now(),
  wakeInputCount:   0,
  wakeInputTimer:   null,
  // v3 tap memory
  totalTaps:        0,
  tapTimes:         [],
  tapVelocity:      'gentle',
  // v3 modal eye tracking
  lastTouch:        null,
  // v3 tier vanity intervals
  vanityInterval:   null,
  tier4Interval:    null,
  // v3 misc
  reducedMotion:    false,
  // Fix 3: first sleep interaction always gentle
  hasWokenOnce:     false
};

// ── Particle pool (hard cap = 30) ────────────────────────────────
var DG_POOL       = [];
var DG_MAX_PARTS  = 30;

/** Create a particle, recycling the oldest if the pool is full. */
function dgPooled(cssText, lifetime) {
  if (DG_POOL.length >= DG_MAX_PARTS) {
    var oldest = DG_POOL.shift();
    try { oldest.remove(); } catch(e) {}
  }
  var p = document.createElement('div');
  p.style.cssText = cssText;
  document.body.appendChild(p);
  DG_POOL.push(p);
  setTimeout(function() {
    var idx = DG_POOL.indexOf(p);
    if (idx !== -1) DG_POOL.splice(idx, 1);
    try { p.remove(); } catch(e) {}
  }, lifetime);
  return p;
}

// Pupil home positions in SVG viewBox (200 × 160) coordinate space
var DG_PL = { cx: 87, cy: 31.5, ex: 86, ey: 32 };  // left eye
var DG_PR = { cx: 98, cy: 31.5, ex: 97, ey: 32 };  // right eye
var DG_MAX_OFF = 2.4;   // max pupil travel in SVG units

// ── Initialise ──────────────────────────────────────────────────
function initDragon() {
  if (DS.initialized) return;
  DS.initialized = true;

  DS.reducedMotion  = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Fix 3: persist across sessions
  DS.hasWokenOnce   = (localStorage.getItem('dg_woken') === '1');

  DS.svg     = document.querySelector('#mbar .dragon-hero');
  DS.mbar    = document.getElementById('mbar');
  DS.wingL   = document.getElementById('dg-wing-l');
  DS.wingR   = document.getElementById('dg-wing-r');
  DS.body    = document.getElementById('dg-body');
  DS.eyeL    = document.getElementById('dg-eye-l');
  DS.eyeR    = document.getElementById('dg-eye-r');
  DS.pupilL  = document.getElementById('dg-pupil-l');
  DS.pupilR  = document.getElementById('dg-pupil-r');
  DS.gemRing = document.getElementById('dg-gem-ring');
  DS.gemCore = document.getElementById('dg-gem-core');

  if (!DS.svg || !DS.mbar) return;

  // SVG transform origin for Web Animations API
  DS.svg.style.transformOrigin = '50% 50%';
  DS.svg.style.transformBox    = 'fill-box';

  // ── FIX 3: full .mbar is the tap zone (min-height 44px) ─────
  DS.mbar.style.cursor    = 'pointer';
  DS.mbar.style.minHeight = '44px';

  // Click: fire dgTapped unless pointer is inside the buddy badge
  DS.mbar.addEventListener('click', function(e) {
    if (e.target.closest && e.target.closest('#buddyWrap')) return;
    dgTapped();
  });
  // Touch: same guard, stop propagation so mbar doesn't bubble to doc
  DS.mbar.addEventListener('touchstart', function(e) {
    if (e.target.closest && e.target.closest('#buddyWrap')) return;
    e.stopPropagation();
    dgTapped();
  }, { passive: true });

  // Eye tracking — full-screen pointer, checked against DS.visible flag
  document.addEventListener('mousemove', dgPointerMove);
  document.addEventListener('touchmove', function(e) {
    if (e.touches[0]) dgPointerMove(e.touches[0]);
  }, { passive: true });

  // Touch start for eye tracking on touch devices
  document.addEventListener('touchstart', function(e) {
    if (e.touches[0]) {
      DS.lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }, { passive: true });

  // Activity tracking for sleep — v3: three separate timestamps
  document.addEventListener('mousemove',  dgMarkActivity, { passive: true });
  document.addEventListener('click',      dgMarkActivity, { passive: true });
  document.addEventListener('touchstart', dgMarkActivity, { passive: true });
  document.addEventListener('keydown',    dgMarkActivity, { passive: true });
  document.addEventListener('scroll',     dgOnScroll,     { passive: true });
  document.addEventListener('visibilitychange', dgOnVisibilityChange);

  // ── FIX 1: IntersectionObserver — pause when mbar off-screen ──
  dgSetupVisibilityObserver();

  startBreathing();
  armSleepCheck();
  scheduleIdle();
}

// ── FIX 1: Visibility observer ───────────────────────────────────
function dgSetupVisibilityObserver() {
  if (!('IntersectionObserver' in window) || !DS.mbar) return;
  var obs = new IntersectionObserver(function(entries) {
    var nowVisible = entries[0].isIntersecting;
    if (nowVisible === DS.visible) return;
    DS.visible = nowVisible;
    if (nowVisible) { dgResume(); } else { dgPause(); }
  }, { threshold: 0.05 });
  obs.observe(DS.mbar);
}

function dgPause() {
  if (DS.breathRAF) { cancelAnimationFrame(DS.breathRAF); DS.breathRAF = null; }
  clearTimeout(DS.idleTimer);
  clearInterval(DS.sleepCheckInterval);
  clearInterval(DS.zInterval);
  if (typeof pauseAudio === 'function') pauseAudio();
}

function dgResume() {
  if (!DS.breathRAF) startBreathing();
  scheduleIdle();
  armSleepCheck();
  if (DS.sleeping) DS.zInterval = setInterval(dgEmitZ, 4000);
  if (typeof resumeAudio === 'function') resumeAudio();
}

// ── Breathing (rAF — only mutates body ellipse ry/rx) ──────────
function startBreathing() {
  var t0 = performance.now();
  function frame(t) {
    if (!DS.visible) { DS.breathRAF = null; return; }
    DS.breathRAF = requestAnimationFrame(frame);
    if (!DS.body) return;
    var dur   = DS.sleeping ? 7000 : 4000;
    var phase = ((t - t0) / dur) * Math.PI * 2;
    var amp   = DS.sleeping ? 0.022 : 0.013;
    var s     = 1 + Math.sin(phase) * amp;
    DS.body.setAttribute('ry', (20 * s).toFixed(3));
    DS.body.setAttribute('rx', (28 * (1 - (s - 1) * 0.4)).toFixed(3));
  }
  DS.breathRAF = requestAnimationFrame(frame);
}

// ── Activity & sleep — v3 behavioral inference ───────────────────

function dgOnScroll() {
  DS.lastScrollTime = Date.now();
  dgMarkActivity();
}

function dgOnVisibilityChange() {
  DS.lastTabTime = Date.now();
  if (!document.hidden) dgMarkActivity();
}

function dgMarkActivity() {
  DS.lastTapTime = Date.now();
  if (DS.sleeping) {
    DS.wakeInputCount++;
    clearTimeout(DS.wakeInputTimer);
    // Fix 3: first ever wake is ALWAYS gentle, regardless of input energy
    if (!DS.hasWokenOnce) {
      DS.wakeInputTimer = setTimeout(function() {
        if (DS.sleeping) dgGentleWake();
      }, 300);
    } else if (DS.wakeInputCount >= 3) {
      dgStartledWake();
    } else {
      // 2-second window: if we get 3+ inputs → startled; else → gentle
      DS.wakeInputTimer = setTimeout(function() {
        if (DS.sleeping) dgGentleWake();
      }, 2000);
      if (DS.wakeInputCount === 1) {
        DS.wakeInputTimer = setTimeout(function() {
          if (DS.sleeping) dgGentleWake();
        }, 300);
      }
    }
    return;
  }
}

function armSleepCheck() {
  clearInterval(DS.sleepCheckInterval);
  DS.sleepCheckInterval = setInterval(function() {
    if (DS.sleeping || DS.busy) return;
    var now  = Date.now();
    var stale = 30000;
    if ((now - DS.lastTapTime    > stale) &&
        (now - DS.lastScrollTime > stale) &&
        (now - DS.lastTabTime    > stale)) {
      dgSleep();
    }
  }, 5000);
}

function dgSleep() {
  if (DS.sleeping || DS.busy) return;
  DS.sleeping = true;
  DS.mbar.classList.add('dg-sleeping');
  // 3-stage eye droop
  dgSetEyes(2.5);
  setTimeout(function() { if (DS.sleeping) dgSetEyes(1.2); }, 700);
  setTimeout(function() {
    if (DS.sleeping) {
      dgSetEyes(0.25);
      if (DS.visible) {
        DS.zInterval = setInterval(dgEmitZ, 4000);
        dgEmitZ();
      }
      // slowPurr() removed — continuous tone was audible and annoying
    }
  }, 1400);
}

function dgGentleWake() {
  if (!DS.sleeping) return;
  DS.sleeping = false;
  clearInterval(DS.zInterval);
  DS.mbar.classList.remove('dg-sleeping');
  DS.wakeInputCount = 0;
  clearTimeout(DS.wakeInputTimer);
  if (typeof stopSlowPurr === 'function') stopSlowPurr();
  // Eyes open slowly via staged setTimeout
  setTimeout(function() { dgSetEyes(0.5);  }, 0);
  setTimeout(function() { dgSetEyes(1.5);  }, 150);
  setTimeout(function() { dgSetEyes(2.5);  }, 300);
  setTimeout(function() { dgSetEyes(3.5);  }, 450);
  // Stretch
  setTimeout(function() {
    DS.mbar.classList.add('dg-stretch');
    setTimeout(function() { DS.mbar.classList.remove('dg-stretch'); }, 800);
  }, 200);
  if (typeof playGentleWake === 'function') playGentleWake();
  // Fix 3: persist that the child has now discovered waking the dragon
  if (!DS.hasWokenOnce) {
    DS.hasWokenOnce = true;
    try { localStorage.setItem('dg_woken', '1'); } catch(e) {}
  }
  armSleepCheck();
  setTimeout(scheduleIdle, 1000);
}

function dgStartledWake() {
  if (!DS.sleeping) return;
  DS.sleeping = false;
  clearInterval(DS.zInterval);
  DS.mbar.classList.remove('dg-sleeping');
  DS.wakeInputCount = 0;
  clearTimeout(DS.wakeInputTimer);
  if (typeof stopSlowPurr === 'function') stopSlowPurr();
  // Eyes SNAP open immediately
  if (DS.eyeL) DS.eyeL.setAttribute('r', '5');
  if (DS.eyeR) DS.eyeR.setAttribute('r', '5');
  // FREEZE — 400ms comedy beat, nothing happens
  setTimeout(function() {
    // Spring overshoot
    dgAnimate(DS.svg, [
      { transform: 'scale(1)    translateY(0px)'  },
      { transform: 'scale(1.2)  translateY(-8px)' },
      { transform: 'scale(0.97) translateY(0px)'  },
      { transform: 'scale(1)    translateY(0px)'  }
    ], 500, function() {
      dgSetEyes(3.5);
    });
  }, 400);
  if (typeof playStartledWake === 'function') playStartledWake();
  armSleepCheck();
  setTimeout(scheduleIdle, 1200);
}

// Legacy alias kept for backward compatibility
function dgWakeUp() {
  dgGentleWake();
}

// ── Eye helpers ──────────────────────────────────────────────────
function dgSetEyes(r) {
  if (DS.eyeL) DS.eyeL.setAttribute('r', r);
  if (DS.eyeR) DS.eyeR.setAttribute('r', r);
}
function dgSetEyesWide() { dgSetEyes(5); }

// ── Z particle (uses pool, sets textContent correctly) ───────────
function dgEmitZ() {
  if (DS.reducedMotion) return;
  if (!DS.svg || !DS.visible) return;
  var rect = DS.svg.getBoundingClientRect();
  var x    = rect.left + rect.width  * (0.38 + Math.random() * 0.14);
  var y    = rect.top  + rect.height * 0.20;
  var sz   = 11 + Math.random() * 7;
  // Create div manually so we can set textContent before appending
  if (DG_POOL.length >= DG_MAX_PARTS) {
    var oldest = DG_POOL.shift();
    try { oldest.remove(); } catch(e) {}
  }
  var p = document.createElement('div');
  p.textContent = 'Z';
  p.style.cssText = [
    'position:fixed', 'left:' + x + 'px', 'top:' + y + 'px',
    'font-family:Outfit,system-ui,sans-serif', 'font-size:' + sz + 'px',
    'font-weight:700', 'color:#7DF9FF', 'pointer-events:none',
    'z-index:16', 'animation:dgZFloat 2s ease-out forwards'
  ].join(';');
  document.body.appendChild(p);
  DG_POOL.push(p);
  setTimeout(function() {
    var idx = DG_POOL.indexOf(p);
    if (idx !== -1) DG_POOL.splice(idx, 1);
    try { p.remove(); } catch(e) {}
  }, 2100);
}

// ── Eye tracking ─────────────────────────────────────────────────
function dgPointerMove(e) {
  if (!DS.visible || DS.sleeping || !DS.svg || !DS.pupilL || !DS.pupilR) return;
  var rect = DS.svg.getBoundingClientRect();
  var svgX = ((e.clientX - rect.left)  / rect.width)  * 200;
  var svgY = ((e.clientY - rect.top)   / rect.height) * 160;

  // Co-attention: blend toward nearest .cw card if within 120px
  var blendX = svgX, blendY = svgY;
  try {
    var cards = document.querySelectorAll('.cw');
    var minDist = 999999, nearCard = null;
    for (var ci = 0; ci < cards.length; ci++) {
      var cr = cards[ci].getBoundingClientRect();
      var cx = cr.left + cr.width / 2;
      var cy = cr.top  + cr.height / 2;
      var dx = e.clientX - cx, dy = e.clientY - cy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) { minDist = dist; nearCard = { x: cx, y: cy }; }
    }
    if (nearCard && minDist < 120) {
      // Blend 40% toward card direction
      var cardSvgX = ((nearCard.x - rect.left) / rect.width)  * 200;
      var cardSvgY = ((nearCard.y - rect.top)  / rect.height) * 160;
      blendX = svgX * 0.6 + cardSvgX * 0.4;
      blendY = svgY * 0.6 + cardSvgY * 0.4;
    }
  } catch(e2) {}

  dgMovePupil(DS.pupilL, DG_PL, blendX, blendY);
  dgMovePupil(DS.pupilR, DG_PR, blendX, blendY);
}

function dgTrackNearestCard(clientX, clientY) {
  // Standalone co-attention call (can be used from touch events)
  if (!DS.visible || DS.sleeping || !DS.svg || !DS.pupilL || !DS.pupilR) return;
  dgPointerMove({ clientX: clientX, clientY: clientY });
}

function dgMovePupil(pupil, home, tx, ty) {
  var dx = tx - home.ex;
  var dy = ty - home.ey;
  var d  = Math.sqrt(dx * dx + dy * dy) || 1;
  var cl = Math.min(d, DG_MAX_OFF) / d;
  pupil.setAttribute('cx', (home.cx + dx * cl * 0.45).toFixed(2));
  pupil.setAttribute('cy', (home.cy + dy * cl * 0.45).toFixed(2));
}

function dgResetPupils() {
  if (DS.pupilL) { DS.pupilL.setAttribute('cx', DG_PL.cx); DS.pupilL.setAttribute('cy', DG_PL.cy); }
  if (DS.pupilR) { DS.pupilR.setAttribute('cx', DG_PR.cx); DS.pupilR.setAttribute('cy', DG_PR.cy); }
}

// ── Modal eye tracking hooks ──────────────────────────────────────
function dgOnModalOpen(modalX, modalY) {
  if (!DS.initialized || !DS.svg || DS.sleeping) return;
  if (!DS.pupilL || !DS.pupilR) return;
  var rect = DS.svg.getBoundingClientRect();
  var svgX = ((modalX - rect.left) / rect.width)  * 200;
  var svgY = ((modalY - rect.top)  / rect.height) * 160;
  // Shift pupils 1.5 SVG units toward modal center
  var dx = svgX - DG_PL.ex, dy = svgY - DG_PL.ey;
  var d  = Math.sqrt(dx * dx + dy * dy) || 1;
  var cl = Math.min(1.5, d) / d;
  DS.pupilL.setAttribute('cx', (DG_PL.cx + dx * cl * 0.45).toFixed(2));
  DS.pupilL.setAttribute('cy', (DG_PL.cy + dy * cl * 0.45).toFixed(2));
  dx = svgX - DG_PR.ex; dy = svgY - DG_PR.ey;
  d  = Math.sqrt(dx * dx + dy * dy) || 1;
  cl = Math.min(1.5, d) / d;
  DS.pupilR.setAttribute('cx', (DG_PR.cx + dx * cl * 0.45).toFixed(2));
  DS.pupilR.setAttribute('cy', (DG_PR.cy + dy * cl * 0.45).toFixed(2));
}

function dgOnModalClose() {
  if (!DS.initialized) return;
  // Pupils return to center over 300ms
  setTimeout(function() { dgResetPupils(); }, 0);
  // (CSS transition would smooth this; for SVG attrs we do a quick staged move)
  if (DS.pupilL && DS.pupilR) {
    var steps = 6, stepMs = 50;
    var startLcx = parseFloat(DS.pupilL.getAttribute('cx') || DG_PL.cx);
    var startLcy = parseFloat(DS.pupilL.getAttribute('cy') || DG_PL.cy);
    var startRcx = parseFloat(DS.pupilR.getAttribute('cx') || DG_PR.cx);
    var startRcy = parseFloat(DS.pupilR.getAttribute('cy') || DG_PR.cy);
    for (var si = 1; si <= steps; si++) {
      (function(step) {
        setTimeout(function() {
          var t = step / steps;
          if (DS.pupilL) {
            DS.pupilL.setAttribute('cx', (startLcx + (DG_PL.cx - startLcx) * t).toFixed(2));
            DS.pupilL.setAttribute('cy', (startLcy + (DG_PL.cy - startLcy) * t).toFixed(2));
          }
          if (DS.pupilR) {
            DS.pupilR.setAttribute('cx', (startRcx + (DG_PR.cx - startRcx) * t).toFixed(2));
            DS.pupilR.setAttribute('cy', (startRcy + (DG_PR.cy - startRcy) * t).toFixed(2));
          }
        }, step * stepMs);
      })(si);
    }
  }
}

// ── Idle personality loop ────────────────────────────────────────
var DG_IDLE = ['look', 'stretch', 'yawn', 'scratch', 'sneeze'];

function scheduleIdle() {
  clearTimeout(DS.idleTimer);
  DS.idleTimer = setTimeout(doIdleBehavior, 8000 + Math.random() * 7000);
}

function doIdleBehavior() {
  if (!DS.sleeping && !DS.busy && DS.visible) {
    var pick = DG_IDLE[Math.floor(Math.random() * DG_IDLE.length)];
    switch (pick) {
      case 'look':    idleLook();    break;
      case 'stretch': idleStretch(); break;
      case 'yawn':    idleYawn();    break;
      case 'scratch': idleScratch(); break;
      case 'sneeze':  idleSneeze();  break;
    }
  }
  scheduleIdle();
}

// ── idleYawn ─────────────────────────────────────────────────────
function idleYawn() {
  if (DS.reducedMotion) {
    // Reduced: only eye size changes
    dgSetEyes(5.5);
    setTimeout(function() { dgSetEyes(0.5); dgEmitPuff(2, '#C792EA'); }, 500);
    setTimeout(function() { if (!DS.sleeping) dgSetEyes(3.5); }, 1300);
    return;
  }
  // 1. Eyes go wide — surprise at own tiredness
  dgSetEyes(5.5);
  if (typeof playYawnSound === 'function') setTimeout(playYawnSound, 100);
  // 2. Jaw opens slowly (body translateY -2px over 800ms)
  setTimeout(function() {
    dgAnimate(DS.svg, [
      { transform: 'translateY(0px)'  },
      { transform: 'translateY(-2px)' }
    ], 800);
  }, 300);
  // 3. Tiny particle puff at snout
  setTimeout(function() {
    dgEmitPuff(2, '#C792EA');
  }, 600);
  // 4. Catches itself — animate back to normal
  setTimeout(function() {
    dgAnimate(DS.svg, [
      { transform: 'translateY(-2px)' },
      { transform: 'translateY(0px)'  }
    ], 400);
    dgSetEyes(3.5);
  }, 1100);
  // 5. Peeks at kid — pupils dart to center then slide right
  setTimeout(function() {
    if (!DS.pupilL || !DS.pupilR) return;
    // Dart to center
    dgResetPupils();
    // Slide slightly right after 200ms
    setTimeout(function() {
      if (DS.pupilL) DS.pupilL.setAttribute('cx', DG_PL.cx + 1.5);
      if (DS.pupilR) DS.pupilR.setAttribute('cx', DG_PR.cx + 1.5);
      // Return after 200ms more
      setTimeout(function() { if (!DS.sleeping) dgResetPupils(); }, 400);
    }, 200);
  }, 1550);
  // Total: ~3 seconds
}

// ── idleScratch ──────────────────────────────────────────────────
function idleScratch() {
  if (DS.reducedMotion) {
    // Satisfied eye close only
    dgSetEyes(0.3);
    setTimeout(function() { dgSetEyes(3.5); }, 400);
    return;
  }
  // 1. Body leans left
  dgAnimate(DS.svg, [
    { transform: 'rotate(0deg)'  },
    { transform: 'rotate(-3deg)' }
  ], 400);
  // 2. Fails to reach itch — wobble
  setTimeout(function() {
    dgAnimate(DS.svg, [
      { transform: 'rotate(-3deg)' },
      { transform: 'rotate(2deg)'  },
      { transform: 'rotate(-4deg)' },
      { transform: 'rotate(3deg)'  }
    ], 600);
  }, 400);
  // 3. Gets it — body settles
  setTimeout(function() {
    dgAnimate(DS.svg, [
      { transform: 'rotate(3deg)' },
      { transform: 'rotate(0deg)' }
    ], 300);
  }, 1000);
  // 4. Satisfied — eyes close briefly then reopen
  setTimeout(function() {
    dgSetEyes(0.3);
    setTimeout(function() { dgSetEyes(3.5); }, 200);
  }, 1300);
  // Total: ~2.5 seconds
}

// ── idleSneeze ───────────────────────────────────────────────────
function idleSneeze() {
  if (DS.reducedMotion) {
    // Buildup + settle only, no transforms
    dgSetEyes(1.5);
    setTimeout(function() {
      dgSetEyes(3.5);
      dgEmitSparks(3, ['#7DF9FF', '#FFD54F', '#C792EA']);
    }, 1100);
    return;
  }
  // 1. Buildup — body tenses, eyes squint
  dgAnimate(DS.svg, [
    { transform: 'scale(1)'    },
    { transform: 'scale(0.96)' }
  ], 600);
  dgSetEyes(1.5);
  // 2. HOLD for 400ms — comedy beat, nothing happens
  // (600ms buildup + 400ms hold = 1000ms before explosion)
  // 3. Explosion — scale up + translateX in 80ms, 3 sparks, body jolts
  setTimeout(function() {
    dgAnimate(DS.svg, [
      { transform: 'scale(0.96) translateX(0px)'  },
      { transform: 'scale(1.08) translateX(3px)'  }
    ], 80, function() {
      dgEmitSparks(3, ['#7DF9FF', '#FFD54F', '#C792EA']);
      if (typeof playSneezeSound === 'function') playSneezeSound();
    });
  }, 1000);
  // 4. Recovery
  setTimeout(function() {
    dgAnimate(DS.svg, [
      { transform: 'scale(1.08) translateX(3px)' },
      { transform: 'scale(1)    translateX(0px)' }
    ], 300, function() {
      dgSetEyes(3.5);
    });
  }, 1080);
  // Total: ~2.5 seconds
}

// ── idleLook (always left-then-right, no dir param) ───────────────
function idleLook() {
  if (!DS.pupilL || !DS.pupilR) return;
  if (DS.reducedMotion) {
    // Pupils only, no transforms
    DS.pupilL.setAttribute('cx', DG_PL.cx - DG_MAX_OFF);
    DS.pupilR.setAttribute('cx', DG_PR.cx - DG_MAX_OFF);
    setTimeout(function() {
      if (DS.pupilL) DS.pupilL.setAttribute('cx', DG_PL.cx + DG_MAX_OFF);
      if (DS.pupilR) DS.pupilR.setAttribute('cx', DG_PR.cx + DG_MAX_OFF);
      setTimeout(function() { if (!DS.sleeping) dgResetPupils(); }, 400);
    }, 1000);
    return;
  }
  // 1. Pupils slide left over 400ms
  // (SVG attrs don't have built-in transitions; we use a stepped approach)
  var steps = 8, stepMs = 50;
  for (var i = 1; i <= steps; i++) {
    (function(step) {
      setTimeout(function() {
        var t = step / steps;
        if (DS.pupilL) DS.pupilL.setAttribute('cx', (DG_PL.cx - DG_MAX_OFF * t).toFixed(2));
        if (DS.pupilR) DS.pupilR.setAttribute('cx', (DG_PR.cx - DG_MAX_OFF * t).toFixed(2));
      }, step * stepMs);
    })(i);
  }
  // 2. PAUSE 600ms — curious, like it heard something
  // 3. Pupils slide right over 500ms (starting at 400 + 600 = 1000ms)
  var stepsR = 10, stepMsR = 50;
  for (var j = 1; j <= stepsR; j++) {
    (function(step) {
      setTimeout(function() {
        var t = step / stepsR;
        if (DS.pupilL) DS.pupilL.setAttribute('cx', (DG_PL.cx - DG_MAX_OFF + (DG_MAX_OFF * 2) * t).toFixed(2));
        if (DS.pupilR) DS.pupilR.setAttribute('cx', (DG_PR.cx - DG_MAX_OFF + (DG_MAX_OFF * 2) * t).toFixed(2));
      }, 1000 + step * stepMsR);
    })(j);
  }
  // 4. PAUSE 400ms
  // 5. Return to center over 300ms (at 1000 + 500 + 400 = 1900ms)
  var stepsC = 6, stepMsC = 50;
  for (var k = 1; k <= stepsC; k++) {
    (function(step) {
      setTimeout(function() {
        var t = step / stepsC;
        if (DS.pupilL) DS.pupilL.setAttribute('cx', (DG_PL.cx + DG_MAX_OFF - DG_MAX_OFF * t).toFixed(2));
        if (DS.pupilR) DS.pupilR.setAttribute('cx', (DG_PR.cx + DG_MAX_OFF - DG_MAX_OFF * t).toFixed(2));
      }, 1900 + step * stepMsC);
    })(k);
  }
  setTimeout(function() { if (!DS.sleeping) dgResetPupils(); }, 2250);
  // Total: ~2.2 seconds
}

// Kept for any legacy call sites that may pass a dir param
function idleLookDir(dir) { idleLook(); }

// ── idleStretch ───────────────────────────────────────────────────
function idleStretch() {
  if (DS.reducedMotion) {
    // Opacity hint only
    DS.mbar.classList.add('dg-stretch');
    setTimeout(function() { DS.mbar.classList.remove('dg-stretch'); }, 900);
    return;
  }
  // 1. Wings spread
  DS.mbar.classList.add('dg-stretch');
  // 2. Small hop
  dgAnimate(DS.svg, [
    { transform: 'translateY(0px)'  },
    { transform: 'translateY(-6px)' }
  ], 300);
  // 3. Hold at extension 600ms (we just leave the class on)
  // 4. Settle back
  setTimeout(function() {
    dgAnimate(DS.svg, [
      { transform: 'translateY(-6px)' },
      { transform: 'translateY(0px)'  }
    ], 400, function() {
      DS.mbar.classList.remove('dg-stretch');
    });
  }, 900);
  // 5. Satisfied exhale puff
  setTimeout(function() {
    dgEmitPuff(1, '#7DF9FF');
  }, 1300);
  // Total: ~1.8 seconds
}

// ── Tap reactions ────────────────────────────────────────────────
var DG_REACTIONS = ['giggle', 'spin', 'fire', 'hiccup'];

function dgTapped() {
  // Activity update (v3: tap time only, not lastScrollTime/lastTabTime)
  DS.lastTapTime = Date.now();

  if (DS.sleeping) {
    DS.wakeInputCount++;
    clearTimeout(DS.wakeInputTimer);
    // Fix 3: first ever wake is ALWAYS gentle
    if (!DS.hasWokenOnce) {
      DS.wakeInputTimer = setTimeout(function() {
        if (DS.sleeping) dgGentleWake();
      }, 300);
    } else if (DS.wakeInputCount >= 3) {
      dgStartledWake();
    } else {
      DS.wakeInputTimer = setTimeout(function() {
        if (DS.sleeping) dgGentleWake();
      }, 400);
    }
    return;
  }

  if (DS.busy) return;

  // Tap velocity tracking
  DS.tapTimes.push(Date.now());
  if (DS.tapTimes.length > 10) DS.tapTimes.shift();
  DS.tapVelocity = dgGetTapVelocity();

  DS.totalTaps++;

  // Rare backflip check (>= 20 total taps, 1/15 chance)
  if (DS.totalTaps >= 20 && Math.random() < (1 / 15)) {
    DS.busy = true;
    rareBackflip();
    clearTimeout(DS.idleResumeTimer);
    DS.idleResumeTimer = setTimeout(function() {
      DS.busy = false;
      DS.lastTapTime = Date.now();
      scheduleIdle();
    }, 2600);
    return;
  }

  // 30% chance → force 'giggle'
  var idx;
  if (Math.random() < 0.30) {
    idx = 0; // giggle
  } else {
    do { idx = Math.floor(Math.random() * DG_REACTIONS.length); }
    while (idx === DS.lastReaction && DG_REACTIONS.length > 1);
  }
  DS.lastReaction = idx;
  DS.busy = true;

  switch (DG_REACTIONS[idx]) {
    case 'giggle': tapGiggle(); break;
    case 'spin':   tapSpin();   break;
    case 'fire':   tapFire();   break;
    case 'hiccup': tapHiccup(); break;
  }

  clearTimeout(DS.idleResumeTimer);
  DS.idleResumeTimer = setTimeout(function() {
    DS.busy = false;
    DS.lastTapTime = Date.now();
    scheduleIdle();
  }, 2600);
}

function dgGetTapVelocity() {
  var now    = Date.now();
  var recent = DS.tapTimes.filter(function(t) { return now - t < 1000; }).length;
  if (recent >= 4) {
    DS.tapVelocity = 'rapid';
    return 'rapid';
  } else if (recent >= 2) {
    DS.tapVelocity = 'moderate';
    return 'moderate';
  }
  DS.tapVelocity = 'gentle';
  return 'gentle';
}

function dgVelocityGain(baseGain) {
  var v = DS.tapVelocity;
  if (v === 'moderate') return baseGain * 1.15;
  if (v === 'rapid')    return baseGain * 1.3;
  return baseGain;
}

function tapGiggle() {
  var g = dgVelocityGain(0.06);
  if (typeof playGiggle === 'function') {
    playGiggle();
  } else {
    playTone(880,  'sine', 0.07, g);
    setTimeout(function() { playTone(1100, 'sine', 0.07, g * 0.85); }, 75);
    setTimeout(function() { playTone(1320, 'sine', 0.09, g * 0.85); }, 150);
  }
  dgAnimate(DS.svg, [
    { transform: 'scale(1)'    },
    { transform: 'scale(1.14)' },
    { transform: 'scale(0.94)' },
    { transform: 'scale(1.08)' },
    { transform: 'scale(1)'    }
  ], 550);
  dgEmitSparks(10, ['#7DF9FF', '#FFD54F', '#C792EA', '#fff']);
}

function tapSpin() {
  playTone(660, 'triangle', 0.38, dgVelocityGain(0.07));
  DS.svg.classList.add('dg-spin');
  setTimeout(function() {
    DS.svg.classList.remove('dg-spin');
    dgEmitSparks(6, ['#7DF9FF', '#C792EA']);
  }, 420);
}

function tapFire() {
  var tier = DS.tier;
  // Tier 4+: body brace before breath
  if (tier >= 5) {
    dgAnimate(DS.svg, [
      { transform: 'translateX(0px)'  },
      { transform: 'translateX(-6px)' }
    ], 300, function() {
      dgAnimate(DS.svg, [
        { transform: 'translateX(-6px)' },
        { transform: 'translateX(0px)'  }
      ], 200);
    });
    setTimeout(function() { dgEmitFireBreath(dgActiveFamilyColor()); }, 200);
  } else if (tier === 4) {
    dgAnimate(DS.svg, [
      { transform: 'translateX(0px)'  },
      { transform: 'translateX(-3px)' }
    ], 200, function() {
      dgAnimate(DS.svg, [
        { transform: 'translateX(-3px)' },
        { transform: 'translateX(0px)'  }
      ], 150);
    });
    setTimeout(function() { dgEmitFireBreath(dgActiveFamilyColor()); }, 100);
  } else {
    playTone(200, 'sawtooth', 0.28, dgVelocityGain(0.06));
    setTimeout(function() { playTone(160, 'sawtooth', 0.18, 0.04); }, 140);
    dgEmitFireBreath(dgActiveFamilyColor());
  }
  if (typeof playFireBreath === 'function') {
    setTimeout(function() { playFireBreath(tier); }, tier >= 4 ? 200 : 0);
  }
  // Self-surprise eye reaction (tiers 1 & 2)
  if (tier === 1) {
    setTimeout(function() {
      dgSetEyes(5);
      setTimeout(function() { dgSetEyes(3.5); }, 300);
    }, 300);
  } else if (tier === 2) {
    setTimeout(function() {
      dgSetEyes(4.5);
      setTimeout(function() { dgSetEyes(3.5); }, 200);
    }, 250);
  }
}

function tapHiccup() {
  if (typeof playHiccupSound === 'function') {
    playHiccupSound();
  } else {
    playTone(440, 'square', 0.09, dgVelocityGain(0.06));
  }
  dgAnimate(DS.svg, [
    { transform: 'translateY(0px)   scale(1)'    },
    { transform: 'translateY(-14px) scale(1.1)'  },
    { transform: 'translateY(5px)   scale(0.95)' },
    { transform: 'translateY(0px)   scale(1)'    }
  ], 560);
  setTimeout(function() { dgEmitSparks(1, ['#FFD54F'], true); }, 180);
}

// ── Rare backflip ─────────────────────────────────────────────────
function rareBackflip() {
  if (typeof playRareBackflip === 'function') playRareBackflip();
  DS.svg.classList.add('dg-backflip');
  // Trail particles at 200ms mark
  setTimeout(function() {
    dgEmitSparks(8, ['#7DF9FF', '#C792EA', '#FFD54F', '#fff']);
  }, 200);
  setTimeout(function() {
    DS.svg.classList.remove('dg-backflip');
    dgEmitSparks(5, ['#7DF9FF', '#C792EA', '#FFD54F']);
  }, 600);
}

// ── Contextual emotions (hooks from ui.js / game.js) ─────────────
function dgOnDiscover(color) {
  dgEmitFireBreath(color || '#7DF9FF');
}

function dgOnRevisit() {
  if (DS.busy) return;
  dgAnimate(DS.svg, [
    { transform: 'translateY(0px)  rotate(0deg)'  },
    { transform: 'translateY(-4px) rotate(2deg)'  },
    { transform: 'translateY(0px)  rotate(-1deg)' },
    { transform: 'translateY(-2px) rotate(1deg)'  },
    { transform: 'translateY(0px)  rotate(0deg)'  }
  ], 520);
}

function dgOnNewFamily() {
  if (!DS.mbar) return;
  DS.busy = true;
  dgSetEyesWide();
  DS.mbar.classList.add('dg-wing-flap');
  setTimeout(function() {
    DS.mbar.classList.remove('dg-wing-flap');
    if (!DS.sleeping) dgSetEyes(3.5);
    DS.busy = false;
  }, 2000);
}

function dgOnAchievement() {
  if (!DS.svg) return;
  DS.busy = true;
  if (DS.gemRing) {
    DS.gemRing.setAttribute('r', '8');
    DS.gemCore && DS.gemCore.setAttribute('r', '4.5');
    setTimeout(function() {
      DS.gemRing && DS.gemRing.setAttribute('r', '5');
      DS.gemCore && DS.gemCore.setAttribute('r', '2.5');
    }, 700);
  }
  dgAnimate(DS.svg, [
    { transform: 'translateY(0px)  rotate(0deg)'  },
    { transform: 'translateY(-8px) rotate(-4deg)' },
    { transform: 'translateY(-5px) rotate(-2deg)' },
    { transform: 'translateY(0px)  rotate(0deg)'  }
  ], 1100, function() { DS.busy = false; });
  dgEmitSparks(12, ['#FFD54F', '#7DF9FF', '#C792EA']);
}

// ── Tier / discovery evolution ────────────────────────────────────
function dgSetTier(tier) {
  if (!DS.mbar || tier === DS.tier) return;
  var oldTier = DS.tier;
  DS.tier = tier;
  DS.mbar.setAttribute('data-tier', tier);
  for (var i = 1; i <= 5; i++) DS.mbar.classList.remove('dg-tier-' + i);
  DS.mbar.classList.add('dg-tier-' + tier);

  var count = tier <= 2 ? 3 : tier === 3 ? 5 : tier === 4 ? 6 : 8;
  dgUpdateOrbits(count);

  if (tier >= 4) {
    DS.wingL && DS.wingL.classList.add('dg-wing-glow');
    DS.wingR && DS.wingR.classList.add('dg-wing-glow');
  }

  if (tier === 5) {
    var ga = DS.gemCore && DS.gemCore.querySelector('animate');
    if (ga) ga.setAttribute('dur', '1.2s');
    dgStartTier5Sparkles();
  }

  // Cancel old vanity intervals
  clearInterval(DS.vanityInterval);
  DS.vanityInterval = null;
  clearInterval(DS.tier4Interval);
  DS.tier4Interval = null;

  // Tier scale upgrade at tier 3
  if (tier === 3) {
    DS.svg.style.transform = 'scale(1.02)';
  } else if (tier >= 4) {
    DS.svg.style.transform = 'scale(1.04)';
  }

  // Start vanity behaviors per tier
  if (tier === 1) {
    dgTier1VanityInterval();
  } else if (tier === 2) {
    dgTier2VanityInterval();
  } else if (tier === 4) {
    dgTier4FlameWings();
  }

  // Run tier ceremony
  dgTierCeremony(tier, oldTier);
}

// ── Tier vanity behaviors ─────────────────────────────────────────
function dgTier1VanityInterval() {
  DS.vanityInterval = setInterval(function() {
    if (DS.tier !== 1 || DS.sleeping) return;
    // Attempted failed flame wings
    if (DS.wingL) DS.wingL.classList.add('dg-wing-glow');
    if (DS.wingR) DS.wingR.classList.add('dg-wing-glow');
    setTimeout(function() {
      if (DS.wingL) DS.wingL.classList.remove('dg-wing-glow');
      if (DS.wingR) DS.wingR.classList.remove('dg-wing-glow');
      // Sheepish: eyes dart away
      setTimeout(function() {
        if (!DS.pupilL || !DS.pupilR) return;
        DS.pupilL.setAttribute('cx', DG_PL.cx + 2);
        DS.pupilR.setAttribute('cx', DG_PR.cx + 2);
        setTimeout(function() { if (!DS.sleeping) dgResetPupils(); }, 600);
      }, 200);
    }, 500);
  }, 25000);
}

function dgTier2VanityInterval() {
  DS.vanityInterval = setInterval(function() {
    if (DS.tier !== 2 || DS.sleeping) return;
    if (DS.wingL) DS.wingL.classList.add('dg-wing-glow');
    if (DS.wingR) DS.wingR.classList.add('dg-wing-glow');
    setTimeout(function() {
      if (DS.wingL) DS.wingL.classList.remove('dg-wing-glow');
      if (DS.wingR) DS.wingR.classList.remove('dg-wing-glow');
    }, 1200);
  }, 30000);
}

function dgTier4FlameWings() {
  DS.tier4Interval = setInterval(function() {
    if (DS.tier < 4 || DS.sleeping) return;
    if (Math.random() < 0.5) {
      if (DS.wingL) DS.wingL.classList.add('dg-wing-glow');
      if (DS.wingR) DS.wingR.classList.add('dg-wing-glow');
      setTimeout(function() {
        // Glow is permanent at tier 4, no removal — just pulse the class
      }, 2000);
    }
  }, 20000);
}

// ── Tier CEREMONY ─────────────────────────────────────────────────
function dgTierCeremony(newTier, oldTier) {
  if (!DS.mbar) return;
  var duration = newTier === 5 ? 6000 : 4000;

  // 1. Pulse mbar border
  DS.mbar.classList.add('dg-ceremony');

  // 2. Dragon glow increases (tier class already set by dgSetTier)
  // (handled by CSS .dg-tier-N class)

  // 3. Demonstrate new ability at 500ms
  setTimeout(function() {
    if (newTier === 2) {
      dgEmitSparks(4, ['#7DF9FF', '#C792EA', '#FFD54F', '#fff']);
    } else if (newTier === 3) {
      dgAnimate(DS.svg, [
        { transform: 'scale(1.04) translateY(0)' },
        { transform: 'scale(1.1)  translateY(-4px)' },
        { transform: 'scale(1.04) translateY(0)' }
      ], 600);
    } else if (newTier === 4) {
      if (DS.wingL) DS.wingL.classList.add('dg-wing-glow');
      if (DS.wingR) DS.wingR.classList.add('dg-wing-glow');
    } else if (newTier === 5) {
      dgStartTier5Sparkles();
    }
  }, 500);

  // 4. Play ceremony sound
  if (typeof playTierCeremony === 'function') playTierCeremony(newTier);

  // 5. Remove ceremony class at end
  setTimeout(function() {
    DS.mbar.classList.remove('dg-ceremony');
  }, duration);

  // 6. Tier 5 vulnerability moment
  if (newTier === 5) {
    setTimeout(function() {
      dgVulnerabilityMoment();
    }, duration + 500);
  }
}

function dgVulnerabilityMoment() {
  // Stop particles, stop idle, wait
  clearTimeout(DS.idleTimer);
  DS.busy = true;

  // Pupils center exactly
  dgResetPupils();
  // Eyes soft
  dgSetEyes(3.5);

  // No animations for 3000ms — just dragon looking at kid
  setTimeout(function() {
    DS.busy = false;
    scheduleIdle();
    armSleepCheck();
  }, 3000);
}

// ── Fire breath evolution (tier-scaled) ──────────────────────────
function dgEmitFireBreath(color) {
  if (DS.reducedMotion) return;
  var tier   = DS.tier;
  var count  = tier === 1 ? 4  : tier === 2 ? 7  : tier === 3 ? 10 : tier === 4 ? 12 : 16;
  var szMin  = tier === 1 ? 3  : tier === 2 ? 4  : tier === 3 ? 5  : 5;
  var szMax  = tier === 1 ? 6  : tier === 2 ? 8  : tier === 3 ? 10 : tier === 4 ? 11 : 13;
  var spread = tier === 1 ? 0.6 : tier === 2 ? 0.9 : tier === 3 ? 1.1 : tier === 4 ? 1.2 : 1.4;

  var o = dgSvgScreenPt(78, 44);
  for (var i = 0; i < count; i++) {
    (function(i) {
      setTimeout(function() {
        var sz  = szMin + Math.random() * (szMax - szMin);
        var ang = -Math.PI / 2 + (Math.random() - 0.5) * spread;
        var d   = 28 + Math.random() * 72;
        dgPooled([
          'position:fixed', 'width:' + sz + 'px', 'height:' + sz + 'px',
          'border-radius:50%', 'background:' + color,
          'left:' + o.x + 'px', 'top:' + o.y + 'px',
          'pointer-events:none', 'z-index:620',
          '--tx:' + (Math.cos(ang) * d * 1.6).toFixed(1) + 'px',
          '--ty:' + (Math.sin(ang) * d - 8).toFixed(1) + 'px',
          'animation:pf .72s cubic-bezier(.25,.46,.45,.94) forwards',
          'animation-delay:' + (i * 28) + 'ms',
          'box-shadow:0 0 8px ' + color
        ].join(';'), 820);
      }, i * 22);
    })(i);
  }
}

// ── Element 118 ceremony ──────────────────────────────────────────
function dgElement118Ceremony() {
  if (DS['118done']) return;
  DS['118done'] = true;

  DS.busy = true;
  clearTimeout(DS.idleTimer);

  // Fix 1: if sleeping, immediately cancel ALL sleep state so it cannot
  // conflict with ceremony animations or audio.
  if (DS.sleeping) {
    DS.sleeping = false;
    clearInterval(DS.zInterval); DS.zInterval = null;
    DS.mbar.classList.remove('dg-sleeping');
    DS.wakeInputCount = 0;
    clearTimeout(DS.wakeInputTimer);
    dgSetEyes(3.5);
    if (typeof stopSlowPurr === 'function') stopSlowPurr();
  }

  // Fix 1: 200ms clear pause — lets sleep CSS classes fully unwind,
  // breathing amplitude normalize, and Z particles finish clearing
  // before any ceremony animation begins.
  setTimeout(function() {

    // 0ms (relative): All orbit circles animate outward
    var allOrbits = DS.extraOrbits.slice();
    allOrbits.forEach(function(orb) { orb.setAttribute('r', '3'); });

    // 500ms: Dragon rises, wings extend
    setTimeout(function() {
      dgAnimate(DS.svg, [
        { transform: 'translateY(0px)'   },
        { transform: 'translateY(-20px)' }
      ], 1500);
      DS.mbar.classList.add('dg-wings-extended');
    }, 500);

    // 1500ms: Flash sequence — cycle through family colors
    var familyColors = ['#7DF9FF','#C792EA','#FFD54F','#FF7043',
                        '#66BB6A','#EF5350','#42A5F5','#AB47BC'];
    familyColors.forEach(function(color, i) {
      setTimeout(function() {
        dgEmitSparks(6, [color, '#fff']);
      }, 1500 + i * 200);
    });

    // Play element 118 audio (Fix 4 disconnect + 2-second silence happens
    // at the start of playElement118Completion itself)
    if (typeof playElement118Completion === 'function') playElement118Completion();

    // 3500ms: Ring collapses — orbits return to normal radius
    setTimeout(function() {
      allOrbits.forEach(function(orb) { orb.setAttribute('r', '1.8'); });
    }, 3500);

    // 4000ms: Dragon settles back down
    setTimeout(function() {
      dgAnimate(DS.svg, [
        { transform: 'translateY(-20px)' },
        { transform: 'translateY(0px)'   }
      ], 800);
      DS.mbar.classList.remove('dg-wings-extended');
    }, 4000);

    // 5000ms: Vulnerability moment — pupils center, eyes soften
    setTimeout(function() {
      dgResetPupils();
      dgSetEyes(3.5);
    }, 5000);

    // 8000ms: Resume normal behavior
    setTimeout(function() {
      DS.busy = false;
      scheduleIdle();
      armSleepCheck();
    }, 8000);

  }, 200); // end 200ms clear pause
}

// ── dgUpdateOrbits ────────────────────────────────────────────────
function dgUpdateOrbits(count) {
  if (!DS.svg) return;
  DS.extraOrbits.forEach(function(c) { c.remove(); });
  DS.extraOrbits = [];
  var palette = ['#ff6b9d', '#a8ff78', '#78aeff', '#ffd86b', '#ea79c7'];
  var paths   = ['M100,58 A30,20 0 1,1 99.99,58', 'M100,68 A20,32 0 1,1 99.99,68',
                 'M100,62 A38,14 0 1,1 99.99,62', 'M100,55 A24,26 0 1,1 99.99,55',
                 'M100,72 A42,16 0 1,1 99.99,72'];
  var durs    = ['2.6s', '5.8s', '3.4s', '6.5s', '4.1s'];
  for (var i = 3; i < count; i++) {
    var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('r', '1.8');
    c.setAttribute('fill', palette[(i - 3) % palette.length]);
    c.setAttribute('opacity', '0.38');
    c.classList.add('dg-extra-orbit');
    var am = document.createElementNS('http://www.w3.org/2000/svg', 'animateMotion');
    am.setAttribute('dur', durs[(i - 3) % durs.length]);
    am.setAttribute('repeatCount', 'indefinite');
    am.setAttribute('path', paths[(i - 3) % paths.length]);
    c.appendChild(am);
    DS.svg.appendChild(c);
    DS.extraOrbits.push(c);
  }
}

function dgStartTier5Sparkles() {
  if (DS.t5Interval) return;
  DS.t5Interval = setInterval(function() {
    if (!DS.sleeping && DS.visible && DS.tier === 5) {
      dgEmitSparks(4, ['#7DF9FF', '#C792EA', '#FFD54F']);
    }
  }, 3800);
}

// ── Particle emitters (all use dgPooled) ────────────────────────
function dgSvgScreenPt(svgX, svgY) {
  if (!DS.svg) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  var r = DS.svg.getBoundingClientRect();
  return { x: r.left + (svgX / 200) * r.width, y: r.top + (svgY / 160) * r.height };
}

function dgEmitSparks(count, colors, large) {
  if (DS.reducedMotion) return;
  var o = dgSvgScreenPt(88, 38);
  for (var i = 0; i < count; i++) {
    (function(i) {
      setTimeout(function() {
        var col  = colors[i % colors.length];
        var sz   = large ? (14 + Math.random() * 8) : (4 + Math.random() * 4);
        var ang  = Math.random() * Math.PI * 2;
        var spd  = large ? (55 + Math.random() * 45) : (35 + Math.random() * 55);
        dgPooled([
          'position:fixed', 'width:' + sz + 'px', 'height:' + sz + 'px',
          'border-radius:50%', 'background:' + col,
          'left:' + o.x + 'px', 'top:' + o.y + 'px',
          'pointer-events:none', 'z-index:620',
          '--tx:' + (Math.cos(ang) * spd).toFixed(1) + 'px',
          '--ty:' + (Math.sin(ang) * spd - 18).toFixed(1) + 'px',
          'animation:pf .62s cubic-bezier(.25,.46,.45,.94) forwards',
          'box-shadow:0 0 ' + (sz * 2.5) + 'px ' + col
        ].join(';'), 700);
      }, i * 38);
    })(i);
  }
}

function dgEmitPuff(count, color) {
  if (DS.reducedMotion) return;
  var o = dgSvgScreenPt(88, 40);
  for (var i = 0; i < count; i++) {
    (function(i) {
      setTimeout(function() {
        dgPooled([
          'position:fixed', 'width:5px', 'height:5px',
          'border-radius:50%', 'background:' + color, 'opacity:.55',
          'left:' + o.x + 'px', 'top:' + o.y + 'px',
          'pointer-events:none', 'z-index:16',
          '--tx:' + ((Math.random() - 0.5) * 28).toFixed(1) + 'px',
          '--ty:' + (-8 - Math.random() * 18).toFixed(1) + 'px',
          'animation:pf .85s ease-out forwards'
        ].join(';'), 950);
      }, i * 110);
    })(i);
  }
}

// ── Web Animations API wrapper ───────────────────────────────────
function dgAnimate(el, frames, dur, cb) {
  if (!el) { cb && cb(); return; }
  if (DS.reducedMotion) {
    // Skip movement transforms, still invoke callback
    cb && setTimeout(cb, dur);
    return;
  }
  try {
    var a = el.animate(frames, { duration: dur, easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'forwards' });
    a.onfinish = function() { a.cancel(); cb && cb(); };
  } catch(e) { setTimeout(cb || function() {}, dur); }
}

// ── Colour helper ────────────────────────────────────────────────
function dgActiveFamilyColor() {
  var tab = document.querySelector('.ftab.active');
  if (tab) {
    var bg = window.getComputedStyle(tab).background;
    var m  = bg.match(/#[0-9a-fA-F]{6}/);
    if (m) return m[0];
  }
  return '#7DF9FF';
}

// ═══════════════════════════════════════════════════════════════
// EXISTING PUBLIC API  (kept intact)
// ═══════════════════════════════════════════════════════════════

function triggerExcited() {
  var m = document.getElementById('mbar');
  if (!m) return;
  m.classList.add('excited', 'pulse');
  setTimeout(function() { m.classList.remove('excited', 'pulse'); }, 800);
}

function updateMascot(fk) {
  var sp = document.getElementById('mspText');
  if (!sp) return;
  if (fk === 'all') {
    var f = state.disc.length;
    sp.textContent = f < 5   ? T('Tap an element to restore my power, {name}!')
      : f < 20  ? 'My strength is growing! Keep going!'
      : f < 50  ? 'My wings spread wider with every discovery!'
      : f < 100 ? 'Almost whole again! The power is incredible!'
      : 'FULL POWER! I am ETERNATUS!';
  } else {
    sp.textContent = T(F[fk].bio.split('.')[0] + '.');
  }
  playRumble();
}

function updatePower() {
  var els   = getEls();
  var total = els.length;
  var found = els.filter(function(el) { return isDisc(el.num); }).length;
  document.getElementById('pwrLabel').textContent = 'Powers: ' + found + ' / ' + total;
  document.getElementById('pwrFill').style.width = Math.min(100, Math.round(found / total * 100)) + '%';
  var all  = state.disc.length;
  var m    = document.getElementById('mbar');
  var tier = all < 3 ? 1 : all < 10 ? 2 : all < 25 ? 3 : all < 60 ? 4 : 5;
  m.setAttribute('data-tier', tier);
  document.getElementById('achTitle').textContent = getAchTitle();
  if (DS.initialized && tier !== DS.tier) dgSetTier(tier);
  // Element 118 ceremony trigger
  if (DS.initialized && all === 118 && !DS['118done']) {
    setTimeout(dgElement118Ceremony, 2000);
  }
}
