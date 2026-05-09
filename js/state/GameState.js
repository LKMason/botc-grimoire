import { emit } from './EventBus.js';
import { saveState } from './persistence.js';
import { buildWakeDeck } from '../data/wakeOrder.js';
import { getCharacter } from '../data/characters.js';

// ─── Undo stack ───────────────────────────────────────────────────────────────

const _undoStack = [];
const UNDO_LIMIT = 50;

export function pushSnapshot() {
  _undoStack.push(JSON.parse(JSON.stringify(state)));
  if (_undoStack.length > UNDO_LIMIT) _undoStack.shift();
  emit('state:undo-stack-changed', { canUndo: true });
}

export function undoLastAction() {
  if (_undoStack.length === 0) return false;
  const snapshot = _undoStack.pop();
  Object.assign(state, snapshot);
  for (const player of state.players) {
    if (player.character?.id) {
      player.character = getCharacter(player.character.id) ?? player.character;
    }
    if (player.drunkFakeRole?.id) {
      player.drunkFakeRole = getCharacter(player.drunkFakeRole.id) ?? player.drunkFakeRole;
    }
  }
  saveState(state);
  emit('state:phase-changed', { phase: state.phase });
  emit('state:players-updated');
  emit('state:override-mode-changed', { overrideMode: state.overrideMode });
  emit('state:undo-stack-changed', { canUndo: _undoStack.length > 0 });
  return true;
}

// ─── Initial state factory ────────────────────────────────────────────────────

function makeNominations() {
  return {
    open: false,
    nominatorsUsed: [],
    nomineesUsed: [],
    currentNominator: null,
    currentNominee: null,
    votes: [],
    highestVoteCount: 0,
    pendingExecution: null,
    tiedPlayerIds: [],
    firstVoteTallied: false,
    gunslingerUsed: false,
  };
}

function makeExile() {
  return {
    open: false,
    targetId: null,
    votes: [],
  };
}

function makeNight() {
  return {
    wakeDeck: [],
    currentCardIndex: 0,
    pendingKill: null,
    pendingPoison: null,
    pendingProtect: null,
  };
}

