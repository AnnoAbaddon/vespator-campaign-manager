import { describe, expect, it } from 'vitest';
import { COMMAND_LABELS, commandLabel, readableSummary } from '@/components/admin/log/commandLabels';
import { translate } from '@/i18n/core';

describe('Aktions-Log: lesbare Befehlsbezeichnungen', () => {
  it('Befehlscodes als Zusammenfassung werden zu lesbaren Meldungen', () => {
    expect(readableSummary('SETUP_W4_DONE', 'SETUP_W4_DONE')).toEqual({ text: 'Aufbau: Flotten-Startpositionen abgeschlossen', isCode: true });
    // Override-Präfix entfällt (die Markierung übernimmt die Oberfläche)
    expect(readableSummary('⚠ OVERRIDE_PL', 'OVERRIDE_PL')).toEqual({ text: 'Korrektur: Power Level', isCode: true });
  });

  it('echte Logzeilen bleiben unverändert', () => {
    expect(readableSummary('Operationen aufgedeckt – 3 Battle Operation(s) (+2)', 'REVEAL_OPS')).toEqual({ text: 'Operationen aufgedeckt – 3 Battle Operation(s) (+2)', isCode: false });
    expect(readableSummary('⚠ Punkte korrigiert', 'OVERRIDE_POINTS').text).toBe('Punkte korrigiert');
  });

  it('unbekannte Befehlstypen bleiben als Code sichtbar', () => {
    expect(commandLabel('KUENFTIGER_BEFEHL')).toBe('KUENFTIGER_BEFEHL');
  });

  it('jede Bezeichnung hat eine englische Übersetzung', () => {
    const missing = Object.values(COMMAND_LABELS).filter((de) => translate('en', de) === de && de !== 'Override');
    expect(missing).toEqual([]);
  });
});

describe('Gekürzte Link-Anzeige', () => {
  it('zeigt Host, Pfad und den Anfang des Schlüssels – nie die ganze Tokenfolge', async () => {
    const { maskUrl } = await import('@/components/admin/settings/CopyField');
    expect(maskUrl('https://kampagne.example.org/v/-Ktb_LR43mqA7aGIthAAlDRCzJf2E-z0Z5q9JKxpFNo')).toBe('kampagne.example.org/v/-Ktb_L…');
    expect(maskUrl('http://localhost:3000/hall/abc')).toBe('localhost:3000/hall/abc');
    expect(maskUrl('kein Link')).toBe('kein Link');
  });
});
