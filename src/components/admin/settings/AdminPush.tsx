'use client';

import { useMemo } from 'react';
import { PushToggle, type PushApi } from '@/components/push/PushToggle';
import { adminPushStatusAction, adminPushSubscribeAction, adminPushUnsubscribeAction } from '@/app/actions/push';
import { useT } from '@/i18n/client';

/** Web-Push für das Spielleiter-Konto (NTH2 1.1): „Handlungsbedarf“ der Kampagnen dieses Kontos */
export function AdminPush({ vapidKey }: { vapidKey: string }) {
  const t = useT();
  const api: PushApi = useMemo(() => ({ status: adminPushStatusAction, subscribe: adminPushSubscribeAction, unsubscribe: adminPushUnsubscribeAction }), []);
  return <PushToggle vapidKey={vapidKey} api={api} hint={t('Handlungsbedarf deiner Kampagnen: Widerspruch gegen ein Ergebnis, Meldung seit 48 h offen, alle Befehle eingegangen, alle Schlachten gemeldet.')} />;
}
