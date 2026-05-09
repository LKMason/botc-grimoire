import { state, setOverrideMode, undoLastAction } from '../state/GameState.js';
import { on } from '../state/EventBus.js';
import { TownSquare } from './TownSquare.js';
import { SetupPanel } from './SetupPanel.js';
import { NightDeck } from './NightDeck.js';
import { DayPanel } from './DayPanel.js';
import { OverridePanel } from './OverridePanel.js';
import { WinOverlay } from './WinOverlay.js';
import { showToast } from './toast.js';

export { showToast };

let townSquare = null;
let currentPanel = null;
let overridePanel = null;

// ── Mount ──────────────────────────────────────────────────────────────────────

export function mountApp() {
  const leftPanel = document.getElementById('panel-left');
  const rightPanel = document.getElementById('panel-right');
  const overrideToggle = document.getElementById('override-toggle');
  const undoBtn = document.getElementById('undo-btn');
  const layoutBtn = document.getElementById('layout-btn');

  // Town Square
  const tsContainer = document.getElementById('town-square');
  townSquare = new TownSquare(tsContainer);
  townSquare.render();

  // Phase routing
  on('state:phase-changed', ({ phase }) => {
    _mountPhasePanel(phase, rightPanel);
    _updateBodyClass(phase);
  });

  // Win condition
  on('state:win-condition-met', (result) => {
    WinOverlay.show(result);
  });

  // Override mode
  on('state:override-mode-changed', ({ overrideMode }) => {
    if (overrideMode) {
      document.body.classList.add('override-mode');
      if (!overridePanel) {
        overridePanel = new OverridePanel();
        overridePanel.mount();
      }
    } else {
      document.body.classList.remove('override-mode');
      overridePanel?.unmount();
      overridePanel = null;
    }
  });

  document.addEventListener('override:close', () => {
    setOverrideMode(false);
  });

  overrideToggle.addEventListener('click', () => {
    setOverrideMode(!state.overrideMode);
  });

  undoBtn.addEventListener('click', () => undoLastAction());

  on('state:undo-stack-changed', ({ canUndo }) => {
    undoBtn.disabled = !canUndo;
  });

  // Layout mode
  let layoutModeActive = false;
  layoutBtn.addEventListener('click', () => {
    layoutModeActive = !layoutModeActive;
    if (layoutModeActive) {
      document.body.classList.add('layout-mode');
      townSquare.enterLayoutMode();
      layoutBtn.textContent = '✓ Done';
      layoutBtn.title = 'Exit layout editing mode';
    } else {
      document.body.classList.remove('layout-mode');
      townSquare.exitLayoutMode();
      layoutBtn.textContent = '⠿ Modify Layout';
      layoutBtn.title = 'Modify Layout — drag players to rearrange';
    }
  });

  // Initial mount
  _mountPhasePanel(state.phase, rightPanel);
  _updateBodyClass(state.phase);
}

function _mountPhasePanel(phase, rightPanel) {
  // Destroy old panel
  if (currentPanel?.destroy) currentPanel.destroy();
  rightPanel.innerHTML = '';
  rightPanel.classList.add('phase-transition');
  setTimeout(() => rightPanel.classList.remove('phase-transition'), 300);

  switch (phase) {
    case 'SETUP':
      currentPanel = new SetupPanel(rightPanel, townSquare);
      break;
    case 'NIGHT':
      currentPanel = new NightDeck(rightPanel, townSquare);
      break;
    case 'DAY':
      currentPanel = new DayPanel(rightPanel, townSquare);
      break;
  }
}

function _updateBodyClass(phase) {
  document.body.classList.remove('phase--setup', 'phase--night', 'phase--day');
  document.body.classList.add(`phase--${phase.toLowerCase()}`);

  const label = document.getElementById('phase-label');
  if (label) label.textContent = phase;

  const badge = document.getElementById('day-badge');
  if (badge) {
    if (phase === 'NIGHT') badge.textContent = `Night ${state.dayCount + 1}`;
    else if (phase === 'DAY') badge.textContent = `Day ${state.dayCount}`;
    else badge.textContent = 'Setup';
  }
}
