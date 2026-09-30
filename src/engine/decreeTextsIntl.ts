/**
 * Textbausteine des Dekret-Baukastens (NTH2 4.1) auf Französisch, Spanisch und Polnisch: von Hand geschriebene
 * Lückentexte, Variante für Variante zu den deutschen Vorlagen (gleiche Anzahl, gleiche Platzhalter je Variante).
 * Spielbegriffe (Power Level, VP, Warmaster) bleiben englisch.
 */
import type { DecreeHeadings, DecreeTone, DecreeWords, Texts } from './decreeTexts';

// ─── Französisch ───────────────────────────────────────────────────────────

const FR_PROCLAMATION: Texts = {
  TITLE: ['Proclamation sur la phase {phase} de la campagne', 'Proclamation impériale : {campaign}, phase {phase}', 'Qu’on se le dise : la phase {phase} est achevée'],
  INTRO: [
    'Au nom du Warmaster et avec la bénédiction du Trône d’Or, il est annoncé à toutes les forces de {campaign} ce qui advint durant la phase {phase} sur {phaseCount}.',
    'Écoutez, serviteurs de l’Imperium ! La phase {phase} de la campagne {campaign} est terminée, et ses hauts faits sont inscrits dans les annales.',
    'Le Warmaster proclame l’issue de la phase {phase}. Que chaque commandant y apprenne ce que peuvent le devoir et le sacrifice.',
  ],
  BATTLE_WIN: [
    'Sur {planet}, {winner} a brisé la résistance de {loser} ({vp}).',
    'Les guerriers de {winner} ont remporté la victoire sur {loser} à {planet} ({vp}).',
    '{planet} a vu triompher {winner} ; {loser} a dû céder ({vp}).',
    'Par la main de {winnerPlayers}, {winner} l’a emporté sur {loser} à {planet} ({vp}).',
  ],
  BATTLE_DRAW: ['Sur {planet}, {attacker} et {defender} ont lutté jusqu’à l’épuisement sans que l’un ne l’emporte ({vp}).', 'La bataille de {planet} entre {attacker} et {defender} est restée indécise ({vp}).'],
  BATTLE_UNPLAYED: ['Aucun combat n’eut lieu sur {planet} ; la victoire fut accordée à {winner}.', 'Sans combat, {planet} fut attribuée à {winner}.'],
  PL_GAIN: ['{alliance} resserre son emprise sur {planet} (Power Level {from} → {to}).', 'La puissance de {alliance} sur {planet} grandit (Power Level {from} → {to}).'],
  PL_LOSS: ['{alliance} perd du terrain sur {planet} (Power Level {from} → {to}).', 'L’influence de {alliance} sur {planet} décline (Power Level {from} → {to}).'],
  EVENT: ['Un présage ébranle le front : {event}.', 'Les chroniques consignent {event}, touchant {alliance}.', 'Le destin a tourné : {event} a frappé {alliance}.'],
  OBJECTIVE_MET: ['L’objectif spécial « {objective} » a été rempli par {alliances}.', '{alliances} a accompli ce qu’exigeait le Warmaster : « {objective} ».'],
  OBJECTIVE_FAILED: ['L’objectif spécial « {objective} » n’a pas été rempli.', 'Nul n’a pu accomplir « {objective} ».'],
  HONOR: ['{player} reçoit la distinction « {honor} ».', 'Pour sa bravoure face à l’ennemi, {player} reçoit la distinction « {honor} ».'],
  MEDAL: ['{medal} est décernée à {alliance}.', 'La distinction {medal} revient à {alliance}.'],
  POINTS: ['Points de campagne : {standings}.', 'La balance de la guerre indique : {standings}.'],
  STANDINGS_FOG: ['État du front : {standings}.', 'Par la volonté du Warmaster, le score exact reste caché ; il en ressort : {standings}.'],
  LEADER: ['{leader} mène le front.', 'En tête se tient {leader}.'],
  QUIET: ['Durant cette phase, les armes se sont tues.', 'Aucune bataille n’a été livrée durant cette phase.'],
  OUTRO: ['Le devoir avant la gloire.', 'Ave Imperator. Que la prochaine phase apporte une gloire plus grande encore.', 'Ainsi proclamé, ainsi consigné. Le devoir avant la gloire.'],
};

