import { getCharacter } from '../data/characters.js';
import { getValidRoles } from '../engine/nightEngine.js';
import { state, findPlayerById, getLivingPlayers, setNightPoison, setNightProtect, setNightKill, setButlerMaster, setBureaucratTarget, setThiefTarget, logNightInfo, pushSnapshot } from '../state/GameState.js';

/**
 * A single night card rendered inside NightDeck.
 * Communicates with TownSquare for target selection via callbacks.
 */
export class NightCard {
  constructor(deckEntry, townSquare, onConfirm) {
    this.entry = deckEntry;
    this.townSquare = townSquare;
    this.onConfirm = onConfirm;

    this.character = getCharacter(deckEntry.characterId);
    this.player = findPlayerById(deckEntry.playerId);
    this.selectedTargets = [];
    this.selectedToken = null;
    this.starpassPending = false;
    this.starpassMinion = null;
    this.mayorDeflectPending = false;
    this.mayorDeflectTarget = null;

    this.el = document.createElement('div');
    this.el.className = 'night-card';
    this._render();
    this._enterTargetingIfNeeded();
  }

  destroy() {
    this.townSquare.exitTargetingMode();
  }

  _render() {
    const char = this.character;
    const player = this.player;
    const action = char.nightAction;
    const isAffected = player?.isPoisoned || player?.isDrunk;
    const isDrunkProxy = this.entry.isDrunkProxy;

    const typeBadgeClass = {
      TOWNSFOLK: 'badge-townsfolk',
      OUTSIDER: 'badge-outsider',
      MINION: 'badge-minion',
      DEMON: 'badge-demon',
      TRAVELLER: 'badge-traveller',
    }[char.type] ?? 'badge-townsfolk';

    let banners = '';
    if (isDrunkProxy) {
      banners += `<div class="drunk-banner">⚠️ THIS PLAYER IS THE DRUNK — Feed them false information.</div>`;
    }
    if (isAffected && !isDrunkProxy) {
      banners += `<div class="poison-banner">☠️ POISONED — Ability fails. You may give false information.</div>`;
    }
    if (char.nightAction?.logicKey === 'FORTUNE_TELLER') {
      const rhId = player?.customState?.redHerring;
      const rhPlayer = rhId ? findPlayerById(rhId) : null;
      if (rhPlayer) {
        banners += `<div class="red-herring-banner">🔴 RED HERRING — ${rhPlayer.name} registers as the Demon.</div>`;
      }
    }

    let body = `<div class="night-card-instruction">${action?.instructionTemplate ?? char.description}</div>`;

    // Target slots
    const targetCount = action?.targetCount ?? 0;
    if (targetCount > 0 && !this.starpassPending) {
      const slotHtml = Array.from({ length: targetCount }, (_, i) => {
        const filled = this.selectedTargets[i];
        const name = filled ? (findPlayerById(filled)?.name ?? '?') : null;
        return `
          <div class="target-slot ${filled ? 'filled' : ''}" data-slot="${i}">
            ${filled
              ? `<span>${findPlayerById(filled)?.character?.emoji ?? '👤'} ${name}</span>
                 <span class="target-slot-remove" data-remove="${i}">✕</span>`
              : `<span>Tap a player in the Town Square…</span>`
            }
          </div>
        `;
      }).join('');
      body += `<div class="target-slots"><div class="target-slots-label">Targets</div>${slotHtml}</div>`;
    }

    // Starpass panel
    if (this.starpassPending) {
      body += `
        <div class="starpass-panel">
          😈 <strong>Starpass!</strong> The Imp targeted themselves. Tap a living Minion to become the new Imp.
        </div>
      `;
    }

    // Result panel (shown when enough targets selected)
    const hasEnoughTargets = this.selectedTargets.length >= targetCount || targetCount === 0;
    if (hasEnoughTargets && !this.starpassPending) {
      body += this._renderResult();
    }

    this.el.innerHTML = `
      <div class="night-card-header">
        <span class="night-card-emoji">${char.emoji}</span>
        <div class="night-card-title-group">
          <div class="night-card-character">${player?.name ? `${player.name} — ` : ''}${char.name}</div>
          <span class="night-card-type-badge ${typeBadgeClass}">${char.type}</span>
        </div>
      </div>
      ${banners}
      <div class="night-card-body">${body}</div>
      <div class="night-card-footer">
        <button class="btn btn-primary btn-full" id="nc-confirm" ${this._isConfirmReady() ? '' : 'disabled'}>
          Confirm &amp; Sleep →
        </button>
      </div>
    `;

    this._bindEvents();
  }

