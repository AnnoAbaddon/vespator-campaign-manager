# User guide

German version: [GUIDE.de.md](GUIDE.de.md)

This guide explains how to use the campaign manager day to day: as Warmaster (game master), as a player with a personal link, and as a viewer of the public view. Button and tab names are given as they appear in the English interface; the German name follows in parentheses where it helps.

## Warmaster

### First setup and account

- On a fresh installation, the server prints a one-time **setup token** to its log on every start (or uses `SETUP_TOKEN` from the environment). Open the link from the log, or open `/setup-admin` and paste the token into **Setup token**.
- Choose username, password (at least 10 characters) and **Default language** (preselected from your browser language, otherwise the installation's build default, usually English), then **Create Warmaster account** (Spielleiter-Konto anlegen). This first account is an **Admin**.
- Later you log in at `/login`. The header links lead to **Campaigns**, **Calendar**, **FAQ**, **Help** (this guide), **Account**, **League** and **Operations**; **Log out** ends the session.
- Under **Account** (Konto) you find three sections:
  - **Personal**: language of the admin area, **Change password**, and push notifications for "action needed" in your campaigns on this device.
  - **Administration** (admins only): **Accounts and roles**, the **Hall of Fame (public link)**, privacy notice and imprint, **Default language** and **Appearance** (**Use planet images**).
  - **Services** (admins only): **Public address** (base for links in e-mails, push and Discord), **Email delivery (SMTP)** and **Discord bot (commands)**.
- Set the **Public address** early, otherwise links in notifications cannot be built.

### Creating a campaign

1. Open **Campaigns**. The side panel **Create & import** has two tabs: **New campaign** and **Import backup**.
2. Fill in **Name**, the number of **Alliances** (2 or 3) and **Phases** (4 to 6 recommended; fixed once the campaign has started).
3. Choose a **Map**: the rulebook map "Vespator Front" or a custom map you saved as a template in the map editor.
4. Optional: a **Campaign template** (takes over house rules, map, missions, game sizes, phase rhythm and texts), a **Previous campaign (carry over players & medals)** and an **Intro (Markdown, optional)**.
5. Click **Create**. The campaign opens in the cockpit, in setup.

On the campaign list, **Manage** below each campaign lets you **Archive** it (read-only, can be restored) or delete it after typing its name.

### The campaign screen

- The left rail shows the chapters: **Situation & Cockpit**, **Battles**, **Alliances & Players**, **Texts & Decrees**, **Statistics**, **Log & Dice** and **Settings**. Below them: **Open public view**, the dice mode switch (**digital** / **by hand**) and **Undo**.
- The step list shows where you are: **Campaign setup** with W0 to W5, later **Steps of phase n**. Done steps are ticked; the current one is highlighted.
- The centre shows the **Tactical sector map**. Click a planet to open its **Planet dossier** in the right column; the tab **Orders** (Auftrag) shows the task of the current step.
- On a phone, the bottom bar has **Map**, **Task**, **Battles**, **Players** and **More**.

### The setup wizard

The wizard runs in the cockpit. Each step ends with **Next**.

- **W0 · Alliances, players & fleets**: create the alliances and players (detailed editing in **Alliances & Players**), assign every player to an alliance and set the fleets per alliance (**Number of fleets**, **Set fleets**; the rules recommendation is shown). Every player needs at least one fleet. The **Map** card in this step offers **Edit map** (map editor, random maps, saving as a template). Once W0 is completed, the map is locked for the campaign.
- **W1 · Medals from the previous campaign**: only with a previous campaign. **Suggest per rules** assigns each medal to the alliance with the most holders; you can reassign or discard.
- **W2 · Strongholds & starting Power Levels**: enter each alliance's secret choice (1 Stronghold planet at PL 4, a number of PL 3 and PL 2 planets, the rest PL 1) and **Save (hidden)**. When all alliances are complete, **Reveal**. Some medals then allow extra choices (**Apply**).
- **W3 · Starting infrastructure**: each alliance secretly picks its infrastructure pieces and planets; **Save (hidden)**, then **Reveal**. If a planet is over-subscribed, the app draws lots and you place the rejected pieces again.
- **W4 · Fleet starting positions**: one starting planet per fleet, **Save (hidden)**, **Reveal**. Medal effects such as swapping Power Levels (**Swap**) follow.
- **W5 · Prepare the start**: check starting points and fleets, set the dates of the first phase, then **Start campaign**.

Hidden entries are only visible to you until you reveal them, so you can collect them by message, paper or in person.

### Running a phase step by step

Each phase follows the book's steps 1 to 5. The cockpit shows one task at a time; the button at the bottom (**Continue to …** / **Next**) advances to the next step. If a deadline has not passed yet, the app asks before advancing.

1. **Choose operations** (Operationen wählen): fleet commanders give their orders through their player links, or you enter them with **Issue order**. The panel shows **Orders: x of n issued**. Orders stay hidden until the reveal. Fleets without an order automatically receive Logistical Auxilia when you advance.
2. **Reveal**: **Reveal operations** makes all operations public and creates a battle for every Battle Operation.
3. **Edifice Raising**: **Execute construction** resolves Raise Edifices operations in the correct order.
4. **Battles in progress** (Schlachten laufen): players arrange dates and report results; you follow progress in **Battles**. Results appear in the feed at once, but the map changes only when results are processed.
5. **Process results** (Ergebnisse verarbeiten): battles are listed chronologically. **Process** handles one battle, **Process all** the whole list. Missing outcome decisions are asked for here. Unplayed battles count as a win for the attacker unless you resolve them differently first.
6. **Fleet Arrival**: **Execute Void Leaps**.
7. **Low-level Resistance**: **Resolve Kill Teams** (dice or a Kill Team game). After this the map is published.
8. **Points & events** (Punkte & Events): **Calculate points**, then **Generate events** (Perils of Power, Desperate Measures, Fortunes of War). Events that need decisions are handled in their panels (see below).
9. **Move fleets** (Flotten bewegen): commanders submit moves through their links (hidden until executed); **Execute moves**.
10. **Build infrastructure** (Infrastruktur bauen): **Determine order**, then each alliance **Build**s one piece or **Pass**es. Alliance leaders can do this on their player page.

After step 10, **Continue to phase n** starts the next phase. Use **Propose and set dates** (or **Schedule & notes**) to set the deadlines for orders, battles and the end of the phase; players see deadlines only once they are set. **Warmaster notes for this phase (private)** are never shown to players.

Fleet commanders: by default each fleet keeps the commander of the previous phase, or the app rotates through the alliance's members. You can change the commander per phase in the order panel or under **Alliances & Players → Fleets**.

### Battles, results and confirmations

- The **Battles** chapter lists all battles with filters (phase, status, alliance, player, planet) and an **Overview** of open issues: disputed results, reports open for more than 48 h, missing dates, time clashes, missing defenders or outcome decisions. **Remind** sends a reminder to the players involved.
- Click a battle to edit it: players, **Played on**, mission, Theatre and Twist (**Roll Theatre**, **Roll Twist**), **Attacker VP** / **Defender VP**, Battle Ready, the victor (automatic by VP or an override), a public **Battle report**, a private **Warmaster note** and up to 10 photos. **Save battle** stores it.
- When a player reports a result, the battle shows **Reported result**. The opponent confirms it on their player page; after confirmation the result is taken over automatically. You can always decide yourself with **Apply** or **Discard**, for example when the report is **disputed** or unconfirmed for more than 48 h.
- Date proposals from players appear as buttons (**Set …** with the proposed date); you can also propose a date yourself.
- The winner decides the Campaign Outcomes (on the player page or in the battle's outcome editor, **Save decision**). Once a battle has been processed, its result can only be changed via **Undo**.
- **Resolve unplayed…** offers **Attacker wins (rule)**, **Defender wins**, **Void** and **Postpone to next phase**; every choice except the rule default needs a reason. **Reopen** undoes a void or unplayed resolution.
- Several operations on the same planet with the same alliances and Attack Type can be combined with **Bundle selection (2v2)**.
- Guest players without a link can be added in the battle editor (**Add guest**); they do not count in player statistics.
- If the house rule is enabled, **Free skirmishes** outside the orders can be entered and confirmed here as well.

### Player links, QR cards and handing them out

Players have no account. Each player gets a secret personal link (`/p/…`) that works like a password.

- **Alliances & Players → Players**, open a player with **Edit**: under **Personal player link** you can **Generate link**, copy it, show its QR code, **Regenerate** it (the old link stops working immediately) or **Revoke** it.
- **Print player links** opens an A4 overview sheet of all links. **QR cards** prints one business card per player (ten per A4 sheet) with name, alliance emblem, QR code and a short instruction; choose **Each player's profile language** or **Bilingual**. Links are created for players who never had one; revoked links stay revoked.
- Hand the cards out in person, or send each link privately (direct message, e-mail). Never post player links in a group channel.
- Ask players to open the link once on their phone and save it as a bookmark or to the home screen. The QR codes on printed result sheets only work on a device that has opened the personal link before.

### Events and decisions

- In step **Points & events**, **Generate events** rolls the events. Each event that needs a choice (target alliance, planet, build site, defectors, relocations) shows its own panel. Players concerned can submit their input through their link; you see it pre-filled (**Player inputs pre-filled**) and click **Apply**. **Discard (override)** drops an event with a reason.
- **Settings → Rules → Custom events** lets you build your own events from building blocks: schedule them for a phase, replace an entry of the event tables, or trigger them by hand in step 3.
- Individual events can be disabled under **Settings → Rules** (**Disable individual events**); a disabled event is rerolled.

### Undo and overrides

- **Undo** (Rückgängig) in the left rail reverts the last action. You can press it repeatedly. If an action crosses a phase boundary, the app asks before undoing it.
- **Log & Dice** shows the **Action log** (searchable, filter **overrides only**, **show undone**), the **Dice log** and **Time travel**: **Map at this point** or a phase snapshot opens a read-only view of an earlier state.
- Every value can be overridden: Power Level, slots, fleets, Strongholds, destroyed planets, points and medals. Open the **Planet dossier** and use its **Administration** area, or the override options in the battle and end panels. Overrides always ask for a **Reason (required, will be logged)**.
- If the engine warns about a rule conflict, a **Warning** dialog appears. **Continue anyway** performs the action and logs the warning.
- **Settings → Campaign → Scenario sandbox** creates a copy of the campaign to try things out. Afterwards **Discard sandbox** or **Apply sandbox** (the steps are appended to the real campaign).

### Dice

- The dice switch in the left rail chooses **digital** (the app rolls) or **by hand** (you roll real dice and enter each result in the **Enter roll** dialog). The setting is stored per browser.
- All rolls land in the **Dice log** with context, modifier, result and whether they are public. Players and viewers see the public rolls.

### House rules and settings

**Settings** has four tabs: **Campaign**, **Rules**, **Services** and **Export**.

- **Campaign**: **Rename**, **Default language (public view and player pages)**, the **Public link** (enable, disable, regenerate, QR code), **Archive & delete**, the scenario sandbox and **Campaign template** (**Save as template**).
- **Rules**: **Rule switches**, including **House rules for FAQ rulings**. The default is always the ruling from the Rules FAQ; a tick activates the alternative, which then also appears on the rules page and in the FAQ of the public view. Further blocks cover missions and game load (repeat lock, caps per player, roll off instead of forfeiting, free skirmishes), score and final scoring (fog over the score, planet weights, a Grand Battle finale) and player care. Click **Save switches**. Changes during a running campaign are logged with a warning and apply from the next action.
- **Rules** also contains the edition and game sizes, the **Mission pool** and **Custom events**.
- **Export**: backups, map PNG/SVG, **Print view**, **Print sheets** (order, movement and result sheets), Codex, **Timelapse**, **Presentation** and the **Phase report (Markdown for Discord/WhatsApp)**.

### Backups and restore

- The server makes a full ZIP backup of every campaign daily from 03:00 (state, history and images) and keeps the last 14. **Settings → Services → Automatic backups** shows the last backup; **Back up now** creates one immediately.
- **Settings → Export** downloads a **Full backup (ZIP incl. images)** or a **JSON backup**. Download one after each completed phase and keep it safe; backups contain contact details and player links.
- **Restore** (admins only) and **Campaigns → Import backup** always create a **new** campaign. They never overwrite an existing campaign, so you can check the restored copy and archive the old one afterwards.
- **Operations** (Betrieb) shows the last backup per campaign, free disk space, the notification outbox and server errors.

### Notifications

- **E-mail**: an admin sets up **Account → Services → Email delivery (SMTP)** once for all campaigns. Players need an e-mail address in their player record.
- **Discord**: per campaign, paste a webhook URL under **Settings → Services → Notifications** and use **Test Discord**. The optional **Discord bot (commands)** under **Account → Services** lets players link their Discord account with a one-time code and use commands such as `/situation`, `/tasks`, `/accept` and `/confirm`.
- **Web push**: players switch it on per device in their profile. You can enable push for "action needed" (disputes, reports open for 48 h, all orders in, all battles reported) under **Account → Personal**.
- **Calendar**: every player has a calendar subscription (iCal) with their battle dates. The **Calendar** page shows all campaigns' dates for the club.
- The **Delivery log** under **Settings → Services** lists sent and failed messages; **Resend failed messages** retries them.
- Players choose categories themselves (new phase, results and events, deadline reminders at 48 h and 12 h, personal messages) and can unsubscribe through the link in every e-mail.

### Co-Warmasters

- Under **Account → Administration → Accounts and roles**, **Invite new account** creates an invitation link. Choose the role **Co-Warmaster** and tick the campaigns they may manage, then **Create invitation link**.
- The link works once and expires after 7 days; the invited person chooses their own username and password.
- Co-Warmasters have full rights in their campaigns but cannot manage accounts, create campaigns or restore backups. The log records every action with the account name. You can change the campaign checkboxes later or delete the account.

### Absence, changes and late joiners

**Alliances & Players → Absence & changes** covers the life of a campaign:

- **Absence**: mark players absent for a phase. Absent players are not suggested as defenders and their fleets receive Logistical Auxilia without an order. Players can also report absence themselves.
- **Fleet handed over**: when a player leaves, choose the **Player handing over** and who **Takes over** (an alliance member or a new player), optionally let the player drop out and **Revoke the old player link**, then **Hand over**. Played battles and honours stay in the history.
- **Add late joiner**: add a player to an alliance from a given phase; they take over free fleets at once.
- **Phase pulse** (if enabled) shows the players' short feedback per phase.

### End of the campaign and follow-up campaign

- In the last phase, step **Points & events** has no events: **Calculate points**, then **End campaign**. The app determines the winner and the medals; you can still undo this.
- On a tie, the only intact Stronghold decides. If that does not settle it, the app asks for a **Deciding battle**: **Schedule battle**, play it, then **Set winner**.
- The end screen shows the winner, the final scores and the medals (medals can be overridden with a reason).
- **Create follow-up campaign** opens a new campaign form with players, alliances and medals carried over.
- Ended campaigns appear in the **Hall of Fame** and remain readable. Archive them when you no longer need them in the list.

## Players

### Your personal link

- The Warmaster gives you a personal link or a QR card. Open it on your phone and save the page as a bookmark or to the home screen. There is no password: the link is your key.
- Treat the link like a password and never share it. Anyone with the link can act in your name.
- If the link stops working, the Warmaster has regenerated or revoked it; ask them for a new one.
- The header shows **Rules** and **FAQ** of the campaign, **Help** (the player part of this guide), the language switch and a light or dark theme.
- Your page has five areas: **Tasks**, **Situation**, **Battles**, **Alliance** and **Profile**. On a phone they are in the bottom bar.

### Tasks and orders

- **Tasks** lists everything you have to do right now, with deadlines (**Orders due**, **Battles due**). If nothing is open, the Warmaster will be in touch when things move on.
- In step 1 of a phase you command the fleets assigned to you. For each fleet choose an **Operation**, and depending on the operation an **Attack Type**, **Target planet**, **Opponent**, **Destination** or **Infrastructure**, then **Issue order (hidden)**. The app warns if an order is likely to fail.
- Orders stay hidden until the Warmaster reveals them. Until then you can **Change** or **Withdraw** them.
- Fleets without an order receive Logistical Auxilia automatically.
- In step 4 you set moves for your fleets (**Set movement (hidden)**); in step 5 your alliance leader chooses what to **Build** or **Pass**.
- Some events ask for your input (for example a planet or a build site). They appear in **Tasks**; **Send input (hidden)** passes them to the Warmaster.

### Battles, dates and results

- **Battles** shows **Upcoming battles** with opponents and date, and your played battles.
- Defenders are chosen within the alliance: **I will defend** / **I will lead the attack** takes over a battle, **Hand over defence** / **Hand over attack** gives it back.
- **Propose dates** lets you offer one or more dates (**+ Date**, **Propose**). The other side accepts one with the button **Accept …** that shows the date. The app warns about time clashes with your other battles.
- After the game, **Report result**: VP of both sides, Battle Ready, date played, size, mission, Theatre and Twist rolls if needed, an optional report and photos. For several individual games use **Report several individual games**. **Send result for confirmation** sends it to the other side.
- If you won, you can send your Campaign Outcome decisions together with the result, or decide them later until the Warmaster processes the battle.
- When the other side reports, you see the result under **Battles**: **Confirm** accepts it, **Dispute** with a reason passes it to the Warmaster. Unconfirmed results go to the Warmaster after 48 h.
- The QR code on a printed result sheet opens the report form directly, if you have opened your personal link on that device before.
- If free skirmishes are enabled, you can report games outside the orders under **Free skirmishes**; they count after the opponent confirms.

### Alliance

- **Alliance** shows your alliance's orders for the current phase and **Alliance notes**, a message board only your alliance can see (**New note**, **Post**).

### Profile

- Change **Nickname**, **Army**, **Subfaction** and **Avatar**, then **Save**. A change of army applies from the next phase.
- **Language** sets the language of your player page and your notifications.
- **Commander**: name, title and portrait of your commander. The Warmaster awards honours and scars, and the app grants some honours automatically.
- Depending on the campaign's settings you also find **Absence** (report phases in which you cannot play), secret or personal objectives, rivalries, the **Painting chronicle** and the Crusade order of battle.
- **Record** shows your battles, victories, draws, defeats and medals.

### Notifications for players

- Under **Profile → Notifications**, tick the categories you want: new phase and revealed operations; results, events and end of campaign; deadline reminders (48 h / 12 h); personal messages (attacks, confirmations, date proposals).
- E-mails need an e-mail address, which the Warmaster enters. Every e-mail contains an unsubscribe link.
- **Push notifications**: **Switch on** per device. A test message confirms it works. On iPhone, add the page to the home screen first. If the browser blocks it, allow notifications in the site settings.
- **Link Discord**: if the Warmaster has set up the Discord bot, you get a one-time code to enter in Discord. Afterwards you can use commands such as `/situation`, `/tasks`, `/accept` and `/confirm`.
- **Calendar**: the profile shows a calendar subscription link with your battle dates. Add it to your calendar app as a subscription.

## Viewers and presentation mode

### Public view

- The Warmaster can share a public link (`/v/…`). Anyone with the link can read the campaign; it is hidden from search engines and shows no contact details and no hidden orders.
- Areas: **Situation** (map, points, battle feed, deadlines), **Statistics**, **Timelapse**, **Codex** (the campaign chronicle, printable), **Gallery**, **Rules** and **FAQ**. Click a planet for its dossier, or a player in the ranking for their profile.
- The language switch in the header changes the language; the theme switch offers a light archive theme for daylight.
- The Warmaster can disable or regenerate the public link at any time.
- The **Hall of Fame** is a separate public link (set up under **Account → Administration**) listing all finished campaigns, winners and medals.

### Presentation mode

- For club evenings on a TV or projector: **Settings → Export → Presentation**, or append `/present` to the public link.
- The presentation cycles through map, ranking, chronicle and timelapse every 30 seconds. Append `?t=60` to change the interval (10 to 120 seconds).
- Keys: **Space** pauses or resumes, **←** and **→** switch views. **Sound on** starts an optional ambient sound generated in the browser.
- Use the browser's full-screen mode (usually F11).

## Troubleshooting and FAQ

### A player lost their link

Open the player under **Alliances & Players → Players → Edit** and copy the existing link, or **Regenerate** it if it may have been seen by others (the old link stops working immediately). Print a new QR card if needed.

### A player's link has leaked

**Regenerate** or **Revoke** the link right away. Everything done through the old link stays in the log with the player's name.

### A result was entered wrongly

- Not yet processed: open the battle in **Battles**, correct the values and **Save battle**, or **Discard** the reported result and let the players report again.
- Already processed (step **Process results** done): use **Undo** back to before the processing, correct the battle and process again. If later steps have happened since, an override with a reason (for example on Power Level in the planet dossier) is often simpler.

### A player left the campaign

Use **Absence & changes → Fleet handed over**: pass the fleets, open battles and leader role to an alliance member or a new player, and revoke the old link. The player's history stays intact.

### A battle cannot be played in time

**Resolve unplayed…** in the battle list: attacker wins (rule), defender wins, void or postpone to the next phase. With the house rule "Roll off instead of forfeiting", a D6 duel decides instead.

### Dice

- Want to use real dice? Switch the dice mode to **by hand**; the app then asks for every roll.
- A roll went wrong? **Undo** the action and run it again. All rolls stay in the **Dice log**.
- Players cannot roll campaign dice; they enter Theatre or Twist rolls in the result form when a rule requires it.

### Language

- Admin area: language switch in the header or **Account → Personal → Language**.
- Players and viewers: language switch in the header; players can also set it in **Profile**.
- The campaign's default language for the public view and player pages is set under **Settings → Campaign**.
- The interface is available in German, English, French, Spanish and Polish. The Rules FAQ and this guide are only available in German and English; other languages show the English version. Game terms from the book stay in English in every language.

### Setup token or password lost

The setup token is printed to the server log on every start as long as no account exists. There is no password reset in the interface: another admin can invite you again; otherwise the operator follows the "forgotten password" section of the deployment guide.

### Notifications do not arrive

- Check **Account → Services**: **Public address** and **Email delivery (SMTP)** must be set; use **Test email**.
- Check the **Delivery log** under **Settings → Services** and **Resend failed messages**.
- Discord: **Test Discord**; the webhook may have been deleted in Discord.
- Push: the player has to switch it on on each device; blocked notifications must be allowed in the browser.
- Players may have unsubscribed from a category in their profile.

### The QR code on a result sheet does not work

The code contains no personal link, on purpose. Open your personal link once on that phone, then scan again.

### The app shows "Offline"

You are looking at the last loaded state. Entering anything needs a connection, so reload once you are back online.
