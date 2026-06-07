const MODULE_ID = 'paper-doll';

const DEFAULT_SLOTS = [
  { id: 'weapon', label: 'Weapon',    x: 72, y: 48, width: 56, height: 56, types: '' },
  { id: 'shield', label: 'Shield',    x: 28, y: 48, width: 56, height: 56, types: '' },
  { id: 'helm',   label: 'Helm',      x: 50, y: 10, width: 48, height: 48, types: '' },
  { id: 'armour', label: 'Armour',    x: 50, y: 40, width: 72, height: 76, types: '' },
  { id: 'cloak',  label: 'Cloak',     x: 85, y: 18, width: 44, height: 44, types: '' },
  { id: 'boots',  label: 'Boots',     x: 50, y: 84, width: 48, height: 48, types: '' },
  { id: 'ring1',  label: 'Ring L',    x: 8,  y: 60, width: 34, height: 34, types: '' },
  { id: 'ring2',  label: 'Ring R',    x: 92, y: 60, width: 34, height: 34, types: '' },
  { id: 'amulet', label: 'Amulet',    x: 50, y: 22, width: 34, height: 34, types: '' },
];

/* ── Default silhouette SVG (inline data URI) ── */
const _silhouette = (() => {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 350" fill="none">
  <defs>
    <radialGradient id="g" cx="50%" cy="30%" r="60%">
      <stop offset="0%"   stop-color="#445"/>
      <stop offset="100%" stop-color="#223"/>
    </radialGradient>
  </defs>
  <rect width="200" height="350" fill="url(#g)" rx="8"/>
  <g stroke="rgba(255,255,255,0.12)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="100" cy="48" r="22"/>
    <path d="M100 70 L100 160"/>
    <path d="M66 110 L100 76 L134 110"/>
    <path d="M66 110 Q50 160 46 200"/>
    <path d="M134 110 Q150 160 154 200"/>
    <path d="M100 160 L76 280"/>
    <path d="M100 160 L124 280"/>
    <path d="M64 280 L88 280"/>
    <path d="M112 280 L136 280"/>
  </g>
  <circle cx="92" cy="44" r="2.5" fill="rgba(255,255,255,0.15)"/>
  <circle cx="108" cy="44" r="2.5" fill="rgba(255,255,255,0.15)"/>
</svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
})();

/* ─── Paper Doll Application ─── */
class PaperDollApp extends Application {
  constructor(actor) {
    super({ title: `${actor.name} — ${game.i18n.localize('PAPERDOLL.Title')}` });
    this.actor = actor;
    this.equipped = {};
  }

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      classes: ['paper-doll'],
      width: 360,
      height: 580,
      popOut: true,
      resizable: false,
      dragDrop: [{ dropSelector: '.paper-doll-slot' }],
    });
  }

  get id() {
    return `paper-doll-${this.actor.id}`;
  }

  get template() {
    return `modules/${MODULE_ID}/templates/paper-doll.hbs`;
  }

  async getData() {
    const slotsData = game.settings.get(MODULE_ID, 'slots');
    const imgWidth = game.settings.get(MODULE_ID, 'imageWidth');
    const imgHeight = game.settings.get(MODULE_ID, 'imageHeight');
    let imagePath = game.settings.get(MODULE_ID, 'characterImage');
    if (!imagePath) imagePath = _silhouette;

    const flags = this.actor.getFlag(MODULE_ID, 'equipped') || {};
    const clean = {};
    for (const [slotId, itemId] of Object.entries(flags)) {
      if (this.actor.items.get(itemId)) clean[slotId] = itemId;
    }
    this.equipped = clean;

    const stored = this.actor.getFlag(MODULE_ID, 'equipped') || {};
    if (JSON.stringify(stored) !== JSON.stringify(clean)) {
      await this.actor.setFlag(MODULE_ID, 'equipped', clean);
    }

    const slots = slotsData.map(s => {
      const itemId = clean[s.id];
      const item = itemId ? this.actor.items.get(itemId) : null;
      return {
        ...s,
        item: item ? { id: item.id, name: item.name, img: item.img } : null,
        equipped: !!item,
      };
    });

    return { slots, imagePath, imgWidth, imgHeight };
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.on('click', '.slot-equipped', ev => this._onClickItem(ev));
    html.on('contextmenu', '.slot-equipped', ev => this._onRightClick(ev));

    html.on('dragover', '.paper-doll-slot', ev => {
      ev.preventDefault();
      ev.currentTarget.classList.add('drag-over');
    });
    html.on('dragleave', '.paper-doll-slot', ev => {
      ev.currentTarget.classList.remove('drag-over');
    });
    html.on('drop', '.paper-doll-slot', ev => {
      ev.currentTarget.classList.remove('drag-over');
    });
  }

  /* ── Drag & Drop ── */
  async _onDrop(event) {
    const data = TextEditor.getDragEventData(event);
    if (data.type !== 'Item') return;

    const slotEl = event.target.closest('.paper-doll-slot');
    if (!slotEl) return;
    const slotId = slotEl.dataset.slotId;

    let item = null;
    if (data.uuid) {
      item = await fromUuid(data.uuid);
    } else if (data.actorId && data.itemId) {
      item = game.actors.get(data.actorId)?.items.get(data.itemId);
    }
    if (!item || item.actor?.id !== this.actor.id) return;

    await this._equipItem(slotId, item);
  }

  async _equipItem(slotId, item) {
    const eq = duplicate(this.equipped);

    for (const [sid, iid] of Object.entries(eq)) {
      if (iid === item.id) delete eq[sid];
    }
    eq[slotId] = item.id;
    this.equipped = eq;

    await this.actor.setFlag(MODULE_ID, 'equipped', eq);

    if (item.system?.equipped !== undefined) {
      await item.update({ 'system.equipped': true });
    }

    this.render();
  }

  async _unequipItem(slotId) {
    const itemId = this.equipped[slotId];
    if (!itemId) return;

    const eq = duplicate(this.equipped);
    delete eq[slotId];
    this.equipped = eq;
    await this.actor.setFlag(MODULE_ID, 'equipped', eq);

    const item = this.actor.items.get(itemId);
    if (item && item.system?.equipped !== undefined) {
      await item.update({ 'system.equipped': false });
    }

    this.render();
  }

  _onClickItem(event) {
    const slotEl = event.currentTarget.closest('.paper-doll-slot');
    if (!slotEl) return;
    const itemId = this.equipped[slotEl.dataset.slotId];
    if (!itemId) return;
    this.actor.items.get(itemId)?.sheet.render(true);
  }

  _onRightClick(event) {
    const slotEl = event.currentTarget.closest('.paper-doll-slot');
    if (!slotEl) return;
    this._unequipItem(slotEl.dataset.slotId);
  }
}