const FR_COMMISSAR: Texts = {
  TITLE: ['Rapport du front phase {phase}', 'Commissariat : rapport de situation phase {phase}', 'Rapport du front {campaign} – phase {phase}'],
  INTRO: [
    'Rapport de situation pour la phase {phase} sur {phaseCount}. Bref et sans fioritures.',
    'À toutes les unités : rapport sur la phase {phase}. Lire, comprendre, agir.',
    'Le Commissariat informe : phase {phase} terminée. Résultats ci-dessous.',
  ],
  BATTLE_WIN: ['{planet} : {winner} bat {loser} ({vp}).', '{planet} – victoire pour {winner}, {loser} vaincu ({vp}).', '{planet} : {winnerPlayers} ({winner}) ont tenu face à {loser} ({vp}).'],
  BATTLE_DRAW: ['{planet} : impasse entre {attacker} et {defender} ({vp}).', '{planet} – aucune décision, {attacker} contre {defender} ({vp}).'],
  BATTLE_UNPLAYED: ['{planet} : pas de combat. Attribué à {winner}.', '{planet} – attribué à {winner} sans combat. Inexcusable.'],
  PL_GAIN: ['{planet} : {alliance} avance (PL {from} → {to}).', '{alliance} gagne du terrain sur {planet} (PL {from} → {to}).'],
  PL_LOSS: ['{planet} : {alliance} recule (PL {from} → {to}).', '{alliance} perd du terrain sur {planet} (PL {from} → {to}). Il y aura des conséquences.'],
  EVENT: ['Événement : {event}.', 'Événement : {event} – concerne {alliance}.'],
  OBJECTIVE_MET: ['Objectif spécial « {objective} » : atteint par {alliances}.', 'Ordre « {objective} » exécuté – {alliances}.'],
  OBJECTIVE_FAILED: ['Objectif spécial « {objective} » : manqué.', 'Ordre « {objective} » non exécuté. Décevant.'],
  HONOR: ['Citation : {player} – « {honor} ».', '{player} décoré : « {honor} ».'],
  MEDAL: ['{medal} : {alliance}.', 'Distinction {medal} pour {alliance}.'],
  POINTS: ['Score : {standings}.', 'Classement : {standings}.'],
  STANDINGS_FOG: ['Situation : {standings}.', 'Chiffres exacts classifiés. Situation : {standings}.'],
  LEADER: ['En tête : {leader}.', '{leader} devant. Les autres : rattrapez.'],
  QUIET: ['Aucun engagement signalé.', 'Aucune bataille. L’inaction a été notée.'],
  OUTRO: ['Continuez.', 'Pour l’Empereur. Qui hésite sera remplacé.', 'Fin du rapport.'],
};

