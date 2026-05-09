import { state, findPlayerById, findLivingDemon, countLiving, countLivingNonTravellers, getLivingPlayers } from '../state/GameState.js';
import { emit } from '../state/EventBus.js';
import { getCharacter } from '../data/characters.js';

/**
 * Check all win conditions. Returns { winner, reason } or null.
 * Call after any state mutation that could affect win state.
 */
export function checkWinConditions() {
  const demon = findLivingDemon();
  // Travellers don't count toward Evil's win condition
  const living = countLivingNonTravellers();

  if (demon && living <= 2) {
    return { winner: 'Evil', reason: `Only ${living} non-Traveller player${living === 1 ? '' : 's'} remain with the Demon alive.` };
  }

  // Good wins: no living Demon (Scarlet Woman catch is handled before killing the demon)
  if (!demon) {
    return { winner: 'Good', reason: 'The Demon has been slain.' };
  }

  return null;
}

/**
 * Check if the Mayor win condition applies at dusk.
 * Call when advanceToDusk is about to happen with no execution.
 */
export function checkMayorWin() {
  const living = getLivingPlayers();
  if (living.length !== 3) return null;
  if (state.nominations.pendingExecution !== null) return null;
  const mayor = living.find((p) => p.character.id === 'mayor' && !p.isPoisoned && !p.isDrunk);
  if (!mayor) return null;
  return { winner: 'Good', reason: 'The Mayor guides the village to peace — 3 players alive, no execution.' };
}

/**
 * Check if the Saint execution triggers Evil win.
 * Call when a player is about to be executed.
 */
export function checkSaintExecution(executedPlayerId) {
  const player = findPlayerById(executedPlayerId);
  if (!player) return null;
  if (player.character.id === 'saint' && !player.isPoisoned && !player.isDrunk) {
    return { winner: 'Evil', reason: `The Saint was executed — Evil wins!` };
  }
  return null;
}

/**
 * Check if the Scarlet Woman catches the Demon token when the Demon dies.
 * Must be called BEFORE the Demon's isAlive is set to false.
 *
 * Returns the Scarlet Woman player if she catches it, null otherwise.
 */
export function checkScarletWoman(dyingPlayerId) {
  const dying = findPlayerById(dyingPlayerId);
  if (!dying || dying.character.type !== 'DEMON') return null;

  // Count living non-Traveller players BEFORE the death (Travellers don't count for SW)
  const livingBeforeDeath = countLivingNonTravellers();
  if (livingBeforeDeath < 5) return null;

  const sw = getLivingPlayers().find(
    (p) => p.character.id === 'scarletwoman' && !p.isPoisoned && !p.isDrunk
  );
  if (!sw) return null;
  return sw;
}

/**
 * Apply Scarlet Woman catch: SW becomes the Imp.
 */
export function applyScarletWomanCatch(swPlayer, dyingImpPlayer) {
  const imp = getCharacter('imp');
  swPlayer.character = imp;
  swPlayer.alignment = 'Evil';
  swPlayer.history.push({
    turn: `Day ${state.dayCount}`,
    type: 'SCARLET_WOMAN',
    description: `Became the Imp (caught the Demon token from ${dyingImpPlayer.name}).`,
    isOverride: false,
    timestamp: Date.now(),
  });
  emit('state:player-updated', { playerId: swPlayer.id });
}

/**
 * Check if the Slayer's claim kills the target.
 * Returns true if the target dies, false otherwise.
 */
export function resolveSlayer(slayerPlayerId, targetId) {
  const slayer = findPlayerById(slayerPlayerId);
  const target = findPlayerById(targetId);
  if (!slayer || !target) return false;
  if (slayer.isPoisoned || slayer.isDrunk) return false;
  if (slayer.customState.slayerUsed) return false;
  slayer.customState.slayerUsed = true;
  return target.character.type === 'DEMON';
}

/**
 * Compute the Empath's number: how many of the 2 nearest living neighbours are Evil.
 * Walks the circular player array, skipping dead players.
 */
export function computeEmpathNumber(empathPlayerId) {
  const players = state.players;
  const idx = players.findIndex((p) => p.id === empathPlayerId);
  if (idx === -1) return 0;

  function findNeighbour(start, direction) {
    let i = (start + direction + players.length) % players.length;
    while (i !== start) {
      if (players[i].isAlive && players[i].id !== empathPlayerId) {
        return players[i];
      }
      i = (i + direction + players.length) % players.length;
    }
    return null;
  }

  const left = findNeighbour(idx, -1);
  const right = findNeighbour(idx, 1);
  const neighbours = [left, right].filter(Boolean);

  return neighbours.filter((n) => isRegistersEvil(n)).length;
}

/**
 * Compute the Chef's number: pairs of adjacent Evil players (circular seating).
 */
export function computeChefNumber() {
  const living = getLivingPlayers();
  if (living.length < 2) return 0;

  let pairs = 0;
  for (let i = 0; i < living.length; i++) {
    const next = living[(i + 1) % living.length];
    if (isRegistersEvil(living[i]) && isRegistersEvil(next)) {
      pairs++;
    }
  }
  return pairs;
}

/**
 * Compute the Fortune Teller result for the two chosen targets.
 * Returns true if either target is the Demon or the Red Herring.
 */
export function computeFortuneTellerResult(ftPlayerId, target1Id, target2Id) {
  const ft = findPlayerById(ftPlayerId);
  if (!ft) return false;
  const redHerring = ft.customState.redHerring;
  const targets = [target1Id, target2Id];

  for (const tid of targets) {
    const t = findPlayerById(tid);
    if (!t) continue;
    if (t.character.type === 'DEMON') return true;
    if (t.id === redHerring) return true;
  }
  return false;
}

/**
 * Check if the Virgin's ability triggers on a nomination.
 * Returns true if the nominator should be immediately executed.
 */
export function checkVirginTrigger(nominatorId, nomineeId) {
  const nominee = findPlayerById(nomineeId);
  if (!nominee) return false;
  if (nominee.character.id !== 'virgin') return false;
  if (nominee.isPoisoned || nominee.isDrunk) return false;
  if (nominee.customState.virginTriggered) return false;

  const nominator = findPlayerById(nominatorId);
  if (!nominator) return false;

  // Nominator must be a Townsfolk (not registering as non-Townsfolk)
  return nominator.character.type === 'TOWNSFOLK';
}

/**
 * Determines whether a player registers as Evil to game mechanics.
 * Recluse may register as Evil (ST discretion — we default to their real alignment).
 * Spy may register as Good (ST discretion — we default to their real alignment).
 * This function returns the base value; the UI lets ST override via prompt.
 */
export function isRegistersEvil(player) {
  return player.alignment === 'Evil';
}

/**
 * Check whether the Soldier blocks a Demon kill.
 */
export function isSoldierProtected(targetId) {
  const target = findPlayerById(targetId);
  if (!target) return false;
  return target.character.id === 'soldier' && !target.isPoisoned && !target.isDrunk;
}

/**
 * Check whether the Monk's protection blocks a Demon kill.
 */
export function isMonkProtected(targetId) {
  const target = findPlayerById(targetId);
  if (!target) return false;
  return target.isSafe;
}
