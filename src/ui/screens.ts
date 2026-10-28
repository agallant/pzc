import { PERSONAS } from '../game/personas';
import type { Level } from '../game/types';
import type { Result } from '../game/sim';
import type { Run, Save, Settings, WalkRecord } from '../platform/storage';
import type { CheckInOutcome } from '../walk/lock';

export interface ScreenActions {
  play(): void;
  resume(): void;
  quit(): void;
  next(): void;
  setSetting(key: keyof Settings, value: boolean): void;
  reset(): void;
  reload(): void;
  walkLive(): void;
  walkLock(withLocation: boolean): void;
  checkIn(): void;
  keepWalking(): void;
  cancelLock(): void;
  finishWalk(): void;
  giveUp(): void;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function starRow(n: number): string {
  return `<span class="stars" role="img" aria-label="${n} of 3 stars">${[1, 2, 3].map((i) => `<span class="star${i <= n ? ' on' : ''}" aria-hidden="true">★</span>`).join('')}</span>`;
}

const TIPS = [
  'Drag anywhere to walk. Hold RUN to hurry, but it tires you out.',
  'Wait for the green walking signal. Cars do not care about your schedule.',
  'Phones light up before their owners stop dead. Watch for the red "!".',
  'Streams of commuters cross the station hall. Time your gap.',
  'Brush past a zombie without touching to score an "Excuse me!" combo.',
  'Grab the coffee for a speed boost and a full tank.',
  'Stairs are slow and tiring. Escalators are fast, until someone stands on the left. The lift is slow but sure, if it works.',
  'Signs point the way to your platform. Some are in the local language only, and some are missing. A coloured line on the floor may help.',
];

function tipFor(level: Level): string {
  if (level.persona !== 'commuter') return PERSONAS[level.persona].blurb;
  if (level.number === 2) return TIPS[6] as string;
  if (level.number === 3) return TIPS[7] as string;
  if (level.signMode === 'missing') return 'Signs can go missing. Look for a coloured guidance line on the floor, or pick by elimination.';
  return TIPS[(level.number - 1) % TIPS.length] as string;
}

/** Full-screen overlays (menu, briefing, pause, results). Plain DOM, so it is accessible by default. */
export class Screens {
  private onClick: (action: string, el: HTMLElement) => void = () => {};

