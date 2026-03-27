// ═══════════════════════════════════════════════════════════════
// LOAD ORDER: sound.js  (no JS dependencies — load before game.js)
//
// PROVIDES (globals used by other files):
//   getAC()             — AudioContext (lazy-init)
//   getMasterBus()      — master DynamicsCompressor → limiter chain
//   playTone(freq,type,vol,dur) — generic tone
//   playFamilySound(fk) — per-family audio signature
//   playRevisit(fk)     — softer revisit sound
//   playDiscover()      — new-element discovery sound
//   playDiscoverEvolved(count) — discovery sound scaled to progress
//   playRumble()        — low rumble on modal open
//   speakName(n)        — synthesised element name pronunciation
//   playEOTDShimmer()   — element-of-the-day shimmer tone
//   playMegaSwitch()    — mega evolution tab transition sound
//   playRadiantSound()  — radiant element reveal sound
//   playGiggle()        — dragon giggle (used by dragon.js)
//   playGentleWake()    — dragon gentle wake sound
//   playStartledWake()  — dragon startled wake sound
//   playFireBreath(tier)— dragon fire breath sound
//   playTierCeremony(tier) — tier unlock fanfare
//   playElement118Completion() — element 118 grand finale sound
//   pauseAudio()        — suspend AudioContext (called by dragon.js IntersectionObserver)
//   resumeAudio()       — resume AudioContext
//
// CONSUMES (from other files):
//   state               — game.js  (state.disc.length for volume scaling)
// ═══════════════════════════════════════════════════════════════
// AUDIO / WEB AUDIO ENGINE  v3.0
// Harmonic root: E2 = 82.41 Hz — all frequencies harmonically related
// ═══════════════════════════════════════════════════════════════

var ac;
var masterBus = null; // Fix 2: master bus compressor + limiter

function getAC() {
  if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
  return ac;
}

// Fix 2: All audio routes through this compressor → limiter chain.
// Prevents clipping when purr + idle + tap + discovery sounds overlap.
// Also hard-limits peak at -6 dBFS (critical for tier-5 fire roar and
// element 118 swell with waveshaper distortion).
function getMasterBus() {
  if (masterBus) return masterBus;
  var ctx = getAC();
  // Primary compressor: -24 dB threshold, 4:1 ratio
  var comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -24;
  comp.ratio.value     =   4;
  comp.knee.value      =  30;
  comp.attack.value    =   0.003;
  comp.release.value   =   0.25;
  // Peak limiter: -6 dBFS hard ceiling
  var lim = ctx.createDynamicsCompressor();
  lim.threshold.value  =  -6;
  lim.ratio.value      =  20;  // near-brick-wall
  lim.knee.value       =   0;
  lim.attack.value     =   0.001;
  lim.release.value    =   0.10;
  comp.connect(lim);
  lim.connect(ctx.destination);
  masterBus = comp;
  return masterBus;
}

// ── Harmonic frequency constants ────────────────────────────────
var HZ_E2  =  82.41;
var HZ_E3  = 164.81;
var HZ_B3  = 246.94;
var HZ_E4  = 329.63;
var HZ_Gs4 = 415.30;
var HZ_B4  = 493.88;
var HZ_E5  = 659.25;
var HZ_B5  = 987.77;
var HZ_E6  = 1318.51;

// ── Core tone primitive ──────────────────────────────────────────
function playTone(freq, type, dur, vol) {
  if (freq === undefined) freq = 440;
  if (type === undefined) type = 'sine';
  if (dur  === undefined) dur  = 0.12;
  if (vol  === undefined) vol  = 0.08;
  try {
    var c = getAC(), o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime);
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g); g.connect(getMasterBus());
    o.start(); o.stop(c.currentTime + dur);
  } catch(e) {}
}

