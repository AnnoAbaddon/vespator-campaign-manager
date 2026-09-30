'use client';

import { usePathname } from 'next/navigation';
import { isAppRoute, isAuthRoute, isShellRoute } from './appRoutes';

/** Rendert den globalen Seitenfuß nur außerhalb der Ein-Bildschirm-Apps (Pfad clientseitig, damit er auch bei Navigation ohne Neuladen stimmt) */
export function SiteFooter({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (isAppRoute(pathname ?? '') || isAuthRoute(pathname ?? '') || isShellRoute(pathname ?? '')) return null;
  return <>{children}</>;
}
