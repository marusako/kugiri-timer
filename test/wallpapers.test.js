import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WALLPAPER_PRESETS } from '../src/wallpapers.js';
import { parseSettings } from '../src/settings.js';

test('デフォルトの壁紙は 5 種類で、ID と英語の名前を持つ', () => {
  assert.equal(WALLPAPER_PRESETS.length, 5);
  for (const preset of WALLPAPER_PRESETS) {
    assert.match(preset.id, /^[a-z]+$/);
    assert.ok(preset.name.length > 0);
  }
});

test('ID は重ならない', () => {
  const ids = WALLPAPER_PRESETS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('どのデフォルト壁紙も、設定に保存できる形の ID になる', () => {
  for (const { id } of WALLPAPER_PRESETS) {
    assert.equal(parseSettings({ wallpaper: `preset:${id}` }).wallpaper, `preset:${id}`);
  }
});
