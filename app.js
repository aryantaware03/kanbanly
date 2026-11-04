import {
  COLUMNS,
  COLUMN_IDS,
  PRIORITIES,
  PRIORITY_LABELS,
  addDays,
  createTask,
  dateKey,
  filterTasks,
  formatDue,
  groupByStatus,
  moveTask,
  nextStatus,
  prevStatus,
  sanitizeTasks,
  statusIndex,
  taskStats,
} from './logic.js';

const STORAGE_KEY = 'kanbanly.v1';
const COLUMN_COLORS = {
  backlog: '#7c8b8f',
  ready: '#2f7db5',
  doing: '#c2822c',
  done: '#2e8b57',
};

const $ = (id) => document.getElementById(id);

const el = {
  theme: $('theme-toggle'),
  board: $('board'),
  empty: $('board-empty'),
  newTask: $('new-task'),
  newTaskEmpty: $('new-task-empty'),
  starter: $('starter-tasks'),
  search: $('search'),
  priorityFilter: $('priority-filter'),
  clearFilters: $('clear-filters'),
  filterSummary: $('filter-summary'),
  statTotal: $('stat-total'),
  statDoing: $('stat-doing'),
  statDone: $('stat-done'),
  statOverdue: $('stat-overdue'),
  dialog: $('task-dialog'),
  form: $('task-form'),
  kicker: $('task-dialog-kicker'),
  dialogTitle: $('task-dialog-title'),
  submit: $('task-form').querySelector('button[type="submit"]'),
  title: $('task-title'),
  notes: $('task-notes'),
  status: $('task-status'),
  priority: $('task-priority'),
  due: $('task-due'),
  tags: $('task-tags'),
  cancel: $('task-cancel'),
  exportJson: $('export-json'),
  importJson: $('import-json'),
  importFile: $('import-file'),
  toast: $('toast'),
};

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

const saved = loadData();
const storedTheme =
  saved.settings?.theme === 'dark' || saved.settings?.theme === 'light'
    ? saved.settings.theme
    : null;

const state = {
  tasks: sanitizeTasks(saved.tasks, dateKey()),
  theme:
    storedTheme ??
    (globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'),
  query: '',
  priority: 'all',
  editingId: null,
};

let toastTimer;

function saveData() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        tasks: state.tasks,
        settings: { theme: state.theme },
      }),
    );
  } catch {
    // Keep working in memory when storage is unavailable.
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function toast(message, isError = false) {
  el.toast.textContent = message;
  el.toast.classList.toggle('error', isError);
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2600);
}

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  el.theme.setAttribute(
    'aria-label',
    theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
  );
}

function fillSelect(select, entries, selected) {
  select.innerHTML = entries
    .map(
      ([value, label]) =>
        `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(label)}</option>`,
    )
    .join('');
}

function setupSelects() {
  const statuses = COLUMNS.map((column) => [column.id, column.label]);
  fillSelect(el.status, statuses, 'backlog');
  fillSelect(
    el.priority,
    PRIORITIES.map((priority) => [priority, PRIORITY_LABELS[priority]]),
    'medium',
  );
  fillSelect(el.priorityFilter, [['all', 'All priorities'], ...PRIORITIES.map((priority) => [priority, PRIORITY_LABELS[priority]])], 'all');
}

function nextOrder(status) {
  const orders = state.tasks
    .filter((task) => task.status === status)
    .map((task) => task.order ?? 0);
  return orders.length ? Math.max(...orders) + 1 : 0;
}

function openDialog(task = null, status = 'backlog') {
  state.editingId = task?.id ?? null;
  el.kicker.textContent = task ? 'Edit task' : 'New task';
  el.dialogTitle.textContent = task ? 'Edit task' : 'New task';
  el.submit.textContent = task ? 'Save changes' : 'Save task';
  el.title.value = task?.title ?? '';
  el.notes.value = task?.notes ?? '';
  el.status.value = task?.status ?? (COLUMN_IDS.includes(status) ? status : 'backlog');
  el.priority.value = task?.priority ?? 'medium';
  el.due.value = task?.due ?? '';
  el.tags.value = task?.tags?.join(', ') ?? '';
  el.dialog.showModal();
  el.title.focus();
}

