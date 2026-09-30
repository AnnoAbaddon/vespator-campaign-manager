# Hilfe zum Umgang

English version: [GUIDE.md](GUIDE.md)

Diese Hilfe erklärt die tägliche Arbeit mit dem Kampagnenmanager: als Warmaster (Spielleiter), als Spieler mit persönlichem Link und als Zuschauer der Leseansicht. Tasten- und Reiternamen stehen so da, wie sie in der Oberfläche erscheinen.

## Warmaster

### Ersteinrichtung und Konto

- Bei einer frischen Installation schreibt der Server bei jedem Start einen Einmal-**Setup-Token** in sein Log (oder nimmt `SETUP_TOKEN` aus der Umgebung). Öffne den Link aus dem Log oder rufe `/setup-admin` auf und trage den Token ins Feld **Setup-Token** ein.
- Wähle Benutzername, Passwort (mindestens 10 Zeichen) und **Standardsprache** (vorbelegt aus der Browsersprache, sonst die Standardsprache des Builds, meist Englisch), dann **Spielleiter-Konto anlegen**. Dieses erste Konto ist ein **Admin**.
- Später meldest du dich unter `/login` an. Die Kopfzeile führt zu **Kampagnen**, **Kalender**, **FAQ**, **Hilfe** (diese Anleitung), **Konto**, **Liga** und **Betrieb**; **Abmelden** beendet die Sitzung.
- Unter **Konto** gibt es drei Bereiche:
  - **Persönlich**: Sprache der Verwaltung, **Passwort ändern** und Push-Benachrichtigungen bei Handlungsbedarf in deinen Kampagnen auf diesem Gerät.
  - **Administration** (nur Admins): **Konten und Rollen**, **Hall of Fame (öffentlicher Link)**, Datenschutzhinweis und Impressum, **Standardsprache** und **Darstellung** (**Planetenbilder verwenden**).
  - **Dienste** (nur Admins): **Öffentliche Adresse** (Basis für Links in E-Mails, Push und Discord), **E-Mail-Versand (SMTP)** und **Discord-Bot (Befehle)**.
- Trage die **Öffentliche Adresse** früh ein, sonst können Benachrichtigungen keine Links enthalten.

### Kampagne anlegen

1. Öffne **Kampagnen**. Die Seitenspalte **Anlegen & Importieren** hat zwei Register: **Neue Kampagne** und **Backup importieren**.
2. Trage **Name**, die Zahl der **Allianzen** (2 oder 3) und **Phasen** ein (empfohlen 4 bis 6; nach dem Start fix).
3. Wähle die **Karte**: die Regelwerk-Karte „Vespator Front“ oder eine eigene Karte, die du im Karteneditor als Vorlage gespeichert hast.
4. Optional: eine **Kampagnen-Vorlage** (übernimmt Hausregeln, Karte, Missionen, Spielgrößen, Phasenrhythmus und Texte), eine **Vorkampagne (Spieler & Medaillen übernehmen)** und ein **Intro (Markdown, optional)**.
5. Klicke **Anlegen**. Die Kampagne öffnet sich im Cockpit, im Aufbau.

In der Kampagnenliste kannst du unter **Verwalten** eine Kampagne **Archivieren** (schreibgeschützt, jederzeit zurückholbar) oder nach Eingabe ihres Namens löschen.

### Der Kampagnenbildschirm

- Die linke Leiste zeigt die Kapitel: **Lage & Cockpit**, **Schlachten**, **Allianzen & Spieler**, **Texte & Dekrete**, **Statistik**, **Log & Würfel** und **Einstellungen**. Darunter: **Leseansicht öffnen**, der Würfelmodus (**digital** / **von Hand**) und **Rückgängig**.
- Die Schrittliste zeigt, wo du stehst: **Kampagnenaufbau** mit W0 bis W5, später **Schritte der Phase n**. Erledigte Schritte sind abgehakt, der aktuelle ist hervorgehoben.
- In der Mitte liegt die **Taktische Sektorkarte**. Ein Klick auf einen Planeten öffnet rechts die **Planetenakte**; der Reiter **Auftrag** zeigt die Aufgabe des aktuellen Schritts.
- Auf dem Handy hat die untere Leiste **Karte**, **Aufgabe**, **Schlachten**, **Spieler** und **Mehr**.

### Der Aufbau-Assistent

Der Assistent läuft im Cockpit. Jeder Schritt endet mit **Weiter**.

