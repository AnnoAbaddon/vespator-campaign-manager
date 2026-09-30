# Roadmap

This page lists what the app already does beyond the core campaign rules and what could come next. Please send proposals as a GitHub issue with the "Feature request" template. Quote reviews only briefly and with a source, and never include rules text from the book.

New features follow a few principles. By default the app behaves as the book says, and every addition can be switched off. Everything works without AI features, either deterministically or from user input. Every page fits one screen on desktop and mobile, and engine changes come with unit tests.

## Implemented

### Interface

- Terminal-style interface with one-screen layouts, mobile navigation and touch targets of at least 44 px (N0).
- Optional light "archive" theme for the reader view (NTH2 5.3).
- Installable web app (PWA), readable offline (N5.3).

### Players

- Personal secret player link with orders, results, outcome decisions, fleet movement, building and profile (N1.1 to N1.3).
- Results as drafts that the opponent confirms or disputes; the Warmaster decides after a deadline (N1.2).
- Scheduling with proposals and confirmation, battle load display and defender suggestions (N1.5, N1.6).
- Absence mode with default operation, fleet hand-over and late joiners (A5, B2).
- Phase pulse (short mood poll), nemesis and rivalry statistics, secret personal objectives (B4, C5, C4).
- Painting chronicle with photos (D5).
- Remaining Warmaster decisions (Archeotech tie, Cult Uprisings, Smuggled Assets) can be made by players (NTH2 2.3).

### Notifications and scheduling

- E-mail and Discord webhook per campaign, deadline reminders, opt-out (N1.4).
- Web push per player link and category (NTH2 1.1).
- Discord bot with slash commands for status, scheduling and confirmation (NTH2 1.2).
- Confirm a result through a signed one-time link (NTH2 1.5).
- "Remind" button per open item in the Warmaster's to-do list (NTH2 2.7).
- Club calendar across all campaigns with tables, collision check and iCal feed (NTH2 2.5).

### Rules and game master tools

- Rules FAQ decisions as per-campaign house-rule switches (N2.1).
- Missions per battle, mission pool per attack type with repeat warning, pairing history (N2.2, A1 to A3).
- Several games per battle operation, final-phase incentives, reserve fleets, edition and battle sizes (N2.3 to N2.6).
- Optional hard cap on games per player, "roll off instead of forfeit", guest players, free skirmishes (A4, B1, B3, B5).
- Hidden score, alternative final scoring, Warmaster phase objective, final grand battle (C1, C2, C3, C6).
- Handicap events without the dice test, custom events from effect building blocks (A6, D2).
- "This battle" rules card and terrain layout per theatre in the briefing (A7, A8).
- Scenario sandbox and forced events in the sandbox (NTH2 2.1, 2.2).
- Dice values in the result diff and a public dice log (NTH2 2.4, D3).
- Campaign templates (NTH2 2.6).
- Kill Team games for "Deploy Kill Teams" and external space combat for boarding actions (N4.1, N4.2).

### Story and presentation

- Codex: printable campaign chronicle (N3.1).
- Time-lapse of the map with video export (N3.2).
- Presentation mode for club evenings with optional generated ambient sound (N3.3, NTH2 4.4).
- Commanders with honours and scars (N3.4).
- Pre-filled print sheets, QR code on the result sheet, QR cards for player links (N3.5, NTH2 1.3, 1.4).
- Decree builder from prepared text blocks (NTH2 4.1).
- Own planet images, battle report gallery and picture of the phase (NTH2 4.2, 4.3, D1).
- Front analysis: most contested planet, most active player, streaks, heatmap over time (D4).

### Platform and operations

- Automatic daily backups with one-click restore as a new campaign (N5.1).
- Accounts and roles: admin and co-Warmaster, author in the log (N5.2).
- Map editor with templates and a validated random map generator (N5.5, NTH2 3.4).
- League across campaigns with ranking and Hall of Fame (NTH2 3.1).
- Light Crusade integration and planet traits (NTH2 3.2, A9).
- Rules module interface with Vespator as the first module (NTH2 3.3, see [MODULE.md](MODULE.md)).
- Health page, privacy tools (export and deletion of contact data, clean-up after the campaign) (NTH2 6.2, 6.4).
- End-to-end test of a complete campaign (NTH2 6.3).

### Languages

- German and English interface, FAQ and documentation (N5.4).
- French, Spanish and Polish with English fallback; translation export and import with a check list (NTH2 7.1, 7.2).
- Bilingual campaign content and bilingual print sheets and Codex (NTH2 7.3, 7.4).

## Possible future work

- More campaign modules behind the module interface, either self-designed or from other books where the license allows it.
- Generic state types. Stage, step and attack-type types are still typed to the Vespator values; loosening them would let modules define their own phase steps (see [MODULE.md](MODULE.md), section 4).
- Module-specific UI. The setup wizard, phase panels, briefing and rules card are built for Vespator, so other modules need their own panels.
- More interface languages through the translation file. The rules FAQ and the user guide exist only in German and English.
- Offline input. The PWA is read-only offline and cannot queue input yet.

Deliberately out of scope: AI text, image or translation features, and tournament-style automatic pairings (orders and defender choice decide the pairings in this campaign system).

## Feature IDs in the code

Code comments and tests refer to features by short IDs from the original feature lists:

| Prefix | Area |
| --- | --- |
| N0 to N6 | First extension: N0 interface, N1 player participation, N2 rules and balance, N3 story (N3.1 Codex, N3.2 time-lapse, N3.3 presentation, N3.4 commanders, N3.5 print sheets), N4 other game systems, N5 operations (backups, roles, PWA, English, map editor), N6 planet images |
| NTH2 x.y | Second extension: 1 player experience, 2 game master tools, 3 rules and systems, 4 story, 5 design, 6 operations, 7 languages |
| A, B, C, D | Items from community feedback: A missions and battle load, B organisation and drop-outs, C balance and story, D tools and statistics |
| P1 to P3, R1 to R3 | Implementation groups of the second extension (platform and rules) |