// ── Waveshaper distortion helper ────────────────────────────────
function makeDistortionCurve(amount) {
  var n = 256, curve = new Float32Array(n);
  for (var i = 0; i < n; i++) {
    var x = (i * 2) / n - 1;
    curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

// ── White noise helper ───────────────────────────────────────────
function createNoiseBuffer(c) {
  var buf = c.createBuffer(1, 4096, c.sampleRate);
  var d   = buf.getChannelData(0);
  for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function playNoise(filterType, filterFreq, gainVal, dur) {
  try {
    var c   = getAC();
    var buf = c.createBuffer(1, Math.ceil(c.sampleRate * (dur + 0.05)), c.sampleRate);
    var d   = buf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    var src = c.createBufferSource();
    src.buffer = buf;
    var filt = c.createBiquadFilter();
    filt.type            = filterType || 'allpass';
    filt.frequency.value = filterFreq || 1000;
    var g = c.createGain();
    g.gain.setValueAtTime(gainVal, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    src.connect(filt); filt.connect(g); g.connect(getMasterBus());
    src.start(); src.stop(c.currentTime + dur);
  } catch(e) {}
}

// ── Delay/echo helper ────────────────────────────────────────────
function playToneWithEcho(freq, type, dur, vol, echoDelay, echoGain) {
  try {
    var c = getAC(), o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime);
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g); g.connect(getMasterBus());
    o.start(); o.stop(c.currentTime + dur);
    if (echoDelay && echoGain) {
      setTimeout(function() { playTone(freq, type, dur * 0.7, vol * echoGain); }, echoDelay * 1000);
    }
  } catch(e) {}
}

// ── Family sound ────────────────────────────────────────────────
function playFamilySound(fk) {
  var a = F[fk] && F[fk].audio;
  if (a) playTone(a[0], a[1], a[2]);
}

// ── Revisit ─────────────────────────────────────────────────────
function playRevisit(fk) {
  playFamilySound(fk);
  playRumble();
}

// ── Rumble ──────────────────────────────────────────────────────
function playRumble() {
  var t = state.disc.length < 10 ? 80 : state.disc.length < 60 ? 70 : 60;
  playTone(t, 'sine', 0.15, 0.06);
  setTimeout(function() { playTone(t + 20, 'sine', 0.12, 0.05); }, 60);
}

// ── Speak name ──────────────────────────────────────────────────
function speakName(n) {
  if ('speechSynthesis' in window) {
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance('This is ' + n);
    u.rate = 0.8; u.pitch = 1.15;
    speechSynthesis.speak(u);
  }
}

// ── EOTD shimmer ────────────────────────────────────────────────
function playEOTDShimmer() {
  try {
    var c = getAC(), o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(800, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(1200, c.currentTime + 0.3);
    g.gain.setValueAtTime(0.05, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.35);
    o.connect(g); g.connect(getMasterBus());
    o.start(); o.stop(c.currentTime + 0.35);
  } catch(e) {}
}

// ── Mega switch ─────────────────────────────────────────────────
function playMegaSwitch() {
  playTone(262, 'sine', 0.1, 0.1);
  setTimeout(function() { playTone(330, 'sine', 0.1, 0.1); }, 80);
  setTimeout(function() { playTone(523, 'sine', 0.2, 0.1); }, 180);
}

// ── Radiant sound ───────────────────────────────────────────────
function playRadiantSound() {
  playTone(523, 'square', 0.35, 0.14);
  setTimeout(function() { playTone(523, 'square', 0.2, 0.12); }, 180);
  setTimeout(function() { playTone(659, 'square', 0.2, 0.12); }, 320);
  setTimeout(function() { playTone(784, 'square', 0.5, 0.16); }, 480);
  setTimeout(function() { playTone(1047, 'sine', 0.15, 0.1); }, 680);
  setTimeout(function() { playTone(1319, 'sine', 0.15, 0.1); }, 750);
  setTimeout(function() { playTone(1568, 'sine', 0.15, 0.1); }, 820);
  setTimeout(function() { playTone(2093, 'sine', 0.25, 0.12); }, 900);
  setTimeout(function() { playTone(784,  'square', 0.2, 0.12); }, 1200);
  setTimeout(function() { playTone(1047, 'square', 0.5, 0.16); }, 1400);
  setTimeout(function() { playTone(784,  'square', 0.15, 0.12); }, 2200);
  setTimeout(function() { playTone(1047, 'square', 0.2, 0.14); }, 2400);
  setTimeout(function() { playTone(1319, 'square', 0.6, 0.16); }, 2600);
  setTimeout(function() { playTone(2093, 'sine', 0.2, 0.08); }, 2800);
  setTimeout(function() { playTone(2637, 'sine', 0.15, 0.06); }, 2950);
  setTimeout(function() { playTone(3136, 'sine', 0.3, 0.08); }, 3100);
  setTimeout(function() { playTone(65,   'sine', 0.5, 0.1); }, 80);
  setTimeout(function() { playTone(80,   'sine', 0.4, 0.08); }, 480);
  setTimeout(function() { playTone(100,  'sine', 0.4, 0.08); }, 1200);
  setTimeout(function() { playTone(80,   'sine', 0.5, 0.1); }, 2400);
}

// ═══════════════════════════════════════════════════════════════
// AMBIENT PURR
// ═══════════════════════════════════════════════════════════════

var purrNode = null, purrGain = null;
var slowPurrNode = null, slowPurrGain = null;
var purrStarted = false;

function startPurr() {
  if (purrStarted) return;
  purrStarted = true;
  try {
    var c  = getAC();
    var o  = c.createOscillator();
    var g  = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(HZ_E2 * 0.5, c.currentTime); // ~41Hz sub-harmonic
    g.gain.setValueAtTime(0.015, c.currentTime);
    o.connect(g); g.connect(getMasterBus());
    o.start();
    purrNode = o;
    purrGain = g;
  } catch(e) {}
}

function stopPurr(fadeMs) {
  if (!purrGain) return;
  try {
    var c = getAC();
    var t = (fadeMs || 300) / 1000;
    purrGain.gain.linearRampToValueAtTime(0, c.currentTime + t);
    setTimeout(function() {
      try { purrNode && purrNode.stop(); } catch(e) {}
      purrNode = null; purrGain = null; purrStarted = false;
    }, (fadeMs || 300) + 50);
  } catch(e) {}
}

function slowPurr() {
  // Sleep mode: add quiet exhale-whistle at E4
  if (slowPurrNode) return;
  try {
    var c  = getAC();
    var o  = c.createOscillator();
    var g  = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(HZ_E4, c.currentTime);
    g.gain.setValueAtTime(0.012, c.currentTime);
    o.connect(g); g.connect(getMasterBus());
    o.start();
    slowPurrNode = o;
    slowPurrGain = g;
    // Slowly modulate purr gain for sleeping breathing feel
    if (purrGain) {
      var ac2 = getAC();
      purrGain.gain.linearRampToValueAtTime(0.008, ac2.currentTime + 3);
    }
  } catch(e) {}
}

function stopSlowPurr() {
  if (!slowPurrGain) return;
  try {
    var c = getAC();
    slowPurrGain.gain.linearRampToValueAtTime(0, c.currentTime + 0.5);
    setTimeout(function() {
      try { slowPurrNode && slowPurrNode.stop(); } catch(e) {}
      slowPurrNode = null; slowPurrGain = null;
    }, 600);
  } catch(e) {}
}

// ═══════════════════════════════════════════════════════════════
// WAKE SOUNDS
// ═══════════════════════════════════════════════════════════════

function playGentleWake() {
  // Warm ascending interval: E3 then B3
  playTone(HZ_E3, 'sine', 0.4, 0.06);
  setTimeout(function() { playTone(HZ_B3, 'sine', 0.5, 0.06); }, 200);
  // Resume purr softly
  if (purrGain) {
    try {
      var c = getAC();
      purrGain.gain.linearRampToValueAtTime(0.015, c.currentTime + 0.3);
    } catch(e) {}
  }
}

function playStartledWake() {
  // Stop purr immediately
  if (purrGain) {
    try {
      var c0 = getAC();
      purrGain.gain.setValueAtTime(0, c0.currentTime);
    } catch(e) {}
  }
  // 200ms silence IS the sound — do not fill it
  setTimeout(function() {
    // Burst: E5 + B5 simultaneously, square wave
    playTone(HZ_E5, 'square', 0.15, 0.08);
    playTone(HZ_B5, 'square', 0.15, 0.06);
  }, 200);
  // purr restart removed — no indefinite ambient drone after wake
}

// ═══════════════════════════════════════════════════════════════
// TAP REACTION SOUNDS
// ═══════════════════════════════════════════════════════════════

function playGiggle() {
  // Rapid ascending arpeggio: E2→E3→B3→E4, sine, bouncy
  playTone(HZ_E2, 'sine', 0.08, 0.07);
  setTimeout(function() { playTone(HZ_E3, 'sine', 0.08, 0.07); }, 80);
  setTimeout(function() { playTone(HZ_B3, 'sine', 0.08, 0.07); }, 160);
  setTimeout(function() { playTone(HZ_E4, 'sine', 0.08, 0.07); }, 240);
}

function playYawnSound() {
  // Slow glissando from E4 down to E2 over 1.5 seconds
  try {
    var c = getAC();
    var o = c.createOscillator();
    var g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(HZ_E4, c.currentTime);
    o.frequency.linearRampToValueAtTime(HZ_E2, c.currentTime + 1.5);
    g.gain.setValueAtTime(0.05, c.currentTime);
    g.gain.linearRampToValueAtTime(0.02, c.currentTime + 1.2);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 1.5);
    o.connect(g); g.connect(getMasterBus());
    o.start(); o.stop(c.currentTime + 1.5);
  } catch(e) {}
  // Optional filtered noise breath layer
  try {
    var c2  = getAC();
    var buf = c2.createBuffer(1, Math.ceil(c2.sampleRate * 1.5), c2.sampleRate);
    var dat = buf.getChannelData(0);
    for (var i = 0; i < dat.length; i++) dat[i] = Math.random() * 2 - 1;
    var src  = c2.createBufferSource();
    src.buffer = buf;
    var filt = c2.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 800;
    filt.Q.value = 2;
    var g2 = c2.createGain();
    g2.gain.setValueAtTime(0.02, c2.currentTime);
    g2.gain.exponentialRampToValueAtTime(0.001, c2.currentTime + 1.5);
    src.connect(filt); filt.connect(g2); g2.connect(getMasterBus());
    src.start(); src.stop(c2.currentTime + 1.5);
  } catch(e) {}
}

function playHiccupSound() {
  // E2 sharp attack, square, then quick pitch bend simulation
  playTone(HZ_E2, 'square', 0.06, 0.07);
  setTimeout(function() { playTone(HZ_E2 * 1.6, 'square', 0.04, 0.05); }, 60);
}

function playSneezeSound() {
  // White noise burst + E2 tone simultaneously, short and punchy
  try {
    var c   = getAC();
    var buf = c.createBuffer(1, Math.ceil(c.sampleRate * 0.15), c.sampleRate);
    var d   = buf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    var src = c.createBufferSource();
    src.buffer = buf;
    var g = c.createGain();
    g.gain.setValueAtTime(0.08, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.12);
    src.connect(g); g.connect(getMasterBus());
    src.start(); src.stop(c.currentTime + 0.12);
  } catch(e) {}
  playTone(HZ_E2, 'sine', 0.1, 0.06);
}

// ═══════════════════════════════════════════════════════════════
// FIRE BREATH (tier-scaled)
// ═══════════════════════════════════════════════════════════════

function playFireBreath(tier) {
  if (!tier) tier = 1;
  try {
    var c = getAC();
    if (tier === 1) {
      // High-pass noise burst
      var buf1 = c.createBuffer(1, Math.ceil(c.sampleRate * 0.2), c.sampleRate);
      var d1 = buf1.getChannelData(0);
      for (var i = 0; i < d1.length; i++) d1[i] = Math.random() * 2 - 1;
      var s1 = c.createBufferSource(); s1.buffer = buf1;
      var f1 = c.createBiquadFilter(); f1.type = 'highpass'; f1.frequency.value = 2000;
      var g1 = c.createGain();
      g1.gain.setValueAtTime(0.05, c.currentTime);
      g1.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.2);
      s1.connect(f1); f1.connect(g1); g1.connect(getMasterBus());
      s1.start(); s1.stop(c.currentTime + 0.2);

    } else if (tier === 2) {
      // Lowpass noise + quiet sawtooth
      var buf2 = c.createBuffer(1, Math.ceil(c.sampleRate * 0.4), c.sampleRate);
      var d2 = buf2.getChannelData(0);
      for (var j = 0; j < d2.length; j++) d2[j] = Math.random() * 2 - 1;
      var s2 = c.createBufferSource(); s2.buffer = buf2;
      var f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 3000;
      var g2 = c.createGain();
      g2.gain.setValueAtTime(0.07, c.currentTime);
      g2.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.4);
      s2.connect(f2); f2.connect(g2); g2.connect(getMasterBus());
      s2.start(); s2.stop(c.currentTime + 0.4);
      playTone(200, 'sawtooth', 0.4, 0.04);

    } else if (tier === 3) {
      // Lowpass noise + E2 sawtooth + sub-rumble
      var dur3 = 0.6;
      var buf3 = c.createBuffer(1, Math.ceil(c.sampleRate * dur3), c.sampleRate);
      var d3 = buf3.getChannelData(0);
      for (var k = 0; k < d3.length; k++) d3[k] = Math.random() * 2 - 1;
      var s3 = c.createBufferSource(); s3.buffer = buf3;
      var f3 = c.createBiquadFilter(); f3.type = 'lowpass'; f3.frequency.value = 2000;
      var g3 = c.createGain();
      g3.gain.setValueAtTime(0.08, c.currentTime);
      g3.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur3);
      s3.connect(f3); f3.connect(g3); g3.connect(getMasterBus());
      s3.start(); s3.stop(c.currentTime + dur3);
      playTone(HZ_E2, 'sawtooth', dur3, 0.05);
      playTone(HZ_E2 * 0.5, 'sine', dur3, 0.04);

    } else if (tier === 4) {
      // Tier 3 base + 3 noise pops at 100ms intervals
      var dur4 = 0.8;
      var buf4 = c.createBuffer(1, Math.ceil(c.sampleRate * dur4), c.sampleRate);
      var d4 = buf4.getChannelData(0);
      for (var m = 0; m < d4.length; m++) d4[m] = Math.random() * 2 - 1;
      var s4 = c.createBufferSource(); s4.buffer = buf4;
      var f4 = c.createBiquadFilter(); f4.type = 'lowpass'; f4.frequency.value = 2000;
      var g4 = c.createGain();
      g4.gain.setValueAtTime(0.09, c.currentTime);
      g4.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur4);
      s4.connect(f4); f4.connect(g4); g4.connect(getMasterBus());
      s4.start(); s4.stop(c.currentTime + dur4);
      playTone(HZ_E2, 'sawtooth', dur4, 0.05);
      playTone(HZ_E2 * 0.5, 'sine', dur4, 0.04);
      // 3 noise pops
      [0, 100, 200].forEach(function(delay) {
        setTimeout(function() { playNoise('bandpass', 1200, 0.06, 0.08); }, delay);
      });

    } else {
      // Tier 5: E2 sawtooth + waveshaper distortion + noise + E3→E5 sweep
      var dur5 = 1.5;
      // Distorted sawtooth
      var o5 = c.createOscillator();
      var ws = c.createWaveShaper();
      ws.curve = makeDistortionCurve(200);
      var g5 = c.createGain();
      o5.type = 'sawtooth';
      o5.frequency.setValueAtTime(HZ_E2, c.currentTime);
      g5.gain.setValueAtTime(0.1, c.currentTime);
      g5.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur5);
      o5.connect(ws); ws.connect(g5); g5.connect(getMasterBus());
      o5.start(); o5.stop(c.currentTime + dur5);
      // Noise layer
      var buf5 = c.createBuffer(1, Math.ceil(c.sampleRate * dur5), c.sampleRate);
      var d5 = buf5.getChannelData(0);
      for (var n5 = 0; n5 < d5.length; n5++) d5[n5] = Math.random() * 2 - 1;
      var sn5 = c.createBufferSource(); sn5.buffer = buf5;
      var fn5 = c.createBiquadFilter(); fn5.type = 'lowpass'; fn5.frequency.value = 2500;
      var gn5 = c.createGain();
      gn5.gain.setValueAtTime(0.06, c.currentTime);
      gn5.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur5);
      sn5.connect(fn5); fn5.connect(gn5); gn5.connect(getMasterBus());
      sn5.start(); sn5.stop(c.currentTime + dur5);
      // Sine sweep E3 → E5
      var os5 = c.createOscillator();
      var gs5 = c.createGain();
      os5.type = 'sine';
      os5.frequency.setValueAtTime(HZ_E3, c.currentTime);
      os5.frequency.linearRampToValueAtTime(HZ_E5, c.currentTime + dur5);
      gs5.gain.setValueAtTime(0.07, c.currentTime);
      gs5.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur5);
      os5.connect(gs5); gs5.connect(getMasterBus());
      os5.start(); os5.stop(c.currentTime + dur5);
    }
  } catch(e) {}
}

