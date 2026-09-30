# Rules modules

The engine was originally built entirely around "War on the Vespator Front". Everything tied to a particular campaign system now sits behind the `CampaignModule` interface. Vespator is the first and currently the only built-in module. Other systems can be added as modules of their own without changing the core (player links, map, scheduling, Codex, log).

| File | Contents |
| --- | --- |
| `src/engine/modules/types.ts` | `CampaignModule` interface, `ModuleData`, `ModuleStep`, `ModuleOpInput` |
| `src/engine/modules/registry.ts` | `registerModule`, `getModule`, `moduleOf(state)`, `listModules`, `DEFAULT_MODULE_ID = 'vespator'` |
| `src/engine/modules/vespator/index.ts` | Vespator as a module (delegates to the existing engine files) |
| `src/engine/modules/vespator/data.ts` | Master data: planets, connections, theatres, infrastructure, attack types, operations, medals, events |
| `src/engine/modules/vespator/commands.ts` | rule-specific commands (setup W0 to W4, reveal, edifices, events, movement, building, tie-break, medals) |
| `src/engine/data/vespator.ts` | only re-exports `modules/vespator/data.ts` so that existing imports keep working |
| `tests/engine/demoModule.ts` | minimal example module ("Demo-Modul") as a test fixture and template |
| `tests/engine/modules.test.ts` | tests for the registry, migration, import validation and a full run of the demo module |

## 1. Inventory: generic or module-specific

The generic core is the same for every system:

- Campaign state, revisions and migration (`types.ts`, `migrate.ts`, `schema.ts`), command execution with warnings, mandatory reasons and overrides (`commands.ts`, `ctx.ts`)
- Dice (digital/manual, public dice log), IDs, log
- Players, alliances, memberships, fleets and commanders (`players.ts`, `commanders.ts`), profiles, notes
- Battles as records: participants, result drafts, confirmation, date proposals, game tables, guests, free skirmishes (`playerActions.ts`, `p1.ts`, `r1Commands.ts`)
- Map registry and map editor (`map.ts`, `mapGen.ts`)
- House rule framework (`houseRules.ts`: stored in `toggles.houseRules`, queried through `house()`)
- Projections for readers and players (`publicView.ts`), languages, dispatches, gallery, chronicle, Crusade integration, secondary objectives

Module-specific (currently for Vespator):

| Area | Where |
| --- | --- |
| Master data: planets, connections, theatres/twists, infrastructure, attack types, operations, medals, events | `modules/vespator/data.ts` |
| Setup W0 to W5: medals, strongholds and power level, starting infrastructure, fleet starts, Sable Dagger | `setup.ts` |
| Phase steps OPS … BUILD, operations and their validation, reveal, edifices, arrival, kill teams, movement, building | `phase.ts` |
| Battle → campaign outcome per attack type | `outcomes.ts` |
| Event tables (Fortunes of War, Perils of Power, Desperate Measures) | `events.ts` |
| Points, campaign end, tie-break via the stronghold, decisive battle, medals | `scoring.ts`, `board.ts` (`campaignPoints`) |
| FAQ house rules F-1 … F-23, A6 | `houseRules.ts` (`HOUSE_RULES`) |
| Missions per attack type | `missions.ts` |

## 2. How the core calls the module (extension points)

The core determines a campaign's module with `moduleOf(state)` (`state.meta.module`; if missing, `vespator`) and calls it at these points:

| Point in the core | Hook | Required |
| --- | --- | --- |
| `createCampaignState({ module })` | `defaultMap()`, `defaultToggles()`, `setupSteps[0]`, `defaultHouseRules`, `initState()` | yes (except `initState`, `defaultHouseRules`) |
| `migrateState` | `defaultMap()` for states without a map, then `migrate()` | `migrate` optional |
| `validateState` (import) | module must be registered; `defaultMap()` for states without a map | – |
| `SETUP_START` | `startCampaign(ctx, dates)` | yes |
| `OP_SET` / `OP_CLEAR` | `operations.set()` / `operations.clear()`; `operations.validate()` for validation only | yes |
| `ADVANCE` | `advance(ctx)` (the core handles secondary objectives, absences and workload hints around it) | yes |
| `BATTLE_PROCESS` / `BATTLE_PROCESS_ALL` | `battles.process()` / `battles.processAll()` (battle result → outcome) | optional |
| `SCORE` | `scorePhase(ctx)` (after the generic scoring of secondary objectives) | yes |
| `EVENTS_GENERATE` | `generateEvents(ctx)`; if the hook is missing, the core rejects the command ("has no events") | optional |
| `CAMPAIGN_END` | `endCampaign(ctx)` | yes |
| `MODULE_ACTION` | `action(ctx, action, data)`: the module's own actions without extending the command union | optional |
| all other commands unknown to the core | `dispatch(ctx, cmd)` → `true` if handled; otherwise the core rejects the command | optional |
| `toPublicView` | `publicView(view, full, opts)`: remove module-specific hidden information | optional |

