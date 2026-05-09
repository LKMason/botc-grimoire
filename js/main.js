import { state, hydrateState } from './state/GameState.js';
import { loadState } from './state/persistence.js';
import { mountApp } from './ui/AppShell.js';

function init() {
  const saved = loadState();

  if (saved && saved.phase !== 'SETUP') {
    const resume = confirm('A saved game was found. Continue where you left off?');
    if (resume) {
      hydrateState(saved);
    }
    // else: start fresh with default state
  }

  mountApp();
}

// Wait for DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