/* ─── Settings Configuration Form ─── */
class PaperDollConfig extends FormApplication {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      classes: ['paper-doll', 'config'],
      title: game.i18n.localize('PAPERDOLL.ConfigTitle'),
      width: 620,
      height: 'auto',
      closeOnSubmit: true,
      submitOnChange: false,
    });
  }

  get template() {
    return `modules/${MODULE_ID}/templates/paper-doll-config.hbs`;
  }

  getData() {
    return {
      imagePath: game.settings.get(MODULE_ID, 'characterImage'),
      imgWidth: game.settings.get(MODULE_ID, 'imageWidth'),
      imgHeight: game.settings.get(MODULE_ID, 'imageHeight'),
      slots: game.settings.get(MODULE_ID, 'slots'),
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.on('click', '.file-picker', ev => {
      const btn = ev.currentTarget;
      const field = btn.parentElement.querySelector('input[type="text"]');
      new FilePicker({
        type: 'image',
        current: field.value,
        callback: path => { field.value = path; },
      }).browse();
    });

    html.on('click', '.add-slot', () => {
      const list = html[0].querySelector('.slots-list');
      const count = list.children.length;
      const div = document.createElement('div');
      div.className = 'slot-entry';
      div.dataset.index = count;
      div.innerHTML = `
        <div class="form-group">
          <label>${game.i18n.localize('PAPERDOLL.SlotId')}</label>
          <div class="form-fields"><input type="text" name="slots.${count}.id" value="slot${count}"></div>
        </div>
        <div class="form-group">
          <label>${game.i18n.localize('PAPERDOLL.SlotLabel')}</label>
          <div class="form-fields"><input type="text" name="slots.${count}.label" value="Slot ${count}"></div>
        </div>
        <div class="form-group">
          <label>${game.i18n.localize('PAPERDOLL.SlotX')}</label>
          <div class="form-fields"><input type="number" name="slots.${count}.x" value="50" min="0" max="100"></div>
        </div>
        <div class="form-group">
          <label>${game.i18n.localize('PAPERDOLL.SlotY')}</label>
          <div class="form-fields"><input type="number" name="slots.${count}.y" value="50" min="0" max="100"></div>
        </div>
        <div class="form-group">
          <label>${game.i18n.localize('PAPERDOLL.SlotWidth')}</label>
          <div class="form-fields"><input type="number" name="slots.${count}.width" value="48" min="16" max="200"></div>
        </div>
        <div class="form-group">
          <label>${game.i18n.localize('PAPERDOLL.SlotHeight')}</label>
          <div class="form-fields"><input type="number" name="slots.${count}.height" value="48" min="16" max="200"></div>
        </div>
        <div class="form-group">
          <label>${game.i18n.localize('PAPERDOLL.SlotTypes')}</label>
          <div class="form-fields"><input type="text" name="slots.${count}.types" value="" placeholder="weapon,armour,equipment"></div>
        </div>
        <button type="button" class="remove-slot" title="${game.i18n.localize('PAPERDOLL.RemoveSlot')}"><i class="fas fa-trash"></i></button>
      `;
      list.appendChild(div);
      this.setPosition({ height: 'auto' });
    });

    html.on('click', '.remove-slot', ev => {
      const entry = ev.currentTarget.closest('.slot-entry');
      entry.parentElement.removeChild(entry);
      const list = html[0].querySelector('.slots-list');
      list.querySelectorAll('.slot-entry').forEach((el, i) => {
        el.dataset.index = i;
        el.querySelectorAll('input[name]').forEach(inp => {
          inp.name = inp.name.replace(/slots\.\d+/, `slots.${i}`);
        });
      });
      this.setPosition({ height: 'auto' });
    });

    html.on('click', '.reset-defaults', async () => {
      await game.settings.set(MODULE_ID, 'slots', DEFAULT_SLOTS);
      this.render();
    });
  }

  async _updateObject(event, formData) {
    const data = foundry.utils.expandObject(Object.fromEntries(formData.entries()));

    const imgWidth = parseInt(data.imgWidth) || 300;
    const imgHeight = parseInt(data.imgHeight) || 500;
    const imagePath = data.imagePath || '';

    const raw = data.slots || {};
    const slots = Object.values(raw).map(s => ({
      id: String(s.id || 'slot').trim(),
      label: String(s.label || 'Slot').trim(),
      x: Math.clamped(parseInt(s.x) || 50, 0, 100),
      y: Math.clamped(parseInt(s.y) || 50, 0, 100),
      width: Math.clamped(parseInt(s.width) || 48, 16, 200),
      height: Math.clamped(parseInt(s.height) || 48, 16, 200),
      types: String(s.types || '').trim(),
    }));

    await game.settings.set(MODULE_ID, 'characterImage', imagePath);
    await game.settings.set(MODULE_ID, 'imageWidth', imgWidth);
    await game.settings.set(MODULE_ID, 'imageHeight', imgHeight);
    await game.settings.set(MODULE_ID, 'slots', slots);
  }
}

