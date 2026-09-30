# Credits: graphics, fonts and icons

German version: [CREDITS.md](CREDITS.md)

Unofficial fan project; not affiliated with or endorsed by Games Workshop. Warhammer 40,000 and related names and trademarks belong to their respective owners. This repository contains no Games Workshop artwork and no AI-generated images.

## Images: own procedural image pack
All images under `public/ui/`, `public/art/planets/` and `public/icons/`, and the app icon `src/app/icon.svg`, are generated deterministically by `scripts/neutral-assets.mjs` (geometry, noise and gradients with sharp and resvg; no AI, no third-party templates). Motifs: compass star and laurel, brass fittings, sensor drone, wax seal, procedural planets and landscapes (colour palettes from `src/components/map/PlanetArt.tsx`), starfield and steel hall. They are this project's own work and are covered by the same license as the code (MIT, file `LICENSE` in the repository).

Regenerate: `node scripts/neutral-assets.mjs` (writes to `public/` and `src/app/icon.svg`; the same inputs produce byte-identical files).

The "Use planet images" switch under *Account → Appearance* chooses between the image files for planet portraits and landscapes (procedurally generated, see above) and planet graphics drawn in the browser, without landscape images.

## Original drawings in code
The map, the procedural planets (`src/components/map/PlanetArt.tsx`), the interface elements (CSS) and the inline SVG emblems in `src/components/emblems.tsx` are this project's own work.

## Icons from game-icons.net (CC BY 3.0)
Symbols for Theatres, Infrastructure, operations, Attack Types, events, medals, Alliance crests and armies come from [game-icons.net](https://game-icons.net). They are licensed under [Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/). We adjusted their colour and size.

Authors:
- Lorc: https://lorcblog.blogspot.com
- Delapouite: https://delapouite.com
- DarkZaitzev: https://game-icons.net (profile DarkZaitzev)
- HeavenlyDog: https://game-icons.net (profile HeavenlyDog)
- Caro Asercion: https://game-icons.net (profile Caro Asercion)
- Kier Heyl: https://game-icons.net (profile Kier Heyl)

The author and name of each icon are listed in `src/components/icons/gameIcons.ts` (`ICON_CREDITS`).

## Fonts (SIL Open Font License 1.1)
All fonts are licensed under the [SIL Open Font License 1.1](https://openfontlicense.org/open-font-license-official-text/).

| Font | Used for | Source and copyright |
|---|---|---|
| Cinzel | titles, plates, headings | Google Fonts, © 2020 The Cinzel Project Authors (Natanael Gama) |
| EB Garamond | navigation, tabs, prominent labels | Google Fonts, © 2017 The EB Garamond Project Authors (Georg Duffner, Octavio Pardo) |
| Alegreya Sans | body text, forms, tables | Google Fonts, © 2013 The Alegreya Sans Project Authors (Huerta Tipográfica) |
| Share Tech Mono | IDs, coordinates, timestamps; map export (PNG) | Google Fonts, © 2012 Carrois Type Design, Ralph du Carrois, Reserved Font Name "Share" |
| VF Digits (`public/fonts/vf-digits-700.woff2`) | digits 0 to 9 in Cinzel headings | subset (digits only) of Alegreya Sans Bold, © 2013 The Alegreya Sans Project Authors |

- Cinzel, EB Garamond, Alegreya Sans and Share Tech Mono are fetched at build time through `next/font/google` (network access needed during the build) and served by the app itself.
- `assets/fonts/ShareTechMono-Regular.ttf` (map export) with its license text `assets/fonts/OFL.txt`.
- `public/fonts/vf-digits-700.woff2` is a modified version (subset) of Alegreya Sans; full license text with copyright: `public/fonts/OFL-AlegreyaSans.txt`.

---
Warhammer 40,000 is a trademark of Games Workshop Ltd. This project is unofficial and not affiliated with Games Workshop.
