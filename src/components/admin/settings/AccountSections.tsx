'use client';

import { useState } from 'react';
import { TabPanel, Tabs } from '@/components/ui';
import { GameIcon } from '@/components/icons/GameIcon';
import { useT } from '@/i18n/client';

export type AccountSection = { id: string; label: string; icon: string; content: React.ReactNode };

/**
 * Kontoseite: persönliche Einstellungen getrennt von Administration und Diensten (Register).
 * Die Inhalte rendert der Server; hier wird nur umgeschaltet.
 */
export function AccountSections({ sections }: { sections: AccountSection[] }) {
  const t = useT();
  const [sec, setSec] = useState(sections[0]?.id ?? '');
  if (sections.length <= 1) return <div className="space-y-5">{sections[0]?.content}</div>;
  const cur = sections.find((s) => s.id === sec) ?? sections[0];
  return (
    <div className="space-y-4">
      <Tabs sticky idBase="account" label={t('Bereiche')} value={cur.id} onChange={setSec} tabs={sections.map((s) => ({ id: s.id, label: s.label, icon: <GameIcon name={s.icon} size={16} /> }))} />
      <TabPanel idBase="account" value={cur.id} className="space-y-5">
        {cur.content}
      </TabPanel>
    </div>
  );
}

/** Flacher Abschnitt im Gehäuse: Überschrift mit Messinglinie, Trennung durch Abstand statt Rahmen */
export function Sect({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`space-y-3 ${className}`} aria-label={title}>
      <h3 className="section-title">{title}</h3>
      {children}
    </section>
  );
}
