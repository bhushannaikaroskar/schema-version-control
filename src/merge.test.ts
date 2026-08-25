import { describe, it, expect } from "vitest";
import { emptySchema, applyOperations } from "./apply.js";
import type { SchemaState, Operation } from "./types.js";
import { mergeSchemas } from "./merge.js";

// Fixture: users(id c1 email) — built with real operations.
function baseState(): SchemaState {
  return applyOperations(emptySchema(), [
    { type: "CREATE_TABLE", table: { id: "t1", name: "users", columnIds: [] } },
    {
      type: "ADD_COLUMN",
      column: { id: "c1", tableId: "t1", name: "email", dataType: "text", nullable: false },
    },
  ]);
}

describe("mergeSchemas — conflict taxonomy (day0 doc §4)", () => {
  it("case 7: clean auto-merge when branches touch different elements", () => {
    const ours: Operation[] = [
      { type: "RENAME_COLUMN", columnId: "c1", newName: "email_address" },
    ];
    const theirs: Operation[] = [
      { type: "CREATE_TABLE", table: { id: "t2", name: "posts", columnIds: [] } },
    ];

    const result = mergeSchemas(baseState(), ours, theirs);

    expect(result.status).toBe("clean");
    expect(result.schema?.columns["c1"].name).toBe("email_address");
    expect(result.schema?.tables["t2"].name).toBe("posts");
  });

  it("case 1: dual-touch — both branches retype the same column differently", () => {
    const ours: Operation[] = [{ type: "RETYPE_COLUMN", columnId: "c1", newType: "varchar(255)" }];
    const theirs: Operation[] = [{ type: "RETYPE_COLUMN", columnId: "c1", newType: "citext" }];

    const result = mergeSchemas(baseState(), ours, theirs);

    expect(result.status).toBe("conflict");
    expect(result.conflicts[0].type).toBe("dual_touch");
    expect(result.conflicts[0].elementIds).toContain("c1");
  });

  it("case 2: rename vs drop of the same column is a conflict", () => {
    const ours: Operation[] = [{ type: "RENAME_COLUMN", columnId: "c1", newName: "contact" }];
    const theirs: Operation[] = [{ type: "DROP_COLUMN", columnId: "c1" }];

    const result = mergeSchemas(baseState(), ours, theirs);

    expect(result.status).toBe("conflict");
    expect(result.conflicts[0].type).toBe("dual_touch");
  });

  it("case 3: rename vs rename to different names is a conflict", () => {
    const ours: Operation[] = [{ type: "RENAME_COLUMN", columnId: "c1", newName: "contact" }];
    const theirs: Operation[] = [{ type: "RENAME_COLUMN", columnId: "c1", newName: "email_address" }];

    const result = mergeSchemas(baseState(), ours, theirs);

    expect(result.status).toBe("conflict");
    expect(result.conflicts[0].type).toBe("dual_touch");
  });

  it("case 4: dependency — index added on a column the other branch dropped", () => {
    const ours: Operation[] = [
      {
        type: "ADD_INDEX",
        index: { id: "i1", tableId: "t1", columnIds: ["c1"], unique: true },
      },
    ];
    const theirs: Operation[] = [{ type: "DROP_COLUMN", columnId: "c1" }];

    const result = mergeSchemas(baseState(), ours, theirs);

    expect(result.status).toBe("conflict");
    expect(result.conflicts[0].type).toBe("dependency");
  });

  it("case 5: table-drop cascade — column added inside a dropped table", () => {
    // Base now has two tables so dropping t1 doesn't orphan everything.
    const base = applyOperations(baseState(), [
      { type: "CREATE_TABLE", table: { id: "t2", name: "posts", columnIds: [] } },
    ]);
    const ours: Operation[] = [{ type: "DROP_TABLE", tableId: "t2" }];
    const theirs: Operation[] = [
      {
        type: "ADD_COLUMN",
        column: { id: "c2", tableId: "t2", name: "title", dataType: "text", nullable: false },
      },
    ];

    const result = mergeSchemas(base, ours, theirs);

    expect(result.status).toBe("conflict");
    expect(result.conflicts[0].type).toBe("dependency");
  });

  it("case 6: name collision — both branches create a table named 'posts'", () => {
    const ours: Operation[] = [
      { type: "CREATE_TABLE", table: { id: "tA", name: "posts", columnIds: [] } },
    ];
    const theirs: Operation[] = [
      { type: "CREATE_TABLE", table: { id: "tB", name: "posts", columnIds: [] } },
    ];

    const result = mergeSchemas(baseState(), ours, theirs);

    expect(result.status).toBe("conflict");
    expect(result.conflicts[0].type).toBe("name_collision");
  });

  it("same column name added to the SAME table by both branches is a name_collision", () => {
    const ours: Operation[] = [
      {
        type: "ADD_COLUMN",
        column: { id: "c2", tableId: "t1", name: "email", dataType: "text", nullable: true },
      },
    ];
    const theirs: Operation[] = [
      {
        type: "ADD_COLUMN",
        column: { id: "c3", tableId: "t1", name: "email", dataType: "text", nullable: false },
      },
    ];

    const result = mergeSchemas(baseState(), ours, theirs);

    expect(result.status).toBe("conflict");
    expect(result.conflicts[0].type).toBe("name_collision");
  });

  it("same column name in DIFFERENT tables auto-merges (names are per-table namespaces)", () => {
    const base = applyOperations(baseState(), [
      { type: "CREATE_TABLE", table: { id: "t2", name: "posts", columnIds: [] } },
    ]);
    const ours: Operation[] = [
      {
        type: "ADD_COLUMN",
        column: { id: "c2", tableId: "t1", name: "created_at", dataType: "timestamp", nullable: false },
      },
    ];
    const theirs: Operation[] = [
      {
        type: "ADD_COLUMN",
        column: { id: "c3", tableId: "t2", name: "created_at", dataType: "timestamp", nullable: false },
      },
    ];

    const result = mergeSchemas(base, ours, theirs);

    expect(result.status).toBe("clean");
    expect(Object.keys(result.schema?.columns ?? {})).toEqual(
      expect.arrayContaining(["c1", "c2", "c3"]),
    );
  });

  it("operationsToApply excludes ops whose target ours already wrote (safe for repeated merges)", () => {
    // Repeated-merge scenario: ours previously merged in (or independently made)
    // the c2 change; theirs still carries its own copy of it. Both write c2,
    // so v1 flags dual_touch — but when the changes are IDENTICAL there is
    // nothing to resolve, so the engine treats same-write-same-content as clean.
    const sharedOp: Operation = {
      type: "ADD_COLUMN",
      column: { id: "c2", tableId: "t1", name: "age", dataType: "integer", nullable: true },
    };

    // Identical writes of the same element are not a conflict…
    const identical = mergeSchemas(baseState(), [sharedOp], [{ ...sharedOp }]);
    expect(identical.status).toBe("clean");
    expect(identical.operationsToApply).toHaveLength(0);

    // …but different writes of the same element still are.
    const divergent = mergeSchemas(baseState(), [sharedOp], [
      { type: "ADD_COLUMN", column: { id: "c2", tableId: "t1", name: "age", dataType: "integer", nullable: false } },
    ]);
    expect(divergent.status).toBe("conflict");
  });

  it("repro: incoming op targeting an element ALREADY IN our schema is dropped (no duplicate columns)", () => {
    // Scenario from manual testing: test-1 branched from main AFTER main added
    // c2. main's log still contains ADD_COLUMN c2, but test-1's base snapshot
    // already includes it. Merging main into test-1 must NOT re-add c2.
    const mainOps: Operation[] = [
      {
        type: "ADD_COLUMN",
        column: { id: "c2", tableId: "t1", name: "age", dataType: "integer", nullable: true },
      },
    ];
    // test-1's base state already has c2 baked in; its own log is empty.
    const baseWithC2 = applyOperations(baseState(), mainOps);

    const result = mergeSchemas(baseWithC2, [] /* ours */, mainOps /* theirs */);

    expect(result.status).toBe("clean");
    expect(result.operationsToApply).toHaveLength(0);
    // And the schema must contain exactly one "age" column.
    const ageColumns = Object.values(result.schema?.columns ?? {}).filter(
      (c) => c.name === "age",
    );
    expect(ageColumns).toHaveLength(1);
  });

  it("different columns added to the same table auto-merge (containers don't conflict by themselves)", () => {
    const ours: Operation[] = [
      {
        type: "ADD_COLUMN",
        column: { id: "c2", tableId: "t1", name: "name", dataType: "text", nullable: false },
      },
    ];
    const theirs: Operation[] = [
      {
        type: "ADD_COLUMN",
        column: { id: "c3", tableId: "t1", name: "age", dataType: "integer", nullable: true },
      },
    ];

    const result = mergeSchemas(baseState(), ours, theirs);

    expect(result.status).toBe("clean");
    expect(Object.keys(result.schema?.columns ?? {})).toEqual(
      expect.arrayContaining(["c1", "c2", "c3"]),
    );
  });
});