function closeDialog() {
  state.editingId = null;
  el.dialog.close();
}

function updateTask(values, existing) {
  const draft = createTask(
    {
      ...values,
      order: existing?.order ?? nextOrder(values.status),
      id: existing?.id,
    },
    Date.now(),
  );

  if (!existing) {
    state.tasks = [...state.tasks, draft];
    return;
  }

  let list = state.tasks;
  if (existing.status !== draft.status) {
    list = moveTask(list, existing.id, draft.status, null);
  }
  state.tasks = list.map((task) =>
    task.id === existing.id
      ? {
          ...draft,
          id: existing.id,
          order: task.order,
          createdAt: existing.createdAt,
        }
      : task,
  );
}

function renderStats() {
  const stats = taskStats(state.tasks, dateKey());
  el.statTotal.textContent = String(stats.total);
  el.statDoing.textContent = String(stats.doing);
  el.statDone.textContent = String(stats.done);
  el.statOverdue.textContent = String(stats.overdue);
}

function cardMarkup(task) {
  const due =
    task.status === 'done'
      ? { label: '', state: 'none' }
      : formatDue(task, dateKey());
  const index = statusIndex(task.status);
  const previous = prevStatus(task.status);
  const next = nextStatus(task.status);
  const dueClass = due.state === 'none' ? 'due' : `due due-${due.state}`;
  const tags = task.tags.length
    ? `<div class="tags">${task.tags
        .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
        .join('')}</div>`
    : '';
  const notes = task.notes
    ? `<p class="card-notes">${escapeHtml(task.notes)}</p>`
    : '';

  return `
    <article class="drag-card priority-${task.priority}" draggable="true" data-id="${escapeHtml(task.id)}" tabindex="0">
      <div class="card-meta">
        <span class="priority priority-${task.priority}">${escapeHtml(PRIORITY_LABELS[task.priority])}</span>
        ${due.label ? `<span class="${dueClass}" title="Due ${escapeHtml(task.due)}">${escapeHtml(due.label)}</span>` : ''}
      </div>
      <h3>${escapeHtml(task.title)}</h3>
      ${notes}
      ${tags}
      <div class="card-foot">
        <div class="move-controls">
          <button
            type="button"
            data-action="move-left"
            aria-label="Move left"
            title="${index <= 0 ? 'Already in the first column' : `Move to ${escapeHtml(COLUMNS[index - 1].label)}`}"
            ${index <= 0 ? 'disabled' : ''}
          >◀</button>
          <button
            type="button"
            data-action="move-right"
            aria-label="Move right"
            title="${index >= COLUMNS.length - 1 ? 'Already in the last column' : `Move to ${escapeHtml(COLUMNS[index + 1].label)}`}"
            ${index >= COLUMNS.length - 1 ? 'disabled' : ''}
          >▶</button>
        </div>
        <div class="card-actions">
          <button type="button" data-action="edit">Edit</button>
          <button type="button" data-action="delete">Delete</button>
        </div>
      </div>
      <span class="sr-only">Current column: ${escapeHtml(COLUMNS[index]?.label ?? task.status)}. Previous column: ${escapeHtml(COLUMNS[statusIndex(previous)]?.label ?? '')}. Next column: ${escapeHtml(COLUMNS[statusIndex(next)]?.label ?? '')}.</span>
    </article>`;
}