  constructor(private readonly root: HTMLElement, private readonly actions: ScreenActions, private build: string) {
    root.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (target) this.onClick(target.dataset.action ?? '', target);
    });
    root.addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.setting) this.actions.setSetting(t.dataset.setting as keyof Settings, t.checked);
    });
  }

  get visible(): boolean {
    return this.root.classList.contains('open');
  }

  hide(): void {
    this.root.classList.remove('open');
    this.root.innerHTML = '';
  }

  private show(html: string, handlers: Record<string, (el: HTMLElement) => void>, dim = true): void {
    this.root.innerHTML = html;
    this.root.classList.add('open');
    this.root.classList.toggle('dim', dim);
    this.onClick = (action, el) => handlers[action]?.(el);
    this.root.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true });
  }

  menu(save: Save, updateReady: boolean): void {
    const n = save.run.level;
    const walk = save.walk;
    const inRun = save.run.level > 1 || save.run.score > 0;
    const stats = save.highScore > 0 ? `<p class="muted">Best run <b>${save.highScore}</b> &middot; Furthest commute <b>${save.bestLevel}</b></p>` : '';
    const runLine = inRun ? `<p class="muted">Run score <b>${save.run.score}</b> &middot; Continues used <b>${save.run.continues}</b></p>` : '';
    const primary = walk
      ? `<button class="btn primary" data-action="walk" data-autofocus>Walk to continue (${walk.pure}/${walk.required})</button>`
      : `<button class="btn primary" data-action="play" data-autofocus>${n === 1 && !inRun ? 'Start commuting' : `Commute #${n}`}</button>`;
    this.show(
      `<div class="card menu">
        <p class="eyebrow">An arcade commute</p>
        <h1>Phone Zombies <span>Commute</span></h1>
        <p class="lede">Cross the city to your train. Everyone else is staring at a phone. Don&rsquo;t get bumped. Don&rsquo;t become one of them.</p>
        ${primary}
        <div class="row">
          <button class="btn" data-action="how">How to play</button>
          <button class="btn" data-action="settings">Settings</button>
        </div>
        ${runLine}${stats}
        ${updateReady ? '<button class="btn banner" data-action="reload">New version ready. Tap to reload</button>' : ''}
      </div>`,
      {
        play: () => this.actions.play(),
        walk: () => this.continueScreen(save.walk as WalkRecord, save.run),
        how: () => this.how(save, updateReady),
        settings: () => this.settings(save, updateReady),
        reload: () => this.actions.reload(),
      },
    );
  }

  private how(save: Save, updateReady: boolean): void {
    this.show(
      `<div class="card">
        <h2>How to play</h2>
        <ul class="tips">${TIPS.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        <p class="muted">Run out of hearts and you can only continue by taking a real walk, phone in your pocket. The further into a run, the longer the walk.</p>
        <button class="btn primary" data-action="back" data-autofocus>Back</button>
      </div>`,
      { back: () => this.menu(save, updateReady) },
    );
  }

  settings(save: Save, updateReady: boolean): void {
    const s = save.settings;
    this.show(
      `<div class="card">
        <h2>Settings</h2>
        <label class="toggle"><input type="checkbox" data-setting="sound" ${s.sound ? 'checked' : ''} /> <span>Sound effects</span></label>
        <label class="toggle"><input type="checkbox" data-setting="haptics" ${s.haptics ? 'checked' : ''} /> <span>Vibration</span></label>
        <button class="btn danger" data-action="reset">Reset progress</button>
        <p class="muted build">Build ${esc(this.build)}</p>
        <button class="btn primary" data-action="back" data-autofocus>Back</button>
      </div>`,
      {
        back: () => this.menu(save, updateReady),
        reset: (el) => {
          if (el.dataset.armed) this.actions.reset();
          else {
            el.dataset.armed = '1';
            el.textContent = 'Tap again to erase everything';
          }
        },
      },
    );
  }

  briefing(level: Level): void {
    const tip = tipFor(level);
    const persona = PERSONAS[level.persona];
    const who = level.persona === 'commuter' ? '' : `<p class="persona"><b>Today you are:</b> ${esc(persona.name)}</p>`;
    this.show(
      `<div class="card">
        <p class="eyebrow">Commute #${level.number}</p>
        <h2>${esc(level.from)} <span class="arrow" aria-label="to">&rarr;</span> ${esc(level.to)}</h2>
        <p class="lede">Your train leaves from <b>Platform ${level.platform}</b>, <b>Car ${level.car}</b>. The doors close in <b>${level.timeLimit} seconds</b>.</p>
        ${who}
        <p class="tip">${esc(tip)}</p>
        <button class="btn primary" data-action="go" data-autofocus>Go!</button>
      </div>`,
      { go: () => this.actions.resume() },
    );
  }

  pause(): void {
    this.show(
      `<div class="card">
        <h2>Paused</h2>
        <button class="btn primary" data-action="resume" data-autofocus>Resume</button>
        <button class="btn" data-action="quit">Quit to menu</button>
      </div>`,
      { resume: () => this.actions.resume(), quit: () => this.actions.quit() },
    );
  }

  won(level: Level, r: Result, newBest: boolean): void {
    this.show(
      `<div class="card">
        <p class="eyebrow">Commute #${level.number} complete</p>
        <h2>You made the train!</h2>
        ${starRow(r.stars)}
        <p class="score-big">${r.score}${newBest ? ' <span class="badge">New best</span>' : ''}</p>
        <p class="muted">Time bonus ${r.timeBonus} &middot; Hearts bonus ${r.heartBonus}</p>
        <button class="btn primary" data-action="next" data-autofocus>Next commute</button>
        <button class="btn" data-action="quit">Menu</button>
      </div>`,
      { next: () => this.actions.next(), quit: () => this.actions.quit() },
      false,
    );
  }

  lost(level: Level, score: number, progress: number, walk: WalkRecord, run: Run): void {
    this.show(
      `<div class="card">
        <p class="eyebrow">Commute #${level.number}</p>
        <h2>Phone-zombified!</h2>
        <p class="lede">You got bumped one time too many and ended up staring at your screen like everybody else. You covered ${progress}% of the way (${score} points).</p>
        <button class="btn primary" data-action="walk" data-autofocus>Walk to continue</button>
        <button class="btn" data-action="giveUp">Give up and start a new run</button>
      </div>`,
      { walk: () => this.continueScreen(walk, run), giveUp: () => this.giveUpConfirm(walk, run) },
      false,
    );
  }

  private giveUpConfirm(walk: WalkRecord, run: Run): void {
    this.show(
      `<div class="card">
        <h2>Give up this run?</h2>
        <p class="lede">Your run score of <b>${run.score}</b> is banked, and you start again from Commute 1.</p>
        <button class="btn danger" data-action="yes" data-autofocus>Yes, start a new run</button>
        <button class="btn" data-action="no">Back</button>
      </div>`,
      { yes: () => this.actions.giveUp(), no: () => this.continueScreen(walk, run) },
    );
  }

  continueScreen(walk: WalkRecord, run: Run, message = ''): void {
    if (walk.lock) {
      this.lockWaiting(walk);
      return;
    }
    const left = walk.required - walk.pure;
    const pct = Math.round((100 * walk.pure) / walk.required);
    const ready = left <= 0;
    this.show(
      `<div class="card walkcard">
        <p class="eyebrow">Continue #${run.continues + 1}</p>
        <h2>${ready ? 'You walked it off!' : 'Take a real walk'}</h2>
        ${message ? `<p class="notice" role="alert">${esc(message)}</p>` : ''}
        ${
          ready
            ? '<p class="lede">All the steps are in. Phone out, commuter. Your train is waiting.</p>'
            : `<p class="lede">Walk <b>${left}</b> more pure steps. Pure means no phone use: not looking at it, not touching it. Zombie steps don&rsquo;t count.</p>`
        }
        <div class="meter" role="img" aria-label="${walk.pure} of ${walk.required} pure steps"><div class="meter-fill" style="width:${pct}%"></div></div>
        ${walk.zombie > 0 ? `<p class="muted">Zombie steps so far: ${walk.zombie} (not counted)</p>` : ''}
        ${
          ready
            ? '<button class="btn primary" data-action="finish" data-autofocus>Back to the commute</button>'
            : `<button class="btn primary" data-action="live" data-autofocus>Walk with the screen on</button>
               <p class="muted small">Pocket the phone. Steps are counted live; the screen stays on and goes black.</p>
               <button class="btn" data-action="lock">Lock my phone and walk</button>
               <p class="muted small">Check in when you&rsquo;re back. Counts the time the screen was off.</p>
               <label class="toggle small"><input type="checkbox" id="loc" /> <span>Verify with my location for full credit (optional, stays on this phone)</span></label>`
        }
        <button class="btn quiet" data-action="giveUp">Give up and start a new run</button>
      </div>`,
      {
        live: () => this.actions.walkLive(),
        lock: () => this.actions.walkLock((this.root.querySelector<HTMLInputElement>('#loc')?.checked) ?? false),
        finish: () => this.actions.finishWalk(),
        giveUp: () => this.giveUpConfirm(walk, run),
      },
    );
  }

  lockWaiting(walk: WalkRecord): void {
    const lock = walk.lock;
    const away = lock ? Math.round((lock.hiddenMs + (lock.hiddenAt !== null ? Date.now() - lock.hiddenAt : 0)) / 60000) : 0;
    this.show(
      `<div class="card walkcard">
        <p class="eyebrow">Lock and walk</p>
        <h2>${away >= 1 ? 'Welcome back!' : 'Lock it and go'}</h2>
        <p class="lede">${
          away >= 1
            ? `Your screen was off for about <b>${away} min</b>. Tap check in to bank it.`
            : 'Lock your phone, put it away, and go for a walk. Open the app again when you want to check in.'
        }</p>
        <p class="muted">${walk.pure}/${walk.required} steps so far${lock?.fix ? ' &middot; location check on' : ''}</p>
        <button class="btn primary" data-action="checkin" data-autofocus>Check in</button>
        <button class="btn" data-action="cancel">Cancel this walk</button>
      </div>`,
      { checkin: () => this.actions.checkIn(), cancel: () => this.actions.cancelLock() },
    );
  }

  checkInResult(walk: WalkRecord, o: CheckInOutcome, run: Run): void {
    const c = o.credit;
    const done = walk.pure >= walk.required;
    const line =
      c.reason === 'vehicle'
        ? 'That looked like a bike, a car or a train, not a walk. No steps this time.'
        : c.reason === 'too short'
          ? 'You were away less than 20 seconds. Walk a bit longer, then check in.'
          : `Counted <b>${c.steps}</b> steps${c.verified ? ' (verified by your location)' : ' (honour system: time away at a discount)'}.`;
    this.show(
      `<div class="card walkcard">
        <p class="eyebrow">Checked in</p>
        <h2>${done ? 'You walked it off!' : 'Nice walk'}</h2>
        <p class="lede">${line}</p>
        ${o.locationFailed ? '<p class="muted">We could not get a location fix, so this counted as an honour-system walk.</p>' : ''}
        <p class="muted">${walk.pure}/${walk.required} pure steps</p>
        ${
          done
            ? '<button class="btn primary" data-action="finish" data-autofocus>Back to the commute</button>'
            : '<button class="btn primary" data-action="again" data-autofocus>Keep walking</button><button class="btn" data-action="more">Other options</button>'
        }
      </div>`,
      {
        finish: () => this.actions.finishWalk(),
        again: () => this.actions.keepWalking(),
        more: () => this.continueScreen(walk, run),
      },
    );
  }
}
