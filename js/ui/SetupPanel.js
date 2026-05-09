import {
  state,
  setupSetPlayerNames,
  setupSetRolePool,
  setupSetAssignment,
  setupSetDrunkFakeRole,
  setupSetRedHerring,
  setupSetStep,
  setupAddTraveller,
  setupRemoveTraveller,
  finalizeSetup,
} from '../state/GameState.js';
import { getComposition, isValidPlayerCount } from '../data/compositions.js';
import { CHARACTER_LIST, TOWNSFOLK, OUTSIDERS, MINIONS, DEMONS, TRAVELLERS, getCharacter } from '../data/characters.js';

export class SetupPanel {
  constructor(container, townSquare) {
    this.container = container;
    this.townSquare = townSquare;

    // Local setup state (mirrors GameState.setup but kept in sync)
    this.playerCount = 9;
    this.playerNames = Array(9).fill('');
    this.selectedRoles = [];       // array of character ids
    this.assignments = {};         // playerId → characterId
    this.drunkFakeRole = null;
    this.redHerring = null;
    this.pendingRoleToAssign = null; // role chip selected, waiting for player tap
    this.redHerringSelectMode = false;
    // Traveller setup state
    this.travellerName = '';
    this.travellerCharId = null;
    this.travellerAlignment = 'Good';

    this._render();
  }

  _render() {
    this.container.innerHTML = '';
    this.container.className = 'setup-panel';

    const step = state.setup.step;
    const stepsNeeded = this._stepsNeeded();

    // Progress bar
    const progress = document.createElement('div');
    progress.className = 'setup-progress';
    for (let i = 1; i <= stepsNeeded; i++) {
      const dot = document.createElement('div');
      dot.className = `setup-progress-step ${i < step ? 'done' : i === step ? 'active' : ''}`;
      progress.appendChild(dot);
    }
    this.container.appendChild(progress);

    const body = document.createElement('div');
    body.className = 'setup-body';

    switch (step) {
      case 1: this._buildStep1(body); break;
      case 2: this._buildStep2(body); break;
      case 3: this._buildStep3(body); break;
      case 4: this._buildStep4(body); break;
      case 5: this._buildStep5(body); break;
      case 6: this._buildStep6(body); break;
    }

    this.container.appendChild(body);
    this.container.appendChild(this._buildFooter(step, stepsNeeded));
  }

  _stepsNeeded() {
    return 6; // Names(1), Roles(2), Drunk(3)?, FT(4)?, Review(5), Travellers(6)
  }

  // ── Step 1: Player count + names ────────────────────────────────────────────

  _buildStep1(body) {
    body.innerHTML = `
      <div class="setup-title">Players</div>
      <div class="setup-subtitle">Enter the number of players and their names in seat order (clockwise).</div>
      <div class="player-count-selector">
        <label for="pc-input">Players</label>
        <input id="pc-input" class="player-count-input" type="number" min="5" max="15" value="${this.playerCount}">
      </div>
      <div class="player-name-list" id="name-list"></div>
    `;

    const countInput = body.querySelector('#pc-input');
    countInput.addEventListener('change', () => {
      const val = parseInt(countInput.value);
      if (isValidPlayerCount(val)) {
        this.playerCount = val;
        this.playerNames = Array(val).fill('').map((_, i) => this.playerNames[i] ?? '');
        this._rebuildNameList(body.querySelector('#name-list'));
      }
    });

    this._rebuildNameList(body.querySelector('#name-list'));
  }

  _rebuildNameList(container) {
    container.innerHTML = '';
    for (let i = 0; i < this.playerCount; i++) {
      const row = document.createElement('div');
      row.className = 'player-name-row';
      row.innerHTML = `
        <div class="seat-number">${i + 1}</div>
        <input class="player-name-input" placeholder="Player ${i + 1}" value="${this.playerNames[i] ?? ''}" data-idx="${i}" type="text">
      `;
      container.appendChild(row);
    }
    container.querySelectorAll('.player-name-input').forEach((inp) => {
      inp.addEventListener('input', () => {
        this.playerNames[parseInt(inp.dataset.idx)] = inp.value;
      });
    });
  }

  // ── Step 2: Role assignment ──────────────────────────────────────────────────

