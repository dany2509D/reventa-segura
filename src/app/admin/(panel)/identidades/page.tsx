import { pendingIdentities } from '@/lib/admin/queries';
import { getDb } from '@/lib/db/client';
import { reviewIdentityAction } from '../actions';
import { FileLink, Flash, type FlashParams } from '../flash';

export default async function IdentitiesPage({ searchParams }: { searchParams: Promise<FlashParams> }) {
  const rows = await pendingIdentities(getDb());
  return (
    <main>
      <h1>Identidades por revisar</h1>
      <Flash params={await searchParams} />
      {rows.length === 0 ? <p>No hay identidades pendientes.</p> : null}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Celular</th><th>Cédula / pasaporte</th><th>Selfie</th><th>Decisión</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.userId}>
                <td>{r.phone}</td>
                <td><FileLink path={r.idDocPath} label="Ver documento" /></td>
                <td><FileLink path={r.selfiePath} label="Ver selfie" /></td>
                <td>
                  <form action={reviewIdentityAction} className="admin-inline">
                    <input type="hidden" name="userId" value={r.userId} />
                    <button className="btn" name="decision" value="approved" type="submit">Aprobar</button>
                    <button className="btn danger" name="decision" value="rejected" type="submit">Rechazar</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="admin-muted">Compara la cara de la selfie con el documento. No puedes aprobar tu propia identidad.</p>
    </main>
  );
}
