import {
  state,
  findPlayerById,
  getLivingPlayers,
  openNominations,
  confirmNomination,
  closeVoting,
  executeDusk,
  votesNeededToExecute,
} from '../state/GameState.js';
import {
  checkVirginTrigger,
  checkScarletWoman,
  applyScarletWomanCatch,
  checkSaintExecution,
  checkMayorWin,
  checkWinConditions,
} from './rulesEngine.js';
import { emit } from '../state/EventBus.js';

/**
 * Validate and process a nomination.
 * Returns { ok, reason, virginTrigger } where virginTrigger means skip straight to dusk.
 */
export function processNomination(nominatorId, nomineeId) {
  const nominations = state.nominations;
  const nominator = findPlayerById(nominatorId);
  const nominee = findPlayerById(nomineeId);

  if (!nominator || !nominee) return { ok: false, reason: 'Invalid players.' };
  if (!nominator.isAlive) return { ok: false, reason: `${nominator.name} is dead and cannot nominate.` };
  if (nominations.nominatorsUsed.includes(nominatorId))
    return { ok: false, reason: `${nominator.name} has already nominated today.` };
  if (nominations.nomineesUsed.includes(nomineeId))
    return { ok: false, reason: `${nominee.name} has already been nominated today.` };

  // Check Virgin trigger
  const virginTriggered = checkVirginTrigger(nominatorId, nomineeId);

  confirmNomination(nominatorId, nomineeId);

  if (virginTriggered) {
    // Mark Virgin as triggered
    nominee.customState.virginTriggered = true;
    // Execute the nominator immediately, skip to dusk
    return { ok: true, virginTrigger: true, virginExecutedId: nominatorId };
  }

  return { ok: true, virginTrigger: false };
}

/**
 * Validate a vote for the current nomination.
 * Returns { ok, reason, butlerWarning }
 */
export function validateVote(playerId, votedYes) {
  const player = findPlayerById(playerId);
  if (!player) return { ok: false, reason: 'Player not found.' };
  if (!player.isAlive && !player.hasGhostVote)
    return { ok: false, reason: `${player.name} has no ghost vote remaining.` };

  let butlerWarning = null;
  if (votedYes && player.character.id === 'butler' && !player.isDrunk && !player.isPoisoned) {
    const masterId = player.customState.master;
    if (masterId) {
      const masterVote = state.nominations.votes.find((v) => v.playerId === masterId);
      if (!masterVote || !masterVote.votedYes) {
        const master = findPlayerById(masterId);
        butlerWarning = `Butler's master (${master?.name ?? '?'}) has not yet voted Yes. Override or cancel.`;
      }
    }
  }

  return { ok: true, butlerWarning };
}

/**
 * Resolve dusk: apply execution, check win conditions.
 * Returns { win } or null.
 */
export function resolveDusk() {
  const execId = state.nominations.pendingExecution;

  // Check Mayor win before execution
  if (!execId) {
    const mayorWin = checkMayorWin();
    if (mayorWin) {
      emit('state:win-condition-met', mayorWin);
      return { win: mayorWin };
    }
  }

  if (execId) {
    // Check Saint before killing
    const saintResult = checkSaintExecution(execId);

    // Check Scarlet Woman before killing demon
    const dying = findPlayerById(execId);
    let swCaught = null;
    if (dying?.character.type === 'DEMON') {
      const sw = checkScarletWoman(execId);
      if (sw) {
        swCaught = sw;
        applyScarletWomanCatch(sw, dying);
      }
    }

    executeDusk();

    if (saintResult && !swCaught) {
      emit('state:win-condition-met', saintResult);
      return { win: saintResult };
    }
  }

  // General win check
  const win = checkWinConditions();
  if (win) {
    emit('state:win-condition-met', win);
    return { win };
  }

  return null;
}
