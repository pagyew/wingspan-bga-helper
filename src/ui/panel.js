// The floating panel. Renders whatever model boot.js hands it; it owns no game
// logic of its own, so it stays testable and the evaluator stays swappable.

import { PANEL_CSS } from './styles.js';

const HOST_ID = 'wingspan-helper-root';

export class Panel {
  constructor({ t, onRefresh, onToggleMode, onToggleRecording, onSnapshot, position }) {
    this.t = t;
    this.host = document.createElement('div');
    this.host.id = HOST_ID;
    this.shadow = this.host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = PANEL_CSS;

    this.root = document.createElement('div');
    this.root.className = 'panel';
    this.root.innerHTML = `
      <div class="head">
        <span class="who"></span>
        <button class="btn mode" type="button" aria-pressed="false"></button>
        <button class="btn refresh" type="button" title=""></button>
        <button class="btn collapse" type="button">–</button>
      </div>
      <div class="body">
        <div class="sub status"></div>
        <ul class="moves"></ul>
        <div class="detail sub"></div>
        <div class="notes"></div>
        <div class="devtools">
          <button class="btn snapshot" type="button"></button>
          <button class="btn record" type="button" aria-pressed="false"></button>
          <span class="sub recstatus"></span>
        </div>
      </div>
    `;

    this.shadow.append(style, this.root);
    this.$ = (sel) => this.root.querySelector(sel);

    this.$('.refresh').textContent = '⟳';
    this.$('.refresh').title = t('refresh');
    this.$('.collapse').title = t('collapse');
    this.$('.snapshot').textContent = t('snapshot');
    this.$('.mode').textContent = t('modeAdvice');
    this.$('.record').textContent = t('recordStart');

    this.$('.refresh').addEventListener('click', onRefresh);
    this.$('.snapshot').addEventListener('click', onSnapshot);
    this.$('.record').addEventListener('click', onToggleRecording);
    this.$('.mode').addEventListener('click', () => onToggleMode());
    this.$('.collapse').addEventListener('click', () => this.toggleCollapsed());

    this.#makeDraggable(this.$('.head'));
    if (position) this.moveTo(position);
  }

  mount() {
    if (!this.host.isConnected) document.body.appendChild(this.host);
  }

  destroy() {
    this.host.remove();
  }

  get visible() {
    return this.host.isConnected && this.host.style.display !== 'none';
  }

  setVisible(on) {
    this.host.style.display = on ? '' : 'none';
  }

  toggleCollapsed() {
    const next = this.root.dataset.collapsed !== 'true';
    this.root.dataset.collapsed = String(next);
    this.$('.collapse').textContent = next ? '+' : '–';
    this.onLayoutChange?.({ collapsed: next });
  }

  moveTo({ top, left }) {
    if (top == null || left == null) return;
    Object.assign(this.root.style, { top: top + 'px', left: left + 'px', right: 'auto' });
  }

  #makeDraggable(handle) {
    let startX = 0, startY = 0, originTop = 0, originLeft = 0, dragging = false;
    const onMove = (e) => {
      if (!dragging) return;
      const rect = this.root.getBoundingClientRect();
      const top = Math.max(0, Math.min(window.innerHeight - 40, originTop + e.clientY - startY));
      const left = Math.max(0, Math.min(window.innerWidth - rect.width, originLeft + e.clientX - startX));
      this.moveTo({ top, left });
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const rect = this.root.getBoundingClientRect();
      this.onLayoutChange?.({ top: rect.top, left: rect.left });
    };
    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('.btn')) return;
      const rect = this.root.getBoundingClientRect();
      dragging = true;
      startX = e.clientX; startY = e.clientY;
      originTop = rect.top; originLeft = rect.left;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
    });
  }

  /**
   * @param {object} view
   * @param {string} view.headline      round / score line
   * @param {string} view.status        one-line state description
   * @param {Array}  view.moves         [{ name, why, delta }]
   * @param {string} view.detail        goals / bonus / opponent summary
   * @param {Array}  view.notes         [{ text, kind: 'warn'|'error'|'ok' }]
   * @param {string} view.mode          'advice' | 'watch'
   * @param {object} [view.recording]   { active, count } — full-game recorder status
   */
  render(view) {
    const t = this.t;
    this.$('.who').textContent = view.headline || t('waiting');
    this.$('.status').textContent = view.status || '';

    const mode = this.$('.mode');
    mode.textContent = view.mode === 'watch' ? t('modeWatch') : t('modeAdvice');
    mode.setAttribute('aria-pressed', String(view.mode === 'watch'));

    const rec = view.recording || { active: false, count: 0 };
    const record = this.$('.record');
    record.textContent = rec.active ? t('recordStop') : t('recordStart');
    record.setAttribute('aria-pressed', String(rec.active));
    this.$('.recstatus').textContent = rec.active ? `● ${rec.count}` : '';

    const list = this.$('.moves');
    list.textContent = '';
    (view.moves || []).forEach((move, i) => {
      const li = document.createElement('li');
      const rank = document.createElement('span');
      rank.className = 'rank';
      rank.textContent = String(i + 1);
      const body = document.createElement('span');
      body.className = 'move';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = move.name;
      const why = document.createElement('div');
      why.className = 'why';
      why.textContent = move.why || '';
      body.append(name, why);
      const delta = document.createElement('span');
      delta.className = 'delta';
      delta.textContent = move.delta == null ? '' : (move.delta > 0 ? '+' : '') + move.delta.toFixed(1);
      li.append(rank, body, delta);
      list.append(li);
    });

    this.$('.detail').textContent = view.detail || '';

    const notes = this.$('.notes');
    notes.textContent = '';
    for (const note of view.notes || []) {
      const div = document.createElement('div');
      div.className = 'note' + (note.kind ? ' ' + note.kind : '');
      div.textContent = note.text;
      notes.append(div);
    }
  }
}