export const state = {
  phase: 'SETUP',
  dayCount: 0,
  players: [],
  nominations: makeNominations(),
  night: makeNight(),
  exile: makeExile(),
  bureaucratTarget: null,
  thiefTarget: null,
  setup: {
    step: 1,
    playerNames: [],
    rolePool: [],
    assignments: {},
    drunkFakeRole: null,
    redHerring: null,
    travellers: [],
  },
  overrideMode: false,
  lastExecutedPlayerId: null, // tracks who was executed for Undertaker
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function persist() {
  saveState(state);
}

function addHistory(player, type, description, isOverride = false) {
  player.history.push({
    turn: state.phase === 'NIGHT' ? `Night ${state.dayCount + 1}` : `Day ${state.dayCount}`,
    type,
    description,
    isOverride,
    timestamp: Date.now(),
  });
}

export function getLivingPlayers() {
  return state.players.filter((p) => p.isAlive);
}

export function countLiving() {
  return getLivingPlayers().length;
}

export function countLivingNonTravellers() {
  return state.players.filter((p) => p.isAlive && !p.isTraveller).length;
}

export function findLivingDemon() {
  return state.players.find((p) => p.isAlive && p.character.type === 'DEMON') ?? null;
}

export function findPlayerById(id) {
  return state.players.find((p) => p.id === id) ?? null;
}

export function votesNeededToExecute() {
  return Math.floor(countLiving() / 2) + 1;
}

// ─── Hydrate (restore from localStorage) ────────────────────────────────────

export function hydrateState(saved) {
  Object.assign(state, saved);
  // Ensure new top-level fields exist for saves from before Travellers
  if (!state.exile) state.exile = makeExile();
  if (state.bureaucratTarget === undefined) state.bureaucratTarget = null;
  if (state.thiefTarget === undefined) state.thiefTarget = null;
  if (!state.setup.travellers) state.setup.travellers = [];
  // Re-link character objects (they're serialised as plain objects)
  for (const player of state.players) {
    if (player.character?.id) {
      player.character = getCharacter(player.character.id) ?? player.character;
    }
    if (player.drunkFakeRole?.id) {
      player.drunkFakeRole = getCharacter(player.drunkFakeRole.id) ?? player.drunkFakeRole;
    }
    if (player.isTraveller === undefined) player.isTraveller = false;
  }
}

// ─── Phase transitions ────────────────────────────────────────────────────────

export function beginNight() {
  // Reset status flags at start of night
  for (const player of state.players) {
    player.isSafe = false;
    player.isPoisoned = false;
  }
  state.night = makeNight();
  // Partial deck: Tier 1-2 and information roles. Ravenkeeper added after Imp resolves.
  state.night.wakeDeck = buildWakeDeck(state);
  state.phase = 'NIGHT';
  persist();
  emit('state:phase-changed', { phase: 'NIGHT' });
}

export function advanceNightCard() {
  pushSnapshot();
  state.night.currentCardIndex++;

  // After Imp resolves, we may need to insert Ravenkeeper
  const currentChar = state.night.wakeDeck[state.night.currentCardIndex - 1];
  if (currentChar?.characterId === 'imp' && state.night.pendingKill) {
    const victim = findPlayerById(state.night.pendingKill);
    if (victim?.character.id === 'ravenkeeper') {
      // Insert Ravenkeeper card right after current position
      state.night.wakeDeck.splice(state.night.currentCardIndex, 0, {
        characterId: 'ravenkeeper',
        playerId: victim.id,
        isDrunkProxy: false,
      });
    }
  }

  persist();
  emit('state:night-deck-advanced', { index: state.night.currentCardIndex });
}


export function advanceToDawn() {
  pushSnapshot();
  // Apply night kill
  if (state.night.pendingKill) {
    const victim = findPlayerById(state.night.pendingKill);
    if (victim && victim.isAlive && !victim.isSafe) {
      victim.isAlive = false;
      addHistory(victim, 'DEATH', `Killed by the Demon on Night ${state.dayCount + 1}.`);
    }
    state.night.pendingKill = null;
  }

  // Increment day count and transition
  state.dayCount++;
  state.lastExecutedPlayerId = null;
  state.nominations = makeNominations();
  state.phase = 'DAY';
  persist();
  emit('state:phase-changed', { phase: 'DAY' });
  emit('state:players-updated');
}

export function advanceToNight() {
  pushSnapshot();
  // Clear per-night status flags so they don't bleed into the next night
  for (const player of state.players) {
    player.isSafe = false;
    player.isPoisoned = false;
  }
  // Clear vote modifiers from the previous night
  state.bureaucratTarget = null;
  state.thiefTarget = null;
  state.night = makeNight();
  // Re-build deck now (Ravenkeeper inclusion deferred until after Imp resolves)
  state.night.wakeDeck = buildWakeDeck(state);
  state.phase = 'NIGHT';
  persist();
  emit('state:phase-changed', { phase: 'NIGHT' });
}

export function persistState() {
  persist();
}

// ─── Night action mutations ───────────────────────────────────────────────────

export function setNightPoison(targetId) {
  pushSnapshot();
  const target = findPlayerById(targetId);
  if (!target) return;
  target.isPoisoned = true;
  state.night.pendingPoison = targetId;
  addHistory(target, 'POISONED', `Poisoned by the Poisoner on Night ${state.dayCount + 1}.`);
  persist();
  emit('state:player-updated', { playerId: targetId });
}

export function setNightProtect(targetId) {
  pushSnapshot();
  const target = findPlayerById(targetId);
  if (!target) return;
  target.isSafe = true;
  state.night.pendingProtect = targetId;
  addHistory(target, 'PROTECTED', `Protected by the Monk on Night ${state.dayCount + 1}.`);
  persist();
  emit('state:player-updated', { playerId: targetId });
}

export function setNightKill(targetId) {
  pushSnapshot();
  state.night.pendingKill = targetId;
  const target = findPlayerById(targetId);
  if (target) {
    addHistory(target, 'TARGETED', `Targeted by the Imp on Night ${state.dayCount + 1}.`);
  }
  persist();
}

export function setButlerMaster(butlerPlayerId, masterId) {
  pushSnapshot();
  const butler = findPlayerById(butlerPlayerId);
  if (!butler) return;
  butler.customState.master = masterId;
  const master = findPlayerById(masterId);
  addHistory(butler, 'BUTLER', `Chose ${master?.name ?? masterId} as master for Day ${state.dayCount + 1}.`);
  persist();
}

export function logNightInfo(playerId, description) {
  pushSnapshot();
  const player = findPlayerById(playerId);
  if (!player) return;
  addHistory(player, 'INFO', description);
  persist();
}

// ─── Day mutations ────────────────────────────────────────────────────────────

export function openNominations() {
  pushSnapshot();
  state.nominations.open = true;
  persist();
  emit('state:nomination-updated', state.nominations);
}

export function closeNominations() {
  pushSnapshot();
  state.nominations.open = false;
  persist();
  emit('state:nomination-updated', state.nominations);
}

export function setCurrentNomination(nominatorId, nomineeId) {
  pushSnapshot();
  state.nominations.currentNominator = nominatorId;
  state.nominations.currentNominee = nomineeId;
  persist();
  emit('state:nomination-updated', state.nominations);
}

export function confirmNomination(nominatorId, nomineeId) {
  pushSnapshot();
  state.nominations.nominatorsUsed.push(nominatorId);
  state.nominations.nomineesUsed.push(nomineeId);
  state.nominations.votes = [];
  const nominator = findPlayerById(nominatorId);
  const nominee = findPlayerById(nomineeId);
  addHistory(nominator, 'NOMINATED', `Nominated ${nominee?.name ?? nomineeId} on Day ${state.dayCount}.`);
  addHistory(nominee, 'NOMINATED', `Was nominated by ${nominator?.name ?? nominatorId} on Day ${state.dayCount}.`);
  persist();
  emit('state:nomination-updated', state.nominations);
}

export function castVote(playerId, votedYes) {
  pushSnapshot();
  // Remove any prior vote by this player (re-vote protection)
  state.nominations.votes = state.nominations.votes.filter((v) => v.playerId !== playerId);
  state.nominations.votes.push({ playerId, votedYes });
  // Spend ghost vote if dead and voting yes
  if (votedYes) {
    const player = findPlayerById(playerId);
    if (player && !player.isAlive && player.hasGhostVote) {
      player.hasGhostVote = false;
      addHistory(player, 'GHOST_VOTE', `Spent ghost vote on Day ${state.dayCount}.`);
      emit('state:player-updated', { playerId });
    }
  }
  persist();
  emit('state:nomination-updated', state.nominations);
}

export function closeVoting() {
  pushSnapshot();
  // Apply Bureaucrat (×3) and Thief (×−1) vote modifiers
  let yesVotes = 0;
  for (const vote of state.nominations.votes) {
    if (!vote.votedYes) continue;
    if (vote.playerId === state.bureaucratTarget) {
      yesVotes += 3;
    } else if (vote.playerId === state.thiefTarget) {
      yesVotes -= 1;
    } else {
      yesVotes += 1;
    }
  }
  yesVotes = Math.max(0, yesVotes);
  const threshold = votesNeededToExecute();
  const nominee = findPlayerById(state.nominations.currentNominee);

  if (yesVotes >= threshold) {
    if (yesVotes > state.nominations.highestVoteCount) {
      state.nominations.pendingExecution = state.nominations.currentNominee;
      state.nominations.highestVoteCount = yesVotes;
      state.nominations.tiedPlayerIds = [];
      if (nominee) addHistory(nominee, 'ON_BLOCK', `Put on the block with ${yesVotes} votes on Day ${state.dayCount}.`);
    } else if (yesVotes === state.nominations.highestVoteCount) {
      // Only add to tied list if the id is non-null (avoids phantom "?" on 3-way ties)
      if (
        state.nominations.pendingExecution !== null &&
        !state.nominations.tiedPlayerIds.includes(state.nominations.pendingExecution)
      ) {
        state.nominations.tiedPlayerIds.push(state.nominations.pendingExecution);
      }
      if (!state.nominations.tiedPlayerIds.includes(state.nominations.currentNominee)) {
        state.nominations.tiedPlayerIds.push(state.nominations.currentNominee);
      }
      state.nominations.pendingExecution = null;
    }
  }

  state.nominations.firstVoteTallied = true;
  state.nominations.currentNominator = null;
  state.nominations.currentNominee = null;
  state.nominations.votes = [];
  persist();
  emit('state:nomination-updated', state.nominations);

  return { yesVotes, threshold };
}

export function executeDusk() {
  pushSnapshot();
  const execId = state.nominations.pendingExecution;
  if (execId) {
    const player = findPlayerById(execId);
    if (player) {
      player.isAlive = false;
      addHistory(player, 'EXECUTED', `Executed on Day ${state.dayCount}.`);
      state.lastExecutedPlayerId = execId;
      emit('state:player-updated', { playerId: execId });
    }
  }
  state.nominations.pendingExecution = null;
  persist();
  emit('state:players-updated');
}

export function setBureaucratTarget(targetId) {
  pushSnapshot();
  const target = findPlayerById(targetId);
  if (!target) return;
  state.bureaucratTarget = targetId;
  addHistory(target, 'INFO', `Chosen by the Bureaucrat — vote counts as ×3 on Day ${state.dayCount + 1}.`);
  persist();
  emit('state:players-updated');
}

export function setThiefTarget(targetId) {
  pushSnapshot();
  const target = findPlayerById(targetId);
  if (!target) return;
  state.thiefTarget = targetId;
  addHistory(target, 'INFO', `Chosen by the Thief — vote counts as −1 on Day ${state.dayCount + 1}.`);
  persist();
  emit('state:players-updated');
}

export function gunslingerKill(targetId) {
  pushSnapshot();
  const target = findPlayerById(targetId);
  if (!target) return;
  target.isAlive = false;
  addHistory(target, 'DEATH', `Shot by the Gunslinger on Day ${state.dayCount}.`);
  state.nominations.gunslingerUsed = true;
  persist();
  emit('state:player-updated', { playerId: targetId });
  emit('state:players-updated');
}

export function redirectExecutionToScapegoat(scapegoatId) {
  pushSnapshot();
  state.nominations.pendingExecution = scapegoatId;
  persist();
  emit('state:nomination-updated', state.nominations);
}

export function openExile(targetId) {
  pushSnapshot();
  state.exile = { open: true, targetId, votes: [] };
  persist();
  emit('state:exile-updated', state.exile);
}

export function closeExile() {
  pushSnapshot();
  state.exile = makeExile();
  persist();
  emit('state:exile-updated', state.exile);
}

export function castExileVote(playerId, votedYes) {
  pushSnapshot();
  state.exile.votes = state.exile.votes.filter((v) => v.playerId !== playerId);
  state.exile.votes.push({ playerId, votedYes });
  // Dead players do NOT spend ghost vote for exile
  persist();
  emit('state:exile-updated', state.exile);
}

export function resolveExile() {
  pushSnapshot();
  const yesVotes = state.exile.votes.filter((v) => v.votedYes).length;
  const totalPlayers = state.players.length;
  const threshold = Math.ceil(totalPlayers / 2);
  let success = false;

  if (yesVotes >= threshold) {
    success = true;
    const target = findPlayerById(state.exile.targetId);
    if (target && target.isAlive) {
      target.isAlive = false;
      addHistory(target, 'EXILED', `Exiled on Day ${state.dayCount} with ${yesVotes}/${totalPlayers} votes.`);
      emit('state:player-updated', { playerId: target.id });
    }
  }

  state.exile = makeExile();
  persist();
  emit('state:exile-updated', state.exile);
  emit('state:players-updated');

  return { yesVotes, threshold, success };
}

export function transferBeggarvote(deadPlayerId, beggarId) {
  pushSnapshot();
  const dead = findPlayerById(deadPlayerId);
  const beggar = findPlayerById(beggarId);
  if (!dead || !beggar || dead.isAlive || !dead.hasGhostVote) return;
  dead.hasGhostVote = false;
  beggar.customState.voteTokenFrom = deadPlayerId;
  addHistory(dead, 'GHOST_VOTE', `Gave ghost vote to the Beggar (${beggar.name}) on Day ${state.dayCount}.`);
  addHistory(beggar, 'INFO', `Received ghost vote from ${dead.name} (${dead.alignment}) on Day ${state.dayCount}.`);
  persist();
  emit('state:player-updated', { playerId: deadPlayerId });
  emit('state:player-updated', { playerId: beggarId });
  return { alignment: dead.alignment };
}

// ─── Override mutations ───────────────────────────────────────────────────────

export function overrideRevivePlayer(playerId) {
  pushSnapshot();
  const player = findPlayerById(playerId);
  if (!player) return;
  player.isAlive = true;
  addHistory(player, 'OVERRIDE', `[OVERRIDE] Resurrected on ${state.phase} ${state.dayCount}.`, true);
  persist();
  emit('state:player-updated', { playerId });
}

export function overrideKillPlayer(playerId) {
  pushSnapshot();
  const player = findPlayerById(playerId);
  if (!player) return;
  player.isAlive = false;
  addHistory(player, 'OVERRIDE', `[OVERRIDE] Killed on ${state.phase} ${state.dayCount}.`, true);
  persist();
  emit('state:player-updated', { playerId });
}

export function overrideSwapRole(playerId, newCharacterId) {
  pushSnapshot();
  const player = findPlayerById(playerId);
  const newChar = getCharacter(newCharacterId);
  if (!player || !newChar) return;
  const old = player.character.name;
  player.character = newChar;
  player.alignment = newChar.alignment;
  if (newChar.id !== 'drunk') player.isDrunk = false;
  addHistory(player, 'OVERRIDE', `[OVERRIDE] Role changed from ${old} to ${newChar.name}.`, true);
  persist();
  emit('state:player-updated', { playerId });
}

export function overrideSetAlignment(playerId, alignment) {
  pushSnapshot();
  const player = findPlayerById(playerId);
  if (!player) return;
  player.alignment = alignment;
  addHistory(player, 'OVERRIDE', `[OVERRIDE] Alignment set to ${alignment}.`, true);
  persist();
  emit('state:player-updated', { playerId });
}

export function overrideRestoreGhostVote(playerId) {
  pushSnapshot();
  const player = findPlayerById(playerId);
  if (!player) return;
  player.hasGhostVote = true;
  addHistory(player, 'OVERRIDE', `[OVERRIDE] Ghost vote restored.`, true);
  persist();
  emit('state:player-updated', { playerId });
}

export function overrideSetPoisoned(playerId, val) {
  pushSnapshot();
  const player = findPlayerById(playerId);
  if (!player) return;
  player.isPoisoned = val;
  addHistory(player, 'OVERRIDE', `[OVERRIDE] Poisoned set to ${val}.`, true);
  persist();
  emit('state:player-updated', { playerId });
}

export function overrideSetSafe(playerId, val) {
  pushSnapshot();
  const player = findPlayerById(playerId);
  if (!player) return;
  player.isSafe = val;
  addHistory(player, 'OVERRIDE', `[OVERRIDE] Safe set to ${val}.`, true);
  persist();
  emit('state:player-updated', { playerId });
}

export function overrideSetDrunkFakeRole(playerId, fakeRoleId) {
  pushSnapshot();
  const player = findPlayerById(playerId);
  const fakeRole = getCharacter(fakeRoleId);
  if (!player || !fakeRole) return;
  player.drunkFakeRole = fakeRole;
  addHistory(player, 'OVERRIDE', `[OVERRIDE] Drunk fake role set to ${fakeRole.name}.`, true);
  persist();
  emit('state:player-updated', { playerId });
}

export function setOverrideMode(val) {
  state.overrideMode = val;
  persist();
  emit('state:override-mode-changed', { overrideMode: val });
}

// ─── Setup mutations ──────────────────────────────────────────────────────────

export function setupSetPlayerNames(names) {
  state.setup.playerNames = names;
  persist();
  emit('state:players-updated');
}

export function setupSetRolePool(roleIds) {
  state.setup.rolePool = roleIds;
  persist();
}

export function setupSetAssignment(playerId, characterId) {
  state.setup.assignments[playerId] = characterId;
  persist();
  emit('state:players-updated');
}

export function setupSetDrunkFakeRole(roleId) {
  state.setup.drunkFakeRole = roleId;
  persist();
}

export function setupSetRedHerring(playerId) {
  state.setup.redHerring = playerId;
  persist();
}

export function setupSetStep(step) {
  state.setup.step = step;
  persist();
  emit('state:setup-step-changed', { step });
}

export function setupAddTraveller(name, characterId, alignment) {
  if (!state.setup.travellers) state.setup.travellers = [];
  state.setup.travellers.push({ name, characterId, alignment });
  persist();
}

export function setupRemoveTraveller(index) {
  if (!state.setup.travellers) return;
  state.setup.travellers.splice(index, 1);
  persist();
}

export function finalizeSetup() {
  // Build regular player objects from setup data
  state.players = state.setup.playerNames.map((name, i) => {
    const id = `player-${i}`;
    const charId = state.setup.assignments[id];
    const character = getCharacter(charId);
    return {
      id,
      name,
      character,
      alignment: character.alignment,
      isTraveller: false,
      isAlive: true,
      hasGhostVote: true,
      isPoisoned: false,
      isDrunk: character.id === 'drunk',
      isSafe: false,
      drunkFakeRole: character.id === 'drunk' ? getCharacter(state.setup.drunkFakeRole) : null,
      customState: {
        ...(character.id === 'fortuneteller' ? { redHerring: state.setup.redHerring } : {}),
        ...(character.id === 'slayer' ? { slayerUsed: false } : {}),
        ...(character.id === 'imp' ? { starpassed: false } : {}),
        ...(character.id === 'virgin' ? { virginTriggered: false } : {}),
      },
      history: [],
    };
  });

  // Append Traveller players
  const travellers = state.setup.travellers ?? [];
  for (let i = 0; i < travellers.length; i++) {
    const { name, characterId, alignment } = travellers[i];
    const character = getCharacter(characterId);
    if (!character) continue;
    state.players.push({
      id: `traveller-${i}`,
      name,
      character,
      alignment,
      isTraveller: true,
      isAlive: true,
      hasGhostVote: true,
      isPoisoned: false,
      isDrunk: false,
      isSafe: false,
      drunkFakeRole: null,
      customState: {
        ...(character.id === 'beggar' ? { voteTokenFrom: null } : {}),
        ...(character.id === 'gunslinger' ? { gunslingerUsed: false } : {}),
      },
      history: [],
    });
  }

  state.dayCount = 0;
  state.nominations = makeNominations();
  state.exile = makeExile();
  state.bureaucratTarget = null;
  state.thiefTarget = null;
  state.lastExecutedPlayerId = null;
  // Clear any dragged layout positions from a previous game — player IDs reuse across games
  localStorage.removeItem('botc-layout-positions');
  persist();
  beginNight();
  emit('state:players-updated');
}
