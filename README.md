# schema-vc-core (Day 1 starter)

The core, UI-free data model for the schema version-control engine. No database,
no web server, no frontend yet — just the data structures and the function that
mutates them. This is deliberate: the hard part of this assignment is the
diff/merge logic, and that logic should be testable without a browser in the loop.

## Setup

```bash
npm install
npm test
```

You should see 5 passing tests.

## What's here

- `src/types.ts` — the schema model (`Table`, `Column`, `Constraint`, `Index`)
  and the `Operation` union. Every table/column has a permanent `id` separate
  from its `name` — see the comment at the top of the file for why.
- `src/apply.ts` — `applyOperation`, which takes a `SchemaState` + one
  `Operation` and returns a new state. Immutable on purpose: two branches
  must never be able to affect each other's history.
- `src/apply.test.ts` — proves the basics: create/add/rename/drop, and that
  a rename preserves identity instead of looking like a drop+add.

## What's deliberately not here yet

- Branches (a branch is just "a base state + a list of operations" —
  not built yet, next step)
- Diff (compare two branches' operation lists against their common ancestor)
- Merge + conflict detection (the actual hard part)
- `DROP_TABLE` doesn't yet cascade to that table's columns/constraints/indexes
  — flagged in a comment in `apply.ts` rather than silently handled, since
  it's one of the real conflict cases to design around deliberately.
- Any UI, API, or persistence layer

See `day0-scope-and-model.md` for the full scope, data model rationale, and
conflict taxonomy this was built from.
