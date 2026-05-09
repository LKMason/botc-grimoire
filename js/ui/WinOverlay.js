import { state } from '../state/GameState.js';
import { clearState } from '../state/persistence.js';

let dialog = null;

function ensureDialog() {
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.className = 'win-dialog';
  document.body.appendChild(dialog);
  return dialog;
}

export const WinOverlay = {
  show({ winner, reason }) {
    const d = ensureDialog();
    d.className = `win-dialog ${winner === 'Good' ? 'good-win' : 'evil-win'}`;

    const icon = winner === 'Good' ? '🔔' : '😈';
    const title = winner === 'Good' ? 'Good Wins!' : 'Evil Wins!';

    // Build reveal chips for all players
    const chips = state.players.map((p) => {
      const char = (p.character.id === 'drunk' && p.drunkFakeRole) ? p.drunkFakeRole : p.character;
      const alignColor = p.alignment === 'Good' ? '#4a9eff' : '#e05252';
      return `
        <div class="win-reveal-chip">
          <span>${char.emoji}</span>
          <strong>${p.name}</strong>
          <span style="color:${alignColor};font-size:11px">${char.name}</span>
          ${!p.isAlive ? '<span>💀</span>' : ''}
        </div>
      `;
    }).join('');

    d.innerHTML = `
      <div class="win-icon">${icon}</div>
      <div class="win-title">${title}</div>
      <div class="win-reason">${reason}</div>
      <div class="win-reveal">${chips}</div>
      <div style="display:flex;gap:16px">
        <button class="btn btn-secondary" id="win-close-btn">Continue Viewing</button>
        <button class="btn btn-danger" id="win-new-game-btn">New Game</button>
      </div>
    `;

    d.querySelector('#win-close-btn').addEventListener('click', () => d.close());
    d.querySelector('#win-new-game-btn').addEventListener('click', () => {
      clearState();
      window.location.reload();
    });

    if (!d.open) d.showModal();
  },
};