Further fields: `id`, `name`, `version`, `description`, `data` (tables by ID), `setupSteps`, `phaseSteps` (step IDs with a German label), `houseRules` (house rules on offer), `i18n.en` (translations of the module's own labels, with the German text as the key).

## 3. Building a module

1. Write the master data in your own words: attack types, operations and, if needed, theatres, infrastructure, medals, events (`ModuleData`). The tables are keyed by ID, and every entry has at least a `name`.
2. Provide the map as a `MapDef` (`defaultMap`). Planet IDs must be unique across all maps (use a prefix per module, e.g. `demo-…`). The core's map validation applies here too: 6 to 24 planets, 1 to 3 theatres each, connected.
3. Define the flow: `setupSteps` and `phaseSteps`. The first setup step is the starting step of new campaigns; `advance` moves through the phase steps and creates new phases (`newPhase` from `init.ts`).
4. Validate and store operations (`operations`). A module with its own attack types stores its orders in its own state `state.moduleState[<id>]`; Vespator uses `phase.operations`.
5. Outcomes, scoring and end: map results onto the campaign state, update `pointsHistory` per phase (`scorePhase`), set `result` and `stage = { kind: 'ENDED' }` (`endCampaign`).
6. Messages: errors through `fail()`, notes through `log()`/`warn()`/`hint()` from `ctx.ts`. Every new German message needs an English pattern in `src/i18n/en/engine-*.ts` (see `engine-modules.ts`).
7. Register: call `registerModule(myModule)` when the app starts (e.g. in `modules/registry.ts` next to Vespator). New campaigns choose the module with `createCampaignState({ module: 'my-module' })`.

### Skeleton (shortened from `tests/engine/demoModule.ts`)

The labels in the fixture are German because German is the source language of the app; `i18n.en` supplies the English versions.

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
  startCampaign(ctx, dates) { /* set up fleets, create phase 1, stage = PHASE 1 OPS */ },
  operations: { validate, set, clear },       // store attacks in moduleState
  advance(ctx) { /* OPS → BATTLES → RESULTS; apply outcomes on BATTLES → RESULTS */ },
  scorePhase(ctx) { /* update pointsHistory, flags.scored */ },
  endCampaign(ctx) { /* determine the winner, stage = ENDED */ },
  action(ctx, action, data) { /* 'RESULT': record the winner of a battle */ },
  publicView(view, full) { /* hide the orders of the current orders phase */ },
  i18n: { en: { 'Demo-Modul': 'Demo module', Überfall: 'Raid', Belagerung: 'Siege' } },
};
```

Scoring in the demo module: if the attacker wins, their alliance gets the points of the attack type (raid 1, siege 2); if the defender wins, the defender's alliance gets 1 point. The test `modules.test.ts` uses it to play a complete one-phase campaign through the normal commands `ALLIANCE_UPSERT`, `PLAYER_UPSERT`, `FLEET_SET_COUNT`, `SETUP_START`, `OP_SET`, `ADVANCE`, `MODULE_ACTION`, `SCORE` and `CAMPAIGN_END`.

## 4. What is still shaped by Vespator, and why

- State types: `Stage`, `PhaseStep`, `SetupStep`, `AttackType`, `OpType`, `RuleToggles`, `Operation`, `Battle.attackType` are typed to the Vespator values. Switching them to free strings would affect the whole interface. Modules therefore use the existing step IDs (e.g. `OPS`, `BATTLES`, `RESULTS`) and keep their own attack types in `moduleState`.
- Interface: the setup wizard, phase panels, briefing and rules card are built for Vespator. Another module needs its own panels there, or the panels have to query `moduleOf(state)`.
- Board mechanics: power level, infrastructure slots and strongholds (`board.ts`, `PlanetState`) are part of the generic state but follow the Vespator logic. Other modules can ignore them or keep their own state in `moduleState`.
- Overrides (`OVERRIDE_PL`, `OVERRIDE_SLOT`, `OVERRIDE_STRONGHOLD` …) and custom events (D2, which replace Vespator event codes) stay in the core because they work on the shared board.
- Core additions such as absence with a default operation (A5, creates Vespator operations), workload, secondary objectives, end-scoring variants (C2/C6) and fog over the score assume the Vespator points system.
- Map validation: `MAP_LIMITS` (6 to 24 planets) and the planets' theatre IDs apply to all modules.

## 5. License and content

Rules text from campaign books or codexes must not be copied into code, comments, master data or interface text. A module describes only the mechanics in its own words (flow, numbers, conditions) and uses proper names only as labels. No scanned tables, no verbatim quotes, no references to unofficial rules databases. Anyone building a module for a specific book assumes that the gaming group owns the book.
