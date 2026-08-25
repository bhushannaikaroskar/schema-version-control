import { useState } from "react";
import type { SchemaState, Operation, ConstraintType, ID } from "../types.js";
import { Modal } from "./Modal.js";

// Supported data types — a fixed list instead of free text, so users can't
// typo "numer" and create a schema that would fail at migration time.
export const SUPPORTED_TYPES = [
  "text",
  "varchar(255)",
  "integer",
  "bigint",
  "boolean",
  "decimal",
  "float",
  "date",
  "timestamp",
  "uuid",
  "json",
] as const;

interface Props {
  schema: SchemaState;
  onOperate: (op: Operation) => void;
  onCreateTable: (name: string) => void;
}

type Dialog =
  | { kind: "new-table" }
  | { kind: "add-column"; tableId: ID; tableName: string }
  | { kind: "rename-column"; columnId: ID; currentName: string }
  | { kind: "retype-column"; columnId: ID; currentName: string; currentType: string }
  | {
      kind: "add-constraint";
      tableId: ID;
      tableName: string;
      columnIds: ID[];
    }
  | null;

export function SchemaBrowser({ schema, onOperate, onCreateTable }: Props) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const tables = Object.values(schema.tables);

  const close = () => setDialog(null);

  return (
    <div className="schema-browser">
      <button className="new-table" onClick={() => setDialog({ kind: "new-table" })}>
        + New table
      </button>

      {tables.map((table) => (
        <section key={table.id} className="table-card">
          <header>
            <h3>{table.name}</h3>
            <div className="row-actions">
              <button onClick={() => setDialog({ kind: "add-column", tableId: table.id, tableName: table.name })}>
                + column
              </button>
              <button
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
              const constraints = Object.values(schema.constraints).filter((c) =>
                c.columnIds.includes(cid),
              );
              return (
                <li key={cid}>
                  <span className="col-name">{col.name}</span>
                  <span className="col-type">{col.dataType}</span>
                  {constraints.map((c) => (
                    <span key={c.id} className={`badge badge-${c.type.toLowerCase()}`}>
                      {c.type === "PRIMARY_KEY" ? "PK" : c.type === "FOREIGN_KEY" ? "FK" : c.type.replace("_", " ")}
                    </span>
                  ))}
                  {!col.nullable && !constraints.some((c) => c.type === "NOT_NULL") && (
                    <span className="badge">implicit NOT NULL</span>
                  )}
                  <span className="row-actions">
                    <button onClick={() => setDialog({ kind: "rename-column", columnId: cid, currentName: col.name })}>
                      rename
                    </button>
                    <button
                      onClick={() =>
                        setDialog({ kind: "retype-column", columnId: cid, currentName: col.name, currentType: col.dataType })
                      }
                    >
                      retype
                    </button>
                    <button
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

          {/* Constraints section */}
          <footer className="constraints-section">
            <span className="constraints-label">constraints:</span>
            {Object.values(schema.constraints)
              .filter((c) => c.tableId === table.id)
              .map((c) => (
                <span key={c.id} className="constraint-chip">
                  {c.type}
                  {c.type === "FOREIGN_KEY" && c.referencesTableId &&
                    ` → ${schema.tables[c.referencesTableId]?.name ?? c.referencesTableId}`}
                  <button
                    title="Drop constraint"
                    onClick={() => onOperate({ type: "DROP_CONSTRAINT", constraintId: c.id })}
                  >
                    ×
                  </button>
                </span>
              ))}
            <button
              className="constraint-add"
              onClick={() =>
                setDialog({
                  kind: "add-constraint",
                  tableId: table.id,
                  tableName: table.name,
                  columnIds: table.columnIds,
                })
              }
            >
              + add
            </button>
          </footer>
        </section>
      ))}

      {tables.length === 0 && (
        <div className="empty-state">
          <p>No tables yet.</p>
          <button onClick={() => setDialog({ kind: "new-table" })}>Create your first table</button>
        </div>
      )}

      {/* ---------------- Modals ---------------- */}

      {dialog?.kind === "new-table" && (
        <NewTableModal
          existingNames={tables.map((t) => t.name)}
          onSubmit={(name) => {
            onCreateTable(name);
            close();
          }}
          onClose={close}
        />
      )}

      {dialog?.kind === "add-column" && (
        <AddColumnModal
          tableName={dialog.tableName}
          onSubmit={(name, dataType, nullable) => {
            onOperate({
              type: "ADD_COLUMN",
              column: { id: crypto.randomUUID(), tableId: dialog.tableId, name, dataType, nullable },
            });
            close();
          }}
          onClose={close}
        />
      )}

      {dialog?.kind === "rename-column" && (
        <TextModal
          title={`Rename "${dialog.currentName}"`}
          label="New name"
          initialValue={dialog.currentName}
          validate={(v) => (v.trim() ? null : "Name can't be empty")}
          onSubmit={(v) => {
            if (v !== dialog.currentName) {
              onOperate({ type: "RENAME_COLUMN", columnId: dialog.columnId, newName: v });
            }
            close();
          }}
          onClose={close}
        />
      )}

      {dialog?.kind === "retype-column" && (
        <RetypeModal
          columnName={dialog.currentName}
          currentType={dialog.currentType}
          onSubmit={(t) => {
            if (t !== dialog.currentType) {
              onOperate({ type: "RETYPE_COLUMN", columnId: dialog.columnId, newType: t });
            }
            close();
          }}
          onClose={close}
        />
      )}

      {dialog?.kind === "add-constraint" && (
        <ConstraintModal
          tableName={dialog.tableName}
          columns={dialog.columnIds.map((id) => schema.columns[id]).filter(Boolean)}
          tables={Object.values(schema.tables)}
          onSubmit={(op) => {
            onOperate(op);
            close();
          }}
          onClose={close}
        />
      )}
    </div>
  );
}

