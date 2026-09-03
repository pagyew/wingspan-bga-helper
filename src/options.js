import { DIAG_KEY } from './ui/diagnostics.js';

const KEY = 'wsh.settings';
const fields = ['locale', 'mode'];

chrome.storage.local.get(KEY).then((stored) => {
  const settings = stored[KEY] || {};
  for (const id of fields) {
    const el = document.getElementById(id);
    if (settings[id]) el.value = settings[id];
    el.addEventListener('change', async () => {
      const current = (await chrome.storage.local.get(KEY))[KEY] || {};
      await chrome.storage.local.set({ [KEY]: { ...current, [id]: el.value } });
    });
  }
});

function renderDiagnostics(diag) {
  const d = diag || {};
  document.getElementById('diag-updated').textContent = d.updatedAt || '—';
  document.getElementById('diag-fingerprint').textContent = d.dbHash || '—';
  document.getElementById('diag-error').textContent = d.lastError
    ? `${d.lastError.where}: ${d.lastError.message} (${new Date(d.lastError.at).toLocaleString()})`
    : 'none / нет';

  const problems = document.getElementById('diag-problems');
  problems.textContent = '';
  if (d.problems && d.problems.length) {
    for (const p of d.problems) {
      const li = document.createElement('li');
      li.textContent = p;
      problems.appendChild(li);
    }
  } else {
    const li = document.createElement('li');
    li.style.color = '#666';
    li.textContent = 'none / нет';
    problems.appendChild(li);
  }

  document.getElementById('diag-snapshot').textContent = d.snapshot
    ? JSON.stringify(d.snapshot, null, 2)
    : '—';
}

chrome.storage.local.get(DIAG_KEY).then((stored) => renderDiagnostics(stored[DIAG_KEY]));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[DIAG_KEY]) renderDiagnostics(changes[DIAG_KEY].newValue);
});
