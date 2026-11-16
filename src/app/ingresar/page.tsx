import { redirect } from 'next/navigation';
import { DoodlePanel } from '../_components/doodle';
import { currentUser, safeNext } from '../session';
import LoginForm from './login-form';

export const metadata = { title: 'Ingresar' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await currentUser()) redirect(next);
  return (
    <main className="page">
      <DoodlePanel tone="sky" compact />
      <h1>Ingresar</h1>
      <p className="lead">Te enviamos un código por mensaje de texto. No necesitas contraseña.</p>
      <LoginForm next={next} />
    </main>
  );
}
