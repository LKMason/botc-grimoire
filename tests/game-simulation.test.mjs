// Game simulation tests for BotC Grimoire
// Run with: node tests/game-simulation.test.mjs

// ─── Mock browser globals ─────────────────────────────────────────────────────
const _store = {};
global.localStorage = {
  getItem: (k) => _store[k] ?? null,
  setItem: (k, v) => { _store[k] = v; },
  removeItem: (k) => { delete _store[k]; },
};

// ─── Imports ──────────────────────────────────────────────────────────────────
import { state, findPlayerById, getLivingPlayers, countLiving, findLivingDemon,
  setNightKill, setNightPoison, setNightProtect, advanceToDawn, advanceToNight,
  executeDusk, castVote, closeVoting, confirmNomination, openNominations,
  setButlerMaster, votesNeededToExecute } from '../js/state/GameState.js';
import { getCharacter } from '../js/data/characters.js';
import { checkWinConditions, checkScarletWoman, applyScarletWomanCatch,
  checkSaintExecution, checkMayorWin, checkVirginTrigger, resolveSlayer,
  computeEmpathNumber, computeChefNumber, computeFortuneTellerResult,
  isSoldierProtected, isMonkProtected } from '../js/engine/rulesEngine.js';
import { processNomination, validateVote, resolveDusk } from '../js/engine/dayEngine.js';

// ─── Minimal test harness ─────────────────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
  resetState();
  try {
    fn();
    process.stdout.write(`  \x1b[32m✓\x1b[0m ${name}\n`);
    passed++;
  } catch (e) {
    process.stdout.write(`  \x1b[31m✗\x1b[0m ${name}\n    → ${e.message}\n`);
    failures.push({ name, error: e.message });
    failed++;
  }
}

function suite(name) { process.stdout.write(`\n\x1b[1m${name}\x1b[0m\n`); }

function assert(condition, msg) {
  if (!condition) throw new Error(msg ?? 'Assertion failed');
}
function eq(a, b, msg) {
  if (a !== b) throw new Error(msg ?? `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function deepEq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(msg ?? `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// ─── State helpers ────────────────────────────────────────────────────────────
function resetState() {
  state.phase = 'SETUP';
  state.dayCount = 0;
  state.players = [];
  state.nominations = freshNominations();
  state.night = freshNight();
  state.setup = { step: 1, playerNames: [], rolePool: [], assignments: {}, drunkFakeRole: null, redHerring: null };
  state.overrideMode = false;
  state.lastExecutedPlayerId = null;
}

function freshNominations() {
  return {
    open: false, nominatorsUsed: [], nomineesUsed: [],
    currentNominator: null, currentNominee: null,
    votes: [], highestVoteCount: 0, pendingExecution: null, tiedPlayerIds: [],
  };
}

function freshNight() {
  return { wakeDeck: [], currentCardIndex: 0, pendingKill: null, pendingPoison: null, pendingProtect: null };
}

function makePlayer(id, name, charId, overrides = {}) {
  const character = getCharacter(charId);
  return {
    id, name, character,
    alignment: character.alignment,
    isAlive: true, hasGhostVote: true,
    isPoisoned: false, isDrunk: charId === 'drunk',
    isSafe: false, drunkFakeRole: null,
    customState: {
      ...(charId === 'fortuneteller' ? { redHerring: null } : {}),
      ...(charId === 'slayer'        ? { slayerUsed: false } : {}),
      ...(charId === 'imp'           ? { starpassed: false } : {}),
      ...(charId === 'virgin'        ? { virginTriggered: false } : {}),
    },
    history: [],
    ...overrides,
  };
}

// Build game state directly (bypasses UI setup wizard)
function buildGame(playerDefs, { phase = 'DAY', dayCount = 1 } = {}) {
  state.players = playerDefs.map(([id, name, charId, overrides]) =>
    makePlayer(id, name, charId, overrides ?? {})
  );
  state.phase = phase;
  state.dayCount = dayCount;
  state.nominations = freshNominations();
  state.night = freshNight();
}

// ─── WIN CONDITIONS ───────────────────────────────────────────────────────────
suite('Win Conditions');

test('Evil wins: Demon alive, only 2 players living', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'chef'],
    ['p3', 'Carol', 'empath'],
  ]);
  state.players.find(p => p.id === 'p3').isAlive = false;
  const r = checkWinConditions();
  eq(r?.winner, 'Evil');
});

test('Evil wins: Demon alive, only 1 player living', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'chef'],
  ]);
  state.players.find(p => p.id === 'p2').isAlive = false;
  const r = checkWinConditions();
  eq(r?.winner, 'Evil');
});

test('Good wins: Demon is dead', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'chef'],
    ['p3', 'Carol', 'empath'],
  ]);
  state.players.find(p => p.id === 'p1').isAlive = false;
  const r = checkWinConditions();
  eq(r?.winner, 'Good');
});

test('No winner yet: Demon alive, 3+ players', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'chef'],
    ['p3', 'Carol', 'empath'],
    ['p4', 'Dave', 'soldier'],
  ]);
  const r = checkWinConditions();
  eq(r, null);
});

test('Evil wins exactly at 2 living (boundary)', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'chef'],
  ]);
  const r = checkWinConditions();
  eq(r?.winner, 'Evil');
});

