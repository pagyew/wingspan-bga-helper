// Wire protocol between the MAIN-world collector and the ISOLATED-world UI.
//
// The two content scripts live in different JavaScript worlds: the collector
// can see `gameui` but not `chrome.*`; the UI can see `chrome.*` but not
// `gameui`. window.postMessage is the only channel that reaches both, so every
// message below is also visible to the page — never put anything secret in one.

export const PROTOCOL_VERSION = 1;

export const PAGE_SOURCE = 'wsh-page'; // collector -> UI
export const UI_SOURCE = 'wsh-ui';     // UI -> collector

export const MSG = {
  HELLO: 'hello',   // collector: I found gameui in this frame
  STATE: 'state',   // collector: here is a snapshot
  ERROR: 'error',   // collector: I could not read the page
  PULL: 'pull',     // UI: send me a fresh snapshot now
  NEED_DB: 'needDb' // UI: I do not have the card database with this hash
};

/** Guard for messages arriving from the other world in the same frame. */
export function accepts(event, source) {
  return (
    event.source === window &&
    event.origin === location.origin &&
    event.data &&
    event.data.source === source &&
    event.data.v === PROTOCOL_VERSION
  );
}

export function post(source, type, payload = {}) {
  window.postMessage({ source, v: PROTOCOL_VERSION, type, ...payload }, location.origin);
}
