// The Application manager's optional apps, in a real Chrome: Office Printer (public/office-printer-b/) is not on a new
// person's desktop; Install in Games puts it in their Start menu; it opens in a window and runs under MyiaOS's own
// security policy (Trusted Types: no "refused" errors, its drawings made); it finds its books beside MyiaOS's Reader; the
// choice is kept in their files across a reload; Remove closes it and takes it off the Start menu again.
// Needs the dev server on a FRESH, EMPTY data folder (this sets up the owner) and `npm run build` done.
//   node test/browser-appmanager.mjs [http://127.0.0.1:3043]
import { chromium } from 'playwright-core';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3043';
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
let passed = 0;
const failures = [];
async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (error) {
    failures.push(name);
    console.log('  FAIL ' + name + '\n       ' + String(error?.message ?? error).split('\n')[0]);
  }
}
const ok = (cond, what) => {
  if (!cond) throw new Error(what);
};

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const problems = [];
page.on('pageerror', e => problems.push(`page error: ${e.message}`));
page.on('console', m => {
  if (m.type() === 'error' && /Trusted|Content Security|refused/i.test(m.text())) problems.push(m.text());
});

await page.goto(BASE);
await page.locator('.gate h1', { hasText: 'Set up' }).waitFor({ timeout: 30000 });
await page.getByLabel('Your name').fill('Store Test');
await page.getByLabel('User name (for signing in)').fill('tester');
await page.locator('.gate input[type=password]').fill('browser-test-passphrase-1');
await page.locator('.gate-go').click();
await page.locator('.gate h1', { hasText: 'Your recovery key' }).waitFor({ timeout: 30000 });
await page.locator('.gate .check-row input').check();
await page.getByRole('button', { name: 'Continue' }).click();
await page.locator('#desktop .item').first().waitFor({ timeout: 30000 });

const startHas = async title => {
  await page.locator('.start-btn').click();
  await page.keyboard.type(title);
  const n = await page.locator('.start-menu .start-item', { hasText: title }).count();
  await page.keyboard.press('Escape');
  return n > 0;
};
const openManager = async () => {
  await page.locator('.start-btn').click();
  await page.keyboard.type('Application manager');
  await page.locator('.start-menu .start-item', { hasText: 'Application manager' }).first().click();
  const win = page.locator('.win', { hasText: 'Application manager' });
  await win.locator('.ast-kind', { hasText: 'Games' }).click();
  return win;
};
const tile = win => win.locator('.ast-tile', { hasText: 'Office Printer' });

await step('a new person has no Office Printer in the Start menu', async () => {
  ok(!(await startHas('Office Printer')), 'it is listed before Install');
});

await step('Games shows Office Printer with Install; Install puts it in the Start menu', async () => {
  const win = await openManager();
  const t = tile(win);
  ok(await t.locator('.ast-app').isDisabled(), 'the icon opens it before it is installed');
  await t.getByRole('button', { name: 'Install' }).click();
  await t.getByRole('button', { name: 'Remove' }).waitFor({ timeout: 10000 });
  await win.locator('.win-close').click();
  ok(await startHas('Office Printer'), 'not in the Start menu after Install');
});

await step('it opens in a window and runs under MyiaOS\'s security policy (drawings made, nothing refused)', async () => {
  await page.locator('.start-btn').click();
  await page.keyboard.type('Office Printer');
  await page.locator('.start-menu .start-item', { hasText: 'Office Printer' }).first().click();
  const frame = page.frameLocator('.win iframe[title="Office Printer"]');
  await frame.locator('#desk > *').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);
  ok(await frame.locator('svg').count() > 0, 'no drawings in the game');
  ok(problems.length === 0, problems.join(' | '));
});

await step('the game finds its books beside MyiaOS\'s Reader (library and Sherlock Holmes)', async () => {
  const game = page.frames().find(f => f.url().includes('/office-printer-b/'));
  ok(game, 'the game frame is missing');
  const codes = await game.evaluate(async () => Promise.all(['../reader/library.json', '../reader/texts/sherlock.txt'].map(u => fetch(u).then(r => r.status))));
  ok(codes.every(c => c === 200), `answers ${codes.join(', ')}`);
});

await step('the choice is kept in the person\'s files: still installed after a reload', async () => {
  await page.reload();
  await page.locator('#desktop .item').first().waitFor({ timeout: 30000 });
  ok(await startHas('Office Printer'), 'gone after a reload');
});

await step('Remove closes its window and takes it off the Start menu; that too survives a reload', async () => {
  await page.locator('.start-btn').click();
  await page.keyboard.type('Office Printer');
  await page.locator('.start-menu .start-item', { hasText: 'Office Printer' }).first().click();
  await page.locator('.win iframe[title="Office Printer"]').waitFor();
  const win = await openManager();
  await tile(win).getByRole('button', { name: 'Remove' }).click();
  await tile(win).getByRole('button', { name: 'Install' }).waitFor({ timeout: 10000 });
  ok(await page.locator('.win iframe[title="Office Printer"]').count() === 0, 'its window stayed open');
  await win.locator('.win-close').click();
  ok(!(await startHas('Office Printer')), 'still in the Start menu after Remove');
  await page.reload();
  await page.locator('#desktop .item').first().waitFor({ timeout: 30000 });
  ok(!(await startHas('Office Printer')), 'back after a reload');
});

await step('installed from the release zip (its files left out): no Install, it says it is not on this server yet', async () => {
  await page.route('**/office-printer-b/**', route => route.fulfill({ status: 404, body: 'Not found' }));
  const win = await openManager();
  const t = tile(win);
  await t.getByText('Not on this server yet').waitFor({ timeout: 10000 });
  ok(await t.getByRole('button', { name: 'Install' }).count() === 0, 'Install is offered without the files');
  await win.locator('.win-close').click();
  await page.unroute('**/office-printer-b/**');
});

await step('no page errors in the whole run', async () => ok(problems.length === 0, problems.join(' | ')));

await browser.close();
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