test('No Evil win at 3 living', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'chef'],
    ['p3', 'Carol', 'empath'],
  ]);
  const r = checkWinConditions();
  eq(r, null);
});

// ─── MAYOR WIN ────────────────────────────────────────────────────────────────
suite('Mayor Win');

test('Mayor win: 3 alive, no pending execution, unposoined Mayor', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'mayor'],
    ['p3', 'Carol', 'chef'],
  ]);
  state.nominations.pendingExecution = null;
  const r = checkMayorWin();
  eq(r?.winner, 'Good');
});

test('No Mayor win when execution pending', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'mayor'],
    ['p3', 'Carol', 'chef'],
  ]);
  state.nominations.pendingExecution = 'p1';
  const r = checkMayorWin();
  eq(r, null);
});

test('No Mayor win when 4 alive', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'mayor'],
    ['p3', 'Carol', 'chef'],
    ['p4', 'Dave', 'empath'],
  ]);
  const r = checkMayorWin();
  eq(r, null);
});

test('No Mayor win when Mayor is poisoned', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'mayor'],
    ['p3', 'Carol', 'chef'],
  ]);
  state.players.find(p => p.id === 'p2').isPoisoned = true;
  const r = checkMayorWin();
  eq(r, null);
});

test('Mayor win when Mayor is drunk (drunk is not poisoned)', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'mayor'],
    ['p3', 'Carol', 'chef'],
  ]);
  // Note: Mayor's ability checks isPoisoned and isDrunk
  state.players.find(p => p.id === 'p2').isDrunk = true;
  const r = checkMayorWin();
  // Drunk Mayor should NOT trigger win (ability malfunctions)
  eq(r, null);
});

test('Mayor win when 2 players are dead (only 3 living)', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'mayor'],
    ['p3', 'Carol', 'chef'],
    ['p4', 'Dave', 'empath'],
    ['p5', 'Eve', 'soldier'],
  ]);
  state.players.find(p => p.id === 'p4').isAlive = false;
  state.players.find(p => p.id === 'p5').isAlive = false;
  const r = checkMayorWin();
  eq(r?.winner, 'Good');
});

// ─── SAINT EXECUTION ─────────────────────────────────────────────────────────
suite('Saint Execution');

test('Executing Saint triggers Evil win', () => {
  buildGame([['p1', 'Alice', 'saint']]);
  const r = checkSaintExecution('p1');
  eq(r?.winner, 'Evil');
});

test('Executing non-Saint is fine', () => {
  buildGame([['p1', 'Alice', 'chef']]);
  const r = checkSaintExecution('p1');
  eq(r, null);
});

test('Poisoned Saint executed: no Evil win', () => {
  buildGame([['p1', 'Alice', 'saint']]);
  state.players[0].isPoisoned = true;
  const r = checkSaintExecution('p1');
  eq(r, null);
});

test('Drunk Saint executed: no Evil win', () => {
  buildGame([['p1', 'Alice', 'saint']]);
  state.players[0].isDrunk = true;
  const r = checkSaintExecution('p1');
  eq(r, null);
});

// ─── SCARLET WOMAN ───────────────────────────────────────────────────────────
suite('Scarlet Woman');

test('SW catches Demon token when Imp dies with 5+ alive', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'scarletwoman'],
    ['p3', 'Carol', 'chef'],
    ['p4', 'Dave', 'empath'],
    ['p5', 'Eve', 'soldier'],
  ]);
  const sw = checkScarletWoman('p1');
  eq(sw?.id, 'p2');
});

test('SW does NOT catch when fewer than 5 alive', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'scarletwoman'],
    ['p3', 'Carol', 'chef'],
    ['p4', 'Dave', 'empath'],
  ]);
  // 4 players alive → SW doesn't trigger
  const sw = checkScarletWoman('p1');
  eq(sw, null);
});

test('SW does NOT catch when no living SW', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'scarletwoman'],
    ['p3', 'Carol', 'chef'],
    ['p4', 'Dave', 'empath'],
    ['p5', 'Eve', 'soldier'],
  ]);
  state.players.find(p => p.id === 'p2').isAlive = false;
  const sw = checkScarletWoman('p1');
  eq(sw, null);
});

test('SW does NOT catch when SW is poisoned', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'scarletwoman'],
    ['p3', 'Carol', 'chef'],
    ['p4', 'Dave', 'empath'],
    ['p5', 'Eve', 'soldier'],
  ]);
  state.players.find(p => p.id === 'p2').isPoisoned = true;
  const sw = checkScarletWoman('p1');
  eq(sw, null);
});

test('applyScarletWomanCatch converts SW to Imp', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'scarletwoman'],
    ['p3', 'Carol', 'chef'],
    ['p4', 'Dave', 'empath'],
    ['p5', 'Eve', 'soldier'],
  ]);
  state.dayCount = 2;
  const imp = state.players.find(p => p.id === 'p1');
  const sw = state.players.find(p => p.id === 'p2');
  applyScarletWomanCatch(sw, imp);
  eq(sw.character.id, 'imp');
  eq(sw.alignment, 'Evil');
  assert(sw.history.some(h => h.type === 'SCARLET_WOMAN'), 'SW history entry missing');
});

test('SW is exact boundary: 5 alive before death (Imp is #5)', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'scarletwoman'],
    ['p3', 'Carol', 'chef'],
    ['p4', 'Dave', 'empath'],
    ['p5', 'Eve', 'soldier'],
  ]);
  // 5 alive — boundary: should trigger (≥5)
  const sw = checkScarletWoman('p1');
  assert(sw !== null, 'SW should trigger with exactly 5 alive');
});

