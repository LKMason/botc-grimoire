// All 19 Trouble Brewing character definitions

export const CHARACTERS = {
  // ─── TOWNSFOLK ───────────────────────────────────────────────────────────────
  washerwoman: {
    id: 'washerwoman',
    name: 'Washerwoman',
    type: 'TOWNSFOLK',
    alignment: 'Good',
    emoji: '🧺',
    wakeNights: 'FIRST_ONLY',
    wakeTier: 4,
    nightAction: {
      logicKey: 'WASHERWOMAN',
      instructionTemplate: 'Wake the Washerwoman. Show them a Townsfolk character token, and point to two players — one of whom is that character.',
      targetCount: 2,
      targetConstraint: 'ANY',
    },
    description: 'You start knowing that 1 of 2 players is a particular Townsfolk.',
  },

  librarian: {
    id: 'librarian',
    name: 'Librarian',
    type: 'TOWNSFOLK',
    alignment: 'Good',
    emoji: '📚',
    wakeNights: 'FIRST_ONLY',
    wakeTier: 4,
    nightAction: {
      logicKey: 'LIBRARIAN',
      instructionTemplate: 'Wake the Librarian. Show them an Outsider character token, and point to two players — one of whom is that character. (If no Outsiders are in play, show "0".)',
      targetCount: 2,
      targetConstraint: 'ANY',
    },
    description: 'You start knowing that 1 of 2 players is a particular Outsider (or that no Outsiders are in play).',
  },

  investigator: {
    id: 'investigator',
    name: 'Investigator',
    type: 'TOWNSFOLK',
    alignment: 'Good',
    emoji: '🔍',
    wakeNights: 'FIRST_ONLY',
    wakeTier: 4,
    nightAction: {
      logicKey: 'INVESTIGATOR',
      instructionTemplate: 'Wake the Investigator. Show them a Minion character token, and point to two players — one of whom is that character.',
      targetCount: 2,
      targetConstraint: 'ANY',
    },
    description: 'You start knowing that 1 of 2 players is a particular Minion.',
  },

  chef: {
    id: 'chef',
    name: 'Chef',
    type: 'TOWNSFOLK',
    alignment: 'Good',
    emoji: '👨‍🍳',
    wakeNights: 'FIRST_ONLY',
    wakeTier: 4,
    nightAction: {
      logicKey: 'CHEF',
      instructionTemplate: 'Wake the Chef. Show them the number of pairs of adjacent Evil players.',
      targetCount: 0,
      targetConstraint: null,
    },
    description: 'You start knowing how many pairs of evil players are sitting next to each other.',
  },

  empath: {
    id: 'empath',
    name: 'Empath',
    type: 'TOWNSFOLK',
    alignment: 'Good',
    emoji: '🫶',
    wakeNights: 'ALL',
    wakeTier: 4,
    nightAction: {
      logicKey: 'EMPATH',
      instructionTemplate: 'Wake the Empath. Show them how many of their two nearest living neighbours are Evil.',
      targetCount: 0,
      targetConstraint: null,
    },
    description: 'Each night, you learn how many of your 2 nearest living neighbours are evil.',
  },

  fortuneteller: {
    id: 'fortuneteller',
    name: 'Fortune Teller',
    type: 'TOWNSFOLK',
    alignment: 'Good',
    emoji: '🔮',
    wakeNights: 'ALL',
    wakeTier: 4,
    nightAction: {
      logicKey: 'FORTUNE_TELLER',
      instructionTemplate: 'Wake the Fortune Teller. They point to 2 players. Give a "yes" if one is the Demon (or the Red Herring). Give a "no" otherwise.',
      targetCount: 2,
      targetConstraint: 'ANY',
    },
    description: 'Each night, choose 2 players: you learn if either is the Demon. There is a good player that registers as the Demon to you.',
  },

  undertaker: {
    id: 'undertaker',
    name: 'Undertaker',
    type: 'TOWNSFOLK',
    alignment: 'Good',
    emoji: '⚰️',
    wakeNights: 'ALL_EXCEPT_FIRST',
    wakeTier: 4,
    nightAction: {
      logicKey: 'UNDERTAKER',
      instructionTemplate: 'Wake the Undertaker. Show them the character token of the player who was executed today.',
      targetCount: 0,
      targetConstraint: null,
    },
    description: 'Each night* you learn which character was executed today (if any).',
  },

  monk: {
    id: 'monk',
    name: 'Monk',
    type: 'TOWNSFOLK',
    alignment: 'Good',
    emoji: '🧘',
    wakeNights: 'ALL_EXCEPT_FIRST',
    wakeTier: 1,
    nightAction: {
      logicKey: 'MONK',
      instructionTemplate: 'Wake the Monk. They point to a player (not themselves). That player is safe from the Demon tonight.',
      targetCount: 1,
      targetConstraint: 'NOT_SELF',
    },
    description: 'Each night*, choose a player (not yourself): they are safe from the Demon tonight.',
  },

  ravenkeeper: {
    id: 'ravenkeeper',
    name: 'Ravenkeeper',
    type: 'TOWNSFOLK',
    alignment: 'Good',
    emoji: '🐦‍⬛',
    wakeNights: 'CONDITIONAL',
    wakeTier: 3,
    nightAction: {
      logicKey: 'RAVENKEEPER',
      instructionTemplate: 'Wake the Ravenkeeper (they died tonight). They point to any player. Show that player\'s character token.',
      targetCount: 1,
      targetConstraint: 'ANY',
    },
    description: 'If you die at night, you are woken to choose a player: you learn their character.',
  },

  virgin: {
    id: 'virgin',
    name: 'Virgin',
    type: 'TOWNSFOLK',
    alignment: 'Good',
    emoji: '👼',
    wakeNights: 'NEVER',
    wakeTier: null,
    nightAction: null,
    dayAbility: 'VIRGIN',
    description: 'The 1st time you are nominated, if the nominator is a Townsfolk, they are executed immediately.',
  },

  slayer: {
    id: 'slayer',
    name: 'Slayer',
    type: 'TOWNSFOLK',
    alignment: 'Good',
    emoji: '🗡️',
    wakeNights: 'NEVER',
    wakeTier: null,
    nightAction: null,
    dayAbility: 'SLAYER',
    description: 'Once per game, during the day, publicly choose a player: if they are the Demon, they die.',
  },

  soldier: {
    id: 'soldier',
    name: 'Soldier',
    type: 'TOWNSFOLK',
    alignment: 'Good',
    emoji: '🛡️',
    wakeNights: 'NEVER',
    wakeTier: null,
    nightAction: null,
    description: 'You are safe from the Demon.',
  },

  mayor: {
    id: 'mayor',
    name: 'Mayor',
    type: 'TOWNSFOLK',
    alignment: 'Good',
    emoji: '🏛️',
    wakeNights: 'NEVER',
    wakeTier: null,
    nightAction: null,
    description: 'If only 3 players live and no execution occurs, your team wins. If you would die at night, another player might die instead.',
  },

  // ─── OUTSIDERS ────────────────────────────────────────────────────────────────
  butler: {
    id: 'butler',
    name: 'Butler',
    type: 'OUTSIDER',
    alignment: 'Good',
    emoji: '☕️',
    wakeNights: 'ALL',
    wakeTier: 5,
    nightAction: {
      logicKey: 'BUTLER',
      instructionTemplate: 'Wake the Butler. They point to a player (not themselves). That player is their master. The Butler may only vote tomorrow if their master votes first.',
      targetCount: 1,
      targetConstraint: 'NOT_SELF',
    },
    description: 'Each night, choose a player (not yourself): tomorrow, you may only vote if they are voting too.',
  },

  drunk: {
    id: 'drunk',
    name: 'Drunk',
    type: 'OUTSIDER',
    alignment: 'Good',
    emoji: '🍺',
    wakeNights: 'NEVER',
    wakeTier: null,
    nightAction: null,
    description: 'You do not know you are the Drunk. You think you are a Townsfolk, but your ability malfunctions.',
  },

  recluse: {
    id: 'recluse',
    name: 'Recluse',
    type: 'OUTSIDER',
    alignment: 'Good',
    emoji: '🏚️',
    wakeNights: 'NEVER',
    wakeTier: null,
    nightAction: null,
    description: 'You might register as evil and as a Minion or Demon, even if dead.',
  },

  saint: {
    id: 'saint',
    name: 'Saint',
    type: 'OUTSIDER',
    alignment: 'Good',
    emoji: '😇',
    wakeNights: 'NEVER',
    wakeTier: null,
    nightAction: null,
    description: 'If you die by execution, your team loses.',
  },

  // ─── MINIONS ──────────────────────────────────────────────────────────────────
  poisoner: {
    id: 'poisoner',
    name: 'Poisoner',
    type: 'MINION',
    alignment: 'Evil',
    emoji: '☠️',
    wakeNights: 'ALL',
    wakeTier: 1,
    nightAction: {
      logicKey: 'POISONER',
      instructionTemplate: 'Wake the Poisoner. They point to a player. That player is poisoned until dusk tomorrow.',
      targetCount: 1,
      targetConstraint: 'ANY',
    },
    description: 'Each night, choose a player: they are poisoned tonight and tomorrow day.',
  },

  spy: {
    id: 'spy',
    name: 'Spy',
    type: 'MINION',
    alignment: 'Evil',
    emoji: '🕵️',
    wakeNights: 'ALL',
    wakeTier: 4,
    nightAction: {
      logicKey: 'SPY',
      instructionTemplate: 'Wake the Spy. Show them the Grimoire (all player roles and statuses).',
      targetCount: 0,
      targetConstraint: null,
    },
    description: 'Each night, you see the Grimoire. You might register as good and as a Townsfolk or Outsider, even if dead.',
  },

  scarletwoman: {
    id: 'scarletwoman',
    name: 'Scarlet Woman',
    type: 'MINION',
    alignment: 'Evil',
    emoji: '🌹',
    wakeNights: 'NEVER',
    wakeTier: null,
    nightAction: null,
    description: 'If the Demon dies and 5 or more players are alive, you become the Demon.',
  },

  baron: {
    id: 'baron',
    name: 'Baron',
    type: 'MINION',
    alignment: 'Evil',
    emoji: '🎩',
    wakeNights: 'NEVER',
    wakeTier: null,
    nightAction: null,
    description: 'There are extra Outsiders in play. (−2 Townsfolk, +2 Outsiders)',
  },

  // ─── TRAVELLERS ───────────────────────────────────────────────────────────────
  scapegoat: {
    id: 'scapegoat',
    name: 'Scapegoat',
    type: 'TRAVELLER',
    alignment: null,
    emoji: '🐐',
    wakeNights: 'NEVER',
    wakeTier: null,
    nightAction: null,
    description: 'If a player of your alignment is executed, you might be executed instead.',
  },

  gunslinger: {
    id: 'gunslinger',
    name: 'Gunslinger',
    type: 'TRAVELLER',
    alignment: null,
    emoji: '🤠',
    wakeNights: 'NEVER',
    wakeTier: null,
    nightAction: null,
    description: 'Each day, after the 1st vote has been tallied, you may choose a player that voted: they die.',
  },

  beggar: {
    id: 'beggar',
    name: 'Beggar',
    type: 'TRAVELLER',
    alignment: null,
    emoji: '🎭',
    wakeNights: 'NEVER',
    wakeTier: null,
    nightAction: null,
    description: 'You must use a vote token to vote. If a dead player gives you theirs, you learn their alignment. You are sober and healthy.',
  },

  bureaucrat: {
    id: 'bureaucrat',
    name: 'Bureaucrat',
    type: 'TRAVELLER',
    alignment: null,
    emoji: '📋',
    wakeNights: 'ALL_EXCEPT_FIRST',
    wakeTier: 1,
    nightAction: {
      logicKey: 'BUREAUCRAT',
      instructionTemplate: "Wake the Bureaucrat. They point to a player (not themselves). That player's vote counts as 3 votes tomorrow.",
      targetCount: 1,
      targetConstraint: 'NOT_SELF',
    },
    description: 'Each night, choose a player (not yourself): their vote counts as 3 votes tomorrow.',
  },

  thief: {
    id: 'thief',
    name: 'Thief',
    type: 'TRAVELLER',
    alignment: null,
    emoji: '🥷',
    wakeNights: 'ALL_EXCEPT_FIRST',
    wakeTier: 1,
    nightAction: {
      logicKey: 'THIEF',
      instructionTemplate: "Wake the Thief. They point to a player (not themselves). That player's vote counts as −1 vote tomorrow.",
      targetCount: 1,
      targetConstraint: 'NOT_SELF',
    },
    description: 'Each night, choose a player (not yourself): their vote counts negatively tomorrow.',
  },

  // ─── DEMONS ───────────────────────────────────────────────────────────────────
  imp: {
    id: 'imp',
    name: 'Imp',
    type: 'DEMON',
    alignment: 'Evil',
    emoji: '😈',
    wakeNights: 'ALL_EXCEPT_FIRST',
    wakeTier: 2,
    nightAction: {
      logicKey: 'IMP',
      instructionTemplate: 'Wake the Imp. They point to a player. That player dies. (If the Imp points to themselves, a Minion becomes the Imp.)',
      targetCount: 1,
      targetConstraint: 'ANY',
    },
    description: 'Each night*, choose a player: they die. If you kill yourself this way, a living Minion becomes the Imp.',
  },
};

export const CHARACTER_LIST = Object.values(CHARACTERS);

export const getCharacter = (id) => CHARACTERS[id] ?? null;

export const getCharactersByType = (type) =>
  CHARACTER_LIST.filter((c) => c.type === type);

export const TOWNSFOLK = getCharactersByType('TOWNSFOLK');
export const OUTSIDERS = getCharactersByType('OUTSIDER');
export const MINIONS = getCharactersByType('MINION');
export const DEMONS = getCharactersByType('DEMON');
export const TRAVELLERS = getCharactersByType('TRAVELLER');
