import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { makeAppVdf, makeDepotVdf } from '../scripts/prepare-steam-vdf.mjs';

test('Steam package exposes only the Crystal Front desktop entry point', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  assert.equal(pkg.main, 'desktop/main.cjs');
  assert.equal(pkg.build.productName, 'Crystal Front');
  assert.ok(pkg.build.files.includes('battle.html'));
  assert.ok(!pkg.build.files.includes('index.html'));
  assert.equal(pkg.build.win.target[0].target, 'zip');
});

test('SteamPipe config binds the app and depot without publishing it live', () => {
  const depot = makeDepotVdf({ depotId: '123457', contentRoot: 'C:\\build\\game' });
  const app = makeAppVdf({ appId: '123456', depotId: '123457', buildOutput: 'C:\\build\\logs' });
  assert.match(depot, /"DepotID" "123457"/);
  assert.match(depot, /C:\/build\/game/);
  assert.match(app, /"AppID" "123456"/);
  assert.match(app, /"SetLive" ""/);
  assert.match(app, /depot_build_123457\.vdf/);
  assert.throws(() => makeAppVdf({ appId: 'bad', depotId: '123457', buildOutput: '.' }));
});
