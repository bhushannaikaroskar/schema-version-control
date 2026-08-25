import { useEffect, useState } from "react";
import type { Operation } from "./types.js";
import {
  createBranch,
  commit,
  currentSchema,
  type Branch,
} from "./branches.js";
import { diffSchemas, type SchemaChange } from "./diff.js";
import { mergeSchemas, type MergeResult } from "./merge.js";
import { emptySchema, applyOperations } from "./apply.js";
import { SchemaBrowser } from "./components/SchemaBrowser.js";
import { DiffView } from "./components/DiffView.js";
import { MergeView } from "./components/MergeView.js";

// ---------------------------------------------------------------------------
// Demo seed: builds a realistic starting project so the first-run experience
// shows something meaningful instead of an empty screen.
// ---------------------------------------------------------------------------

function seedProject(): ProjectState {
  const base = applyOperations(emptySchema(), [
    { type: "CREATE_TABLE", table: { id: "t1", name: "users", columnIds: [] } },
    {
      type: "ADD_COLUMN",
      column: { id: "c1", tableId: "t1", name: "email", dataType: "text", nullable: false },
    },
    {
      type: "ADD_COLUMN",
      column: { id: "c2", tableId: "t1", name: "name", dataType: "text", nullable: true },
    },
    { type: "CREATE_TABLE", table: { id: "t2", name: "posts", columnIds: [] } },
    {
      type: "ADD_COLUMN",
      column: { id: "c3", tableId: "t2", name: "title", dataType: "text", nullable: false },
    },
  ]);

  const main = createBranch("main", base);

  // A feature branch with a rename + a new table — enough to make the diff view interesting.
  let feature = createBranch("feature/contact-info", base);
  feature = commit(feature, { type: "RENAME_COLUMN", columnId: "c2", newName: "full_name" });
  feature = commit(feature, {
    type: "CREATE_TABLE",
    table: { id: "t3", name: "comments", columnIds: [] },
  });
  feature = commit(feature, {
    type: "ADD_COLUMN",
    column: { id: "c4", tableId: "t3", name: "body", dataType: "text", nullable: false },
  });

  return { branches: [main, feature], activeBranchId: main.id };
}

// ---------------------------------------------------------------------------
// App state + localStorage persistence
// ---------------------------------------------------------------------------

interface ProjectState {
  branches: Branch[];
  activeBranchId: string;
}

const STORAGE_KEY = "schema-vc-project-v1";

function loadProject(): ProjectState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ProjectState;
  } catch {
    // corrupted storage → fall through to seed; the log is truth, cache is disposable
  }
  return seedProject();
}

function saveProject(state: ProjectState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

type Panel = "schema" | "diff" | "merge";

export default function App() {
  const [project, setProject] = useState<ProjectState>(loadProject);
  const [panel, setPanel] = useState<Panel>("schema");
  const [diffTargetId, setDiffTargetId] = useState<string | null>(null);

  useEffect(() => saveProject(project), [project]);

  const activeBranch =
    project.branches.find((b) => b.id === project.activeBranchId) ?? project.branches[0];

  const updateBranch = (updated: Branch) =>
    setProject((p) => ({
      ...p,
      branches: p.branches.map((b) => (b.id === updated.id ? updated : b)),
    }));

  const handleCreateBranch = () => {
    const name = prompt("Branch name:");
    if (!name?.trim()) return;
    const branch = createBranch(name.trim(), currentSchema(activeBranch));
    setProject((p) => ({ ...p, branches: [...p.branches, branch], activeBranchId: branch.id }));
    setPanel("schema");
  };

  const handleOperation = (op: Operation) => updateBranch(commit(activeBranch, op));

  const handleCreateTable = () => {
    const name = prompt("Table name:");
    if (!name?.trim()) return;
    handleOperation({
      type: "CREATE_TABLE",
      table: { id: crypto.randomUUID(), name: name.trim(), columnIds: [] },
    });
  };

  const diffTarget = project.branches.find((b) => b.id === diffTargetId);
  let changes: SchemaChange[] = [];
  if (diffTarget && diffTarget.id !== activeBranch.id) {
    changes = diffSchemas(currentSchema(activeBranch), currentSchema(diffTarget));
  }

  let mergeResult: MergeResult | null = null;
  if (diffTarget && diffTarget.id !== activeBranch.id) {
    // Merging diffTarget INTO activeBranch: ours = activeBranch, theirs = diffTarget.
    // Base approximates the shared ancestor (the point activeBranch forked).
    mergeResult = mergeSchemas(
      activeBranch.baseState,
      activeBranch.operations,
      diffTarget.operations,
    );
  }

  // Applying a clean merge: append only what the engine says is new.
  // The engine guarantees operationsToApply never duplicates elements,
  // even across repeated merges — no frontend-side guarding needed.
  const handleApplyMerge = () => {
    if (!mergeResult || mergeResult.status !== "clean") return;
    updateBranch({
      ...activeBranch,
      operations: [...activeBranch.operations, ...mergeResult.operationsToApply],
    });
    setDiffTargetId(null);
    setPanel("schema");
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <h1 className="logo">schema-vc</h1>
        <div className="branch-list">
          {project.branches.map((b) => (
            <button
              key={b.id}
              className={`branch ${b.id === activeBranch.id ? "active" : ""}`}
              onClick={() => setProject((p) => ({ ...p, activeBranchId: b.id }))}
            >
              <span className="branch-icon">⑂</span> {b.name}
            </button>
          ))}
        </div>
        <button className="new-branch" onClick={handleCreateBranch}>
          + New branch
        </button>
      </aside>

      <main className="main">
        <header className="toolbar">
          <h2>{activeBranch.name}</h2>
          <nav className="tabs">
            <button className={panel === "schema" ? "tab active" : "tab"} onClick={() => setPanel("schema")}>
              Schema
            </button>
            <select
              className="tab"
              value={diffTargetId ?? ""}
              onChange={(e) => {
                setDiffTargetId(e.target.value || null);
                setPanel(e.target.value ? "diff" : "schema");
              }}
            >
              <option value="">Compare with…</option>
              {project.branches
                .filter((b) => b.id !== activeBranch.id)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
            {/* Merge is only meaningful when a comparison target is selected. */}
            <button
              className="tab"
              disabled={!diffTargetId}
              title={diffTargetId ? `Merge ${diffTarget?.name} into ${activeBranch.name}` : "Pick a branch to compare first"}
              onClick={() => setPanel("merge")}
            >
              Merge…
            </button>
          </nav>
        </header>

        {panel === "schema" && (
          <SchemaBrowser
            schema={currentSchema(activeBranch)}
            onOperate={handleOperation}
            onCreateTable={handleCreateTable}
          />
        )}
        {panel === "diff" && (
          <DiffView changes={changes} fromName={activeBranch.name} toName={diffTarget?.name ?? ""} />
        )}
        {panel === "merge" && mergeResult && (
          <MergeView
            result={mergeResult}
            theirName={diffTarget?.name ?? ""}
            onApply={handleApplyMerge}
          />
        )}
      </main>
    </div>
  );
}
