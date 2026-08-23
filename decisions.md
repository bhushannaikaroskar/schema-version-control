# decisions.md

Running log of the real calls made while building this project. Not a changelog —
each entry captures what was chosen, what was rejected, and why.

## Decision: Schema elements use persistent internal IDs, separate from names
- **Alternatives considered:** Snapshot diffing by name (naive git-style diff of two schema states).
- **Reasoning:** With name-based diffing, a rename is indistinguishable from drop+add — the diff engine has to *guess* intent. With permanent IDs, a rename is just an operation on an ID; identity survives renames across branches, which is exactly what merge correctness depends on.
- **Trade-off accepted:** Every element carries an extra `id` field, and the UI must remember to show names (what users know) while the engine reasons about IDs (what the machine knows).

## Decision: Track operations (event log), not snapshots
- **Alternatives considered:** Storing only before/after snapshots per branch.
- **Reasoning:** Operations make diffing an ID-set comparison instead of structural guessing, and make each conflict-taxonomy case directly testable. A branch's state is just `fold(operations, baseSnapshot)` — the operation log is always the single source of truth.
- **Trade-off accepted:** Replay must be deterministic; invalid operation sequences are possible and need validation at apply time rather than being impossible by construction.

## Decision: Conflict policy v1 — any dual-touch on an element = conflict
- **Alternatives considered:** Property-level auto-merge (e.g., one branch renames while the other retypes the same column → both apply).
- **Reasoning:** The conservative rule is easy to implement correctly, easy to test exhaustively against all 7 taxonomy cases, and easy to explain to users. False-positive conflicts are annoying but safe; silent bad merges are neither.
- **Trade-off accepted:** More conflicts than strictly necessary in v1.
- **Planned upgrade:** After core merge + UI ship, upgrade to property-level auto-merge for non-overlapping properties on the same element, keeping hard conflicts for true clashes (rename→A vs rename→B, edit-vs-drop). This is the deliberate "go deep" stretch goal, gated behind a working UI because a brilliant engine nobody can see loses to a good engine with a clear diff/merge view.

## Decision: No backend — pure TypeScript engine + client-side app
- **Alternatives considered:** Node/Express API with a database for persistence.
- **Reasoning:** The artifact under version control is the schema itself; nothing in the problem requires multi-user server state. An in-memory engine keeps deploy trivial (static hosting), keeps tests fast and browser-free, and focuses all effort on the hard part: diff/merge correctness.
- **Trade-off accepted:** State lives in localStorage with JSON export/import instead of a real database; concurrent multi-user editing is out of scope.

## Decision: Branches derive state by replaying the operation log (no stored current state)
- **Alternatives considered:** Storing the derived schema on the branch and updating it on every commit.
- **Reasoning:** The operation log is the single source of truth that diff and merge read from; storing derived state would create a second representation that can drift out of sync. Replay cost is a non-issue at schema scale — a real database accumulates thousands of DDL operations over years, and folding those is microseconds.
- **Trade-off accepted:** Naive replay is O(history) per read. At production scale this is solved with snapshotting (persist a full state snapshot every N operations, replay only what came after — the same trick git packfiles and database WAL checkpoints use). Deliberately not built here: the log stays authoritative, a snapshot cache would be a pure optimization that can always be rebuilt from the log, and schema histories are too small for it to matter in a 5-day build.

## Decision: Branch IDs are client-generated UUIDs; ingest boundaries must validate
- **Alternatives considered:** Server-assigned IDs (rejected: no backend by design); content-addressed IDs à la git (the strongest option — ID derived from content hash so users can't choose it — but overkill while state lives in one browser).
- **Reasoning:** crypto.randomUUID() makes collisions negligible (~2^122 space), but client-generated identity means uniqueness can only be *verified*, never guaranteed, once projects are shared. The defense-in-depth rule: never trust client-supplied identity at an ingest boundary.
- **Trade-off accepted:** If this ever became multi-user, either a server would need to verify uniqueness on push, or IDs should become content-derived hashes.
- **Concrete consequence:** when JSON import/export lands, the import function validates input and rejects duplicate branch/table/column IDs — import is this app's "push".

## Deliberately cut
- Row data / migration safety — out of scope per the problem statement ("the artifact under version control is the schema itself").
- CHECK constraints with arbitrary expressions — parsing SQL expressions is a rabbit hole with no payoff for the version-control core.
- Views, triggers, stored procedures, sequences — catalog breadth isn't the hard part; branch/diff/merge is.
- Table renaming — structurally identical to column rename; will add only if time remains, decided once, not revisited.

## Environment note
`npm audit` reports 5 vulnerabilities, all in dev-only tooling (vitest/esbuild chain). Not force-fixed (`npm audit fix --force` would jump vitest major versions mid-build); these packages never ship to production.
