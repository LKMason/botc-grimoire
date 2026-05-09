import { on } from '../state/EventBus.js';

/**
 * Creates and manages a single player node element.
 */
export class PlayerNode {
  constructor(player, onTap) {
    this.player = player;
    this.onTap = onTap;
    this.el = this._createElement();
    this._render();

    on('state:player-updated', ({ playerId }) => {
      if (playerId === this.player.id) this._render();
    });
  }

  _createElement() {
    const el = document.createElement('div');
    el.className = 'player-node';
    el.setAttribute('data-player-id', this.player.id);
    el.addEventListener('click', () => this.onTap(this.player.id));
    return el;
  }

  updatePlayer(player) {
    this.player = player;
    this._render();
  }

  setMode(mode, extra = {}) {
    // mode: 'normal' | 'targetable' | 'selected-target' | 'not-targetable' | 'nominator' | 'nominee' | 'not-nominatable'
    this.el.classList.remove(
      'player-node--targetable',
      'player-node--selected-target',
      'player-node--not-targetable',
      'player-node--nominator',
      'player-node--nominee',
      'player-node--not-nominatable',
    );
    if (mode !== 'normal') {
      this.el.classList.add(`player-node--${mode}`);
    }
  }

  addPop() {
    this.el.classList.remove('pop');
    void this.el.offsetWidth;
    this.el.classList.add('pop');
    setTimeout(() => this.el.classList.remove('pop'), 300);
  }

  _render() {
    const p = this.player;

    // Display character: Drunk shows fake role
    const displayChar = (p.character.id === 'drunk' && p.drunkFakeRole)
      ? p.drunkFakeRole
      : p.character;

    const classes = ['player-node'];
    if (p.isTraveller) classes.push('player-node--traveller');
    if (!p.isAlive) classes.push('player-node--dead');
    else if (p.alignment === 'Good') classes.push('player-node--good');
    else if (p.alignment === 'Evil') classes.push('player-node--evil');
    if (p.isPoisoned) classes.push('player-node--poisoned');
    if (p.isSafe && p.isAlive) classes.push('player-node--safe');

    // Preserve mode classes
    const modeClasses = [
      'player-node--targetable',
      'player-node--selected-target',
      'player-node--not-targetable',
      'player-node--nominator',
      'player-node--nominee',
      'player-node--not-nominatable',
    ].filter((c) => this.el.classList.contains(c));

    this.el.className = [...classes, ...modeClasses].join(' ');

    const nameColor = p.alignment === 'Evil' ? 'var(--color-evil)' : 'var(--color-good)';
    this.el.innerHTML = `
      <span class="node-emoji">${displayChar.emoji}</span>
      <span class="node-name" style="color:${nameColor}">${p.name}</span>
      <span class="node-role">${displayChar.name}</span>
      <div class="node-status">${this._statusIcons()}</div>
    `;
  }

  _statusIcons() {
    const icons = [];
    if (this.player.isTraveller) icons.push('<span class="node-status-icon" title="Traveller">🧳</span>');
    if (!this.player.isAlive) {
      icons.push('<span class="node-status-icon" title="Dead">💀</span>');
      if (!this.player.hasGhostVote) {
        icons.push('<span class="node-status-icon" title="Ghost vote spent">🚫</span>');
      }
    }
    if (this.player.isPoisoned) icons.push('<span class="node-status-icon" title="Poisoned">☠️</span>');
    if (this.player.isDrunk) icons.push('<span class="node-status-icon" title="Drunk">🍺</span>');
    if (this.player.isSafe) icons.push('<span class="node-status-icon" title="Protected">🛡️</span>');
    return icons.join('');
  }
}