const FR_CHRONICLER: Texts = {
  TITLE: ['Extrait de la chronique : phase {phase}', 'Chronique de la campagne {campaign}, phase {phase}', 'La chronique relate la phase {phase}'],
  INTRO: [
    'Ainsi fut-il consigné aux jours de la phase {phase}, lorsque le front de {campaign} se remit en mouvement.',
    'Le chroniqueur consigne ce qui advint durant la phase {phase}, afin que nul ne l’oublie.',
    'C’était la phase {phase} sur {phaseCount}, et les étoiles au-dessus de {campaign} brûlaient.',
  ],
  BATTLE_WIN: [
    'À {planet}, {winner} et {loser} se mesurèrent ; à la fin, {winner} resta maître du terrain ({vp}).',
    'Sur {planet}, la décision tomba en faveur de {winner}, et {loser} se retira ({vp}).',
    'On raconte que {winnerPlayers} menèrent {winner} à la victoire sur {loser} à {planet} ({vp}).',
  ],
  BATTLE_DRAW: ['À {planet}, {attacker} et {defender} se firent face, mais aucun ne put vaincre l’autre ({vp}).', 'Sur {planet}, le combat entre {attacker} et {defender} s’acheva sans vainqueur ({vp}).'],
  BATTLE_UNPLAYED: ['Nul ne combattit pour {planet} ; la chronique consigne la victoire de {winner}.', 'Les armes restèrent muettes à {planet}, et {winner} l’emporta sans bataille.'],
  PL_GAIN: ['Sur {planet}, la puissance de {alliance} grandit (Power Level {from} → {to}).', '{alliance} gagna de l’influence sur {planet} (Power Level {from} → {to}).'],
  PL_LOSS: ['Sur {planet}, l’étoile de {alliance} pâlit (Power Level {from} → {to}).', '{alliance} perdit de l’influence sur {planet} (Power Level {from} → {to}).'],
  EVENT: ['En ces jours survint {event}.', 'La chronique consigne {event}, qui toucha {alliance}.'],
  OBJECTIVE_MET: ['L’objectif « {objective} » fut accompli par {alliances}.', '{alliances} accomplit l’objectif « {objective} ».'],
  OBJECTIVE_FAILED: ['L’objectif « {objective} » resta hors d’atteinte.', 'Nul n’accomplit « {objective} ».'],
  HONOR: ['En ce temps, {player} obtint la distinction « {honor} ».', 'Le nom de {player} fut honoré par « {honor} ».'],
  MEDAL: ['{alliance} reçut {medal}.', 'L’honneur de {medal} échut à {alliance}.'],
  POINTS: ['À la fin de la phase, le décompte était : {standings}.', 'Le décompte donna : {standings}.'],
  STANDINGS_FOG: ['Peu savaient où en était vraiment le front : {standings}.', 'La situation à la fin de la phase : {standings}.'],
  LEADER: ['{leader} était en tête.', 'Devant se trouvait {leader}.'],
  QUIET: ['Ce fut une phase calme ; aucune bataille ne fut consignée.', 'La chronique reste muette sur les batailles de cette phase.'],
  OUTRO: ['Ici s’achève l’entrée du chroniqueur.', 'La suite est contée à la page suivante de la chronique.', 'Ainsi s’acheva la phase, et le front attendit.'],
};

// ─── Spanisch ──────────────────────────────────────────────────────────────

