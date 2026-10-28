import './style.css';
import { generateLevel } from './game/level';
import { computeViewport, drawGame, Fx, updateCamera, type Camera, type Viewport } from './game/render';
import { randomSeed } from './game/rng';
import { createGame, scoreResult, step, STEP, type Game, type GameEvent } from './game/sim';
import { Sfx } from './platform/audio';
import { Controls } from './platform/input';
import { loadSave, resetSave, writeSave, type Save } from './platform/storage';
import { Hud } from './ui/hud';
import { Screens } from './ui/screens';

type Mode = 'menu' | 'briefing' | 'playing' | 'paused' | 'over';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
const hudRoot = document.getElementById('hud') as HTMLElement;
const screenRoot = document.getElementById('screen') as HTMLElement;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let save: Save = loadSave();
const sfx = new Sfx();
sfx.enabled = save.settings.sound;
const controls = new Controls(canvas);
const hud = new Hud(hudRoot);
controls.bindSprint(hud.sprint);
const fx = new Fx();
fx.reduced = reducedMotion.matches;
reducedMotion.addEventListener('change', () => (fx.reduced = reducedMotion.matches));

let mode: Mode = 'menu';
let game: Game = makeDemo();
let level = game.level;
let vp: Viewport = computeViewport(innerWidth, innerHeight, devicePixelRatio);
const cam: Camera = { x: 0, y: 0 };
let snapCamera = true;
let updateReady = false;
let endTimer = 0;

function makeDemo(): Game {
  const g = createGame(generateLevel(4, randomSeed()));
  // Attract mode: the commuter stands and watches the crowd, unbothered.
  g.player.hp = 9999;
  g.player.y = g.level.height * 0.62;
  g.player.px = g.player.y;
  g.player.invuln = 1e9;
  g.zombies = g.zombies.filter((z) => Math.abs(z.y - g.player.y) < 14);
  return g;
}

const screens = new Screens(
  screenRoot,
  {
    play: () => startCommute(save.nextLevel),
    resume: () => (mode === 'briefing' ? beginPlaying() : resumePlaying()),
    quit: () => toMenu(),
    retry: () => startCommute(level.number),
    next: () => startCommute(save.nextLevel),
    setSetting: (key, value) => {
      save.settings[key] = value;
      if (key === 'sound') sfx.enabled = value;
      writeSave(save);
      void sfx.unlock().then(() => sfx.play('tap'));
    },
    reset: () => {
      save = resetSave();
      sfx.enabled = save.settings.sound;
      toMenu();
    },
    reload: () => location.reload(),
  },
  `${__BUILD_LABEL__} · ${__BUILD_SHA__}`,
);

function toMenu(): void {
  mode = 'menu';
  controls.enabled = false;
  hudRoot.hidden = true;
  game = makeDemo();
  level = game.level;
  snapCamera = true;
  acc = 0;
  screens.menu(save, updateReady);
}

function startCommute(number: number): void {
  sfx.unlock();
  level = generateLevel(number, randomSeed());
  game = createGame(level);
  hud.reset();
  hudRoot.hidden = false;
  controls.enabled = false;
  snapCamera = true;
  mode = 'briefing';
  fx.texts = [];
  fx.particles = [];
  screens.briefing(level);
}

function beginPlaying(): void {
  sfx.unlock();
  screens.hide();
  mode = 'playing';
  controls.enabled = true;
  acc = 0;
  hud.say(`Car ${level.car}: find the green door`, 2.4);
}

function resumePlaying(): void {
  sfx.unlock();
  screens.hide();
  mode = 'playing';
  controls.enabled = true;
  acc = 0;
}

function pauseGame(): void {
  if (mode !== 'playing') return;
  mode = 'paused';
  controls.enabled = false;
  controls.release();
  screens.pause();
}

hud.pause.addEventListener('click', pauseGame);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (mode === 'playing') pauseGame();
    else if (mode === 'paused') resumePlaying();
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseGame();
});
// iOS Safari ignores touch-action for pinch; stop the page zooming under a thumb mid-game.
document.addEventListener('gesturestart', (e) => e.preventDefault());

