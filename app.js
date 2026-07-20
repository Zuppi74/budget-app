const STORAGE_KEY = 'budgetapp_data_v2';
const OLD_STORAGE_KEY = 'budgetapp_data_v1';

const CHART_COLORS = [
  'var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)',
  'var(--chart-6)', 'var(--chart-7)', 'var(--chart-8)', 'var(--chart-9)', 'var(--chart-10)'
];

const ICON_OPTIONS = [
  '🛒', '🍔', '🍎', '🥖', '☕', '🍺', '🍷', '🍕', '🍽️', '🥩',
  '🏠', '💡', '🔥', '💧', '🛋️', '🧹', '🔧',
  '🚗', '⛽', '🚌', '🚆', '🚲', '✈️', '🅿️', '🚕',
  '💊', '🏥', '🩺', '🦷', '🧘', '💪',
  '🛍️', '👕', '👟', '👜', '💄', '✂️',
  '🎉', '🎬', '🎮', '🎵', '📚', '🎨', '🏋️', '⚽', '🎫', '🏖️',
  '📱', '💻', '📶', '📺', '🎧',
  '💰', '💳', '🏦', '📈', '🎁', '💸',
  '🐶', '🐱', '👶', '🎓', '🏫',
  '📦', '❓'
];

const DEFAULT_DATA = {
  categoryGroups: [
    { id: 'grp-bedurfnisse', name: 'Bedürfnisse', collapsed: false, categories: [
      { id: 'cat-lebensmittel', name: 'Lebensmittel', icon: '🛒' },
      { id: 'cat-freizeit', name: 'Freizeit', icon: '🎉' },
      { id: 'cat-gesundheit', name: 'Gesundheit', icon: '💊' },
      { id: 'cat-shopping', name: 'Shopping', icon: '🛍️' }
    ] },
    { id: 'grp-fixkosten', name: 'Fixkosten', collapsed: false, categories: [
      { id: 'cat-wohnen', name: 'Wohnen', icon: '🏠' },
      { id: 'cat-transport', name: 'Transport', icon: '🚌' }
    ] },
    { id: 'grp-sonstiges', name: 'Sonstiges', collapsed: false, categories: [
      { id: 'cat-sonstiges', name: 'Sonstiges', icon: '📦' }
    ] }
  ],
  incomeCategories: ['Gehalt', 'Nebeneinkommen', 'Sonstiges'],
  budgets: {},
  accounts: [
    { id: 'acc-lohnkonto', name: 'Lohnkonto', type: 'Lohnkonto', balance: 0 }
  ],
  entries: [],
  recurring: [],
  depots: [],
  recentMoves: []
};

function defaultAccount() {
  return { id: uid(), name: 'Lohnkonto', type: 'Lohnkonto', balance: 0 };
}

function ensureAccounts(d) {
  if (!d.accounts || d.accounts.length === 0) {
    const acc = defaultAccount();
    d.accounts = [acc];
    d.entries = (d.entries || []).map(e => e.account ? e : { ...e, account: acc.id });
  }
  return d;
}

const currencyFmt = new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' });

function formatCurrency(amount) {
  const formatted = currencyFmt.format(Math.abs(amount));
  return amount < 0 ? `-${formatted}` : formatted;
}

const quantityFmt = new Intl.NumberFormat('de-CH', { maximumFractionDigits: 6 });

function formatQuantity(qty) {
  return quantityFmt.format(qty);
}
const monthFmt = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' });
const monthOnlyFmt = new Intl.DateTimeFormat('de-DE', { month: 'long' });
const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

let data = loadData();
let undoStack = [];
let redoStack = [];

const today = new Date();
const state = {
  year: today.getFullYear(),
  month: today.getMonth(),
  reportYear: today.getFullYear(),
  currentType: 'expense',
  view: 'overview',
  entryFilters: { dateFrom: '', dateTo: '', category: 'all', account: 'all', label: 'all' }
};

function structuredCloneData(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2));
}

function migrateOldData(old) {
  const nameToId = {};
  const categories = (old.categories.expense || []).map(name => {
    const id = uid();
    nameToId[name] = id;
    return { id, name };
  });
  const categoryGroups = [{ id: uid(), name: 'Kategorien', collapsed: false, categories }];
  const incomeCategories = old.categories.income || [];
  const entries = (old.entries || []).map(e => {
    if (e.type === 'expense') {
      return { ...e, category: nameToId[e.category] || null };
    }
    return e;
  });
  return ensureAccounts({ categoryGroups, incomeCategories, budgets: {}, entries, recurring: [], depots: [], recentMoves: [] });
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.categoryGroups) {
        parsed.budgets = parsed.budgets || {};
        parsed.recentMoves = parsed.recentMoves || [];
        parsed.recurring = parsed.recurring || [];
        parsed.depots = parsed.depots || [];
        return ensureAccounts(parsed);
      }
    }
    const oldRaw = localStorage.getItem(OLD_STORAGE_KEY);
    if (oldRaw) {
      const oldParsed = JSON.parse(oldRaw);
      if (oldParsed.categories) return migrateOldData(oldParsed);
    }
    return structuredCloneData(DEFAULT_DATA);
  } catch (e) {
    return structuredCloneData(DEFAULT_DATA);
  }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    showStorageWarning();
  }
}

function showStorageWarning() {
  if (document.getElementById('storage-warning')) return;
  const banner = document.createElement('div');
  banner.id = 'storage-warning';
  banner.className = 'storage-warning';
  banner.textContent = 'Deine Änderungen können in diesem Browser nicht dauerhaft gespeichert werden (z. B. wenn die Datei direkt per Doppelklick geöffnet wurde). Starte die App stattdessen über einen lokalen Server, oder öffne sie in einem anderen Browser.';
  document.body.prepend(banner);
}

function addRecentMove(description) {
  data.recentMoves = data.recentMoves || [];
  data.recentMoves.unshift({ time: new Date().toISOString(), description });
  if (data.recentMoves.length > 30) data.recentMoves.length = 30;
}

function mutate(description, fn) {
  undoStack.push({ data: structuredCloneData(data), description });
  if (undoStack.length > 50) undoStack.shift();
  redoStack = [];
  fn();
  addRecentMove(description);
  saveData();
  updateUndoRedoButtons();
  render();
}

function undo() {
  if (undoStack.length === 0) return;
  const entry = undoStack.pop();
  redoStack.push({ data: structuredCloneData(data), description: entry.description });
  data = entry.data;
  addRecentMove(`Rückgängig: ${entry.description}`);
  saveData();
  updateUndoRedoButtons();
  render();
}

function redo() {
  if (redoStack.length === 0) return;
  const entry = redoStack.pop();
  undoStack.push({ data: structuredCloneData(data), description: entry.description });
  data = entry.data;
  addRecentMove(`Wiederholt: ${entry.description}`);
  saveData();
  updateUndoRedoButtons();
  render();
}

function updateUndoRedoButtons() {
  document.getElementById('btn-undo').disabled = undoStack.length === 0;
  document.getElementById('btn-redo').disabled = redoStack.length === 0;
}

function findCategory(categoryId) {
  for (const group of data.categoryGroups) {
    const category = group.categories.find(c => c.id === categoryId);
    if (category) return { group, category };
  }
  return null;
}

function getCategoryName(categoryId) {
  const found = findCategory(categoryId);
  return found ? found.category.name : 'Gelöschte Kategorie';
}

function getCategoryIcon(categoryId) {
  const found = findCategory(categoryId);
  return found && found.category.icon ? found.category.icon : '';
}

function getCategoryDisplayName(categoryId) {
  const icon = getCategoryIcon(categoryId);
  const name = getCategoryName(categoryId);
  return icon ? `${icon} ${name}` : name;
}

function getEntryCategoryLabel(entry) {
  return entry.type === 'expense' ? getCategoryName(entry.category) : entry.category;
}

function findAccount(accountId) {
  return data.accounts.find(a => a.id === accountId) || null;
}

function getAccountName(accountId) {
  const account = findAccount(accountId);
  return account ? account.name : 'Gelöschtes Konto';
}

function getAccountCurrentBalance(accountId) {
  const account = findAccount(accountId);
  if (!account) return 0;
  const delta = data.entries
    .filter(e => e.account === accountId)
    .reduce((s, e) => s + (e.type === 'income' ? e.amount : -e.amount), 0);
  return account.balance + delta;
}

function monthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function getBudget(categoryId, year, month) {
  const key = monthKey(year, month);
  return (data.budgets[key] && data.budgets[key][categoryId]) || 0;
}

function setBudget(categoryId, year, month, amount) {
  const key = monthKey(year, month);
  if (!data.budgets[key]) data.budgets[key] = {};
  data.budgets[key][categoryId] = amount;
}

function getSpentForCategoryInMonth(categoryId, year, month) {
  return data.entries
    .filter(e => e.type === 'expense' && e.category === categoryId)
    .filter(e => {
      const d = new Date(e.date + 'T00:00:00');
      return d.getFullYear() === year && d.getMonth() === month;
    })
    .reduce((s, e) => s + e.amount, 0);
}

function getCategoryRemainingForMonth(categoryId, year, month) {
  const available = getBudget(categoryId, year, month) + getRolloverForMonth(categoryId, year, month);
  const spent = getSpentForCategoryInMonth(categoryId, year, month);
  return available - spent;
}

