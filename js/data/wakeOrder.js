import { getCharacter } from './characters.js';

// Wake tiers in resolution order (lower = earlier)
export const WAKE_TIERS = {
  1: ['poisoner', 'monk', 'bureaucrat', 'thief'],
  2: ['imp'],
  3: ['ravenkeeper'],   // conditional: only if Ravenkeeper was killed by Imp
  4: ['undertaker', 'empath', 'fortuneteller', 'washerwoman', 'librarian', 'investigator', 'chef', 'spy'],
  5: ['butler'],
};

/**
 * Build the ordered wake deck for the current night.
 *
 * Deck entries: { characterId, playerId, isDrunkProxy }
 *   isDrunkProxy: true when the Drunk player is added because their fake role would wake.
 *
 * Special rules encoded here:
 *   - Night 1 (dayCount === 0): skip Monk, Undertaker, Imp
 *   - Night 2+ (dayCount > 0): skip Washerwoman, Librarian, Investigator, Chef
 *   - Ravenkeeper: only included if state.night.pendingKill targets the Ravenkeeper player
 *   - Dead players are never included
 *   - Drunk: included if their fake role would wake, as a proxy entry
 */
export function buildWakeDeck(state) {
  const { players, dayCount, night } = state;
  const isNightOne = dayCount === 0;

  const skipOnNightOne = new Set(['monk', 'undertaker', 'imp', 'bureaucrat', 'thief']);
  const skipOnNightTwo = new Set(['washerwoman', 'librarian', 'investigator', 'chef']);

  // Build a lookup: characterId → player (only living players, excluding Drunk's real char)
  const roleMap = new Map();

  // First pass: map real characters (skip Drunk's actual drunk entry)
  for (const player of players) {
    if (!player.isAlive) continue;
    const charId = player.character.id;
    if (charId === 'drunk') continue; // Drunk's real character is never woken
    if (!roleMap.has(charId)) roleMap.set(charId, player);
  }

  // Second pass: handle Drunk fake role proxy
  const drunkPlayer = players.find((p) => p.isAlive && p.character.id === 'drunk');
  let drunkProxyId = null;
  if (drunkPlayer?.drunkFakeRole) {
    drunkProxyId = drunkPlayer.drunkFakeRole.id;
    // Only proxy if the fake role would appear in the wake deck (has wakeNights != NEVER)
    const fakeChar = getCharacter(drunkProxyId);
    if (fakeChar && fakeChar.wakeNights !== 'NEVER') {
      // Register in roleMap only if real role isn't already there
      if (!roleMap.has(drunkProxyId)) {
        roleMap.set(drunkProxyId, drunkPlayer);
      }
    }
  }

  const deck = [];

  // Night 1: prepend Minion Info and Demon Info introductory cards
  if (isNightOne) {
    const hasMinions = players.some((p) => p.isAlive && p.character.type === 'MINION');
    const hasDemon = players.some((p) => p.isAlive && p.character.type === 'DEMON');
    if (hasMinions || hasDemon) {
      deck.push({ characterId: '__minion_info__', playerId: null, isDrunkProxy: false });
    }
    if (hasDemon) {
      deck.push({ characterId: '__demon_info__', playerId: null, isDrunkProxy: false });
    }
  }

  for (const [tier, charIds] of Object.entries(WAKE_TIERS).sort(([a], [b]) => Number(a) - Number(b))) {
    for (const charId of charIds) {
      // Skip rules by night
      if (isNightOne && skipOnNightOne.has(charId)) continue;
      if (!isNightOne && skipOnNightTwo.has(charId)) continue;

      // Ravenkeeper: only if they were the one killed tonight
      if (charId === 'ravenkeeper') {
        if (!night.pendingKill) continue;
        const rk = players.find((p) => p.id === night.pendingKill);
        if (!rk || rk.character.id !== 'ravenkeeper') continue;
      }

      const player = roleMap.get(charId);
      if (!player) continue;

      const isDrunkProxy = player.character.id === 'drunk';

      deck.push({
        characterId: charId,
        playerId: player.id,
        isDrunkProxy,
      });
    }
  }

  return deck;
}
