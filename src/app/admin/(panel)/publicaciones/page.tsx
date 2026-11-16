import { pendingListings } from '@/lib/admin/queries';
import { getDb } from '@/lib/db/client';
import { formatUsd } from '@/lib/format';
import { reviewListingAction } from '../actions';
import { FileLink, Flash, type FlashParams } from '../flash';

export default async function ListingsPage({ searchParams }: { searchParams: Promise<FlashParams> }) {
  const rows = await pendingListings(getDb());
  return (
    <main>
      <h1>Publicaciones por verificar</h1>
      <Flash params={await searchParams} />
      {rows.length === 0 ? <p>No hay publicaciones pendientes.</p> : null}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Evento</th><th>Vendedor</th><th>Precio</th><th>Nominal</th><th>Entrega</th><th>Prueba</th><th>Entrada</th><th>Decisión</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.listingId}>
                <td>{r.eventName}</td>
                <td>{r.sellerPhone}</td>
                <td>{formatUsd(r.askCents)}</td>
                <td>{formatUsd(r.faceValueCents)}</td>
                <td>{r.deliveryMode === 'transfer' ? 'Transferencia' : 'Archivo'}</td>
                <td><FileLink path={r.proofPath} label="Ver captura" /></td>
                <td><FileLink path={r.filePath} label="Ver entrada" /></td>
                <td>
                  <form action={reviewListingAction} className="admin-inline">
                    <input type="hidden" name="listingId" value={r.listingId} />
                    <input name="reason" placeholder="Motivo (opcional)" maxLength={500} aria-label="Motivo" />
                    <button className="btn" name="decision" value="verified" type="submit">Verificar</button>
                    <button className="btn danger" name="decision" value="rejected" type="submit">Rechazar</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="admin-muted">Verifica que la captura muestre la entrada a nombre del vendedor en la boletera. No puedes revisar tus propias publicaciones.</p>
    </main>
  );
}