function getRolloverForMonth(categoryId, year, month, depth) {
  depth = depth || 0;
  if (depth > 60) return 0;
  const prevDate = new Date(year, month - 1, 1);
  const prevYear = prevDate.getFullYear();
  const prevMonth = prevDate.getMonth();
  const prevKey = monthKey(prevYear, prevMonth);
  if (!data.budgets[prevKey]) return 0;

  const prevAssigned = getBudget(categoryId, prevYear, prevMonth);
  const prevRollover = getRolloverForMonth(categoryId, prevYear, prevMonth, depth + 1);
  const prevAvailable = prevAssigned + prevRollover;
  const prevSpent = getSpentForCategoryInMonth(categoryId, prevYear, prevMonth);
  return Math.max(prevAvailable - prevSpent, 0);
}

function getAvailableBudget(categoryId, year, month) {
  return getBudget(categoryId, year, month) + getRolloverForMonth(categoryId, year, month);
}

function carryForwardBudgets() {
  const key = monthKey(state.year, state.month);
  if (data.budgets[key]) return;
  const prevDate = new Date(state.year, state.month - 1, 1);
  const prevKey = monthKey(prevDate.getFullYear(), prevDate.getMonth());
  if (data.budgets[prevKey]) {
    data.budgets[key] = { ...data.budgets[prevKey] };
    saveData();
  }
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function generateRecurringEntriesForMonth(year, month) {
  if (!data.recurring || data.recurring.length === 0) return;
  const key = monthKey(year, month);
  let changed = false;

  data.recurring.forEach(r => {
    if (!r.active) return;
    if (key < r.startMonth) return;
    const alreadyExists = data.entries.some(e => e.recurringId === r.id && e.date.slice(0, 7) === key);
    if (alreadyExists) return;

    const day = Math.min(r.dayOfMonth, daysInMonth(year, month));
    const date = `${key}-${String(day).padStart(2, '0')}`;
    data.entries.push({
      id: uid(), type: r.type, amount: r.amount, category: r.category, account: r.account,
      label: r.label, note: r.note, date, recurringId: r.id
    });
    changed = true;
  });

  if (changed) saveData();
}

function getEntriesForCurrentMonth() {
  return data.entries.filter(e => {
    const d = new Date(e.date + 'T00:00:00');
    return d.getFullYear() === state.year && d.getMonth() === state.month;
  }).sort((a, b) => b.date.localeCompare(a.date));
}

function renderMonthLabel() {
  const label = document.getElementById('current-month');
  const d = new Date(state.year, state.month, 1);
  const text = monthFmt.format(d);
  label.textContent = text.charAt(0).toUpperCase() + text.slice(1);
}

function renderSummary(entries) {
  const income = entries.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
  const expense = entries.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
  const balance = income - expense;

  document.getElementById('sum-income').textContent = formatCurrency(income);
  document.getElementById('sum-expense').textContent = formatCurrency(expense);
  const balanceEl = document.getElementById('sum-balance');
  balanceEl.textContent = formatCurrency(balance);
  balanceEl.style.color = balance < 0 ? 'var(--expense)' : 'var(--income)';
}

function isEntryFilterActive() {
  const f = state.entryFilters;
  return !!(f.dateFrom || f.dateTo || f.category !== 'all' || f.account !== 'all' || f.label !== 'all');
}

function getFilteredEntries(monthEntries) {
  if (!isEntryFilterActive()) return monthEntries;
  const f = state.entryFilters;
  return data.entries
    .filter(e => {
      if (f.dateFrom && e.date < f.dateFrom) return false;
      if (f.dateTo && e.date > f.dateTo) return false;
      if (f.category !== 'all' && e.category !== f.category) return false;
      if (f.account !== 'all' && e.account !== f.account) return false;
      if (f.label !== 'all' && (e.label || '') !== f.label) return false;
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

function populateEntryFilters() {
  const categorySelect = document.getElementById('filter-category');
  const prevCat = categorySelect.value || 'all';
  const expenseOptions = data.categoryGroups.map(group => {
    const opts = group.categories.map(c => `<option value="${c.id}">${c.icon ? c.icon + ' ' : ''}${escapeHtml(c.name)}</option>`).join('');
    return `<optgroup label="${escapeHtml(group.name)}">${opts}</optgroup>`;
  }).join('');
  const incomeOptions = `<optgroup label="Einnahmen">${data.incomeCategories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}</optgroup>`;
  categorySelect.innerHTML = `<option value="all">Alle Kategorien</option>${expenseOptions}${incomeOptions}`;
  categorySelect.value = prevCat;

  const accountSelect = document.getElementById('filter-account');
  const prevAcc = accountSelect.value || 'all';
  accountSelect.innerHTML = '<option value="all">Alle Konten</option>' +
    data.accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');
  accountSelect.value = prevAcc;

  const labelSelect = document.getElementById('filter-label');
  const prevLabel = labelSelect.value || 'all';
  const labels = Array.from(new Set(data.entries.map(e => e.label).filter(Boolean))).sort();
  labelSelect.innerHTML = '<option value="all">Alle Labels</option>' +
    labels.map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
  labelSelect.value = prevLabel;
}

function readEntryFiltersFromInputs() {
  state.entryFilters = {
    dateFrom: document.getElementById('filter-date-from').value,
    dateTo: document.getElementById('filter-date-to').value,
    category: document.getElementById('filter-category').value,
    account: document.getElementById('filter-account').value,
    label: document.getElementById('filter-label').value
  };
  render();
}

function clearEntryFilters() {
  document.getElementById('filter-date-from').value = '';
  document.getElementById('filter-date-to').value = '';
  document.getElementById('filter-category').value = 'all';
  document.getElementById('filter-account').value = 'all';
  document.getElementById('filter-label').value = 'all';
  state.entryFilters = { dateFrom: '', dateTo: '', category: 'all', account: 'all', label: 'all' };
  render();
}

function renderEntries(entries) {
  const container = document.getElementById('entries-list');
  if (entries.length === 0) {
    const message = isEntryFilterActive() ? 'Keine Einträge gefunden.' : 'Keine Einträge in diesem Monat.';
    container.innerHTML = `<p class="empty-hint">${message}</p>`;
    return;
  }

  container.innerHTML = entries.map(e => {
    const d = new Date(e.date + 'T00:00:00');
    const dateStr = dateFmt.format(d);
    const accountName = e.account ? getAccountName(e.account) : null;
    const metaParts = [dateStr, accountName, e.note].filter(Boolean).map(escapeHtml);
    const meta = metaParts.join(' · ');
    const sign = e.type === 'income' ? '+' : '−';
    const labelTag = e.label ? `<span class="entry-label-tag">${escapeHtml(e.label)}</span>` : '';
    const recurringBadge = e.recurringId ? `<span class="entry-recurring-badge" title="Wiederkehrende Buchung">↻</span>` : '';
    const icon = e.type === 'expense' ? getCategoryIcon(e.category) : '';
    const iconEl = icon ? `<span class="entry-icon">${icon}</span>` : '';
    return `
      <div class="entry-row" data-id="${e.id}">
        ${iconEl}
        <div class="entry-main">
          <span class="entry-category-row">
            <span class="entry-category">${escapeHtml(getEntryCategoryLabel(e))}</span>
            ${labelTag}
            ${recurringBadge}
          </span>
          <span class="entry-meta">${meta}</span>
        </div>
        <span class="entry-amount ${e.type}">${sign} ${formatCurrency(e.amount)}</span>
      </div>`;
  }).join('');

  container.querySelectorAll('.entry-row').forEach(row => {
    row.addEventListener('click', () => openEntryModal(row.dataset.id));
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderAccountBalancesPanel() {
  const container = document.getElementById('account-balances-list');
  if (data.accounts.length === 0) {
    container.innerHTML = '<p class="empty-hint">Keine Konten angelegt.</p>';
    return;
  }

  const items = data.accounts.map(a => {
    const current = getAccountCurrentBalance(a.id);
    return `
    <div class="account-balance-item">
      <span class="account-balance-name">${escapeHtml(a.name)}</span>
      <span class="account-balance-amount" style="color:${current < 0 ? 'var(--expense)' : 'var(--text)'}">${formatCurrency(current)}</span>
    </div>`;
  }).join('');

  const total = data.accounts.reduce((s, a) => s + getAccountCurrentBalance(a.id), 0);
  const totalRow = `
    <div class="account-balance-total">
      <span>Total</span>
      <span style="color:${total < 0 ? 'var(--expense)' : 'var(--accent)'}">${formatCurrency(total)}</span>
    </div>`;

  container.innerHTML = items + totalRow;
}

function renderBarChart(entries) {
  const container = document.getElementById('bar-chart-container');
  const income = entries.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
  const expense = entries.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);

  if (income === 0 && expense === 0) {
    container.innerHTML = '<p class="empty-hint">Keine Einträge in diesem Monat.</p>';
    renderSaldoBar(income, expense);
    return;
  }

  const maxValue = Math.max(income, expense);
  const maxHeight = 120;
  const incomeHeight = maxValue > 0 ? Math.max((income / maxValue) * maxHeight, income > 0 ? 3 : 0) : 0;
  const expenseHeight = maxValue > 0 ? Math.max((expense / maxValue) * maxHeight, expense > 0 ? 3 : 0) : 0;

  container.innerHTML = `
    <div class="bar-item">
      <span class="bar-value">${formatCurrency(income)}</span>
      <div class="bar-shape income" style="height:${incomeHeight}px"></div>
      <span class="bar-label">Einnahmen</span>
    </div>
    <div class="bar-item">
      <span class="bar-value">${formatCurrency(expense)}</span>
      <div class="bar-shape expense" style="height:${expenseHeight}px"></div>
      <span class="bar-label">Ausgaben</span>
    </div>`;

  renderSaldoBar(income, expense);
}

function renderSaldoBar(income, expense) {
  const container = document.getElementById('saldo-bar-container');
  const saldo = income - expense;
  const scale = Math.max(income, expense, 1);
  const pct = Math.min((Math.abs(saldo) / scale) * 50, 50);
  const fillClass = saldo >= 0 ? 'positive' : 'negative';
  const valueColor = saldo < 0 ? 'var(--expense)' : 'var(--income)';

  container.innerHTML = `
    <div class="saldo-bar-label-row">
      <span class="saldo-bar-label">Saldo</span>
      <span class="saldo-bar-value" style="color:${valueColor}">${formatCurrency(saldo)}</span>
    </div>
    <div class="saldo-bar-track">
      <div class="saldo-bar-fill ${fillClass}" style="width:${pct}%"></div>
      <div class="saldo-bar-center"></div>
    </div>`;
}

function buildDonutChartHtml(items) {
  const total = items.reduce((s, i) => s + i.value, 0);
  const size = 160, r = 60, sw = 28, cx = size / 2, cy = size / 2;
  const circumference = 2 * Math.PI * r;

  let cumulative = 0;
  const circles = items.map((item, i) => {
    const fraction = item.value / total;
    const segLen = Math.max(fraction * circumference, 0);
    const rotation = -90 + (cumulative / total) * 360;
    cumulative += item.value;
    const color = CHART_COLORS[i % CHART_COLORS.length];
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-dasharray="${segLen} ${circumference - segLen}" transform="rotate(${rotation} ${cx} ${cy})"></circle>`;
  }).join('');

  const svg = `<svg viewBox="0 0 ${size} ${size}" width="180" height="180">${circles}</svg>`;

  const legend = items.map((item, i) => {
    const color = CHART_COLORS[i % CHART_COLORS.length];
    const share = total > 0 ? (item.value / total) * 100 : 0;
    return `
      <div class="legend-item">
        <span class="legend-swatch" style="background:${color}"></span>
        <span class="legend-label">${escapeHtml(item.name)}</span>
        <span class="legend-share">${share.toFixed(1).replace('.', ',')} %</span>
        <span class="legend-value">${formatCurrency(item.value)}</span>
      </div>`;
  }).join('');

  return `${svg}<div class="chart-legend">${legend}</div>`;
}

function buildColumnChartHtml(items) {
  const maxValue = Math.max(...items.map(i => i.value), 1);
  const maxHeight = 120;

  const bars = items.map((item, i) => {
    const color = CHART_COLORS[i % CHART_COLORS.length];
    const height = Math.max((item.value / maxValue) * maxHeight, 3);
    return `
      <div class="column-item">
        <span class="bar-value">${formatCurrency(item.value)}</span>
        <div class="column-shape" style="height:${height}px;background:${color}"></div>
        <span class="column-label">${escapeHtml(item.name)}</span>
      </div>`;
  }).join('');

  return `<div class="column-chart">${bars}</div>`;
}

function renderChart(entries) {
  const container = document.getElementById('chart-container');
  const expenses = entries.filter(e => e.type === 'expense');

  if (expenses.length === 0) {
    container.innerHTML = '<p class="empty-hint">Keine Ausgaben in diesem Monat.</p>';
    return;
  }

  const totals = {};
  expenses.forEach(e => {
    totals[e.category] = (totals[e.category] || 0) + e.amount;
  });

  const items = Object.entries(totals)
    .map(([categoryId, value]) => ({ categoryId, name: getCategoryDisplayName(categoryId), value }))
    .sort((a, b) => b.value - a.value);

  container.innerHTML = buildColumnChartHtml(items);
}

function renderLabelChart(entries) {
  const container = document.getElementById('label-chart-container');
  const labeledExpenses = entries.filter(e => e.type === 'expense' && e.label);

  if (labeledExpenses.length === 0) {
    container.innerHTML = '<p class="empty-hint">Keine Ausgaben mit Label in diesem Monat.</p>';
    return;
  }

  const totals = {};
  labeledExpenses.forEach(e => {
    totals[e.label] = (totals[e.label] || 0) + e.amount;
  });

  const items = Object.entries(totals)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  container.innerHTML = buildDonutChartHtml(items);
}

function getTotalBudgetForCurrentMonth() {
  return data.categoryGroups.reduce((groupSum, group) => {
    return groupSum + group.categories.reduce((catSum, cat) => catSum + getBudget(cat.id, state.year, state.month), 0);
  }, 0);
}

function getIncomeForMonth(year, month) {
  return data.entries
    .filter(e => e.type === 'income')
    .filter(e => {
      const d = new Date(e.date + 'T00:00:00');
      return d.getFullYear() === year && d.getMonth() === month;
    })
    .reduce((s, e) => s + e.amount, 0);
}

function renderBudgetView() {
  const container = document.getElementById('budget-groups');
  const entries = getEntriesForCurrentMonth().filter(e => e.type === 'expense');

  const totalBudgeted = getTotalBudgetForCurrentMonth();
  document.getElementById('budget-total').textContent = formatCurrency(totalBudgeted);

  const prevDate = new Date(state.year, state.month - 1, 1);
  const prevIncome = getIncomeForMonth(prevDate.getFullYear(), prevDate.getMonth());
  const remainingToAssign = prevIncome - totalBudgeted;
  const remainingEl = document.getElementById('budget-remaining-to-assign');
  remainingEl.textContent = formatCurrency(remainingToAssign);
  remainingEl.classList.toggle('negative', remainingToAssign < 0);
  document.getElementById('budget-remaining-to-assign-hint').textContent =
    `Basis: Einnahmen ${monthOnlyFmt.format(prevDate).replace(/^./, c => c.toUpperCase())} (${formatCurrency(prevIncome)})`;

  container.innerHTML = data.categoryGroups.map(group => renderGroupHtml(group, entries)).join('');

  container.querySelectorAll('[data-toggle-group]').forEach(btn => {
    btn.addEventListener('click', () => toggleGroupCollapsed(btn.dataset.toggleGroup));
  });
  container.querySelectorAll('[data-delete-group]').forEach(btn => {
    btn.addEventListener('click', () => deleteGroup(btn.dataset.deleteGroup));
  });
  container.querySelectorAll('[data-delete-cat]').forEach(btn => {
    btn.addEventListener('click', () => deleteCategoryFromGroup(btn.dataset.deleteCat));
  });
  container.querySelectorAll('[data-add-category-to]').forEach(btn => {
    btn.addEventListener('click', () => {
      const groupId = btn.dataset.addCategoryTo;
      const input = container.querySelector(`.new-cat-input[data-group-id="${groupId}"]`);
      addCategoryToGroup(groupId, input.value);
      input.value = '';
    });
  });
  container.querySelectorAll('.new-cat-input').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addCategoryToGroup(input.dataset.groupId, input.value);
        input.value = '';
      }
    });
  });
  container.querySelectorAll('[data-rename-group]').forEach(el => {
    el.addEventListener('click', () => startInlineEdit(el, (newName) => renameGroup(el.dataset.renameGroup, newName)));
  });
  container.querySelectorAll('[data-rename-cat]').forEach(el => {
    el.addEventListener('click', () => startInlineEdit(el, (newName) => renameCategory(el.dataset.renameCat, newName)));
  });
  container.querySelectorAll('[data-edit-budget]').forEach(el => {
    el.addEventListener('click', () => startInlineBudgetEdit(el, el.dataset.editBudget));
  });
  container.querySelectorAll('[data-edit-icon]').forEach(el => {
    el.addEventListener('click', () => openIconPicker(el.dataset.editIcon));
  });
  container.querySelectorAll('[data-transfer-target]').forEach(btn => {
    btn.addEventListener('click', () => openTransferModal(btn.dataset.transferTarget));
  });
}

function renderGroupHtml(group, entries) {
  const rows = group.categories.map(cat => renderCategoryRowHtml(cat, entries)).join('');
  return `
    <div class="budget-group" data-group-id="${group.id}">
      <div class="budget-group-header">
        <button type="button" class="chevron-btn" data-toggle-group="${group.id}" aria-label="Gruppe auf-/zuklappen">${group.collapsed ? '›' : '⌄'}</button>
        <span class="budget-group-name" data-rename-group="${group.id}">${escapeHtml(group.name)}</span>
        <button type="button" class="icon-btn small" data-delete-group="${group.id}" aria-label="Gruppe löschen">✕</button>
      </div>
      <div class="budget-group-body ${group.collapsed ? 'hidden' : ''}">
        ${rows || '<p class="empty-hint">Keine Kategorien in dieser Gruppe.</p>'}
        <div class="budget-add-category">
          <input type="text" class="new-cat-input" data-group-id="${group.id}" placeholder="Neue Kategorie">
          <button type="button" class="btn-secondary" data-add-category-to="${group.id}">+ Kategorie</button>
        </div>
      </div>
    </div>`;
}

function renderCategoryRowHtml(cat, entries) {
  const spent = entries.filter(e => e.category === cat.id).reduce((s, e) => s + e.amount, 0);
  const budget = getBudget(cat.id, state.year, state.month);
  const rollover = getRolloverForMonth(cat.id, state.year, state.month);
  const available = budget + rollover;
  const remaining = available - spent;
  const overspent = remaining < 0;
  const pct = available > 0 ? Math.min(spent / available, 1) * 100 : (spent > 0 ? 100 : 0);
  const remainingPct = available > 0 ? Math.max(remaining / available, 0) * 100 : 0;
  const remainingPctDisplay = available === 0 ? '–' : `${Math.round(remainingPct)} %`;

  const rolloverNote = rollover > 0
    ? `<div class="budget-cat-rollover">+ ${formatCurrency(rollover)} aus Vormonat übertragen</div>`
    : '';

  let remainingLine = '';
  if (available !== 0 || spent !== 0) {
    const label = overspent ? 'Überzogen um' : 'Aktuell verfügbar';
    const color = overspent ? 'var(--expense)' : 'var(--income)';
    remainingLine = `<div class="budget-cat-remaining" style="color:${color}">${label}: ${formatCurrency(Math.abs(remaining))}</div>`;
  }

  const spentLine = spent > 0
    ? `<div class="budget-cat-status">${formatCurrency(spent)} von ${formatCurrency(available)} ausgegeben</div>`
    : '';

  const transferButton = overspent
    ? `<button type="button" class="budget-cat-transfer-btn" data-transfer-target="${cat.id}">Geld umlagern</button>`
    : '';

  const iconDisplay = cat.icon || '+';
  const iconClass = cat.icon ? 'budget-cat-icon' : 'budget-cat-icon empty';

  return `
    <div class="budget-cat-row" data-cat-id="${cat.id}">
      <div class="budget-cat-top">
        <span class="${iconClass}" data-edit-icon="${cat.id}" title="Icon wählen">${iconDisplay}</span>
        <span class="budget-cat-name" data-rename-cat="${cat.id}">${escapeHtml(cat.name)}</span>
        <span class="budget-cat-amount" data-edit-budget="${cat.id}" title="Monatliches Budget bearbeiten">${formatCurrency(budget)}</span>
        <button type="button" class="icon-btn small" data-delete-cat="${cat.id}" aria-label="Kategorie löschen">✕</button>
      </div>
      <div class="budget-bar-row">
        <div class="budget-bar-track">
          <div class="budget-bar-fill ${overspent ? 'overspent' : ''}" style="width:${pct}%"></div>
        </div>
        <span class="budget-bar-percent ${overspent ? 'overspent' : ''}" title="Noch verfügbar in %">${remainingPctDisplay}</span>
      </div>
      ${rolloverNote}
      ${remainingLine}
      ${spentLine}
      ${transferButton}
    </div>`;
}

function rerenderActiveView() {
  if (state.view === 'budget') renderBudgetView();
  else if (state.view === 'accounts') renderAccountsView();
  else if (state.view === 'depot') renderDepotView();
}

function getAllCategoriesFlat() {
  return data.categoryGroups.flatMap(group => group.categories);
}

function openTransferModal(targetCategoryId) {
  const found = findCategory(targetCategoryId);
  if (!found) return;

  const shortfall = Math.max(-getCategoryRemainingForMonth(targetCategoryId, state.year, state.month), 0);

  document.getElementById('transfer-target-info').textContent =
    `Fehlbetrag in ${getCategoryDisplayName(targetCategoryId)}: ${formatCurrency(shortfall)}`;

  const sourceSelect = document.getElementById('transfer-source');
  const otherCats = getAllCategoriesFlat().filter(c => c.id !== targetCategoryId);
  sourceSelect.innerHTML = otherCats.map(c => {
    const catRemaining = getCategoryRemainingForMonth(c.id, state.year, state.month);
    const icon = c.icon ? c.icon + ' ' : '';
    return `<option value="${c.id}">${icon}${escapeHtml(c.name)} (verfügbar: ${formatCurrency(catRemaining)})</option>`;
  }).join('');

  document.getElementById('transfer-form').dataset.target = targetCategoryId;
  document.getElementById('transfer-error').textContent = '';
  updateTransferAmountLimit(shortfall);

  openModal('transfer-modal');
}

function updateTransferAmountLimit(preferredAmount) {
  const sourceCategoryId = document.getElementById('transfer-source').value;
  if (!sourceCategoryId) return;
  const sourceRemaining = Math.max(getCategoryRemainingForMonth(sourceCategoryId, state.year, state.month), 0);

  const amountInput = document.getElementById('transfer-amount');
  amountInput.max = sourceRemaining.toFixed(2);

  const desired = preferredAmount !== undefined ? preferredAmount : parseFloat(amountInput.value) || 0;
  const clamped = Math.min(desired, sourceRemaining);
  amountInput.value = clamped > 0 ? clamped.toFixed(2) : '';

  document.getElementById('transfer-error').textContent = sourceRemaining <= 0
    ? 'Diese Kategorie hat aktuell nichts zum Umlagern verfügbar.'
    : '';
}

function handleTransferSubmit(e) {
  e.preventDefault();
  const targetCategoryId = document.getElementById('transfer-form').dataset.target;
  const sourceCategoryId = document.getElementById('transfer-source').value;
  const amount = parseFloat(document.getElementById('transfer-amount').value);
  const errorEl = document.getElementById('transfer-error');

  if (!amount || amount <= 0 || !sourceCategoryId || sourceCategoryId === targetCategoryId) return;

  const sourceRemaining = getCategoryRemainingForMonth(sourceCategoryId, state.year, state.month);
  if (amount > sourceRemaining + 0.001) {
    errorEl.textContent = `Nur ${formatCurrency(Math.max(sourceRemaining, 0))} von "${getCategoryName(sourceCategoryId)}" verfügbar.`;
    return;
  }

  const sourceName = getCategoryName(sourceCategoryId);
  const targetName = getCategoryName(targetCategoryId);

  mutate(`${formatCurrency(amount)} von "${sourceName}" zu "${targetName}" umgelagert`, () => {
    const sourceBudget = getBudget(sourceCategoryId, state.year, state.month);
    const targetBudget = getBudget(targetCategoryId, state.year, state.month);
    setBudget(sourceCategoryId, state.year, state.month, sourceBudget - amount);
    setBudget(targetCategoryId, state.year, state.month, targetBudget + amount);
  });

  closeModal('transfer-modal');
}

function startInlineEdit(el, onCommit, datalistId) {
  const original = el.textContent;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'inline-edit-input';
  input.value = original;
  if (datalistId) input.setAttribute('list', datalistId);
  el.replaceWith(input);
  input.focus();
  input.select();

  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    const newValue = input.value.trim();
    if (newValue && newValue !== original) {
      onCommit(newValue);
    } else {
      rerenderActiveView();
    }
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { committed = true; rerenderActiveView(); }
  });
}

function startInlineBudgetEdit(el, categoryId) {
  const current = getBudget(categoryId, state.year, state.month);
  const input = document.createElement('input');
  input.type = 'number';
  input.step = '0.01';
  input.min = '0';
  input.className = 'inline-edit-input';
  input.style.width = '90px';
  input.value = current || '';
  el.replaceWith(input);
  input.focus();
  input.select();

  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    const newValue = parseFloat(input.value) || 0;
    if (newValue !== current) {
      const name = getCategoryName(categoryId);
      mutate(`Budget für "${name}" auf ${formatCurrency(newValue)} gesetzt`, () => {
        setBudget(categoryId, state.year, state.month, newValue);
      });
    } else {
      renderBudgetView();
    }
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { committed = true; renderBudgetView(); }
  });
}

function toggleGroupCollapsed(groupId) {
  const group = data.categoryGroups.find(g => g.id === groupId);
  if (!group) return;
  group.collapsed = !group.collapsed;
  saveData();
  renderBudgetView();
}

function deleteGroup(groupId) {
  const group = data.categoryGroups.find(g => g.id === groupId);
  if (!group) return;
  mutate(`Gruppe "${group.name}" gelöscht`, () => {
    data.categoryGroups = data.categoryGroups.filter(g => g.id !== groupId);
  });
}

function deleteCategoryFromGroup(categoryId) {
  const found = findCategory(categoryId);
  if (!found) return;
  mutate(`Kategorie "${found.category.name}" gelöscht`, () => {
    found.group.categories = found.group.categories.filter(c => c.id !== categoryId);
  });
}

function addCategoryToGroup(groupId, name) {
  name = name.trim();
  if (!name) return;
  const group = data.categoryGroups.find(g => g.id === groupId);
  if (!group) return;
  mutate(`Kategorie "${name}" hinzugefügt`, () => {
    group.categories.push({ id: uid(), name });
  });
}

function renameGroup(groupId, newName) {
  const group = data.categoryGroups.find(g => g.id === groupId);
  if (!group) return;
  const oldName = group.name;
  mutate(`Gruppe "${oldName}" umbenannt in "${newName}"`, () => {
    group.name = newName;
  });
}

function renameCategory(categoryId, newName) {
  const found = findCategory(categoryId);
  if (!found) return;
  const oldName = found.category.name;
  mutate(`Kategorie "${oldName}" umbenannt in "${newName}"`, () => {
    found.category.name = newName;
  });
}

function setCategoryIcon(categoryId, icon) {
  const found = findCategory(categoryId);
  if (!found) return;
  mutate(`Icon für "${found.category.name}" geändert`, () => {
    if (icon) found.category.icon = icon;
    else delete found.category.icon;
  });
}

let iconPickerTargetId = null;

function openIconPicker(categoryId) {
  iconPickerTargetId = categoryId;
  const found = findCategory(categoryId);
  const current = found && found.category.icon ? found.category.icon : '';
  const grid = document.getElementById('icon-picker-grid');
  grid.innerHTML = ICON_OPTIONS.map(icon =>
    `<button type="button" class="icon-option ${icon === current ? 'selected' : ''}" data-icon="${icon}">${icon}</button>`
  ).join('');
  grid.querySelectorAll('.icon-option').forEach(btn => {
    btn.addEventListener('click', () => {
      setCategoryIcon(iconPickerTargetId, btn.dataset.icon);
      closeModal('icon-picker-modal');
    });
  });
  openModal('icon-picker-modal');
}

function addNewGroup() {
  const input = document.getElementById('new-group-name');
  const name = input.value.trim();
  if (!name) return;
  mutate(`Gruppe "${name}" hinzugefügt`, () => {
    data.categoryGroups.push({ id: uid(), name, collapsed: false, categories: [] });
  });
  input.value = '';
}

function renderAccountsView() {
  const total = data.accounts.reduce((s, a) => s + getAccountCurrentBalance(a.id), 0);
  const totalEl = document.getElementById('accounts-total');
  totalEl.textContent = formatCurrency(total);
  totalEl.style.color = total < 0 ? 'var(--expense)' : 'var(--accent)';

  const container = document.getElementById('accounts-list');
  if (data.accounts.length === 0) {
    container.innerHTML = '<p class="empty-hint">Noch keine Konten angelegt.</p>';
    return;
  }

  container.innerHTML = data.accounts.map(a => {
    const current = getAccountCurrentBalance(a.id);
    return `
    <div class="account-row" data-account-id="${a.id}">
      <div class="account-info">
        <span class="account-name" data-rename-account="${a.id}">${escapeHtml(a.name)}</span>
        <span class="account-type-badge" data-edit-type="${a.id}">${escapeHtml(a.type || 'Kein Typ')}</span>
        <span class="account-start-balance" data-edit-balance="${a.id}" title="Startguthaben bearbeiten">Start: ${formatCurrency(a.balance)}</span>
      </div>
      <span class="account-balance ${current < 0 ? 'negative' : ''}">${formatCurrency(current)}</span>
      <button type="button" class="icon-btn small" data-delete-account="${a.id}" aria-label="Konto löschen" ${data.accounts.length === 1 ? 'disabled' : ''}>✕</button>
    </div>`;
  }).join('');

  container.querySelectorAll('[data-rename-account]').forEach(el => {
    el.addEventListener('click', () => startInlineEdit(el, (newName) => renameAccount(el.dataset.renameAccount, newName)));
  });
  container.querySelectorAll('[data-edit-type]').forEach(el => {
    el.addEventListener('click', () => startInlineEdit(el, (newType) => changeAccountType(el.dataset.editType, newType), 'account-type-options'));
  });
  container.querySelectorAll('[data-edit-balance]').forEach(el => {
    el.addEventListener('click', () => startInlineBalanceEdit(el, el.dataset.editBalance));
  });
  container.querySelectorAll('[data-delete-account]').forEach(btn => {
    btn.addEventListener('click', () => deleteAccount(btn.dataset.deleteAccount));
  });
}

function startInlineBalanceEdit(el, accountId) {
  const account = findAccount(accountId);
  if (!account) return;
  const current = account.balance;
  const input = document.createElement('input');
  input.type = 'number';
  input.step = '0.01';
  input.className = 'inline-edit-input';
  input.style.width = '110px';
  input.value = current;
  el.replaceWith(input);
  input.focus();
  input.select();

  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    const newValue = parseFloat(input.value);
    if (!isNaN(newValue) && newValue !== current) {
      mutate(`Startguthaben "${account.name}" auf ${formatCurrency(newValue)} gesetzt`, () => {
        account.balance = newValue;
      });
    } else {
      renderAccountsView();
    }
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
    if (ev.key === 'Escape') { committed = true; renderAccountsView(); }
  });
}

function renameAccount(accountId, newName) {
  const account = findAccount(accountId);
  if (!account) return;
  const oldName = account.name;
  mutate(`Konto "${oldName}" umbenannt in "${newName}"`, () => {
    account.name = newName;
  });
}

function changeAccountType(accountId, newType) {
  const account = findAccount(accountId);
  if (!account) return;
  mutate(`Kontotyp von "${account.name}" auf "${newType}" gesetzt`, () => {
    account.type = newType;
  });
}

function deleteAccount(accountId) {
  if (data.accounts.length <= 1) return;
  const account = findAccount(accountId);
  if (!account) return;
  mutate(`Konto "${account.name}" gelöscht`, () => {
    data.accounts = data.accounts.filter(a => a.id !== accountId);
  });
}

function addNewAccount() {
  const nameInput = document.getElementById('new-account-name');
  const typeInput = document.getElementById('new-account-type');
  const balanceInput = document.getElementById('new-account-balance');
  const name = nameInput.value.trim();
  const type = typeInput.value.trim();
  const balance = parseFloat(balanceInput.value) || 0;
  if (!name) return;

  mutate(`Konto "${name}" hinzugefügt`, () => {
    data.accounts.push({ id: uid(), name, type: type || 'Sonstiges', balance });
  });

  nameInput.value = '';
  typeInput.value = '';
  balanceInput.value = '';
}

function findDepot(depotId) {
  return data.depots.find(d => d.id === depotId) || null;
}

function findHolding(holdingId) {
  for (const depot of data.depots) {
    const holding = depot.holdings.find(h => h.id === holdingId);
    if (holding) return { depot, holding };
  }
  return null;
}

function getHoldingTotalQuantity(holding) {
  return holding.purchases.reduce((s, p) => s + p.quantity, 0);
}

function getHoldingCostBasisCHF(holding) {
  return holding.purchases.reduce((s, p) => s + p.amount * (p.exchangeRate || 1), 0);
}

function renderDepotView() {
  let totalInvested = 0;
  let totalValue = 0;
  data.depots.forEach(depot => {
    depot.holdings.forEach(h => {
      totalInvested += getHoldingCostBasisCHF(h);
      totalValue += (h.currentValue || 0);
    });
  });
  const totalGain = totalValue - totalInvested;
  const totalGainPct = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;

  document.getElementById('depot-invested-total').textContent = formatCurrency(totalInvested);
  document.getElementById('depot-value-total').textContent = formatCurrency(totalValue);
  const gainEl = document.getElementById('depot-gain-total');
  const sign = totalGain >= 0 ? '+' : '';
  gainEl.textContent = `${formatCurrency(totalGain)} (${sign}${totalGainPct.toFixed(1).replace('.', ',')} %)`;
  gainEl.className = `summary-value ${totalGain < 0 ? 'negative' : 'positive'}`;

  const container = document.getElementById('depots-list');
  if (data.depots.length === 0) {
    container.innerHTML = '<p class="empty-hint">Noch keine Depots angelegt.</p>';
  } else {
    container.innerHTML = data.depots.map(renderDepotHtml).join('');
  }

  container.querySelectorAll('[data-rename-depot]').forEach(el => {
    el.addEventListener('click', () => startInlineEdit(el, (newName) => renameDepot(el.dataset.renameDepot, newName)));
  });
  container.querySelectorAll('[data-delete-depot]').forEach(btn => {
    btn.addEventListener('click', () => deleteDepot(btn.dataset.deleteDepot));
  });
  container.querySelectorAll('[data-add-holding-to]').forEach(btn => {
    btn.addEventListener('click', () => {
      const depotId = btn.dataset.addHoldingTo;
      const nameInput = container.querySelector(`.new-holding-name[data-depot-id="${depotId}"]`);
      const typeSelect = container.querySelector(`.new-holding-type[data-depot-id="${depotId}"]`);
      addHoldingToDepot(depotId, nameInput.value, typeSelect.value);
      nameInput.value = '';
    });
  });
  container.querySelectorAll('.new-holding-name').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const depotId = input.dataset.depotId;
        const typeSelect = container.querySelector(`.new-holding-type[data-depot-id="${depotId}"]`);
        addHoldingToDepot(depotId, input.value, typeSelect.value);
        input.value = '';
      }
    });
  });
  container.querySelectorAll('[data-rename-holding]').forEach(el => {
    el.addEventListener('click', () => startInlineEdit(el, (newName) => renameHolding(el.dataset.renameHolding, newName)));
  });
  container.querySelectorAll('[data-delete-holding]').forEach(btn => {
    btn.addEventListener('click', () => deleteHolding(btn.dataset.deleteHolding));
  });
  container.querySelectorAll('[data-toggle-holding]').forEach(btn => {
    btn.addEventListener('click', () => toggleHoldingExpanded(btn.dataset.toggleHolding));
  });
  container.querySelectorAll('[data-edit-current-value]').forEach(el => {
    el.addEventListener('click', () => openCurrentValueModal(el.dataset.editCurrentValue));
  });
  container.querySelectorAll('[data-add-purchase]').forEach(btn => {
    btn.addEventListener('click', () => openPurchaseModal(btn.dataset.addPurchase, null));
  });
  container.querySelectorAll('[data-edit-purchase]').forEach(row => {
    row.addEventListener('click', () => openPurchaseModal(row.dataset.holdingId, row.dataset.editPurchase));
  });
}

function renderDepotHtml(depot) {
  const holdingsHtml = depot.holdings.map(h => renderHoldingHtml(depot, h)).join('');
  return `
    <div class="depot-card" data-depot-id="${depot.id}">
      <div class="depot-header">
        <span class="depot-name" data-rename-depot="${depot.id}">${escapeHtml(depot.name)}</span>
        <button type="button" class="icon-btn small" data-delete-depot="${depot.id}" aria-label="Depot löschen">✕</button>
      </div>
      <div class="depot-holdings">
        ${holdingsHtml || '<p class="empty-hint">Keine Positionen in diesem Depot.</p>'}
      </div>
      <div class="depot-add-holding">
        <input type="text" class="new-holding-name" data-depot-id="${depot.id}" placeholder="Name (z. B. Apple, Bitcoin)">
        <select class="new-holding-type" data-depot-id="${depot.id}">
          <option value="Aktie">Aktie</option>
          <option value="Krypto">Krypto</option>
          <option value="Fonds">Fonds</option>
          <option value="Sonstiges">Sonstiges</option>
        </select>
        <button type="button" class="btn-secondary" data-add-holding-to="${depot.id}">+ Position</button>
      </div>
    </div>`;
}

function renderHoldingHtml(depot, holding) {
  const qty = getHoldingTotalQuantity(holding);
  const invested = getHoldingCostBasisCHF(holding);
  const value = holding.currentValue || 0;
  const gain = value - invested;
  const gainPct = invested > 0 ? (gain / invested) * 100 : 0;
  const gainSign = gain >= 0 ? '+' : '';

  const purchasesHtml = holding.purchases.length
    ? holding.purchases.slice().sort((a, b) => b.date.localeCompare(a.date)).map(p => renderPurchaseRowHtml(holding, p)).join('')
    : '<p class="empty-hint">Noch keine Käufe erfasst.</p>';

  return `
    <div class="holding-card" data-holding-id="${holding.id}">
      <div class="holding-top">
        <span class="holding-type-badge">${escapeHtml(holding.type)}</span>
        <span class="holding-name" data-rename-holding="${holding.id}">${escapeHtml(holding.name)}</span>
        <button type="button" class="icon-btn small" data-toggle-holding="${holding.id}" aria-label="Käufe anzeigen">${holding.expanded ? '⌄' : '›'}</button>
        <button type="button" class="icon-btn small" data-delete-holding="${holding.id}" aria-label="Position löschen">✕</button>
      </div>
      <div class="holding-stats">
        <div class="holding-stat">
          <span class="holding-stat-label">Anzahl</span>
          <span class="holding-stat-value">${formatQuantity(qty)}</span>
        </div>
        <div class="holding-stat">
          <span class="holding-stat-label">Investiert</span>
          <span class="holding-stat-value">${formatCurrency(invested)}</span>
        </div>
        <div class="holding-stat editable" data-edit-current-value="${holding.id}" title="Aktuellen Wert bearbeiten">
          <span class="holding-stat-label">Akt. Wert</span>
          <span class="holding-stat-value">${holding.currentValue != null ? formatCurrency(value) : 'setzen'}</span>
        </div>
        <div class="holding-stat">
          <span class="holding-stat-label">Gewinn/Verlust</span>
          <span class="holding-stat-value ${gain < 0 ? 'negative' : 'positive'}">${formatCurrency(gain)} (${gainSign}${gainPct.toFixed(1).replace('.', ',')} %)</span>
        </div>
      </div>
      <div class="holding-purchases ${holding.expanded ? '' : 'hidden'}">
        ${purchasesHtml}
        <button type="button" class="btn-secondary" data-add-purchase="${holding.id}">+ Kauf</button>
      </div>
    </div>`;
}

function renderPurchaseRowHtml(holding, purchase) {
  const chfAmount = purchase.amount * (purchase.exchangeRate || 1);
  const d = new Date(purchase.date + 'T00:00:00');
  const dateStr = dateFmt.format(d);
  const currencyNote = purchase.currency !== 'CHF' ? ` · ${escapeHtml(purchase.currency)} @ ${purchase.exchangeRate}` : '';
  return `
    <div class="purchase-row" data-holding-id="${holding.id}" data-edit-purchase="${purchase.id}">
      <span class="purchase-row-main">${dateStr} · ${formatQuantity(purchase.quantity)} Stk.${currencyNote}</span>
      <span class="purchase-row-amount">${formatCurrency(chfAmount)}</span>
    </div>`;
}

function addNewDepot() {
  const input = document.getElementById('new-depot-name');
  const name = input.value.trim();
  if (!name) return;
  mutate(`Depot "${name}" hinzugefügt`, () => {
    data.depots.push({ id: uid(), name, holdings: [] });
  });
  input.value = '';
}

function renameDepot(depotId, newName) {
  const depot = findDepot(depotId);
  if (!depot) return;
  const oldName = depot.name;
  mutate(`Depot "${oldName}" umbenannt in "${newName}"`, () => {
    depot.name = newName;
  });
}

function deleteDepot(depotId) {
  const depot = findDepot(depotId);
  if (!depot) return;
  mutate(`Depot "${depot.name}" gelöscht`, () => {
    data.depots = data.depots.filter(d => d.id !== depotId);
  });
}

function addHoldingToDepot(depotId, name, type) {
  name = name.trim();
  if (!name) return;
  const depot = findDepot(depotId);
  if (!depot) return;
  mutate(`Position "${name}" zu Depot "${depot.name}" hinzugefügt`, () => {
    depot.holdings.push({ id: uid(), name, type: type || 'Sonstiges', currentValue: null, expanded: true, purchases: [] });
  });
}

function renameHolding(holdingId, newName) {
  const found = findHolding(holdingId);
  if (!found) return;
  const oldName = found.holding.name;
  mutate(`Position "${oldName}" umbenannt in "${newName}"`, () => {
    found.holding.name = newName;
  });
}

function deleteHolding(holdingId) {
  const found = findHolding(holdingId);
  if (!found) return;
  mutate(`Position "${found.holding.name}" gelöscht`, () => {
    found.depot.holdings = found.depot.holdings.filter(h => h.id !== holdingId);
  });
}

function toggleHoldingExpanded(holdingId) {
  const found = findHolding(holdingId);
  if (!found) return;
  found.holding.expanded = !found.holding.expanded;
  saveData();
  renderDepotView();
}

function openPurchaseModal(holdingId, purchaseId) {
  const found = findHolding(holdingId);
  if (!found) return;
  const form = document.getElementById('purchase-form');
  form.dataset.holdingId = holdingId;
  form.dataset.purchaseId = purchaseId || '';
  const deleteBtn = document.getElementById('btn-delete-purchase');

  if (purchaseId) {
    const purchase = found.holding.purchases.find(p => p.id === purchaseId);
    if (!purchase) return;
    document.getElementById('purchase-modal-title').textContent = 'Kauf bearbeiten';
    document.getElementById('purchase-date').value = purchase.date;
    document.getElementById('purchase-quantity').value = purchase.quantity;
    document.getElementById('purchase-amount').value = purchase.amount;
    document.getElementById('purchase-currency').value = purchase.currency;
    document.getElementById('purchase-exchange-rate').value = purchase.exchangeRate;
    deleteBtn.classList.remove('hidden');
  } else {
    document.getElementById('purchase-modal-title').textContent = 'Kauf hinzufügen';
    document.getElementById('purchase-date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('purchase-quantity').value = '';
    document.getElementById('purchase-amount').value = '';
    document.getElementById('purchase-currency').value = 'CHF';
    document.getElementById('purchase-exchange-rate').value = 1;
    deleteBtn.classList.add('hidden');
  }

  openModal('purchase-modal');
}

function handlePurchaseSubmit(e) {
  e.preventDefault();
  const form = document.getElementById('purchase-form');
  const holdingId = form.dataset.holdingId;
  const purchaseId = form.dataset.purchaseId;
  const found = findHolding(holdingId);
  if (!found) return;

  const date = document.getElementById('purchase-date').value;
  const quantity = parseFloat(document.getElementById('purchase-quantity').value);
  const amount = parseFloat(document.getElementById('purchase-amount').value);
  const currency = document.getElementById('purchase-currency').value.trim().toUpperCase() || 'CHF';
  const exchangeRate = parseFloat(document.getElementById('purchase-exchange-rate').value) || 1;

  if (!date || !quantity || quantity <= 0 || !amount || amount <= 0) return;

  const holdingName = found.holding.name;

  if (purchaseId) {
    mutate(`Kauf bei "${holdingName}" bearbeitet`, () => {
      const purchase = found.holding.purchases.find(p => p.id === purchaseId);
      Object.assign(purchase, { date, quantity, amount, currency, exchangeRate });
    });
  } else {
    mutate(`Kauf bei "${holdingName}" hinzugefügt (${formatQuantity(quantity)} Stk.)`, () => {
      found.holding.purchases.push({ id: uid(), date, quantity, amount, currency, exchangeRate });
    });
  }

  closeModal('purchase-modal');
}

function deleteCurrentPurchase() {
  const form = document.getElementById('purchase-form');
  const holdingId = form.dataset.holdingId;
  const purchaseId = form.dataset.purchaseId;
  if (!purchaseId) return;
  const found = findHolding(holdingId);
  if (!found) return;

  mutate(`Kauf bei "${found.holding.name}" gelöscht`, () => {
    found.holding.purchases = found.holding.purchases.filter(p => p.id !== purchaseId);
  });
  closeModal('purchase-modal');
}

function openCurrentValueModal(holdingId) {
  const found = findHolding(holdingId);
  if (!found) return;
  document.getElementById('current-value-form').dataset.holdingId = holdingId;
  document.getElementById('current-value-input').value = found.holding.currentValue != null ? found.holding.currentValue : '';
  openModal('current-value-modal');
}

function handleCurrentValueSubmit(e) {
  e.preventDefault();
  const holdingId = document.getElementById('current-value-form').dataset.holdingId;
  const found = findHolding(holdingId);
  if (!found) return;
  const value = parseFloat(document.getElementById('current-value-input').value);
  if (isNaN(value) || value < 0) return;

  mutate(`Aktueller Wert von "${found.holding.name}" auf ${formatCurrency(value)} gesetzt`, () => {
    found.holding.currentValue = value;
  });
  closeModal('current-value-modal');
}

function renderReportView() {
  document.getElementById('current-year').textContent = String(state.reportYear);

  const monthly = Array.from({ length: 12 }, (_, month) => {
    const entries = data.entries.filter(e => {
      const d = new Date(e.date + 'T00:00:00');
      return d.getFullYear() === state.reportYear && d.getMonth() === month;
    });
    const income = entries.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
    const expense = entries.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
    return { month, income, expense, balance: income - expense };
  });

  const body = document.getElementById('report-table-body');
  body.innerHTML = monthly.map(m => {
    const label = monthOnlyFmt.format(new Date(state.reportYear, m.month, 1));
    const isEmpty = m.income === 0 && m.expense === 0;
    return `
      <tr${isEmpty ? ' class="report-empty-month"' : ''}>
        <td>${label.charAt(0).toUpperCase() + label.slice(1)}</td>
        <td class="col-income">${formatCurrency(m.income)}</td>
        <td class="col-expense">${formatCurrency(m.expense)}</td>
        <td style="color:${m.balance < 0 ? 'var(--expense)' : 'var(--income)'}">${formatCurrency(m.balance)}</td>
      </tr>`;
  }).join('');

  const totalIncome = monthly.reduce((s, m) => s + m.income, 0);
  const totalExpense = monthly.reduce((s, m) => s + m.expense, 0);
  const totalBalance = totalIncome - totalExpense;

  const foot = document.getElementById('report-table-foot');
  foot.innerHTML = `
    <tr>
      <td>Total ${state.reportYear}</td>
      <td class="col-income">${formatCurrency(totalIncome)}</td>
      <td class="col-expense">${formatCurrency(totalExpense)}</td>
      <td style="color:${totalBalance < 0 ? 'var(--expense)' : 'var(--income)'}">${formatCurrency(totalBalance)}</td>
    </tr>`;

  renderReportCategoryTable();
}

function populateReportCategoryMonthSelect() {
  const select = document.getElementById('report-category-month-select');
  if (select.dataset.populated) return;
  const options = ['<option value="all">Ganzes Jahr</option>'];
  for (let m = 0; m < 12; m++) {
    const label = monthOnlyFmt.format(new Date(2000, m, 1));
    options.push(`<option value="${m}">${label.charAt(0).toUpperCase() + label.slice(1)}</option>`);
  }
  select.innerHTML = options.join('');
  select.dataset.populated = 'true';
}

function renderReportCategoryTable() {
  populateReportCategoryMonthSelect();
  const select = document.getElementById('report-category-month-select');
  const monthFilter = select.value;

  const filteredExpenses = data.entries.filter(e => {
    if (e.type !== 'expense') return false;
    const d = new Date(e.date + 'T00:00:00');
    if (d.getFullYear() !== state.reportYear) return false;
    if (monthFilter !== 'all' && d.getMonth() !== parseInt(monthFilter, 10)) return false;
    return true;
  });

  const totals = {};
  filteredExpenses.forEach(e => {
    totals[e.category] = (totals[e.category] || 0) + e.amount;
  });

  const items = Object.entries(totals)
    .map(([categoryId, value]) => ({ name: getCategoryDisplayName(categoryId), value }))
    .sort((a, b) => b.value - a.value);

  const totalExpense = items.reduce((s, i) => s + i.value, 0);

  const body = document.getElementById('report-category-body');
  const foot = document.getElementById('report-category-foot');

  const periodLabel = monthFilter === 'all'
    ? String(state.reportYear)
    : `${monthOnlyFmt.format(new Date(state.reportYear, parseInt(monthFilter, 10), 1)).replace(/^./, c => c.toUpperCase())} ${state.reportYear}`;

  if (items.length === 0) {
    body.innerHTML = '<tr class="report-empty-month"><td colspan="3">Keine Ausgaben in diesem Zeitraum.</td></tr>';
    foot.innerHTML = '';
    return;
  }

  body.innerHTML = items.map(item => {
    const share = totalExpense > 0 ? (item.value / totalExpense) * 100 : 0;
    return `
      <tr>
        <td>${escapeHtml(item.name)}</td>
        <td class="col-expense">${formatCurrency(item.value)}</td>
        <td>${share.toFixed(1).replace('.', ',')} %</td>
      </tr>`;
  }).join('');

  foot.innerHTML = `
    <tr>
      <td>Total ${periodLabel}</td>
      <td class="col-expense">${formatCurrency(totalExpense)}</td>
      <td>100,0 %</td>
    </tr>`;
}

function render() {
  renderMonthLabel();
  const entries = getEntriesForCurrentMonth();
  renderSummary(entries);
  renderEntries(getFilteredEntries(entries));
  renderAccountBalancesPanel();
  renderBarChart(entries);
  renderChart(entries);
  renderLabelChart(entries);
  if (state.view === 'budget') renderBudgetView();
  if (state.view === 'accounts') renderAccountsView();
  if (state.view === 'report') renderReportView();
  if (state.view === 'depot') renderDepotView();
}

function setView(view) {
  state.view = view;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  document.querySelector('.content').classList.toggle('hidden', view !== 'overview');
  document.getElementById('capture-view').classList.toggle('hidden', view !== 'capture');
  document.getElementById('budget-view').classList.toggle('hidden', view !== 'budget');
  document.getElementById('accounts-view').classList.toggle('hidden', view !== 'accounts');
  document.getElementById('depot-view').classList.toggle('hidden', view !== 'depot');
  document.getElementById('report-view').classList.toggle('hidden', view !== 'report');
  document.querySelector('.month-nav').classList.toggle('hidden', view === 'report');
  document.querySelector('.summary').classList.toggle('hidden', view === 'report');
  if (view === 'budget') renderBudgetView();
  if (view === 'accounts') renderAccountsView();
  if (view === 'report') renderReportView();
  if (view === 'depot') renderDepotView();
  if (view === 'capture') { populateEntryFilters(); renderEntries(getFilteredEntries(getEntriesForCurrentMonth())); }
}

function populateCategorySelect(type) {
  const select = document.getElementById('entry-category');
  if (type === 'expense') {
    select.innerHTML = data.categoryGroups.map(group => {
      const options = group.categories.map(c => `<option value="${c.id}">${c.icon ? c.icon + ' ' : ''}${escapeHtml(c.name)}</option>`).join('');
      return `<optgroup label="${escapeHtml(group.name)}">${options}</optgroup>`;
    }).join('');
  } else {
    select.innerHTML = data.incomeCategories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  }
}

function populateAccountSelect() {
  const select = document.getElementById('entry-account');
  select.innerHTML = data.accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');
}

function getAllLabels() {
  const labels = new Set(data.entries.map(e => e.label).filter(Boolean));
  return Array.from(labels).sort((a, b) => a.localeCompare(b, 'de'));
}

function populateLabelOptions() {
  const datalist = document.getElementById('label-options');
  datalist.innerHTML = getAllLabels().map(l => `<option value="${escapeHtml(l)}">`).join('');
}

function setEntryType(type) {
  state.currentType = type;
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });
  populateCategorySelect(type);
}

function openEntryModal(entryId) {
  const form = document.getElementById('entry-form');
  form.reset();
  const deleteBtn = document.getElementById('btn-delete-entry');
  populateAccountSelect();
  populateLabelOptions();

  const recurringRow = document.getElementById('entry-recurring-row');
  const recurringHint = document.getElementById('entry-recurring-hint');
  document.getElementById('entry-recurring').checked = false;

  if (entryId) {
    const entry = data.entries.find(e => e.id === entryId);
    if (!entry) return;
    document.getElementById('entry-modal-title').textContent = 'Eintrag bearbeiten';
    document.getElementById('entry-id').value = entry.id;
    setEntryType(entry.type);
    document.getElementById('entry-amount').value = entry.amount;
    document.getElementById('entry-category').value = entry.category;
    document.getElementById('entry-account').value = entry.account || '';
    document.getElementById('entry-date').value = entry.date;
    document.getElementById('entry-label').value = entry.label || '';
    document.getElementById('entry-note').value = entry.note || '';
    deleteBtn.classList.remove('hidden');
    recurringRow.classList.add('hidden');
    recurringHint.classList.toggle('hidden', !entry.recurringId);
  } else {
    document.getElementById('entry-modal-title').textContent = 'Eintrag hinzufügen';
    document.getElementById('entry-id').value = '';
    setEntryType('expense');
    const d = new Date(state.year, state.month, Math.min(today.getDate(), new Date(state.year, state.month + 1, 0).getDate()));
    document.getElementById('entry-date').value = d.toISOString().slice(0, 10);
    deleteBtn.classList.add('hidden');
    recurringRow.classList.remove('hidden');
    recurringHint.classList.add('hidden');
  }

  openModal('entry-modal');
}

function handleEntryFormSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('entry-id').value;
  const amount = parseFloat(document.getElementById('entry-amount').value);
  const category = document.getElementById('entry-category').value;
  const account = document.getElementById('entry-account').value;
  const date = document.getElementById('entry-date').value;
  const label = document.getElementById('entry-label').value.trim();
  const note = document.getElementById('entry-note').value.trim();

  if (!amount || amount <= 0 || !category || !account || !date) return;

  const typeLabel = state.currentType === 'income' ? 'Einnahme' : 'Ausgabe';
  const catLabel = state.currentType === 'expense' ? getCategoryName(category) : category;
  const isRecurring = !id && document.getElementById('entry-recurring').checked;

  if (id) {
    mutate(`${typeLabel} "${catLabel}" bearbeitet (${formatCurrency(amount)})`, () => {
      const entry = data.entries.find(x => x.id === id);
      Object.assign(entry, { type: state.currentType, amount, category, account, date, label, note });
    });
  } else if (isRecurring) {
    mutate(`Wiederkehrende ${typeLabel} "${catLabel}" angelegt (${formatCurrency(amount)}, monatlich)`, () => {
      const recurringId = uid();
      const day = new Date(date + 'T00:00:00').getDate();
      data.recurring.push({
        id: recurringId, type: state.currentType, amount, category, account, label, note,
        dayOfMonth: day, startMonth: date.slice(0, 7), active: true
      });
      data.entries.push({ id: uid(), type: state.currentType, amount, category, account, date, label, note, recurringId });
    });
  } else {
    mutate(`${typeLabel} "${catLabel}" hinzugefügt (${formatCurrency(amount)})`, () => {
      data.entries.push({ id: uid(), type: state.currentType, amount, category, account, date, label, note });
    });
  }

  closeModal('entry-modal');
}

function deleteCurrentEntry() {
  const id = document.getElementById('entry-id').value;
  if (!id) return;
  const entry = data.entries.find(e => e.id === id);
  if (!entry) return;
  const typeLabel = entry.type === 'income' ? 'Einnahme' : 'Ausgabe';
  const catLabel = getEntryCategoryLabel(entry);
  mutate(`${typeLabel} "${catLabel}" gelöscht (${formatCurrency(entry.amount)})`, () => {
    data.entries = data.entries.filter(e => e.id !== id);
  });
  closeModal('entry-modal');
}

function renderSettings() {
  const list = document.getElementById('category-list-income');
  list.innerHTML = data.incomeCategories.map(cat => `
    <li>
      <span>${escapeHtml(cat)}</span>
      <button type="button" data-remove-income-category="${escapeHtml(cat)}" aria-label="Kategorie löschen">✕</button>
    </li>`).join('');

  list.querySelectorAll('[data-remove-income-category]').forEach(btn => {
    btn.addEventListener('click', () => removeIncomeCategory(btn.dataset.removeIncomeCategory));
  });
}

function addIncomeCategory(name) {
  name = name.trim();
  if (!name) return;
  if (data.incomeCategories.includes(name)) return;
  mutate(`Kategorie "${name}" hinzugefügt`, () => {
    data.incomeCategories.push(name);
  });
  renderSettings();
}

function removeIncomeCategory(name) {
  mutate(`Kategorie "${name}" gelöscht`, () => {
    data.incomeCategories = data.incomeCategories.filter(c => c !== name);
  });
  renderSettings();
}

function renderRecentMoves() {
  const list = document.getElementById('recent-moves-list');
  const moves = data.recentMoves || [];
  if (moves.length === 0) {
    list.innerHTML = '<p class="empty-hint">Keine Änderungen bisher.</p>';
    return;
  }
  list.innerHTML = moves.map(m => `
    <li>
      <span class="move-desc">${escapeHtml(m.description)}</span>
      <span class="move-time">${timeFmt.format(new Date(m.time))}</span>
    </li>`).join('');
}

function getRecurringLabel(r) {
  const catLabel = r.type === 'expense' ? getCategoryDisplayName(r.category) : r.category;
  return catLabel;
}

function renderRecurringList() {
  const container = document.getElementById('recurring-list');
  const items = data.recurring || [];
  if (items.length === 0) {
    container.innerHTML = '<p class="empty-hint">Noch keine wiederkehrenden Buchungen angelegt.</p>';
    return;
  }

  container.innerHTML = items.map(r => {
    const sign = r.type === 'income' ? '+' : '−';
    const accountName = getAccountName(r.account);
    return `
      <div class="recurring-item ${r.active ? '' : 'paused'}" data-id="${r.id}">
        <div class="recurring-info">
          <span class="recurring-name">${escapeHtml(getRecurringLabel(r))}</span>
          <span class="recurring-meta">Jeden ${r.dayOfMonth}. · ${escapeHtml(accountName)}${r.active ? '' : ' · pausiert'}</span>
        </div>
        <span class="recurring-amount ${r.type}">${sign} ${formatCurrency(r.amount)}</span>
        <div class="recurring-actions">
          <button type="button" class="icon-btn small" data-toggle-recurring="${r.id}" title="${r.active ? 'Pausieren' : 'Fortsetzen'}">${r.active ? '⏸' : '▶'}</button>
          <button type="button" class="icon-btn small" data-delete-recurring="${r.id}" aria-label="Löschen">✕</button>
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('[data-toggle-recurring]').forEach(btn => {
    btn.addEventListener('click', () => toggleRecurringActive(btn.dataset.toggleRecurring));
  });
  container.querySelectorAll('[data-delete-recurring]').forEach(btn => {
    btn.addEventListener('click', () => deleteRecurringTemplate(btn.dataset.deleteRecurring));
  });
}

function toggleRecurringActive(id) {
  const r = data.recurring.find(x => x.id === id);
  if (!r) return;
  mutate(`Wiederkehrende Buchung "${getRecurringLabel(r)}" ${r.active ? 'pausiert' : 'fortgesetzt'}`, () => {
    r.active = !r.active;
  });
  renderRecurringList();
}

function deleteRecurringTemplate(id) {
  const r = data.recurring.find(x => x.id === id);
  if (!r) return;
  mutate(`Wiederkehrende Buchung "${getRecurringLabel(r)}" gelöscht`, () => {
    data.recurring = data.recurring.filter(x => x.id !== id);
  });
  renderRecurringList();
}

function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function exportData() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `budget-app-daten-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function isValidImportedData(obj) {
  return obj && Array.isArray(obj.categoryGroups) && Array.isArray(obj.entries) && Array.isArray(obj.incomeCategories);
}

function handleImportFile(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    let imported;
    try {
      imported = JSON.parse(reader.result);
    } catch (err) {
      alert('Die Datei konnte nicht gelesen werden. Ist es eine gültige Budget-App-Exportdatei?');
      return;
    }
    if (!isValidImportedData(imported)) {
      alert('Diese Datei enthält keine gültigen Budget-App-Daten.');
      return;
    }
    if (!confirm('Der Import ersetzt alle aktuellen Daten in dieser App durch den Inhalt der Datei. Fortfahren?')) return;

    imported.budgets = imported.budgets || {};
    imported.recentMoves = imported.recentMoves || [];
    ensureAccounts(imported);

    mutate('Daten importiert', () => {
      data = imported;
    });
  };
  reader.readAsText(file);
}

function init() {
  document.getElementById('btn-prev-month').addEventListener('click', () => {
    state.month--;
    if (state.month < 0) { state.month = 11; state.year--; }
    carryForwardBudgets();
    generateRecurringEntriesForMonth(state.year, state.month);
    render();
  });

  document.getElementById('btn-next-month').addEventListener('click', () => {
    state.month++;
    if (state.month > 11) { state.month = 0; state.year++; }
    carryForwardBudgets();
    generateRecurringEntriesForMonth(state.year, state.month);
    render();
  });

  document.getElementById('btn-prev-year').addEventListener('click', () => {
    state.reportYear--;
    renderReportView();
  });

  document.getElementById('btn-next-year').addEventListener('click', () => {
    state.reportYear++;
    renderReportView();
  });

  document.getElementById('report-category-month-select').addEventListener('change', () => {
    renderReportCategoryTable();
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });

  document.getElementById('btn-add-entry').addEventListener('click', () => openEntryModal(null));

  ['filter-date-from', 'filter-date-to', 'filter-category', 'filter-account', 'filter-label'].forEach(id => {
    document.getElementById(id).addEventListener('change', readEntryFiltersFromInputs);
  });
  document.getElementById('btn-clear-filters').addEventListener('click', clearEntryFilters);

  document.getElementById('btn-settings').addEventListener('click', () => {
    renderSettings();
    openModal('settings-modal');
  });

  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);
  document.getElementById('btn-recent-moves').addEventListener('click', () => {
    renderRecentMoves();
    openModal('recent-moves-modal');
  });

  document.getElementById('btn-recurring').addEventListener('click', () => {
    renderRecurringList();
    openModal('recurring-modal');
  });

  document.getElementById('btn-clear-icon').addEventListener('click', () => {
    if (iconPickerTargetId) setCategoryIcon(iconPickerTargetId, '');
    closeModal('icon-picker-modal');
  });

  document.getElementById('btn-export').addEventListener('click', exportData);
  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('import-file-input').click();
  });
  document.getElementById('import-file-input').addEventListener('change', handleImportFile);

  document.getElementById('btn-add-group').addEventListener('click', addNewGroup);
  document.getElementById('new-group-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addNewGroup(); }
  });

  document.getElementById('btn-add-account').addEventListener('click', addNewAccount);
  document.getElementById('new-account-balance').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addNewAccount(); }
  });

  document.getElementById('btn-add-depot').addEventListener('click', addNewDepot);
  document.getElementById('new-depot-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addNewDepot(); }
  });
  document.getElementById('purchase-form').addEventListener('submit', handlePurchaseSubmit);
  document.getElementById('btn-delete-purchase').addEventListener('click', deleteCurrentPurchase);
  document.getElementById('current-value-form').addEventListener('submit', handleCurrentValueSubmit);

  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay').forEach(o => o.classList.add('hidden'));
    }
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo();
    } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      redo();
    }
  });

  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => setEntryType(btn.dataset.type));
  });

  document.getElementById('entry-form').addEventListener('submit', handleEntryFormSubmit);
  document.getElementById('btn-delete-entry').addEventListener('click', deleteCurrentEntry);
  document.getElementById('transfer-form').addEventListener('submit', handleTransferSubmit);
  document.getElementById('transfer-source').addEventListener('change', () => updateTransferAmountLimit());

  document.querySelector('[data-add-income-category]').addEventListener('click', () => {
    const input = document.getElementById('new-category-income');
    addIncomeCategory(input.value);
    input.value = '';
  });

  document.getElementById('new-category-income').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addIncomeCategory(e.target.value);
      e.target.value = '';
    }
  });

  updateUndoRedoButtons();
  carryForwardBudgets();
  generateRecurringEntriesForMonth(state.year, state.month);
  populateEntryFilters();
  render();
}

try {
  init();
} catch (e) {
  document.body.innerHTML = `<div class="fatal-error">
    <h2>Die App konnte nicht geladen werden</h2>
    <p>${escapeHtml(e.message)}</p>
    <p>Öffne die Entwicklerkonsole des Browsers (z. B. F12) für Details, oder starte die App über einen lokalen Server statt per Doppelklick.</p>
  </div>`;
}