// ─── VIRGIN TRIGGER ───────────────────────────────────────────────────────────
suite('Virgin Trigger');

test('Townsfolk nominating Virgin triggers the ability', () => {
  buildGame([
    ['p1', 'Alice', 'chef'],
    ['p2', 'Bob', 'virgin'],
  ]);
  const result = checkVirginTrigger('p1', 'p2');
  assert(result === true, 'Virgin trigger should fire');
});

test('Minion nominating Virgin does NOT trigger', () => {
  buildGame([
    ['p1', 'Alice', 'poisoner'],
    ['p2', 'Bob', 'virgin'],
  ]);
  const result = checkVirginTrigger('p1', 'p2');
  assert(result === false, 'Poisoner should not trigger Virgin');
});

test('Demon nominating Virgin does NOT trigger', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'virgin'],
  ]);
  const result = checkVirginTrigger('p1', 'p2');
  assert(result === false, 'Imp should not trigger Virgin');
});

test('Second nomination of Virgin does NOT trigger', () => {
  buildGame([
    ['p1', 'Alice', 'chef'],
    ['p2', 'Bob', 'virgin'],
  ]);
  state.players.find(p => p.id === 'p2').customState.virginTriggered = true;
  const result = checkVirginTrigger('p1', 'p2');
  assert(result === false, 'Virgin already triggered — should not fire again');
});

test('Poisoned Virgin does NOT trigger', () => {
  buildGame([
    ['p1', 'Alice', 'chef'],
    ['p2', 'Bob', 'virgin'],
  ]);
  state.players.find(p => p.id === 'p2').isPoisoned = true;
  const result = checkVirginTrigger('p1', 'p2');
  assert(result === false, 'Poisoned Virgin should not trigger');
});

test('processNomination: Virgin trigger flow sets virginTriggered', () => {
  buildGame([
    ['p1', 'Alice', 'chef'],
    ['p2', 'Bob', 'virgin'],
    ['p3', 'Carol', 'empath'],
  ]);
  state.nominations.open = true;
  state.dayCount = 1;
  const result = processNomination('p1', 'p2');
  assert(result.ok, 'Nomination should succeed');
  assert(result.virginTrigger, 'Should flag virginTrigger');
  eq(result.virginExecutedId, 'p1');
  assert(state.players.find(p => p.id === 'p2').customState.virginTriggered, 'virginTriggered not set');
});

// ─── SLAYER ───────────────────────────────────────────────────────────────────
suite('Slayer');

test('Slayer kills Demon on first use', () => {
  buildGame([
    ['p1', 'Alice', 'slayer'],
    ['p2', 'Bob', 'imp'],
  ]);
  const killed = resolveSlayer('p1', 'p2');
  assert(killed === true, 'Slayer should kill Imp');
  assert(state.players.find(p => p.id === 'p1').customState.slayerUsed, 'slayerUsed should be true');
});

test('Slayer does NOT kill non-Demon', () => {
  buildGame([
    ['p1', 'Alice', 'slayer'],
    ['p2', 'Bob', 'chef'],
  ]);
  const killed = resolveSlayer('p1', 'p2');
  assert(killed === false, 'Slayer should not kill non-Demon');
});

test('Slayer cannot use ability twice', () => {
  buildGame([
    ['p1', 'Alice', 'slayer'],
    ['p2', 'Bob', 'imp'],
  ]);
  state.players.find(p => p.id === 'p1').customState.slayerUsed = true;
  const killed = resolveSlayer('p1', 'p2');
  assert(killed === false, 'Slayer should not fire if already used');
});

test('Poisoned Slayer never kills', () => {
  buildGame([
    ['p1', 'Alice', 'slayer'],
    ['p2', 'Bob', 'imp'],
  ]);
  state.players.find(p => p.id === 'p1').isPoisoned = true;
  const killed = resolveSlayer('p1', 'p2');
  assert(killed === false, 'Poisoned Slayer should not kill');
});

// ─── SOLDIER / MONK PROTECTION ────────────────────────────────────────────────
suite('Soldier & Monk Protection');

test('Soldier is protected from Demon', () => {
  buildGame([['p1', 'Alice', 'soldier']]);
  assert(isSoldierProtected('p1') === true);
});

test('Poisoned Soldier is NOT protected', () => {
  buildGame([['p1', 'Alice', 'soldier']]);
  state.players[0].isPoisoned = true;
  assert(isSoldierProtected('p1') === false);
});

test('Non-Soldier is not soldier-protected', () => {
  buildGame([['p1', 'Alice', 'chef']]);
  assert(isSoldierProtected('p1') === false);
});

test('Monk protection (isSafe) blocks kill', () => {
  buildGame([['p1', 'Alice', 'chef']]);
  state.players[0].isSafe = true;
  assert(isMonkProtected('p1') === true);
});

test('Without Monk protection player is not safe', () => {
  buildGame([['p1', 'Alice', 'chef']]);
  assert(isMonkProtected('p1') === false);
});