const ES_PROCLAMATION: Texts = {
  TITLE: ['Proclama sobre la fase {phase} de la campaña', 'Proclama imperial: {campaign}, fase {phase}', 'Sépase: la fase {phase} ha concluido'],
  INTRO: [
    'En nombre del Warmaster y con la bendición del Trono Dorado, se anuncia a todas las fuerzas de {campaign} lo acontecido en la fase {phase} de {phaseCount}.',
    '¡Escuchad, siervos del Imperium! La fase {phase} de la campaña {campaign} ha terminado, y sus hazañas quedan inscritas en los anales.',
    'El Warmaster proclama el desenlace de la fase {phase}. Que cada comandante aprenda de ella lo que pueden el deber y el sacrificio.',
  ],
  BATTLE_WIN: [
    'En {planet}, {winner} quebró la resistencia de {loser} ({vp}).',
    'Los guerreros de {winner} lograron la victoria sobre {loser} en {planet} ({vp}).',
    '{planet} vio triunfar a {winner}; {loser} tuvo que ceder ({vp}).',
    'Por la mano de {winnerPlayers}, {winner} se impuso a {loser} en {planet} ({vp}).',
  ],
  BATTLE_DRAW: ['En {planet}, {attacker} y {defender} lucharon hasta el agotamiento sin que ninguno prevaleciera ({vp}).', 'La batalla por {planet} entre {attacker} y {defender} quedó indecisa ({vp}).'],
  BATTLE_UNPLAYED: ['No hubo combate en {planet}; la victoria se concedió a {winner}.', 'Sin lucha, {planet} se decidió a favor de {winner}.'],
  PL_GAIN: ['{alliance} afianza su dominio sobre {planet} (Power Level {from} → {to}).', 'El poder de {alliance} en {planet} crece (Power Level {from} → {to}).'],
  PL_LOSS: ['{alliance} pierde terreno en {planet} (Power Level {from} → {to}).', 'La influencia de {alliance} en {planet} mengua (Power Level {from} → {to}).'],
  EVENT: ['Un presagio sacude el frente: {event}.', 'Las crónicas registran {event}, que afecta a {alliance}.', 'El destino giró: {event} golpeó a {alliance}.'],
  OBJECTIVE_MET: ['El objetivo especial «{objective}» fue cumplido por {alliances}.', '{alliances} logró lo que exigía el Warmaster: «{objective}».'],
  OBJECTIVE_FAILED: ['El objetivo especial «{objective}» quedó sin cumplir.', 'Nadie pudo lograr «{objective}».'],
  HONOR: ['{player} recibe el honor «{honor}».', 'Por su valor ante el enemigo, {player} recibe el honor «{honor}».'],
  MEDAL: ['{medal} se concede a {alliance}.', 'La distinción {medal} corresponde a {alliance}.'],
  POINTS: ['Puntos de campaña: {standings}.', 'La balanza de la guerra muestra: {standings}.'],
  STANDINGS_FOG: ['El estado del frente: {standings}.', 'Por voluntad del Warmaster, el marcador exacto permanece oculto; queda así: {standings}.'],
  LEADER: ['{leader} lidera el frente.', 'A la cabeza está {leader}.'],
  QUIET: ['En esta fase callaron las armas.', 'No se libró ninguna batalla en esta fase.'],
  OUTRO: ['El deber antes que la gloria.', 'Ave Imperator. Que la próxima fase traiga una gloria aún mayor.', 'Así se proclama, así se registra. El deber antes que la gloria.'],
};

const ES_COMMISSAR: Texts = {
  TITLE: ['Parte del frente fase {phase}', 'Comisariado: informe de situación fase {phase}', 'Parte del frente {campaign} – fase {phase}'],
  INTRO: [
    'Informe de situación de la fase {phase} de {phaseCount}. Breve y sin adornos.',
    'A todas las unidades: informe de la fase {phase}. Leer, entender, actuar.',
    'El Comisariado informa: fase {phase} concluida. Siguen los resultados.',
  ],
  BATTLE_WIN: ['{planet}: {winner} vence a {loser} ({vp}).', '{planet} – victoria para {winner}, {loser} derrotado ({vp}).', '{planet}: {winnerPlayers} ({winner}) resistieron ante {loser} ({vp}).'],
  BATTLE_DRAW: ['{planet}: tablas entre {attacker} y {defender} ({vp}).', '{planet} – sin decisión, {attacker} contra {defender} ({vp}).'],
  BATTLE_UNPLAYED: ['{planet}: sin combate. Adjudicado a {winner}.', '{planet} – para {winner} sin lucha. Inexcusable.'],
  PL_GAIN: ['{planet}: {alliance} avanza (PL {from} → {to}).', '{alliance} gana terreno en {planet} (PL {from} → {to}).'],
  PL_LOSS: ['{planet}: {alliance} retrocede (PL {from} → {to}).', '{alliance} pierde terreno en {planet} (PL {from} → {to}). Habrá consecuencias.'],
  EVENT: ['Evento: {event}.', 'Evento: {event} – afecta a {alliance}.'],
  OBJECTIVE_MET: ['Objetivo especial «{objective}»: logrado por {alliances}.', 'Orden «{objective}» ejecutada – {alliances}.'],
  OBJECTIVE_FAILED: ['Objetivo especial «{objective}»: fallido.', 'Orden «{objective}» no ejecutada. Decepcionante.'],
  HONOR: ['Mención: {player} – «{honor}».', '{player} condecorado: «{honor}».'],
  MEDAL: ['{medal}: {alliance}.', 'Distinción {medal} para {alliance}.'],
  POINTS: ['Puntuación: {standings}.', 'Clasificación: {standings}.'],
  STANDINGS_FOG: ['Situación: {standings}.', 'Cifras exactas clasificadas. Situación: {standings}.'],
  LEADER: ['En cabeza: {leader}.', '{leader} delante. Los demás: acortad distancias.'],
  QUIET: ['Sin combates que informar.', 'Ninguna batalla. Se ha tomado nota de la inactividad.'],
  OUTRO: ['Continúen.', 'Por el Emperador. Quien dude será reemplazado.', 'Fin del informe.'],
};