function renderBoard() {
  const visible = filterTasks(state.tasks, {
    query: state.query,
    priority: state.priority,
  });
  const groups = groupByStatus(visible);

  el.board.innerHTML = COLUMNS.map((column) => {
    const tasks = groups[column.id];
    const cards = tasks.length
      ? tasks.map(cardMarkup).join('')
      : `<p class="column-empty">${state.tasks.length ? 'No matching tasks' : 'Drop a task here'}</p>`;
    return `
      <section class="column" data-status="${column.id}" style="--col: ${COLUMN_COLORS[column.id]}" aria-labelledby="column-${column.id}">
        <header class="column-head">
          <div class="column-title">
            <span class="column-dot" aria-hidden="true"></span>
            <h2 id="column-${column.id}">${escapeHtml(column.label)}</h2>
            <span class="column-count" aria-label="${tasks.length} tasks">${tasks.length}</span>
          </div>
          <button class="add-icon" type="button" data-add-status="${column.id}" aria-label="Add task to ${escapeHtml(column.label)}" title="Add task to ${escapeHtml(column.label)}">+</button>
        </header>
        <div class="column-body">${cards}</div>
      </section>`;
  }).join('');

  const hasTasks = state.tasks.length > 0;
  el.empty.hidden = hasTasks;
  el.board.hidden = !hasTasks;

  const filtering = Boolean(state.query.trim()) || state.priority !== 'all';
  el.clearFilters.hidden = !filtering;
  if (!hasTasks) {
    el.filterSummary.textContent = 'Add your first task to get the board moving.';
  } else if (filtering) {
    el.filterSummary.textContent = `Showing ${visible.length} of ${state.tasks.length} tasks.`;
  } else {
    el.filterSummary.textContent = `${state.tasks.length} tasks across ${COLUMNS.length} columns.`;
  }
}

function render() {
  renderStats();
  renderBoard();
}

function seedStarterTasks() {
  const today = dateKey();
  const drafts = [
    {
      title: 'Outline the next release notes',
      notes: 'Three bullets: what changed, why it matters, how to try it.',
      status: 'backlog',
      priority: 'medium',
      due: addDays(today, 5),
      tags: 'writing, release',
      order: 0,
    },
    {
      title: 'Collect five customer quotes',
      status: 'backlog',
      priority: 'low',
      due: addDays(today, 8),
      tags: 'research',
      order: 1,
    },
    {
      title: 'Polish the empty states',
      status: 'ready',
      priority: 'high',
      due: addDays(today, 2),
      tags: 'design',
      order: 0,
    },
    {
      title: 'Fix the mobile nav overlap',
      notes: 'Happens below 380px when the title is long.',
      status: 'doing',
      priority: 'high',
      due: addDays(today, 1),
      tags: 'bug, ui',
      order: 0,
    },
    {
      title: 'Set up the weekly review',
      status: 'done',
      priority: 'medium',
      due: addDays(today, -2),
      tags: 'ritual',
      order: 0,
    },
  ];

  state.tasks = drafts.map((draft) => createTask(draft, Date.now()));
  saveData();
  render();
  toast('Starter tasks added. Drag one forward.');
}

function moveTo(task, status) {
  state.tasks = moveTask(state.tasks, task.id, status, null);
  saveData();
  render();
}

function beforeIdFromDrop(body, clientY, draggingId) {
  const cards = [...body.querySelectorAll('.drag-card')].filter(
    (card) => card.dataset.id !== draggingId,
  );
  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return card.dataset.id;
  }
  return null;
}

let draggingId = null;

el.board.addEventListener('dragstart', (event) => {
  const card = event.target.closest('.drag-card');
  if (!card) return;
  draggingId = card.dataset.id;
  card.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', draggingId);
});

el.board.addEventListener('dragend', () => {
  draggingId = null;
  el.board.querySelectorAll('.dragging, .drop-target').forEach((node) => {
    node.classList.remove('dragging', 'drop-target');
  });
});

el.board.addEventListener('dragover', (event) => {
  const column = event.target.closest('.column');
  if (!column || !draggingId) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  el.board.querySelectorAll('.column.drop-target').forEach((node) => {
    if (node !== column) node.classList.remove('drop-target');
  });
  column.classList.add('drop-target');
});

el.board.addEventListener('dragleave', (event) => {
  const column = event.target.closest('.column');
  if (!column) return;
  if (!column.contains(event.relatedTarget)) {
    column.classList.remove('drop-target');
  }
});

el.board.addEventListener('drop', (event) => {
  const column = event.target.closest('.column');
  if (!column || !draggingId) return;
  event.preventDefault();
  const body = column.querySelector('.column-body');
  const beforeId = beforeIdFromDrop(body, event.clientY, draggingId);
  state.tasks = moveTask(
    state.tasks,
    draggingId,
    column.dataset.status,
    beforeId,
    new Date().toISOString(),
  );
  draggingId = null;
  saveData();
  render();
});