/* ---------------- Individual modals ---------------- */

function NewTableModal({
  existingNames,
  onSubmit,
  onClose,
}: {
  existingNames: string[];
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const error = existingNames.includes(name.trim())
    ? "A table with this name already exists"
    : name.trim()
      ? null
      : null;

  return (
    <Modal title="New table" onClose={onClose}>
      <form
        className="modal-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && !error) onSubmit(name.trim());
        }}
      >
        <label>
          Table name
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. orders" />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={!name.trim() || !!error}>Create</button>
        </div>
      </form>
    </Modal>
  );
}

function AddColumnModal({
  tableName,
  onSubmit,
  onClose,
}: {
  tableName: string;
  onSubmit: (name: string, dataType: string, nullable: boolean) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [dataType, setDataType] = useState<string>("text");
  const [nullable, setNullable] = useState(true);

  return (
    <Modal title={`Add column to ${tableName}`} onClose={onClose}>
      <form
        className="modal-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSubmit(name.trim(), dataType, nullable);
        }}
      >
        <label>
          Column name
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. email" />
        </label>
        <label>
          Data type
          <select value={dataType} onChange={(e) => setDataType(e.target.value)}>
            {SUPPORTED_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={nullable} onChange={(e) => setNullable(e.target.checked)} />
          Nullable
        </label>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={!name.trim()}>Add column</button>
        </div>
      </form>
    </Modal>
  );
}

function TextModal({
  title,
  label,
  initialValue,
  validate,
  onSubmit,
  onClose,
}: {
  title: string;
  label: string;
  initialValue: string;
  validate?: (v: string) => string | null;
  onSubmit: (v: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const error = validate?.(value) ?? null;

  return (
    <Modal title={title} onClose={onClose}>
      <form
        className="modal-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!error) onSubmit(value);
        }}
      >
        <label>
          {label}
          <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={!!error}>Save</button>
        </div>
      </form>
    </Modal>
  );
}

function RetypeModal({
  columnName,
  currentType,
  onSubmit,
  onClose,
}: {
  columnName: string;
  currentType: string;
  onSubmit: (t: string) => void;
  onClose: () => void;
}) {
  const [dataType, setDataType] = useState(currentType);

  return (
    <Modal title={`Change type of "${columnName}"`} onClose={onClose}>
      <form
        className="modal-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(dataType);
        }}
      >
        <label>
          New data type
          <select value={dataType} onChange={(e) => setDataType(e.target.value)}>
            {SUPPORTED_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <p className="form-hint">Retypes are recorded as operations, so merges treat them like any other change.</p>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary">Change type</button>
        </div>
      </form>
    </Modal>
  );
}

function ConstraintModal({
  tableName,
  columns,
  tables,
  onSubmit,
  onClose,
}: {
  tableName: string;
  columns: { id: ID; name: string }[];
  tables: { id: ID; name: string; columnIds: ID[] }[];
  onSubmit: (op: Operation) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<ConstraintType>("PRIMARY_KEY");
  const [columnId, setColumnId] = useState<ID>(columns[0]?.id ?? "");
  const otherTables = tables.filter((t) => t.name !== tableName);
  const [refTableId, setRefTableId] = useState<ID>(otherTables[0]?.id ?? "");
  const refTable = otherTables.find((t) => t.id === refTableId);
  const [refColumnId, setRefColumnId] = useState<ID>(refTable?.columnIds[0] ?? "");

  const needsReference = type === "FOREIGN_KEY";

  return (
    <Modal title={`Add constraint to ${tableName}`} onClose={onClose}>
      <form
        className="modal-form"
        onSubmit={(e) => {
          e.preventDefault();
          const tableId = tables.find((t) => t.name === tableName)?.id;
          if (!tableId) return;
          onSubmit({
            type: "ADD_CONSTRAINT",
            constraint: {
              id: crypto.randomUUID(),
              type,
              tableId,
              columnIds: [columnId],
              ...(needsReference ? { referencesTableId: refTableId, referencesColumnId: refColumnId } : {}),
            },
          });
        }}
      >
        <label>
          Type
          <select value={type} onChange={(e) => setType(e.target.value as ConstraintType)}>
            <option value="PRIMARY_KEY">PRIMARY KEY</option>
            <option value="UNIQUE">UNIQUE</option>
            <option value="NOT_NULL">NOT NULL</option>
            <option value="FOREIGN_KEY">FOREIGN KEY →</option>
          </select>
        </label>
        <label>
          Column
          <select value={columnId} onChange={(e) => setColumnId(e.target.value)}>
            {columns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        {needsReference && (
          <>
            <label>
              References table
              <select
                value={refTableId}
                onChange={(e) => {
                  setRefTableId(e.target.value);
                  const t = otherTables.find((x) => x.id === e.target.value);
                  setRefColumnId(t?.columnIds[0] ?? "");
                }}
              >
                {otherTables.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
            <label>
              References column
              <select value={refColumnId} onChange={(e) => setRefColumnId(e.target.value)}>
                {(refTable?.columnIds ?? []).map((cid) => (
                  <option key={cid} value={cid}>{columns.find((c) => c.id === cid)?.name ?? cid}</option>
                ))}
              </select>
            </label>
          </>
        )}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={!columnId || (needsReference && !refColumnId)}>
            Add constraint
          </button>
        </div>
      </form>
    </Modal>
  );
}
