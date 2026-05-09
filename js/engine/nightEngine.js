import { state, findPlayerById, getLivingPlayers } from '../state/GameState.js';
import {
  computeEmpathNumber,
  computeChefNumber,
  computeFortuneTellerResult,
  isSoldierProtected,
  isMonkProtected,
} from './rulesEngine.js';
import { getCharacter, TOWNSFOLK, OUTSIDERS, MINIONS } from '../data/characters.js';

/**
 * Given a night card's logic key and the player targets selected by the ST,
 * compute what the ST can/should show to the waking player.
 *
 * Returns:
 *  {
 *    type: 'TOKENS' | 'NUMBER' | 'BOOL' | 'GRIMOIRE' | 'REVEAL' | 'ACTION',
 *    validTokens: Character[],       // for TOKENS type
 *    requiresSTChoice: boolean,      // true when multiple options exist
 *    result: any,                    // computed value for NUMBER/BOOL
 *    note: string,                   // advisory note for ST
 *    isReady: boolean,               // true when enough targets are selected
 *  }
 */
export function getValidRoles(logicKey, selectedPlayerIds, cardPlayerId) {
  const cardPlayer = findPlayerById(cardPlayerId);
  const isAffected = cardPlayer?.isPoisoned || cardPlayer?.isDrunk;

  switch (logicKey) {
    case 'WASHERWOMAN': {
      if (selectedPlayerIds.length < 2) return notReady();
      const tokens = new Set();
      let requiresSTChoice = false;
      for (const id of selectedPlayerIds) {
        const p = findPlayerById(id);
        if (!p) continue;
        if (p.character.type === 'TOWNSFOLK') tokens.add(p.character.id);
        if (p.character.id === 'recluse') {
          requiresSTChoice = true;
          TOWNSFOLK.forEach((c) => tokens.add(c.id));
        }
        // Spy can register as Townsfolk
        if (p.character.id === 'spy') {
          requiresSTChoice = true;
          TOWNSFOLK.forEach((c) => tokens.add(c.id));
        }
      }
      const note = isAffected ? 'Player is POISONED/DRUNK — you may show any Townsfolk token.' : '';
      if (isAffected) TOWNSFOLK.forEach((c) => tokens.add(c.id));
      return {
        type: 'TOKENS',
        validTokens: [...tokens].map(getCharacter).filter(Boolean),
        requiresSTChoice,
        result: null,
        note,
        isReady: true,
      };
    }

    case 'LIBRARIAN': {
      if (selectedPlayerIds.length < 2) return notReady();
      const tokens = new Set();
      let requiresSTChoice = false;
      let hasOutsider = false;
      for (const id of selectedPlayerIds) {
        const p = findPlayerById(id);
        if (!p) continue;
        if (p.character.type === 'OUTSIDER') { tokens.add(p.character.id); hasOutsider = true; }
        if (p.character.id === 'recluse') {
          requiresSTChoice = true;
          OUTSIDERS.forEach((c) => tokens.add(c.id));
          hasOutsider = true;
        }
        if (p.character.id === 'spy') {
          requiresSTChoice = true;
          OUTSIDERS.forEach((c) => tokens.add(c.id));
          hasOutsider = true;
        }
      }
      const livingOutsiders = getLivingPlayers().filter((p) => p.character.type === 'OUTSIDER');
      const noOutsidersInPlay = livingOutsiders.length === 0 && !hasOutsider;
      const note = isAffected
        ? 'Player is POISONED/DRUNK — you may show any Outsider token or "0".'
        : noOutsidersInPlay
        ? 'No Outsiders are in play. Show "0".'
        : '';
      if (isAffected) { OUTSIDERS.forEach((c) => tokens.add(c.id)); requiresSTChoice = true; }
      return {
        type: 'TOKENS',
        validTokens: [...tokens].map(getCharacter).filter(Boolean),
        requiresSTChoice,
        result: null,
        note: noOutsidersInPlay ? 'No Outsiders in play — show the "0" token.' : note,
        showZero: noOutsidersInPlay || isAffected,
        isReady: true,
      };
    }

    case 'INVESTIGATOR': {
      if (selectedPlayerIds.length < 2) return notReady();
      const tokens = new Set();
      let requiresSTChoice = false;
      for (const id of selectedPlayerIds) {
        const p = findPlayerById(id);
        if (!p) continue;
        if (p.character.type === 'MINION') tokens.add(p.character.id);
        if (p.character.id === 'recluse') {
          requiresSTChoice = true;
          MINIONS.forEach((c) => tokens.add(c.id));
        }
      }
      const note = isAffected ? 'Player is POISONED/DRUNK — you may show any Minion token.' : '';
      if (isAffected) { MINIONS.forEach((c) => tokens.add(c.id)); requiresSTChoice = true; }
      return {
        type: 'TOKENS',
        validTokens: [...tokens].map(getCharacter).filter(Boolean),
        requiresSTChoice,
        result: null,
        note,
        isReady: true,
      };
    }

    case 'CHEF': {
      const n = isAffected ? null : computeChefNumber();
      return {
        type: 'NUMBER',
        validTokens: [],
        requiresSTChoice: false,
        result: n,
        note: isAffected ? 'Player is POISONED/DRUNK — you may show any number.' : `Show the number: ${n}`,
        isReady: true,
      };
    }

    case 'EMPATH': {
      const n = isAffected ? null : computeEmpathNumber(cardPlayerId);
      return {
        type: 'NUMBER',
        validTokens: [],
        requiresSTChoice: false,
        result: n,
        note: isAffected
          ? 'Player is POISONED/DRUNK — true number is ' + computeEmpathNumber(cardPlayerId) + '. You may show 0, 1, or 2.'
          : `Show the number: ${n}`,
        isReady: true,
      };
    }

    case 'FORTUNE_TELLER': {
      if (selectedPlayerIds.length < 2) return notReady();
      const realResult = computeFortuneTellerResult(cardPlayerId, selectedPlayerIds[0], selectedPlayerIds[1]);
      const result = isAffected ? null : realResult;
      return {
        type: 'BOOL',
        validTokens: [],
        requiresSTChoice: false,
        result,
        note: isAffected
          ? `Player is POISONED/DRUNK — true answer is "${realResult ? 'YES' : 'NO'}". You may show either.`
          : `Show: ${realResult ? '✅ YES' : '❌ NO'}`,
        isReady: true,
      };
    }

    case 'UNDERTAKER': {
      const execId = state.lastExecutedPlayerId;
      if (!execId) {
        return {
          type: 'ACTION',
          validTokens: [],
          requiresSTChoice: false,
          result: null,
          note: 'No execution yesterday — do not wake the Undertaker.',
          isReady: true,
        };
      }
      const executed = findPlayerById(execId);
      return {
        type: 'REVEAL',
        validTokens: executed ? [executed.character] : [],
        requiresSTChoice: false,
        result: executed?.character ?? null,
        note: isAffected
          ? `Player is POISONED/DRUNK — true answer is ${executed?.character.name ?? '?'}. You may show any character.`
          : `Show: ${executed?.character.emoji ?? ''} ${executed?.character.name ?? '?'}`,
        isReady: true,
      };
    }

    case 'MONK': {
      if (selectedPlayerIds.length < 1) return notReady();
      return {
        type: 'ACTION',
        validTokens: [],
        requiresSTChoice: false,
        result: selectedPlayerIds[0],
        note: isAffected
          ? 'Monk is POISONED/DRUNK — protection has no effect (do not set isSafe).'
          : `${findPlayerById(selectedPlayerIds[0])?.name ?? '?'} will be protected tonight.`,
        isReady: true,
      };
    }

    case 'POISONER': {
      if (selectedPlayerIds.length < 1) return notReady();
      return {
        type: 'ACTION',
        validTokens: [],
        requiresSTChoice: false,
        result: selectedPlayerIds[0],
        note: `${findPlayerById(selectedPlayerIds[0])?.name ?? '?'} will be poisoned tonight.`,
        isReady: true,
      };
    }

    case 'IMP': {
      if (selectedPlayerIds.length < 1) return notReady();
      const targetId = selectedPlayerIds[0];
      const target = findPlayerById(targetId);
      const targetIsSelf = targetId === cardPlayerId;
      const soldier = isSoldierProtected(targetId);
      const monk = isMonkProtected(targetId);

      const mayorDeflect = !targetIsSelf && !soldier && !monk
        && target?.character.id === 'mayor'
        && !target?.isPoisoned && !target?.isDrunk;

      let note = '';
      if (targetIsSelf) note = '⚠️ Imp chose themselves — STARPASS! Select a living Minion to become the Imp.';
      else if (soldier) note = '🛡️ Target is the Soldier — kill is prevented automatically.';
      else if (monk) note = '🧘 Target is protected by the Monk — kill is prevented.';
      else if (mayorDeflect) note = '🏛️ Mayor targeted — the kill might deflect to another player.';
      else note = `${target?.name ?? '?'} will die tonight.`;

      return {
        type: 'ACTION',
        validTokens: [],
        requiresSTChoice: false,
        result: targetId,
        note,
        isStarpass: targetIsSelf,
        isBlocked: soldier || monk,
        isMayorDeflect: mayorDeflect,
        isReady: true,
      };
    }

    case 'BUTLER': {
      if (selectedPlayerIds.length < 1) return notReady();
      const master = findPlayerById(selectedPlayerIds[0]);
      return {
        type: 'ACTION',
        validTokens: [],
        requiresSTChoice: false,
        result: selectedPlayerIds[0],
        note: `Butler's master is now ${master?.name ?? '?'}. Tomorrow they may only vote if their master votes first.`,
        isReady: true,
      };
    }

    case 'SPY': {
      return {
        type: 'GRIMOIRE',
        validTokens: [],
        requiresSTChoice: false,
        result: null,
        note: 'Show the Spy the full Grimoire (all player roles and statuses).',
        isReady: true,
      };
    }

    case 'RAVENKEEPER': {
      if (selectedPlayerIds.length < 1) return notReady();
      const target = findPlayerById(selectedPlayerIds[0]);
      return {
        type: 'REVEAL',
        validTokens: target ? [target.character] : [],
        requiresSTChoice: false,
        result: target?.character ?? null,
        note: `Show: ${target?.character.emoji ?? ''} ${target?.character.name ?? '?'}`,
        isReady: true,
      };
    }

    case 'BUREAUCRAT': {
      if (selectedPlayerIds.length < 1) return notReady();
      const target = findPlayerById(selectedPlayerIds[0]);
      return {
        type: 'ACTION',
        validTokens: [],
        requiresSTChoice: false,
        result: selectedPlayerIds[0],
        note: `${target?.name ?? '?'}'s vote will count as ×3 tomorrow.`,
        isReady: true,
      };
    }

    case 'THIEF': {
      if (selectedPlayerIds.length < 1) return notReady();
      const target = findPlayerById(selectedPlayerIds[0]);
      return {
        type: 'ACTION',
        validTokens: [],
        requiresSTChoice: false,
        result: selectedPlayerIds[0],
        note: `${target?.name ?? '?'}'s vote will count as −1 tomorrow.`,
        isReady: true,
      };
    }

    default:
      return { type: 'ACTION', validTokens: [], requiresSTChoice: false, result: null, note: '', isReady: true };
  }
}

function notReady() {
  return { type: 'ACTION', validTokens: [], requiresSTChoice: false, result: null, note: '', isReady: false };
}
