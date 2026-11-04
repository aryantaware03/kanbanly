export const COLUMNS = [
  { id: 'backlog', label: 'Backlog', hint: 'Ideas and someday' },
  { id: 'ready', label: 'Ready', hint: 'Chosen for this week' },
  { id: 'doing', label: 'In progress', hint: 'Keep it moving' },
  { id: 'done', label: 'Done', hint: 'Small wins count' },
];

export const COLUMN_IDS = COLUMNS.map((column) => column.id);
export const PRIORITIES = ['low', 'medium', 'high'];
export const PRIORITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High' };

const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86400000;

export function dateKey(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return '';
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function parseKey(key) {
  if (typeof key !== 'string') return null;
  const match = KEY_RE.exec(key);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return null;
  if (date.toISOString().slice(0, 10) !== key) return null;
  return date;
}

export function isValidKey(key) {
  return parseKey(key) !== null;
}

export function daysBetween(fromKey, toKey) {
  const from = parseKey(fromKey);
  const to = parseKey(toKey);
  if (!from || !to) return 0;
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

export function addDays(key, amount) {
  const date = parseKey(key);
  if (!date) return '';
  date.setUTCDate(date.getUTCDate() + Number(amount));
  return date.toISOString().slice(0, 10);
}

export function statusIndex(status) {
  return COLUMN_IDS.indexOf(status);
}

export function nextStatus(status) {
  const index = statusIndex(status);
  if (index === -1) return status;
  return COLUMN_IDS[Math.min(COLUMN_IDS.length - 1, index + 1)];
}

export function prevStatus(status) {
  const index = statusIndex(status);
  if (index === -1) return status;
  return COLUMN_IDS[Math.max(0, index - 1)];
}

export function normalizeTags(tags) {
  let list = tags;
  if (typeof list === 'string') list = list.split(',');
  if (!Array.isArray(list)) list = [];
  const seen = new Set();
  const clean = [];
  for (const raw of list) {
    const tag = String(raw ?? '').trim().slice(0, 24);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push(tag);
    if (clean.length >= 8) break;
  }
  return clean;
}

export function createTask(
  {
    title,
    notes = '',
    status = 'backlog',
    priority = 'medium',
    due = '',
    tags = [],
    order = 0,
    id,
  },
  now = Date.now(),
) {
  const cleanTitle = String(title ?? '').trim();
  if (!cleanTitle) throw new Error('A task title is required');
  if (!COLUMN_IDS.includes(status)) throw new Error('Pick a valid column');
  if (!PRIORITIES.includes(priority)) throw new Error('Pick a valid priority');
  if (due && !isValidKey(due)) throw new Error('Due date must be a real date');

  const stamp = new Date(now);
  const iso = Number.isNaN(stamp.getTime()) ? new Date().toISOString() : stamp.toISOString();
  const generated = `t-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const safeId =
    typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id)
      ? id
      : generated;

  return {
    id: safeId,
    title: cleanTitle.slice(0, 120),
    notes: String(notes ?? '').trim().slice(0, 500),
    status,
    priority,
    due: due || '',
    tags: normalizeTags(tags),
    order: Number.isFinite(Number(order)) ? Math.max(0, Math.round(Number(order))) : 0,
    createdAt: iso,
    updatedAt: iso,
  };
}

export function groupByStatus(tasks) {
  const groups = Object.fromEntries(COLUMN_IDS.map((id) => [id, []]));
  for (const task of tasks ?? []) {
    if (groups[task.status]) groups[task.status].push(task);
  }
  for (const id of COLUMN_IDS) {
    groups[id].sort(
      (a, b) =>
        (a.order ?? 0) - (b.order ?? 0) ||
        String(a.createdAt).localeCompare(String(b.createdAt)),
    );
  }
  return groups;
}

export function filterTasks(tasks, { query = '', priority = 'all', tag = 'all' } = {}) {
  const needle = String(query ?? '').trim().toLowerCase();
  return (tasks ?? []).filter((task) => {
    if (priority !== 'all' && task.priority !== priority) return false;
    if (tag !== 'all' && !(task.tags ?? []).includes(tag)) return false;
    if (!needle) return true;
    return [task.title, task.notes, ...(task.tags ?? [])]
      .join(' ')
      .toLowerCase()
      .includes(needle);
  });
}

export function moveTask(
  tasks,
  taskId,
  status,
  beforeId = null,
  now = new Date().toISOString(),
) {
  const list = tasks ?? [];
  const task = list.find((item) => item.id === taskId);
  if (!task || !COLUMN_IDS.includes(status)) return list;

  const others = list.filter((item) => item.id !== taskId);
  const target = others
    .filter((item) => item.status === status)
    .sort(
      (a, b) =>
        (a.order ?? 0) - (b.order ?? 0) ||
        String(a.createdAt).localeCompare(String(b.createdAt)),
    );

  let insertAt = target.length;
  if (beforeId && beforeId !== taskId) {
    const index = target.findIndex((item) => item.id === beforeId);
    if (index !== -1) insertAt = index;
  }

  const targetWithTask = [...target];
  targetWithTask.splice(insertAt, 0, { ...task, status });

  const orderById = new Map(
    targetWithTask.map((item, index) => [item.id, index]),
  );

  const result = others.map((item) =>
    item.status === status
      ? { ...item, order: orderById.get(item.id) ?? item.order }
      : item,
  );
  result.push({
    ...task,
    status,
    order: orderById.get(taskId) ?? 0,
    updatedAt: now,
  });

  return result;
}

export function taskStats(tasks, todayKey) {
  const list = tasks ?? [];
  const done = list.filter((task) => task.status === 'done').length;
  return {
    total: list.length,
    active: list.length - done,
    doing: list.filter((task) => task.status === 'doing').length,
    done,
    overdue: list.filter(
      (task) =>
        task.status !== 'done' &&
        isValidKey(task.due) &&
        task.due < todayKey,
    ).length,
  };
}

export function formatDue(task, todayKey) {
  if (!task?.due || !isValidKey(task.due) || !isValidKey(todayKey)) {
    return { label: '', state: 'none' };
  }
  if (task.due < todayKey) return { label: 'Overdue', state: 'overdue' };
  if (task.due === todayKey) return { label: 'Due today', state: 'today' };
  const days = daysBetween(todayKey, task.due);
  if (days === 1) return { label: 'Tomorrow', state: 'soon' };
  return {
    label: `In ${days} days`,
    state: days <= 7 ? 'soon' : 'later',
  };
}

export function sanitizeTasks(raw, todayKey) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const tasks = [];

  for (const [index, item] of raw.entries()) {
    if (!item || typeof item !== 'object') continue;
    const title = String(item.title ?? '').trim().slice(0, 120);
    if (!title) continue;

    let id =
      typeof item.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(item.id)
        ? item.id
        : '';
    if (!id) id = `t-${index + 1}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const status = COLUMN_IDS.includes(item.status) ? item.status : 'backlog';
    const priority = PRIORITIES.includes(item.priority) ? item.priority : 'medium';
    const due = isValidKey(item.due) ? item.due : '';
    const order = Number.isFinite(Number(item.order))
      ? Math.max(0, Math.round(Number(item.order)))
      : tasks.length;
    const created = Date.parse(item.createdAt);
    const updated = Date.parse(item.updatedAt);
    const fallbackStamp = `${isValidKey(todayKey) ? todayKey : dateKey()}T00:00:00.000Z`;

    tasks.push({
      id,
      title,
      notes: String(item.notes ?? '').trim().slice(0, 500),
      status,
      priority,
      due,
      tags: normalizeTags(item.tags),
      order,
      createdAt: Number.isNaN(created) ? fallbackStamp : new Date(created).toISOString(),
      updatedAt: Number.isNaN(updated) ? fallbackStamp : new Date(updated).toISOString(),
    });
  }

  return tasks;
}
