import type { SchemaState, Operation } from "../types.js";

interface Props {
  schema: SchemaState;
  onOperate: (op: Operation) => void;
  onCreateTable: () => void;
}

// The schema browser: tables with their columns. Each column row offers the
// mutations that make sense for it — rename, retype, drop — so every action
// a user can take maps 1:1 to an engine operation.
export function SchemaBrowser({ schema, onOperate, onCreateTable }: Props) {
  const tables = Object.values(schema.tables);

  if (tables.length === 0) {
    return (
      <div className="empty-state">
        <p>No tables yet.</p>
        <button onClick={onCreateTable}>Create your first table</button>
      </div>
    );
  }

  const addColumn = (tableId: string) => {
    const name = prompt("Column name:");
    if (!name?.trim()) return;
    const dataType = prompt("Data type:", "text") ?? "text";
    onOperate({
      type: "ADD_COLUMN",
      column: { id: crypto.randomUUID(), tableId, name: name.trim(), dataType, nullable: true },
    });
  };

  return (
    <div className="schema-browser">
      <button className="new-table" onClick={onCreateTable}>+ New table</button>
      {tables.map((table) => (
        <section key={table.id} className="table-card">
          <header>
            <h3>{table.name}</h3>
            <div className="row-actions">
              <button title="Add column" onClick={() => addColumn(table.id)}>+ column</button>
              <button
                title="Drop table"
                className="danger"
                onClick={() => {
                  if (confirm(`Drop table "${table.name}"?`)) {
                    onOperate({ type: "DROP_TABLE", tableId: table.id });
                  }
                }}
              >
                drop
              </button>
            </div>
          </header>
          <ul>
            {table.columnIds.map((cid) => {
              const col = schema.columns[cid];
              if (!col) return null;
              return (
                <li key={cid}>
                  <span className="col-name">{col.name}</span>
                  <span className="col-type">{col.dataType}</span>
                  {!col.nullable && <span className="badge">NOT NULL</span>}
                  <span className="row-actions">
                    <button
                      title="Rename"
                      onClick={() => {
                        const newName = prompt("New name:", col.name);
                        if (newName?.trim() && newName !== col.name) {
                          onOperate({ type: "RENAME_COLUMN", columnId: cid, newName: newName.trim() });
                        }
                      }}
                    >
                      rename
                    </button>
                    <button
                      title="Retype"
                      onClick={() => {
                        const newType = prompt("New type:", col.dataType);
                        if (newType?.trim() && newType !== col.dataType) {
                          onOperate({ type: "RETYPE_COLUMN", columnId: cid, newType: newType.trim() });
                        }
                      }}
                    >
                      retype
                    </button>
                    <button
                      title="Drop"
                      className="danger"
                      onClick={() => {
                        if (confirm(`Drop column "${col.name}"?`)) {
                          onOperate({ type: "DROP_COLUMN", columnId: cid });
                        }
                      }}
                    >
                      drop
                    </button>
                  </span>
                </li>
              );
            })}
            {table.columnIds.length === 0 && <li className="muted">no columns</li>}
          </ul>
        </section>
      ))}
    </div>
  );
}
