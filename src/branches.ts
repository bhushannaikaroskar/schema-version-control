import type { SchemaState, Operation } from "./types.js";
import { applyOperations } from "./apply.js";

// A branch never stores its current schema — it DERIVES it by replaying its
// operation log over the base snapshot. The log is the single source of truth;
// diff and merge will read from these logs later, so keeping them authoritative
// (rather than storing derived state) is what makes this cheap and correct.

export interface Branch {
  id: string;
  name: string;
  baseState: SchemaState; // schema at the branch point
  operations: Operation[]; // everything applied since
}


// Branch ids are UUIDs, not a module-level counter. A counter resets on every
// page load / new session, so two users (or two tabs) would both mint "b1" —
// an id collision, which is precisely what this design exists to prevent.
// crypto.randomUUID() is unique across sessions and machines with no coordination.
export function createBranch(name: string, baseState: SchemaState): Branch {
  return { id: crypto.randomUUID(), name, baseState, operations: [] };
}

// Immutable append: returns a NEW branch. Two branches sharing a base must
// never be able to affect each other's history.
export function commit(branch: Branch, op: Operation): Branch {
  return { ...branch, operations: [...branch.operations, op] };
}

export function currentSchema(branch: Branch): SchemaState {
  return applyOperations(branch.baseState, branch.operations);
}
