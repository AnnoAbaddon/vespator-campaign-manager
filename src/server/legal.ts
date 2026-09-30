import 'server-only';
import { db, getSetting, setSetting } from './db';
import { privacySettings } from './privacy';
import type { Locale } from '@/i18n/core';

/**
 * Datenschutzhinweis (Art. 13 DSGVO) und Impressum (§ 5 DDG): vom Admin gepflegte Markdown-Texte, ausgeliefert unter
 * /datenschutz und /impressum. Ohne eigenen Text zeigt /datenschutz eine neutrale Vorlage, die beschreibt, was die App
 * speichert – mit deutlichem Hinweis, dass der Betreiber den Verantwortlichen ergänzen muss. Angaben zur Identität
 * des Betreibers erfindet die App nie.
 */

export type LegalKind = 'privacy' | 'imprint';
const KEYS: Record<LegalKind, string> = { privacy: 'privacyText', imprint: 'imprintText' };
export const MAX_LEGAL_CHARS = 30_000;

export function legalText(kind: LegalKind): string | null {
  const v = getSetting(KEYS[kind]);
  return v?.trim() ? v : null;
}

export function setLegalText(kind: LegalKind, text: string) {
  const v = text.replace(/\r\n?/g, '\n').slice(0, MAX_LEGAL_CHARS);
  if (v.trim()) setSetting(KEYS[kind], v);
  else db().prepare('DELETE FROM settings WHERE key = ?').run(KEYS[kind]);
}

type Retention = { days: number | null };

const retentionText: Record<Locale, (r: Retention) => string> = {
  de: (r) => (r.days ? `automatisch ${r.days} Tage nach Kampagnenende` : 'auf Anweisung der Spielleitung (eine automatische Bereinigung nach Kampagnenende ist derzeit nicht eingestellt)'),
  en: (r) => (r.days ? `automatically ${r.days} days after the campaign ends` : 'when the game master deletes them (automatic clean-up after the campaign ends is currently not configured)'),
  fr: (r) => (r.days ? `automatiquement ${r.days} jours après la fin de la campagne` : 'sur décision du maître de jeu (aucun nettoyage automatique après la fin de la campagne n’est configuré actuellement)'),
  es: (r) => (r.days ? `automáticamente ${r.days} días después del final de la campaña` : 'cuando el director de juego los elimina (la limpieza automática tras el final de la campaña no está configurada actualmente)'),
  pl: (r) => (r.days ? `automatycznie ${r.days} dni po zakończeniu kampanii` : 'na polecenie prowadzącego (automatyczne czyszczenie po zakończeniu kampanii nie jest obecnie ustawione)'),
};

