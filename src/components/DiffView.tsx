import type { SchemaChange } from "../diff.js";

interface Props {
  changes: SchemaChange[];
  fromName: string;
  toName: string;
}

const CHANGE_ICON: Record<SchemaChange["changeType"], string> = {
  added: "+",
  removed: "−",
  renamed: "→",
  modified: "~",
};

// The visual diff. Renames render as `old → new` on one line — the payoff of
// ID-based diffing; a naive name-diff would show these as remove + add.
export function DiffView({ changes, fromName, toName }: Props) {
  if (changes.length === 0) {
    return (
      <div className="empty-state">
        <p>No differences — these branches are in sync.</p>
      </div>
    );
  }

  return (
    <div className="diff-view">
      <p className="diff-summary">
        Comparing <strong>{fromName}</strong> → <strong>{toName}</strong>:{" "}
        {changes.length} change{changes.length === 1 ? "" : "s"}
      </p>
      <ul className="diff-list">
        {changes.map((c, i) => (
          <li key={`${c.elementType}-${c.id}-${i}`} className={`change ${c.changeType}`}>
            <span className="icon">{CHANGE_ICON[c.changeType]}</span>
            <span className="element-type">{c.elementType}</span>
            {c.changeType === "renamed" ? (
              <span className="label">
                <s>{c.nameBefore}</s> → <strong>{c.nameAfter}</strong>
              </span>
            ) : c.changeType === "added" ? (
              <span className="label"><strong>{c.nameAfter ?? c.id}</strong></span>
            ) : c.changeType === "removed" ? (
              <span className="label"><s>{c.nameBefore ?? c.id}</s></span>
            ) : (
              <span className="label">{c.nameBefore ?? c.id}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
