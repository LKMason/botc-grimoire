import { state } from '../state/GameState.js';
import { CHARACTER_LIST } from '../data/characters.js';

/**
 * Renders the Night 1 introductory information cards:
 *   __minion_info__ — ST wakes Minions, shows them the Demon and each other
 *   __demon_info__  — ST wakes Demon, shows them the Minions and 3 bluff tokens
 */
export class IntroInfoCard {
  constructor(entry, onConfirm) {
    this.entry = entry;
    this.onConfirm = onConfirm;
    this.selectedBluffs = new Set();

    this.el = document.createElement('div');
    this.el.className = 'night-card';
    this._render();
  }

  destroy() {}

  _livingMinions() {
    return state.players.filter((p) => p.isAlive && p.character.type === 'MINION');
  }

  _livingDemon() {
    return state.players.find((p) => p.isAlive && p.character.type === 'DEMON') ?? null;
  }

  _availableBluffs() {
    const inPlayIds = new Set(
      state.players
        .map((p) => p.character.id)
        .filter((id) => id !== 'drunk')
    );
    return CHARACTER_LIST.filter(
      (c) => (c.type === 'TOWNSFOLK' || c.type === 'OUTSIDER') && !inPlayIds.has(c.id)
    );
  }

  _render() {
    const isMinionInfo = this.entry.characterId === '__minion_info__';
    const minions = this._livingMinions();
    const demon = this._livingDemon();
    const bluffs = isMinionInfo ? [] : this._availableBluffs();

    const playerRow = (p) =>
      `<div class="intro-player-row">
        <span class="intro-player-emoji">${p.character.emoji}</span>
        <span class="intro-player-name">${p.name}</span>
        <span class="intro-player-role">${p.character.name}</span>
      </div>`;

    let body = '';
    if (isMinionInfo) {
      const minionRows = minions.length > 0
        ? minions.map(playerRow).join('')
        : `<div class="intro-player-row" style="opacity:0.5">No Minions in this game.</div>`;
      const demonRow = demon
        ? playerRow(demon)
        : `<div class="intro-player-row" style="opacity:0.5">No Demon found.</div>`;

      body = `
        <div class="night-card-instruction">
          Wake all Minions. They open their eyes and see each other, then see the Demon.
          Put them back to sleep.
        </div>
        <div class="intro-section">
          <div class="intro-section-label">Minions (wake these players)</div>
          ${minionRows}
        </div>
        <div class="intro-section">
          <div class="intro-section-label">Point at the Demon</div>
          ${demonRow}
        </div>
      `;
    } else {
      const minionRows = minions.length > 0
        ? minions.map(playerRow).join('')
        : `<div class="intro-player-row" style="opacity:0.5">No Minions in this game.</div>`;
      const demonRow = demon
        ? playerRow(demon)
        : `<div class="intro-player-row" style="opacity:0.5">No Demon found.</div>`;

      const bluffTokens = bluffs.map((c) => {
        const selected = this.selectedBluffs.has(c.id);
        return `
          <div class="valid-token selectable ${selected ? 'selected' : ''}" data-bluff-id="${c.id}">
            <span>${c.emoji}</span><span>${c.name}</span>
          </div>
        `;
      }).join('');

      body = `
        <div class="night-card-instruction">
          Wake the Demon. They open their eyes and see their Minions.
          Show them 3 unused character tokens as bluffs. Put them to sleep.
        </div>
        <div class="intro-section">
          <div class="intro-section-label">Wake the Demon</div>
          ${demonRow}
        </div>
        <div class="intro-section">
          <div class="intro-section-label">Point at the Minions</div>
          ${minionRows}
        </div>
        <div class="intro-section">
          <div class="intro-section-label">
            Choose 3 bluff tokens to show
            <span class="intro-bluff-count">(${this.selectedBluffs.size}/3 selected)</span>
          </div>
          <div class="valid-tokens">${bluffTokens}</div>
        </div>
      `;
    }

    const confirmReady = isMinionInfo || this.selectedBluffs.size === 3;

    this.el.innerHTML = `
      <div class="night-card-header">
        <span class="night-card-emoji">${isMinionInfo ? '👿' : '😈'}</span>
        <div class="night-card-title-group">
          <div class="night-card-character">${isMinionInfo ? 'Minion Information' : 'Demon Information'}</div>
          <span class="night-card-type-badge ${isMinionInfo ? 'badge-minion' : 'badge-demon'}">
            ${isMinionInfo ? 'MINION' : 'DEMON'}
          </span>
        </div>
      </div>
      <div class="night-card-body">${body}</div>
      <div class="night-card-footer">
        <button class="btn btn-primary btn-full" id="ic-confirm" ${confirmReady ? '' : 'disabled'}>
          Confirm &amp; Sleep →
        </button>
      </div>
    `;

    this._bindEvents();
  }

  _bindEvents() {
    this.el.querySelector('#ic-confirm')?.addEventListener('click', () => this.onConfirm());

    this.el.querySelectorAll('[data-bluff-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.bluffId;
        if (this.selectedBluffs.has(id)) {
          this.selectedBluffs.delete(id);
        } else if (this.selectedBluffs.size < 3) {
          this.selectedBluffs.add(id);
        }
        this._render();
      });
    });
  }
}
