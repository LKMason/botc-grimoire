import {
  state, findPlayerById, getLivingPlayers, countLiving,
  votesNeededToExecute, openNominations, closeNominations,
  setCurrentNomination, castVote, closeVoting, advanceToNight,
  openExile, closeExile, castExileVote, resolveExile,
  gunslingerKill, redirectExecutionToScapegoat,
  transferBeggarvote, persistState,
} from '../state/GameState.js';
import { processNomination, validateVote, resolveDusk } from '../engine/dayEngine.js';
import { resolveSlayer, checkScarletWoman, applyScarletWomanCatch, checkWinConditions } from '../engine/rulesEngine.js';
import { on, emit } from '../state/EventBus.js';
import { showToast } from './toast.js';

export class DayPanel {
  constructor(container, townSquare) {
    this.container = container;
    this.townSquare = townSquare;
    this.subState = 'open';  // 'open' | 'nominating' | 'voting' | 'result' | 'exile-voting'
    this.lastVotingResult = null;
    this.butlerWarning = null;
    this.exileTargetId = null;

    on('state:nomination-updated', () => this._render());
    on('state:players-updated', () => this._render());
    on('state:exile-updated', () => this._render());
    this._nominatorListener = () => this._render();
    document.addEventListener('nomination:nominator-selected', this._nominatorListener);

    this._render();
  }

  _render() {
    this.container.innerHTML = '';
    this.container.className = 'day-panel';

    this.container.appendChild(this._buildStatsBar());

    const body = document.createElement('div');
    body.className = 'day-body';

    if (this.subState === 'exile-voting') {
      body.appendChild(this._buildExileVotingUI());
    } else if (this.subState === 'voting') {
      body.appendChild(this._buildVotingUI());
    } else if (this.subState === 'result') {
      body.appendChild(this._buildResultUI());
    } else {
      body.appendChild(this._buildNominationUI());
    }

    this.container.appendChild(body);
    this.container.appendChild(this._buildFooter());
  }

  _buildStatsBar() {
    const living = countLiving();
    const threshold = votesNeededToExecute();
    const ghostVotes = state.players.filter((p) => !p.isAlive && p.hasGhostVote).length;

    const bar = document.createElement('div');
    bar.className = 'day-stats';
    bar.innerHTML = `
      <div class="stat-cell">
        <span class="stat-label">Alive</span>
        <span class="stat-value ${living <= 3 ? 'stat-danger' : ''}">${living}</span>
      </div>
      <div class="stat-cell">
        <span class="stat-label">To Execute</span>
        <span class="stat-value">${threshold}</span>
      </div>
      <div class="stat-cell">
        <span class="stat-label">Ghost Votes</span>
        <span class="stat-value ${ghostVotes === 0 ? 'stat-danger' : ''}">${ghostVotes}</span>
      </div>
    `;
    return bar;
  }