// ═══════════════════════════════════════════════════════════════
// DISCOVERY SOUND — EVOLVED
// ═══════════════════════════════════════════════════════════════

function playDiscoverEvolved(discoveryCount) {
  var n = discoveryCount || 1;
  if (n === 118) {
    playElement118Completion();
    triggerExcited();
    return;
  }
  if (n <= 10) {
    // Simple two-note ascending
    playTone(HZ_E3, 'sine', 0.12, 0.07);
    setTimeout(function() { playTone(HZ_B3, 'sine', 0.12, 0.07); }, 120);
  } else if (n <= 30) {
    // E3→E4 interval + quiet E2 pad underneath
    playTone(HZ_E2, 'sine', 0.5, 0.03);
    playTone(HZ_E3, 'sine', 0.14, 0.07);
    setTimeout(function() { playTone(HZ_E4, 'sine', 0.14, 0.07); }, 130);
  } else if (n <= 60) {
    // E major triad — E3 + B3 + E4 simultaneously, plus triangle layer
    playTone(HZ_E3, 'sine', 0.22, 0.07);
    playTone(HZ_B3, 'sine', 0.22, 0.06);
    playTone(HZ_E4, 'sine', 0.22, 0.05);
    playTone(HZ_E3, 'triangle', 0.3, 0.04);
  } else if (n <= 99) {
    // Chord with delay echo at 0.3s
    playTone(HZ_E3, 'sine', 0.25, 0.07);
    playTone(HZ_B3, 'sine', 0.25, 0.06);
    playTone(HZ_E4, 'sine', 0.25, 0.05);
    setTimeout(function() {
      playTone(HZ_E3, 'sine', 0.2, 0.03);
      playTone(HZ_B3, 'sine', 0.2, 0.025);
      playTone(HZ_E4, 'sine', 0.2, 0.02);
    }, 300);
  } else if (n <= 117) {
    // Full chord with longer echo at 0.6s
    playTone(HZ_E3, 'sine', 0.3, 0.07);
    playTone(HZ_B3, 'sine', 0.3, 0.06);
    playTone(HZ_E4, 'sine', 0.3, 0.06);
    playTone(HZ_Gs4, 'sine', 0.3, 0.05);
    setTimeout(function() {
      playTone(HZ_E3, 'sine', 0.25, 0.03);
      playTone(HZ_B3, 'sine', 0.25, 0.025);
      playTone(HZ_E4, 'sine', 0.25, 0.02);
    }, 600);
  }
  triggerExcited();
}