const ES_CHRONICLER: Texts = {
  TITLE: ['De la crónica: fase {phase}', 'Crónica de la campaña {campaign}, fase {phase}', 'La crónica registra la fase {phase}'],
  INTRO: [
    'Así quedó escrito en los días de la fase {phase}, cuando el frente de {campaign} volvió a ponerse en marcha.',
    'El cronista deja constancia de lo ocurrido en la fase {phase}, para que no caiga en el olvido.',
    'Era la fase {phase} de {phaseCount}, y las estrellas sobre {campaign} ardían.',
  ],
  BATTLE_WIN: [
    'En {planet}, {winner} y {loser} midieron sus fuerzas; al final {winner} dominó el campo ({vp}).',
    'En {planet} la decisión cayó a favor de {winner}, y {loser} se retiró ({vp}).',
    'Se cuenta que {winnerPlayers} llevaron a {winner} a la victoria sobre {loser} en {planet} ({vp}).',
  ],
  BATTLE_DRAW: ['En {planet}, {attacker} y {defender} se enfrentaron, pero ninguno pudo vencer al otro ({vp}).', 'En {planet} la lucha entre {attacker} y {defender} terminó sin vencedor ({vp}).'],
  BATTLE_UNPLAYED: ['Nadie luchó por {planet}; la crónica registra la victoria de {winner}.', 'Las armas callaron en {planet}, y {winner} ganó sin batalla.'],
  PL_GAIN: ['En {planet} creció el poder de {alliance} (Power Level {from} → {to}).', '{alliance} ganó influencia en {planet} (Power Level {from} → {to}).'],
  PL_LOSS: ['En {planet} se apagó la estrella de {alliance} (Power Level {from} → {to}).', '{alliance} perdió influencia en {planet} (Power Level {from} → {to}).'],
  EVENT: ['En aquellos días sucedió {event}.', 'La crónica registra {event}, que afectó a {alliance}.'],
  OBJECTIVE_MET: ['El objetivo «{objective}» fue cumplido por {alliances}.', '{alliances} cumplió el objetivo «{objective}».'],
  OBJECTIVE_FAILED: ['El objetivo «{objective}» quedó fuera de alcance.', 'Nadie cumplió «{objective}».'],
  HONOR: ['En este tiempo {player} obtuvo el honor «{honor}».', 'El nombre de {player} fue honrado con «{honor}».'],
  MEDAL: ['{alliance} recibió {medal}.', 'El honor de {medal} recayó en {alliance}.'],
  POINTS: ['Al final de la fase, el recuento era: {standings}.', 'El recuento dio: {standings}.'],
  STANDINGS_FOG: ['Pocos sabían cómo estaba de verdad el frente: {standings}.', 'La situación al final de la fase: {standings}.'],
  LEADER: ['{leader} iba en cabeza.', 'Por delante estaba {leader}.'],
  QUIET: ['Fue una fase tranquila; no se registró ninguna batalla.', 'La crónica guarda silencio sobre batallas en esta fase.'],
  OUTRO: ['Aquí termina la entrada del cronista.', 'Lo que siguió se cuenta en la próxima página de la crónica.', 'Así terminó la fase, y el frente aguardó.'],
};

// ─── Polnisch ──────────────────────────────────────────────────────────────

