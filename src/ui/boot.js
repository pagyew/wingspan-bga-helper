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
import {
  extractTableId, createRecording, appendState, appendError,
  finish, isFinished, countStates, fileName
} from './recorder.js';

const SETTINGS_KEY = 'wsh.settings';
const RECORDING_KEY = 'wsh.recording';
const DEFAULTS = { mode: 'advice', locale: 'auto', visible: true, layout: {} };

const engine = createEngine();

let settings = { ...DEFAULTS };
let panel = null;
let db = null;
let dbHash = null;
let birdIndex = null; // identifier -> live card record, rebuilt whenever db changes
let latest = null;
let adviceCache = { key: null, moves: [], error: null };
let recording = null; // set while a "record the whole game" session is active
let resumedNotice = null; // set once, shown on the first HELLO after a reload

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

const readRecording = async () => {
  try {
    const stored = await chrome.storage.local.get(RECORDING_KEY);
    return stored[RECORDING_KEY] || null;
  } catch {
    return null;
  }
};

// Written after every entry so a reload mid-game (a BGA reconnect, a crash) does
// not lose the recording — see the resume check near the bottom of this file.
const writeRecording = async () => {
  try {
    if (recording) await chrome.storage.local.set({ [RECORDING_KEY]: recording });
    else await chrome.storage.local.remove(RECORDING_KEY);
  } catch {
    /* storage can be unavailable in a locked-down profile — recording still works in memory */
  }
};

/** No `chrome.downloads` permission needed: a Blob URL and a synthetic click do the job. */
function downloadRecording(rec) {
  const blob = new Blob([JSON.stringify(rec, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName(rec);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function stopRecording(reason) {
  if (!recording) return;
  finish(recording, reason);
  const count = countStates(recording);
  downloadRecording(recording);
  recording = null;
  writeRecording();
  redraw({ recordingEvent: { reason, count } });
}

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
    onToggleRecording: async () => {
      if (recording) {
        stopRecording('manual');
        return;
      }
      const tableId = extractTableId(location.href);
      const stale = await readRecording();
      if (stale && stale.tableId !== tableId && countStates(stale) > 0) {
        downloadRecording(finish(stale, 'orphaned')); // do not lose an abandoned session
      }
      recording = createRecording({ tableId, url: location.href });
      if (db) { recording.db = db; recording.dbHash = dbHash; }
      if (latest) appendState(recording, latest, null, validateState(latest, db));
      writeRecording();
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
      recording: { active: Boolean(recording), count: countStates(recording) },
      ...extra
    })
  );
}

window.addEventListener('message', (event) => {
  if (!accepts(event, PAGE_SOURCE)) return;
  const data = event.data;

  if (data.type === MSG.HELLO) {
    ensurePanel();
    if (resumedNotice) {
      redraw({ recordingEvent: resumedNotice });
      resumedNotice = null;
    } else {
      redraw();
    }
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

    if (recording) {
      if (!recording.db && db) { recording.db = db; recording.dbHash = dbHash; }
      appendState(recording, latest, data.seq, validateState(latest, db));
      writeRecording();
      if (isFinished(latest)) {
        stopRecording('gameEnd');
        return; // stopRecording already redrew with the "saved" note
      }
    }

    if (settings.mode === 'watch' || latest.myTurn) redraw();
    return;
  }

  if (data.type === MSG.ERROR) {
    if (recording) {
      appendError(recording, { where: data.where, message: data.message });
      writeRecording();
    }
    const t = translator(resolveLocale(settings.locale));
    ensurePanel().render({
      headline: t('title'),
      status: '',
      mode: settings.mode,
      recording: { active: Boolean(recording), count: countStates(recording) },
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

// A reload mid-game (BGA reconnect, crash, accidental refresh) must not lose the
// recording: resume in memory here, silently — the "resumed" note surfaces on the
// next HELLO, which only fires in the frame that actually hosts the game.
readRecording().then((stored) => {
  const tableId = extractTableId(location.href);
  if (stored && tableId && stored.tableId === tableId) {
    recording = stored;
    resumedNotice = { reason: 'resumed', count: countStates(recording) };
  }
});
