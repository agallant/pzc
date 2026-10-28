import './style.css';
import { dailyLevelNumber, dailySeed, dayKey, recordDaily } from './game/daily';
import { generateLevel } from './game/level';
import { isUnlocked, outfitById } from './game/outfits';
import { computeViewport, drawGame, Fx, updateCamera, type Camera, type Viewport } from './game/render';
import { randomSeed } from './game/rng';
import { createGame, scoreResult, step, STEP, type Game, type GameEvent } from './game/sim';
import { Sfx } from './platform/audio';
import { Controls } from './platform/input';
import { exportSave, importSave, loadSave, resetSave, writeSave, type Save } from './platform/storage';
import { Hud } from './ui/hud';
import { Screens } from './ui/screens';
import { WalkScreen } from './ui/walkScreen';
import { stepsRequired } from './walk/credit';
import { LiveWalk } from './walk/live';
import { beginLock, checkIn, noteVisibility } from './walk/lock';

type Mode = 'menu' | 'briefing' | 'playing' | 'paused' | 'over' | 'walk';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
const hudRoot = document.getElementById('hud') as HTMLElement;
const screenRoot = document.getElementById('screen') as HTMLElement;
const appRoot = document.getElementById('app') as HTMLElement;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let save: Save = loadSave();
const sfx = new Sfx();
sfx.enabled = save.settings.sound;
const controls = new Controls(canvas);
const hud = new Hud(hudRoot);
controls.bindSprint(hud.sprint);
const fx = new Fx();
function applyControlPrefs(): void {
  hudRoot.classList.toggle('left-handed', save.settings.leftHanded);
  hudRoot.classList.toggle('big-controls', save.settings.bigControls);
  controls.stickScale = save.settings.bigControls ? 1.3 : 1;
  fx.stickScale = controls.stickScale;
}
applyControlPrefs();
fx.reduced = reducedMotion.matches;
fx.cap = outfitById(save.outfit).cap;
reducedMotion.addEventListener('change', () => (fx.reduced = reducedMotion.matches));

let mode: Mode = 'menu';
let game: Game = makeDemo();
let level = game.level;
let vp: Viewport = computeViewport(innerWidth, innerHeight, devicePixelRatio);
const cam: Camera = { x: 0, y: 0 };
let snapCamera = true;
let updateReady = false;
let endTimer = 0;
let dailyKey: string | null = null;

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
    play: () => startCommute(save.run.level),
    resume: () => (mode === 'briefing' ? beginPlaying() : resumePlaying()),
    quit: () => toMenu(),
    next: () => startCommute(save.run.level),
    setSetting: (key, value) => {
      save.settings[key] = value;
      if (key === 'sound') sfx.enabled = value;
      applyControlPrefs();
      writeSave(save);
      sfx.unlock();
      sfx.play('tap');
    },
    reset: () => {
      save = resetSave();
      sfx.enabled = save.settings.sound;
      applyControlPrefs();
      toMenu();
    },
    reload: () => location.reload(),
    walkLive,
    walkLock: (withLocation) => void walkLock(withLocation),
    checkIn: () => void doCheckIn(),
    keepWalking: () => void walkLock(wantedLocation),
    cancelLock: () => {
      if (!save.walk) return;
      save.walk.lock = null;
      writeSave(save);
      screens.continueScreen(save.walk, save.run);
    },
    finishWalk,
    giveUp,
    playDaily: () => {
      const key = dayKey();
      dailyKey = key;
      startCommute(dailyLevelNumber(key), dailySeed(key));
    },
    share: () => void shareResult(),
    setOutfit: (id) => {
      const o = outfitById(id);
      if (!isUnlocked(o, save.stats.steps)) return;
      save.outfit = o.id;
      fx.cap = o.cap;
      writeSave(save);
    },
    importBackup: (text) => {
      const imported = importSave(text);
      if (!imported) return false;
      save = imported;
      sfx.enabled = save.settings.sound;
      applyControlPrefs();
      fx.cap = outfitById(save.outfit).cap;
      writeSave(save);
      toMenu();
      return true;
    },
    copyBackup: () => void navigator.clipboard?.writeText(exportSave(save)).catch(() => {}),
    downloadBackup,
    shareBackup: () => void shareBackup(),
  },
  `${__BUILD_LABEL__} · ${__BUILD_SHA__}`,
);

