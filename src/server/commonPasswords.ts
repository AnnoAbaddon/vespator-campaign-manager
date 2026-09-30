/**
 * Kleine eingebaute Sperrliste verbreiteter Passwörter (ASVS 6.2.4), ohne Netzwerkzugriff. Enthält die häufigsten
 * Passwörter aus öffentlichen Leak-Statistiken (auch kürzere – die Mindestlänge greift ohnehin vorher) sowie typische
 * lange Varianten und Begriffe aus dem Umfeld dieser App. Verglichen wird ohne Groß-/Kleinschreibung.
 */
const LIST = `
123456 123456789 12345678 password qwerty123 qwerty 1q2w3e 12345 111111 1234567890 123123 000000 abc123 password1
iloveyou 1234567 qwertyuiop 123321 654321 666666 dragon monkey 121212 letmein football baseball sunshine princess
welcome shadow superman michael master trustno1 starwars passw0rd whatever freedom hello charlie donald admin
admin123 administrator login root toor changeme secret test test123 guest default zaq12wsx 1qaz2wsx qazwsx
1q2w3e4r 1q2w3e4r5t 1q2w3e4r5t6y 1qaz2wsx3edc qwertyuiop123 asdfghjkl asdfghjkl1 zxcvbnm zxcvbnm123 0987654321
1111111111 0000000000 1234512345 1234554321 9876543210 123456789a 123456789q a123456789 abcdefghij abcdefg123
abcd1234 abcd123456 password12 password123 password1234 password12345 password123! passwort passwort1 passwort12
passwort123 passwort1234 hallo123 hallo12345 hallo1234 geheim geheim123 geheim1234 geheimnis geheimnis1 schatz
schatz123 sommer2024 sommer2025 sommer2026 winter2024 winter2025 winter2026 fruehling2026 herbst2026 berlin123
hamburg123 muenchen123 deutschland deutschland1 fussball fussball1 fussball123 schalke04 borussia bayern1900
iloveyou1 iloveyou12 iloveyou123 loveyou123 princess1 sunshine1 football1 baseball1 superman1 batman123
starwars1 pokemon123 minecraft minecraft1 minecraft123 computer computer1 internet internet1 welcome1 welcome123
welcome1234 letmein123 monkey123 dragon123 master123 qwerty1234 qwerty12345 qwertz qwertz123 qwertzuiop
qwertzuiop1 asdf1234 asdfasdf asdfasdfasdf 11111111 22222222 88888888 12341234 123qwe 123qweasd 123qweasdzxc
qweasdzxc q1w2e3r4t5 q1w2e3r4t5y6 aa12345678 aa123456789 12345678910 1234567891 12345678900 123456abc
123abc123 abc123456 abcabc123 mustang shadow123 michael1 jennifer jordan23 hunter2 trustno123 changeme123
administrator1 adminadmin rootroot passpass password! password01 p@ssw0rd p@ssword p@ssw0rd123 passw0rd123
warhammer warhammer40k warhammer40000 warhammer123 warhammer1234 emperor emperor123 fortheemperor
forthemperor spacemarine spacemarines spacemarine1 bloodforthebloodgod waaagh waaagh123 vespator
vespatorfront warmaster warmaster1 warmaster123 kampagne kampagne123 crusade crusade123 inquisitor
inquisitor1 heresy heresy123 chaos123 imperium imperium123 ultramarines necrons123 tyranids123
`;

export const COMMON_PASSWORDS: ReadonlySet<string> = new Set(LIST.split(/\s+/).filter(Boolean));

export const isCommonPassword = (pw: string) => COMMON_PASSWORDS.has(pw.trim().toLowerCase());