- **W0 · Allianzen, Spieler & Flotten**: Allianzen und Spieler anlegen (ausführlich im Kapitel **Allianzen & Spieler**), jeden Spieler einer Allianz zuordnen und die Flotten je Allianz festlegen (**Flottenzahl**, **Flotten setzen**; die Empfehlung nach Regel wird angezeigt). Jeder Spieler braucht mindestens eine Flotte. Die Karte **Karte** in diesem Schritt bietet **Karte bearbeiten** (Karteneditor, Zufallskarten, Speichern als Vorlage). Nach Abschluss von W0 ist die Karte für die Kampagne gesperrt.
- **W1 · Medaillen der Vorkampagne**: nur mit Vorkampagne. **Vorschlag nach Regel** gibt jede Medaille der Allianz mit den meisten Trägern; du kannst sie anders zuordnen oder verwerfen.
- **W2 · Strongholds & Start-Power-Level**: die verdeckte Wahl jeder Allianz eintragen (1 Stronghold-Planet mit PL 4, einige Planeten mit PL 3 und PL 2, alle übrigen PL 1) und **Speichern (verdeckt)**. Sind alle Allianzen vollständig, **Aufdecken**. Manche Medaillen erlauben danach Zusatzwahlen (**Anwenden**).
- **W3 · Start-Infrastruktur**: jede Allianz wählt verdeckt ihre Infrastrukturen und Planeten; **Speichern (verdeckt)**, dann **Aufdecken**. Sind auf einem Planeten zu viele Wünsche, lost die App aus, und du platzierst die zurückgewiesenen Stücke neu.
- **W4 · Flotten-Startpositionen**: ein Startplanet je Flotte, **Speichern (verdeckt)**, **Aufdecken**. Medaillen-Effekte wie das Tauschen von Power Level (**Tauschen**) folgen.
- **W5 · Start vorbereiten**: Startpunkte und Flotten prüfen, die Termine der ersten Phase setzen, dann **Kampagne starten**.

Verdeckte Eingaben siehst nur du, bis du aufdeckst. Du kannst sie also per Nachricht, auf Papier oder am Tisch einsammeln.

### Eine Phase Schritt für Schritt

Jede Phase folgt den Schritten 1 bis 5 aus dem Buch. Das Cockpit zeigt immer eine Aufgabe; die Taste unten (**Weiter zu …** / **Weiter**) schaltet zum nächsten Schritt. Ist eine Frist noch nicht abgelaufen, fragt die App vorher nach.

1. **Operationen wählen**: Die Flottenkommandanten geben ihre Befehle über ihre Spielerlinks, oder du trägst sie mit **Befehl erteilen** ein. Das Panel zeigt **Befehle: x von n erteilt**. Befehle bleiben bis zum Reveal verdeckt. Flotten ohne Befehl erhalten beim Weiterschalten automatisch Logistical Auxilia.
2. **Reveal**: **Operationen aufdecken** macht alle Operationen öffentlich und legt für jede Battle Operation eine Schlacht an.
3. **Edifice Raising**: **Bauen ausführen** handelt die Raise-Edifices-Operationen in der richtigen Reihenfolge ab.
4. **Schlachten laufen**: Die Spieler machen Termine aus und melden Ergebnisse; den Fortschritt siehst du unter **Schlachten**. Ergebnisse stehen sofort im Feed, die Karte ändert sich aber erst beim Verarbeiten.
5. **Ergebnisse verarbeiten**: Die Schlachten stehen chronologisch. **Verarbeiten** handelt eine Schlacht ab, **Alle verarbeiten** die ganze Liste. Fehlende Outcome-Entscheidungen werden hier abgefragt. Ungespielte Schlachten zählen als Sieg des Angreifers, wenn du sie nicht vorher anders wertest.
6. **Fleet Arrival**: **Void Leaps ausführen**.
7. **Low-level Resistance**: **Kill Teams auswerten** (Würfel oder Kill-Team-Spiel). Danach wird die Karte veröffentlicht.
8. **Punkte & Events**: **Punkte berechnen**, dann **Events generieren** (Perils of Power, Desperate Measures, Fortunes of War). Events mit Entscheidungen bearbeitest du in ihren Panels (siehe unten).
9. **Flotten bewegen**: Die Kommandanten geben ihre Züge über ihre Links ab (verdeckt bis zur Ausführung); **Bewegungen ausführen**.
10. **Infrastruktur bauen**: **Reihenfolge bestimmen**, dann **Bauen** oder **Verzichten** je Allianz. Allianzanführer können das auf ihrer Spielerseite erledigen.

