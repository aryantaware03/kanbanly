import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLUMN_IDS,
  addDays,
  createTask,
  dateKey,
  daysBetween,
  filterTasks,
  formatDue,
  groupByStatus,
  isValidKey,
  moveTask,
  nextStatus,
  normalizeTags,
  prevStatus,
  sanitizeTasks,
  taskStats,
} from './logic.js';

const TODAY = '2026-11-04';
const NOW = Date.parse('2026-11-04T10:00:00.000Z');

test('column helpers clamp at both ends', () => {
  assert.deepEqual(COLUMN_IDS, ['backlog', 'ready', 'doing', 'done']);
  assert.equal(nextStatus('backlog'), 'ready');
  assert.equal(nextStatus('done'), 'done');
  assert.equal(prevStatus('backlog'), 'backlog');
  assert.equal(prevStatus('doing'), 'ready');
});

test('date helpers and validation', () => {
  assert.equal(dateKey(new Date(2026, 10, 4)), '2026-11-04');
  assert.equal(daysBetween('2026-11-04', '2026-11-09'), 5);
  assert.equal(addDays('2026-11-04', 3), '2026-11-07');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(isValidKey('2026-02-29'), false);
  assert.equal(isValidKey('2028-02-29'), true);
});

test('normalizeTags trims, dedupes case-insensitively and caps at eight', () => {
  assert.deepEqual(normalizeTags(' api, UI, api, , quick win '), [
    'api',
    'UI',
    'quick win',
  ]);
  assert.equal(
    normalizeTags(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']).length,
    8,
  );
});

test('createTask validates and normalizes input', () => {
  const task = createTask(
    {
      title: '  Ship the board  ',
      notes: '  Keep it small  ',
      status: 'doing',
      priority: 'high',
      due: TODAY,
      tags: 'ui, api, ui',
      order: 3,
      id: 'task_1',
    },
    NOW,
  );
  assert.equal(task.title, 'Ship the board');
  assert.equal(task.notes, 'Keep it small');
  assert.equal(task.status, 'doing');
  assert.equal(task.priority, 'high');
  assert.deepEqual(task.tags, ['ui', 'api']);
  assert.equal(task.order, 3);
  assert.equal(task.id, 'task_1');
  assert.equal(task.createdAt, '2026-11-04T10:00:00.000Z');

  assert.throws(() => createTask({ title: ' ' }, NOW), /title/);
  assert.throws(() => createTask({ title: 'A', status: 'nope' }, NOW), /column/);
  assert.throws(() => createTask({ title: 'A', priority: 'urgent' }, NOW), /priority/);
  assert.throws(() => createTask({ title: 'A', due: '2026-02-30' }, NOW), /date/);
});

test('groupByStatus sorts by order then creation time', () => {
  const tasks = [
    { id: 'a', status: 'backlog', order: 2, createdAt: '2026-11-01T00:00:00Z' },
    { id: 'b', status: 'backlog', order: 1, createdAt: '2026-11-03T00:00:00Z' },
    { id: 'c', status: 'done', order: 0, createdAt: '2026-11-02T00:00:00Z' },
    { id: 'd', status: 'invalid', order: 0, createdAt: '2026-11-02T00:00:00Z' },
  ];
  const groups = groupByStatus(tasks);
  assert.deepEqual(groups.backlog.map((task) => task.id), ['b', 'a']);
  assert.deepEqual(groups.done.map((task) => task.id), ['c']);
  assert.equal(groups.ready.length, 0);
});

test('filterTasks matches text, tags and priority', () => {
  const tasks = [
    { id: 'a', title: 'Write API docs', notes: 'OpenAPI', tags: ['docs'], priority: 'high' },
    { id: 'b', title: 'Fix nav', notes: 'Mobile', tags: ['ui'], priority: 'low' },
  ];
  assert.equal(filterTasks(tasks, { query: 'api' }).length, 1);
  assert.equal(filterTasks(tasks, { query: 'mobile' }).length, 1);
  assert.equal(filterTasks(tasks, { tag: 'ui' }).length, 1);
  assert.equal(filterTasks(tasks, { priority: 'high' }).length, 1);
  assert.equal(filterTasks(tasks, { priority: 'all', query: '' }).length, 2);
});

test('moveTask appends and changes status', () => {
  const tasks = [
    { id: 'a', status: 'backlog', order: 0, createdAt: '2026-11-01T00:00:00Z' },
    { id: 'b', status: 'backlog', order: 1, createdAt: '2026-11-02T00:00:00Z' },
    { id: 'c', status: 'ready', order: 0, createdAt: '2026-11-03T00:00:00Z' },
  ];
  const moved = moveTask(tasks, 'a', 'ready', null, '2026-11-04T10:00:00Z');
  const ready = groupByStatus(moved).ready;
  assert.deepEqual(ready.map((task) => task.id), ['c', 'a']);
  assert.equal(ready[1].status, 'ready');
  assert.equal(ready[1].updatedAt, '2026-11-04T10:00:00Z');
});

test('moveTask inserts before a card and reorders within a column', () => {
  const tasks = [
    { id: 'a', status: 'backlog', order: 0, createdAt: '2026-11-01T00:00:00Z' },
    { id: 'b', status: 'backlog', order: 1, createdAt: '2026-11-02T00:00:00Z' },
    { id: 'c', status: 'backlog', order: 2, createdAt: '2026-11-03T00:00:00Z' },
  ];
  const reordered = moveTask(tasks, 'c', 'backlog', 'a');
  assert.deepEqual(
    groupByStatus(reordered).backlog.map((task) => task.id),
    ['c', 'a', 'b'],
  );
  assert.deepEqual(
    groupByStatus(reordered).backlog.map((task) => task.order),
    [0, 1, 2],
  );
});

test('moveTask ignores unknown tasks and columns', () => {
  const tasks = [{ id: 'a', status: 'backlog', order: 0 }];
  assert.equal(moveTask(tasks, 'missing', 'done'), tasks);
  assert.equal(moveTask(tasks, 'a', 'nope'), tasks);
});

test('taskStats excludes completed tasks from overdue', () => {
  const tasks = [
    { id: 'a', status: 'doing', due: '2026-11-01' },
    { id: 'b', status: 'done', due: '2026-11-01' },
    { id: 'c', status: 'backlog', due: TODAY },
    { id: 'd', status: 'ready', due: '' },
  ];
  assert.deepEqual(taskStats(tasks, TODAY), {
    total: 4,
    active: 3,
    doing: 1,
    done: 1,
    overdue: 1,
  });
});

test('formatDue labels overdue, today, tomorrow and later', () => {
  assert.deepEqual(formatDue({ due: '2026-11-01' }, TODAY), {
    label: 'Overdue',
    state: 'overdue',
  });
  assert.deepEqual(formatDue({ due: TODAY }, TODAY), {
    label: 'Due today',
    state: 'today',
  });
  assert.deepEqual(formatDue({ due: '2026-11-05' }, TODAY), {
    label: 'Tomorrow',
    state: 'soon',
  });
  assert.deepEqual(formatDue({ due: '2026-11-10' }, TODAY), {
    label: 'In 6 days',
    state: 'soon',
  });
  assert.deepEqual(formatDue({ due: '2026-12-01' }, TODAY), {
    label: 'In 27 days',
    state: 'later',
  });
  assert.deepEqual(formatDue({ due: '' }, TODAY), { label: '', state: 'none' });
});

test('sanitizeTasks drops invalid rows and normalizes fields', () => {
  const tasks = sanitizeTasks(
    [
      {
        id: 'a',
        title: '  Keep me  ',
        notes: '  note ',
        status: 'doing',
        priority: 'high',
        due: '2026-11-09',
        tags: ['ui', 'ui'],
        order: 2,
      },
      { id: 'a', title: 'Duplicate' },
      { id: 'b', title: '   ' },
      { id: 'c', title: 'Defaults', status: 'unknown', priority: 'urgent', due: 'nope', tags: 'x' },
    ],
    TODAY,
  );
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].title, 'Keep me');
  assert.equal(tasks[0].status, 'doing');
  assert.deepEqual(tasks[0].tags, ['ui']);
  assert.equal(tasks[1].status, 'backlog');
  assert.equal(tasks[1].priority, 'medium');
  assert.equal(tasks[1].due, '');
  assert.equal(tasks[1].createdAt, '2026-11-04T00:00:00.000Z');
});
