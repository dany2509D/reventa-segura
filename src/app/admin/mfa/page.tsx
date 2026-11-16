import { requireAdminNeedingMfa } from '../session';
import MfaForm from './mfa-form';

export const metadata = { title: 'Verificación en dos pasos · Reventa Segura' };

export default async function MfaPage() {
  await requireAdminNeedingMfa();
  return (
    <main className="admin-narrow">
      <h1>Verificación en dos pasos</h1>
      <p>Ingresa el código de 6 dígitos de tu app de autenticación.</p>
      <MfaForm />
    </main>
  );
}
