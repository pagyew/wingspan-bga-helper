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