const TEMPLATES: Record<Locale, string> = {
  de: `> **Hinweis an den Betreiber:** Dies ist eine neutrale Vorlage. Der **Verantwortliche** (Name bzw. Verein, Anschrift, E-Mail) ist noch nicht eingetragen. Bitte unter *Konto → Administration → Datenschutz und Impressum* einen eigenen Text hinterlegen.

## Verantwortlicher

*Noch nicht angegeben – der Betreiber dieser Instanz muss hier seine Kontaktdaten eintragen.*

## Welche Daten die App speichert

- **Spielerprofil:** Spitzname, Fraktion, optional E-Mail-Adresse, Discord-Name bzw. Discord-Verknüpfung und Benachrichtigungswünsche, Kampagnenergebnisse und Notizen.
- **Bilder:** hochgeladene Avatare und Schlachtfotos. Sie werden neu kodiert; Metadaten wie GPS-Position werden entfernt.
- **Push-Benachrichtigungen:** die Push-Adresse (Endpunkt) und Schlüssel des Browsers, wenn du Benachrichtigungen einschaltest.
- **Konten der Spielleitung:** Benutzername, Passwort-Hash, Sitzungs-Cookie, Verwaltungsprotokoll mit gekürzter IP-Adresse bei Anmeldungen.
- **Technisch:** ein Sprach-Cookie sowie, im Browser, der persönliche Spielerlink (für den QR-Sprung). Keine Werbe- oder Analyse-Cookies, keine Einbindung fremder Server.

## Zweck und Rechtsgrundlage

Durchführung der Kampagne und Benachrichtigung der Teilnehmenden (Art. 6 Abs. 1 lit. b bzw. f DSGVO); freiwillige Angaben wie E-Mail, Discord und Push auf Grundlage deiner Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), die du jederzeit durch Löschen der Angabe widerrufen kannst.

## Empfänger

- **E-Mail-Anbieter (SMTP)** des Betreibers: Empfängeradresse und Nachrichtentext.
- **Discord:** Nachrichten in den Kanal der Kampagne (Spitznamen, Ergebnisse) und, bei Verknüpfung, deine Discord-Kennung.
- **Push-Dienste der Browserhersteller** (z. B. Google, Mozilla, Apple, Microsoft): verschlüsselte Benachrichtigungen an deine Push-Adresse.
- Der **Hosting-Anbieter** des Servers.

## Speicherdauer

Kontaktdaten werden {retention} gelöscht, auf Wunsch jederzeit sofort. Verschickte Nachrichten bleiben 30 Tage im Versandprotokoll. Sicherungen enthalten Daten noch bis zu ihrer Rotation (tägliche Kampagnen-Backups 14 Tage, Datenbank-Sicherungen 7 Tage).

## Deine Rechte

Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch (Art. 15–21 DSGVO) sowie Beschwerde bei einer Datenschutz-Aufsichtsbehörde. Wende dich dazu an die Spielleitung bzw. den Verantwortlichen.`,
  en: `> **Note to the operator:** This is a neutral template. The **controller** (name or club, address, email) has not been filled in yet. Please add your own text under *Account → Administration → Privacy notice and imprint*.

## Controller

*Not specified yet – the operator of this instance must enter their contact details here.*

## What the app stores

- **Player profile:** nickname, faction, optionally email address, Discord name or Discord link and notification preferences, campaign results and notes.
- **Images:** uploaded avatars and battle photos. They are re-encoded; metadata such as GPS location is removed.
- **Push notifications:** your browser's push address (endpoint) and keys, if you turn notifications on.
- **Game master accounts:** username, password hash, session cookie, admin log with a shortened IP address for logins.
- **Technical:** a language cookie and, in your browser, your personal player link (for the QR jump). No advertising or analytics cookies, no third-party servers embedded.

## Purpose and legal basis

Running the campaign and notifying participants (Art. 6(1)(b) or (f) GDPR); optional details such as email, Discord and push are based on your consent (Art. 6(1)(a) GDPR), which you can withdraw at any time by deleting the detail.

## Recipients

- The operator's **email provider (SMTP)**: recipient address and message text.
- **Discord:** messages to the campaign channel (nicknames, results) and, if linked, your Discord ID.
- **Push services of browser vendors** (e.g. Google, Mozilla, Apple, Microsoft): encrypted notifications to your push address.
- The server's **hosting provider**.

## Retention

Contact details are deleted {retention}, or immediately on request. Sent messages stay in the delivery log for 30 days. Backups still contain data until they rotate out (daily campaign backups 14 days, database backups 7 days).

## Your rights

Access, rectification, erasure, restriction, data portability and objection (Art. 15–21 GDPR), and the right to lodge a complaint with a data protection authority. Contact the game master or the controller.`,
  fr: `> **Note pour l’exploitant :** ceci est un modèle neutre. Le **responsable du traitement** (nom ou association, adresse, e-mail) n’est pas encore renseigné. Veuillez saisir votre propre texte sous *Compte → Administration → Confidentialité et mentions légales*.

## Responsable du traitement

*Pas encore indiqué – l’exploitant de cette instance doit saisir ici ses coordonnées.*

## Données enregistrées par l’application

- **Profil de joueur :** pseudo, faction, éventuellement adresse e-mail, nom ou liaison Discord et préférences de notification, résultats de campagne et notes.
- **Images :** avatars et photos de bataille téléversés. Ils sont réencodés ; les métadonnées comme la position GPS sont supprimées.
- **Notifications push :** l’adresse push (endpoint) et les clés de ton navigateur, si tu actives les notifications.
- **Comptes du maître de jeu :** nom d’utilisateur, hachage du mot de passe, cookie de session, journal d’administration avec adresse IP raccourcie lors des connexions.
- **Technique :** un cookie de langue et, dans le navigateur, ton lien de joueur personnel (pour le saut QR). Aucun cookie publicitaire ou d’analyse, aucun serveur tiers intégré.

## Finalité et base juridique

Déroulement de la campagne et notification des participants (art. 6, par. 1, point b ou f du RGPD) ; les informations facultatives comme l’e-mail, Discord et le push reposent sur ton consentement (art. 6, par. 1, point a du RGPD), que tu peux retirer à tout moment en supprimant l’information.

## Destinataires

- Le **fournisseur e-mail (SMTP)** de l’exploitant : adresse du destinataire et texte du message.
- **Discord :** messages dans le salon de la campagne (pseudos, résultats) et, en cas de liaison, ton identifiant Discord.
- **Services push des éditeurs de navigateurs** (p. ex. Google, Mozilla, Apple, Microsoft) : notifications chiffrées vers ton adresse push.
- L’**hébergeur** du serveur.

## Durée de conservation

Les coordonnées sont supprimées {retention}, ou immédiatement sur demande. Les messages envoyés restent 30 jours dans le journal d’envoi. Les sauvegardes contiennent encore les données jusqu’à leur rotation (sauvegardes quotidiennes des campagnes 14 jours, sauvegardes de la base 7 jours).

## Tes droits

Accès, rectification, effacement, limitation, portabilité et opposition (art. 15 à 21 du RGPD), ainsi que réclamation auprès d’une autorité de protection des données. Adresse-toi au maître de jeu ou au responsable du traitement.`,
  es: `> **Nota para el operador:** esta es una plantilla neutral. El **responsable del tratamiento** (nombre o asociación, dirección, correo) aún no está indicado. Añade tu propio texto en *Cuenta → Administración → Privacidad y aviso legal*.

## Responsable del tratamiento

*Aún no indicado: el operador de esta instancia debe introducir aquí sus datos de contacto.*

## Qué datos guarda la aplicación

- **Perfil de jugador:** apodo, facción, opcionalmente dirección de correo, nombre o vínculo de Discord y preferencias de notificación, resultados de campaña y notas.
- **Imágenes:** avatares y fotos de batalla subidos. Se recodifican; se eliminan metadatos como la ubicación GPS.
- **Notificaciones push:** la dirección push (endpoint) y las claves de tu navegador, si activas las notificaciones.
- **Cuentas del director de juego:** nombre de usuario, hash de la contraseña, cookie de sesión, registro de administración con dirección IP abreviada en los inicios de sesión.
- **Técnico:** una cookie de idioma y, en el navegador, tu enlace personal de jugador (para el salto QR). Sin cookies de publicidad ni de análisis, sin servidores de terceros integrados.

## Finalidad y base jurídica

Desarrollo de la campaña y notificación a los participantes (art. 6.1.b o f del RGPD); los datos opcionales como correo, Discord y push se basan en tu consentimiento (art. 6.1.a del RGPD), que puedes retirar en cualquier momento borrando el dato.

## Destinatarios

- El **proveedor de correo (SMTP)** del operador: dirección del destinatario y texto del mensaje.
- **Discord:** mensajes en el canal de la campaña (apodos, resultados) y, si lo vinculas, tu identificador de Discord.
- **Servicios push de los fabricantes de navegadores** (p. ej. Google, Mozilla, Apple, Microsoft): notificaciones cifradas a tu dirección push.
- El **proveedor de alojamiento** del servidor.

## Plazo de conservación

Los datos de contacto se eliminan {retention}, o de inmediato si lo solicitas. Los mensajes enviados permanecen 30 días en el registro de envíos. Las copias de seguridad contienen los datos hasta su rotación (copias diarias de campaña 14 días, copias de la base de datos 7 días).

## Tus derechos

Acceso, rectificación, supresión, limitación, portabilidad y oposición (arts. 15–21 del RGPD), así como reclamar ante una autoridad de protección de datos. Dirígete al director de juego o al responsable del tratamiento.`,
  pl: `> **Uwaga dla operatora:** to neutralny szablon. **Administrator danych** (imię i nazwisko lub klub, adres, e-mail) nie został jeszcze podany. Wprowadź własny tekst w *Konto → Administracja → Prywatność i nota prawna*.

## Administrator danych

*Jeszcze nie podano – operator tej instancji musi wpisać tutaj swoje dane kontaktowe.*

## Jakie dane zapisuje aplikacja

- **Profil gracza:** pseudonim, frakcja, opcjonalnie adres e-mail, nazwa lub powiązanie Discord i ustawienia powiadomień, wyniki kampanii i notatki.
- **Obrazy:** przesłane awatary i zdjęcia z bitew. Są ponownie kodowane; metadane, takie jak położenie GPS, są usuwane.
- **Powiadomienia push:** adres push (endpoint) i klucze przeglądarki, jeśli włączysz powiadomienia.
- **Konta prowadzącego:** nazwa użytkownika, skrót hasła, ciasteczko sesji, dziennik administracyjny ze skróconym adresem IP przy logowaniu.
- **Technicznie:** ciasteczko języka oraz, w przeglądarce, twój osobisty link gracza (do skoku z kodu QR). Bez ciasteczek reklamowych i analitycznych, bez osadzonych serwerów zewnętrznych.

## Cel i podstawa prawna

Prowadzenie kampanii i powiadamianie uczestników (art. 6 ust. 1 lit. b lub f RODO); dane dobrowolne, takie jak e-mail, Discord i push, na podstawie twojej zgody (art. 6 ust. 1 lit. a RODO), którą możesz w każdej chwili wycofać, usuwając te dane.

## Odbiorcy

- **Dostawca poczty (SMTP)** operatora: adres odbiorcy i treść wiadomości.
- **Discord:** wiadomości na kanale kampanii (pseudonimy, wyniki) oraz, po powiązaniu, twój identyfikator Discord.
- **Usługi push producentów przeglądarek** (np. Google, Mozilla, Apple, Microsoft): zaszyfrowane powiadomienia na twój adres push.
- **Dostawca hostingu** serwera.

## Okres przechowywania

Dane kontaktowe są usuwane {retention} lub natychmiast na życzenie. Wysłane wiadomości pozostają 30 dni w dzienniku wysyłki. Kopie zapasowe zawierają dane do czasu ich rotacji (codzienne kopie kampanii 14 dni, kopie bazy danych 7 dni).

## Twoje prawa

Dostęp, sprostowanie, usunięcie, ograniczenie, przenoszenie danych i sprzeciw (art. 15–21 RODO) oraz skarga do organu nadzorczego ds. ochrony danych. Zwróć się do prowadzącego lub administratora danych.`,
};

/** Neutrale Vorlage des Datenschutzhinweises in der Sprache des Lesers (mit aktueller Aufbewahrungseinstellung) */
export function defaultPrivacyText(locale: Locale, retention: Retention = { days: privacySettings().days }): string {
  return TEMPLATES[locale].replace('{retention}', retentionText[locale](retention));
}
