let dialog = null;

function ensureDialog() {
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.className = 'history-dialog';
  document.body.appendChild(dialog);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  return dialog;
}

export const HistoryPopover = {
  show(player, anchorEl) {
    const d = ensureDialog();

    const entries = player.history.length
      ? player.history.map((e) => `
          <div class="history-entry ${e.isOverride ? 'override' : ''}">
            <span class="history-entry-turn">${e.turn}</span>
            <span class="history-entry-desc">${e.description}</span>
            ${e.isOverride ? '<span class="history-entry-override-badge">Override</span>' : ''}
          </div>
        `).join('')
      : '<div class="history-empty">No history yet.</div>';

    d.innerHTML = `
      <div class="history-dialog-header">
        <span class="history-dialog-title">${player.character.emoji} ${player.name}</span>
        <button class="history-dialog-close" id="hist-close" aria-label="Close">✕</button>
      </div>
      <div class="history-list">${entries}</div>
    `;

    d.querySelector('#hist-close').addEventListener('click', () => d.close());

    // Position near anchor if provided
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      const leftSpace = rect.left;
      d.style.margin = '0';
      d.style.position = 'fixed';
      if (leftSpace > 350) {
        d.style.top = `${Math.min(rect.top, window.innerHeight - 300)}px`;
        d.style.left = `${rect.left - 330}px`;
      } else {
        d.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - 300)}px`;
        d.style.left = `${Math.max(8, rect.left - 80)}px`;
      }
    } else {
      d.style.margin = 'auto';
      d.style.position = '';
      d.style.top = '';
      d.style.left = '';
    }

    if (!d.open) d.showModal();
  },
};
