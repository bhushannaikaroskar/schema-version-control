import type { MergeResult } from "../merge.js";

interface Props {
  result: MergeResult;
  theirName: string;
  onApply: () => void;
}

// The merge preview. Conflicts render as cards explaining WHAT clashed and WHY,
// not just "merge failed" — the UX answer to conservative conflict detection.
export function MergeView({ result, theirName, onApply }: Props) {
  if (result.status === "clean") {
    return (
      <div className="merge-view clean">
        <div className="merge-banner ok">
          ✓ Clean merge — all changes from <strong>{theirName}</strong> apply without conflicts.
        </div>
        <button className="apply-merge" onClick={onApply}>
          Apply merge
        </button>
        <pre className="merged-ops">{JSON.stringify(result.operations, null, 2)}</pre>
      </div>
    );
  }

  return (
    <div className="merge-view conflict">
      <div className="merge-banner bad">
        ✕ Cannot merge automatically — {result.conflicts.length} conflict
        {result.conflicts.length === 1 ? "" : "s"} with <strong>{theirName}</strong>.
      </div>
      <ul className="conflict-list">
        {result.conflicts.map((c, i) => (
          <li key={i} className={`conflict-card ${c.type}`}>
            <span className="conflict-type">{c.type.replace("_", " ")}</span>
            <p>{c.message}</p>
            <code>{c.elementIds.join(", ")}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}
