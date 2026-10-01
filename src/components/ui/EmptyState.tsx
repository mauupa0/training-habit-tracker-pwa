export interface EmptyStateProps {
  /** Rzeczowy, bez żartów. Bez ilustracji, maskotek i wykrzykników. */
  children: string;
}

export function EmptyState({ children }: EmptyStateProps) {
  return (
    <div className="dz-empty">
      <p>{children}</p>
    </div>
  );
}