  _buildStep2(body) {
    body.classList.add('step-assignments');
    const hasBaronInPool = this.selectedRoles.includes('baron');
    const comp = getComposition(this.playerCount, hasBaronInPool);
    const assigned = Object.values(this.assignments).filter(Boolean).length;

    body.innerHTML = `
      <div class="setup-title">Role Assignment</div>
      <div class="composition-summary">
        <div class="comp-item"><span class="comp-count comp-townsfolk">${comp.townsfolk}</span><span class="comp-label">Townsfolk</span></div>
        <div class="comp-item"><span class="comp-count comp-outsider">${comp.outsiders}</span><span class="comp-label">Outsiders</span></div>
        <div class="comp-item"><span class="comp-count comp-minion">${comp.minions}</span><span class="comp-label">Minions</span></div>
        <div class="comp-item"><span class="comp-count comp-demon">${comp.demons}</span><span class="comp-label">Demon</span></div>
      </div>
      <div style="font-size:12px;color:var(--color-muted)">Assigned: ${assigned} / ${this.playerCount}</div>
      <div class="role-assignment-layout">
        <div class="role-pool-panel">
          <div class="role-pool-label">Available Roles</div>
          <div class="role-grid" id="role-grid"></div>
        </div>
        <div class="player-assignment-panel">
          <div class="assignment-label">Players</div>
          <div class="assignment-list" id="assign-list"></div>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:4px">
        <button class="btn btn-sm btn-secondary btn-full" id="auto-assign">🎲 Auto-Assign</button>
      </div>
    `;

    this._rebuildRoleGrid(body.querySelector('#role-grid'), comp);
    this._rebuildAssignList(body.querySelector('#assign-list'));

    body.querySelector('#auto-assign').addEventListener('click', () => this._autoAssign(comp, body));
  }

  _rebuildRoleGrid(container, comp) {
    container.innerHTML = '';
    const groups = [
      { chars: TOWNSFOLK, limit: comp.townsfolk, type: 'townsfolk', typeKey: 'TOWNSFOLK' },
      { chars: OUTSIDERS, limit: comp.outsiders, type: 'outsider',  typeKey: 'OUTSIDER' },
      { chars: MINIONS,   limit: comp.minions,   type: 'minion',    typeKey: 'MINION' },
      { chars: DEMONS,    limit: comp.demons,     type: 'demon',     typeKey: 'DEMON' },
    ];

    for (const { chars, limit, type, typeKey } of groups) {
      if (limit <= 0 && typeKey !== 'DEMON') continue;
      const assignedCount = Object.values(this.assignments).filter((id) => {
        const c = getCharacter(id);
        return c?.type === typeKey;
      }).length;

      for (const char of chars) {
        const isAssigned = Object.values(this.assignments).includes(char.id);
        const isPending = this.pendingRoleToAssign === char.id;
        const chip = document.createElement('div');
        chip.className = `role-chip ${isAssigned ? 'assigned' : ''} ${isPending ? 'selected' : ''}`;
        chip.innerHTML = `
          <span class="role-chip-type-dot dot-${type}"></span>
          <span>${char.emoji}</span>
          <span>${char.name}</span>
        `;
        if (!isAssigned) {
          chip.addEventListener('click', () => {
            this.pendingRoleToAssign = this.pendingRoleToAssign === char.id ? null : char.id;
            this._render();
          });
        }
        container.appendChild(chip);
      }
    }
  }

