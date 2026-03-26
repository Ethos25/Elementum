// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');

// ── helpers ─────────────────────────────────────────────────────────────────

/** Save a full-viewport screenshot to /screenshots/<name>.png */
async function snap(page, name) {
  const dest = path.join(__dirname, '..', 'screenshots', `${name}.png`);
  await page.screenshot({ path: dest, fullPage: false });
  console.log(`  📸  screenshots/${name}.png`);
  return dest;
}

/**
 * Inject localStorage before the page loads so the intro is already marked
 * complete. Key is 'elementum_v2'; state.intro=true tells the app to skip the
 * intro overlay and show the element grid immediately.
 */
async function skipIntro(page) {
  await page.addInitScript(() => {
    var SK = 'elementum_v2';
    var data = {
      state: {
        disc: [], fams: [], intro: true,
        megaUnlocked: false, achShown: [], matchesPlayed: 0,
        matchesCorrect: 0, firstDiscTime: null, currentArc: 0,
        arcComplete: [], lastVisit: Date.now(), sessionDisc: [],
        megaTourDone: false, lastWild: 0, radiants: [],
        whispersShown: [], combosReacted: [], secret119: false,
      },
      profile: { name: 'Tester', toy: 'Bear', food: 'Pizza', pet: '', color: '', bday: 0 },
    };
    localStorage.setItem(SK, JSON.stringify(data));
  });
}

/** #mbar exists in DOM but starts hidden behind the intro overlay. */
async function waitForDOM(page) {
  await page.waitForSelector('#mbar', { state: 'attached', timeout: 10000 });
}

/** #mbar becomes visible only once the intro is dismissed. */
async function waitForMainApp(page) {
  await page.waitForSelector('#mbar', { state: 'visible', timeout: 10000 });
}

// ── tests ────────────────────────────────────────────────────────────────────

test.describe('Elementum visual snapshots', () => {

  // ── 1. Intro overlay (fresh session) ─────────────────────────────────────
  test('01 — intro overlay', async ({ page }) => {
    await page.goto('/');
    await waitForDOM(page);
    await page.waitForTimeout(600); // let dragon float in and CSS settle
    await snap(page, '01-intro-overlay');
  });

  // ── 2. Main element grid ──────────────────────────────────────────────────
  test('02 — element grid', async ({ page }) => {
    await skipIntro(page);
    await page.goto('/');
    await waitForMainApp(page);
    await page.waitForTimeout(600);
    await snap(page, '02-element-grid');
  });

  // ── 3. Element card modal (first element) ─────────────────────────────────
  test('03 — element modal', async ({ page }) => {
    await skipIntro(page);
    await page.goto('/');
    await waitForMainApp(page);
    await page.waitForTimeout(400);

    const firstCard = page.locator('.cw').first();
    await firstCard.waitFor({ state: 'visible', timeout: 5000 });
    await firstCard.click();
    await page.waitForTimeout(500); // modal open animation

    await snap(page, '03-element-modal');
  });

  // ── 4. Dragon bar isolated screenshot ─────────────────────────────────────
  test('04 — dragon bar', async ({ page }) => {
    await skipIntro(page);
    await page.goto('/');
    await waitForMainApp(page);
    await page.waitForTimeout(600);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);

    const mbar = page.locator('#mbar');
    await mbar.screenshot({
      path: path.join(__dirname, '..', 'screenshots', '04-dragon-bar.png'),
    });
    console.log('  📸  screenshots/04-dragon-bar.png');
  });

  // ── 5. Intro form scrolled ────────────────────────────────────────────────
  test('05 — intro form scrolled', async ({ page }) => {
    await page.goto('/');
    await waitForDOM(page);
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
    await snap(page, '05-intro-scrolled');
  });

});
