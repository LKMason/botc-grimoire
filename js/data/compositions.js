// Standard Trouble Brewing composition table
// Each entry: [townsfolk, outsiders, minions, demons]

export const COMPOSITIONS = {
  5:  [3, 0, 1, 1],
  6:  [3, 1, 1, 1],
  7:  [5, 0, 1, 1],
  8:  [5, 1, 1, 1],
  9:  [5, 2, 1, 1],
  10: [7, 0, 2, 1],
  11: [7, 1, 2, 1],
  12: [7, 2, 2, 1],
  13: [9, 0, 3, 1],
  14: [9, 1, 3, 1],
  15: [9, 2, 3, 1],
};

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 15;

/**
 * Returns the composition counts adjusted for Baron.
 * Baron: −2 Townsfolk, +2 Outsiders.
 */
export function getComposition(playerCount, hasBaronInPlay = false) {
  const base = COMPOSITIONS[playerCount];
  if (!base) return null;
  const [t, o, m, d] = base;
  return hasBaronInPlay
    ? { townsfolk: t - 2, outsiders: o + 2, minions: m, demons: d }
    : { townsfolk: t, outsiders: o, minions: m, demons: d };
}

export function isValidPlayerCount(n) {
  return Number.isInteger(n) && n >= MIN_PLAYERS && n <= MAX_PLAYERS;
}