const PL_PROCLAMATION: Texts = {
  TITLE: ['Proklamacja o fazie {phase} kampanii', 'Proklamacja imperialna: {campaign}, faza {phase}', 'Wiadomo czyni się: faza {phase} dobiegła końca'],
  INTRO: [
    'W imieniu Warmastera i z błogosławieństwem Złotego Tronu ogłasza się wszystkim siłom {campaign}, co wydarzyło się w fazie {phase} z {phaseCount}.',
    'Słuchajcie, słudzy Imperium! Faza {phase} kampanii {campaign} dobiegła końca, a jej czyny zostają wpisane do annałów.',
    'Warmaster ogłasza wynik fazy {phase}. Niech każdy dowódca wyniesie z niej naukę, co potrafią obowiązek i poświęcenie.',
  ],
  BATTLE_WIN: [
    'Na {planet} {winner} złamali opór {loser} ({vp}).',
    'Wojownicy {winner} odnieśli na {planet} zwycięstwo nad {loser} ({vp}).',
    '{planet} widziała triumf {winner}; {loser} musieli ustąpić ({vp}).',
    'Ręką {winnerPlayers} {winner} zwyciężyli na {planet} nad {loser} ({vp}).',
  ],
  BATTLE_DRAW: ['Na {planet} {attacker} i {defender} walczyli do wyczerpania, lecz nikt nie przeważył ({vp}).', 'Bitwa o {planet} między {attacker} a {defender} pozostała nierozstrzygnięta ({vp}).'],
  BATTLE_UNPLAYED: ['Na {planet} nie doszło do walki; zwycięstwo przyznano {winner}.', 'Bez walki losy {planet} rozstrzygnęły się na korzyść {winner}.'],
  PL_GAIN: ['{alliance} umacnia swój chwyt na {planet} (Power Level {from} → {to}).', 'Potęga {alliance} na {planet} rośnie (Power Level {from} → {to}).'],
  PL_LOSS: ['{alliance} traci grunt na {planet} (Power Level {from} → {to}).', 'Wpływy {alliance} na {planet} słabną (Power Level {from} → {to}).'],
  EVENT: ['Znak wstrząsa frontem: {event}.', 'Kroniki odnotowują {event}, dotyczące {alliance}.', 'Los się odwrócił: {event} dotknęło {alliance}.'],
  OBJECTIVE_MET: ['Cel specjalny „{objective}” wypełnili {alliances}.', '{alliances} dokonali tego, czego żądał Warmaster: „{objective}”.'],
  OBJECTIVE_FAILED: ['Cel specjalny „{objective}” pozostał niewypełniony.', 'Nikt nie zdołał wypełnić „{objective}”.'],
  HONOR: ['{player} otrzymuje wyróżnienie „{honor}”.', 'Za męstwo w obliczu wroga {player} otrzymuje wyróżnienie „{honor}”.'],
  MEDAL: ['{medal} zostaje przyznany {alliance}.', 'Odznaczenie {medal} przypada {alliance}.'],
  POINTS: ['Stan punktów kampanii: {standings}.', 'Szala wojny wskazuje: {standings}.'],
  STANDINGS_FOG: ['Sytuacja na froncie: {standings}.', 'Z woli Warmastera dokładny stan pozostaje ukryty; obowiązuje: {standings}.'],
  LEADER: ['{leader} prowadzi na froncie.', 'Na czele stoi {leader}.'],
  QUIET: ['W tej fazie broń milczała.', 'W tej fazie nie stoczono żadnej bitwy.'],
  OUTRO: ['Obowiązek ponad chwałę.', 'Ave Imperator. Niech następna faza przyniesie jeszcze większą chwałę.', 'Tak ogłoszono, tak zapisano. Obowiązek ponad chwałę.'],
};

