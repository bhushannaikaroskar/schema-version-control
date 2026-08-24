import type { SchemaState, ID } from "./types.js";

// A diff compares two schema states BY ID. Because ids are stable across
// renames, a rename shows up as ONE change ("renamed") instead of a
// drop+add pair that a naive name-based diff would report — this is the
// payoff of the persistent-id design.

export type ElementType = "table" | "column" | "constraint" | "index";

export type ChangeType =
  | "added" // exists in `after` only
  | "removed" // exists in `before` only
  | "renamed" // same id, only the name changed
  | "modified"; // same id, some property changed (may also include a rename)

export interface SchemaChange {
  elementType: ElementType;
  changeType: ChangeType;
  id: ID;
  /** Human-readable label at each side, e.g. old/new column name. */
  nameBefore?: string;
  nameAfter?: string;
}

type NamedElement = { id: ID; name?: string };

function diffCollection<T extends NamedElement>(
  elementType: ElementType,
  before: Record<ID, T>,
  after: Record<ID, T>,
): SchemaChange[] {
  const changes: SchemaChange[] = [];

  for (const id of Object.keys(after)) {
    if (!(id in before)) {
      changes.push({ elementType, changeType: "added", id, nameAfter: after[id].name });
      continue;
    }
    const b = before[id];
    const a = after[id];
    const nameChanged = b.name !== undefined && b.name !== a.name;
    const contentChanged = JSON.stringify(stripName(b)) !== JSON.stringify(stripName(a));
    if (nameChanged && !contentChanged) {
      changes.push({
        elementType,
        changeType: "renamed",
        id,
        nameBefore: b.name,
        nameAfter: a.name,
      });
    } else if (nameChanged || contentChanged) {
      changes.push({
        elementType,
        changeType: "modified",
        id,
        nameBefore: b.name,
        nameAfter: a.name,
      });
    }
    // identical → no change
  }

  for (const id of Object.keys(before)) {
    if (!(id in after)) {
      changes.push({ elementType, changeType: "removed", id, nameBefore: before[id].name });
    }
  }

  return changes;
}

function stripName<T extends NamedElement>(el: T): Omit<T, "name"> {
  const { name: _name, ...rest } = el;
  return rest;
}

export function diffSchemas(before: SchemaState, after: SchemaState): SchemaChange[] {
  return [
    ...diffCollection("table", before.tables, after.tables),
    ...diffCollection("column", before.columns, after.columns),
    ...diffCollection("constraint", before.constraints, after.constraints),
    ...diffCollection("index", before.indexes, after.indexes),
  ];
}
