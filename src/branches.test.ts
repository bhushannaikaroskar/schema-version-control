import { describe, it, expect } from "vitest";
import { emptySchema, applyOperation } from "./apply.js";
import type { SchemaState } from "./types.js";
import { createBranch, commit, currentSchema } from "./branches.js";

// Shared fixture: a "users" table with one column, built via real operations
// so tests exercise the same path production code takes.
function usersTableState(): SchemaState {
  let state = applyOperation(emptySchema(), {
    type: "CREATE_TABLE",
    table: { id: "t1", name: "users", columnIds: [] },
  });
  state = applyOperation(state, {
    type: "ADD_COLUMN",
    column: { id: "c1", tableId: "t1", name: "email", dataType: "text", nullable: false },
  });
  return state;
}

describe("branches", () => {
  it("mints unique branch ids (no counter that resets across sessions)", () => {
    const base = usersTableState();
    const ids = new Set(Array.from({ length: 100 }, () => createBranch("b", base).id));
    // A resetting counter would collapse these to a handful of values.
    expect(ids.size).toBe(100);
  });

  it("starts with no operations and derives its schema from the base state", () => {
    const base = usersTableState();
    const branch = createBranch("main", base);

    expect(branch.operations).toEqual([]);
    expect(currentSchema(branch)).toEqual(base);
  });

  it("committing to one branch does not affect another branch sharing history", () => {
    const base = usersTableState();
    const main = createBranch("main", base);
    const feature = createBranch("feature/add-name", base);

    // Only feature commits — main must stay untouched.
    const featureAfterCommit = commit(feature, {
      type: "RENAME_COLUMN",
      columnId: "c1",
      newName: "email_address",
    });

    expect(currentSchema(main).columns["c1"].name).toBe("email");
    expect(currentSchema(featureAfterCommit).columns["c1"].name).toBe("email_address");
    // The original branch object is untouched too (immutability).
    expect(currentSchema(feature).columns["c1"].name).toBe("email");
  });

  it("currentSchema reflects a sequence of committed operations in order", () => {
    let branch = createBranch("dev", emptySchema());
    branch = commit(branch, { type: "CREATE_TABLE", table: { id: "t2", name: "posts", columnIds: [] } });
    branch = commit(branch, {
      type: "ADD_COLUMN",
      column: { id: "c2", tableId: "t2", name: "title", dataType: "text", nullable: false },
    });

    const schema = currentSchema(branch);

    expect(schema.tables["t2"].name).toBe("posts");
    expect(schema.columns["c2"].name).toBe("title");
    expect(schema.tables["t2"].columnIds).toContain("c2");
  });

  it("a rename committed on a branch preserves the column's id", () => {
    const branch = createBranch("rename-branch", usersTableState());
    const renamed = commit(branch, {
      type: "RENAME_COLUMN",
      columnId: "c1",
      newName: "email_address",
    });

    const schema = currentSchema(renamed);
    expect(schema.columns["c1"].name).toBe("email_address");
    expect(schema.columns["c1"].id).toBe("c1");
  });
});
