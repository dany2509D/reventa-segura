'use client';

import { useState } from 'react';
import { IconLogout } from './icons';

export default function LogoutButton({ className = 'nav-item' }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    } finally {
      window.location.assign('/');
    }
  }
  return (
    <button type="button" className={className} onClick={logout} disabled={busy}>
      <IconLogout />
      <span>Salir</span>
    </button>
  );
}
