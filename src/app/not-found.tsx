import { IconArrowRight } from './_components/icons';

export const metadata = { title: 'Página no encontrada' };

// 404 for unknown addresses and for events, listings or orders that do not exist (or are not yours).
export default function NotFound() {
  return (
    <main className="page state-page">
      <p className="state-code">Error 404</p>
      <h1>Esta página no existe.</h1>
      <p className="lead">Puede que el evento ya haya pasado, que la entrada se haya vendido o que la dirección esté mal escrita.</p>
      <div className="actions">
        <a className="btn" href="/">
          Ver eventos
          <IconArrowRight />
        </a>
      </div>
    </main>
  );
}