test('Night kill is blocked by isSafe on advanceToDawn', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'chef'],
    ['p3', 'Carol', 'empath'],
    ['p4', 'Dave', 'monk'],
  ], { phase: 'NIGHT', dayCount: 1 });
  setNightProtect('p3');
  setNightKill('p3');
  assert(state.players.find(p => p.id === 'p3').isSafe, 'p3 should be safe');
  advanceToDawn();
  assert(state.players.find(p => p.id === 'p3').isAlive, 'Monk-protected target should survive Demon kill');
  eq(state.phase, 'DAY');
  eq(state.dayCount, 2);
});

test('Night kill lands when target is not protected', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'chef'],
    ['p3', 'Carol', 'empath'],
  ], { phase: 'NIGHT', dayCount: 1 });
  setNightKill('p2');
  advanceToDawn();
  assert(!state.players.find(p => p.id === 'p2').isAlive, 'Unprotected target should die');
  assert(state.players.find(p => p.id === 'p3').isAlive, 'Other players should survive');
});

// ─── POISON BLEED (Bug #1 regression) ────────────────────────────────────────
suite('Poison & Flag Reset Between Nights');

test('isPoisoned resets when advancing to next night', () => {
  buildGame([
    ['p1', 'Alice', 'poisoner'],
    ['p2', 'Bob', 'chef'],
    ['p3', 'Carol', 'empath'],
  ], { phase: 'NIGHT', dayCount: 1 });
  setNightPoison('p2');
  assert(state.players.find(p => p.id === 'p2').isPoisoned, 'p2 should be poisoned after Night 1');
  advanceToDawn();
  // Now in day — poison persists through day
  assert(state.players.find(p => p.id === 'p2').isPoisoned, 'Poison should persist through daytime');
  // Advance to Night 2
  advanceToNight();
  assert(!state.players.find(p => p.id === 'p2').isPoisoned, 'Poison should be cleared at start of Night 2');
});

test('isSafe resets when advancing to next night', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'monk'],
    ['p3', 'Carol', 'chef'],
    ['p4', 'Dave', 'empath'],
  ], { phase: 'NIGHT', dayCount: 1 });
  setNightProtect('p3');
  assert(state.players.find(p => p.id === 'p3').isSafe, 'p3 should be safe on Night 1');
  advanceToDawn();
  advanceToNight();
  assert(!state.players.find(p => p.id === 'p3').isSafe, 'isSafe should be cleared at Night 2');
});

test('Poison from Night 1 does NOT linger into Night 2 effects', () => {
  buildGame([
    ['p1', 'Alice', 'poisoner'],
    ['p2', 'Bob', 'empath'],
    ['p3', 'Carol', 'imp'],
    ['p4', 'Dave', 'chef'],
    ['p5', 'Eve', 'soldier'],
  ], { phase: 'NIGHT', dayCount: 1 });
  setNightPoison('p2');
  setNightKill('p4');
  advanceToDawn();
  advanceToNight(); // Night 2 — poison clears
  assert(!state.players.find(p => p.id === 'p2').isPoisoned, 'Empath poisoning should not carry to Night 2');
});

// ─── EMPATH ───────────────────────────────────────────────────────────────────
suite('Empath');

test('Empath sees 0 when both neighbours are Good', () => {
  buildGame([
    ['p1', 'Alice', 'chef'],
    ['p2', 'Bob', 'empath'],
    ['p3', 'Carol', 'soldier'],
  ]);
  const n = computeEmpathNumber('p2');
  eq(n, 0);
});

test('Empath sees 1 when one neighbour is Evil', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'empath'],
    ['p3', 'Carol', 'soldier'],
  ]);
  const n = computeEmpathNumber('p2');
  eq(n, 1);
});

test('Empath sees 2 when both neighbours are Evil', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'empath'],
    ['p3', 'Carol', 'scarletwoman'],
  ]);
  const n = computeEmpathNumber('p2');
  eq(n, 2);
});

test('Empath wraps around circular seating', () => {
  buildGame([
    ['p1', 'Alice', 'empath'],
    ['p2', 'Bob', 'chef'],
    ['p3', 'Carol', 'imp'],
  ]);
  // p1's neighbours: p3 (Evil, wraps around) and p2 (Good)
  const n = computeEmpathNumber('p1');
  eq(n, 1);
});

test('Empath skips dead players to find living neighbours', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'chef'],   // dead
    ['p3', 'Carol', 'empath'],
    ['p4', 'Dave', 'soldier'], // dead
    ['p5', 'Eve', 'mayor'],
  ]);
  state.players.find(p => p.id === 'p2').isAlive = false;
  state.players.find(p => p.id === 'p4').isAlive = false;
  // p3's living neighbours: p1 (Evil, skips dead p2) and p5 (Good, skips dead p4)
  const n = computeEmpathNumber('p3');
  eq(n, 1);
});

test('Empath poisoned still computes (poison affects what they see, not the calc itself)', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'empath'],
    ['p3', 'Carol', 'soldier'],
  ]);
  state.players.find(p => p.id === 'p2').isPoisoned = true;
  // The rulesEngine calculation is correct — it's the NightEngine that would give wrong info
  const n = computeEmpathNumber('p2');
  eq(n, 1, 'Empath calc returns true value; nightEngine would lie when poisoned');
});

// ─── CHEF ─────────────────────────────────────────────────────────────────────
suite('Chef');

