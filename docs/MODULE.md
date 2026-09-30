# Regelmodule

Die Engine war ursprünglich ganz auf „War on the Vespator Front“ zugeschnitten. Inzwischen steckt alles, was an ein bestimmtes Kampagnensystem gebunden ist, hinter der Schnittstelle `CampaignModule`. Vespator ist das erste und derzeit einzige eingebaute Modul. Weitere Systeme lassen sich als eigene Module ergänzen, ohne dass der Kern (Spielerlinks, Karte, Termine, Codex, Protokoll) angepasst werden muss.

| Datei | Inhalt |
| --- | --- |
| `src/engine/modules/types.ts` | Schnittstelle `CampaignModule`, `ModuleData`, `ModuleStep`, `ModuleOpInput` |
| `src/engine/modules/registry.ts` | `registerModule`, `getModule`, `moduleOf(state)`, `listModules`, `DEFAULT_MODULE_ID = 'vespator'` |
| `src/engine/modules/vespator/index.ts` | Vespator als Modul (Delegation auf die bestehenden Engine-Dateien) |
| `src/engine/modules/vespator/data.ts` | Stammdaten: Planeten, Verbindungen, Theatres, Infrastruktur, Angriffsarten, Operationen, Medaillen, Events |
| `src/engine/modules/vespator/commands.ts` | regelspezifische Commands (Setup W0 bis W4, Reveal, Edifices, Events, Bewegung, Bau, Stechen, Medaillen) |
| `src/engine/data/vespator.ts` | nur noch Re-Export von `modules/vespator/data.ts`, damit bestehende Importe gültig bleiben |
| `tests/engine/demoModule.ts` | minimales Beispielmodul („Demo-Modul“) als Test-Fixture und Vorlage |
| `tests/engine/modules.test.ts` | Tests für Registry, Migration, Import-Prüfung und den Durchlauf des Demo-Moduls |

## 1. Bestandsaufnahme: generisch oder modulspezifisch

Der generische Kern ist für jedes System gleich:

- Kampagnenzustand, Revisionen und Migration (`types.ts`, `migrate.ts`, `schema.ts`), Command-Ausführung mit Warnungen, Begründungspflicht und Overrides (`commands.ts`, `ctx.ts`)
- Würfel (digital/manuell, öffentliches Würfelprotokoll), IDs, Log
- Spieler, Allianzen, Mitgliedschaften, Flotten und Kommandanten (`players.ts`, `commanders.ts`), Profile, Notizen
- Schlachten als Datensätze: Teilnehmer, Ergebnis-Entwürfe, Bestätigung, Terminvorschläge, Spieltische, Gäste, freie Gefechte (`playerActions.ts`, `p1.ts`, `r1Commands.ts`)
- Karten-Registry und Karteneditor (`map.ts`, `mapGen.ts`)
- Hausregel-Rahmen (`houseRules.ts`: Speicherung in `toggles.houseRules`, Abfrage über `house()`)
- Projektionen für Leser und Spieler (`publicView.ts`), Sprachen, Dispatches, Galerie, Chronik, Crusade-Anbindung, Sonderziele

Modulspezifisch ist (heute für Vespator):

| Bereich | Wo |
| --- | --- |
| Stammdaten: Planeten, Verbindungen, Theatres/Twists, Infrastruktur, Angriffsarten, Operationen, Medaillen, Events | `modules/vespator/data.ts` |
| Setup W0 bis W5: Medaillen, Strongholds und Power Level, Start-Infrastruktur, Flottenstarts, Sable Dagger | `setup.ts` |
| Phasenschritte OPS … BUILD, Operationen und ihre Prüfung, Reveal, Edifices, Arrival, Kill Teams, Bewegung, Bau | `phase.ts` |
| Schlacht → Campaign Outcome je Angriffsart | `outcomes.ts` |
| Ereignistabellen (Fortunes of War, Perils of Power, Desperate Measures) | `events.ts` |
| Punkte, Kampagnenende, Stechen über den Stronghold, Entscheidungsschlacht, Medaillen | `scoring.ts`, `board.ts` (`campaignPoints`) |
| FAQ-Hausregeln F-1 … F-23, A6 | `houseRules.ts` (`HOUSE_RULES`) |
| Missionen je Angriffsart | `missions.ts` |

## 2. Wie der Kern das Modul aufruft (Erweiterungspunkte)

Der Kern bestimmt das Modul einer Kampagne über `moduleOf(state)` (`state.meta.module`, fehlend = `vespator`) und ruft es an diesen Stellen auf:

| Stelle im Kern | Hook | Pflicht |
| --- | --- | --- |
| `createCampaignState({ module })` | `defaultMap()`, `defaultToggles()`, `setupSteps[0]`, `defaultHouseRules`, `initState()` | ja (außer `initState`, `defaultHouseRules`) |
| `migrateState` | `defaultMap()` für Stände ohne Karte, danach `migrate()` | `migrate` optional |
| `validateState` (Import) | Modul muss angemeldet sein; `defaultMap()` für Stände ohne Karte | – |
| `SETUP_START` | `startCampaign(ctx, dates)` | ja |
| `OP_SET` / `OP_CLEAR` | `operations.set()` / `operations.clear()`; `operations.validate()` für die reine Prüfung | ja |
| `ADVANCE` | `advance(ctx)` (Sonderziele, Abwesenheiten und Spiellast-Hinweise erledigt der Kern drumherum) | ja |
| `BATTLE_PROCESS` / `BATTLE_PROCESS_ALL` | `battles.process()` / `battles.processAll()` (Schlachtergebnis → Outcome) | optional |
| `SCORE` | `scorePhase(ctx)` (nach der generischen Auswertung der Sonderziele) | ja |
| `EVENTS_GENERATE` | `generateEvents(ctx)`; fehlt der Hook, lehnt der Kern ab („kennt keine Ereignisse“) | optional |
| `CAMPAIGN_END` | `endCampaign(ctx)` | ja |
| `MODULE_ACTION` | `action(ctx, action, data)`: eigene Aktionen ohne Erweiterung der Command-Union | optional |
| alle übrigen, dem Kern unbekannten Commands | `dispatch(ctx, cmd)` → `true`, wenn behandelt; sonst lehnt der Kern ab | optional |
| `toPublicView` | `publicView(view, full, opts)`: modulspezifisch Verdecktes entfernen | optional |

Weitere Felder: `id`, `name`, `version`, `description`, `data` (Tabellen nach ID), `setupSteps`, `phaseSteps` (Schritt-IDs mit deutscher Bezeichnung), `houseRules` (angebotene Hausregeln), `i18n.en` (Übersetzungen der modul-eigenen Bezeichnungen, deutscher Text als Schlüssel).

## 3. Ein Modul bauen

1. Stammdaten in eigenen Worten anlegen: Angriffsarten, Operationen und ggf. Theatres, Infrastruktur, Medaillen, Ereignisse (`ModuleData`). Die Tabellen sind nach ID geschlüsselt, jeder Eintrag hat mindestens `name`.
2. Die Karte als `MapDef` liefern (`defaultMap`). Planeten-IDs müssen über alle Karten eindeutig sein (Präfix je Modul, z. B. `demo-…`). Die Kartenprüfung des Kerns gilt auch hier: 6 bis 24 Planeten, je 1 bis 3 Theatres, zusammenhängend.
3. Den Ablauf festlegen: `setupSteps` und `phaseSteps`. Der erste Setup-Schritt ist der Startschritt neuer Kampagnen; `advance` schaltet die Phasenschritte weiter und legt neue Phasen an (`newPhase` aus `init.ts`).
4. Operationen prüfen und speichern (`operations`). Wer eigene Angriffsarten hat, speichert seine Befehle im modul-eigenen Zustand `state.moduleState[<id>]`; Vespator nutzt `phase.operations`.
5. Outcomes, Wertung und Ende: Ergebnisse auf den Kampagnenstand abbilden, `pointsHistory` pro Phase fortschreiben (`scorePhase`), `result` und `stage = { kind: 'ENDED' }` setzen (`endCampaign`).
6. Meldungen: Fehler über `fail()`, Hinweise über `log()`/`warn()`/`hint()` aus `ctx.ts`. Jede neue deutsche Meldung braucht ein englisches Muster in `src/i18n/en/engine-*.ts` (siehe `engine-modules.ts`).
7. Anmelden: `registerModule(meinModul)` beim Start der App (z. B. in `modules/registry.ts` neben Vespator). Neue Kampagnen wählen das Modul über `createCampaignState({ module: 'mein-modul' })`.

### Skelett (gekürzt aus `tests/engine/demoModule.ts`)

