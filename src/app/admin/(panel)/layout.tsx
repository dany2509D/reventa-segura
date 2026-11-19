import type { ReactNode } from 'react';
import NavLink from '../../_components/nav-link';
import { requireAdminPage } from '../session';

export const metadata = { title: 'Administración' };
// Admin data is per-request and private: never prerender or cache it.
export const dynamic = 'force-dynamic';

export default async function PanelLayout({ children }: { children: ReactNode }) {
  await requireAdminPage();
  return (
    <div className="admin-shell">
      <nav className="admin-nav" aria-label="Administración">
        <NavLink href="/admin" exact pill={false} className="admin-tab">Resumen</NavLink>
        <NavLink href="/admin/identidades" pill={false} className="admin-tab">Identidades</NavLink>
        <NavLink href="/admin/publicaciones" pill={false} className="admin-tab">Publicaciones</NavLink>
        <NavLink href="/admin/disputas" pill={false} className="admin-tab">Disputas</NavLink>
        <NavLink href="/admin/pagos" pill={false} className="admin-tab">Pagos</NavLink>
        <NavLink href="/admin/eventos" pill={false} className="admin-tab">Eventos</NavLink>
        <NavLink href="/admin/revision" pill={false} className="admin-tab">Revisión manual</NavLink>
      </nav>
      {children}
    </div>
  );
}