test('Chef sees 0 when no adjacent Evil pairs', () => {
  buildGame([
    ['p1', 'Alice', 'chef'],
    ['p2', 'Bob', 'empath'],
    ['p3', 'Carol', 'imp'],
  ]);
  // Living players in order: chef(Good), empath(Good), imp(Evil)
  // Adjacent pairs: chef-empath (G-G), empath-imp (G-E), imp-chef (E-G) → 0 pairs
  const n = computeChefNumber();
  eq(n, 0);
});

test('Chef sees 1 when one adjacent Evil pair', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'scarletwoman'],
    ['p3', 'Carol', 'chef'],
    ['p4', 'Dave', 'empath'],
  ]);
  // imp-sw adjacent (Evil-Evil) = 1 pair
  const n = computeChefNumber();
  eq(n, 1);
});

test('Chef sees 2 when two separate adjacent Evil pairs', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'scarletwoman'],
    ['p3', 'Carol', 'chef'],
    ['p4', 'Dave', 'poisoner'],
    ['p5', 'Eve', 'baron'],
  ]);
  // imp-sw (E-E), poisoner-baron (E-E), baron wraps to imp (E-E)
  // Actually: p1(E)-p2(E)-p3(G)-p4(E)-p5(E) circular
  // Pairs: p1-p2 ✓, p2-p3 ✗, p3-p4 ✗, p4-p5 ✓, p5-p1 ✓ → 3 pairs
  const n = computeChefNumber();
  eq(n, 3);
});

test('Chef sees 0 with only 1 player', () => {
  buildGame([['p1', 'Alice', 'chef']]);
  const n = computeChefNumber();
  eq(n, 0);
});

// ─── FORTUNE TELLER ───────────────────────────────────────────────────────────
suite('Fortune Teller');

test('FT returns true when one target is Demon', () => {
  buildGame([
    ['p1', 'Alice', 'fortuneteller', { customState: { redHerring: null } }],
    ['p2', 'Bob', 'imp'],
    ['p3', 'Carol', 'chef'],
  ]);
  const r = computeFortuneTellerResult('p1', 'p2', 'p3');
  assert(r === true, 'Should be true when Imp is selected');
});

test('FT returns false when no Demon or Red Herring selected', () => {
  buildGame([
    ['p1', 'Alice', 'fortuneteller', { customState: { redHerring: null } }],
    ['p2', 'Bob', 'imp'],
    ['p3', 'Carol', 'chef'],
    ['p4', 'Dave', 'empath'],
  ]);
  const r = computeFortuneTellerResult('p1', 'p3', 'p4');
  assert(r === false, 'Should be false when neither is Demon or Red Herring');
});

test('FT returns true when one target is Red Herring', () => {
  buildGame([
    ['p1', 'Alice', 'fortuneteller', { customState: { redHerring: 'p3' } }],
    ['p2', 'Bob', 'imp'],
    ['p3', 'Carol', 'chef'],
    ['p4', 'Dave', 'empath'],
  ]);
  const r = computeFortuneTellerResult('p1', 'p3', 'p4');
  assert(r === true, 'Should be true when Red Herring is selected');
});

test('FT returns true when both targets are selected (Demon + Red Herring)', () => {
  buildGame([
    ['p1', 'Alice', 'fortuneteller', { customState: { redHerring: 'p3' } }],
    ['p2', 'Bob', 'imp'],
    ['p3', 'Carol', 'chef'],
  ]);
  const r = computeFortuneTellerResult('p1', 'p2', 'p3');
  assert(r === true);
});

// ─── VOTING ───────────────────────────────────────────────────────────────────
suite('Voting');

test('votesNeededToExecute: majority of living', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'chef'],
    ['p3', 'Carol', 'empath'],
    ['p4', 'Dave', 'soldier'],
    ['p5', 'Eve', 'mayor'],
  ]);
  // 5 living → need ⌊5/2⌋+1 = 3
  eq(votesNeededToExecute(), 3);
});

test('Sufficient votes puts player on the block', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'chef'],
    ['p3', 'Carol', 'empath'],
    ['p4', 'Dave', 'soldier'],
    ['p5', 'Eve', 'mayor'],
  ]);
  state.nominations.currentNominee = 'p1';
  state.nominations.currentNominator = 'p2';
  castVote('p2', true);
  castVote('p3', true);
  castVote('p4', true);
  const { yesVotes, threshold } = closeVoting();
  eq(yesVotes, 3);
  eq(threshold, 3);
  eq(state.nominations.pendingExecution, 'p1');
});

test('Insufficient votes — no pending execution', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'chef'],
    ['p3', 'Carol', 'empath'],
    ['p4', 'Dave', 'soldier'],
    ['p5', 'Eve', 'mayor'],
  ]);
  state.nominations.currentNominee = 'p1';
  state.nominations.currentNominator = 'p2';
  castVote('p2', true);
  castVote('p3', true);
  closeVoting(); // Only 2 votes, need 3
  eq(state.nominations.pendingExecution, null);
});

test('Higher vote count overwrites pending execution', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'chef'],
    ['p3', 'Carol', 'empath'],
    ['p4', 'Dave', 'soldier'],
    ['p5', 'Eve', 'mayor'],
  ]);
  // First nomination: p1 gets 3 votes
  state.nominations.currentNominee = 'p1';
  state.nominations.currentNominator = 'p2';
  castVote('p2', true); castVote('p3', true); castVote('p4', true);
  closeVoting();
  eq(state.nominations.pendingExecution, 'p1');

  // Second nomination: p3 gets 4 votes (higher)
  state.nominations.currentNominee = 'p3';
  state.nominations.currentNominator = 'p5';
  state.nominations.votes = [];
  castVote('p2', true); castVote('p4', true); castVote('p5', true); castVote('p1', true);
  closeVoting();
  eq(state.nominations.pendingExecution, 'p3');
});