function vibrate(ms: number): void {
  if (save.settings.haptics && 'vibrate' in navigator) navigator.vibrate(ms);
}

function onEvent(e: GameEvent): void {
  fx.handle(e);
  switch (e.type) {
    case 'hit':
      sfx.play('hit');
      vibrate(80);
      break;
    case 'nearMiss':
      sfx.play('nearMiss');
      break;
    case 'coin':
      sfx.play('coin');
      break;
    case 'coffee':
      sfx.play('coffee');
      hud.say('Caffeinated! Faster and fully rested', 2);
      break;
    case 'ping':
      if (Math.hypot(e.x - game.player.x, e.y - game.player.y) < 7) sfx.play('ping');
      break;
    case 'honk':
      sfx.play('honk');
      break;
    case 'trainLeft':
      sfx.play('trainLeft');
      hud.say('You missed it! Next train in 25 seconds', 2.6);
      break;
    case 'exhausted':
      hud.say('Out of breath!', 1.4);
      break;
    case 'won':
      sfx.play('win');
      endTimer = 0.9;
      break;
    case 'dead':
      sfx.play('dead');
      vibrate(250);
      endTimer = 1.3;
      break;
  }
}

function finish(): void {
  mode = 'over';
  controls.enabled = false;
  controls.release();
  if (game.status === 'won') {
    const r = scoreResult(game);
    const newBest = r.score > save.highScore;
    save.highScore = Math.max(save.highScore, r.score);
    save.bestLevel = Math.max(save.bestLevel, level.number);
    save.nextLevel = Math.max(save.nextLevel, level.number + 1);
    save.stars[level.number] = Math.max(save.stars[level.number] ?? 0, r.stars);
    writeSave(save);
    screens.won(level, r, newBest);
  } else {
    const score = Math.round(game.score);
    save.highScore = Math.max(save.highScore, score);
    writeSave(save);
    screens.lost(level, score, Math.round(100 * (1 - game.player.y / level.height)));
  }
}

function resize(): void {
  vp = computeViewport(innerWidth, innerHeight, devicePixelRatio);
  canvas.width = Math.round(vp.w * vp.dpr);
  canvas.height = Math.round(vp.h * vp.dpr);
  canvas.style.width = `${vp.w}px`;
  canvas.style.height = `${vp.h}px`;
  snapCamera = true;
}
addEventListener('resize', resize);
addEventListener('orientationchange', resize);
resize();

let acc = 0;
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (mode === 'playing') {
    // Once the run is decided there is nothing left to simulate: freeze the clock and the picture.
    if (game.status === 'playing') acc += dt;
    else acc = 0;
    while (acc >= STEP && game.status === 'playing') {
      step(game, controls.read());
      acc -= STEP;
      for (const e of game.events) onEvent(e);
      game.events.length = 0;
    }
    hud.update(game, dt);
    if (game.status !== 'playing') {
      endTimer -= dt;
      if (endTimer <= 0) finish();
    }
  } else if (mode === 'menu') {
    // Keep the world alive behind the menu.
    acc += dt;
    while (acc >= STEP) {
      step(game, { dx: 0, dy: 0, sprint: false });
      acc -= STEP;
      game.events.length = 0;
    }
  }
  fx.update(dt);
  updateCamera(cam, game, vp, dt, snapCamera);
  snapCamera = false;
  const alpha = (mode === 'playing' && game.status === 'playing') || mode === 'menu' ? acc / STEP : 1;
  drawGame(ctx, game, cam, vp, alpha, fx, controls.stick, now / 1000);
  requestAnimationFrame(frame);
}

toMenu();
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // A new version took over. Never reload mid-run; offer it on the menu instead.
    if (!hadController) return;
    updateReady = true;
    if (mode === 'menu') screens.menu(save, updateReady);
  });
  addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => {});
  });
}