// Backward-compatible alias
function playDiscover() {
  playDiscoverEvolved(typeof state !== 'undefined' && state.disc ? state.disc.length : 1);
}

// ═══════════════════════════════════════════════════════════════
// TIER CEREMONY
// ═══════════════════════════════════════════════════════════════

function playTierCeremony(tier) {
  // Each tier adds a note to the chord; reverb simulated via delay feedback
  var echoDelay, echoGain, echoDelay2, echoGain2;
  if (tier <= 1) {
    echoDelay = null;
  } else if (tier === 2) {
    echoDelay = 0.1; echoGain = 0.2;
  } else if (tier === 3) {
    echoDelay = 0.2; echoGain = 0.25;
  } else if (tier === 4) {
    echoDelay = 0.3; echoGain = 0.3;
  } else {
    echoDelay = 0.5; echoGain = 0.4;
    echoDelay2 = 0.8; echoGain2 = 0.2;
  }

  function playWithEcho(freq, type, dur, vol) {
    playTone(freq, type, dur, vol);
    if (echoDelay) {
      setTimeout(function() { playTone(freq, type, dur * 0.7, vol * echoGain); }, echoDelay * 1000);
    }
    if (echoDelay2) {
      setTimeout(function() { playTone(freq, type, dur * 0.5, vol * echoGain2); }, echoDelay2 * 1000);
    }
  }

  // Tier 1→2: E3 + B3
  playWithEcho(HZ_E3, 'sine', 1.5, 0.07);
  playWithEcho(HZ_B3, 'sine', 1.5, 0.07);

  if (tier >= 3) {
    // Add Gs4
    playWithEcho(HZ_Gs4, 'sine', 1.5, 0.06);
  }
  if (tier >= 4) {
    // Add E4
    playWithEcho(HZ_E4, 'sine', 1.5, 0.06);
  }
  if (tier >= 5) {
    // Add B4 + E5 — extended resolution
    playWithEcho(HZ_B4, 'sine', 2.0, 0.05);
    playWithEcho(HZ_E5, 'sine', 2.5, 0.05);
    // Crystalline shimmer
    setTimeout(function() {
      playTone(HZ_E6, 'sine', 1.0, 0.03);
    }, 800);
  }
}

