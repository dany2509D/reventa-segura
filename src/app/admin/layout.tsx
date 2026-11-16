import type { ReactNode } from 'react';
import './admin.css';

// Styles for every admin screen, including /admin/mfa (which lives outside the (panel) group).
export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return children;
}