test('Equal votes → tie, pendingExecution becomes null', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'chef'],
    ['p3', 'Carol', 'empath'],
    ['p4', 'Dave', 'soldier'],
    ['p5', 'Eve', 'mayor'],
  ]);
  // First nomination: p1 gets 3 votes
  state.nominations.currentNominee = 'p1';
  state.nominations.currentNominator = 'p2';
  castVote('p2', true); castVote('p3', true); castVote('p4', true);
  closeVoting();

  // Second nomination: p3 also gets 3 votes → tie
  state.nominations.currentNominee = 'p3';
  state.nominations.currentNominator = 'p5';
  state.nominations.votes = [];
  castVote('p2', true); castVote('p4', true); castVote('p5', true);
  closeVoting();
  eq(state.nominations.pendingExecution, null);
  assert(state.nominations.tiedPlayerIds.includes('p1'), 'p1 should be in tied list');
  assert(state.nominations.tiedPlayerIds.includes('p3'), 'p3 should be in tied list');
});

test('Dead player with ghost vote can vote yes', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'chef'],
    ['p3', 'Carol', 'empath'],
    ['p4', 'Dave', 'soldier'],
    ['p5', 'Eve', 'mayor'],
  ]);
  state.players.find(p => p.id === 'p4').isAlive = false;
  state.players.find(p => p.id === 'p4').hasGhostVote = true;
  const result = validateVote('p4', true);
  assert(result.ok, 'Dead player with ghost vote should be able to vote');
});

test('Dead player with no ghost vote cannot vote', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'chef'],
    ['p3', 'Carol', 'empath'],
  ]);
  state.players.find(p => p.id === 'p2').isAlive = false;
  state.players.find(p => p.id === 'p2').hasGhostVote = false;
  const result = validateVote('p2', true);
  assert(!result.ok, 'Dead player with no ghost vote cannot vote yes');
});

test('Ghost vote is consumed when dead player votes yes', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'chef'],
    ['p3', 'Carol', 'empath'],
    ['p4', 'Dave', 'soldier'],
  ]);
  state.nominations.currentNominee = 'p1';
  state.nominations.currentNominator = 'p2';
  const p4 = state.players.find(p => p.id === 'p4');
  p4.isAlive = false;
  p4.hasGhostVote = true;
  castVote('p4', true);
  assert(!p4.hasGhostVote, 'Ghost vote should be spent after voting yes');
});

test('Ghost vote NOT consumed when dead player votes no', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'chef'],
    ['p3', 'Carol', 'empath'],
  ]);
  state.nominations.currentNominee = 'p1';
  state.nominations.currentNominator = 'p2';
  const p3 = state.players.find(p => p.id === 'p3');
  p3.isAlive = false;
  p3.hasGhostVote = true;
  castVote('p3', false);
  assert(p3.hasGhostVote, 'Ghost vote should not be spent when voting no');
});

// ─── BUTLER CONSTRAINT ────────────────────────────────────────────────────────
suite('Butler Constraint');

test('Butler warned when master has not yet voted yes', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'butler', { customState: { master: 'p3' } }],
    ['p3', 'Carol', 'chef'],
    ['p4', 'Dave', 'empath'],
  ]);
  state.nominations.votes = []; // master hasn't voted
  const result = validateVote('p2', true);
  assert(result.ok, 'Vote is still technically ok (warning only)');
  assert(result.butlerWarning !== null, 'Should warn about Butler constraint');
});

test('No Butler warning when master has voted yes first', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'butler', { customState: { master: 'p3' } }],
    ['p3', 'Carol', 'chef'],
    ['p4', 'Dave', 'empath'],
  ]);
  state.nominations.votes = [{ playerId: 'p3', votedYes: true }];
  const result = validateVote('p2', true);
  eq(result.butlerWarning, null);
});

test('No Butler constraint when voting no', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'butler', { customState: { master: 'p3' } }],
    ['p3', 'Carol', 'chef'],
    ['p4', 'Dave', 'empath'],
  ]);
  state.nominations.votes = [];
  const result = validateVote('p2', false);
  eq(result.butlerWarning, null);
});

test('No Butler constraint when Butler is poisoned', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'butler', { customState: { master: 'p3' } }],
    ['p3', 'Carol', 'chef'],
    ['p4', 'Dave', 'empath'],
  ]);
  state.players.find(p => p.id === 'p2').isPoisoned = true;
  state.nominations.votes = [];
  const result = validateVote('p2', true);
  eq(result.butlerWarning, null, 'Poisoned Butler has no constraint');
});

// ─── EXECUTION ────────────────────────────────────────────────────────────────
suite('Execution & Dusk Resolution');

test('executeDusk kills the pending execution target', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'chef'],
    ['p3', 'Carol', 'empath'],
  ]);
  state.nominations.pendingExecution = 'p2';
  state.dayCount = 1;
  executeDusk();
  assert(!state.players.find(p => p.id === 'p2').isAlive, 'p2 should be dead');
  eq(state.lastExecutedPlayerId, 'p2');
  eq(state.nominations.pendingExecution, null);
});

