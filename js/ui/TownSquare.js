import { state } from '../state/GameState.js';
import { on } from '../state/EventBus.js';
import { getCharacter } from '../data/characters.js';
import { PlayerNode } from './PlayerNode.js';
import { HistoryPopover } from './HistoryPopover.js';

const NODE_SIZE = 100;

export class TownSquare {
  constructor(container) {
    this.container = container;
    this.nodes = [];    // PlayerNode instances
    this.mode = 'normal'; // 'normal' | 'targeting' | 'nomination'

    // Targeting state
    this.targetConstraint = 'ANY';
    this.excludedIds = [];
    this.maxTargets = 0;
    this.selectedTargets = [];
    this.onTargetsChanged = null;

    // Nomination state
    this.nominationStep = 0; // 0=none, 1=awaiting nominator, 2=awaiting nominee
    this.nominatorId = null;
    this.onNominationComplete = null;

    // Layout mode state
    this._layoutMode = false;
    this._layoutPositions = this._loadLayoutPositions();

    on('state:players-updated', () => this.render());
    on('state:player-updated', ({ playerId }) => {
      const node = this.nodes.find((n) => n.player.id === playerId);
      if (node) {
        const updated = state.players.find((p) => p.id === playerId);
        if (updated) node.updatePlayer(updated);
      }
    });

    window.addEventListener('resize', () => this._positionNodes());
  }

  _getPlayersToRender() {
    if (state.players.length) return state.players;
    // During setup, build preview players from setup data so the ST can tap them
    const names = state.setup.playerNames;
    if (!names.length) return [];
    return names.map((name, i) => {
      const id = `player-${i}`;
      const charId = state.setup.assignments[id];
      const character = charId ? getCharacter(charId) : { id: 'unknown', name: '?', emoji: '❓', type: 'TOWNSFOLK', alignment: 'Good' };
      return {
        id, name, character,
        alignment: character.alignment,
        isAlive: true, hasGhostVote: true,
        isPoisoned: false, isDrunk: false, isSafe: false,
        drunkFakeRole: null, customState: {}, history: [],
      };
    });
  }

  render() {
    this.container.innerHTML = '';
    this.nodes = [];

    const players = this._getPlayersToRender();

    if (!players.length) {
      this.container.innerHTML = `
        <div class="town-square-empty">
          <span class="empty-icon">🏰</span>
          <span>Enter players to begin</span>
        </div>
      `;
      return;
    }

    for (const player of players) {
      const node = new PlayerNode(player, (id) => this._handleNodeTap(id));
      this.container.appendChild(node.el);
      this.nodes.push(node);
    }

    this._positionNodes();
    if (this._layoutMode) this._attachDragListeners();
  }

  _positionNodes() {
    const n = this.nodes.length;
    if (!n) return;

    const w = this.container.offsetWidth;
    const h = this.container.offsetHeight;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(cx, cy) - NODE_SIZE / 2 - 24;

    this.nodes.forEach((node, i) => {
      const custom = this._layoutPositions[node.player.id];
      if (custom) {
        node.el.style.left = `${custom.xPct * w - NODE_SIZE / 2}px`;
        node.el.style.top = `${custom.yPct * h - NODE_SIZE / 2}px`;
      } else {
        const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
        const x = cx + radius * Math.cos(angle) - NODE_SIZE / 2;
        const y = cy + radius * Math.sin(angle) - NODE_SIZE / 2;
        node.el.style.left = `${x}px`;
        node.el.style.top = `${y}px`;
      }
    });
  }

  // ── Layout Mode ──────────────────────────────────────────────────────────────

  enterLayoutMode() {
    this._layoutMode = true;
    this._attachDragListeners();
  }

  exitLayoutMode() {
    this._layoutMode = false;
    this._detachDragListeners();
  }

  resetLayout() {
    this._layoutPositions = {};
    this._saveLayoutPositions();
    this._positionNodes();
  }