Nach Schritt 10 startet **Weiter zu Phase n** die nächste Phase. Mit **Termine vorschlagen und setzen** (oder **Termine & Notizen**) legst du die Fristen für Befehle, Schlachten und das Phasenende fest; Spieler sehen Fristen erst, wenn sie gesetzt sind. **SL-Notizen zur Phase (privat)** sehen die Spieler nie.

Flottenkommandanten: Standardmäßig behält jede Flotte den Kommandanten der Vorphase, sonst verteilt die App die Flotten reihum an die Mitglieder der Allianz. Den Kommandanten je Phase änderst du im Befehlspanel oder unter **Allianzen & Spieler → Flotten**.

### Schlachten, Ergebnisse und Bestätigungen

- Das Kapitel **Schlachten** listet alle Schlachten mit Filtern (Phase, Status, Allianz, Spieler, Planet) und einer **Übersicht** offener Punkte: angefochtene Ergebnisse, Meldungen über 48 h offen, fehlende Termine, Terminüberschneidungen, fehlende Verteidiger oder Outcome-Entscheidungen. **Erinnern** schickt den Beteiligten eine Erinnerung.
- Ein Klick auf eine Schlacht öffnet den Editor: Spieler, **Gespielt am**, Mission, Theatre und Twist (**Theatre würfeln**, **Twist würfeln**), **VP Angreifer** / **VP Verteidiger**, Battle Ready, Sieger (automatisch nach VP oder per Override), ein öffentlicher **Schlachtbericht**, eine private **SL-Notiz** und bis zu 10 Fotos. **Schlacht speichern** sichert alles.
- Meldet ein Spieler ein Ergebnis, zeigt die Schlacht **Gemeldetes Ergebnis**. Die Gegenseite bestätigt auf ihrer Spielerseite; danach ist das Ergebnis automatisch übernommen. Du kannst jederzeit selbst mit **Übernehmen** oder **Verwerfen** entscheiden, etwa wenn die Meldung **angefochten** oder seit über 48 h unbestätigt ist.
- Terminvorschläge der Spieler erscheinen als Tasten (**… festlegen** mit dem vorgeschlagenen Datum); du kannst auch selbst einen Termin vorschlagen.
- Der Sieger entscheidet über die Campaign Outcomes (auf der Spielerseite oder im Outcome-Editor der Schlacht, **Entscheidung speichern**). Ist eine Schlacht verarbeitet, lässt sich ihr Ergebnis nur noch per **Rückgängig** ändern.
- **Ungespielt werten…** bietet **Angreifer siegt (Regel)**, **Verteidiger siegt**, **Verfällt** und **In nächste Phase verschieben**; alles außer dem Regelfall braucht eine Begründung. **Wieder öffnen** hebt eine solche Wertung auf.
- Mehrere Operationen auf demselben Planeten mit denselben Allianzen und demselben Attack Type lassen sich mit **Auswahl bündeln (2v2)** zusammenfassen.
- Gastspieler ohne Link trägst du im Schlachten-Editor ein (**Gast eintragen**); sie zählen nicht für die Spielerstatistik.
- Ist die Hausregel eingeschaltet, trägst du hier auch **Freie Gefechte** außerhalb der Befehle ein und bestätigst sie.

### Spielerlinks, QR-Karten und Verteilung

Spieler haben kein Konto. Jeder Spieler bekommt einen geheimen persönlichen Link (`/p/…`), der wie ein Passwort wirkt.

- **Allianzen & Spieler → Spieler**, Spieler mit **Bearbeiten** öffnen: Unter **Persönlicher Spielerlink** kannst du **Link erzeugen**, ihn kopieren, den QR-Code zeigen, ihn **Neu erzeugen** (der alte Link wird sofort ungültig) oder **Sperren**.
- **Spielerlinks drucken** öffnet ein A4-Sammelblatt aller Links. **QR-Karten** druckt je Spieler eine Visitenkarte (zehn je A4-Bogen) mit Name, Allianz-Wappen, QR-Code und kurzer Anleitung; wähle **Profilsprache je Spieler** oder **Zweisprachig**. Links entstehen für Spieler, die noch nie einen hatten; gesperrte bleiben gesperrt.
- Verteile die Karten persönlich oder schicke jedem Spieler seinen Link einzeln (Direktnachricht, E-Mail). Spielerlinks nie in einen Gruppenkanal posten.
- Bitte die Spieler, den Link einmal auf dem Handy zu öffnen und als Lesezeichen oder auf dem Startbildschirm zu speichern. Die QR-Codes auf gedruckten Ergebnisbögen funktionieren nur auf einem Gerät, das den persönlichen Link schon einmal geöffnet hat.

