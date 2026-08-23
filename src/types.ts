// Core data model for the schema version-control engine.
// Every table and column has a permanent `id`, separate from its `name`.
// This is what lets a rename be recorded as an operation on an id,
// instead of being *inferred* from two snapshots (the git file-rename problem).

export type ID = string;

export interface Column {
  id: ID;
  tableId: ID;
  name: string; // mutable
  dataType: string; // e.g. "integer", "text", "timestamp"
  nullable: boolean;
  defaultValue?: string;
}

export interface Table {
  id: ID;
  name: string; // mutable
  columnIds: ID[];
}

export type ConstraintType = "PRIMARY_KEY" | "FOREIGN_KEY" | "UNIQUE" | "NOT_NULL";

export interface Constraint {
  id: ID;
  type: ConstraintType;
  tableId: ID;
  columnIds: ID[];
  referencesTableId?: ID; // for FOREIGN_KEY
  referencesColumnId?: ID; // for FOREIGN_KEY
}

export interface Index {
  id: ID;
  tableId: ID;
  columnIds: ID[];
  unique: boolean;
}

export interface SchemaState {
  tables: Record<ID, Table>;
  columns: Record<ID, Column>;
  constraints: Record<ID, Constraint>;
  indexes: Record<ID, Index>;
}

// Operations are tracked explicitly, not reverse-engineered from diffing
// two snapshots. A branch = a base SchemaState + an ordered list of these.
export type Operation =
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
