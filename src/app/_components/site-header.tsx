import { currentUser } from '../session';
import LogoutButton from './logout-button';

export default async function SiteHeader() {
  const user = await currentUser();
  return (
    <header className="site-header">
      <a className="brand" href="/">Reventa Segura</a>
      <nav className="site-nav" aria-label="Principal">
        <a href="/">Eventos</a>
        {user ? (
          <>
            <a href="/mis-ordenes">Mis órdenes</a>
            <a href="/vender">Vender</a>
            {user.role === 'admin' ? <a href="/admin">Admin</a> : null}
            <LogoutButton />
          </>
        ) : (
          <a href="/ingresar">Ingresar</a>
        )}
      </nav>
    </header>
  );
}
