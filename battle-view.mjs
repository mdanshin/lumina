// One camera for both rendering and ability targeting, in CSS or device pixels.
export const WORLD_WIDTH = 1200;
export const WORLD_HEIGHT = 400;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function battleCamera(width, height) {
  const scale = Math.max(width / WORLD_WIDTH, height / WORLD_HEIGHT);
  return {
    scale,
    x: (width - WORLD_WIDTH * scale) / 2,
    y: clamp(height / 2 - 185 * scale, height - WORLD_HEIGHT * scale, 0)
  };
}

export function projectBattlePoint(width, height, x, y) {
  const camera = battleCamera(width, height);
  return { x: x * camera.scale + camera.x, y: y * camera.scale + camera.y };
}

export function battlePoint(width, height, x, y) {
  const camera = battleCamera(width, height);
  return {
    x: clamp((x - camera.x) / camera.scale, 60, 1140),
    y: clamp((y - camera.y) / camera.scale, 120, 255)
  };
}