### Events und Entscheidungen

- Im Schritt **Punkte & Events** würfelt **Events generieren** die Events aus. Jedes Event mit einer Wahl (Ziel-Allianz, Planet, Bauplatz, Überläufer, Verlegungen) hat ein eigenes Panel. Betroffene Spieler können ihre Eingabe über ihren Link abgeben; du siehst sie vorbelegt (**Eingaben der Spieler vorbelegt**) und klickst **Anwenden**. **Verwerfen (Override)** lässt ein Event mit Begründung fallen.
- Unter **Einstellungen → Regeln → Eigene Ereignisse** baust du eigene Ereignisse aus Bausteinen: für eine Phase einplanen, einen Eintrag der Event-Tabellen ersetzen oder in Schritt 3 von Hand auslösen.
- Einzelne Events lassen sich unter **Einstellungen → Regeln** deaktivieren (**Einzelne Events deaktivieren**); ein deaktiviertes Event wird neu gewürfelt.

### Rückgängig und Overrides

- **Rückgängig** in der linken Leiste nimmt die letzte Aktion zurück. Du kannst es mehrfach drücken. Überschreitet eine Aktion eine Phasengrenze, fragt die App vorher nach.
- **Log & Würfel** zeigt das **Aktions-Log** (durchsuchbar, Filter **nur Overrides**, **rückgängig gemachte zeigen**), das **Würfelprotokoll** und die **Zeitreise**: **Karte zu diesem Zeitpunkt** oder ein Phasen-Snapshot zeigt einen früheren Stand nur lesend.
- Jeder Wert lässt sich überschreiben: Power Level, Slots, Flotten, Strongholds, zerstörte Planeten, Punkte und Medaillen. Öffne die **Planetenakte** und nutze ihren Bereich **Verwaltung**, oder die Override-Möglichkeiten in den Schlachten- und Endpanels. Overrides verlangen immer eine **Begründung (Pflicht, wird geloggt)**.
- Warnt die Engine vor einem Regelkonflikt, erscheint ein Dialog **Warnung**. **Trotzdem fortfahren** führt die Aktion aus und vermerkt die Warnung im Log.
- **Einstellungen → Kampagne → Szenario-Sandbox** legt eine Kopie der Kampagne zum Ausprobieren an. Danach **Sandbox verwerfen** oder **Sandbox übernehmen** (die Schritte werden an die echte Kampagne angehängt).

### Würfel

- Der Würfelschalter in der linken Leiste wählt **digital** (die App würfelt) oder **von Hand** (du würfelst echt und trägst jedes Ergebnis im Dialog **Wurf eintragen** ein). Die Einstellung gilt je Browser.
- Alle Würfe stehen im **Würfelprotokoll** mit Kontext, Modifikator, Ergebnis und ob sie öffentlich sind. Spieler und Zuschauer sehen die öffentlichen Würfe.

### Hausregeln und Einstellungen

**Einstellungen** hat vier Register: **Kampagne**, **Regeln**, **Dienste** und **Export**.

- **Kampagne**: **Umbenennen**, **Standardsprache (Leseansicht und Spielerseiten)**, der **Öffentliche Link** (aktivieren, deaktivieren, neu erzeugen, QR-Code), **Archiv & Löschen**, die Szenario-Sandbox und **Kampagnen-Vorlage** (**Als Vorlage speichern**).
- **Regeln**: **Regel-Schalter**, darunter **Hausregeln zu FAQ-Entscheidungen**. Standard ist immer die Entscheidung aus dem Regel-FAQ; ein Haken aktiviert die Alternative, die dann auch auf der Regeln-Seite und im FAQ der Leseansicht erscheint. Weitere Blöcke betreffen Missionen und Spiellast (Wiederholungssperre, Obergrenzen je Spieler, Auswürfeln statt verfallen, freie Gefechte), Punktestand und Endwertung (Nebel über dem Punktestand, Gewichte je Planet, Finale „Großschlacht“) sowie die Spielerbetreuung. Klicke **Schalter speichern**. Änderungen in einer laufenden Kampagne werden mit Warnung geloggt und gelten ab der nächsten Aktion.
- **Regeln** enthält außerdem Edition und Spielgrößen, den **Missions-Pool** und **Eigene Ereignisse**.
- **Export**: Backups, Karte als PNG/SVG, **Druckansicht**, **Druckbögen** (Befehls-, Bewegungs- und Ergebnisbögen), Codex, **Zeitraffer**, **Präsentation** und der **Phasenbericht (Markdown für Discord/WhatsApp)**.