const PL_COMMISSAR: Texts = {
  TITLE: ['Raport z frontu, faza {phase}', 'Komisariat: meldunek sytuacyjny, faza {phase}', 'Raport z frontu {campaign} – faza {phase}'],
  INTRO: [
    'Meldunek sytuacyjny za fazę {phase} z {phaseCount}. Krótko i bez upiększeń.',
    'Do wszystkich jednostek: raport z fazy {phase}. Czytać, zrozumieć, działać.',
    'Komisariat melduje: faza {phase} zakończona. Wyniki poniżej.',
  ],
  BATTLE_WIN: ['{planet}: {winner} pokonuje {loser} ({vp}).', '{planet} – zwycięstwo {winner}, {loser} pobici ({vp}).', '{planet}: {winnerPlayers} ({winner}) utrzymali się przeciw {loser} ({vp}).'],
  BATTLE_DRAW: ['{planet}: pat między {attacker} a {defender} ({vp}).', '{planet} – brak rozstrzygnięcia, {attacker} przeciw {defender} ({vp}).'],
  BATTLE_UNPLAYED: ['{planet}: bez walki. Zaliczone dla {winner}.', '{planet} – dla {winner} bez walki. Niewybaczalne.'],
  PL_GAIN: ['{planet}: {alliance} naciera (PL {from} → {to}).', '{alliance} zyskuje grunt na {planet} (PL {from} → {to}).'],
  PL_LOSS: ['{planet}: {alliance} się cofa (PL {from} → {to}).', '{alliance} traci grunt na {planet} (PL {from} → {to}). Będą konsekwencje.'],
  EVENT: ['Wydarzenie: {event}.', 'Wydarzenie: {event} – dotyczy {alliance}.'],
  OBJECTIVE_MET: ['Cel specjalny „{objective}”: osiągnięty przez {alliances}.', 'Rozkaz „{objective}” wykonany – {alliances}.'],
  OBJECTIVE_FAILED: ['Cel specjalny „{objective}”: chybiony.', 'Rozkaz „{objective}” niewykonany. Rozczarowujące.'],
  HONOR: ['Pochwała: {player} – „{honor}”.', '{player} odznaczony: „{honor}”.'],
  MEDAL: ['{medal}: {alliance}.', 'Odznaczenie {medal} dla {alliance}.'],
  POINTS: ['Punktacja: {standings}.', 'Stan: {standings}.'],
  STANDINGS_FOG: ['Sytuacja: {standings}.', 'Dokładne liczby utajnione. Sytuacja: {standings}.'],
  LEADER: ['Prowadzi: {leader}.', '{leader} z przodu. Reszta: dogonić.'],
  QUIET: ['Brak zgłoszonych starć.', 'Żadnych bitew. Bezczynność odnotowano.'],
  OUTRO: ['Kontynuować.', 'Za Imperatora. Kto się waha, zostanie zastąpiony.', 'Koniec meldunku.'],
};

