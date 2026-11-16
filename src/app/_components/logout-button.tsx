'use client';

import { useState } from 'react';

export default function LogoutButton() {
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
    <button type="button" onClick={logout} disabled={busy}>
      Salir
    </button>
  );
}
