'use client';

import { useState, useTransition } from 'react';
import { unsubscribeAction } from '@/app/actions/ops';
import type { NotifyCategory } from '@/engine/types';
import { useMsg, useT } from '@/i18n/client';

export function UnsubscribeForm({ cid, pid, sig, category }: { cid: string; pid: string; sig: string; category: NotifyCategory | 'ALL' }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const t = useT();
  const m = useMsg();
  const go = (c: NotifyCategory | 'ALL') =>
    start(async () => {
      const r = await unsubscribeAction(cid, pid, sig, c);
      setMsg(r.ok ? t('Erledigt – du kannst die Einstellungen jederzeit auf deiner Spielerseite ändern.') : m(r.error));
    });
  if (msg) return <p className="text-sm text-ok">{msg}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      <button className="btn btn-primary" disabled={pending} onClick={() => go(category)}>
        {t('Abbestellen')}
      </button>
      {category !== 'ALL' && (
        <button className="btn" disabled={pending} onClick={() => go('ALL')}>
          {t('Alle E-Mails abbestellen')}
        </button>
      )}
    </div>
  );
}
