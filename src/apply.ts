import type { SchemaState, Operation } from "./types.js";

export function emptySchema(): SchemaState {
  return { tables: {}, columns: {}, constraints: {}, indexes: {} };
}

// Applies one operation to a schema state and returns a NEW state.
// Never mutates the input — branches need to stay independent, so
// shared history must never be touched in place.
export function applyOperation(state: SchemaState, op: Operation): SchemaState {
  switch (op.type) {
    case "CREATE_TABLE":
      return { ...state, tables: { ...state.tables, [op.table.id]: op.table } };

    case "DROP_TABLE": {
      // NOTE: deliberately not cascading to columns/constraints/indexes yet.
      // That's a real edge case (Day 4: "table-drop cascade" in the conflict
      // taxonomy) — flagged here on purpose rather than silently handled.
      const { [op.tableId]: _removed, ...tables } = state.tables;
      return { ...state, tables };
    }

    case "ADD_COLUMN": {
      const table = state.tables[op.column.tableId];
      return {
        ...state,
        columns: { ...state.columns, [op.column.id]: op.column },
        tables: {
          ...state.tables,
          [table.id]: { ...table, columnIds: [...table.columnIds, op.column.id] },
        },
      };
    }

    case "DROP_COLUMN": {
      const column = state.columns[op.columnId];
      const { [op.columnId]: _removed, ...columns } = state.columns;
      const table = state.tables[column.tableId];
      return {
        ...state,
        columns,
        tables: {
          ...state.tables,
          [table.id]: {
            ...table,
            columnIds: table.columnIds.filter((id) => id !== op.columnId),
          },
        },
      };
    }

    case "RENAME_COLUMN":
      return {
        ...state,
        columns: {
          ...state.columns,
          [op.columnId]: { ...state.columns[op.columnId], name: op.newName },
        },
      };

    case "RETYPE_COLUMN":
      return {
        ...state,
        columns: {
          ...state.columns,
          [op.columnId]: { ...state.columns[op.columnId], dataType: op.newType },
        },
      };

    case "ADD_CONSTRAINT":
      return {
        ...state,
        constraints: { ...state.constraints, [op.constraint.id]: op.constraint },
      };

    case "DROP_CONSTRAINT": {
      const { [op.constraintId]: _removed, ...constraints } = state.constraints;
      return { ...state, constraints };
    }

    case "ADD_INDEX":
      return { ...state, indexes: { ...state.indexes, [op.index.id]: op.index } };

    case "DROP_INDEX": {
      const { [op.indexId]: _removed, ...indexes } = state.indexes;
      return { ...state, indexes };
    }
  }
}

export function applyOperations(state: SchemaState, ops: Operation[]): SchemaState {
  return ops.reduce(applyOperation, state);
}
