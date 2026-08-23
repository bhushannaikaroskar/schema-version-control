# Day 0 — Scope, Data Model, and Conflict Taxonomy

This is the spec to build against for the rest of the week. Everything here is a proposal — adjust anything that doesn't feel right before you start coding, but don't start coding until this feels settled.

## 1. Scope — what's in, what's out

**In scope (directly from the prompt):**
- Tables: create, drop
- Columns: add, drop, rename, retype
- Constraints: add, drop — `PRIMARY KEY`, `FOREIGN KEY`, `UNIQUE`, `NOT NULL`
- Indexes: add, drop (single or multi-column, unique or not)
- Branch, diff, merge across all of the above

**Deliberately out (say so explicitly in decisions.md):**
- Row data / data migration safety (the prompt says this outright)
- `CHECK` constraints with arbitrary expressions — if you want them at all, model the expression as an opaque string, don't parse/validate it
- Views, triggers, stored procedures, sequences
- Table renaming — *optional*: it's structurally identical to column rename, so it's cheap to add if you have time. Decide once, don't revisit.

## 2. Core data model

The key design call: **every table and column gets a permanent internal ID, separate from its name.** This is what lets you detect a rename cleanly instead of guessing whether a "drop + add" was actually one edit. Names are just a mutable property of an ID — like a display label, not an identity.

```typescript
type ID = string; // uuid

interface Column {
  id: ID;
  tableId: ID;
  name: string;          // mutable
  dataType: string;       // e.g. "integer", "text", "timestamp"
  nullable: boolean;
  defaultValue?: string;
}

interface Table {
  id: ID;
  name: string;           // mutable
  columnIds: ID[];
}

type ConstraintType = "PRIMARY_KEY" | "FOREIGN_KEY" | "UNIQUE" | "NOT_NULL";

interface Constraint {
  id: ID;
  type: ConstraintType;
  tableId: ID;
  columnIds: ID[];
  referencesTableId?: ID;   // for FOREIGN_KEY
  referencesColumnId?: ID;  // for FOREIGN_KEY
}

interface Index {
  id: ID;
  tableId: ID;
  columnIds: ID[];
  unique: boolean;
}

interface SchemaState {
  tables: Record<ID, Table>;
  columns: Record<ID, Column>;
  constraints: Record<ID, Constraint>;
  indexes: Record<ID, Index>;
}
```

## 3. Operations, not snapshots

Track *what happened*, not just before/after states — this is what makes diffing an ID comparison instead of a guessing game.

```typescript
type Operation =
  | { type: "CREATE_TABLE"; table: Table }
  | { type: "DROP_TABLE"; tableId: ID }
  | { type: "ADD_COLUMN"; column: Column }
  | { type: "DROP_COLUMN"; columnId: ID }
  | { type: "RENAME_COLUMN"; columnId: ID; newName: string }
  | { type: "RETYPE_COLUMN"; columnId: ID; newType: string }
  | { type: "ADD_CONSTRAINT"; constraint: Constraint }
  | { type: "DROP_CONSTRAINT"; constraintId: ID }
  | { type: "ADD_INDEX"; index: Index }
  | { type: "DROP_INDEX"; indexId: ID };
```

A **branch** = a base snapshot (the schema state at the branch point) + an ordered list of `Operation`s applied since. The branch's current state is just `fold(operations, baseSnapshot)`.

## 4. Conflict taxonomy — the v1 policy

**Simple, defensible rule for v1:** if both branches contain *any* operation targeting the same element ID, that's a conflict — regardless of which specific property each operation touches. This is intentionally conservative (a fancier version could auto-merge non-overlapping property edits, e.g. one branch renames while the other retypes the same column), but it's easy to implement correctly, easy to test exhaustively, and easy to explain. Note this trade-off explicitly in `decisions.md` — it's a real, defensible scoping call, not a shortcut you're hiding.

Concrete cases to test against:
1. **Same-element double-edit** — both branches retype (or rename, etc.) the same column differently
2. **Rename vs. drop** — one branch renames a column, the other drops it
3. **Rename vs. rename** — both branches rename the same column to different new names
4. **Dependency conflict** — one branch adds an index/constraint on a column, the other branch drops that column
5. **Table-drop cascade** — one branch drops a table, the other adds/modifies a column, constraint, or index *inside* that table
6. **Name collision** — both branches independently create a table with the same name (different IDs, so not an ID conflict — needs a separate uniqueness check)
7. **Clean auto-merge** — changes touch entirely different elements → merge automatically, no conflict

## 5. decisions.md — fill-in scaffold for what you build today

```
## Decision: [e.g. "Schema elements use persistent internal IDs"]
- Alternatives considered: [e.g. snapshot diffing by name, like a naive git diff]
- Reasoning: [why this way; what breaks with the alternative]
- Trade-off accepted: [what this costs you]

## Decision: [e.g. "Conflict policy: any dual-touch on an element = conflict"]
- Alternatives considered: [property-level auto-merge]
- Reasoning: [...]
- Trade-off accepted: [less clever, but correct and testable in the time available]

## Deliberately cut
- [item] — because [reason]
- [item] — because [reason]
```

## 6. Merge strategy plan

Two-stage approach:

1. **v1 (must ship):** conservative dual-touch conflict policy from §4. Implement,
   test all 7 taxonomy cases, done.
2. **Stretch ("above and beyond"):** property-level auto-merge:
   - Same element, different properties touched (rename vs retype vs nullability)
     → both apply cleanly.
   - Same property, different values (rename→A vs rename→B) → conflict.
   - Any edit vs drop of the same element → conflict.
   - Dependency check still applies: adding an index on a column another branch
     dropped is a conflict even though index and column have different IDs.

The stretch version replaces the ID-overlap check with a per-operation
"reads/writes" analysis. Ship v1 first; do not start the stretch until the UI
exists (Day 4), because a brilliant engine nobody can see loses to a good
engine with a clear diff/merge view.
