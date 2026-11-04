# Kanbanly

A clear, local-first kanban board for a calmer week. Capture the work, choose
what matters, and drag it forward. Four columns, honest priorities, no ceremony.

**Live app:** <https://kanbanly-pearl.vercel.app>

## Features

- Four-column board: Backlog, Ready, In progress and Done
- Drag and drop cards between columns, including reordering within a column
- Accessible move-left and move-right buttons on every card
- Priorities, due dates with overdue/today labels, notes and tags
- Search across titles, notes and tags, plus a priority filter
- Board summary for total, in progress, done and overdue tasks
- Five starter tasks to show the flow in one click
- Full JSON backup and restore
- Light and dark themes
- No account, no server, no dependencies

## Getting started

```bash
npm start
```

Then open <http://localhost:4177>.

## Tests

Date math, ordering, filtering, drag targets, statistics and import
sanitisation live in `logic.js` and are covered by Node's built-in test runner:

```bash
npm test
```

## Deploy

```bash
vercel --prod
```

The app is fully static, so Vercel needs no configuration.

## Project structure

```
index.html     layout, toolbar, board shell and task dialog
styles.css     design system, board columns, cards and dark theme
logic.js       pure date, ordering, filtering and stats helpers
app.js         UI state, drag and drop, dialogs and localStorage persistence
logic.test.js  unit tests for all pure logic
serve.js       zero-dependency static server for local preview
```

## Keyboard and accessibility

Every card exposes move-left and move-right controls, so the board does not
depend on drag and drop. Cards can also be opened for editing by double-clicking
or using the Edit button. The task dialog traps focus natively through
`<dialog>`, and all form fields have visible labels.

## Data and privacy

Tasks and settings live in `localStorage` under `kanbanly.v1`. Nothing leaves
the browser. Use **Back up** to download a JSON snapshot and **Restore** to load
one back. Clearing site data removes the board.

## License

MIT
