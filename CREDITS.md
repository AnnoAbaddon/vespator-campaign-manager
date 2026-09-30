# Credits: graphics, fonts and icons

Unofficial fan project; not affiliated with or endorsed by Games Workshop. Warhammer 40,000 and related names and trademarks belong to their respective owners. This repository contains no artwork, logos or scans from Games Workshop products.

## Images generated with an AI image model
The following images were generated with an AI image model, then cropped, cut out and downscaled to WebP by the maintainer. Several motifs deliberately follow the visual language of Warhammer 40,000 (double-headed eagle, winged skulls, servo skull, purity seal, gothic cathedrals, 40k-style landscapes). AI-generated does not automatically mean free of third-party rights, and the MIT license of this repository does not cover them; if you run your own instance and want to be on the safe side, replace them with your own images of the same name and size.

| File(s) | Motif |
|---|---|
| `public/art/planets/*.webp` (13) | planet portraits of the Vespator map |
| `public/ui/land/*.webp` (13) | planet landscapes in the planet dossier |
| `public/ui/banner-emblem.webp` | banner with double-headed eagle (header) |
| `public/ui/emblem-winged.webp` | winged skull (brand mark, watermark) |
| `public/ui/sentinel.webp` | servo skull (login) |
| `public/ui/seal-ribbon.webp` | purity seal |
| `public/ui/corner-tl.webp`, `corner-tr.webp`, `corner-bl.webp`, `corner-br.webp` | corner fittings with skull |
| `public/ui/header-band.webp`, `public/ui/header-niches-l.webp` | gothic architrave and niche in the header |
| `public/ui/backdrop.webp` | cathedral interior (page background) |
| `public/ui/cathedral.webp`, `public/ui/login-cathedral.webp`, `public/ui/login-cathedral-sm.webp` | cathedral (sidebar, login) |
| `public/ui/metal-tile.webp`, `public/ui/space-bg.webp` | metal texture, space (no 40k motif) |

The files carry no embedded provenance data (EXIF/XMP/C2PA).

The "Use planet images" switch under *Administration → Appearance* only affects the planet portraits (`public/art/planets/`) and landscapes (`public/ui/land/`): when it is off, the app shows planets drawn in the browser and no landscape images. The other images above stay visible.

## Original drawings
- The map, the procedural planets (`src/components/map/PlanetArt.tsx`) and the interface elements (CSS) are this project's own work.
- App icon `src/app/icon.svg` and the PNGs rendered from it (`public/icons/icon-192.png`, `icon-512.png`, `maskable-512.png`): own drawing (cog with skull, a motif based on Warhammer 40,000).
- Inline SVG emblems in `src/components/emblems.tsx` (wax seal): own drawings. In the default `imperial` flavor the seal carries a skull (based on Warhammer 40,000); with `NEXT_PUBLIC_FLAVOR=neutral` it carries a compass star.

These drawings are covered by the same license as the code (MIT, file `LICENSE`).

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
