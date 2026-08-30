// Styles live in a string because the panel lives in a shadow root: BGA's CSS
// is assertive enough that an unshielded panel drifts on the first theme change.
export const PANEL_CSS = `
  :host { all: initial; }
  .panel {
    position: fixed; z-index: 2147483000; top: 88px; right: 16px; width: 320px;
    font: 13px/1.45 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
    color: #e8e6e1; background: #232826; border: 1px solid #3c433f; border-radius: 10px;
    box-shadow: 0 8px 28px rgba(0,0,0,.42); overflow: hidden;
  }
  .panel[data-collapsed="true"] .body { display: none; }
  .head {
    display: flex; align-items: center; gap: 8px; padding: 8px 10px;
    background: #2c322f; border-bottom: 1px solid #3c433f; cursor: grab; user-select: none;
  }
  .head:active { cursor: grabbing; }
  .head .who { flex: 1; min-width: 0; font-weight: 600; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; }
  .btn {
    border: 1px solid #4a524d; background: #363d39; color: #d8d5cf; cursor: pointer;
    border-radius: 6px; padding: 2px 7px; font: inherit; font-size: 12px; line-height: 1.4;
  }
  .btn:hover { background: #414945; }
  .btn[aria-pressed="true"] { background: #4c6a52; border-color: #618a69; color: #f2f5f1; }
  .body { padding: 10px; }
  .sub { color: #a3aaa4; font-size: 12px; }
  .moves { list-style: none; margin: 0 0 10px; padding: 0; }
  .moves li { display: flex; gap: 8px; padding: 6px 0; border-top: 1px solid #333a36; }
  .moves li:first-child { border-top: 0; }
  .rank { color: #8d958f; width: 12px; flex: none; }
  .move { flex: 1; min-width: 0; }
  .move .name { font-weight: 600; }
  .move .why { color: #a3aaa4; font-size: 12px; }
  .delta { flex: none; font-variant-numeric: tabular-nums; color: #9ed3a6; font-weight: 600; }
  .note { margin-top: 8px; padding: 6px 8px; border-radius: 6px;
    background: #3a3326; color: #e6d4a8; font-size: 12px; }
  .note.error { background: #3d2a2a; color: #efb9b4; }
  .note.ok { background: #23392a; color: #a8e6bb; }
  .devtools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
  .recstatus { color: #e39a9a; font-variant-numeric: tabular-nums; }
  @media (prefers-color-scheme: light) {
    .panel { color: #23282a; background: #f7f7f4; border-color: #d5d8d1; }
    .head { background: #eceee7; border-bottom-color: #d5d8d1; }
    .btn { background: #e2e5dd; border-color: #c6cbc0; color: #33383a; }
    .sub, .move .why, .rank { color: #6a716c; }
    .delta { color: #2f7a41; }
    .note.ok { background: #e3f3e6; color: #1f6b34; }
    .recstatus { color: #b5453f; }
  }
`;
