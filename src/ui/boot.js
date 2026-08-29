// ISOLATED-world entry point.
//
// Sees chrome.* but not `gameui`. Receives snapshots from the MAIN-world
// collector, evaluates them and drives the panel. Only the frame that actually
// hosts the game renders anything: both content scripts run in every frame, and
// the collector's HELLO is what tells us which frame we are in.

import { PAGE_SOURCE, UI_SOURCE, MSG, accepts, post } from '../shared/protocol.js';
import { validateState } from '../page/state.js';
import { resolveLocale, translator } from './i18n.js';
import { Panel } from './panel.js';
import { buildView } from './present.js';

const SETTINGS_KEY = 'wsh.settings';
const DEFAULTS = { mode: 'advice', locale: 'auto', visible: true, layout: {} };

let settings = { ...DEFAULTS };
let panel = null;
let db = null;
let dbHash = null;
let latest = null;

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
  p.render(
    buildView({
      state: latest,
      problems,
      t,
      mode: settings.mode,
      advice: null, // wired up in milestone M2
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