### Backups und Wiederherstellen

- Der Server sichert jede Kampagne täglich ab 03:00 Uhr als Komplett-ZIP (Stand, Historie, Bilder) und behält die letzten 14. **Einstellungen → Dienste → Automatische Backups** zeigt das letzte Backup; **Jetzt sichern** legt sofort eines an.
- **Einstellungen → Export** lädt ein **Komplett-Backup (ZIP inkl. Bilder)** oder ein **JSON-Backup** herunter. Lade nach jedem Phasenabschluss eines herunter und bewahre es sicher auf; Backups enthalten Kontaktdaten und Spielerlinks.
- **Wiederherstellen** (nur Admins) und **Kampagnen → Backup importieren** legen immer eine **neue** Kampagne an. Eine bestehende Kampagne wird dabei nie überschrieben, also kannst du die wiederhergestellte Kopie prüfen und die alte danach archivieren.
- **Betrieb** zeigt das letzte Backup je Kampagne, den freien Speicher, die Warteschlange der Benachrichtigungen und Serverfehler.

### Benachrichtigungen einrichten

- **E-Mail**: Ein Admin richtet einmal **Konto → Dienste → E-Mail-Versand (SMTP)** für alle Kampagnen ein. Spieler brauchen eine E-Mail-Adresse in ihrem Spielereintrag.
- **Discord**: Je Kampagne trägst du unter **Einstellungen → Dienste → Benachrichtigungen** eine Webhook-URL ein und prüfst sie mit **Discord testen**. Der optionale **Discord-Bot (Befehle)** unter **Konto → Dienste** erlaubt Spielern, ihren Discord-Zugang per Einmal-Code zu verknüpfen und Befehle wie `/lage`, `/aufgaben`, `/annehmen` und `/bestätigen` zu nutzen.
- **Web-Push**: Spieler schalten ihn je Gerät im Profil ein. Für dich gibt es unter **Konto → Persönlich** Push bei Handlungsbedarf (Widerspruch, Meldung seit 48 h offen, alle Befehle eingegangen, alle Schlachten gemeldet).
- **Kalender**: Jeder Spieler hat ein Kalender-Abo (iCal) mit seinen Schlachtterminen. Die Seite **Kalender** zeigt die Termine aller Kampagnen für den Club.
- Das **Versandprotokoll** unter **Einstellungen → Dienste** listet verschickte und fehlgeschlagene Nachrichten; **Fehlgeschlagene erneut senden** versucht es noch einmal.
- Spieler wählen die Kategorien selbst (neue Phase, Ergebnisse und Events, Erinnerungen an Deadlines nach 48 h und 12 h, Persönliches) und können über den Link in jeder E-Mail abbestellen.

### Co-Warmaster

- Unter **Konto → Administration → Konten und Rollen** erzeugt **Neues Konto einladen** einen Einladungslink. Wähle die Rolle **Co-Warmaster**, hake die Kampagnen an, die die Person verwalten darf, und klicke **Einladungslink erzeugen**.
- Der Link funktioniert einmal und läuft nach 7 Tagen ab; die eingeladene Person legt Benutzername und Passwort selbst fest.
- Co-Warmaster haben volle Rechte in ihren Kampagnen, verwalten aber keine Konten, legen keine Kampagnen an und stellen keine Backups wieder her. Jede Aktion steht mit dem Kontonamen im Log. Die Kampagnen-Haken kannst du später ändern oder das Konto löschen.

### Abwesenheit, Wechsel und Nachzügler

**Allianzen & Spieler → Abwesenheit & Wechsel** begleitet die Kampagne:

- **Abwesenheit**: Spieler für eine Phase abwesend melden. Abwesende werden nicht als Verteidiger vorgeschlagen, ihre Flotten erhalten ohne Befehl Logistical Auxilia. Spieler können sich auch selbst abmelden.
- **Flotte übergeben**: Verlässt ein Spieler die Kampagne, wähle den **Abgebenden Spieler** und wer **Übernimmt** (ein Allianzkollege oder ein neuer Spieler), lass den Abgebenden auf Wunsch ausscheiden und **Alten Spielerlink sperren**, dann **Übergeben**. Gespielte Schlachten und Ehrungen bleiben in der Historie.
- **Nachzügler aufnehmen**: einen Spieler ab einer bestimmten Phase in eine Allianz aufnehmen; freie Flotten übernimmt er sofort.
- **Phasen-Puls** (falls eingeschaltet) zeigt die kurzen Rückmeldungen der Spieler je Phase.