  _rebuildAssignList(container) {
    container.innerHTML = '';
    for (let i = 0; i < this.playerCount; i++) {
      const playerId = `player-${i}`;
      const assignedCharId = this.assignments[playerId];
      const assignedChar = assignedCharId ? getCharacter(assignedCharId) : null;
      const canAssign = !!this.pendingRoleToAssign && !assignedCharId;

      const row = document.createElement('div');
      row.className = `assignment-row ${canAssign ? 'assignable' : assignedCharId ? 'has-role' : ''}`;
      row.innerHTML = `
        <span class="assignment-player-name">${this.playerNames[i] || `Player ${i + 1}`}</span>
        <span class="assignment-role-display ${assignedChar ? 'assigned' : ''}">
          ${assignedChar ? `${assignedChar.emoji} ${assignedChar.name}` : '—'}
        </span>
        ${assignedChar ? `<button class="btn btn-sm btn-ghost" data-clear="${playerId}">✕</button>` : ''}
      `;

      if (canAssign) {
        row.addEventListener('click', () => {
          if (!this.pendingRoleToAssign) return;
          this.assignments[playerId] = this.pendingRoleToAssign;

          // If Baron assigned, re-check composition
          if (this.pendingRoleToAssign === 'baron') {
            this.selectedRoles.push('baron');
          }

          this.pendingRoleToAssign = null;
          this._render();
        });
      }

      row.querySelector('[data-clear]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const pid = e.currentTarget.dataset.clear;
        const clearedCharId = this.assignments[pid];
        delete this.assignments[pid];
        if (clearedCharId === 'baron') {
          this.selectedRoles = this.selectedRoles.filter((id) => id !== 'baron');
        }
        this._render();
      });

      container.appendChild(row);
    }
  }

  _autoAssign(comp, body) {
    this.assignments = {};
    const shuffled = (arr) => [...arr].sort(() => Math.random() - 0.5);

    // Pick Minions and Demons first so we know if Baron was chosen before
    // deciding how many Townsfolk / Outsiders to include.
    const minions = shuffled(MINIONS).slice(0, comp.minions).map((c) => c.id);
    const demons  = shuffled(DEMONS).slice(0, comp.demons).map((c) => c.id);

    const hasBaronChosen = minions.includes('baron');
    const effectiveComp = hasBaronChosen ? getComposition(this.playerCount, true) : comp;

    const pool = [
      ...shuffled(TOWNSFOLK).slice(0, effectiveComp.townsfolk).map((c) => c.id),
      ...shuffled(OUTSIDERS).slice(0, effectiveComp.outsiders).map((c) => c.id),
      ...minions,
      ...demons,
    ];

    const shuffledPool = shuffled(pool);
    for (let i = 0; i < this.playerCount; i++) {
      this.assignments[`player-${i}`] = shuffledPool[i];
    }

    this.selectedRoles = Object.values(this.assignments);
    this._render();
  }

  // ── Step 3: Drunk fake role ──────────────────────────────────────────────────

  _buildStep3(body) {
    const drunkPlayerId = Object.entries(this.assignments).find(([, charId]) => charId === 'drunk')?.[0];
    const drunkPlayerName = drunkPlayerId
      ? this.playerNames[parseInt(drunkPlayerId.replace('player-', ''))]
      : '?';

    // Available fake roles: Townsfolk NOT already assigned to a real player
    const assignedTownsfolk = Object.values(this.assignments).filter((id) => {
      const c = getCharacter(id);
      return c?.type === 'TOWNSFOLK' && id !== 'drunk';
    });

    const availableFakes = TOWNSFOLK.filter((c) => !assignedTownsfolk.includes(c.id));

    body.innerHTML = `
      <div class="setup-title">Drunk Setup</div>
      <div class="setup-subtitle">
        <strong>${drunkPlayerName}</strong> is the Drunk. Choose which Townsfolk role they think they are.
        This must be a role <em>not</em> in the game.
      </div>
      <div class="drunk-fake-role-picker role-grid" id="fake-role-grid"></div>
    `;

    const grid = body.querySelector('#fake-role-grid');
    for (const char of availableFakes) {
      const chip = document.createElement('div');
      chip.className = `role-chip ${this.drunkFakeRole === char.id ? 'selected' : ''}`;
      chip.innerHTML = `<span>${char.emoji}</span><span>${char.name}</span>`;
      chip.addEventListener('click', () => {
        this.drunkFakeRole = char.id;
        grid.querySelectorAll('.role-chip').forEach((c) => c.classList.remove('selected'));
        chip.classList.add('selected');
      });
      grid.appendChild(chip);
    }
  }

  // ── Step 4: Fortune Teller Red Herring ──────────────────────────────────────

  _buildStep4(body) {
    const ftPlayerId = Object.entries(this.assignments).find(([, charId]) => charId === 'fortuneteller')?.[0];
    const ftPlayerName = ftPlayerId
      ? this.playerNames[parseInt(ftPlayerId.replace('player-', ''))]
      : '?';

    const selected = this.redHerring;
    const selectedName = selected ? this.playerNames[parseInt(selected.replace('player-', ''))] : null;

    body.innerHTML = `
      <div class="setup-title">Fortune Teller — Red Herring</div>
      <div class="red-herring-instruction">
        The Fortune Teller has a Red Herring: one Good player who registers as the Demon to them.
        Tap a player in the Town Square to designate the Red Herring.
        <br><br>
        <strong>${ftPlayerName}</strong> is the Fortune Teller and cannot be the Red Herring.
        ${selectedName ? `<br><br>Selected: <strong>${selectedName}</strong>` : ''}
      </div>
    `;

    this.redHerringSelectMode = true;
    this.townSquare.enterTargetingMode({
      maxTargets: 1,
      constraint: 'ANY',
      onTargetsChanged: (targets) => {
        if (targets.length === 1) {
          const tid = targets[0];
          // Red Herring must be a Good player (not FT themselves, not Evil)
          const tChar = getCharacter(this.assignments[tid]);
          if (!tChar || tChar.alignment !== 'Good' || tid === ftPlayerId) {
            this.townSquare.exitTargetingMode();
            return;
          }
          this.redHerring = tid;
          this.townSquare.exitTargetingMode();
          this._render();
        }
      },
    });
  }

  // ── Step 5: Review ───────────────────────────────────────────────────────────

  _buildStep5(body) {
    const rows = Array.from({ length: this.playerCount }, (_, i) => {
      const charId = this.assignments[`player-${i}`];
      const char = charId ? getCharacter(charId) : null;
      return `
        <div class="review-row">
          <span class="review-seat">${i + 1}</span>
          <span class="review-name">${this.playerNames[i] || `Player ${i + 1}`}</span>
          <span class="review-emoji">${char?.emoji ?? '?'}</span>
          <span class="review-role">${char?.name ?? 'Unassigned'}</span>
        </div>
      `;
    }).join('');

    body.innerHTML = `
      <div class="setup-title">Review</div>
      <div class="review-list">${rows}</div>
    `;
  }

  // ── Step 6: Travellers ───────────────────────────────────────────────────────

  _buildStep6(body) {
    const travellers = state.setup.travellers ?? [];

    // Pre-select first traveller character if none chosen yet
    if (!this.travellerCharId && TRAVELLERS.length > 0) {
      this.travellerCharId = TRAVELLERS[0].id;
    }

    const listHtml = travellers.length === 0
      ? '<div style="color:var(--color-muted);font-size:13px;text-align:center;padding:8px 0">No Travellers added yet.</div>'
      : travellers.map((t, i) => {
          const char = getCharacter(t.characterId);
          const alignColor = t.alignment === 'Evil' ? 'var(--color-evil)' : 'var(--color-good)';
          return `
            <div class="review-row" style="justify-content:space-between">
              <span class="review-emoji">${char?.emoji ?? '?'}</span>
              <span class="review-name">${t.name}</span>
              <span class="review-role" style="color:#c8a84b">${char?.name ?? '?'}</span>
              <span style="font-size:11px;font-weight:700;color:${alignColor}">${t.alignment}</span>
              <button class="btn btn-sm btn-ghost" data-remove="${i}">✕</button>
            </div>
          `;
        }).join('');

    const charTokensHtml = TRAVELLERS.map((c) => `
      <div class="valid-token selectable ${this.travellerCharId === c.id ? 'selected' : ''}" data-char-id="${c.id}" title="${c.description}">
        <span>${c.emoji}</span>
        <span>${c.name}</span>
      </div>
    `).join('');

    body.innerHTML = `
      <div class="setup-title">Travellers <span style="font-size:12px;font-weight:400;color:var(--color-muted)">(optional)</span></div>
      <div class="setup-subtitle">
        Add Travellers for players joining a large game. Their character is public, but alignment is secret (only you see it).
      </div>
      <div id="traveller-list">${listHtml}</div>
      ${travellers.length < 5 ? `
        <div class="traveller-add-form">
          <input id="t-name" class="player-name-input" placeholder="Player name" value="${this.travellerName}" type="text" autocomplete="off">
          <div class="result-label" style="margin-top:4px">Character</div>
          <div class="valid-tokens" id="t-char-grid">${charTokensHtml}</div>
          <div class="result-label" style="margin-top:8px">Alignment</div>
          <div style="display:flex;gap:8px">
            <button class="valid-token selectable ${this.travellerAlignment === 'Good' ? 'selected' : ''}" id="align-good" style="flex:1;justify-content:center">
              Good
            </button>
            <button class="valid-token selectable ${this.travellerAlignment === 'Evil' ? 'selected' : ''}" id="align-evil" style="flex:1;justify-content:center;color:var(--color-evil)">
              Evil
            </button>
          </div>
          <button class="btn btn-secondary btn-full" id="add-traveller" style="margin-top:8px">+ Add Traveller</button>
        </div>
      ` : '<div style="color:var(--color-muted);font-size:12px;text-align:center;padding:var(--gap-md) 0">Maximum 5 Travellers reached.</div>'}
    `;

    body.querySelector('#t-name')?.addEventListener('input', (e) => { this.travellerName = e.target.value; });

    body.querySelectorAll('[data-char-id]').forEach((chip) => {
      chip.addEventListener('click', () => {
        this.travellerCharId = chip.dataset.charId;
        body.querySelectorAll('[data-char-id]').forEach((c) => c.classList.remove('selected'));
        chip.classList.add('selected');
      });
    });

    body.querySelector('#align-good')?.addEventListener('click', () => {
      this.travellerAlignment = 'Good';
      body.querySelector('#align-good').classList.add('selected');
      body.querySelector('#align-evil').classList.remove('selected');
    });
    body.querySelector('#align-evil')?.addEventListener('click', () => {
      this.travellerAlignment = 'Evil';
      body.querySelector('#align-evil').classList.add('selected');
      body.querySelector('#align-good').classList.remove('selected');
    });

    body.querySelector('#add-traveller')?.addEventListener('click', () => {
      const name = (body.querySelector('#t-name')?.value ?? '').trim();
      if (!name) { alert('Please enter a player name.'); return; }
      if (!this.travellerCharId) { alert('Please select a Traveller character.'); return; }
      setupAddTraveller(name, this.travellerCharId, this.travellerAlignment);
      this.travellerName = '';
      this._render();
    });

    body.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setupRemoveTraveller(parseInt(btn.dataset.remove));
        this._render();
      });
    });
  }

  // ── Footer navigation ────────────────────────────────────────────────────────

  _buildFooter(step, stepsNeeded) {
    const footer = document.createElement('div');
    footer.className = 'setup-footer';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'btn btn-ghost';
    prevBtn.textContent = '← Back';
    prevBtn.disabled = step === 1;
    prevBtn.addEventListener('click', () => {
      this.townSquare.exitTargetingMode();
      setupSetStep(step - 1);
      this._render();
    });

    const nextBtn = document.createElement('button');
    nextBtn.style.flex = '1';

    if (step === stepsNeeded) {
      nextBtn.className = 'btn btn-primary';
      nextBtn.textContent = '🌙 Begin Night 1';
      nextBtn.addEventListener('click', () => this._finalize());
    } else {
      nextBtn.className = 'btn btn-primary';
      nextBtn.textContent = 'Next →';
      nextBtn.addEventListener('click', () => this._nextStep(step));
    }

    footer.appendChild(prevBtn);
    footer.appendChild(nextBtn);
    return footer;
  }

  _nextStep(currentStep) {
    if (!this._validateStep(currentStep)) return;
    this.townSquare.exitTargetingMode();

    // Determine next real step
    let next = currentStep + 1;
    if (next === 3 && !Object.values(this.assignments).includes('drunk')) next = 4;
    if (next === 4 && !Object.values(this.assignments).includes('fortuneteller')) next = 5;
    // Step 5 (Review) always leads to step 6 (Travellers)

    setupSetStep(next);
    this._render();
  }

  _validateStep(step) {
    if (step === 1) {
      for (let i = 0; i < this.playerCount; i++) {
        if (!this.playerNames[i]?.trim()) this.playerNames[i] = `Player ${i + 1}`;
      }
      setupSetPlayerNames(this.playerNames.slice(0, this.playerCount));
    }
    if (step === 2) {
      const all = Array.from({ length: this.playerCount }, (_, i) => this.assignments[`player-${i}`]);
      if (all.some((c) => !c)) { alert('Please assign a role to every player.'); return false; }
      setupSetRolePool(Object.values(this.assignments));
      Object.entries(this.assignments).forEach(([pid, cid]) => setupSetAssignment(pid, cid));
    }
    if (step === 3) {
      if (!this.drunkFakeRole) { alert('Please select a fake role for the Drunk.'); return false; }
      setupSetDrunkFakeRole(this.drunkFakeRole);
    }
    if (step === 4) {
      if (!this.redHerring) { alert('Please select the Red Herring player.'); return false; }
      setupSetRedHerring(this.redHerring);
    }
    return true;
  }

  _finalize() {
    // Persist names/assignments one more time to be safe
    setupSetPlayerNames(this.playerNames.slice(0, this.playerCount));
    Object.entries(this.assignments).forEach(([pid, cid]) => setupSetAssignment(pid, cid));
    if (this.drunkFakeRole) setupSetDrunkFakeRole(this.drunkFakeRole);
    if (this.redHerring) setupSetRedHerring(this.redHerring);

    this.townSquare.exitTargetingMode();
    finalizeSetup();
  }
}
