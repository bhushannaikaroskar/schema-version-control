import { describe, it, expect } from "vitest";
import { applyOperation, applyOperations, emptySchema } from "./apply.js";

describe("applyOperation", () => {
  it("creates a table", () => {
    const state = applyOperation(emptySchema(), {
      type: "CREATE_TABLE",
      table: { id: "t1", name: "users", columnIds: [] },
    });
    expect(state.tables["t1"].name).toBe("users");
  });

  it("adds a column and links it to its table", () => {
    const state = applyOperations(emptySchema(), [
      { type: "CREATE_TABLE", table: { id: "t1", name: "users", columnIds: [] } },
      {
        type: "ADD_COLUMN",
        column: { id: "c1", tableId: "t1", name: "email", dataType: "text", nullable: false },
      },
    ]);
    expect(state.columns["c1"].name).toBe("email");
    expect(state.tables["t1"].columnIds).toContain("c1");
  });

  it("renaming a column preserves its id (this is the whole point)", () => {
    let state = applyOperations(emptySchema(), [
      { type: "CREATE_TABLE", table: { id: "t1", name: "users", columnIds: [] } },
      {
        type: "ADD_COLUMN",
        column: { id: "c1", tableId: "t1", name: "email", dataType: "text", nullable: false },
      },
    ]);
    state = applyOperation(state, { type: "RENAME_COLUMN", columnId: "c1", newName: "email_address" });

    expect(state.columns["c1"].name).toBe("email_address");
    expect(state.columns["c1"].id).toBe("c1");
    // A rename is one operation on a stable id — not a drop + add that a
    // naive snapshot diff would have to *guess* was really a rename.
  });

  it("dropping a column removes it from its table's columnIds", () => {
    let state = applyOperations(emptySchema(), [
      { type: "CREATE_TABLE", table: { id: "t1", name: "users", columnIds: [] } },
      {
        type: "ADD_COLUMN",
        column: { id: "c1", tableId: "t1", name: "email", dataType: "text", nullable: false },
      },
    ]);
    state = applyOperation(state, { type: "DROP_COLUMN", columnId: "c1" });

    expect(state.columns["c1"]).toBeUndefined();
    expect(state.tables["t1"].columnIds).not.toContain("c1");
  });

  it("does not mutate the input state (branches must stay independent)", () => {
    const original = applyOperation(emptySchema(), {
      type: "CREATE_TABLE",
      table: { id: "t1", name: "users", columnIds: [] },
    });
    const next = applyOperation(original, {
      type: "ADD_COLUMN",
      column: { id: "c1", tableId: "t1", name: "email", dataType: "text", nullable: false },
    });

    expect(original.tables["t1"].columnIds).toEqual([]); // unchanged
    expect(next.tables["t1"].columnIds).toEqual(["c1"]);
  });
});