/* ─── Module Hooks ─── */
Hooks.on('init', () => {
  game.settings.register(MODULE_ID, 'slots', {
    name: 'Equipment Slots',
    hint: 'Configure the position and size of equipment slots.',
    scope: 'world',
    config: false,
    type: Array,
    default: DEFAULT_SLOTS,
  });

  game.settings.register(MODULE_ID, 'characterImage', {
    name: 'Character Image',
    hint: 'Path to the character image to use as paper doll background.',
    scope: 'world',
    config: false,
    type: String,
    default: '',
  });

  game.settings.register(MODULE_ID, 'imageWidth', {
    name: 'Canvas Width',
    hint: 'Width of the paper doll canvas in pixels.',
    scope: 'world',
    config: false,
    type: Number,
    default: 280,
  });

  game.settings.register(MODULE_ID, 'imageHeight', {
    name: 'Canvas Height',
    hint: 'Height of the paper doll canvas in pixels.',
    scope: 'world',
    config: false,
    type: Number,
    default: 480,
  });

  game.settings.registerMenu(MODULE_ID, 'configMenu', {
    name: 'Paper Doll Settings',
    label: 'Paper Doll Settings',
    hint: 'Configure the paper doll image and equipment slots.',
    icon: 'fas fa-child',
    type: PaperDollConfig,
    restricted: true,
  });
});

Hooks.on('renderActorSheet', (app, html) => {
  const appEl = app.element ?? $(app);
  if (appEl.find('.paper-doll-button').length) return;

  const btn = $(`<a class="paper-doll-button" title="${game.i18n.localize('PAPERDOLL.Open')}"><i class="fas fa-fw fa-child"></i></a>`);
  btn.on('click', ev => {
    ev.preventDefault();
    const existing = Object.values(ui.windows).find(
      w => w instanceof PaperDollApp && w.actor.id === app.actor.id
    );
    if (existing) {
      existing.render(true);
      existing.bringToTop();
    } else {
      new PaperDollApp(app.actor).render(true);
    }
  });

  const header = appEl.find('.window-header, .window-titlebar');
  if (!header.length) return;

  const buttons = header.find('.header-buttons');
  if (buttons.length) {
    buttons.prepend(btn);
  } else {
    header.append(btn);
  }
});