### Kampagnenende und Folgekampagne

- In der letzten Phase gibt es im Schritt **Punkte & Events** keine Events: **Punkte berechnen**, dann **Kampagne beenden**. Die App stellt Sieger und Medaillen fest; Rückgängig bleibt möglich.
- Bei Gleichstand entscheidet der einzige intakte Stronghold. Reicht das nicht, verlangt die App eine **Entscheidungsschlacht**: **Schlacht ansetzen**, spielen, dann **Sieger festlegen**.
- Der Endbildschirm zeigt Sieger, Endstand und Medaillen (Medaillen lassen sich mit Begründung überschreiben).
- **Folgekampagne anlegen** öffnet das Formular für eine neue Kampagne; Spieler, Allianzen und Medaillen werden übernommen.
- Beendete Kampagnen erscheinen in der **Hall of Fame** und bleiben lesbar. Archiviere sie, wenn du sie nicht mehr in der Liste brauchst.

## Spieler

### Dein persönlicher Link

- Der Warmaster gibt dir einen persönlichen Link oder eine QR-Karte. Öffne ihn auf dem Handy und speichere die Seite als Lesezeichen oder auf dem Startbildschirm. Es gibt kein Passwort: Der Link ist dein Schlüssel.
- Behandle den Link wie ein Passwort und gib ihn nie weiter. Wer den Link hat, handelt in deinem Namen.
- Funktioniert der Link nicht mehr, hat der Warmaster ihn neu erzeugt oder gesperrt; bitte ihn um einen neuen.
- Die Kopfzeile zeigt **Regeln** und **FAQ** der Kampagne, **Hilfe** (der Spielerteil dieser Anleitung), die Sprachwahl und ein helles oder dunkles Thema.
- Deine Seite hat fünf Bereiche: **Aufgaben**, **Lage**, **Schlachten**, **Allianz** und **Profil**. Auf dem Handy liegen sie in der unteren Leiste.

### Aufgaben und Befehle

- **Aufgaben** listet alles, was gerade zu tun ist, mit Fristen (**Befehle bis**, **Schlachten bis**). Ist nichts offen, meldet sich der Warmaster, wenn es weitergeht.
- In Schritt 1 einer Phase befehligst du die dir zugeteilten Flotten. Wähle je Flotte eine **Operation** und je nach Operation **Attack Type**, **Zielplanet**, **Gegner**, **Ziel** oder **Infrastruktur**, dann **Befehl erteilen (verdeckt)**. Die App warnt, wenn ein Befehl voraussichtlich scheitert.
- Befehle bleiben verdeckt, bis der Warmaster sie aufdeckt. Bis dahin kannst du sie **Ändern** oder **Zurückziehen**.
- Flotten ohne Befehl erhalten automatisch Logistical Auxilia.
- In Schritt 4 legst du die Züge deiner Flotten fest (**Bewegung festlegen (verdeckt)**); in Schritt 5 wählt dein Allianzanführer **Bauen** oder **Verzichten**.
- Manche Events fragen nach deiner Eingabe (etwa ein Planet oder ein Bauplatz). Sie erscheinen unter **Aufgaben**; **Eingabe senden (verdeckt)** gibt sie an den Warmaster.

### Schlachten, Termine und Ergebnisse

- **Schlachten** zeigt **Anstehende Schlachten** mit Gegnern und Termin sowie deine gespielten Schlachten.
- Verteidiger werden in der Allianz bestimmt: **Ich übernehme die Verteidigung** / **Ich übernehme den Angriff** übernimmt eine Schlacht, **Verteidigung abgeben** / **Angriff abgeben** gibt sie zurück.
- Mit **Termine vorschlagen** bietest du einen oder mehrere Termine an (**+ Termin**, **Vorschlagen**). Die Gegenseite nimmt einen mit der Taste **… annehmen** an, die das Datum zeigt. Die App warnt vor Überschneidungen mit deinen anderen Schlachten.
- Nach dem Spiel: **Ergebnis melden** mit den VP beider Seiten, Battle Ready, Spieldatum, Größe, Mission, bei Bedarf Theatre- und Twist-Wurf, optional Bericht und Fotos. Für mehrere Einzelspiele gibt es **Mehrere Einzelspiele melden**. **Ergebnis zur Bestätigung senden** schickt es an die Gegenseite.
- Hast du gewonnen, kannst du deine Outcome-Entscheidungen gleich mitschicken oder später treffen, bis der Warmaster die Schlacht verarbeitet.
- Meldet die Gegenseite, siehst du das Ergebnis unter **Schlachten**: **Bestätigen** übernimmt es, **Widersprechen** mit Begründung gibt es an den Warmaster. Unbestätigte Ergebnisse gehen nach 48 h an den Warmaster.
- Der QR-Code auf einem gedruckten Ergebnisbogen öffnet direkt das Meldeformular, wenn du deinen persönlichen Link auf diesem Gerät schon einmal geöffnet hast.
- Sind freie Gefechte eingeschaltet, meldest du Spiele außerhalb der Befehle unter **Freie Gefechte**; sie zählen, sobald der Gegner bestätigt.