```ts
export const demoModule: CampaignModule = {
  id: 'demo',
  name: 'Demo-Modul',
  version: '0.1.0',
  description: 'Beispielmodul: zwei Angriffsarten, Punkte für Siege, Ende nach der letzten Phase.',
  data: { attackTypes: { RAID: { name: 'Überfall', points: 1 }, SIEGE: { name: 'Belagerung', points: 2 } }, opTypes: { BATTLE: { name: 'Angriff' } } },
  defaultMap: () => DEMO_MAP,
  setupSteps: [{ id: 'W0', label: 'Allianzen & Spieler' }],
  phaseSteps: [
    { id: 'OPS', label: 'Angriffe erklären' },
    { id: 'BATTLES', label: 'Schlachten' },
    { id: 'RESULTS', label: 'Wertung' },
  ],
  defaultToggles: (n) => ({ ...defaultToggles(n), medals: false /* … */ }),
  houseRules: [],
  startCampaign(ctx, dates) { /* Flotten aufstellen, Phase 1 anlegen, stage = PHASE 1 OPS */ },
  operations: { validate, set, clear },       // Angriffe im moduleState speichern
  advance(ctx) { /* OPS → BATTLES → RESULTS; bei BATTLES → RESULTS Outcomes anwenden */ },
  scorePhase(ctx) { /* pointsHistory fortschreiben, flags.scored */ },
  endCampaign(ctx) { /* Sieger bestimmen, stage = ENDED */ },
  action(ctx, action, data) { /* 'RESULT': Sieger einer Schlacht eintragen */ },
  publicView(view, full) { /* Befehle der laufenden Befehlsphase verbergen */ },
  i18n: { en: { 'Demo-Modul': 'Demo module', Überfall: 'Raid', Belagerung: 'Siege' } },
};
```

Punkteregel des Demo-Moduls: Siegt der Angreifer, erhält seine Allianz die Punkte der Angriffsart (Überfall 1, Belagerung 2); siegt der Verteidiger, erhält dessen Allianz 1 Punkt. Der Test `modules.test.ts` spielt damit über die normalen Commands `ALLIANCE_UPSERT`, `PLAYER_UPSERT`, `FLEET_SET_COUNT`, `SETUP_START`, `OP_SET`, `ADVANCE`, `MODULE_ACTION`, `SCORE` und `CAMPAIGN_END` eine komplette Kampagne mit einer Phase durch.

## 4. Was (noch) Vespator-geprägt bleibt und warum

- Zustandstypen: `Stage`, `PhaseStep`, `SetupStep`, `AttackType`, `OpType`, `RuleToggles`, `Operation`, `Battle.attackType` sind auf die Vespator-Werte typisiert. Ein Umbau auf freie Zeichenketten würde die ganze Oberfläche betreffen. Module nutzen daher die vorhandenen Schritt-IDs (z. B. `OPS`, `BATTLES`, `RESULTS`) und legen eigene Angriffsarten im `moduleState` ab.
- Oberfläche: Setup-Assistent, Phasen-Panels, Briefing und Regelkarte sind für Vespator gebaut. Ein weiteres Modul braucht dort eigene Panels, oder die Panels fragen `moduleOf(state)` ab.
- Brett-Mechanik: Power Level, Infrastruktur-Slots und Strongholds (`board.ts`, `PlanetState`) sind Teil des generischen Zustands, folgen aber der Vespator-Logik. Andere Module können sie ignorieren oder eigenen Zustand im `moduleState` führen.
- Overrides (`OVERRIDE_PL`, `OVERRIDE_SLOT`, `OVERRIDE_STRONGHOLD` …) und eigene Ereignisse (D2, ersetzen Vespator-Event-Codes) bleiben im Kern, weil sie auf dem gemeinsamen Brett arbeiten.
- Kern-Zusätze wie Abwesenheit mit Standardoperation (A5, legt Vespator-Operationen an), Spiellast, Sonderziele, Endwertungs-Varianten (C2/C6) und Nebel über dem Punktestand gehen vom Vespator-Punktesystem aus.
- Kartenprüfung: `MAP_LIMITS` (6 bis 24 Planeten) und die Theatre-IDs der Planeten gelten für alle Module.

## 5. Lizenz und Inhalte

Regeltexte aus Kampagnenbüchern oder Codizes dürfen weder in Code und Kommentare noch in Stammdaten oder Oberflächentexte übernommen werden. Ein Modul beschreibt nur die Mechanik in eigenen Worten (Ablauf, Zahlen, Bedingungen) und verwendet Eigennamen nur als Bezeichnungen. Keine eingescannten Tabellen, keine wörtlichen Zitate, keine Verweise auf inoffizielle Regel-Datenbanken. Wer ein Modul zu einem bestimmten Buch baut, setzt voraus, dass die Spielgruppe das Buch besitzt.
