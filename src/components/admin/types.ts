import type { MapDef } from '@/engine/map';
export interface RevisionInfo {
  number: number;
  summary: string;
  log: string[];
  isOverride: boolean;
  reason: string | null;
  undone: boolean;
  active: boolean;
  createdAt: string;
  commandType: string;
  /** Urheber („SL: …“ bzw. „Spieler: …“) */
  author: string | null;
}

export interface CampaignInfo {
  id: string;
  archived: boolean;
  publicEnabled: boolean;
  publicUrl: string;
  previousCampaignId: string | null;
  /** gespeicherte eigene Karten (N5.5) */
  mapTemplates: { id: string; name: string; map: MapDef }[];
  /** aktive persönliche Spielerlinks (N1.1), playerId → URL */
  playerLinks: Record<string, string>;
  /** Szenario-Sandbox (NTH2 2.1): gesetzt, wenn diese Kampagne eine Sandbox ist */
  sandbox?: { of: string; ofName: string; baseRev: number; originalRev: number } | null;
  /** offene Sandboxes dieser Kampagne (NTH2 2.1) */
  sandboxes?: { id: string; name: string; createdAt: string; updatedAt: string; baseRev: number; steps: number }[];
  /** Kampagnen-Vorlagen (NTH2 2.6) */
  campaignTemplates?: { id: string; name: string; createdAt: string; createdBy: string | null }[];
  /** darf Vorlagen löschen/überschreiben (Admin) */
  isAdmin?: boolean;
  /** Benachrichtigungen und Backups (N1.4, N5.1) */
  ops: {
    webhook: string | null;
    smtp: boolean;
    outbox: { id: number; channel: string; recipient: string; subject: string; status: string; attempts: number; last_error: string | null; created_at: string; sent_at: string | null }[];
    backups: { file: string; size: number; at: string }[];
  };
}