  _loadLayoutPositions() {
    try {
      const raw = localStorage.getItem('botc-layout-positions');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }

  _saveLayoutPositions() {
    localStorage.setItem('botc-layout-positions', JSON.stringify(this._layoutPositions));
  }

  _attachDragListeners() {
    for (const node of this.nodes) {
      this._makeDraggable(node);
    }
  }

  _detachDragListeners() {
    for (const node of this.nodes) {
      if (node._dragCleanup) {
        node._dragCleanup();
        node._dragCleanup = null;
      }
    }
  }

  _makeDraggable(node) {
    let startX, startY, startLeft, startTop, moved;

    const onPointerDown = (e) => {
      if (!this._layoutMode) return;
      e.preventDefault();
      e.stopPropagation();

      startX = e.clientX;
      startY = e.clientY;
      startLeft = parseFloat(node.el.style.left) || 0;
      startTop = parseFloat(node.el.style.top) || 0;
      moved = false;

      node.el.classList.add('player-node--dragging');
      node.el.setPointerCapture(e.pointerId);

      node.el.addEventListener('pointermove', onPointerMove);
      node.el.addEventListener('pointerup', onPointerUp);
      node.el.addEventListener('pointercancel', onPointerCancel);
    };

    const onPointerMove = (e) => {
      e.preventDefault();
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;

      node.el.style.left = `${startLeft + dx}px`;
      node.el.style.top = `${startTop + dy}px`;
    };

    const endDrag = (save) => {
      node.el.classList.remove('player-node--dragging');
      node.el.removeEventListener('pointermove', onPointerMove);
      node.el.removeEventListener('pointerup', onPointerUp);
      node.el.removeEventListener('pointercancel', onPointerCancel);

      if (save && moved) {
        const w = this.container.offsetWidth;
        const h = this.container.offsetHeight;
        const left = parseFloat(node.el.style.left) || 0;
        const top = parseFloat(node.el.style.top) || 0;
        this._layoutPositions[node.player.id] = {
          xPct: (left + NODE_SIZE / 2) / w,
          yPct: (top + NODE_SIZE / 2) / h,
        };
        this._saveLayoutPositions();
      }
    };

    const onPointerUp = () => endDrag(true);
    const onPointerCancel = () => endDrag(false);

    node.el.addEventListener('pointerdown', onPointerDown);
    node._dragCleanup = () => {
      node.el.removeEventListener('pointerdown', onPointerDown);
      node.el.removeEventListener('pointermove', onPointerMove);
      node.el.removeEventListener('pointerup', onPointerUp);
      node.el.removeEventListener('pointercancel', onPointerCancel);
    };
  }

  _handleNodeTap(playerId) {
    if (this._layoutMode) return;
    if (this.mode === 'targeting') {
      this._handleTargetTap(playerId);
    } else if (this.mode === 'nomination') {
      this._handleNominationTap(playerId);
    } else if (state.overrideMode) {
      // Override mode: open override panel
      document.dispatchEvent(new CustomEvent('override:open-player', { detail: { playerId } }));
    } else {
      // Normal mode: open history popover
      const player = state.players.find((p) => p.id === playerId);
      if (player) HistoryPopover.show(player, this.nodes.find((n) => n.player.id === playerId)?.el);
    }
  }

  // ── Targeting Mode ──────────────────────────────────────────────────────────

  enterTargetingMode({ maxTargets, constraint, excludedIds, onTargetsChanged }) {
    this.mode = 'targeting';
    this.maxTargets = maxTargets;
    this.targetConstraint = constraint ?? 'ANY';
    this.excludedIds = excludedIds ?? [];
    this.selectedTargets = [];
    this.onTargetsChanged = onTargetsChanged;
    this._updateTargetingClasses();
  }

  exitTargetingMode() {
    this.mode = 'normal';
    this.selectedTargets = [];
    this.nodes.forEach((n) => n.setMode('normal'));
  }

  _handleTargetTap(playerId) {
    const already = this.selectedTargets.indexOf(playerId);
    if (already !== -1) {
      // Deselect
      this.selectedTargets.splice(already, 1);
    } else {
      if (!this._isTargetable(playerId)) return;
      if (this.selectedTargets.length >= this.maxTargets) {
        // Replace last selected if already full
        if (this.maxTargets === 1) {
          this.selectedTargets = [playerId];
        } else {
          return;
        }
      } else {
        this.selectedTargets.push(playerId);
      }
    }
    this._updateTargetingClasses();
    if (this.onTargetsChanged) this.onTargetsChanged([...this.selectedTargets]);
  }

  _isTargetable(playerId) {
    if (this.excludedIds.includes(playerId)) return false;
    const player = this._getPlayersToRender().find((p) => p.id === playerId);
    if (!player) return false;
    switch (this.targetConstraint) {
      case 'LIVING':         return player.isAlive;
      case 'NOT_SELF':       return player.isAlive;
      case 'LIVING_MINIONS': return player.isAlive && player.character.type === 'MINION';
      default:               return true;
    }
  }

  _updateTargetingClasses() {
    for (const node of this.nodes) {
      const id = node.player.id;
      if (this.selectedTargets.includes(id)) {
        node.setMode('selected-target');
      } else if (this._isTargetable(id)) {
        node.setMode('targetable');
      } else {
        node.setMode('not-targetable');
      }
    }
  }

  // ── Nomination Mode ─────────────────────────────────────────────────────────

  enterNominationMode(onComplete) {
    this.mode = 'nomination';
    this.nominationStep = 1; // awaiting nominator
    this.nominatorId = null;
    this.onNominationComplete = onComplete;
    this._updateNominationClasses();
  }

  exitNominationMode() {
    this.mode = 'normal';
    this.nominationStep = 0;
    this.nominatorId = null;
    this.nodes.forEach((n) => n.setMode('normal'));
  }

  _handleNominationTap(playerId) {
    const player = state.players.find((p) => p.id === playerId);
    if (!player) return;

    if (this.nominationStep === 1) {
      // Select nominator: must be alive and not already nominated today
      if (!player.isAlive) return;
      if (state.nominations.nominatorsUsed.includes(playerId)) return;
      this.nominatorId = playerId;
      this.nominationStep = 2;
      this._updateNominationClasses();
      document.dispatchEvent(new CustomEvent('nomination:nominator-selected', { detail: { nominatorId: playerId } }));
    } else if (this.nominationStep === 2) {
      // Select nominee: must not have been nominated today, and not the nominator
      if (state.nominations.nomineesUsed.includes(playerId)) return;
      if (playerId === this.nominatorId) return;
      const nominatorId = this.nominatorId; // save before exitNominationMode clears it
      const nomineeId = playerId;
      this.exitNominationMode();
      if (this.onNominationComplete) this.onNominationComplete(nominatorId, nomineeId);
    }
  }

  _updateNominationClasses() {
    for (const node of this.nodes) {
      const id = node.player.id;
      if (this.nominationStep === 1) {
        // Awaiting nominator: alive, hasn't nominated
        if (node.player.isAlive && !state.nominations.nominatorsUsed.includes(id)) {
          node.setMode('nominator');
        } else {
          node.setMode('not-nominatable');
        }
      } else if (this.nominationStep === 2) {
        if (id === this.nominatorId) {
          node.setMode('nominator'); // keep highlighted
        } else if (!state.nominations.nomineesUsed.includes(id) && id !== this.nominatorId) {
          node.setMode('nominee');
        } else {
          node.setMode('not-nominatable');
        }
      }
    }
  }
}
