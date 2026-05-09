import { state, advanceNightCard, advanceToDawn, findPlayerById } from '../state/GameState.js';
import { on } from '../state/EventBus.js';
import { NightCard } from './NightCard.js';
import { IntroInfoCard } from './IntroInfoCard.js';

export class NightDeck {
  constructor(container, townSquare) {
    this.container = container;
    this.townSquare = townSquare;
    this.currentCard = null;

    on('state:night-deck-advanced', () => this._renderCurrentCard());
    this._render();
  }

  _render() {
    this.container.innerHTML = '';
    this.container.className = 'night-deck';
    this._renderCurrentCard();
  }

  _renderCurrentCard() {
    // Clean up old card
    if (this.currentCard) {
      this.currentCard.destroy();
      this.currentCard = null;
    }

    const deck = state.night.wakeDeck;
    const idx = state.night.currentCardIndex;

    this.container.innerHTML = '';

    // Header with progress and nav
    const nightLabel = state.dayCount === 0 ? 'First Night' : `Night ${state.dayCount + 1}`;
    const header = document.createElement('div');
    header.className = 'night-deck-header';
    header.innerHTML = `
      <div>
        <div class="phase-label" style="position:static;display:inline-block">🌙 ${nightLabel}</div>
      </div>
      <div class="night-deck-progress">${idx < deck.length ? `${idx + 1} / ${deck.length}` : 'Done'}</div>
      <div class="night-deck-nav">
        ${idx < deck.length
          ? `<button class="btn btn-sm btn-ghost" id="nd-skip">Skip →</button>`
          : ''
        }
      </div>
    `;
    this.container.appendChild(header);

    header.querySelector('#nd-skip')?.addEventListener('click', () => advanceNightCard());

    if (idx >= deck.length) {
      // Dawn panel
      this._renderDawnPanel();
      return;
    }

    const entry = deck[idx];

    const isIntroCard = entry.characterId === '__minion_info__' || entry.characterId === '__demon_info__';
    if (isIntroCard) {
      this.currentCard = new IntroInfoCard(entry, () => advanceNightCard());
    } else {
      this.currentCard = new NightCard(entry, this.townSquare, () => advanceNightCard());
    }

    this.container.appendChild(this.currentCard.el);
  }

  _renderDawnPanel() {
    // Summarise who will die
    const pendingKillId = state.night.pendingKill;
    const victim = pendingKillId ? findPlayerById(pendingKillId) : null;
    const deathSummary = victim && victim.isAlive && !victim.isSafe
      ? `<div class="night-deaths-summary">💀 ${victim.name} (${victim.character.name}) will die at dawn.</div>`
      : `<div class="night-deaths-summary" style="color:var(--color-safe)">✨ No deaths tonight.</div>`;

    const dawn = document.createElement('div');
    dawn.className = 'dawn-panel';
    dawn.innerHTML = `
      <div style="font-size:48px">🌅</div>
      <h2>All roles have woken.</h2>
      <p>Announce the dawn, reveal deaths to the village, then continue to the Day phase.</p>
      ${deathSummary}
      <button class="btn btn-primary" id="nd-dawn">Begin Day ${state.dayCount + 1}</button>
    `;
    dawn.querySelector('#nd-dawn').addEventListener('click', () => advanceToDawn());
    this.container.appendChild(dawn);
  }

  destroy() {
    if (this.currentCard) {
      this.currentCard.destroy();
      this.currentCard = null;
    }
  }
}
