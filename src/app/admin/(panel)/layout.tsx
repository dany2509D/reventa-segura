import type { ReactNode } from 'react';
import '../admin.css';
import { requireAdminPage } from '../session';

export const metadata = { title: 'Administración · Reventa Segura' };
// Admin data is per-request and private: never prerender or cache it.
export const dynamic = 'force-dynamic';

export default async function PanelLayout({ children }: { children: ReactNode }) {
  await requireAdminPage();
  return (
    <div className="admin-shell">
      <nav className="admin-nav" aria-label="Administración">
        <a href="/admin">Resumen</a>
        <a href="/admin/identidades">Identidades</a>
        <a href="/admin/publicaciones">Publicaciones</a>
        <a href="/admin/disputas">Disputas</a>
        <a href="/admin/pagos">Pagos</a>
        <a href="/admin/eventos">Eventos</a>
      </nav>
      {children}
    </div>
  );
}