### Allianz

- **Allianz** zeigt die Befehle deiner Allianz in der laufenden Phase und die **Allianz-Notizen**, ein Brett, das nur deine Allianz sieht (**Neue Notiz**, **Posten**).

### Profil

- Ändere **Nickname**, **Armee**, **Unterfraktion** und **Avatar**, dann **Speichern**. Ein Armeewechsel gilt ab der nächsten Phase.
- **Sprache** legt die Sprache deiner Spielerseite und deiner Benachrichtigungen fest.
- **Kommandant**: Name, Titel und Porträt deines Kommandanten. Ehrungen und Narben vergibt der Warmaster; einige Ehrungen verleiht die Kampagne automatisch.
- Je nach Kampagne findest du außerdem **Abwesenheit** (Phasen melden, in denen du nicht spielen kannst), geheime oder persönliche Ziele, Rivalitäten, die **Bemal-Chronik** und die Crusade-Order-of-Battle.
- **Bilanz** zeigt deine Schlachten, Siege, Unentschieden, Niederlagen und Medaillen.

### Benachrichtigungen für Spieler

- Unter **Profil → Benachrichtigungen** hakst du die gewünschten Kategorien an: neue Phase und aufgedeckte Operationen; Ergebnisse, Events, Kampagnenende; Erinnerungen an Deadlines (48 h / 12 h); Persönliches (Angriffe, Bestätigungen, Terminvorschläge).
- E-Mails brauchen eine E-Mail-Adresse, die der Warmaster einträgt. Jede E-Mail enthält einen Abbestell-Link.
- **Push-Benachrichtigungen**: je Gerät **Einschalten**. Eine Probenachricht zeigt, dass es klappt. Auf dem iPhone die Seite vorher zum Home-Bildschirm hinzufügen. Blockiert der Browser, erlaube Benachrichtigungen in den Website-Einstellungen.
- **Discord verknüpfen**: Hat der Warmaster den Discord-Bot eingerichtet, bekommst du einen Einmal-Code für Discord. Danach nutzt du Befehle wie `/lage`, `/aufgaben`, `/annehmen` und `/bestätigen`.
- **Kalender**: Das Profil zeigt einen Abo-Link mit deinen Schlachtterminen. Füge ihn in deiner Kalender-App als Abonnement hinzu.

## Zuschauer und Präsentationsmodus

### Leseansicht

- Der Warmaster kann einen öffentlichen Link (`/v/…`) teilen. Wer ihn hat, kann die Kampagne lesen; die Leseansicht ist für Suchmaschinen gesperrt und zeigt keine Kontaktdaten und keine verdeckten Befehle.
- Bereiche: **Lage** (Karte, Punkte, Schlachten-Feed, Fristen), **Statistik**, **Zeitraffer**, **Codex** (die druckbare Chronik der Kampagne), **Galerie**, **Regeln** und **FAQ**. Ein Klick auf einen Planeten öffnet seine Akte, ein Klick auf einen Spieler in der Rangliste sein Profil.
- Die Sprachwahl in der Kopfzeile ändert die Sprache; der Themenschalter bietet ein helles Archiv-Thema für Tageslicht.
- Der Warmaster kann den öffentlichen Link jederzeit deaktivieren oder neu erzeugen.
- Die **Hall of Fame** ist ein eigener öffentlicher Link (unter **Konto → Administration**) mit allen beendeten Kampagnen, Siegern und Medaillen.

### Präsentationsmodus

- Für Clubabende am Fernseher oder Beamer: **Einstellungen → Export → Präsentation**, oder `/present` an den öffentlichen Link anhängen.
- Die Präsentation wechselt alle 30 Sekunden zwischen Karte, Rangliste, Chronik und Zeitraffer. Mit `?t=60` am Ende änderst du den Takt (10 bis 120 Sekunden).
- Tasten: **Leertaste** hält an oder setzt fort, **←** und **→** blättern. **Ton an** startet einen optionalen Klangteppich aus dem Browser.
- Nutze den Vollbildmodus des Browsers (meist F11).

