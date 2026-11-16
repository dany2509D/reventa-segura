import { allEvents } from '@/lib/admin/queries';
import { getDb } from '@/lib/db/client';
import { requireAdminPage } from '../../session';
import { formatPanamaDateTime, formatUsd } from '@/lib/format';
import { cancelEventAction, createEventAction } from '../actions';
import { Flash, type FlashParams } from '../flash';

export default async function EventsPage({ searchParams }: { searchParams: Promise<FlashParams> }) {
  // Next can render a page without running its layout: the page gates itself.
  const actor = await requireAdminPage();
  const rows = await allEvents(getDb(), actor);
  return (
    <main>
      <h1>Eventos</h1>
      <Flash params={await searchParams} />

      <h2>Nuevo evento</h2>
      <form action={createEventAction} className="admin-form">
        <label>Nombre<input name="name" required maxLength={200} /></label>
        <label>Lugar<input name="venue" required maxLength={200} /></label>
        <label>Latitud<input name="lat" inputMode="decimal" required placeholder="8.9936" /></label>
        <label>Longitud<input name="lng" inputMode="decimal" required placeholder="-79.5197" /></label>
        <label>Radio del recinto (metros, 50–5000)<input name="radiusM" inputMode="numeric" required defaultValue="400" /></label>
        <label>Inicio (hora de Panamá)<input name="startsAt" type="datetime-local" required /></label>
        <label>Valor nominal de la entrada (USD)<input name="faceValue" inputMode="decimal" required placeholder="85.00" /></label>
        <label><input name="allowsTransfer" type="checkbox" defaultChecked /> La boletera permite transferir entradas</label>
        <label><input name="resaleProhibited" type="checkbox" /> El evento prohíbe la reventa</label>
        <button className="btn" type="submit">Crear evento</button>
      </form>

      <h2>Todos los eventos</h2>
      {rows.length === 0 ? <p>Todavía no hay eventos.</p> : null}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Evento</th><th>Inicio</th><th>Nominal</th><th>Estado</th><th>Cancelar</th></tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td>{e.name}<div className="admin-muted">{e.venue}</div></td>
                <td>{formatPanamaDateTime(e.startsAt)}</td>
                <td>{formatUsd(e.faceValueCents)}</td>
                <td>{e.status === 'cancelled' ? 'Cancelado' : 'Activo'}{e.resaleProhibited ? ' · reventa prohibida' : ''}</td>
                <td>
                  <form action={cancelEventAction} className="admin-inline">
                    <input type="hidden" name="eventId" value={e.id} />
                    <label><input name="confirm" type="checkbox" /> Confirmo: reembolsa todas las órdenes</label>
                    <button className="btn danger" type="submit">{e.status === 'cancelled' ? 'Reintentar reembolsos' : 'Cancelar evento'}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
