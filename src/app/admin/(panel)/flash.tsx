export type FlashParams = { ok?: string; error?: string };

/** Result message of the last admin action (set by the server actions' redirect). */
export function Flash({ params }: { params: FlashParams }) {
  if (params.error) return <p role="alert" className="admin-error">{params.error}</p>;
  if (params.ok) return <p role="status" className="admin-ok">{params.ok}</p>;
  return null;
}

/** Link to a private file: the route mints a 60-second signed URL on click and audits the read. */
export function FileLink({ path, label }: { path: string | null; label: string }) {
  if (!path) return <span className="admin-muted">—</span>;
  return (
    <a href={`/api/admin/files?path=${encodeURIComponent(path)}`} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  );
}