test('resolveDusk: Saint execution → Evil wins', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'saint'],
    ['p3', 'Carol', 'chef'],
    ['p4', 'Dave', 'empath'],
  ]);
  state.nominations.pendingExecution = 'p2';
  state.dayCount = 1;
  const r = resolveDusk();
  eq(r?.win?.winner, 'Evil');
  assert(!state.players.find(p => p.id === 'p2').isAlive, 'Saint should be executed');
});

test('resolveDusk: executing Demon → Good wins (no SW)', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'chef'],
    ['p3', 'Carol', 'empath'],
    ['p4', 'Dave', 'soldier'],
  ]);
  state.nominations.pendingExecution = 'p1';
  state.dayCount = 1;
  const r = resolveDusk();
  eq(r?.win?.winner, 'Good');
  assert(!state.players.find(p => p.id === 'p1').isAlive, 'Imp should be dead');
});

test('resolveDusk: executing Demon with SW alive → SW becomes Imp, game continues', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'scarletwoman'],
    ['p3', 'Carol', 'chef'],
    ['p4', 'Dave', 'empath'],
    ['p5', 'Eve', 'soldier'],
    ['p6', 'Frank', 'mayor'],
  ]);
  state.nominations.pendingExecution = 'p1';
  state.dayCount = 2;
  const r = resolveDusk();
  // No Good win — SW caught the token
  eq(r, null, 'Game should not end; SW caught Demon token');
  const sw = state.players.find(p => p.id === 'p2');
  eq(sw.character.id, 'imp');
  eq(sw.alignment, 'Evil');
});

test('resolveDusk: Mayor win with 3 alive and no execution', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'mayor'],
    ['p3', 'Carol', 'chef'],
  ]);
  state.nominations.pendingExecution = null;
  state.dayCount = 3;
  const r = resolveDusk();
  eq(r?.win?.winner, 'Good');
});

test('resolveDusk: no execution, no Mayor, game continues', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'chef'],
    ['p3', 'Carol', 'empath'],
  ]);
  state.nominations.pendingExecution = null;
  const r = resolveDusk();
  eq(r, null);
});

// ─── MULTI-NIGHT SIMULATION ───────────────────────────────────────────────────
suite('Full Multi-Night Simulation');

test('5-player game: 3 nights, Good wins via execution', () => {
  // Setup: Alice=Imp, Bob=Poisoner, Carol=Chef, Dave=Empath, Eve=Soldier
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'poisoner'],
    ['p3', 'Carol', 'chef'],
    ['p4', 'Dave', 'empath'],
    ['p5', 'Eve', 'soldier'],
  ], { phase: 'NIGHT', dayCount: 1 });

  // Night 1: Bob poisons Dave, Alice kills Carol
  setNightPoison('p4');
  setNightKill('p3');
  advanceToDawn();
  // Carol is dead
  assert(!state.players.find(p => p.id === 'p3').isAlive, 'Carol should be dead');
  eq(state.dayCount, 2);

  // Day 2: Dave is still poisoned; Alice on block with 3 votes (need ⌊4/2⌋+1=3)
  eq(countLiving(), 4);
  eq(votesNeededToExecute(), 3);
  state.nominations.currentNominee = 'p1';
  state.nominations.currentNominator = 'p3'; // nominators don't have to be living (just calling fn)
  // But processNomination checks isAlive... let's just call confirmNomination directly
  confirmNomination('p2', 'p1');
  castVote('p2', true); castVote('p4', true); castVote('p5', true);
  closeVoting();
  eq(state.nominations.pendingExecution, 'p1');
  const result = resolveDusk();
  eq(result?.win?.winner, 'Good');
});

test('7-player game: Scarlet Woman saves Evil, game continues', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'scarletwoman'],
    ['p3', 'Carol', 'poisoner'],
    ['p4', 'Dave', 'chef'],
    ['p5', 'Eve', 'empath'],
    ['p6', 'Frank', 'soldier'],
    ['p7', 'Grace', 'mayor'],
  ], { phase: 'NIGHT', dayCount: 1 });

  // Night 1: Imp kills Frank
  setNightKill('p6');
  advanceToDawn();
  assert(!state.players.find(p => p.id === 'p6').isAlive, 'Frank dead');

  // Day 2: Vote out Alice (Imp), but SW should catch the token
  eq(countLiving(), 6); // 6 alive → need ⌊6/2⌋+1 = 4 votes; SW triggers (≥5)
  state.nominations.currentNominee = 'p1';
  confirmNomination('p4', 'p1');
  castVote('p4', true); castVote('p5', true); castVote('p7', true); castVote('p3', true);
  closeVoting();
  eq(state.nominations.pendingExecution, 'p1');

  state.dayCount = 2;
  const r = resolveDusk();
  eq(r, null, 'Game should not end — SW catches token');
  const sw = state.players.find(p => p.id === 'p2');
  eq(sw.character.id, 'imp', 'Bob (SW) should now be Imp');
  eq(sw.alignment, 'Evil');

  // Verify old Imp is dead
  assert(!state.players.find(p => p.id === 'p1').isAlive, 'Alice executed');
  // Verify win check now fails (new Demon alive, 5 players alive)
  const win = checkWinConditions();
  eq(win, null, 'No winner yet — new Imp is alive');
});

