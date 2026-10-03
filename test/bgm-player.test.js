import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BgmPlayer } from '../src/sound.js';

// 本物の Audio の代わりに、再生・一時停止・再生位置・手放したかを記録するだけの偽物を使う
function fakeAudio() {
  const created = [];
  const create = (url) => {
    const audio = {
      url,
      loop: false,
      volume: 1,
      paused: true,
      currentTime: 0,
      released: false,
      play() {
        this.paused = false;
        return Promise.resolve();
      },
      pause() {
        this.paused = true;
      },
      removeAttribute(name) {
        if (name === 'src') this.released = true;
      },
      load() {},
    };
    created.push(audio);
    return audio;
  };
  return { created, create };
}

function setup(source = 'import:a.mp3') {
  const audio = fakeAudio();
  const player = new BgmPlayer((name) => `app-media://bgm/${name}`, { createAudio: audio.create });
  player.setVolume(50);
  player.setSource(source);
  return { player, audio };
}

test('取り込んだ曲は、一時停止して再開しても、止めた位置から続けて再生する', () => {
  const { player, audio } = setup();
  player.sync(true);
  const [element] = audio.created;
  assert.equal(element.paused, false);
  element.currentTime = 42; // 42 秒まで進んだ

  player.sync(false); // 一時停止 (または休憩に入った)
  assert.equal(element.paused, true);
  assert.equal(element.released, false, '一時停止で曲を手放してはいけない');

  player.sync(true); // 再開
  assert.equal(audio.created.length, 1, '再開で新しく作り直してはいけない');
  assert.equal(element.paused, false);
  assert.equal(element.currentTime, 42);
});

test('曲を変えたときは、前の曲を手放し、新しい曲を最初から再生する', () => {
  const { player, audio } = setup();
  player.sync(true);
  audio.created[0].currentTime = 30;

  player.setSource('import:b.mp3');
  assert.equal(audio.created[0].released, true);
  assert.equal(audio.created.length, 2);
  assert.equal(audio.created[1].url, 'app-media://bgm/b.mp3');
  assert.equal(audio.created[1].currentTime, 0);
  assert.equal(audio.created[1].paused, false, '再生中に曲を変えたら、新しい曲も再生を続ける');
});

test('止めている間に曲を変えたら、前の曲は手放し、次に再生するまで新しい曲は作らない', () => {
  const { player, audio } = setup();
  player.sync(true);
  player.sync(false);
  player.setSource('import:b.mp3');
  assert.equal(audio.created[0].released, true);
  assert.equal(audio.created.length, 1);
  player.sync(true);
  assert.equal(audio.created[1].url, 'app-media://bgm/b.mp3');
});

test('止めている間に変えた音量も、再開後に反映されている', () => {
  const { player, audio } = setup();
  player.sync(true);
  player.sync(false);
  player.setVolume(20);
  player.sync(true);
  assert.equal(audio.created[0].volume, 0.2);
});

test('「None」では何も作らない', () => {
  const { player, audio } = setup('none');
  player.sync(true);
  assert.equal(audio.created.length, 0);
});

test('試聴 (Test) のあとも、再生位置は残る', async () => {
  const { player, audio } = setup();
  player.preview(10);
  const [element] = audio.created;
  element.currentTime = 5;
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(element.paused, true, '試聴の時間が過ぎたら止まる');
  assert.equal(element.released, false);
  player.sync(true);
  assert.equal(audio.created.length, 1);
  assert.equal(element.currentTime, 5);
});
