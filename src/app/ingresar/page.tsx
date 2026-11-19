import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import EventPoster from '../_components/event-poster';
import { currentUser, safeNext } from '../session';
import LoginForm from './login-form';

export const metadata = { title: 'Ingresar' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  const user = await currentUser();
  if (user) {
    const [row] = await getDb().select({ at: users.phoneVerifiedAt }).from(users).where(eq(users.id, user.userId));
    if (row?.at || !next.startsWith('/vender')) redirect(next);
  }
  return (
    <main className="page wide">
      <div className="auth-layout">
        {/* Brand artwork beside the form on wide screens (decorative; hidden on phones) */}
        <div className="auth-art">
          <EventPoster
            seed="reventa-segura"
            title="Reventa Segura"
            image={{ src: '/posters/concert.webp', alt: 'Público frente al escenario de un concierto' }}
            size="hero"
            sizes="42vw"
            priority
          />
        </div>
        <div className="auth-main">
          <p className="eyebrow">
            <span className="dot" aria-hidden="true" />
            Acceso sin contraseña
          </p>
          <h1>Ingresar</h1>
          <p className="lead">Te enviamos un código de 6 dígitos por SMS a tu celular de Panamá.</p>
          <div className="flow-card">
            <LoginForm next={next} />
          </div>
        </div>
      </div>
    </main>
  );
}
