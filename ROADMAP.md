# Roadmap

North star: a fun, addictive arcade game that quietly nudges people to put the phone away and walk.
Each milestone ships as one reviewable PR that is playable on its own.

## Design pillars

1. **Real-time and physical.** You steer a person through a crowd with a thumb. No turn-taking.
2. **The crowd is the enemy and the joke.** Phone zombies are predictable *if you read their tells*
   (a notification glow, then a dead stop; herds that walk abreast; streams that never look up).
3. **Transit is hostile to tired people.** Confusing signage, stairs, crowds and broken gates
   are obstacles in their own right, and your character gets tired, burdened or injured.
4. **Bite-sized.** A commute is 1 to 2 minutes, generated from a seed. Always "one more try".
5. **The continue is the point.** Out of hearts means a real walk, phone away. It must be
   honest about what a browser can know, and generous where it can't.

## Milestones

### M1: Bootstrap and the core commute (this PR)
- Vite + TypeScript PWA: manifest, icons, offline service worker (previews excluded), update prompt.
- Seeded level generator: street, signalled crossing, station concourse with ticket gates, platform with the train.
- Fixed-timestep simulation (pure, unit-tested): player, sprint and stamina, zombie behaviours
  (shufflers, herds, stoppers that ping first, commuter streams, crossing crowds, queues), cars on signal phases.
- Hearts, timer ("doors close"), near-miss combo scoring, coins, coffee, stars, local progress.
- Canvas renderer, floating joystick + run button, keyboard, synthesized sound, haptics, reduced-motion.
- Menu, briefing, pause, results. Game over is a placeholder for M3.

### M2: Mass transit is confusing (done)
- Stairs vs escalator vs elevator choices: stairs drain stamina, escalators are crowded and one-way,
  elevators are slow and shared. Burden and fatigue modifiers change the numbers.
- Forks with signage: sometimes missing, inconsistent between operators, wrong language first.
  A foreigner mode where signs are glyph-only and you learn symbols across levels.
- Segment variety: subway interchange, bus stop, bike lanes, e-scooters, rain, rush-hour surge.
- Commuter personas for the player (tourist with suitcase, tired shift worker, crutches) with distinct handling.

### M3: Walk to continue (the twist) (done)
Browsers cannot read a pedometer, and a page gets no sensor data once the screen locks, so we combine
two modes and let the player pick:

- **Pocket mode** (best accuracy, needs the motion-sensor permission): black screen with a wake lock,
  `devicemotion` step detection (peak detection on gravity-removed acceleration, with cadence limits).
  A step only counts as *pure* if there was no touch input and the phone is not held in the "zombie
  posture" (tilted toward the face, steady). Touching the screen or lifting it up turns steps into
  zombie steps, which are shown and not counted. iOS needs `DeviceMotionEvent.requestPermission()`
  from a tap; Safari supports Screen Wake Lock since 16.4, with a fallback.
- **Check-in mode** (works with the screen off): start a walk, lock the phone, and check in when back.
  `visibilitychange` timestamps give time away. Credit = capped time away x calibrated cadence,
  discounted. An optional one-shot location fix at start and end (Geolocation, only if the player
  opts in) turns it into verified distance, which earns full credit and a bonus. No tracking, no upload.
- Required pure steps grow with every continue within a run (100, 200, 350, 550, 800, 1100, 1500), and
  reset with a new run. Progress is saved so a walk survives closing the app. Giving up banks the run
  score and starts over from Commute 1, so walking is the only way to keep a run alive.
- Steps are held back for two seconds before they count, so picking the phone up cannot bank them.
- Not done yet: timestamp each location fix, so the speed check counts the delay in getting the ending fix
  (a very brisk walk with a slow fix can read as a vehicle).
- Not done yet: a calibration screen to learn the player's own cadence and stride (defaults: 100 steps
  per minute, 0.74 m stride).

### M4: Addictive loop and progression (first part done)
- Done: daily commute (same seed for everyone on a date, with a streak), lifetime stats, caps unlocked by
  walking, backup/restore of the save (copy, file, share), share text, red danger vignette at one heart,
  positional notification and horn sounds.
- Still to do: more city looks and signage per region, a share image, a local leaderboard, music that
  reacts to danger, zombie groans.

### M5: Polish and balance (second part started)
- Done: a left-handed layout (run button on the left), a larger-controls mode, a larger-text setting, signals that carry a
  shape as well as a colour for colour-blind players, and a camera that sits a little closer on tall screens.
- Done: a steering bot (`tests/bot.ts`) that follows the route, dodges zombies and waits for the green man,
  and a regression test that keeps the shape of the difficulty curve. The slow full measurement is opt-in:
  `PZC_BALANCE=1 npx vitest run tests/balance.test.ts --silent=false`.
- What the bot says (16 seeds a level, careful skill): it wins about 75% of levels 1 and 2, about 50% of
  level 4, 20 to 45% of levels 5 to 12, and mostly 20 to 40% after that, falling to about 6% at level 20,
  so the curve does slope, with noise from only 16 seeds a level. The bot reads exact zombie and
  signal state and has not been compared with a person, so these rates say nothing yet about how
  often people win. Real playtesting is needed to decide how steep the curve should be.
- Still to do: performance profiling on low-end Android, Lighthouse tuning, localisation scaffold.
  Checked in a headless browser at 1024x768, 768x1024 and 667x375: menus and the game fit, and Settings
  now uses two columns on short landscape screens. Still to check on real tablets and phones. Bot follow-up: its red-light heading reflection is not scored
  against zombies and walls (`tests/bot.ts`), which can slightly skew the measurement.

## Decisions and open questions

- **Stack:** Vite + TypeScript, Canvas 2D, no framework or runtime dependencies. A game this small is
  lighter and faster without a UI framework; the DOM is used for menus and HUD so they stay accessible.
- **Service worker:** hand-written and generated at build time (precache list + content hash), so there
  is no plugin to track and previews under `/pr-preview/` are never served from the live cache.
- **Levels** are generated from `seed` and `commute number`; a new seed is drawn every attempt.
- **Open:** how strict the "pure steps" check should be without sensor access in the background. The
  plan is to be honest in the UI about which mode is verified, and to make cheating cost more effort
  than walking.
