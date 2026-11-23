(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const pro = window.PLANQUOTE_PRO === true;
  const sample = window.PlanQuoteSample;
  const canvas = $('canvas');
  const context = canvas.getContext('2d');
  const presets = [
    { name: 'Flooring & Tile', waste: 10, material: 4.8, labor: 3.5, color: '#1D4ED8' },
    { name: 'Interior Painting', waste: 8, material: 0.65, labor: 1.85, color: '#C2410C' },
    { name: 'Landscaping & Decking', waste: 12, material: 9.5, labor: 6, color: '#0F766E' },
    { name: 'Roofing & Pergola', waste: 15, material: 12, labor: 8.5, color: '#B45309' },
    { name: 'General Remodel', waste: 10, material: 6, labor: 5, color: '#474C70' }
  ];
  const linearRates = [
    [1.25, 2], [0.35, 1.1], [4.75, 4], [5.5, 4.5], [2.5, 3]
  ];
  const kinds = { area: 'Area', line: 'Linear', count: 'Count' };
  const hints = {
    pan: 'Drag to pan · Click an annotation to select',
    calibrate: 'Click both ends of a known dimension',
    area: 'Click vertices · Click the first point or double-click to close',
    line: 'Click vertices · Double-click to finish the path',
    count: 'Click to place pins · Right-click or Esc to finish'
  };
  const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  const state = {
    source: null, pages: new Map(), pageNumber: 1, items: [], selected: null, serial: 0,
    mode: 'pan', draft: [], cursor: null, countItem: null, undo: [], metric: false,
    view: { x: 0, y: 0, scale: 1, fit: 1 }, busy: false, operation: 0, drag: null
  };
  const settingsKey = 'planquote.' + (pro ? 'pro' : 'demo');
  let stored;
  try { stored = JSON.parse(localStorage.getItem(settingsKey)) || {}; } catch { stored = {}; }
  const settings = { company: '', contact: '', project: '', tax: 0, logo: '', rates: {}, ...stored };
  for (const key of ['company', 'contact', 'project', 'tax']) $(key).value = settings[key];
  document.documentElement.dataset.edition = pro ? 'pro' : 'demo';
  $('preset').replaceChildren(...presets.map((preset, index) => new Option(preset.name, index)));

  function saveSettings() {
    try { localStorage.setItem(settingsKey, JSON.stringify(settings)); }
    catch { announce('Browser storage is unavailable or full. Settings apply to this session.'); }
  }

  function announce(message = '') {
    $('drawing-status').textContent = message || hints[state.mode];
  }

  const currentPage = () => state.pages.get(state.pageNumber);
  const distance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const linearFactor = () => state.metric ? 0.3048 : 1;
  const quantityFactor = kind => kind === 'count' ? 1 : linearFactor() ** (kind === 'area' ? 2 : 1);
  const unit = kind => kind === 'count' ? 'ea' : kind === 'line' ? (state.metric ? 'm' : 'ft') :
    (state.metric ? 'm²' : 'sq ft');
  const isNumber = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const fromInput = input => isNumber(input.valueAsNumber) ? input.valueAsNumber : 0;
  const cents = value => Math.round((value + Number.EPSILON) * 100);

  function measure(kind, points, scale) {
    if (kind === 'count') return { quantity: points.length };
    let length = 0;
    let twiceArea = 0;
    const edges = kind === 'area' ? points.length : points.length - 1;
    for (let i = 0; i < edges; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      length += distance(a, b);
      twiceArea += a[0] * b[1] - b[0] * a[1];
    }
    if (kind === 'line') return { quantity: scale ? length * scale : null };
    return {
      quantity: scale ? Math.abs(twiceArea / 2) * scale ** 2 : null,
      perimeter: scale ? length * scale : null
    };
  }

  function calculate(item) {
    const scale = state.pages.get(item.page)?.scale;
    const { quantity, perimeter } = measure(item.kind, item.points, scale);
    const gross = quantity === null ? null : quantity * (1 + item.waste / 100);
    const material = cents((gross ?? 0) * item.material);
    const labor = cents((gross ?? 0) * item.labor);
    return { item, quantity, perimeter, gross, material, labor, subtotal: material + labor };
  }

  function summarize() {
    const rows = state.items.map(calculate);
    const material = rows.reduce((sum, row) => sum + row.material, 0);
    const labor = rows.reduce((sum, row) => sum + row.labor, 0);
    const tax = Math.round((material + labor) * settings.tax / 100);
    return { rows, material, labor, tax, total: material + labor + tax };
  }

  const formatMoney = amount => currency.format(amount / 100);
  const displayQuantity = (quantity, kind) => quantity === null ? '—' :
    number.format(quantity * quantityFactor(kind)) + ' ' + unit(kind);

  function defaultRates(preset, kind) {
    const trade = presets[preset];
    const custom = pro && settings.rates[preset + ':' + kind];
    if (custom) return { ...custom };
    const [material, labor] = kind === 'line' ? linearRates[preset] :
      kind === 'area' ? [trade.material, trade.labor] : [0, 0];
    return { waste: trade.waste, material, labor };
  }

  function newItem(kind, points, name, preset = Number($('preset').value)) {
    return {
      id: ++state.serial, name: name || presets[preset].name, kind, points, preset,
      page: state.pageNumber, hidden: false, ...defaultRates(preset, kind)
    };
  }

  function checkpoint() {
    state.undo.push({
      items: structuredClone(state.items), selected: state.selected, page: state.pageNumber,
      scale: currentPage()?.scale, calibration: currentPage()?.calibration
    });
    if (state.undo.length > 80) state.undo.shift();
  }

  async function undo() {
    if (state.draft.length) {
      state.draft.pop();
      updateChrome();
      redraw();
      return;
    }
    const previous = state.undo.pop();
    if (!previous) return;
    state.items = previous.items;
    state.selected = previous.selected;
    state.countItem = null;
    if (state.pages.has(previous.page)) {
      Object.assign(state.pages.get(previous.page), { scale: previous.scale, calibration: previous.calibration });
    }
    if (previous.page !== state.pageNumber) await showPage(previous.page, true);
    refresh();
    announce('Last change undone.');
  }

  function setMode(mode) {
    state.mode = mode;
    state.draft = [];
    state.cursor = null;
    state.countItem = null;
    $('stage').dataset.tool = mode;
    for (const button of $('toolbox').querySelectorAll('[data-tool]')) {
      button.setAttribute('aria-pressed', String(button.dataset.tool === mode));
    }
    announce();
    updateChrome();
    redraw();
  }

  function refresh() {
    const quote = summarize();
    renderList(quote.rows);
    renderTotals(quote);
    updateChrome();
    redraw();
  }

  function updateChrome() {
    const page = currentPage();
    const total = state.source?.count ?? 1;
    $('file-name').textContent = state.source?.name ?? 'No drawing loaded';
    $('pager').hidden = total === 1;
    $('page-count').textContent = 'Page ' + state.pageNumber + ' / ' + total;
    $('page-prev').disabled = state.busy || state.pageNumber === 1;
    $('page-next').disabled = state.busy || state.pageNumber === total;
    $('undo').disabled = state.busy || !state.undo.length && !state.draft.length;
    $('delete-selected').disabled = !state.selected || state.busy;
    $('clear-all').disabled = (!state.items.length && !state.draft.length) || state.busy;
    $('export-pdf').disabled = !page || state.busy;
    $('export-csv').disabled = !state.items.length || state.busy;
    $('zoom').textContent = Math.round(state.view.scale / state.view.fit * 100) + '%';
    const reference = page?.calibration ? distance(...page.calibration) * page.scale : page?.referenceFeet;
    $('scale-state').textContent = page?.scale
      ? 'Scale calibrated' + (reference ? ' · ' + displayQuantity(reference, 'line') : '')
      : 'Scale required';
    $('scale-state').dataset.calibrated = String(Boolean(page?.scale));
    $('scale-state').title = page?.scale ? `100 drawing px = ${number.format(100 * page.scale * linearFactor())} ${unit('line')}` :
      'Calibrate this sheet to measure area or length';
  }

  function renderTotals(quote) {
    $('material-subtotal').textContent = formatMoney(quote.material);
    $('labor-subtotal').textContent = formatMoney(quote.labor);
    $('tax-total').textContent = formatMoney(quote.tax);
    $('grand-total').textContent = formatMoney(quote.total);
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function itemInput(field, label, value) {
    const input = element('input', field === 'name' ? 'item-name' : 'numeric');
    input.dataset.field = field;
    input.setAttribute('aria-label', label);
    input.value = value;
    if (field === 'name') input.maxLength = 120;
    else {
      input.type = 'number';
      input.min = '0';
      input.max = field === 'waste' ? '1000' : '100000000';
      input.step = 'any';
    }
    return input;
  }

  function itemButton(label, action, icon) {
    const button = element('button', 'icon-button');
    button.type = 'button';
    button.dataset.action = action;
    button.title = label;
    button.setAttribute('aria-label', label);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', icon);
    svg.append(path);
    button.append(svg);
    return button;
  }

  function renderList(rows) {
    const list = $('item-list');
    const order = new Set(rows.map(({ item }) => String(item.id)));
    for (const child of Array.from(list.children)) {
      if (!order.has(child.dataset.id)) child.remove();
    }
    $('item-count').textContent = rows.length + (rows.length === 1 ? ' item' : ' items');
    if (!rows.length) {
      list.replaceChildren(element('p', 'item-empty', 'Draw an area, line or set of pins to start an estimate.'));
      return;
    }
    const existing = new Map(Array.from(list.children, child => [child.dataset.id, child]));
    rows.forEach((row, index) => {
      const node = existing.get(String(row.item.id)) || createRow(row.item);
      if (list.children[index] !== node) list.insertBefore(node, list.children[index] ?? null);
      updateRow(node, row);
    });
  }

  function createRow(item) {
    const article = element('article', 'takeoff-item');
    article.dataset.id = item.id;
    const head = element('header', 'item-head');
    const swatch = element('span', 'item-swatch');
    const eye = itemButton('Hide annotation', 'toggle', 'M2 10c2-3 4.6-5 8-5s6 2 8 5c-2 3-4.6 5-8 5s-6-2-8-5z M12 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0');
    const remove = itemButton('Delete item', 'delete', 'M4 5h12m-10 0 1 12h6l1-12M8 5V3h4v2m-3 3v6m2-6v6');
    head.append(swatch, itemInput('name', 'Item name', item.name), eye, remove);
    const meta = element('div', 'item-meta');
    const kind = element('span', 'item-kind');
    const preset = element('select', 'item-preset');
    preset.dataset.field = 'preset';
    preset.setAttribute('aria-label', 'Item trade preset');
    preset.append(...presets.map((trade, index) => new Option(trade.name, index)));
    meta.append(kind, preset);
    const quantities = element('div', 'item-quantities');
    for (const [key, label] of [['net', 'Net'], ['gross', 'With waste'], ['subtotal', 'Line total']]) {
      const cell = element('div');
      const value = element('strong', 'numeric');
      value.dataset.value = key;
      cell.append(element('span', '', label), value);
      quantities.append(cell);
    }
    const rates = element('div', 'item-rates');
    for (const field of ['waste', 'material', 'labor']) {
      const label = element('label');
      label.append(element('span'), itemInput(field, field, item[field]));
      rates.append(label);
    }
    article.append(head, meta, quantities, rates);
    return article;
  }

  function updateRow(node, row) {
    const { item, quantity, perimeter, gross, subtotal } = row;
    node.classList.toggle('is-selected', state.selected === item.id);
    node.classList.toggle('is-hidden', item.hidden);
    node.style.setProperty('--item-color', presets[item.preset].color);
    node.querySelector('.item-kind').textContent = kinds[item.kind] +
      (state.source.count > 1 ? ' · P' + item.page : '') +
      (perimeter != null ? ' · ' + displayQuantity(perimeter, 'line') + ' perimeter' : '');
    const paintToggle = node.querySelector('[data-action="toggle"]');
    const toggleLabel = item.hidden ? 'Show annotation' : 'Hide annotation';
    paintToggle.setAttribute('aria-label', toggleLabel);
    paintToggle.setAttribute('aria-pressed', String(item.hidden));
    paintToggle.title = toggleLabel;
    for (const [field, value] of Object.entries({
      name: item.name, preset: item.preset, waste: item.waste,
      material: Number((item.material / quantityFactor(item.kind)).toFixed(6)),
      labor: Number((item.labor / quantityFactor(item.kind)).toFixed(6))
    })) {
      const input = node.querySelector('[data-field="' + field + '"]');
      if (input !== document.activeElement) input.value = value;
    }
    for (const [field, label] of [['waste', 'Waste %'], ['material', 'Material $/' + unit(item.kind)],
      ['labor', 'Labor $/' + unit(item.kind)]]) {
      const input = node.querySelector('[data-field="' + field + '"]');
      input.previousElementSibling.textContent = label;
      input.setAttribute('aria-label', label);
    }
    node.querySelector('[data-value="net"]').textContent = displayQuantity(quantity, item.kind);
    node.querySelector('[data-value="gross"]').textContent = displayQuantity(gross, item.kind);
    node.querySelector('[data-value="subtotal"]').textContent = quantity === null ? '—' : formatMoney(subtotal);
  }

  function editItem(event) {
    const input = event.target;
    const item = state.items.find(entry => entry.id === Number(input.closest('[data-id]')?.dataset.id));
    if (state.busy || !item || !input.dataset.field) return;
    const field = input.dataset.field;
    if (field === 'preset') {
      checkpoint();
      item.preset = Number(input.value);
      Object.assign(item, defaultRates(item.preset, item.kind));
      refresh();
      return;
    }
    if (!input.validity.valid || (field !== 'name' && input.value === '')) {
      input.reportValidity();
      input.value = field === 'name' ? item.name :
        Number((item[field] / (field === 'waste' ? 1 : quantityFactor(item.kind))).toFixed(6));
      return;
    }
    const value = field === 'name' ? input.value.trim() || presets[item.preset].name :
      fromInput(input) * (field === 'waste' ? 1 : quantityFactor(item.kind));
    if (value !== item[field]) {
      checkpoint();
      item[field] = value;
      if (pro && field !== 'name') {
        settings.rates[item.preset + ':' + item.kind] = { waste: item.waste, material: item.material, labor: item.labor };
        saveSettings();
      }
      refresh();
    }
    if (field === 'name') input.value = item.name;
  }

  function removeItem(id) {
    if (!state.items.some(item => item.id === id)) return;
    checkpoint();
    state.items = state.items.filter(item => item.id !== id);
    if (state.selected === id) state.selected = null;
    if (state.countItem === id) state.countItem = null;
    refresh();
  }

  async function selectItem(id) {
    const item = state.items.find(entry => entry.id === id);
    if (item && item.page !== state.pageNumber && !(await showPage(item.page, true))) return;
    state.selected = id;
    refresh();
  }

  const stage = $('stage');

  function fitView() {
    const page = currentPage();
    if (!page || !stage.clientWidth || !stage.clientHeight) return;
    const padding = stage.clientWidth < 500 ? 12 : 26;
    const fit = Math.min((stage.clientWidth - 2 * padding) / page.width,
      (stage.clientHeight - 2 * padding) / page.height);
    Object.assign(state.view, {
      x: (stage.clientWidth - page.width * fit) / 2,
      y: (stage.clientHeight - page.height * fit) / 2,
      fit, scale: fit
    });
    updateChrome();
    redraw();
  }

  function toDrawing([x, y]) {
    return [(x - state.view.x) / state.view.scale, (y - state.view.y) / state.view.scale];
  }

  function zoomAt(point, ratio) {
    if (!currentPage() || state.busy) return;
    const [x, y] = toDrawing(point);
    const view = state.view;
    view.scale = Math.min(view.fit * 20, Math.max(view.fit * 0.35, view.scale * ratio));
    view.x = point[0] - x * view.scale;
    view.y = point[1] - y * view.scale;
    updateChrome();
    redraw();
  }

  function drawPath(ctx, points, closed) {
    if (!points.length) return;
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    if (closed) ctx.closePath();
  }

  function polygonCenter(points) {
    let sum = 0;
    let x = 0;
    let y = 0;
    points.forEach((a, i) => {
      const b = points[(i + 1) % points.length];
      const cross = a[0] * b[1] - b[0] * a[1];
      sum += cross;
      x += (a[0] + b[0]) * cross;
      y += (a[1] + b[1]) * cross;
    });
    const center = sum ? [x / (3 * sum), y / (3 * sum)] : points[0];
    if (insidePolygon(center, points)) return center;

    // For a concave room, the midpoint of the widest interior span stays inside the outline.
    const heights = [...new Set(points.map(point => point[1]))].sort((a, b) => a - b);
    let bestWidth = 0;
    let best = points[0];
    for (let i = 1; i < heights.length; i += 1) {
      const at = (heights[i - 1] + heights[i]) / 2;
      const cuts = [];
      points.forEach(([ax, ay], j) => {
        const [bx, by] = points[(j + 1) % points.length];
        if ((ay > at) !== (by > at)) cuts.push(ax + (bx - ax) * (at - ay) / (by - ay));
      });
      cuts.sort((a, b) => a - b);
      for (let j = 0; j + 1 < cuts.length; j += 2) {
        const width = cuts[j + 1] - cuts[j];
        if (width > bestWidth) {
          bestWidth = width;
          best = [(cuts[j] + cuts[j + 1]) / 2, at];
        }
      }
    }
    return best;
  }

  function pathMidpoint(points) {
    const lengths = points.slice(1).map((point, index) => distance(points[index], point));
    let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
    for (let i = 0; i < lengths.length; i += 1) {
      if (remaining <= lengths[i] && lengths[i] > 0) {
        const t = remaining / lengths[i];
        return points[i].map((axis, j) => axis + (points[i + 1][j] - axis) * t);
      }
      remaining -= lengths[i];
    }
    return points[0];
  }

  function label(ctx, point, text, color, size, offset = 0) {
    const [x, y] = point;
    ctx.font = `600 ${12 * size}px "IBM Plex Mono", ui-monospace, monospace`;
    const width = ctx.measureText(text).width + 14 * size;
    const top = y + (offset - 11) * size;
    ctx.fillStyle = '#FAF9F6';
    ctx.fillRect(x - width / 2, top, width, 22 * size);
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.strokeRect(x - width / 2, top, width, 22 * size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, x, y + offset * size);
  }

  function paintItem(ctx, item, page, size, selected = false) {
    const { kind, points } = item;
    const color = presets[item.preset].color;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = (selected ? 3.2 : 2) * size;
    if (kind === 'count') {
      points.forEach(([x, y], index) => {
        if (selected) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5 * size;
          ctx.strokeRect(x - 11 * size, y - 11 * size, 22 * size, 22 * size);
        }
        ctx.fillStyle = color;
        ctx.fillRect(x - 8 * size, y - 8 * size, 16 * size, 16 * size);
        ctx.font = `600 ${10 * size}px ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(String(index + 1), x, y, 16 * size);
      });
      return;
    }
    drawPath(ctx, points, kind === 'area');
    if (kind === 'area') {
      ctx.globalAlpha = selected ? 0.19 : 0.12;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.stroke();
    if (selected) {
      for (const [x, y] of points) ctx.fillRect(x - 3 * size, y - 3 * size, 6 * size, 6 * size);
    }
    const amount = measure(kind, points, page.scale).quantity;
    const center = kind === 'area' ? polygonCenter(points) : pathMidpoint(points);
    label(ctx, center, amount === null ? 'Uncalibrated' : displayQuantity(amount, kind),
      color, size, kind === 'line' ? -14 : 0);
  }

  function paintCalibration(ctx, page, size) {
    if (!page.calibration || !page.scale) return;
    const [a, b] = page.calibration;
    ctx.strokeStyle = '#C2410C';
    ctx.lineWidth = 1.5 * size;
    drawPath(ctx, [a, b], false);
    ctx.stroke();
    for (const [x, y] of [a, b]) {
      ctx.fillStyle = '#C2410C';
      ctx.fillRect(x - 3 * size, y - 3 * size, 6 * size, 6 * size);
    }
    label(ctx, pathMidpoint([a, b]), displayQuantity(distance(a, b) * page.scale, 'line'), '#C2410C', size, 17);
  }

  function paintDraft(ctx, page, size) {
    const points = state.draft.concat(state.cursor ? [state.cursor] : []);
    if (!state.draft.length) return;
    const color = state.mode === 'calibrate' ? '#C2410C' : presets[Number($('preset').value)].color;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5 * size;
    ctx.setLineDash([6 * size, 4 * size]);
    const area = state.mode === 'area' && points.length >= 3;
    drawPath(ctx, points, area);
    if (area) {
      ctx.globalAlpha = 0.12;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.stroke();
    ctx.setLineDash([]);
    for (const [x, y] of state.draft) ctx.fillRect(x - 3 * size, y - 3 * size, 6 * size, 6 * size);
    if (state.mode === 'area' && state.draft.length >= 3) {
      const [x, y] = state.draft[0];
      ctx.strokeRect(x - 7 * size, y - 7 * size, 14 * size, 14 * size);
    }
    if (!page.scale || points.length < 2 || state.mode === 'calibrate') return;
    const kind = area ? 'area' : 'line';
    const { quantity, perimeter } = measure(kind, points, page.scale);
    const text = displayQuantity(quantity, kind) + (area ? ' / ' + displayQuantity(perimeter, 'line') : '');
    const center = area ? polygonCenter(points) : pathMidpoint(points);
    label(ctx, center, text, color, size, area ? 0 : -14);
  }

  function paintPage(ctx, page, size, interactive) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, page.width, page.height);
    ctx.drawImage(page.image, 0, 0, page.width, page.height);
    if (interactive) paintCalibration(ctx, page, size);
    for (const item of state.items) {
      if (item.page === state.pageNumber && !item.hidden) {
        paintItem(ctx, item, page, size, interactive && state.selected === item.id);
      }
    }
    if (interactive) paintDraft(ctx, page, size);
  }

  function redraw() {
    const page = currentPage();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.round(stage.clientWidth * dpr);
    const height = Math.round(stage.clientHeight * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, width, height);
    if (!page) return;
    const { x, y, scale } = state.view;
    context.setTransform(dpr * scale, 0, 0, dpr * scale, x * dpr, y * dpr);
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.strokeStyle = '#D2CABD';
    context.lineWidth = 2 / scale;
    context.strokeRect(0, 0, page.width, page.height);
    const annotationSize = stage.clientWidth < 500 ? 0.84 : 1;
    paintPage(context, page, annotationSize / scale, true);
  }

  function insidePolygon([x, y], points) {
    let inside = false;
    points.forEach(([ax, ay], i) => {
      const [bx, by] = points[(i + 1) % points.length];
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
    });
    return inside;
  }

  function segmentDistance(p, a, b) {
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    return distance(p, [a[0] + t * dx, a[1] + t * dy]);
  }

  function hitTest(point) {
    const items = state.items.filter(item => item.page === state.pageNumber && !item.hidden).reverse();
    const tolerance = 9 / state.view.scale;
    const near = items.find(({ kind, points }) => kind === 'count'
      ? points.some(pin => distance(point, pin) <= tolerance)
      : points.some((p, i) => (i || kind === 'area') &&
        segmentDistance(point, p, points[(i + points.length - 1) % points.length]) <= tolerance));
    return near || items.find(item => item.kind === 'area' && insidePolygon(point, item.points));
  }

  function isSimplePolygon(points) {
    const side = (a, b, p) => Math.sign((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
    return points.every((a, i) => {
      const b = points[(i + 1) % points.length];
      return points.every((c, j) => {
        if (j <= i + 1 || (i === 0 && j === points.length - 1)) return true;
        const d = points[(j + 1) % points.length];
        const properCrossing = side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
        const touching = Math.min(segmentDistance(c, a, b), segmentDistance(d, a, b),
          segmentDistance(a, c, d), segmentDistance(b, c, d)) < 0.000001;
        return !properCrossing && !touching;
      });
    });
  }

  function finishPath() {
    const kind = state.mode;
    const min = kind === 'area' ? 3 : 2;
    if (state.draft.length < min) {
      announce('Place at least ' + min + ' distinct points.');
      return;
    }
    if (kind === 'area' && (measure(kind, state.draft, 1).quantity < 0.001 || !isSimplePolygon(state.draft))) {
      announce('Use a closed outline with no crossing edges. Undo the last point to correct it.');
      return;
    }
    const item = newItem(kind, state.draft);
    checkpoint();
    state.items.push(item);
    state.selected = item.id;
    state.draft = [];
    state.cursor = null;
    refresh();
    announce(kinds[kind] + ' added. ' + hints[kind]);
  }

  function canvasPoint(event) {
    const box = canvas.getBoundingClientRect();
    return [event.clientX - box.left, event.clientY - box.top];
  }

  function addPoint(point) {
    const mode = state.mode;
    if (mode === 'pan') {
      state.selected = hitTest(point)?.id ?? null;
      refresh();
      return;
    }
    const page = currentPage();
    if (point[0] < 0 || point[1] < 0 || point[0] > page.width || point[1] > page.height) return;
    if (mode !== 'count' && mode !== 'calibrate' && !page.scale) {
      announce('Calibrate this sheet first to measure area or length.');
      return;
    }
    if (mode === 'count') {
      checkpoint();
      let item = state.items.find(entry => entry.id === state.countItem);
      if (!item) {
        item = newItem('count', []);
        state.items.push(item);
        state.selected = state.countItem = item.id;
      }
      item.points.push(point);
      refresh();
      announce();
      return;
    }
    const nearPoint = (a, b) => distance(a, b) * state.view.scale <= 6;
    if (mode === 'area' && state.draft.length >= 3 && nearPoint(point, state.draft[0])) {
      finishPath();
      return;
    }
    if (state.draft.length && nearPoint(point, state.draft.at(-1))) return;
    state.draft.push(point);
    updateChrome();
    redraw();
    if (mode === 'calibrate' && state.draft.length === 2) openCalibration();
  }

  let space = false;
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !currentPage() || state.busy || state.drag) return;
    const point = canvasPoint(event);
    state.drag = { point, id: event.pointerId, moved: false, pan: space || state.mode === 'pan', space };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    const point = canvasPoint(event);
    const drag = state.drag;
    if (drag?.id === event.pointerId && drag.pan) {
      if (!drag.moved && distance(point, drag.point) < 3) return;
      drag.moved = true;
      state.view.x += point[0] - drag.point[0];
      state.view.y += point[1] - drag.point[1];
      drag.point = point;
    } else {
      state.cursor = toDrawing(point);
    }
    redraw();
  });
  canvas.addEventListener('pointerup', event => {
    const drag = state.drag;
    if (!drag || drag.id !== event.pointerId) return;
    state.drag = null;
    if (!drag.moved && !drag.space && distance(drag.point, canvasPoint(event)) < 10) {
      addPoint(toDrawing(canvasPoint(event)));
    }
  });
  canvas.addEventListener('pointercancel', () => { state.drag = null; });
  canvas.addEventListener('pointerleave', () => { state.cursor = null; redraw(); });
  canvas.addEventListener('dblclick', event => {
    event.preventDefault();
    if (state.draft.length && (state.mode === 'area' || state.mode === 'line')) finishPath();
  });
  canvas.addEventListener('contextmenu', event => {
    if (state.mode !== 'count') return;
    event.preventDefault();
    setMode('pan');
  });
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    zoomAt(canvasPoint(event), Math.exp(-Math.max(-220, Math.min(event.deltaY, 220)) * 0.002));
  }, { passive: false });

  function openCalibration() {
    $('calibration-length').setCustomValidity('');
    $('calibration-length').value = '';
    $('calibration-unit').value = state.metric ? 'm' : 'ft';
    $('calibration-hint').textContent = currentPage().scale
      ? 'Existing length: ' + displayQuantity(distance(...state.draft) * currentPage().scale, 'line')
      : 'Enter the distance between the two points on the drawing.';
    $('calibration').showModal();
    $('calibration-length').focus();
  }

  $('calibration-form').addEventListener('submit', event => {
    event.preventDefault();
    const length = fromInput($('calibration-length'));
    const conversion = { ft: 1, in: 1 / 12, m: 1 / 0.3048, cm: 1 / 30.48, mm: 1 / 304.8 };
    const scale = length * conversion[$('calibration-unit').value] / distance(...state.draft);
    if (!(scale >= 1e-10 && scale <= 1e7)) {
      announce('Enter a positive distance within the supported range.');
      $('calibration-length').setCustomValidity('Enter a valid distance for this segment.');
      $('calibration-length').reportValidity();
      return;
    }
    checkpoint();
    Object.assign(currentPage(), { scale, calibration: state.draft.slice() });
    state.draft = [];
    $('calibration').close('saved');
    setMode('pan');
    refresh();
    announce('Scale calibrated for this sheet.');
  });
  $('calibration-length').addEventListener('input', event => event.target.setCustomValidity(''));
  $('calibration-cancel').addEventListener('click', () => $('calibration').close('cancelled'));
  $('calibration').addEventListener('close', () => {
    state.draft = [];
    updateChrome();
    redraw();
  });

  function loadImage(url) {
    const image = new Image();
    return new Promise((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('The image could not be opened.'));
      image.src = url;
    });
  }

  let workerReady;
  if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.js';

  function openPdfLibrary() {
    if (!window.pdfjsLib) throw new Error('The local PDF library could not be loaded.');
    if (location.protocol !== 'file:') return Promise.resolve();
    if (!workerReady) {
      // A script loaded alongside the app keeps PDF.js usable from a double-clicked local file.
      workerReady = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = pdfjsLib.GlobalWorkerOptions.workerSrc;
        script.onload = resolve;
        script.onerror = () => {
          script.remove();
          reject(new Error('Keep the vendor folder beside index.html.'));
        };
        document.head.append(script);
      }).catch(error => {
        workerReady = null;
        throw error;
      });
    }
    return workerReady;
  }

  async function pdfPage(pdf, pageNumber) {
    const page = await pdf.getPage(pageNumber);
    const native = page.getViewport({ scale: 1 });
    const resolution = Math.min(4, 3000 / Math.max(native.width, native.height));
    const viewport = page.getViewport({ scale: resolution });
    const image = document.createElement('canvas');
    image.width = Math.max(1, Math.ceil(viewport.width));
    image.height = Math.max(1, Math.ceil(viewport.height));
    if (Math.min(viewport.width, viewport.height) < 1) throw new Error('The PDF page has invalid dimensions.');
    await page.render({ canvasContext: image.getContext('2d'), viewport,
      annotationMode: pdfjsLib.AnnotationMode.DISABLE }).promise;
    page.cleanup();
    return { image, width: image.width, height: image.height, scale: null, calibration: null };
  }

  async function loadDocument(makeDocument, loadingText) {
    const operation = ++state.operation;
    state.busy = true;
    updateChrome();
    announce(loadingText);
    let next;
    try {
      next = await makeDocument();
      if (operation !== state.operation) {
        await next.source.pdf?.destroy();
        return;
      }
      const previous = state.source?.pdf;
      state.source = next.source;
      state.pages = new Map([[1, next.page]]);
      state.pageNumber = 1;
      state.items = [];
      state.selected = null;
      state.undo = [];
      state.drag = null;
      if (next.items) {
        state.items = next.items.map(({ kind, points, name, preset }) => newItem(kind, points, name, preset));
      }
      setMode('pan');
      fitView();
      previous?.destroy().catch(() => {});
    } catch (error) {
      if (operation === state.operation) announce(error.message || 'The drawing could not be loaded.');
      return;
    } finally {
      if (operation === state.operation) {
        state.busy = false;
        refresh();
      }
    }
    announce();
  }

  function loadSample() {
    return loadDocument(async () => ({
      source: { name: 'Sample residence', count: 1 },
      page: {
        image: await loadImage(sample.url), width: sample.width, height: sample.height,
        scale: sample.feetPerPixel, calibration: null, referenceFeet: sample.referenceFeet
      },
      items: sample.items
    }), 'Loading the sample plan…');
  }

  function openFile(file) {
    if (!file) return;
    const pdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
    if (!pdf && !/\.(png|jpe?g)$/i.test(file.name) && !/^image\/(png|jpeg)$/.test(file.type)) {
      announce('Choose a local PDF, PNG or JPG file.');
      return;
    }
    return loadDocument(async () => {
      if (pdf) {
        await openPdfLibrary();
        const task = pdfjsLib.getDocument({
          data: await file.arrayBuffer(), isEvalSupported: false, disableFontFace: false,
          useSystemFonts: true, useWorkerFetch: false, verbosity: pdfjsLib.VerbosityLevel.ERRORS
        });
        try {
          const doc = await task.promise;
          return { source: { name: file.name, count: doc.numPages, pdf: doc }, page: await pdfPage(doc, 1) };
        } catch (error) {
          await task.destroy().catch(() => {});
          if (error.name === 'PasswordException') throw new Error('Open an unlocked copy of the PDF.');
          throw error;
        }
      }
      const url = URL.createObjectURL(file);
      try {
        const image = await loadImage(url);
        return {
          source: { name: file.name, count: 1 },
          page: { image, width: image.naturalWidth, height: image.naturalHeight, scale: null, calibration: null }
        };
      } finally {
        URL.revokeObjectURL(url);
      }
    }, 'Opening ' + file.name + '…');
  }

  async function showPage(pageNumber, retainSelection = false) {
    if (state.busy || pageNumber < 1 || pageNumber > state.source?.count) return false;
    if (pageNumber === state.pageNumber) return true;
    const operation = ++state.operation;
    state.busy = true;
    updateChrome();
    announce('Opening page ' + pageNumber + '…');
    try {
      const cached = state.pages.get(pageNumber);
      const page = cached?.image ? cached : await pdfPage(state.source.pdf, pageNumber);
      if (operation !== state.operation) return false;
      if (cached && !cached.image) Object.assign(page, { scale: cached.scale, calibration: cached.calibration });
      state.pages.set(pageNumber, page);
      state.pageNumber = pageNumber;
      // Retain calibration on all pages while bounding the decoded raster cache.
      const rendered = [...state.pages.entries()].filter(([, entry]) => entry.image);
      if (rendered.length > 4) {
        const [oldest] = rendered.find(([id]) => id !== pageNumber);
        state.pages.get(oldest).image = null;
      }
      if (!retainSelection) state.selected = null;
      state.draft = [];
      state.cursor = null;
      state.countItem = null;
      fitView();
      announce();
      return true;
    } catch (error) {
      if (operation === state.operation) announce('Could not open page ' + pageNumber + '. ' + error.message);
      return false;
    } finally {
      if (operation === state.operation) {
        state.busy = false;
        refresh();
      }
    }
  }

  function download(data, mime, name) {
    const url = URL.createObjectURL(new Blob([data], { type: mime }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function csvCell(value) {
    let field = String(value ?? '');
    if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(field)) field = "'" + field;
    return '"' + field.replaceAll('"', '""') + '"';
  }

  function exportCSV() {
    const quote = summarize();
    const rows = [['Item', 'Trade', 'Measurement', 'Page', 'Unit', 'Net quantity', 'Perimeter',
      'Perimeter unit', 'Waste %', 'With waste', 'Material rate (USD)', 'Labor rate (USD)',
      'Material subtotal (USD)', 'Labor subtotal (USD)', 'Line subtotal (USD)', 'Annotation visible']];
    for (const { item, quantity, perimeter, gross, material, labor, subtotal } of quote.rows) {
      const factor = quantityFactor(item.kind);
      const value = amount => amount === null ? '' : Number((amount * factor).toFixed(8));
      rows.push([item.name, presets[item.preset].name, kinds[item.kind], item.page, unit(item.kind),
        value(quantity), perimeter == null ? '' : Number((perimeter * linearFactor()).toFixed(8)),
        perimeter == null ? '' : unit('line'), item.waste, value(gross),
        Number((item.material / factor).toFixed(8)), Number((item.labor / factor).toFixed(8)),
        material / 100, labor / 100, subtotal / 100, item.hidden ? 'No' : 'Yes']);
    }
    for (const [name, value] of [['Material Subtotal', quote.material], ['Labor Subtotal', quote.labor],
      ['Tax (' + settings.tax + '%)', quote.tax], ['Grand Total', quote.total]]) {
      const row = Array(rows[0].length).fill('');
      row[0] = name;
      row[14] = value / 100;
      rows.push(row);
    }
    download('\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n',
      'text/csv;charset=utf-8', 'PlanQuote-estimate.csv');
  }

  function printTable(rows) {
    const table = element('table', 'quote-table');
    const head = table.createTHead().insertRow();
    ['Item / sheet', 'Net quantity', 'Waste', 'With waste', 'Material / unit', 'Labor / unit', 'Subtotal'].forEach((title, i) => {
      const cell = element('th', i ? 'numeric' : '', title);
      cell.scope = 'col';
      head.append(cell);
    });
    const body = table.createTBody();
    for (const row of rows) {
      const { item, quantity, gross, subtotal } = row;
      const factor = quantityFactor(item.kind);
      const tr = body.insertRow();
      const name = tr.insertCell();
      name.append(element('strong', '', item.name), element('small', '', presets[item.preset].name + ' · Page ' + item.page));
      for (const value of [displayQuantity(quantity, item.kind), number.format(item.waste) + '%',
        displayQuantity(gross, item.kind), currency.format(item.material / factor),
        currency.format(item.labor / factor), quantity === null ? '—' : formatMoney(subtotal)]) {
        const cell = tr.insertCell();
        cell.className = 'numeric';
        cell.textContent = value;
      }
    }
    return table;
  }

  function quoteHeading() {
    const header = element('header', 'quote-header');
    const identity = element('div', 'quote-identity');
    identity.append(element('h1', '', 'Estimate'));
    if (settings.company.trim()) identity.append(element('strong', '', settings.company.trim()));
    if (settings.contact.trim()) identity.append(element('p', '', settings.contact.trim()));
    header.append(identity);
    if (pro && settings.logo) {
      const logo = element('img', 'quote-logo');
      logo.src = settings.logo;
      logo.alt = 'Company logo';
      header.append(logo);
    }
    return header;
  }

  function quoteTotals(quote) {
    const totals = element('dl', 'quote-totals');
    for (const [name, value] of [['Material Subtotal', quote.material], ['Labor Subtotal', quote.labor],
      ['Tax (' + settings.tax + '%)', quote.tax], ['Grand Total', quote.total]]) {
      const line = element('div');
      if (name === 'Grand Total') line.className = 'total-line';
      line.append(element('dt', '', name), element('dd', 'numeric', formatMoney(value)));
      totals.append(line);
    }
    return totals;
  }

  async function printQuote() {
    const page = currentPage();
    if (!page || state.busy) return;
    $('export-pdf').disabled = true;
    try {
      const raster = document.createElement('canvas');
      const scale = 2600 / Math.max(page.width, page.height);
      raster.width = Math.max(1, Math.round(page.width * scale));
      raster.height = Math.max(1, Math.round(page.height * scale));
      const ctx = raster.getContext('2d');
      ctx.scale(scale, scale);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      paintPage(ctx, page, Math.max(page.width, page.height) / 820, false);
      const heading = quoteHeading();
      const figure = element('figure', 'quote-figure');
      const caption = element('figcaption', '', state.source.name + ' · Page ' + state.pageNumber +
        ' / ' + state.source.count);
      const project = element('div', 'quote-project');
      project.append(element('strong', '', 'Client / Project'), element('span', '', settings.project.trim() || '—'));
      const quote = summarize();
      const table = printTable(quote.rows);
      const totals = quoteTotals(quote);
      const signatures = element('div', 'quote-signatures');
      signatures.append(element('div', '', 'Client signature'), element('div', '', 'Date'));
      const img = await loadImage(raster.toDataURL('image/png'));
      img.alt = 'The current plan sheet with takeoff annotations';
      figure.append(img, caption);
      const logo = heading.querySelector('.quote-logo');
      if (logo) await logo.decode();
      const root = $('print-quote');
      root.replaceChildren(heading, project, figure, table, totals, signatures);
      if (!pro) root.append(element('footer', 'quote-watermark', 'Generated with PlanQuote Demo'));
      window.print();
    } catch (error) {
      announce('Could not prepare the quote. ' + error.message);
    } finally {
      updateChrome();
    }
  }

  function readRates(data) {
    if (!data || data.format !== 'PlanQuote Rate Library' || data.version !== 1 ||
        !data.rates || typeof data.rates !== 'object' || Array.isArray(data.rates)) {
      throw new Error('Choose a PlanQuote rate library JSON file.');
    }
    const rates = {};
    for (const [key, record] of Object.entries(data.rates)) {
      if (!/^[0-4]:(area|line|count)$/.test(key) ||
          !['waste', 'material', 'labor'].every(field => isNumber(record?.[field])) ||
          record.waste > 1000 || record.material > 100000000 || record.labor > 100000000) {
        throw new Error('The rate library contains an invalid preset or rate.');
      }
      rates[key] = { waste: record.waste, material: record.material, labor: record.labor };
    }
    return rates;
  }

  async function saveLogo(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      const image = await loadImage(url);
      const thumbnail = document.createElement('canvas');
      const ratio = Math.min(1, 640 / Math.max(image.naturalWidth, image.naturalHeight));
      thumbnail.width = Math.max(1, Math.round(image.naturalWidth * ratio));
      thumbnail.height = Math.max(1, Math.round(image.naturalHeight * ratio));
      thumbnail.getContext('2d').drawImage(image, 0, 0, thumbnail.width, thumbnail.height);
      settings.logo = thumbnail.toDataURL();
      announce('Company logo saved for new quotes.');
      saveSettings();
    } catch (error) {
      announce(error.message);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function zoomCenter(ratio) {
    zoomAt([stage.clientWidth / 2, stage.clientHeight / 2], ratio);
  }

  $('toolbox').addEventListener('click', event => {
    const button = event.target.closest('[data-tool]');
    if (button && !state.busy) {
      setMode(button.dataset.tool);
      canvas.focus({ preventScroll: true });
    }
  });
  $('preset').addEventListener('change', () => {
    state.countItem = null;
    redraw();
  });
  $('fit').addEventListener('click', fitView);
  $('zoom-in').addEventListener('click', () => zoomCenter(1.25));
  $('zoom-out').addEventListener('click', () => zoomCenter(0.8));
  $('undo').addEventListener('click', undo);
  $('delete-selected').addEventListener('click', () => removeItem(state.selected));
  $('clear-all').addEventListener('click', () => {
    checkpoint();
    state.items = [];
    state.draft = [];
    state.selected = state.countItem = null;
    refresh();
    announce('All takeoff items cleared. Undo to restore them.');
  });
  $('page-prev').addEventListener('click', () => showPage(state.pageNumber - 1));
  $('page-next').addEventListener('click', () => showPage(state.pageNumber + 1));
  $('units').addEventListener('change', event => {
    state.metric = event.target.value === 'metric';
    refresh();
  });
  $('load-sample').addEventListener('click', loadSample);
  $('upload').addEventListener('change', event => {
    openFile(event.target.files[0]);
    event.target.value = '';
  });

  stage.addEventListener('dragover', event => {
    if (event.dataTransfer.types.includes('Files')) event.preventDefault();
  });
  stage.addEventListener('drop', event => {
    event.preventDefault();
    openFile(event.dataTransfer.files[0]);
  });
  $('item-list').addEventListener('focusin', event => {
    const id = Number(event.target.closest('[data-id]')?.dataset.id);
    if (!state.busy && id && event.target.matches('[data-field]')) selectItem(id);
  });
  $('item-list').addEventListener('change', editItem);
  $('item-list').addEventListener('click', event => {
    const id = Number(event.target.closest('[data-id]')?.dataset.id);
    const item = state.items.find(entry => entry.id === id);
    if (!item || state.busy) return;
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'delete') removeItem(id);
    else if (action === 'toggle') {
      checkpoint();
      item.hidden = !item.hidden;
      refresh();
    } else if (!event.target.matches('[data-field]')) selectItem(id);
  });

  for (const key of ['company', 'contact', 'project', 'tax']) {
    $(key).addEventListener('input', event => {
      const input = event.target;
      if (!input.validity.valid) return;
      settings[key] = key === 'tax' ? fromInput(input) : input.value;
      saveSettings();
      if (key === 'tax') renderTotals(summarize());
    });
  }
  $('tax').addEventListener('change', event => {
    if (!event.target.validity.valid) event.target.value = settings.tax;
  });
  $('export-pdf').addEventListener('click', printQuote);
  $('export-csv').addEventListener('click', exportCSV);
  if (pro) {
    $('logo').addEventListener('change', event => {
      saveLogo(event.target.files[0]);
      event.target.value = '';
    });
    $('export-rates').addEventListener('click', () => {
      const rates = {};
      for (const [index] of presets.entries()) {
        for (const kind of Object.keys(kinds)) rates[index + ':' + kind] = defaultRates(index, kind);
      }
      download(JSON.stringify({ format: 'PlanQuote Rate Library', version: 1, rates }, null, 2) + '\n',
        'application/json', 'PlanQuote-rate-library.json');
    });
    $('import-rates').addEventListener('change', async event => {
      const file = event.target.files[0];
      event.target.value = '';
      if (!file) return;
      try {
        if (file.size > 128000) throw new Error('The rate library file is too large.');
        settings.rates = readRates(JSON.parse(await file.text()));
        announce('Rate library imported. Select a preset for a new or existing item to apply its rates.');
        saveSettings();
      } catch (error) {
        announce('Could not import the rate library. ' + error.message);
      }
    });
  } else {
    $('open-pro').addEventListener('click', event => {
      event.preventDefault();
      $('pro-modal').showModal();
    });
    $('close-pro').addEventListener('click', () => $('pro-modal').close());
  }

  window.addEventListener('keydown', event => {
    if (event.target.matches('input, select, textarea, button, a, [contenteditable]') ||
        document.querySelector('dialog[open]') || state.busy) return;
    if (event.code === 'Space') {
      event.preventDefault();
      space = true;
      stage.dataset.panning = 'true';
    }
    if (event.key === 'Escape') setMode('pan');
    if (event.key === 'Enter' && state.draft.length && ['area', 'line'].includes(state.mode)) finishPath();
    if (event.key === 'Delete' && state.selected) removeItem(state.selected);
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      undo();
    }
  });
  function clearSpace() {
    space = false;
    delete stage.dataset.panning;
  }
  window.addEventListener('keyup', event => { if (event.code === 'Space') clearSpace(); });
  window.addEventListener('blur', clearSpace);
  new ResizeObserver(fitView).observe(stage);
  loadSample();
})();
