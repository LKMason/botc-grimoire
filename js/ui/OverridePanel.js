import { state, findPlayerById, overrideRevivePlayer, overrideKillPlayer, overrideSwapRole, overrideSetAlignment, overrideRestoreGhostVote, overrideSetPoisoned, overrideSetSafe, persistState } from '../state/GameState.js';
import { CHARACTER_LIST } from '../data/characters.js';
import { on, emit } from '../state/EventBus.js';
import { checkWinConditions } from '../engine/rulesEngine.js';

export class OverridePanel {
  constructor() {
    this.el = null;
    this.selectedPlayerId = null;
    this._boundOpen = (e) => this.openForPlayer(e.detail.playerId);
    document.addEventListener('override:open-player', this._boundOpen);
    on('state:player-updated', ({ playerId }) => {
      if (playerId === this.selectedPlayerId) this._renderPlayerForm();
    });
  }

  mount() {
    this.el = document.createElement('div');
    this.el.className = 'override-panel';
    this.el.innerHTML = `
      <div class="override-panel-header">
        <span class="override-panel-title">⚠️ Override Mode</span>
        <button class="btn btn-sm btn-ghost" id="override-close">Close</button>
      </div>
      <div class="override-select-prompt" id="override-prompt">
        <span style="font-size:32px">👆</span>
        <span>Tap a player in the Town Square to edit their state</span>
      </div>
      <div class="override-panel-body" id="override-body" style="display:none"></div>
    `;

    this.el.querySelector('#override-close').addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('override:close'));
    });

    document.body.appendChild(this.el);
  }

  openForPlayer(playerId) {
    this.selectedPlayerId = playerId;
    this._renderPlayerForm();
    this.el.querySelector('#override-prompt').style.display = 'none';
    this.el.querySelector('#override-body').style.display = 'flex';
  }

  _renderPlayerForm() {
    const body = this.el?.querySelector('#override-body');
    if (!body || !this.selectedPlayerId) return;
    const player = findPlayerById(this.selectedPlayerId);
    if (!player) return;

    const charOptions = CHARACTER_LIST
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => `<option value="${c.id}" ${c.id === player.character.id ? 'selected' : ''}>${c.emoji} ${c.name}</option>`)
      .join('');

    body.innerHTML = `
      <div style="font-size:16px;font-weight:800;color:var(--color-white)">${player.character.emoji} ${player.name}</div>

      <div class="override-field">
        <div class="override-field-label">Role</div>
        <select class="override-role-select" id="ov-role">${charOptions}</select>
      </div>

      <div class="override-field">
        <div class="override-field-label">Alignment</div>
        <div class="override-toggle-row">
          <button class="override-toggle-btn ${player.alignment === 'Good' ? 'active-good' : ''}" data-align="Good">Good</button>
          <button class="override-toggle-btn ${player.alignment === 'Evil' ? 'active-evil' : ''}" data-align="Evil">Evil</button>
        </div>
      </div>

      <div class="override-field">
        <div class="override-field-label">Life Status</div>
        <div class="override-toggle-row">
          <button class="override-toggle-btn ${player.isAlive ? 'active-yes' : ''}" data-life="alive">Alive</button>
          <button class="override-toggle-btn ${!player.isAlive ? 'active-evil' : ''}" data-life="dead">Dead</button>
        </div>
      </div>

      <div class="override-field">
        <div class="override-field-label">Ghost Vote</div>
        <div class="override-toggle-row">
          <button class="override-toggle-btn ${player.hasGhostVote ? 'active-yes' : ''}" data-ghost="yes">Available</button>
          <button class="override-toggle-btn ${!player.hasGhostVote ? 'active-no' : ''}" data-ghost="no">Spent</button>
        </div>
      </div>

      <div class="override-field">
        <div class="override-field-label">Poisoned</div>
        <div class="override-toggle-row">
          <button class="override-toggle-btn ${player.isPoisoned ? 'active-evil' : ''}" data-poison="yes">Yes</button>
          <button class="override-toggle-btn ${!player.isPoisoned ? 'active-yes' : ''}" data-poison="no">No</button>
        </div>
      </div>

      <div class="override-field">
        <div class="override-field-label">Protected (Safe)</div>
        <div class="override-toggle-row">
          <button class="override-toggle-btn ${player.isSafe ? 'active-yes' : ''}" data-safe="yes">Yes</button>
          <button class="override-toggle-btn ${!player.isSafe ? 'active-no' : ''}" data-safe="no">No</button>
        </div>
      </div>
    `;

    const pid = this.selectedPlayerId;

    body.querySelector('#ov-role').addEventListener('change', (e) => {
      overrideSwapRole(pid, e.target.value);
    });

    body.querySelectorAll('[data-align]').forEach((btn) => {
      btn.addEventListener('click', () => overrideSetAlignment(pid, btn.dataset.align));
    });

    body.querySelectorAll('[data-life]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.life === 'alive') {
          overrideRevivePlayer(pid);
        } else {
          overrideKillPlayer(pid);
          const win = checkWinConditions();
          if (win) emit('state:win-condition-met', win);
        }
      });
    });

    body.querySelectorAll('[data-ghost]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.ghost === 'yes') {
          overrideRestoreGhostVote(pid);
        } else {
          const p = findPlayerById(pid);
          if (p) {
            p.hasGhostVote = false;
            persistState();
            emit('state:player-updated', { playerId: pid });
          }
        }
      });
    });

    body.querySelectorAll('[data-poison]').forEach((btn) => {
      btn.addEventListener('click', () => overrideSetPoisoned(pid, btn.dataset.poison === 'yes'));
    });

    body.querySelectorAll('[data-safe]').forEach((btn) => {
      btn.addEventListener('click', () => overrideSetSafe(pid, btn.dataset.safe === 'yes'));
    });
  }

  unmount() {
    document.removeEventListener('override:open-player', this._boundOpen);
    this.el?.remove();
    this.el = null;
  }
}
