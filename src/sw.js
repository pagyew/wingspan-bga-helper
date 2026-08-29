// Deliberately thin. An MV3 service worker is evicted whenever the browser
// feels like it, so it holds no game state — it only relays the keyboard
// shortcut and the toolbar click to the content script that owns the panel.

chrome.commands?.onCommand.addListener(async (command) => {
  if (command !== 'toggle-panel') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'toggle-panel' }).catch(() => {});
});

chrome.action?.onClicked.addListener((tab) => {
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'toggle-panel' }).catch(() => {});
});
