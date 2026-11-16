import { openDisputes, pendingIdentities, pendingListings, queuedPayouts } from '@/lib/admin/queries';
import { getDb } from '@/lib/db/client';

export default async function AdminHome() {
  const db = getDb();
  const [ids, listings, disputes, payouts] = await Promise.all([
    pendingIdentities(db),
    pendingListings(db),
    openDisputes(db),
    queuedPayouts(db),
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
      <ul>
        {rows.map(([label, n, href]) => (
          <li key={href}>
            <a href={href}>{label}</a>: <strong>{n}</strong>
          </li>
        ))}
      </ul>
    </main>
  );
}