function toMenu(): void {
  mode = 'menu';
  walkScreen.hide();
  controls.enabled = false;
  hudRoot.hidden = true;
  game = makeDemo();
  level = game.level;
  snapCamera = true;
  acc = 0;
  const lock = save.walk?.lock;
  if (save.walk && lock) {
    noteVisibility(lock, document.hidden);
    writeSave(save);
    screens.lockWaiting(save.walk);
    return;
  }
  screens.menu(save, updateReady);
}

function startCommute(number: number, seed: number = randomSeed()): void {
  sfx.unlock();
  if (dailyKey !== dayKey() || seed !== dailySeed(dailyKey)) dailyKey = null;
  level = generateLevel(number, seed);
  game = createGame(level);
  hud.reset();
  hud.configure(game.persona);
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
  hud.say(`Platform ${level.platform}, Car ${level.car}: find the green door`, 2.6);
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
  const lock = save.walk?.lock;
  if (save.walk && lock) {
    noteVisibility(lock, document.hidden);
    writeSave(save);
    if (!document.hidden && mode !== 'walk') screens.lockWaiting(save.walk);
  }
});
// iOS can drop a backgrounded page without warning: record that the screen went away.
addEventListener('pagehide', () => {
  const lock = save.walk?.lock;
  if (lock) {
    noteVisibility(lock, true);
    writeSave(save);
  }
});
// iOS Safari ignores touch-action for pinch; stop the page zooming under a thumb mid-game.
document.addEventListener('gesturestart', (e) => e.preventDefault());

function vibrate(ms: number | number[]): void {
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
      if (Math.hypot(e.x - game.player.x, e.y - game.player.y) < 7) sfx.play('ping', (e.x - game.player.x) / 6);
      break;
    case 'honk':
      sfx.play('honk', (e.x - game.player.x) / 7);
      break;
    case 'trainLeft':
      sfx.play('trainLeft');
      hud.say('You missed it! Next train in 25 seconds', 2.6);
      break;
    case 'exhausted':
      hud.say('Out of breath!', 1.4);
      break;
    case 'liftStart':
      hud.say('Lift: doors closing...', 2.2);
      break;
    case 'liftEnd':
      sfx.play('lift');
      break;
    case 'wrongWay':
      sfx.play('wrong');
      hud.say('Dead end! Wrong platform. Turn back', 2.8);
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
  lastShare = '';
  save.stats.bumps += game.hits;
  save.stats.nearMisses += game.nearMisses;
  if (game.status === 'won') {
    const r = scoreResult(game);
    save.stats.commutes += 1;
    save.bestLevel = Math.max(save.bestLevel, level.number);
    if (dailyKey) {
      recordDaily(save.daily, dailyKey, r.score);
      lastShare = `I made today's Phone Zombies Commute with ${r.stars} star${r.stars === 1 ? '' : 's'} and ${r.score} points. Can you?`;
      writeSave(save);
      screens.dailyWon(level, r, save.daily.streak, save.daily.score);
      return;
    }
    save.stars[level.number] = Math.max(save.stars[level.number] ?? 0, r.stars);
    save.run.level = level.number + 1;
    save.run.score += r.score;
    const newBest = save.run.score > save.highScore;
    save.highScore = Math.max(save.highScore, save.run.score);
    lastShare = `I made Commute #${level.number} in Phone Zombies Commute with ${r.stars} star${r.stars === 1 ? '' : 's'} (run score ${save.run.score}), and I have walked ${save.stats.steps} real steps to keep my runs alive.`;
    writeSave(save);
    screens.won(level, r, newBest);
  } else {
    const score = Math.round(game.score);
    const progress = Math.round(100 * (1 - game.player.y / level.height));
    if (dailyKey) {
      writeSave(save);
      screens.dailyLost(score, progress);
      return;
    }
    save.walk = { required: stepsRequired(save.run.continues), pure: 0, zombie: 0, level: level.number, seed: level.seed, lock: null };
    writeSave(save);
    screens.lost(level, score, progress, save.walk, save.run);
  }
}

