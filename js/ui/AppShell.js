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
  const viewStateBtn = document.getElementById('view-state-btn');
  const stateDialog = document.getElementById('state-view-dialog');
  const stateBody = document.getElementById('state-view-body');
  const stateClose = stateDialog.querySelector('.state-view-close');

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

  // View State
  viewStateBtn.addEventListener('click', () => {
    stateBody.textContent = _buildStateText();
    stateDialog.showModal();
  });
  stateClose.addEventListener('click', () => stateDialog.close());
  stateDialog.addEventListener('click', (e) => {
    if (e.target === stateDialog) stateDialog.close();
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

function _buildStateText() {
  const phaseLabel = state.phase === 'NIGHT'
    ? `Night ${state.dayCount + 1}`
    : state.phase === 'DAY'
      ? `Day ${state.dayCount}`
      : 'Setup';

  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const lines = [];

  lines.push(`BLOOD ON THE CLOCKTOWER — GAME STATE`);
  lines.push(`Phase: ${phaseLabel}   Generated: ${now}`);
  lines.push('');

  // ── Players ──────────────────────────────────────────────────────
  const regular = state.players.filter((p) => !p.isTraveller);
  const travellers = state.players.filter((p) => p.isTraveller);

  const COL = { name: 16, role: 18, align: 6, status: 7 };

  function pad(str, len) {
    return String(str ?? '').padEnd(len).slice(0, len);
  }

  function playerLine(p) {
    const name = pad(p.name, COL.name);
    const role = pad(p.character?.name ?? '?', COL.role);
    const align = pad(p.alignment, COL.align);
    const status = p.isAlive ? 'ALIVE  ' : 'DEAD   ';
    const flags = [];
    if (p.isDrunk && p.drunkFakeRole) flags.push(`drunk-as:${p.drunkFakeRole.name}`);
    else if (p.isDrunk) flags.push('drunk');
    if (p.isPoisoned) flags.push('poisoned');
    if (p.isSafe) flags.push('protected');
    if (!p.isAlive && p.hasGhostVote) flags.push('ghost-vote');
    if (!p.isAlive && !p.hasGhostVote) flags.push('ghost-vote-spent');
    if (p.id === state.bureaucratTarget) flags.push('bureaucrat-target(×3)');
    if (p.id === state.thiefTarget) flags.push('thief-target(−1)');
    const extra = flags.length ? `  [${flags.join(', ')}]` : '';
    return `  ${name} ${role} ${align} ${status}${extra}`;
  }

  lines.push(`═══ PLAYERS (${regular.length}) ${'═'.repeat(Math.max(0, 44 - regular.length.toString().length))}`);
  lines.push(`  ${'NAME'.padEnd(COL.name)} ${'ROLE'.padEnd(COL.role)} ${'ALIGN'.padEnd(COL.align)} STATUS`);
  lines.push(`  ${'-'.repeat(COL.name)} ${'-'.repeat(COL.role)} ${'-'.repeat(COL.align)} -------`);
  for (const p of regular) lines.push(playerLine(p));

  if (travellers.length > 0) {
    lines.push('');
    lines.push(`═══ TRAVELLERS (${travellers.length}) ${'═'.repeat(Math.max(0, 42 - travellers.length.toString().length))}`);
    lines.push(`  ${'NAME'.padEnd(COL.name)} ${'ROLE'.padEnd(COL.role)} ${'ALIGN'.padEnd(COL.align)} STATUS`);
    lines.push(`  ${'-'.repeat(COL.name)} ${'-'.repeat(COL.role)} ${'-'.repeat(COL.align)} -------`);
    for (const p of travellers) lines.push(playerLine(p));
  }

  // ── Night state ───────────────────────────────────────────────────
  if (state.phase === 'NIGHT') {
    lines.push('');
    lines.push(`═══ NIGHT STATE ${'═'.repeat(43)}`);
    const kill = state.night.pendingKill
      ? state.players.find((p) => p.id === state.night.pendingKill)?.name ?? state.night.pendingKill
      : null;
    const poison = state.night.pendingPoison
      ? state.players.find((p) => p.id === state.night.pendingPoison)?.name ?? state.night.pendingPoison
      : null;
    const protect = state.night.pendingProtect
      ? state.players.find((p) => p.id === state.night.pendingProtect)?.name ?? state.night.pendingProtect
      : null;
    if (kill) lines.push(`  Pending kill:       ${kill}`);
    if (poison) lines.push(`  Pending poison:     ${poison}`);
    if (protect) lines.push(`  Pending protection: ${protect}`);
    if (!kill && !poison && !protect) lines.push('  No pending night actions.');

    const deck = state.night.wakeDeck;
    const idx = state.night.currentCardIndex;
    if (deck.length > 0) {
      lines.push('');
      lines.push(`  Night deck progress: card ${idx} of ${deck.length}`);
      if (idx < deck.length) {
        const next = deck[idx];
        const nextName = state.players.find((p) => p.id === next.playerId)?.name ?? '?';
        lines.push(`  Next to wake: ${next.characterId} (${nextName})`);
      } else {
        lines.push(`  Deck complete — all cards resolved.`);
      }
    }
  }

  // ── Day / nominations ─────────────────────────────────────────────
  if (state.phase === 'DAY') {
    const nom = state.nominations;
    lines.push('');
    lines.push(`═══ NOMINATIONS (Day ${state.dayCount}) ${'═'.repeat(Math.max(0, 36 - state.dayCount.toString().length))}`);
    lines.push(`  Nominations open: ${nom.open ? 'YES' : 'NO'}`);

    if (nom.pendingExecution) {
      const execPlayer = state.players.find((p) => p.id === nom.pendingExecution);
      lines.push(`  On the block: ${execPlayer?.name ?? nom.pendingExecution} (${nom.highestVoteCount} votes)`);
    } else if (nom.tiedPlayerIds.length > 0) {
      const names = nom.tiedPlayerIds.map((id) => state.players.find((p) => p.id === id)?.name ?? id);
      lines.push(`  Tied — no execution: ${names.join(' vs ')} (${nom.highestVoteCount} votes each)`);
    } else {
      lines.push(`  No one on the block yet.`);
    }

    if (nom.nominatorsUsed.length > 0) {
      const names = nom.nominatorsUsed.map((id) => state.players.find((p) => p.id === id)?.name ?? id);
      lines.push(`  Nominators used: ${names.join(', ')}`);
    }
    if (nom.nomineesUsed.length > 0) {
      const names = nom.nomineesUsed.map((id) => state.players.find((p) => p.id === id)?.name ?? id);
      lines.push(`  Nominees used: ${names.join(', ')}`);
    }

    const threshold = Math.floor(state.players.filter((p) => p.isAlive).length / 2) + 1;
    lines.push(`  Votes needed to execute: ${threshold}`);
  }

  // ── Counts ────────────────────────────────────────────────────────
  lines.push('');
  lines.push(`═══ COUNTS ${'═'.repeat(47)}`);
  const alive = state.players.filter((p) => p.isAlive);
  const dead = state.players.filter((p) => !p.isAlive);
  lines.push(`  Alive: ${alive.length}   Dead: ${dead.length}   Total: ${state.players.length}`);

  return lines.join('\n');
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