const PL_CHRONICLER: Texts = {
  TITLE: ['Z kroniki: faza {phase}', 'Kronika kampanii {campaign}, faza {phase}', 'Kronika odnotowuje fazę {phase}'],
  INTRO: [
    'Tak zapisano w dniach fazy {phase}, gdy front {campaign} znów ruszył z miejsca.',
    'Kronikarz spisuje, co wydarzyło się w fazie {phase}, by nie popadło w zapomnienie.',
    'Była to faza {phase} z {phaseCount}, a gwiazdy nad {campaign} płonęły.',
  ],
  BATTLE_WIN: [
    'Pod {planet} {winner} i {loser} zmierzyli się ze sobą; w końcu pole należało do {winner} ({vp}).',
    'Na {planet} rozstrzygnięcie zapadło na korzyść {winner}, a {loser} się wycofali ({vp}).',
    'Opowiada się, że {winnerPlayers} poprowadzili {winner} do zwycięstwa nad {loser} na {planet} ({vp}).',
  ],
  BATTLE_DRAW: ['Pod {planet} {attacker} i {defender} stanęli naprzeciw siebie, lecz nikt nie zdołał pokonać drugiego ({vp}).', 'Na {planet} walka między {attacker} a {defender} skończyła się bez zwycięzcy ({vp}).'],
  BATTLE_UNPLAYED: ['O {planet} nikt nie walczył; kronika odnotowuje zwycięstwo {winner}.', 'Broń pod {planet} milczała, a {winner} zwyciężyli bez bitwy.'],
  PL_GAIN: ['Na {planet} wzrosła potęga {alliance} (Power Level {from} → {to}).', '{alliance} zyskali wpływy na {planet} (Power Level {from} → {to}).'],
  PL_LOSS: ['Na {planet} gwiazda {alliance} przygasła (Power Level {from} → {to}).', '{alliance} stracili wpływy na {planet} (Power Level {from} → {to}).'],
  EVENT: ['W owych dniach nastąpiło {event}.', 'Kronika odnotowuje {event}, które dotknęło {alliance}.'],
  OBJECTIVE_MET: ['Cel „{objective}” wypełnili {alliances}.', '{alliances} osiągnęli cel „{objective}”.'],
  OBJECTIVE_FAILED: ['Cel „{objective}” pozostał nieosiągnięty.', 'Nikt nie wypełnił „{objective}”.'],
  HONOR: ['W tym czasie {player} zdobył wyróżnienie „{honor}”.', 'Imię {player} uczczono wyróżnieniem „{honor}”.'],
  MEDAL: ['{alliance} otrzymali {medal}.', 'Zaszczyt {medal} przypadł {alliance}.'],
  POINTS: ['Pod koniec fazy stan wynosił: {standings}.', 'Liczenie wykazało: {standings}.'],
  STANDINGS_FOG: ['Niewielu wiedziało, jak naprawdę wygląda front: {standings}.', 'Sytuacja pod koniec fazy: {standings}.'],
  LEADER: ['{leader} prowadzili.', 'Na przedzie byli {leader}.'],
  QUIET: ['Była to spokojna faza; nie odnotowano żadnej bitwy.', 'Kronika milczy o bitwach w tej fazie.'],
  OUTRO: ['Tu kończy się wpis kronikarza.', 'Co nastąpiło potem, opowiada następna strona kroniki.', 'Tak zakończyła się faza, a front czekał.'],
};

export const DECREE_TEXTS_INTL: Record<DecreeTone, { fr: Texts; es: Texts; pl: Texts }> = {
  PROCLAMATION: { fr: FR_PROCLAMATION, es: ES_PROCLAMATION, pl: PL_PROCLAMATION },
  COMMISSAR: { fr: FR_COMMISSAR, es: ES_COMMISSAR, pl: PL_COMMISSAR },
  CHRONICLER: { fr: FR_CHRONICLER, es: ES_CHRONICLER, pl: PL_CHRONICLER },
};

export const DECREE_HEADINGS_INTL: Record<'fr' | 'es' | 'pl', DecreeHeadings> = {
  fr: { battles: 'Batailles', front: 'Ligne de front', events: 'Événements', objectives: 'Objectifs spéciaux', honors: 'Honneurs et médailles', standing: 'État du front' },
  es: { battles: 'Batallas', front: 'Línea del frente', events: 'Eventos', objectives: 'Objetivos especiales', honors: 'Honores y medallas', standing: 'Estado del frente' },
  pl: { battles: 'Bitwy', front: 'Linia frontu', events: 'Wydarzenia', objectives: 'Cele specjalne', honors: 'Wyróżnienia i medale', standing: 'Stan frontu' },
};

export const DECREE_WORDS_INTL: Record<'fr' | 'es' | 'pl', DecreeWords> = {
  fr: { vp: 'VP', noVp: 'sans VP', and: 'et', tendency: { LEAD_CLEAR: 'nettement devant', LEAD: 'de peu devant', EVEN: 'à égalité', BEHIND: 'de peu derrière', BEHIND_CLEAR: 'nettement derrière' } },
  es: { vp: 'VP', noVp: 'sin VP', and: 'y', tendency: { LEAD_CLEAR: 'claramente por delante', LEAD: 'por poco delante', EVEN: 'igualados', BEHIND: 'por poco detrás', BEHIND_CLEAR: 'claramente por detrás' } },
  pl: { vp: 'VP', noVp: 'bez VP', and: 'i', tendency: { LEAD_CLEAR: 'wyraźnie z przodu', LEAD: 'nieznacznie z przodu', EVEN: 'na równi', BEHIND: 'nieznacznie z tyłu', BEHIND_CLEAR: 'wyraźnie z tyłu' } },
};