  _renderResult() {
    if (!this.character.nightAction) return '';
    const logicKey = this.character.nightAction.logicKey;
    const result = getValidRoles(logicKey, this.selectedTargets, this.entry.playerId);
    if (!result.isReady) return '';

    if (result.type === 'TOKENS') {
      const tokenHtml = result.validTokens.map((c) => `
        <div class="valid-token selectable ${this.selectedToken === c.id ? 'selected' : ''}" data-token-id="${c.id}">
          <span>${c.emoji}</span><span>${c.name}</span>
        </div>
      `).join('');
      const zeroToken = result.showZero
        ? `<div class="valid-token selectable ${this.selectedToken === '__zero__' ? 'selected' : ''}" data-token-id="__zero__">
             <span>0️⃣</span><span>No Outsiders</span>
           </div>`
        : '';
      return `
        <div class="result-panel">
          <div class="result-label">Valid tokens to show</div>
          <div class="valid-tokens">${tokenHtml}${zeroToken}</div>
          ${result.note ? `<div class="result-note">${result.note}</div>` : ''}
          ${result.requiresSTChoice ? `<div class="result-note" style="color:var(--color-warning)">⚠️ ST's choice (Recluse/Spy registration)</div>` : ''}
        </div>
      `;
    }

    if (result.type === 'NUMBER') {
      return `
        <div class="result-panel">
          <div class="result-label">Show this number</div>
          <div class="result-value">${result.result ?? '?'}</div>
          <div class="result-note">${result.note}</div>
        </div>
      `;
    }

    if (result.type === 'BOOL') {
      const cls = result.result === true ? 'result-yes' : result.result === false ? 'result-no' : '';
      const label = result.result === true ? '✅ YES' : result.result === false ? '❌ NO' : '? (poisoned)';
      return `
        <div class="result-panel">
          <div class="result-label">Fortune Teller result</div>
          <div class="result-value ${cls}">${label}</div>
          <div class="result-note">${result.note}</div>
        </div>
      `;
    }

    if (result.type === 'REVEAL') {
      const revealed = result.result;
      return `
        <div class="result-panel">
          <div class="result-label">Show character</div>
          <div class="result-value">${revealed ? `${revealed.emoji} ${revealed.name}` : 'None today'}</div>
          <div class="result-note">${result.note}</div>
        </div>
      `;
    }

    if (result.type === 'GRIMOIRE') {
      return `
        <div class="result-panel">
          <button class="grimoire-btn" id="show-grimoire">🕵️ Show Grimoire to Spy</button>
          <div class="result-note">${result.note}</div>
        </div>
      `;
    }

    if (result.type === 'ACTION') {
      return `
        <div class="result-panel">
          <div class="result-note">${result.note}</div>
        </div>
      `;
    }

    return '';
  }

  _bindEvents() {
    this.el.querySelector('#nc-confirm')?.addEventListener('click', () => this._confirm());

    this.el.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.remove);
        this.selectedTargets.splice(idx, 1);
        this._rerender();
      });
    });

    this.el.querySelectorAll('[data-token-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedToken = btn.dataset.tokenId;
        this._rerender();
      });
    });

    this.el.querySelector('#show-grimoire')?.addEventListener('click', () => {
      this._showGrimoire();
    });

    this.el.querySelector('#nc-mayor-dies')?.addEventListener('click', () => {
      this._resolveMayorDeflect(false);
    });
  }

  _enterTargetingIfNeeded() {
    const targetCount = this.character.nightAction?.targetCount ?? 0;
    if (targetCount === 0) return;

    const constraint = this.starpassPending ? 'LIVING_MINIONS' : (this.character.nightAction?.targetConstraint ?? 'ANY');
    // Exclude the acting player from NOT_SELF roles (Monk, Butler) so they can't target themselves
    const excludedIds = constraint === 'NOT_SELF' ? [this.entry.playerId] : [];

    this.townSquare.enterTargetingMode({
      maxTargets: this.starpassPending ? 1 : targetCount,
      constraint,
      excludedIds,
      onTargetsChanged: (targets) => {
        if (this.starpassPending) {
          this.starpassMinion = targets[0] ?? null;
        } else {
          this.selectedTargets = targets;
        }
        this._rerender();
      },
    });
  }

  _rerender() {
    const footer = this.el.querySelector('.night-card-footer');
    const body = this.el.querySelector('.night-card-body');
    if (!body || !footer) return;

    const action = this.character.nightAction;
    const targetCount = action?.targetCount ?? 0;
    const isAffected = this.player?.isPoisoned || this.player?.isDrunk;
    const isDrunkProxy = this.entry.isDrunkProxy;

    let bodyHtml = `<div class="night-card-instruction">${action?.instructionTemplate ?? this.character.description}</div>`;

    if (targetCount > 0 && !this.starpassPending) {
      const slotHtml = Array.from({ length: targetCount }, (_, i) => {
        const filled = this.selectedTargets[i];
        return `
          <div class="target-slot ${filled ? 'filled' : ''}" data-slot="${i}">
            ${filled
              ? `<span>${findPlayerById(filled)?.character?.emoji ?? '👤'} ${findPlayerById(filled)?.name ?? '?'}</span>
                 <span class="target-slot-remove" data-remove="${i}">✕</span>`
              : `<span>Tap a player in the Town Square…</span>`
            }
          </div>
        `;
      }).join('');
      bodyHtml += `<div class="target-slots"><div class="target-slots-label">Targets</div>${slotHtml}</div>`;
    }

    if (this.starpassPending) {
      const minionName = this.starpassMinion ? findPlayerById(this.starpassMinion)?.name : null;
      bodyHtml += `
        <div class="starpass-panel">
          😈 <strong>Starpass!</strong> The Imp targeted themselves. Tap a living Minion to become the new Imp.
          ${minionName ? `<br><br>Selected: <strong>${minionName}</strong>` : ''}
        </div>
      `;
    }

    if (this.mayorDeflectPending) {
      const deflectName = this.mayorDeflectTarget ? findPlayerById(this.mayorDeflectTarget)?.name : null;
      bodyHtml += `
        <div class="mayor-deflect-panel">
          🏛️ <strong>Mayor targeted!</strong> Tap a living player to deflect the kill, or choose Mayor Dies.
          ${deflectName ? `<br><br>Deflecting to: <strong>${deflectName}</strong>` : ''}
        </div>
      `;
    }

    const hasEnoughTargets = this.selectedTargets.length >= targetCount || targetCount === 0;
    if (hasEnoughTargets && !this.starpassPending && !this.mayorDeflectPending) {
      bodyHtml += this._renderResult();
    }

    body.innerHTML = bodyHtml;
    if (this.mayorDeflectPending) {
      footer.innerHTML = `
        <div class="mayor-deflect-footer">
          <button class="btn btn-ghost" id="nc-mayor-dies">Mayor Dies</button>
          <button class="btn btn-primary" id="nc-confirm" ${this.mayorDeflectTarget ? '' : 'disabled'}>
            Deflect Kill →
          </button>
        </div>
      `;
    } else {
      footer.innerHTML = `
        <button class="btn btn-primary btn-full" id="nc-confirm" ${this._isConfirmReady() ? '' : 'disabled'}>
          Confirm &amp; Sleep →
        </button>
      `;
    }

    this._bindEvents();
  }

  _isConfirmReady() {
    if (this.mayorDeflectPending) return !!this.mayorDeflectTarget;
    if (this.starpassPending) return !!this.starpassMinion;
    const targetCount = this.character.nightAction?.targetCount ?? 0;
    if (this.selectedTargets.length < targetCount) return false;

    // Token-type results need a token selected
    if (this.character.nightAction) {
      const result = getValidRoles(this.character.nightAction.logicKey, this.selectedTargets, this.entry.playerId);
      if (result.isReady && result.type === 'TOKENS' && result.validTokens.length > 0) {
        return !!this.selectedToken;
      }
    }
    return true;
  }

  _confirm() {
    const logicKey = this.character.nightAction?.logicKey;

    if (this.mayorDeflectPending && this.mayorDeflectTarget) {
      this._resolveMayorDeflect(true);
      return;
    }

    if (this.starpassPending && this.starpassMinion) {
      this._resolveStarpass();
      return;
    }

    // Apply effects
    switch (logicKey) {
      case 'POISONER':
        setNightPoison(this.selectedTargets[0]);
        break;
      case 'MONK': {
        if (!this.player?.isPoisoned && !this.player?.isDrunk) {
          setNightProtect(this.selectedTargets[0]);
        }
        break;
      }
      case 'IMP': {
        const result = getValidRoles(logicKey, this.selectedTargets, this.entry.playerId);
        if (result.isStarpass) {
          const livingMinions = getLivingPlayers().filter((p) => p.character.type === 'MINION');
          if (livingMinions.length === 0) {
            // No Minion to catch — Imp dies, Good wins at dawn
            setNightKill(this.entry.playerId);
            this.townSquare.exitTargetingMode();
            this.onConfirm();
            return;
          }
          // Enter starpass mode
          this.starpassPending = true;
          this.starpassMinion = null;
          this._enterTargetingIfNeeded();
          this._rerender();
          return;
        }
        if (result.isMayorDeflect && !this.mayorDeflectPending) {
          this.mayorDeflectPending = true;
          this.mayorDeflectTarget = null;
          this.townSquare.exitTargetingMode();
          this.townSquare.enterTargetingMode({
            maxTargets: 1,
            constraint: 'ANY',
            excludedIds: [this.selectedTargets[0]],
            onTargetsChanged: (targets) => {
              this.mayorDeflectTarget = targets[0] ?? null;
              this._rerender();
            },
          });
          this._rerender();
          return;
        }
        if (!result.isBlocked) {
          setNightKill(this.selectedTargets[0]);
        } else {
          logNightInfo(this.entry.playerId, `Attempted to kill ${findPlayerById(this.selectedTargets[0])?.name} — blocked.`);
        }
        break;
      }
      case 'BUTLER':
        setButlerMaster(this.entry.playerId, this.selectedTargets[0]);
        break;
      case 'BUREAUCRAT':
        setBureaucratTarget(this.selectedTargets[0]);
        break;
      case 'THIEF':
        setThiefTarget(this.selectedTargets[0]);
        break;
      default:
        // Information roles: just log
        if (this.selectedTargets.length > 0) {
          const targetNames = this.selectedTargets.map((id) => findPlayerById(id)?.name).join(', ');
          const tokenName = this.selectedToken && this.selectedToken !== '__zero__'
            ? getCharacter(this.selectedToken)?.name ?? this.selectedToken
            : this.selectedToken === '__zero__' ? 'No Outsiders' : '';
          logNightInfo(this.entry.playerId,
            `${this.character.name}: pointed to [${targetNames}]${tokenName ? `, shown ${tokenName}` : ''}.`
          );
        }
    }

    this.townSquare.exitTargetingMode();
    this.onConfirm();
  }

  _resolveStarpass() {
    pushSnapshot();
    // Old Imp dies; minion becomes Imp
    const oldImpPlayer = this.player;
    const newImpPlayer = findPlayerById(this.starpassMinion);
    if (!oldImpPlayer || !newImpPlayer) return;

    const impChar = getCharacter('imp');
    // Swap: old Imp gets minion char (use a generic placeholder - in practice old Imp just dies)
    oldImpPlayer.isAlive = false;
    oldImpPlayer.history.push({
      turn: `Night ${state.dayCount + 1}`,
      type: 'STARPASS',
      description: `Starpassed — chose ${newImpPlayer.name} as new Imp.`,
      isOverride: false,
      timestamp: Date.now(),
    });

    newImpPlayer.character = impChar;
    newImpPlayer.alignment = 'Evil';
    newImpPlayer.customState.starpassed = true;
    newImpPlayer.history.push({
      turn: `Night ${state.dayCount + 1}`,
      type: 'STARPASS',
      description: `Became the Imp via Starpass from ${oldImpPlayer.name}.`,
      isOverride: false,
      timestamp: Date.now(),
    });

    this.townSquare.exitTargetingMode();
    this.onConfirm();
  }

  _resolveMayorDeflect(deflect) {
    this.townSquare.exitTargetingMode();
    if (deflect && this.mayorDeflectTarget) {
      setNightKill(this.mayorDeflectTarget);
    } else {
      setNightKill(this.selectedTargets[0]);
    }
    this.onConfirm();
  }

  _showGrimoire() {
    const rows = state.players.map((p) => `
      <div class="grimoire-row ${!p.isAlive ? 'dead' : ''}">
        <span class="grimoire-row-name">${p.name} ${!p.isAlive ? '💀' : ''}</span>
        <span class="grimoire-row-role">${p.character.emoji} ${p.character.name}</span>
        <span class="grimoire-row-alignment ${p.alignment === 'Good' ? 'grimoire-align-good' : 'grimoire-align-evil'}">${p.alignment}</span>
        ${p.isPoisoned ? '<span style="color:var(--color-poison)">☠️</span>' : ''}
        ${p.isSafe ? '<span style="color:var(--color-safe)">🛡️</span>' : ''}
      </div>
    `).join('');

    const overlay = document.createElement('div');
    overlay.className = 'grimoire-overlay';
    overlay.innerHTML = `
      <div class="grimoire-overlay-header">
        <span class="grimoire-overlay-title">🕵️ Grimoire — Spy View</span>
        <button class="btn btn-sm btn-ghost" id="grim-close">Close</button>
      </div>
      <div class="grimoire-overlay-list">${rows}</div>
    `;
    overlay.querySelector('#grim-close').addEventListener('click', () => overlay.remove());
    document.body.appendChild(overlay);
  }
}
