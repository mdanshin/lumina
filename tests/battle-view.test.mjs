import test from 'node:test';
import assert from 'node:assert/strict';
import { battleCamera, battlePoint, projectBattlePoint } from '../battle-view.mjs';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`);
const viewports = [[1374, 346], [1734, 360], [800, 265], [800, 285]];

test('wide and scrollable battlefields keep the same scale on both axes', () => {
  for (const [width, height] of viewports) {
    const origin = projectBattlePoint(width, height, 500, 150);
    const horizontal = projectBattlePoint(width, height, 550, 150);
    const vertical = projectBattlePoint(width, height, 500, 200);
    close(horizontal.x - origin.x, vertical.y - origin.y);
    const camera = battleCamera(width, height);
    assert.ok(camera.x <= 0 && camera.y <= 0);
    assert.ok(camera.x + 1200 * camera.scale >= width);
    assert.ok(camera.y + 400 * camera.scale >= height);
  }
});

test('ability targeting maps visible units back to their world positions at both pixel densities', () => {
  for (const [width, height] of viewports) {
    for (const [x, y] of [[100, 191], [244, 158], [600, 200], [956, 224], [1100, 191]]) {
      const screen = projectBattlePoint(width, height, x, y);
      const target = battlePoint(width, height, screen.x, screen.y);
      close(target.x, x); close(target.y, y);
      const retina = projectBattlePoint(width * 2, height * 2, x, y);
      close(retina.x / 2, screen.x); close(retina.y / 2, screen.y);
    }
  }
});

test('targeting uses the scrolled canvas origin, including an enemy base outside the initial view', () => {
  const screen = projectBattlePoint(800, 265, 1100, 191);
  const scrolledCanvasLeft = 14 - 438;
  const clientX = scrolledCanvasLeft + screen.x;
  assert.ok(clientX >= 14 && clientX <= 376);
  const target = battlePoint(800, 265, clientX - scrolledCanvasLeft, screen.y);
  close(target.x, 1100); close(target.y, 191);
});

test('ability targets stay within the legal battle area when selecting scenery', () => {
  assert.deepEqual(battlePoint(1200, 300, -1000, -1000), { x: 60, y: 120 });
  assert.deepEqual(battlePoint(1200, 300, 3000, 3000), { x: 1140, y: 255 });
  assert.deepEqual(battlePoint(1200, 300, 600, 156), { x: 600, y: 191 });
});