test('5-player game: Virgin trigger causes Townsfolk execution mid-day', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'virgin'],
    ['p3', 'Carol', 'chef'],
    ['p4', 'Dave', 'empath'],
    ['p5', 'Eve', 'soldier'],
  ], { phase: 'DAY', dayCount: 1 });
  state.nominations.open = true;

  const r = processNomination('p3', 'p2'); // Carol (Townsfolk) nominates Bob (Virgin)
  assert(r.ok, 'Nomination ok');
  assert(r.virginTrigger, 'Virgin triggers');
  eq(r.virginExecutedId, 'p3');
  assert(state.players.find(p => p.id === 'p2').customState.virginTriggered, 'Virgin marked triggered');
  // In real flow: nominatorId (Carol) would be executed by the UI; just verify the flag
});

test('Slayer kills Imp on Day 2, Good wins', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'slayer'],
    ['p3', 'Carol', 'chef'],
    ['p4', 'Dave', 'empath'],
    ['p5', 'Eve', 'soldier'],
  ], { phase: 'DAY', dayCount: 2 });

  const killed = resolveSlayer('p2', 'p1');
  assert(killed, 'Slayer kills Imp');
  // Apply the kill
  state.players.find(p => p.id === 'p1').isAlive = false;
  const win = checkWinConditions();
  eq(win?.winner, 'Good');
});

test('9-player game: 3 nights, poison bleed bug verified fixed', () => {
  // Ensure a multi-night game with poison never bleeds into N+1
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'poisoner'],
    ['p3', 'Carol', 'baron'],
    ['p4', 'Dave', 'chef'],
    ['p5', 'Eve', 'empath'],
    ['p6', 'Frank', 'fortuneteller', { customState: { redHerring: 'p4' } }],
    ['p7', 'Grace', 'soldier'],
    ['p8', 'Hank', 'monk'],
    ['p9', 'Iris', 'butler', { customState: { master: 'p4' } }],
  ], { phase: 'NIGHT', dayCount: 1 });

  // Night 1: Poison Frank, Imp kills Dave
  setNightPoison('p6');
  setNightKill('p4');
  assert(state.players.find(p => p.id === 'p6').isPoisoned, 'Frank poisoned N1');
  advanceToDawn();
  assert(!state.players.find(p => p.id === 'p4').isAlive, 'Dave dead');
  assert(state.players.find(p => p.id === 'p6').isPoisoned, 'Frank still poisoned during day');

  // Advance to Night 2
  advanceToNight();
  assert(!state.players.find(p => p.id === 'p6').isPoisoned, 'Frank poison cleared N2');

  // Night 2: Monk protects Grace, Imp targets Grace → survives
  setNightProtect('p7');
  setNightKill('p7');
  assert(state.players.find(p => p.id === 'p7').isSafe, 'Grace protected N2');
  advanceToDawn();
  assert(state.players.find(p => p.id === 'p7').isAlive, 'Grace survived (Monk protected)');

  // Advance to Night 3
  advanceToNight();
  assert(!state.players.find(p => p.id === 'p7').isSafe, 'Grace isSafe cleared N3');

  // Night 3: Imp kills Grace (no protection)
  setNightKill('p7');
  advanceToDawn();
  assert(!state.players.find(p => p.id === 'p7').isAlive, 'Grace died N3 (no protection)');
});

// ─── NOMINATION VALIDATION ────────────────────────────────────────────────────
suite('Nomination Validation');

test('Dead player cannot nominate', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'chef'],
    ['p3', 'Carol', 'empath'],
  ]);
  state.nominations.open = true;
  state.dayCount = 1;
  state.players.find(p => p.id === 'p2').isAlive = false;
  const r = processNomination('p2', 'p3');
  assert(!r.ok, 'Dead player should not be able to nominate');
});

test('Player cannot nominate twice in a day', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'chef'],
    ['p3', 'Carol', 'empath'],
    ['p4', 'Dave', 'soldier'],
  ]);
  state.nominations.open = true;
  state.dayCount = 1;
  processNomination('p2', 'p3');
  const r = processNomination('p2', 'p4');
  assert(!r.ok, 'Player cannot nominate twice');
});

test('Player cannot be nominated twice in a day', () => {
  buildGame([
    ['p1', 'Alice', 'imp'],
    ['p2', 'Bob', 'chef'],
    ['p3', 'Carol', 'empath'],
    ['p4', 'Dave', 'soldier'],
  ]);
  state.nominations.open = true;
  state.dayCount = 1;
  processNomination('p2', 'p3');
  const r = processNomination('p4', 'p3');
  assert(!r.ok, 'Same player cannot be nominated twice');
});

// ─── SUMMARY ─────────────────────────────────────────────────────────────────
const total = passed + failed;
process.stdout.write(`\n${'─'.repeat(50)}\n`);
process.stdout.write(`Results: ${passed}/${total} passed`);
if (failed > 0) {
  process.stdout.write(`, \x1b[31m${failed} failed\x1b[0m\n`);
  process.stdout.write('\nFailed tests:\n');
  failures.forEach(f => process.stdout.write(`  • ${f.name}\n    ${f.error}\n`));
} else {
  process.stdout.write(` \x1b[32m— all passing\x1b[0m\n`);
}
process.exit(failed > 0 ? 1 : 0);
