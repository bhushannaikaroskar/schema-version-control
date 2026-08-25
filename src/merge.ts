import type { SchemaState, Operation, ID } from "./types.js";
import { applyOperations } from "./apply.js";

// Three-way merge, v1 policy: conservative but precise.
//
// Each operation classifies what it does to element ids:
//   writes     — ids it creates, deletes, or mutates (the "primary" target)
//   reads      — ids it depends on but doesn't change (e.g. a column an index sits on)
//   containers — the table an operation lives inside (for column/constraint/index ops)
//
// Conflict rules:
//   1. dual_touch  — both sides WRITE the same id (rename vs drop, edit vs edit…)
//   2. dependency  — one side WRITES an id the other side READS or lives inside
//                    (index added on a dropped column, column added in a dropped table)
//   3. name_collision — both sides independently CREATE elements with the same name
//                    in the same namespace (different ids, so rule 1 can't see it)
//
// Rule 2 deliberately does NOT fire on shared containers alone: two branches
// adding *different* columns to the same table must auto-merge (common case),
// so containers only matter against the other side's WRITES (a table drop).

export type ConflictType = "dual_touch" | "dependency" | "name_collision";

export interface MergeConflict {
  type: ConflictType;
  message: string;
  elementIds: ID[];
}

export interface MergeResult {
  status: "clean" | "conflict";
  /** Merged operation list (ours then theirs). Only meaningful when status === "clean". */
  operations: Operation[];
  /** Schema after applying merged operations to base. Only meaningful when clean. */
  schema?: SchemaState;
  conflicts: MergeConflict[];
}

interface OpFootprint {
  writes: Set<ID>;
  reads: Set<ID>;
  containers: Set<ID>;
}

function footprint(op: Operation): OpFootprint {
  const f: OpFootprint = { writes: new Set(), reads: new Set(), containers: new Set() };
  switch (op.type) {
    case "CREATE_TABLE":
      f.writes.add(op.table.id);
      break;
    case "DROP_TABLE":
      f.writes.add(op.tableId);
      break;
    case "ADD_COLUMN":
      f.writes.add(op.column.id);
      f.containers.add(op.column.tableId);
      break;
    case "DROP_COLUMN":
    case "RENAME_COLUMN":
    case "RETYPE_COLUMN":
      f.writes.add(op.columnId);
      break;
    case "ADD_CONSTRAINT":
      f.writes.add(op.constraint.id);
      f.containers.add(op.constraint.tableId);
      for (const cid of op.constraint.columnIds) f.reads.add(cid);
      if (op.constraint.referencesTableId) f.reads.add(op.constraint.referencesTableId);
      if (op.constraint.referencesColumnId) f.reads.add(op.constraint.referencesColumnId);
      break;
    case "DROP_CONSTRAINT":
      f.writes.add(op.constraintId);
      break;
    case "ADD_INDEX":
      f.writes.add(op.index.id);
      f.containers.add(op.index.tableId);
      for (const cid of op.index.columnIds) f.reads.add(cid);
      break;
    case "DROP_INDEX":
      f.writes.add(op.indexId);
      break;
  }
  return f;
}

function union(a: Set<ID>, b: Set<ID>): Set<ID> {
  return new Set([...a, ...b]);
}

function findConflicts(
  ours: Operation[],
  theirs: Operation[],
): MergeConflict[] {
  const conflicts: MergeConflict[] = [];

  const ourFootprints = ours.map((op) => ({ op, fp: footprint(op) }));
  const theirFootprints = theirs.map((op) => ({ op, fp: footprint(op) }));

  const ourWrites = ourFootprints.reduce((acc, x) => union(acc, x.fp.writes), new Set<ID>());
  const theirWrites = theirFootprints.reduce((acc, x) => union(acc, x.fp.writes), new Set<ID>());
  const ourReadsAndContainers = ourFootprints.reduce(
    (acc, x) => union(union(acc, x.fp.reads), x.fp.containers),
    new Set<ID>(),
  );
  const theirReadsAndContainers = theirFootprints.reduce(
    (acc, x) => union(union(acc, x.fp.reads), x.fp.containers),
    new Set<ID>(),
  );

  // Rule 1: both sides write the same element.
  for (const id of ourWrites) {
    if (theirWrites.has(id)) {
      conflicts.push({
        type: "dual_touch",
        message: `Both branches modify element ${id}`,
        elementIds: [id],
      });
    }
  }

  // Rule 2: one side writes an element the other side depends on or lives in.
  const reported = new Set(conflicts.map((c) => c.elementIds[0]));
  for (const id of ourWrites) {
    if (!reported.has(id) && theirReadsAndContainers.has(id)) {
      conflicts.push({
        type: "dependency",
        message: `This branch modifies ${id}, which the other branch depends on`,
        elementIds: [id],
      });
    }
  }
  for (const id of theirWrites) {
    if (!reported.has(id) && ourReadsAndContainers.has(id)) {
      conflicts.push({
        type: "dependency",
        message: `The other branch modifies ${id}, which this branch depends on`,
        elementIds: [id],
      });
    }
  }

  // Rule 3: independent creations with colliding names.
  // Names are only unique WITHIN a namespace: table names globally, column
  // names per-table. Two tables both having a column "email" is fine; two
  // columns named "email" in the SAME table is not.
  const createdTables = (ops: Operation[]) =>
    ops.filter((o) => o.type === "CREATE_TABLE") as Extract<Operation, { type: "CREATE_TABLE" }>[];
  for (const a of createdTables(ours)) {
    for (const b of createdTables(theirs)) {
      if (a.table.id !== b.table.id && a.table.name === b.table.name) {
        conflicts.push({
          type: "name_collision",
          message: `Both branches create a table named "${b.table.name}"`,
          elementIds: [a.table.id, b.table.id],
        });
      }
    }
  }

  const createdColumns = (ops: Operation[]) =>
    ops.filter((o) => o.type === "ADD_COLUMN") as Extract<Operation, { type: "ADD_COLUMN" }>[];
  for (const a of createdColumns(ours)) {
    for (const b of createdColumns(theirs)) {
      if (
        a.column.id !== b.column.id &&
        a.column.tableId === b.column.tableId &&
        a.column.name === b.column.name
      ) {
        conflicts.push({
          type: "name_collision",
          message: `Both branches add a column named "${b.column.name}" to the same table`,
          elementIds: [a.column.id, b.column.id],
        });
      }
    }
  }

  return conflicts;
}

export function mergeSchemas(
  base: SchemaState,
  ours: Operation[],
  theirs: Operation[],
): MergeResult {
  const conflicts = findConflicts(ours, theirs);

  if (conflicts.length > 0) {
    return { status: "conflict", operations: [], conflicts };
  }

  // Clean merge: replay both sides' operations over the base. Ours first,
  // then theirs — deterministic, and safe because no footprint overlaps.
  const operations = [...ours, ...theirs];
  return {
    status: "clean",
    operations,
    schema: applyOperations(base, operations),
    conflicts: [],
  };
}
