'use client';

import { useState, type FormEvent } from 'react';
import { errorText, postMultipart } from '@/lib/client/http';
import { prepareImage } from '@/lib/client/image';

type Coords = { lat: number; lng: number } | null;

// Location is a supporting signal only: it is asked for at the moment of use, and the form works
// if the person declines or the phone cannot get a fix indoors.
function getCoords(): Promise<Coords> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  });
}

export default function EntryForm({ orderId }: { orderId: string }) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { geoOk: boolean }>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!photo) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set('photo', await prepareImage(photo));
      const coords = await getCoords();
      if (coords) {
        fd.set('lat', String(coords.lat));
        fd.set('lng', String(coords.lng));
      }
      const r = await postMultipart(`/api/orders/${orderId}/entry`, fd);
      if (r.ok) setDone({ geoOk: r.data.geoOk === true });
      else setError(errorText(r));
    } catch {
      setError('No pudimos preparar la foto. Prueba con otra.');
    }
    setBusy(false);
  }

  if (done) {
    return (
      <div className="card pastel tone-mint">
        <h3>¡Ingreso confirmado!</h3>
        <p>Gracias. Si hubo algún problema con la entrada, puedes avisarnos desde Mis órdenes hasta que cierre la ventana de disputas.</p>
        {!done.geoOk ? <p className="muted">No pudimos verificar tu ubicación, pero tu confirmación quedó registrada.</p> : null}
        <a className="btn" href="/mis-ordenes">Ir a mis órdenes</a>
      </div>
    );
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>
        Foto del escaneo de tu entrada
        <input type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} required />
      </label>
      <p className="muted">Te pediremos tu ubicación solo para comprobar que estás en el recinto. Si no la compartes, igual puedes confirmar.</p>
      {error ? <p role="alert" className="error">{error}</p> : null}
      <div className="cta-row">
        <a className="btn text" href="/mis-ordenes">Cancelar</a>
        <button className="btn" type="submit" disabled={busy || !photo}>
          {busy ? 'Confirmando…' : 'Confirmar que entré'}
        </button>
      </div>
    </form>
  );
}