## Probleme und häufige Fragen

### Ein Spieler hat seinen Link verloren

Öffne den Spieler unter **Allianzen & Spieler → Spieler → Bearbeiten** und kopiere den bestehenden Link, oder **Neu erzeugen**, falls andere ihn gesehen haben könnten (der alte Link wird sofort ungültig). Drucke bei Bedarf eine neue QR-Karte.

### Ein Spielerlink ist in falsche Hände geraten

Den Link sofort **Neu erzeugen** oder **Sperren**. Alles, was über den alten Link geschah, steht mit dem Spielernamen im Log.

### Ein Ergebnis wurde falsch eingetragen

- Noch nicht verarbeitet: die Schlacht unter **Schlachten** öffnen, Werte korrigieren und **Schlacht speichern**, oder das gemeldete Ergebnis **Verwerfen** und neu melden lassen.
- Schon verarbeitet (Schritt **Ergebnisse verarbeiten** erledigt): mit **Rückgängig** bis vor die Verarbeitung zurück, Schlacht korrigieren, neu verarbeiten. Sind seitdem weitere Schritte passiert, ist oft ein Override mit Begründung einfacher (etwa beim Power Level in der Planetenakte).

### Ein Spieler hat die Kampagne verlassen

Nutze **Abwesenheit & Wechsel → Flotte übergeben**: Flotten, offene Schlachten und Anführerrolle gehen an einen Allianzkollegen oder einen neuen Spieler, der alte Link wird gesperrt. Die Historie des Spielers bleibt erhalten.

### Eine Schlacht kann nicht rechtzeitig gespielt werden

**Ungespielt werten…** in der Schlachtenliste: Angreifer siegt (Regel), Verteidiger siegt, verfällt oder in die nächste Phase verschieben. Mit der Hausregel „Auswürfeln statt verfallen“ entscheidet stattdessen ein W6-Duell.

### Würfel

- Lieber echte Würfel? Stelle den Würfelmodus auf **von Hand**; die App fragt dann jeden Wurf ab.
- Ein Wurf ist schiefgegangen? Die Aktion **Rückgängig** machen und neu ausführen. Alle Würfe bleiben im **Würfelprotokoll**.
- Spieler würfeln keine Kampagnenwürfe; Theatre- oder Twist-Würfe tragen sie im Meldeformular ein, wenn eine Regel das verlangt.

### Sprache

- Verwaltung: Sprachwahl in der Kopfzeile oder **Konto → Persönlich → Sprache**.
- Spieler und Zuschauer: Sprachwahl in der Kopfzeile; Spieler können sie auch im **Profil** festlegen.
- Die Standardsprache der Kampagne für Leseansicht und Spielerseiten stellst du unter **Einstellungen → Kampagne** ein.
- Die Oberfläche gibt es auf Deutsch, Englisch, Französisch, Spanisch und Polnisch. Regel-FAQ und diese Hilfe gibt es nur auf Deutsch und Englisch; andere Sprachen zeigen die englische Fassung. Spielbegriffe aus dem Buch bleiben in jeder Sprache englisch.

### Setup-Token oder Passwort verloren

Der Setup-Token steht bei jedem Start im Server-Log, solange es kein Konto gibt. Einen Passwort-Reset in der Oberfläche gibt es nicht: Ein anderer Admin kann dich neu einladen; sonst folgt der Betreiber dem Abschnitt „Passwort vergessen“ der Betriebsanleitung.

### Benachrichtigungen kommen nicht an

- Prüfe **Konto → Dienste**: **Öffentliche Adresse** und **E-Mail-Versand (SMTP)** müssen gesetzt sein; teste mit **E-Mail testen**.
- Sieh ins **Versandprotokoll** unter **Einstellungen → Dienste** und nutze **Fehlgeschlagene erneut senden**.
- Discord: **Discord testen**; vielleicht wurde der Webhook in Discord gelöscht.
- Push: Der Spieler muss ihn auf jedem Gerät einschalten; blockierte Benachrichtigungen im Browser erlauben.
- Spieler können einzelne Kategorien im Profil abbestellt haben.

### Der QR-Code auf dem Ergebnisbogen funktioniert nicht

Der Code enthält absichtlich keinen persönlichen Link. Öffne deinen persönlichen Link einmal auf diesem Handy und scanne dann erneut.

### Die App zeigt „Offline“

Du siehst den zuletzt geladenen Stand. Eingaben gehen erst wieder mit Verbindung; lade die Seite neu, sobald du online bist.