// ═══════════════════════════════════════════════════════════════
// RARE BACKFLIP
// ═══════════════════════════════════════════════════════════════

function playRareBackflip() {
  // Rapid ascending arpeggio: E2→E3→B3→E4→Gs4→B4→E5
  var notes = [HZ_E2, HZ_E3, HZ_B3, HZ_E4, HZ_Gs4, HZ_B4, HZ_E5];
  notes.forEach(function(freq, i) {
    setTimeout(function() { playTone(freq, 'sine', 0.06, 0.07); }, i * 60);
  });
  // Sustain E5 for 0.4s after arpeggio ends
  setTimeout(function() {
    playTone(HZ_E5, 'sine', 0.4, 0.06);
  }, notes.length * 60);
  // Shimmer at 400ms into sustain
  setTimeout(function() {
    playTone(HZ_E6, 'sine', 0.3, 0.03);
  }, notes.length * 60 + 400);
}

// ═══════════════════════════════════════════════════════════════
// ELEMENT 118 COMPLETION — 8-second cinematic
// ═══════════════════════════════════════════════════════════════

function playElement118Completion() {
  // Fix 4: TRUE SILENCE — fully disconnect every sustained audio node from
  // the graph before the 2-second opening silence. Setting gain to 0 still
  // passes noise floor through the graph; disconnect() removes the node
  // entirely so no signal path exists. This makes the silence absolute.
  if (purrNode)     { try { purrNode.disconnect();     } catch(e) {} }
  if (purrGain)     { try { purrGain.disconnect();     } catch(e) {} }
  if (slowPurrNode) { try { slowPurrNode.disconnect(); } catch(e) {} }
  if (slowPurrGain) { try { slowPurrGain.disconnect(); } catch(e) {} }
  purrNode = null; purrGain = null; purrStarted = false;
  slowPurrNode = null; slowPurrGain = null;

  // 0-2000ms: TRUE SILENCE. The silence IS the sound.
  // 2000ms: E2 fades in
  setTimeout(function() {
    try {
      var c  = getAC();
      var o  = c.createOscillator();
      var g  = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(HZ_E2, c.currentTime);
      g.gain.setValueAtTime(0, c.currentTime);
      g.gain.linearRampToValueAtTime(0.06, c.currentTime + 1.0);
      g.gain.linearRampToValueAtTime(0.06, c.currentTime + 5.0);  // sustain
      g.gain.linearRampToValueAtTime(0, c.currentTime + 7.0);
      o.connect(g); g.connect(getMasterBus());
      o.start(); o.stop(c.currentTime + 7.1);
    } catch(e) {}
  }, 2000);

  // 3000ms: E3
  setTimeout(function() { playTone(HZ_E3, 'sine', 4.5, 0.05); }, 3000);
  // 3200ms: B3
  setTimeout(function() { playTone(HZ_B3, 'sine', 4.3, 0.05); }, 3200);
  // 3400ms: E4
  setTimeout(function() { playTone(HZ_E4, 'sine', 4.1, 0.04); }, 3400);
  // 3600ms: Gs4
  setTimeout(function() { playTone(HZ_Gs4, 'sine', 3.9, 0.04); }, 3600);
  // 3800ms: B4
  setTimeout(function() { playTone(HZ_B4, 'sine', 3.7, 0.04); }, 3800);
  // 4000ms: E5
  setTimeout(function() { playTone(HZ_E5, 'sine', 3.5, 0.04); }, 4000);
  // 4500ms: E6 crystalline
  setTimeout(function() { playTone(HZ_E6, 'sine', 3.0, 0.03); }, 4500);

  // 6000ms: Master swell — play all notes again at 1.5x gain
  setTimeout(function() {
    try {
      var c  = getAC();
      var now = c.currentTime;
      var freqs = [HZ_E2, HZ_E3, HZ_B3, HZ_E4, HZ_Gs4, HZ_B4, HZ_E5, HZ_E6];
      var gains = [0.09, 0.075, 0.075, 0.06, 0.06, 0.06, 0.06, 0.045];
      freqs.forEach(function(freq, i) {
        var o2 = c.createOscillator();
        var g2 = c.createGain();
        o2.type = 'sine';
        o2.frequency.setValueAtTime(freq, now);
        g2.gain.setValueAtTime(0, now);
        g2.gain.linearRampToValueAtTime(gains[i], now + 0.5);  // swell up over 500ms
        g2.gain.linearRampToValueAtTime(0, now + 3.0);          // release over 2000ms (total 9s)
        o2.connect(g2); g2.connect(getMasterBus());
        o2.start(); o2.stop(now + 3.1);
      });
    } catch(e) {}
  }, 6000);

  // purr restart removed — no indefinite ambient drone after element 118 ceremony
}

// ═══════════════════════════════════════════════════════════════
// AUDIO PAUSE / RESUME (called by IntersectionObserver hooks)
// ═══════════════════════════════════════════════════════════════

function pauseAudio() {
  try {
    var c = getAC();
    if (c && c.state === 'running') c.suspend();
  } catch(e) {}
}

function resumeAudio() {
  try {
    var c = getAC();
    if (c && c.state === 'suspended') c.resume();
  } catch(e) {}
}
