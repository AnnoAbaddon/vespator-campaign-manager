'use client';

import { useState, useTransition } from 'react';
import { createInviteAction, deleteAccountAction, setAccessAction } from '@/app/actions/accounts';
import { Panel } from '@/components/ui';
import { CopyField } from './CopyField';
import { useT } from '@/i18n/client';
import { GameIcon } from '@/components/icons/GameIcon';

type Account = { id: number; username: string; role: 'ADMIN' | 'COWARMASTER'; created_at: string; campaigns: string[] };

/** Konten und Rollen (N5.2): Admins verwalten Konten und geben Kampagnen für Co-Warmaster frei */
export function AccountsPanel({ accounts, campaigns, me }: { accounts: Account[]; campaigns: { id: string; name: string }[]; me: number }) {
  const [pending, start] = useTransition();
  const [role, setRole] = useState<'ADMIN' | 'COWARMASTER'>('COWARMASTER');
  const [sel, setSel] = useState<string[]>([]);
  const [link, setLink] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const t = useT();
  return (
    <Panel title={t('Konten und Rollen')} icon={<GameIcon name="em_crown" size={18} />}>
      <p className="mb-3 text-[14px] text-faint">{t('Admins dürfen alles. Co-Warmaster haben volle Rechte nur in den freigegebenen Kampagnen und keine Kontoverwaltung. Jede Aktion steht mit Kontonamen im Log.')}</p>
      <ul className="space-y-2">
        {accounts.map((a) => (
          <li key={a.id} className="slab px-3 py-2 text-[15px]">
            <p className="flex flex-wrap items-center gap-2">
              <b>{a.username}</b>
              <span className="chip">{a.role === 'ADMIN' ? 'Admin' : 'Co-Warmaster'}</span>
              {a.id === me && <span className="text-[13px] text-faint">{t('(du)')}</span>}
              {a.id !== me && (
                <button
                  className="btn btn-sm btn-danger ml-auto"
                  disabled={pending}
                  onClick={() =>
                    confirm(t('Konto {name} löschen?', { name: a.username })) &&
                    start(async () => {
                      const r = await deleteAccountAction(a.id);
                      setErr(r.ok ? null : (r.error ?? 'Fehler'));
                    })
                  }
                >
                  {t('löschen')}
                </button>
              )}
            </p>
            {a.role === 'COWARMASTER' && (
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[14px] text-dim">
                {campaigns.map((c) => (
                  <label key={c.id} className="inline-flex items-center gap-1">
                    <input type="checkbox" checked={a.campaigns.includes(c.id)} disabled={pending} onChange={(e) => start(() => setAccessAction(a.id, c.id, e.target.checked))} />
                    {c.name}
                  </label>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      {err && (
        <p className="notice notice-danger mt-2" role="alert">
          {t(err)}
        </p>
      )}
      <div className="inset mt-4 space-y-2.5 p-3">
        <p className="section-title mb-0">{t('Neues Konto einladen')}</p>
        <div className="flex flex-wrap items-center gap-3 text-[15px]">
          <select className="select w-auto" value={role} onChange={(e) => setRole(e.target.value as 'ADMIN' | 'COWARMASTER')} aria-label={t('Rolle')}>
            <option value="COWARMASTER">Co-Warmaster</option>
            <option value="ADMIN">Admin</option>
          </select>
          {role === 'COWARMASTER' &&
            campaigns.map((c) => (
              <label key={c.id} className="inline-flex items-center gap-1.5 text-[14px]">
                <input type="checkbox" checked={sel.includes(c.id)} onChange={(e) => setSel((l) => (e.target.checked ? [...l, c.id] : l.filter((x) => x !== c.id)))} />
                {c.name}
              </label>
            ))}
        </div>
        <button
          className="btn btn-sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await createInviteAction(role, role === 'COWARMASTER' ? sel : []);
              if (r.ok) setLink(r.url);
              else setErr(r.error);
            })
          }
        >
          {t('Einladungslink erzeugen')}
        </button>
        {link && (
          <div className="space-y-1">
            <CopyField value={link} />
            <p className="text-[13px] text-faint">{t('7 Tage gültig und nur einmal nutzbar. Die eingeladene Person legt damit Benutzername und Passwort selbst fest.')}</p>
          </div>
        )}
      </div>
    </Panel>
  );
}