let lastShare = '';

async function shareResult(): Promise<void> {
  const url = location.href.split('#')[0] ?? location.href;
  try {
    await navigator.share({ title: 'Phone Zombies Commute', text: lastShare, url });
  } catch {
    // Cancelled, or sharing is not available: nothing to do.
  }
}

function backupFile(): File {
  return new File([exportSave(save)], `phone-zombies-commute-${dayKey()}.json`, { type: 'application/json' });
}

function downloadBackup(): void {
  const url = URL.createObjectURL(backupFile());
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFile().name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function shareBackup(): Promise<void> {
  const file = backupFile();
  try {
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Phone Zombies Commute backup' });
    else await navigator.share({ title: 'Phone Zombies Commute backup', text: exportSave(save) });
  } catch {
    // Cancelled.
  }
}

let live: LiveWalk | null = null;
let wantedLocation = false;
const walkScreen = new WalkScreen(appRoot);
walkScreen.onMilestone = () => {
  vibrate(40);
  sfx.play('tap');
};

function walkLive(): void {
  const walk = save.walk;
  if (!walk) return;
  sfx.unlock();
  let wasDone = false;
  let countedPure = walk.pure;
  let countedZombie = walk.zombie;
  const session = new LiveWalk(
    walk,
    (view) => {
      walkScreen.update(view);
      if (view.phase === 'done' && !wasDone) {
        wasDone = true;
        sfx.play('win');
        vibrate([120, 60, 120]);
      }
    },
    () => {
      save.stats.steps += walk.pure - countedPure;
      save.stats.zombieSteps += walk.zombie - countedZombie;
      countedPure = walk.pure;
      countedZombie = walk.zombie;
      writeSave(save);
    },
  );
  live = session;
  mode = 'walk';
  screens.hide();
  walkScreen.show(stopLive, finishWalk);
  walkScreen.update({ phase: 'starting', pure: walk.pure, zombie: walk.zombie, required: walk.required, awake: true });
  void session.start().then((permission) => {
    if (permission === 'granted') return;
    stopLive(
      permission === 'denied'
        ? 'Motion access was denied. Allow it in your browser settings, or lock your phone and walk instead.'
        : 'This device does not share motion sensors with the browser. Lock your phone and walk instead.',
    );
  });
}

function stopLive(message = ''): void {
  live?.stop();
  live = null;
  walkScreen.hide();
  mode = 'menu';
  writeSave(save);
  if (save.walk) screens.continueScreen(save.walk, save.run, message);
  else toMenu();
}

async function walkLock(withLocation: boolean): Promise<void> {
  const walk = save.walk;
  if (!walk) return;
  sfx.unlock();
  wantedLocation = withLocation;
  await beginLock(walk, withLocation);
  writeSave(save);
  screens.lockWaiting(walk);
}

async function doCheckIn(): Promise<void> {
  const walk = save.walk;
  if (!walk) return;
  const before = walk.pure;
  const outcome = await checkIn(walk);
  save.stats.steps += walk.pure - before;
  writeSave(save);
  if (outcome.credit.steps > 0) sfx.play(walk.pure >= walk.required ? 'win' : 'coffee');
  screens.checkInResult(walk, outcome, save.run);
}

function finishWalk(): void {
  const walk = save.walk;
  live?.stop();
  live = null;
  walkScreen.hide();
  if (!walk) {
    toMenu();
    return;
  }
  save.run.continues += 1;
  save.walk = null;
  writeSave(save);
  startCommute(walk.level, walk.seed);
}

function giveUp(): void {
  live?.stop();
  live = null;
  save.highScore = Math.max(save.highScore, save.run.score);
  save.run = { level: 1, score: 0, continues: 0 };
  save.walk = null;
  writeSave(save);
  toMenu();
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
  if (mode === 'walk') {
    last = now;
    requestAnimationFrame(frame);
    return;
  }
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
