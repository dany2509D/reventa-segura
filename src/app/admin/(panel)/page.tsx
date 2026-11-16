import { openDisputes, pendingIdentities, pendingListings, queuedPayouts } from '@/lib/admin/queries';
import { getDb } from '@/lib/db/client';
import { requireAdminPage } from '../session';

export default async function AdminHome() {
  // Next can render a page without running its layout: the page gates itself.
  const actor = await requireAdminPage();
  const db = getDb();
  const [ids, listings, disputes, payouts] = await Promise.all([
    pendingIdentities(getDb(), actor),
    pendingListings(getDb(), actor),
    openDisputes(getDb(), actor),
    queuedPayouts(getDb(), actor),
  ]);
  const rows: [string, number, string][] = [
    ['Identidades por revisar', ids.length, '/admin/identidades'],
    ['Publicaciones por verificar', listings.length, '/admin/publicaciones'],
    ['Disputas abiertas', disputes.length, '/admin/disputas'],
    ['Pagos a vendedores en cola', payouts.length, '/admin/pagos'],
  ];
  return (
    <main>
      <h1>Resumen</h1>
      <ul className="admin-stats">
        {rows.map(([label, n, href]) => (
          <li key={href}>
            <a className="admin-stat" href={href}>
              <span>{label}</span>
              <strong>{n}</strong>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
