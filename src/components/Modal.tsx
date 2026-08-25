import type { ReactNode } from "react";

interface Props {
  title: string;
  children: ReactNode;
  onClose: () => void;
}

// Reusable dialog. Clicking the overlay closes; clicks inside don't propagate.
export function Modal({ title, children, onClose }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </header>
        {children}
      </div>
    </div>
  );
}
