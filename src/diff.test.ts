import { describe, it, expect } from "vitest";
import { emptySchema, applyOperation, applyOperations } from "./apply.js";
import type { SchemaState } from "./types.js";
import { diffSchemas } from "./diff.js";

function baseState(): SchemaState {
  let state = applyOperation(emptySchema(), {
    type: "CREATE_TABLE",
    table: { id: "t1", name: "users", columnIds: [] },
  });
  return applyOperation(state, {
    type: "ADD_COLUMN",
    column: { id: "c1", tableId: "t1", name: "email", dataType: "text", nullable: false },
  });
}

describe("diffSchemas", () => {
  it("reports no changes for identical states", () => {
    const s = baseState();
    expect(diffSchemas(s, s)).toEqual([]);
  });

  it("detects an added table and an added column", () => {
    let after = applyOperation(baseState(), {
      type: "CREATE_TABLE",
      table: { id: "t2", name: "posts", columnIds: [] },
    });
    after = applyOperation(after, {
      type: "ADD_COLUMN",
      column: { id: "c2", tableId: "t2", name: "title", dataType: "text", nullable: false },
    });

    const changes = diffSchemas(baseState(), after);
    expect(changes).toContainEqual({
      elementType: "table",
      changeType: "added",
      id: "t2",
      nameAfter: "posts",
    });
    expect(changes).toContainEqual({
      elementType: "column",
      changeType: "added",
      id: "c2",
      nameAfter: "title",
    });
  });

  it("detects a removal", () => {
    const before = baseState();
    const after = applyOperation(before, { type: "DROP_COLUMN", columnId: "c1" });

    const changes = diffSchemas(before, after);
    expect(changes).toContainEqual({
      elementType: "column",
      changeType: "removed",
      id: "c1",
      nameBefore: "email",
    });
  });

  it("reports a rename as ONE renamed change, not removed+added (the whole point)", () => {
    const before = baseState();
    const after = applyOperation(before, {
      type: "RENAME_COLUMN",
      columnId: "c1",
      newName: "email_address",
    });

    const changes = diffSchemas(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({
      elementType: "column",
      changeType: "renamed",
      id: "c1",
      nameBefore: "email",
      nameAfter: "email_address",
    });
  });

  it("reports a retype as modified with unchanged name", () => {
    const before = baseState();
    const after = applyOperation(before, {
      type: "RETYPE_COLUMN",
      columnId: "c1",
      newType: "varchar(255)",
    });

    const changes = diffSchemas(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0].changeType).toBe("modified");
    expect(changes[0].nameBefore).toBe("email");
    expect(changes[0].nameAfter).toBe("email");
  });

  it("reports rename + retype together as one modified change", () => {
    const before = baseState();
    const after = applyOperations(before, [
      { type: "RENAME_COLUMN", columnId: "c1", newName: "contact" },
      { type: "RETYPE_COLUMN", columnId: "c1", newType: "varchar(255)" },
    ]);

    const changes = diffSchemas(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0].changeType).toBe("modified");
    expect(changes[0].nameBefore).toBe("email");
    expect(changes[0].nameAfter).toBe("contact");
  });

  it("diffs two branches that diverged from a common ancestor", () => {
    // main adds posts.title; feature renames users.email — diff must show both.
    const ancestor = baseState();

    const main = applyOperations(ancestor, [
      { type: "CREATE_TABLE", table: { id: "t2", name: "posts", columnIds: [] } },
      {
        type: "ADD_COLUMN",
        column: { id: "c2", tableId: "t2", name: "title", dataType: "text", nullable: false },
      },
    ]);
    const feature = applyOperation(ancestor, {
      type: "RENAME_COLUMN",
      columnId: "c1",
      newName: "email_address",
    });

    const changes = diffSchemas(main, feature);
    // Diffing main → feature: main's extra elements are "removed" relative to
    // feature; feature's rename shows as "renamed". Direction matters.
    expect(changes).toHaveLength(3);
    expect(changes.map((c) => c.changeType).sort()).toEqual(["removed", "removed", "renamed"]);

    // And the reverse direction reports them as additions instead.
    const reverse = diffSchemas(feature, main);
    expect(reverse.map((c) => c.changeType).sort()).toEqual(["added", "added", "renamed"]);
  });
});
