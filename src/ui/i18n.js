// Two languages, and the choice is not the browser's to make.
//
// The panel names actions the way BGA's own buttons name them, so that a hint
// maps onto what is on screen. That means the panel must follow the *page*
// language, not the browser locale — which is also why this is a hand-rolled
// dictionary instead of chrome.i18n (which cannot be switched at runtime and
// is unavailable in the MAIN world anyway).

const STRINGS = {
  en: {
    title: 'Wingspan Helper',
    round: 'Round',
    turn: 'Turn',
    waiting: 'Waiting for the game to load…',
    notYourTurn: 'Opponent is thinking',
    unstable: 'Animation in progress — numbers may lag',
    readError: 'Could not read the position. The BGA client may have changed.',
    blueGoalBoard: 'Blue goal board is not supported yet',
    cubesLeft: 'cubes left',
    modeAdvice: 'Advice',
    modeWatch: 'Watch',
    refresh: 'Refresh',
    collapse: 'Collapse',
    snapshot: 'Copy snapshot',
    snapshotCopied: 'Snapshot copied to clipboard',
    recordStart: 'Start recording',
    recordStop: 'Stop recording',
    recordingSaved: 'Recording saved and downloaded',
    recordingAutoSaved: 'Game finished — recording saved and downloaded',
    recordingResumed: 'Resumed an interrupted recording',
    goals: 'Goals',
    bonus: 'Bonus',
    opponent: 'Opponent',
    noAdviceYet: 'No advice available for this position.',
    evalError: 'Could not evaluate this position',
    // Action names, spelled the way BGA spells them.
    actionPlayBird: 'Play a bird',
    actionGainFood: 'Gain food',
    actionLayEggs: 'Lay eggs',
    actionDrawCards: 'Draw bird cards',
    forest: 'Forest',
    grassland: 'Grassland',
    wetland: 'Wetland',
    unitFood: 'food',
    unitEgg: 'eggs',
    unitCard: 'cards',
    eggsNeeded: 'Eggs needed',
    noEggsNeeded: 'No eggs needed',
    tradeApplied: 'with trade'
  },
  ru: {
    title: 'Wingspan Helper',
    round: 'Раунд',
    turn: 'Ход',
    waiting: 'Жду загрузки партии…',
    notYourTurn: 'Ход соперника',
    unstable: 'Идёт анимация — числа могут отставать',
    readError: 'Не смог прочитать позицию. Возможно, обновился клиент BGA.',
    blueGoalBoard: 'Синее поле целей пока не поддерживается',
    cubesLeft: 'кубиков осталось',
    modeAdvice: 'Совет',
    modeWatch: 'Наблюдение',
    refresh: 'Обновить',
    collapse: 'Свернуть',
    snapshot: 'Снять снимок',
    snapshotCopied: 'Снимок скопирован в буфер',
    recordStart: 'Начать запись игры',
    recordStop: 'Остановить запись',
    recordingSaved: 'Запись сохранена и скачана',
    recordingAutoSaved: 'Игра завершена — запись сохранена и скачана',
    recordingResumed: 'Продолжена прерванная запись',
    goals: 'Цели',
    bonus: 'Бонус',
    opponent: 'Соперник',
    noAdviceYet: 'Для этой позиции совета нет.',
    evalError: 'Не удалось оценить позицию',
    actionPlayBird: 'Сыграть птицу',
    actionGainFood: 'Взять еду',
    actionLayEggs: 'Положить яйца',
    actionDrawCards: 'Взять карты птиц',
    forest: 'Лес',
    grassland: 'Степь',
    wetland: 'Болото',
    unitFood: 'корма',
    unitEgg: 'яиц',
    unitCard: 'карт',
    eggsNeeded: 'Нужно яиц',
    noEggsNeeded: 'Яйца не нужны',
    tradeApplied: 'с обменом'
  }
};

export const SUPPORTED = Object.keys(STRINGS);

/** `auto` follows the BGA interface language; anything else is an explicit override. */
export function resolveLocale(preference = 'auto') {
  if (preference !== 'auto' && STRINGS[preference]) return preference;
  const pageLang = (document.documentElement.lang || '').slice(0, 2).toLowerCase();
  if (STRINGS[pageLang]) return pageLang;
  const navLang = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return STRINGS[navLang] ? navLang : 'en';
}

export function translator(locale) {
  const dict = STRINGS[locale] || STRINGS.en;
  return (key) => dict[key] ?? STRINGS.en[key] ?? key;
}
