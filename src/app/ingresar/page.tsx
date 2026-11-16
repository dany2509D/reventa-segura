import { redirect } from 'next/navigation';
import EventPoster from '../_components/event-poster';
import { currentUser, safeNext } from '../session';
import LoginForm from './login-form';

export const metadata = { title: 'Ingresar' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await currentUser()) redirect(next);
  return (
    <main className="page wide">
      <div className="auth-layout">
        {/* Brand artwork beside the form on wide screens (decorative; hidden on phones) */}
        <div className="auth-art">
          <EventPoster seed="reventa-segura" title="Reventa Segura" size="hero" />
        </div>
        <div className="auth-main">
          <p className="eyebrow">Tu cuenta</p>
          <h1>Ingresar</h1>
          <p className="lead">Te enviamos un código por mensaje de texto. No necesitas contraseña.</p>
          <LoginForm next={next} />
        </div>
      </div>
    </main>
  );
}
