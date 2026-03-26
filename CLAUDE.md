# Elementum — Project Notes for Claude

## Project overview
Kids' chemistry app for ages 4–6. 118 elements, dragon mascot "Professor Eternatus."
Static HTML/CSS/JS — no bundler, no framework. Open `index.html` directly in a browser.

## File layout
| File | Role |
|---|---|
| `index.html` | Shell only — imports all CSS and JS |
| `styles.css` | All styling + dragon animation keyframes |
| `elements-data.js` | Element definitions (all 118) |
| `game.js` | Game state, discovery, achievements — localStorage key `elementum_v2` |
| `sound.js` | Web Audio engine v3 — harmonic root E2 (82.41 Hz), master bus compressor |
| `dragon.js` | Eternatus animation engine v3 — idle, sleep, wake, tier ceremonies |
| `ui.js` | Modals, tabs, rendering, intro flow |

## Key constants
- **localStorage key**: `elementum_v2`
  Shape: `{ state: { disc, fams, intro, ... }, profile: { name, toy, food, pet, ... } }`
- **intro gate**: `state.intro === true` skips the intro overlay and shows the element grid
- **dragon state object**: `DS` (global in `dragon.js`)
- **audio master bus**: `getMasterBus()` in `sound.js` — all audio routes through here

## Visual verification with Playwright

Playwright (v1.58) is installed with Chromium. Use it to take screenshots and visually
verify any UI changes before shipping.

### Run all visual snapshot tests
```bash
npm test
# or with output
npx playwright test --reporter=list
```

### Take a quick one-off screenshot
```bash
# Start the dev server on :3333, then in another terminal:
npx playwright screenshot --browser chromium http://localhost:3333 screenshots/manual.png
```

### npm scripts
| Script | What it does |
|---|---|
| `npm test` | Run all Playwright tests (headless) |
| `npm run test:headed` | Run tests with visible browser window |
| `npm run test:ui` | Open Playwright UI mode |
| `npm run serve` | Serve the app on http://localhost:3333 |

### Test file
`tests/visual.spec.js` — five snapshot tests:
1. **01-intro-overlay** — fresh session, intro form visible
2. **02-element-grid** — intro bypassed via localStorage, element grid shown
3. **03-element-modal** — first element card (Hydrogen) opened
4. **04-dragon-bar** — isolated screenshot of the Eternatus dragon bar
5. **05-intro-scrolled** — intro form scrolled to bottom

Screenshots are written to `screenshots/` (gitignored).

### Bypassing the intro in tests
```js
await page.addInitScript(() => {
  localStorage.setItem('elementum_v2', JSON.stringify({
    state: { disc: [], fams: [], intro: true, /* ... */ },
    profile: { name: 'Tester', toy: 'Bear', food: '', pet: '', color: '', bday: 0 },
  }));
});
```

### Waiting for the app to be ready
```js
// #mbar exists in DOM immediately but is hidden behind the intro overlay:
await page.waitForSelector('#mbar', { state: 'attached' });  // just DOM presence

// #mbar becomes visible only once intro is dismissed:
await page.waitForSelector('#mbar', { state: 'visible' });   // main app ready
```

## Dragon animation engine notes
- **Breathing**: rAF loop mutates `ry`/`rx` SVG attributes on `#dg-body` only — does NOT use CSS transform (avoids conflict with Web Animations API)
- **Particle pool**: hard cap 30 DOM nodes, oldest recycled first
- **IntersectionObserver**: pauses all rAF + timers + audio when `#mbar` scrolls off screen
- **Sleep**: 30s of no interaction → `dgSleep()`. Two wake modes: gentle (first-ever wake is always gentle, `dg_woken` localStorage flag) and startled (3+ rapid inputs)
- **Element 118 ceremony**: guarded by `DS['118done']`. If dragon is sleeping when triggered, sleep is cancelled synchronously before the 200ms clear pause and ceremony begin

## Audio engine notes
- All sounds route through `getMasterBus()` — a DynamicsCompressor (−24 dB, 4:1) chained to a peak limiter (−6 dBFS, 20:1)
- Ambient purr nodes (`purrNode`, `slowPurrNode`) are fully `.disconnect()`ed (not muted) at the start of the element 118 ceremony for true silence; restarted after 11s
- `pauseAudio()` / `resumeAudio()` called by IntersectionObserver hooks — suspend/resume the entire AudioContext