el.board.addEventListener('click', (event) => {
  const add = event.target.closest('[data-add-status]');
  if (add) {
    openDialog(null, add.dataset.addStatus);
    return;
  }

  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const card = button.closest('.drag-card');
  const task = state.tasks.find((item) => item.id === card?.dataset.id);
  if (!task) return;

  switch (button.dataset.action) {
    case 'move-left':
      moveTo(task, prevStatus(task.status));
      break;
    case 'move-right':
      moveTo(task, nextStatus(task.status));
      break;
    case 'edit':
      openDialog(task);
      break;
    case 'delete':
      state.tasks = state.tasks.filter((item) => item.id !== task.id);
      saveData();
      render();
      toast('Task deleted.');
      break;
    default:
      break;
  }
});

el.board.addEventListener('dblclick', (event) => {
  const card = event.target.closest('.drag-card');
  if (!card || event.target.closest('button')) return;
  const task = state.tasks.find((item) => item.id === card.dataset.id);
  if (task) openDialog(task);
});

el.board.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const card = event.target.closest('.drag-card');
  if (!card || event.target.closest('button')) return;
  event.preventDefault();
  const task = state.tasks.find((item) => item.id === card.dataset.id);
  if (task) openDialog(task);
});

el.form.addEventListener('submit', (event) => {
  event.preventDefault();
  const values = {
    title: el.title.value,
    notes: el.notes.value,
    status: el.status.value,
    priority: el.priority.value,
    due: el.due.value,
    tags: el.tags.value,
  };
  if (!values.title.trim()) {
    toast('Give the task a title.', true);
    el.title.focus();
    return;
  }
  const existing = state.editingId
    ? state.tasks.find((task) => task.id === state.editingId)
    : null;
  try {
    updateTask(values, existing);
  } catch (error) {
    toast(error.message || 'That task could not be saved.', true);
    return;
  }
  saveData();
  render();
  const wasEditing = Boolean(existing);
  closeDialog();
  toast(wasEditing ? 'Task updated.' : 'Task added.');
});

el.cancel.addEventListener('click', closeDialog);
el.dialog.addEventListener('click', (event) => {
  if (event.target === el.dialog) closeDialog();
});

el.search.addEventListener('input', () => {
  state.query = el.search.value;
  renderBoard();
});

el.priorityFilter.addEventListener('change', () => {
  state.priority = el.priorityFilter.value;
  renderBoard();
});

el.clearFilters.addEventListener('click', () => {
  state.query = '';
  state.priority = 'all';
  el.search.value = '';
  el.priorityFilter.value = 'all';
  renderBoard();
  el.search.focus();
});

el.newTask.addEventListener('click', () => openDialog(null, 'backlog'));
el.newTaskEmpty.addEventListener('click', () => openDialog(null, 'backlog'));
el.starter.addEventListener('click', seedStarterTasks);

el.theme.addEventListener('click', () => {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  saveData();
});

el.exportJson.addEventListener('click', () => {
  const payload = {
    app: 'Kanbanly',
    version: 1,
    exportedAt: new Date().toISOString(),
    tasks: state.tasks,
    settings: { theme: state.theme },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `kanbanly-backup-${dateKey()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast('Backup downloaded.');
});

el.importJson.addEventListener('click', () => el.importFile.click());

el.importFile.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const rows = Array.isArray(parsed) ? parsed : parsed?.tasks;
    if (!Array.isArray(rows)) throw new Error('No task list found in that file.');
    const tasks = sanitizeTasks(rows, dateKey());
    if (rows.length > 0 && tasks.length === 0) {
      throw new Error('That file did not contain any valid tasks.');
    }
    state.tasks = tasks;
    saveData();
    render();
    toast(`Restored ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}.`);
  } catch (error) {
    toast(error.message || 'That file could not be restored.', true);
  }
});

applyTheme(state.theme);
setupSelects();
render();
