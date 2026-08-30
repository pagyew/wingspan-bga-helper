// ISOLATED-world entry point.
//
// Sees chrome.* but not `gameui`. Receives snapshots from the MAIN-world
// collector, evaluates them and drives the panel. Only the frame that actually
// hosts the game renders anything: both content scripts run in every frame, and
// the collector's HELLO is what tells us which frame we are in.

import { PAGE_SOURCE, UI_SOURCE, MSG, accepts, post } from '../shared/protocol.js';
import { validateState } from '../page/state.js';
import { createEngine } from '../engine/index.js';
import { fromSnapshot } from '../engine/from-snapshot.js';
import { resolveLocale, translator } from './i18n.js';
import { Panel } from './panel.js';
import { buildView, adviceMoves } from './present.js';

const SETTINGS_KEY = 'wsh.settings';
const DEFAULTS = { mode: 'advice', locale: 'auto', visible: true, layout: {} };

const engine = createEngine();

let settings = { ...DEFAULTS };
let panel = null;
let db = null;
let dbHash = null;
let birdIndex = null; // identifier -> live card record, rebuilt whenever db changes
let latest = null;
let adviceCache = { key: null, moves: [], error: null };

/** Cheap, order-independent hash — same approach as fingerprint() in page/state.js. */
function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

/**
 * Snapshot -> ranked moves, gated by the same rule as invariant #2: an unknown
 * or unstable position never scores as a hint, it becomes a note instead.
 * Computed only when stable; in advice mode, only on the local player's turn.
 */
function computeAdvice(problems) {
  if (!latest || !db || !latest.stable) return { moves: [], error: null };
  if (settings.mode === 'advice' && !latest.myTurn) return { moves: [], error: null };
  if (problems.length) return { moves: [], error: null };

  try {
    const input = fromSnapshot(latest, db);
    const key = hashString(JSON.stringify(input));
    if (adviceCache.key === key) return adviceCache;

    const result = engine.suggest(input);
    const locale = resolveLocale(settings.locale);
    const t = translator(locale);
    const birdName = (cardKey) => {
      const card = birdIndex && birdIndex[cardKey];
      if (!card) return cardKey;
      return locale === 'ru' ? card.nameLocal || card.name : card.name;
    };
    const moves = adviceMoves(result, t, birdName);
    adviceCache = { key, moves, error: null };
  } catch (error) {
    adviceCache = { key: null, moves: [], error: String((error && error.message) || error) };
  }
  return adviceCache;
}

const readSettings = async () => {
  try {
    const stored = await chrome.storage.local.get(SETTINGS_KEY);
    return { ...DEFAULTS, ...(stored[SETTINGS_KEY] || {}) };
  } catch {
    return { ...DEFAULTS };
  }
};

const writeSettings = async () => {
  try {
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  } catch {
    /* storage can be unavailable in a locked-down profile — the panel still works */
  }
};

function ensurePanel() {
  if (panel) return panel;
  const t = translator(resolveLocale(settings.locale));
  panel = new Panel({
    t,
    position: settings.layout,
    onRefresh: () => post(UI_SOURCE, MSG.PULL),
    onToggleMode: () => {
      settings.mode = settings.mode === 'advice' ? 'watch' : 'advice';
      writeSettings();
      redraw();
    },
    onSnapshot: async () => {
      if (!latest) return;
      const dump = JSON.stringify({ state: latest, dbHash }, null, 2);
      try {
        await navigator.clipboard.writeText(dump);
      } catch {
        console.log('[wingspan-helper] snapshot:\n' + dump);
      }
    }
  });
  panel.onLayoutChange = (patch) => {
    settings.layout = { ...settings.layout, ...patch };
    writeSettings();
  };
  panel.mount();
  panel.setVisible(settings.visible);
  return panel;
}

function redraw(extra = {}) {
  const p = ensurePanel();
  const t = translator(resolveLocale(settings.locale));
  const problems = latest ? validateState(latest, db) : [];
  const { moves, error } = computeAdvice(problems);
  const allProblems = error ? [...problems, `${t('evalError')}: ${error}`] : problems;
  p.render(
    buildView({
      state: latest,
      problems: allProblems,
      t,
      mode: settings.mode,
      advice: moves,
      ...extra
    })
  );
}

window.addEventListener('message', (event) => {
  if (!accepts(event, PAGE_SOURCE)) return;
  const data = event.data;

  if (data.type === MSG.HELLO) {
    ensurePanel();
    redraw();
    return;
  }

  if (data.type === MSG.STATE) {
    if (data.db) {
      db = data.db;
      dbHash = data.dbHash;
      birdIndex = Object.fromEntries(Object.values(db.birds).map((b) => [b.identifier, b]));
    } else if (data.dbHash && data.dbHash !== dbHash) {
      post(UI_SOURCE, MSG.NEED_DB);
      return;
    }
    latest = data.state;
    if (settings.mode === 'watch' || latest.myTurn) redraw();
    return;
  }

  if (data.type === MSG.ERROR) {
    const t = translator(resolveLocale(settings.locale));
    ensurePanel().render({
      headline: t('title'),
      status: '',
      mode: settings.mode,
      moves: [],
      detail: '',
      notes: [{ text: `${t('readError')} (${data.where}: ${data.message})`, kind: 'error' }]
    });
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === 'toggle-panel' && panel) {
    settings.visible = !panel.visible;
    panel.setVisible(settings.visible);
    writeSettings();
  }
});

readSettings().then((loaded) => {
  settings = loaded;
});
