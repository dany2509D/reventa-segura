import { requireAdminNeedingMfa } from '../session';
import MfaForm from './mfa-form';

export const metadata = { title: 'Verificación en dos pasos' };

export default async function MfaPage() {
  await requireAdminNeedingMfa();
  return (
    <main className="admin-narrow">
      <p className="eyebrow">
        <span className="dot" aria-hidden="true" />
        Seguridad administrativa
      </p>
      <h1>Verificación en dos pasos</h1>
      <p className="lead">Ingresa el código de 6 dígitos de tu app de autenticación.</p>
      <div className="flow-card">
        <MfaForm />
      </div>
    </main>
  );
}
