import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'steam', 'store-assets', 'screenshots');
const types = { '.css':'text/css', '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.svg':'image/svg+xml', '.webp':'image/webp' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const file = path.resolve(root, `.${pathname === '/' ? '/battle.html' : pathname}`);
    if (!file.startsWith(`${root}${path.sep}`)) throw new Error('Invalid path');
    response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    response.end(await readFile(file));
  } catch {
    response.writeHead(404).end('Not found');
  }
});

await new Promise(resolve => server.listen(4173, '127.0.0.1', resolve));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: 'ru-RU' });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/battle.html?steamshots=1', { waitUntil: 'networkidle' });
  await page.click('#start');
  await page.waitForTimeout(2400);
  await page.screenshot({ path: path.join(output, '01_frontline_russian.jpg'), type: 'jpeg', quality: 94 });

  await page.locator('#puzzle').scrollIntoViewIfNeeded();
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(output, '02_reactor_russian.jpg'), type: 'jpeg', quality: 94 });

  const move = await page.evaluate(() => window.__crystalFrontCapture.legalMove());
  const box = await page.locator('#puzzle').boundingBox();
  for (const index of move) {
    const column = index % 8, row = Math.floor(index / 8);
    await page.mouse.click(box.x + (column + .5) * box.width / 8, box.y + (row + .5) * box.height / 8);
  }
  await page.waitForTimeout(220);
  await page.screenshot({ path: path.join(output, '03_crystal_cascade_russian.jpg'), type: 'jpeg', quality: 94 });
  await page.waitForTimeout(1000);

  await page.evaluate(() => window.__crystalFrontCapture.setEnergy(900));
  for (const selector of ['#unit-blade', '#unit-bulwark', '#unit-lancer', '#unit-mortar']) {
    const button = page.locator(selector);
    await button.scrollIntoViewIfNeeded();
    await button.click();
    await page.waitForTimeout(250);
  }
  await page.locator('#battle-viewport').scrollIntoViewIfNeeded();
  await page.waitForTimeout(2800);
  await page.screenshot({ path: path.join(output, '04_reinforcements_russian.jpg'), type: 'jpeg', quality: 94 });

  await page.evaluate(() => window.__crystalFrontCapture.setEnergy(900));
  await page.locator('#spell-storm').scrollIntoViewIfNeeded();
  await page.click('#spell-storm');
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(output, '05_energy_storm_russian.jpg'), type: 'jpeg', quality: 94 });

  await page.click('#pause');
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(output, '06_tactical_pause_russian.jpg'), type: 'jpeg', quality: 94 });
  console.log(`Created six 1920x1080 gameplay screenshots in ${output}`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