  _buildNominationUI() {
    const frag = document.createDocumentFragment();
    const nom = state.nominations;

    // On-the-block display
    if (nom.pendingExecution) {
      const onBlock = findPlayerById(nom.pendingExecution);
      const card = document.createElement('div');
      card.className = 'on-block-card';
      card.innerHTML = `
        <div>
          <div class="on-block-label">On the Block</div>
          <div class="on-block-name">${onBlock?.character?.emoji ?? ''} ${onBlock?.name ?? '?'}</div>
        </div>
        <div class="on-block-votes">${nom.highestVoteCount} votes</div>
      `;
      frag.appendChild(card);
    }

    // Tied players
    if (nom.tiedPlayerIds.length > 1 && !nom.pendingExecution) {
      const tieCard = document.createElement('div');
      tieCard.className = 'tied-card';
      const tiedNames = nom.tiedPlayerIds.map((id) => findPlayerById(id)?.name ?? '?').join(' & ');
      tieCard.innerHTML = `
        <div class="tied-label">⚖️ Tied — No Execution</div>
        <div style="font-size:14px;color:var(--color-neutral)">${tiedNames} are tied. Neither will die.</div>
      `;
      frag.appendChild(tieCard);
    }

    // Nomination instruction or current selection
    if (nom.open && nom.currentNominator && nom.currentNominee) {
      const nominator = findPlayerById(nom.currentNominator);
      const nominee = findPlayerById(nom.currentNominee);
      const panel = document.createElement('div');
      panel.className = 'nomination-selection';
      panel.innerHTML = `
        <div class="nomination-instruction">
          <strong>${nominator?.name ?? '?'}</strong> nominates <strong>${nominee?.name ?? '?'}</strong>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-secondary" id="cancel-nom">Cancel</button>
          <button class="btn btn-danger" id="confirm-nom" style="flex:1">Confirm Nomination</button>
        </div>
      `;
      frag.appendChild(panel);

      panel.querySelector('#cancel-nom').addEventListener('click', () => {
        setCurrentNomination(null, null);
        this.townSquare.exitNominationMode();
        this.subState = 'open';
        this._render();
      });

      panel.querySelector('#confirm-nom').addEventListener('click', () => {
        this._confirmNomination(nom.currentNominator, nom.currentNominee);
      });
    } else if (nom.open) {
      const step = document.createElement('div');
      step.className = 'nomination-instruction';
      if (this.townSquare.nominationStep === 1) {
        step.innerHTML = '👆 Tap the <strong>Nominator</strong> in the Town Square';
      } else if (this.townSquare.nominationStep === 2) {
        const nomName = findPlayerById(this.townSquare.nominatorId)?.name ?? '?';
        step.innerHTML = `👆 <strong>${nomName}</strong> is nominating — tap the <strong>Nominee</strong>`;
      }
      frag.appendChild(step);

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn btn-ghost';
      cancelBtn.textContent = 'Cancel Nominations';
      cancelBtn.addEventListener('click', () => {
        closeNominations();
        this.townSquare.exitNominationMode();
        this.subState = 'open';
        this._render();
      });
      frag.appendChild(cancelBtn);
    } else {
      // Nominations not open
      const hint = document.createElement('div');
      hint.className = 'nomination-instruction';
      hint.innerHTML = `<strong>Day ${state.dayCount}</strong> — Open nominations to begin, or proceed to dusk.`;
      frag.appendChild(hint);
    }

    // Scapegoat redirect (show when a pending execution exists and Scapegoat shares alignment)
    const pendingExecId = state.nominations.pendingExecution;
    if (pendingExecId) {
      const execPlayer = findPlayerById(pendingExecId);
      const scapegoat = getLivingPlayers().find(
        (p) => p.character.id === 'scapegoat' && p.alignment === execPlayer?.alignment
      );
      if (scapegoat) {
        const sgCard = document.createElement('div');
        sgCard.className = 'day-actions-section';
        sgCard.innerHTML = `
          <div class="day-actions-label">Scapegoat</div>
          <button class="slayer-btn" id="scapegoat-btn" style="color:var(--color-warning);border-color:rgba(255,209,102,0.3)">
            🐐 ${scapegoat.name} — Execute Scapegoat Instead
          </button>
        `;
        frag.appendChild(sgCard);
        sgCard.querySelector('#scapegoat-btn').addEventListener('click', () => {
          redirectExecutionToScapegoat(scapegoat.id);
          showToast(`Execution redirected to Scapegoat (${scapegoat.name}).`, 'warning');
          this._render();
        });
      }
    }

    // Slayer action
    const slayerPlayer = getLivingPlayers().find(
      (p) => p.character.id === 'slayer' && !p.customState.slayerUsed
    );
    if (slayerPlayer) {
      const section = document.createElement('div');
      section.className = 'day-actions-section';
      section.innerHTML = `
        <div class="day-actions-label">Day Abilities</div>
        <button class="slayer-btn" id="slayer-btn">
          🗡️ ${slayerPlayer.name} — Use Slayer Ability
        </button>
      `;
      frag.appendChild(section);
      section.querySelector('#slayer-btn').addEventListener('click', () => this._triggerSlayer(slayerPlayer));
    }

    // Gunslinger: show after first vote tally if Gunslinger alive and hasn't used ability today
    const gunslingerPlayer = getLivingPlayers().find((p) => p.character.id === 'gunslinger');
    if (gunslingerPlayer && state.nominations.firstVoteTallied && !state.nominations.gunslingerUsed) {
      const gsSection = document.createElement('div');
      gsSection.className = 'day-actions-section';
      gsSection.innerHTML = `
        <div class="day-actions-label">Gunslinger</div>
        <button class="slayer-btn" id="gunslinger-btn" style="color:var(--color-warning);border-color:rgba(255,209,102,0.3)">
          🤠 ${gunslingerPlayer.name} — Shoot a Voter
        </button>
      `;
      frag.appendChild(gsSection);
      gsSection.querySelector('#gunslinger-btn').addEventListener('click', () =>
        this._triggerGunslinger(gunslingerPlayer)
      );
    }

    // Exile section: show if any living Travellers present
    const livingTravellers = getLivingPlayers().filter((p) => p.isTraveller);
    if (livingTravellers.length > 0) {
      const exileSection = document.createElement('div');
      exileSection.className = 'day-actions-section';
      const btns = livingTravellers.map((t) =>
        `<button class="slayer-btn exile-btn" data-exile-target="${t.id}" style="color:#c8a84b;border-color:rgba(200,168,75,0.3)">
           🧳 Exile ${t.name} (${t.character.name})
         </button>`
      ).join('');
      exileSection.innerHTML = `
        <div class="day-actions-label">Exile Traveller</div>
        ${btns}
      `;
      frag.appendChild(exileSection);
      exileSection.querySelectorAll('.exile-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.exileTargetId = btn.dataset.exileTarget;
          openExile(this.exileTargetId);
          this.subState = 'exile-voting';
          this._render();
        });
      });
    }

    // Beggar ghost token transfer
    const beggarPlayer = getLivingPlayers().find((p) => p.character.id === 'beggar');
    const deadWithGhostVote = state.players.filter((p) => !p.isAlive && p.hasGhostVote);
    if (beggarPlayer && deadWithGhostVote.length > 0) {
      const beggarSection = document.createElement('div');
      beggarSection.className = 'day-actions-section';
      const deadBtns = deadWithGhostVote.map((p) =>
        `<button class="slayer-btn" data-transfer-from="${p.id}" style="color:var(--color-neutral);border-color:var(--bg-raised);font-size:12px">
           👻 ${p.name} gives ghost vote to Beggar
         </button>`
      ).join('');
      beggarSection.innerHTML = `
        <div class="day-actions-label">Beggar — Receive Vote Token</div>
        ${deadBtns}
      `;
      frag.appendChild(beggarSection);
      beggarSection.querySelectorAll('[data-transfer-from]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const result = transferBeggarvote(btn.dataset.transferFrom, beggarPlayer.id);
          if (result) {
            showToast(`${findPlayerById(btn.dataset.transferFrom)?.name} is ${result.alignment}. Beggar now has a vote token.`, 'warning');
            this._render();
          }
        });
      });
    }

    return frag;
  }

  _buildVotingUI() {
    const nom = state.nominations;
    const nominator = findPlayerById(nom.currentNominator);
    const nominee = findPlayerById(nom.currentNominee);
    const yesCount = nom.votes.filter((v) => v.votedYes).length;
    const threshold = votesNeededToExecute();
    const pct = Math.min(100, (yesCount / threshold) * 100);

    const frag = document.createDocumentFragment();

    // Voting header
    const header = document.createElement('div');
    header.className = 'voting-header';
    header.innerHTML = `
      <div class="voting-pair">
        <span>${nominator?.name ?? '?'}</span>
        <span class="voting-arrow">→</span>
        <strong>${nominee?.name ?? '?'}</strong>
      </div>
      <div>
        <div class="vote-tally">${yesCount} yes</div>
        <div class="vote-tally-needed">Need ${threshold}</div>
      </div>
    `;
    frag.appendChild(header);

    // Progress bar
    const progress = document.createElement('div');
    progress.className = 'vote-progress';
    progress.innerHTML = `<div class="vote-progress-fill ${yesCount >= threshold ? 'threshold-met' : ''}" style="width:${pct}%"></div>`;
    frag.appendChild(progress);

    // Butler warning
    if (this.butlerWarning) {
      const warn = document.createElement('div');
      warn.className = 'butler-warning';
      warn.innerHTML = `⚠️ ${this.butlerWarning} <button class="btn btn-sm btn-ghost" id="butler-dismiss">Dismiss</button>`;
      frag.appendChild(warn);
      warn.querySelector('#butler-dismiss').addEventListener('click', () => {
        this.butlerWarning = null;
        this._render();
      });
    }

    // Vote list
    const list = document.createElement('div');
    list.className = 'vote-list';

    for (const player of state.players) {
      const existingVote = nom.votes.find((v) => v.playerId === player.id);
      // Beggar needs a vote token; check customState
      const isBeggar = player.character.id === 'beggar';
      const beggarHasToken = isBeggar && !!player.customState?.voteTokenFrom;
      const noGhost = !player.isAlive && !player.hasGhostVote;
      const cantVote = noGhost || (isBeggar && !beggarHasToken);

      const voted = !!existingVote?.votedYes;
      const isBureaucratTarget = player.id === state.bureaucratTarget;
      const isThiefTarget = player.id === state.thiefTarget;
      const modifierBadge = isBureaucratTarget
        ? '<span class="vote-modifier-badge vote-modifier-x3">×3</span>'
        : isThiefTarget
        ? '<span class="vote-modifier-badge vote-modifier-neg">−1</span>'
        : '';

      const row = document.createElement('div');
      row.className = `vote-row ${!player.isAlive ? 'dead' : ''} ${voted ? 'voted-yes' : ''}`;
      row.innerHTML = `
        <span class="vote-row-name">${player.character.emoji} ${player.name}${!player.isAlive ? ' 💀' : ''}${player.isTraveller ? ' 🧳' : ''}</span>
        ${modifierBadge}
        ${!player.isAlive && player.hasGhostVote ? '<span class="vote-ghost-tag">👻 ghost</span>' : ''}
        ${isBeggar && !beggarHasToken
          ? `<span class="vote-no-ghost">Needs token</span>`
          : cantVote
          ? `<span class="vote-no-ghost">No vote</span>`
          : `<button class="vote-btn vote-btn-yes ${voted ? 'active' : ''}" data-pid="${player.id}">
               ${voted ? '✋ Yes' : 'Vote'}
             </button>`
        }
      `;
      list.appendChild(row);
    }

    list.querySelectorAll('[data-pid]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pid = btn.dataset.pid;
        const existingVote = nom.votes.find((v) => v.playerId === pid);
        const votedYes = !existingVote?.votedYes; // toggle
        const validation = validateVote(pid, votedYes);
        if (!validation.ok) { showToast(validation.reason, 'error'); return; }
        if (validation.butlerWarning) { this.butlerWarning = validation.butlerWarning; }
        castVote(pid, votedYes);
      });
    });

    frag.appendChild(list);
    return frag;
  }

  _buildResultUI() {
    const r = this.lastVotingResult;
    const frag = document.createDocumentFragment();

    let cls = 'failed', title = 'Vote Failed';
    if (r?.tied) { cls = 'tied'; title = 'Tied — No Execution'; }
    else if (r?.executed) { cls = 'executed'; title = `${r.executedName} is on the block`; }

    const card = document.createElement('div');
    card.className = 'vote-result';
    card.innerHTML = `
      <div class="vote-result-title ${cls}">${title}</div>
      <div style="font-size:13px;color:var(--color-neutral)">${r?.detail ?? ''}</div>
      <button class="btn btn-secondary" id="back-to-nom">Continue Nominations</button>
    `;
    card.querySelector('#back-to-nom').addEventListener('click', () => {
      this.subState = 'open';
      this.lastVotingResult = null;
      this._render();
      this.townSquare.enterNominationMode((nominatorId, nomineeId) => {
        setCurrentNomination(nominatorId, nomineeId);
        this._render();
      });
    });
    frag.appendChild(card);

    // Also show on-block and tie info from nominations state
    frag.appendChild(this._buildNominationUI());
    return frag;
  }

  _buildFooter() {
    const footer = document.createElement('div');
    footer.className = 'day-footer';
    const nom = state.nominations;

    if (this.subState === 'exile-voting') {
      footer.innerHTML = `
        <button class="btn btn-ghost" id="cancel-exile" style="flex:1">Cancel Exile</button>
        <button class="btn btn-danger" id="resolve-exile">Close Exile Vote</button>
      `;
      footer.querySelector('#cancel-exile').addEventListener('click', () => {
        closeExile();
        this.exileTargetId = null;
        this.subState = 'open';
        this._render();
      });
      footer.querySelector('#resolve-exile').addEventListener('click', () => {
        const result = resolveExile();
        if (result.success) {
          const target = findPlayerById(this.exileTargetId) ?? { name: '?' };
          showToast(`Exile successful! ${target.name} has been exiled. (${result.yesVotes}/${state.players.length})`, 'success');
          const win = checkWinConditions();
          if (win) emit('state:win-condition-met', win);
        } else {
          showToast(`Exile failed — ${result.yesVotes} votes, needed ${result.threshold}.`, 'error');
        }
        this.exileTargetId = null;
        this.subState = 'open';
        this._render();
      });
      return footer;
    }

    if (this.subState === 'voting') {
      footer.innerHTML = `
        <button class="btn btn-secondary btn-full" id="close-voting">Close Voting</button>
      `;
      footer.querySelector('#close-voting').addEventListener('click', () => this._closeVoting());
    } else {
      if (!nom.open && this.subState !== 'voting') {
        footer.innerHTML = `
          <button class="btn btn-secondary" id="open-nom" style="flex:1">Open Nominations</button>
          <button class="btn btn-danger" id="proceed-dusk">🌆 Proceed to Dusk</button>
        `;
        footer.querySelector('#open-nom').addEventListener('click', () => {
          openNominations();
          this.subState = 'nominating';
          this.townSquare.enterNominationMode((nominatorId, nomineeId) => {
            setCurrentNomination(nominatorId, nomineeId);
            this._render();
          });
          this._render();
        });
        footer.querySelector('#proceed-dusk').addEventListener('click', () => this._dusk());
      } else if (nom.open) {
        footer.innerHTML = `
          <button class="btn btn-ghost" id="close-nom" style="flex:1">Close Nominations</button>
          <button class="btn btn-danger" id="dusk-btn">🌆 Dusk</button>
        `;
        footer.querySelector('#close-nom').addEventListener('click', () => {
          closeNominations();
          this.townSquare.exitNominationMode();
          this.subState = 'open';
          this._render();
        });
        footer.querySelector('#dusk-btn').addEventListener('click', () => this._dusk());
      }
    }

    return footer;
  }

  _confirmNomination(nominatorId, nomineeId) {
    const result = processNomination(nominatorId, nomineeId);
    if (!result.ok) { showToast(result.reason, 'error'); return; }

    if (result.virginTrigger) {
      const nominator = findPlayerById(result.virginExecutedId);
      showToast(`Virgin triggered! ${nominator?.name} is immediately executed.`, 'warning');
      // Route through the normal dusk machinery so lastExecutedPlayerId, history,
      // Scarlet Woman, Saint, and win conditions are all handled correctly.
      state.nominations.pendingExecution = result.virginExecutedId;
      closeNominations();
      this.townSquare.exitNominationMode();
      this._dusk();
      return;
    }

    // Proceed to voting
    this.townSquare.exitNominationMode();
    this.subState = 'voting';
    this.butlerWarning = null;
    this._render();
  }

  _closeVoting() {
    const result = closeVoting();
    const threshold = votesNeededToExecute();
    const nom = state.nominations;
    const executedId = nom.pendingExecution;
    const tiedIds = nom.tiedPlayerIds;

    let lastResult;
    if (result.yesVotes >= threshold) {
      if (executedId) {
        const execPlayer = findPlayerById(executedId);
        lastResult = {
          executed: true,
          executedName: execPlayer?.name ?? '?',
          detail: `${result.yesVotes} yes votes (threshold: ${threshold})`,
        };
      } else if (tiedIds.length > 1) {
        lastResult = {
          tied: true,
          detail: `Tied at ${result.yesVotes} votes — no execution.`,
        };
      }
    } else {
      lastResult = {
        failed: true,
        detail: `${result.yesVotes} yes votes — ${threshold} needed. Nomination failed.`,
      };
    }

    this.lastVotingResult = lastResult;
    this.subState = 'result';
    this._render();
  }

  _dusk() {
    closeNominations();
    this.townSquare.exitNominationMode();
    const win = resolveDusk();
    if (!win) {
      // Transition to Night
      advanceToNight();
    }
  }

  _buildExileVotingUI() {
    const target = findPlayerById(this.exileTargetId);
    const exileVotes = state.exile.votes;
    const yesCount = exileVotes.filter((v) => v.votedYes).length;
    const totalPlayers = state.players.length;
    const threshold = Math.ceil(totalPlayers / 2);
    const pct = Math.min(100, (yesCount / threshold) * 100);

    const frag = document.createDocumentFragment();

    const header = document.createElement('div');
    header.className = 'voting-header';
    header.innerHTML = `
      <div class="voting-pair">
        <span>Exile</span>
        <span class="voting-arrow">→</span>
        <strong>${target?.character?.emoji ?? '🧳'} ${target?.name ?? '?'}</strong>
      </div>
      <div>
        <div class="vote-tally">${yesCount} yes</div>
        <div class="vote-tally-needed">Need ${threshold} (50% of all ${totalPlayers})</div>
      </div>
    `;
    frag.appendChild(header);

    const progress = document.createElement('div');
    progress.className = 'vote-progress';
    progress.innerHTML = `<div class="vote-progress-fill ${yesCount >= threshold ? 'threshold-met' : ''}" style="width:${pct}%"></div>`;
    frag.appendChild(progress);

    const note = document.createElement('div');
    note.style.cssText = 'font-size:11px;color:var(--color-muted);padding:4px 0';
    note.textContent = 'Dead players vote without spending ghost vote. Ability modifiers do not apply.';
    frag.appendChild(note);

    const list = document.createElement('div');
    list.className = 'vote-list';

    for (const player of state.players) {
      const existingVote = exileVotes.find((v) => v.playerId === player.id);
      const voted = !!existingVote?.votedYes;
      const row = document.createElement('div');
      row.className = `vote-row ${!player.isAlive ? 'dead' : ''} ${voted ? 'voted-yes' : ''}`;
      row.innerHTML = `
        <span class="vote-row-name">${player.character.emoji} ${player.name}${!player.isAlive ? ' 💀' : ''}</span>
        <button class="vote-btn vote-btn-yes ${voted ? 'active' : ''}" data-exile-pid="${player.id}">
          ${voted ? '✋ Yes' : 'Vote'}
        </button>
      `;
      list.appendChild(row);
    }

    list.querySelectorAll('[data-exile-pid]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pid = btn.dataset.exilePid;
        const existing = exileVotes.find((v) => v.playerId === pid);
        castExileVote(pid, !existing?.votedYes);
      });
    });

    frag.appendChild(list);
    return frag;
  }

  _triggerGunslinger(gunslingerPlayer) {
    // Only voters from last tally are valid targets — show targeting mode for any living player
    // (in practice the ST picks who voted yes, but we allow any living player as a target)
    this.townSquare.enterTargetingMode({
      maxTargets: 1,
      constraint: 'LIVING',
      onTargetsChanged: (targets) => {
        if (targets.length === 1) {
          this.townSquare.exitTargetingMode();
          const targetId = targets[0];
          gunslingerKill(targetId);
          const target = findPlayerById(targetId);
          showToast(`${gunslingerPlayer.name}'s Gunslinger ability — ${target?.name ?? '?'} is shot dead!`, 'warning');
          const win = checkWinConditions();
          if (win) emit('state:win-condition-met', win);
          this._render();
        }
      },
    });
    showToast('Tap the player the Gunslinger shoots.', 'warning');
  }

  _triggerSlayer(slayerPlayer) {
    // Enter targeting mode for Slayer
    this.townSquare.enterTargetingMode({
      maxTargets: 1,
      constraint: 'LIVING',
      onTargetsChanged: (targets) => {
        if (targets.length === 1) {
          this.townSquare.exitTargetingMode();
          const targetId = targets[0];
          const killed = resolveSlayer(slayerPlayer.id, targetId);
          const target = findPlayerById(targetId);
          if (killed) {
            // Check Scarlet Woman before marking the Demon dead
            const sw = checkScarletWoman(targetId);
            if (sw) applyScarletWomanCatch(sw, target);

            target.isAlive = false;
            target.history.push({
              turn: `Day ${state.dayCount}`,
              type: 'DEATH',
              description: `Slain by ${slayerPlayer.name}'s Slayer ability.`,
              isOverride: false,
              timestamp: Date.now(),
            });
            persistState();
            emit('state:players-updated');
            showToast(`${target.name} was the Demon! Slayer kills them.`, 'success');
            if (!sw) {
              const win = checkWinConditions();
              if (win) emit('state:win-condition-met', win);
            }
          } else {
            slayerPlayer.customState.slayerUsed = true;
            showToast(`${target.name} is not the Demon. Slayer ability used.`, 'warning');
          }
          this._render();
        }
      },
    });
    showToast('Tap the Slayer\'s target in the Town Square.', 'warning');
  }

  destroy() {
    this.townSquare.exitNominationMode();
    this.townSquare.exitTargetingMode();
    document.removeEventListener('nomination:nominator-selected', this._nominatorListener);
  }
}
