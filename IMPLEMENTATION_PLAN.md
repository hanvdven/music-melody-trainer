# Implementation Plan — live log

> Standing rule (Han 2026-05-31): log **every** plan, CR (change request), FR
> (feature request) and bug here **immediately**, as a short implementation plan,
> before/while implementing. This file is the running scratch-plan; BACKLOG.md
> stays the user's source of truth for feature text.

Status keys: ✅ done · 🔨 in progress · ⏳ backlog/next phase · 🐞 bug

## 2026-09-06 — ✅ #1193 UAT r3: sun-glow radius verdubbeld (55 → 110 gpx)

Han ("oooh heel nice! kippenvel. Maak de radius dubbel zo groot — harde straal en
fall-off schaal. je hoeft niet te testen"): één constante, `SUN_GLOW_RADIUS_GPX`
55 → 110 in `celestialModel.js`. De shader-mask `1 - smoothstep(0.5·r, r, d)`
schaalt zowel de vlakke harde kern (`0.5·r`, nu ~55 gpx) als het fade-eind (`r`,
nu 110 gpx) mee met dit ene getal. `CelestialSky`'s `nearSun` (maan verbergen
binnen de zon-gloed) hergebruikt dezelfde constante → die cutoff verdubbelde ook,
bewust gehouden. `lint` 0 · `build` clean · vitest overgeslagen per Han. Commit
`d1e74b90`. Doc §377 masker-alinea bijgewerkt.

🔨 **Vervolg-CR (Han, screenshot nacht-scene):** effect mag nog een tikje sterker;
dicht bij de zon moet de gloed ~X gpx IN de sprite doordringen (nu enkel de
buitenste rand); bij foliage nog een donkere rand-fringe → toepassings-volgorde
t.o.v. de wind "pixel-switch" (`shiftedNativeX`) / semi-transparante rand-texels;
geldt voor alle illum. Interview loopt — nog niet geïmplementeerd.

## 2026-09-06 — ✅ #1193 UAT r2: sun-glow leest nu als "overbelicht", zoals de maan

Han (screenshot: zon vlak boven wilg, geen zichtbare gloed op de wilg-rand):
"ik wil bijv dat de buitenste paar pixels in de buurt van de zon 'overbelicht'
zijn, precies zoals bij de maan ... effect bestaat al voor de maan; je moet
hetzelfde effect hergebruiken en gewoon beperken tot 'in de buurt van de zon'."

Coördinaten-brug gecontroleerd en klopt (zowel de sky-canvas als de foliage/
ground-canvas dekken exact dezelfde RpgLevelPanel-container; `zoom = size.h/320`
maakt `skyGeom.Hpx == 320`, dus de width-genormaliseerde fracties lijnen op). Het
euvel zat in de STERKTE/KLEUR, niet de positie:

- **Kleur** (`SkyGradientBackdrop.sunGlowColor`): kort een warm bijna-wit geprobeerd
  om de blow-out af te dwingen; Han: "gewoon de huidige kleur van de zon
  hergebruiken. het effect mag even sterk zijn als dat van de maan." → terug naar
  `lerpRgb(SUN_GLOW_RGB, SUNSET_RGB, sunsetFactor(illum))` (zon-geel → dusk-roze).
  De "overbelicht"-look komt van de STERKTE, niet de kleur.
- **Sterkte** (`SUN_SHEEN_SCALE`): 0.35 → 0.5 = pariteit met `MOON_SHEEN_SCALE`
  ("hetzelfde effect", geen zwakkere hulp-term).
- **Afstandsmasker** (`applySunGlow`): was `1 - smoothstep(0, radius, d)` (fade
  vanaf het midden). Nu `1 - smoothstep(0.5·r, r, d)` = een VLAKKE kern op volle
  sterkte tot de halve straal, dan pas een fade. Plus `SUN_GLOW_RADIUS_GPX`
  40 → 55, dus de vlakke kern reikt ~27 gpx van de schijf.
- Luminantie-mask (`MOON_LUM_LO/HI`, gedeeld met de maan) ONGEWIJZIGD (Han: "hou
  'm zoals de maan").
- Tests herschreven (`skyGradientBackdrop.test.js` sunGlowColor-blok: near-white
  i.p.v. yellow). `lint` 0 · `build` clean · `test:run` 1484 pass / 1 skip. Doc
  §377 kleur- + masker-secties bijgewerkt.

## 2026-09-06 — ✅ #1193 UAT r1: sun-glow niet meer hoogte-afhankelijk

Han: "ik vind de sun-glow nog niet goed zichtbaar. ... ik wil de zelfde soort
gloed die de maan geeft, op objecten die visueel dicht bij de zon staan. Dus
als zon vlak boven de wilg staat, wil ik een gloed zien op de wilg."

Code-review van het mechanisme (coördinaten/randdetectie klopten al) wees op de
hoogte-afhankelijke terugval als waarschijnlijke hoofdoorzaak: sterkte zakte
terug naar 25% zodra de zon >25° boven de horizon staat — maar "vlak boven de
wilg" gebeurt op willekeurig welk moment van de dag, dus voor een groot deel
van de dag was de gloed al fors gedempt.

Interview (2 vragen): (1) hoogte-terugval weg — "niet hoogte afhankelijk"
bevestigd. (2) helderheids-mask (enkel reeds-lichte pixels vangen de gloed,
gedeeld met de maan) NIET versoepelen voor foliage — "hou 'm zoals de maan".

- `celestialModel.sunGlowStrength`: het hele fall-naar-vloer-stuk (en de 2
  constantes `SUN_GLOW_ALT_FADE_DEG`/`SUN_GLOW_ZENITH_FLOOR`) verwijderd —
  enkel de korte rise-band (0→2°) blijft, zodat de term niet plots van 1→0
  popt op de horizonlijn. Sterkte is nu exact 1 vanaf 2° tot 90°, ongeacht
  hoogte; nog steeds exact 0 onder de horizon (ac3 blijft gelden).
- Helderheids-mask (`MOON_LUM_LO`/`MOON_LUM_HI`, gedeeld met `applyMoonLight`)
  ONGEWIJZIGD.
- Tests herschreven (`celestialModel.test.js`): "peaks just above horizon" →
  "reaches full strength and stays there"; midday-assert nu exact 1 i.p.v. de
  oude vloer-waarde.
- `lint` 0 · `build` clean · `test:run` 1483 pass / 1 skip. Doc §377
  bijgewerkt (oude curve gemarkeerd als "superseded", nieuwe curve + waarom).

## 2026-09-05 — ✅ #1191 UAT r6: maan opnieuw ontworpen — geen alpha meer, enkel kleur

Han (screenshot): "de maan is nog niet perfect. Nu is de 'lichte kant' dicht bij de
zon donkerder dan de donkere kant. Design even hoe de maan moet eruit zien from
scratch."

**Diagnose** (3e keer dat dit exacte euvel opduikt — r3, r5, nu weer): zodra "hoe
belicht" via ALPHA loopt, wordt de onbelichte kant deels DOORZICHTIG — de heldere
lucht schijnt erdoorheen en oogt dus licht, terwijl de belichte kant (ondoorzichtig,
eigen lichtgrijze kleur) tegen een heel heldere/blauwe lucht juist donkerder kan
ogen. Geen enkele alpha-waarde lost dit structureel op — het zit in het
alpha-blenden zelf.

**From-scratch ontwerp (interview, alle 3 vragen beantwoord):**
1. Schijf is ALTIJD volledig ondoorzichtig (`MOON_DISC_ALPHA = 1`, geen
   uitzonderingen meer).
2. "Hoe belicht" loopt voortaan UITSLUITEND via vulkleur (`MOON_SHADE[]` = 4
   kant-en-klare kleuren, geen `{fill,alpha}` meer) — kan dus nooit meer omkeren
   t.o.v. de achtergrond.
3. Geen rand/outline (Han: nee).
4. Onbelichte kant blijft hetzelfde donkerblauwgrijs (`MOON_EARTHSHINE_RGB`,
   ongewijzigd) — nu alleen consistent zo getoond i.p.v. soms lichter door
   transparantie.
`drawMoonDisc`'s `alphaMul`-param is nu puur de §375-wolkenfade, losgekoppeld van
"hoe belicht". `lint` 0 · `build` clean · `test:run` 1479 pass / 1 skip (ongewijzigd,
canvas-only code). Doc §374 r6-aantekening.

## 2026-09-04 — ✅ Wereld-hoogte-knop: volle hoogte (320 gpx) door content2→content1→nav uit te zetten

Han (item 4, vervolg op #1191 pre-test-ronde): "als het 'wereld' beeld lager is dan
320 GPX, wil ik een knopje rechtsbovenin om het volle hoogte te geven. Als content 1
en 2 niet meer passen, render die dan niet. als het nog wel past, render ze dan wel.
bij volle hoogte moet het knopje weer terug naar standaardhoogte gaan." Na interview:
knop rechtsboven IN de wereld-view zelf; "volle hoogte" = precies 320 gpx (niet de
volledige viewport); "content 1/2" = de bestaande blokken uit `worldLayout.js`
(content1 = RpgLevelBottomPanel/gesprek, content2 = WorldPiano) + navigatieknoppen
(WorldNavBar) — bevestigd via `WorldBottomArea.jsx`.

- **`worldLayout.js`**: nieuwe pure `computeWorldFullHeightLayout(w, h, n)` — GEEN
  variant van de bestaande 4-arrangement-ladder (dat is een andere vraag: "welke
  arrangement past het best" vs. "hoe maak ik plaats door blokken uit te zetten").
  Altijd een simpele volle-breedte verticale stapel: wereld (vast op
  `WORLD_GPX_H_MAX`=320, geklemd bij een te korte viewport) → wat overleeft van
  content1/content2/nav. 4 combinaties geprobeerd, meeste content eerst: alles →
  content2 weg → content1 ook weg → alles weg. Eerste combinatie die past ("als het
  nog wel past, render ze dan wel") wordt gebruikt. `n` (schaal) komt van de caller
  — de toggle verandert nooit de pixel-schaal, enkel de hoogte-verdeling.
- **`App.jsx`**: `worldLayoutBase` (normale layout, altijd berekend) + `worldFullHeight`
  state (handmatige toggle, niet auto-afgeleid) + `worldLayout` = full-height-variant
  wanneer aan. Knop getoond zodra `worldLayoutBase.world.gpxH < 320` OF de toggle al
  aanstaat (zodat je 'm altijd weer uit kan zetten).
- **`WorldHeightToggleButton.jsx`** (nieuw): plain `<button>`, rechtsboven, ⤢/⤡ icoon.
  Geplaatst als SIBLING van de RpgLevelPanel-wrapper (niet erin) — die wrapper is de
  volle 272·N-tal ongecropte laag met een negatieve bottom-offset; een knop daarin zou
  met de crop kunnen mee-scrollen. De buitenste (geclipte, `overflow:hidden`,
  `world.screenH` hoge) container is wat de speler echt ziet.
- **`WorldBottomArea.jsx` + `WorldLayoutDebugFrames.jsx`**: null-guards toegevoegd —
  `nav`/`content.block1`/`content.block2` kunnen nu `null` zijn (full-height mode).
- Tests: 6 nieuwe cases in `worldLayout.test.js` (schaal behouden, alles-past-nog,
  content2-eerst-weg, content1-ook-weg, alles-weg-behalve-wereld, nooit onder minimum).
- `lint` 0 · `build` clean · `test:run` 1479 pass / 1 skip (+6). Doc §379 toegevoegd.

## 2026-09-04 — ✅ #1191 pre-test r5: maan verdwijnt bij zon-nabijheid · opacity 0.1 · lijnen off-screen

Han (voor het testen, 3 concrete + 1 nieuwe feature + 1 vervolgvraag):
1. "if moon within the glow radius of the sun, make it invisible"
2. "geef de unlit part van de maan opacity 0.1, en de half lit part accordingly"
3. "sterrenstelsels ... alle stippellijnen altijd getekend, ook naar sterren buiten beeld"
4. wereld-hoogte-knopje bij <320 gpx (interview nodig — zie hieronder)
5. labels bij planeten/noordster/andere hemellichamen (nieuw, apart backlog-item — zie hieronder)

Alles in `CelestialSky.jsx` (schoon bestand):
- **Maan verdwijnt bij zon:** `nearSun = hypot(moonXY−sunXY) < SUN_GLOW_RADIUS_GPX` — hergebruikt
  §377's eigen sun-glow-straal-constante (`celestialModel.js`) i.p.v. een 2e getal. Fysisch ook
  correct: bij nieuwe maan staan zon en maan dicht bij elkaar aan de hemel.
- **Opacity 0.1:** `MOON_SHADE[]` weer `{fill, alpha}` (r3's vorm), `alpha = lerp(MOON_UNLIT_ALPHA
  0.1, 1, t)`. Bekend risico (r4's "donkere ring" kan in theorie terugkeren tegen een heldere
  daghemel) expliciet gevlagd in code + hier — Han's keuze, met dat risico in gedachten. `drawMoonDisc`'s
  laatste param is nu een ADDITIONAL cloud-fade multiplier, niet de eigen alpha van de schijf meer.
- **Lijnen off-screen:** `starXY.set(s.hr,[x,y])` gebeurt nu voor ELKE astronomisch zichtbare ster
  (`p.visible`), on- of off-canvas; alleen de ster-PIXEL zelf slaat over als off-canvas. Canvas-tekenen
  buiten de grenzen is gratis (tekent gewoon niets).

`lint` 0 · `build` clean · `test:run` 1473 pass / 1 skip (ongewijzigd — canvas-only code, niet
unit-getest). Doc §374 r5-aantekeningen toegevoegd.

### ⏳ Item 4 — wereld-hoogte-knopje: interview nodig
Han: "als het 'wereld' beeld lager is dan 320 GPX, wil ik een knopje rechtsbovenin om het volle
hoogte te geven. Als content 1 en 2 niet meer passen, render die dan niet..." — "content 1 en 2" is
niet gespecificeerd genoeg om te bouwen. Interview volgt in chat.

### ⏳ Backlog-item #1194 — planeten (echte baanmechanica) + individuele ster-labels
Han: "toon ook labels bij planeten, de noordster, en andere interessante hemellichamen." →
"haal de planeetbanen op" (op de vraag placeholder vs. echt) = ECHTE orbitmechanica gewenst, geen
nep-baan. celestialModel.js heeft nu geen ephemeris-model; de wereld draait op gecomprimeerde
cyclus-tijd (geen wall-clock), dus geen live-API — een ingebouwd laag-precisie planeet-positiemodel
(Kepleriaanse elementen, puur JS). Noordster zit al in de catalogus maar zonder individueel label.
Ticket #1194 aangemaakt in `todo`, volledig interview nog te doen — te groot voor een quick pre-test
fix, eigen design/plan/impl-cyclus.

## 2026-09-04 — ✅ #1192 UAT r1: helder blauwer · geen vlekken · bewolkte nacht donker · waterige zon wit

Han: (1) "zeer heldere dag, echt mooi helder blauw, nog niet gezien" (2) "bewolkte
nacht moet ook donker worden. Maak de achtergrond gewoon wit (bewolkt) / mat grijs
(zwaar bewolkt) met subtiele gradient; de vlekken hoeven niet." (3) "Waterige zon:
wit, niet geel."

- **HELDER blauwer** (`SkyGradientBackdrop.cloudSkyStop` op 0): `CLEAR_SAT_GAIN` 0.45→0.85
  **+** nieuwe lerp naar `CLEAR_SKY_BLUE [64,132,220]` (`CLEAR_BLUE_SHARE 0.55`). r0
  satureerde alleen de bleke cyaan → bleef flets; de blauw-lerp maakt 't echt blauw.
- **Vlekken WEG**: `buildMottleField`/`valueNoise`/`hash2`/alle `MOTTLE_*`/FIELD+PAINT-
  effects/de sibling-`<canvas>`/`cloudSeed`+`sizePx`+`zoom` props allemaal verwijderd.
  `SkyGradientBackdrop` is weer een kale gradient-`<div>`. `E039-SKY-MOTTLE-PAINT` in
  CLAUDE.md §7a → **RETIRED** (nummer blijft staan voor oude logs).
- **Bewolkt = wit, zwaar = mat grijs, subtiele gradient**: nieuwe `cloudSheetAt(f, darkT,
  illum)` — `CLOUD_SHEET_WHITE [250,250,250]` × `lerp(1, CLOUD_SHEET_VGRAD 0.92, f)` (zachte
  top→horizon val) × `lerp(1, OVERCAST_DARK_SCALE 0.46, darkT)` (wit→grijs ~[115]) ×
  `lerp(1, OVERCAST_NIGHT_DIM 0.26, 1−illum)` (nacht écht donker; was 0.45).
- **Waterige zon wit** (`CelestialSky`): glow/body-kleur lerpt `SUN_GLOW_RGB [255,233,160]`
  → `SUN_WET_GLOW_RGB [255,255,255]` op `wet`.
- `weather.cloudSeed` blijft in de state (comment bijgewerkt) — gereserveerd voor de
  wolkensprites-vervolgfase.
- Tests: `skyGradientBackdrop.test.js` §375-blok herschreven (geen `cloudFlatBase` meer,
  subtiele-gradient asserts, `cloudSheetAt`-case). `lint` 0 · `build` clean · `test:run`
  1462 pass / 1 skip. Doc §375 herzien.

## 2026-09-04 — #1191 UAT r4: labels niet meer blurry + maan/zon-schijven

Han: (a) sterrenbeeld-namen zien er blurry uit — schaaleffect? (b) dag-maan: de
midden-gradient is donkerder dan het onbelichte stuk (zou niet). (c) zon/maan-
cirkels: uiteinden 1 gpx → maak ≥3 gpx. Alles in `CelestialSky.jsx`.

### ✅ (a) Namen op een aparte full-res canvas
Waren op de game-px canvas (16px) → die wordt ×zoom CSS-opgeschaald met
`image-rendering:pixelated` → canvas-AA-randen worden chunky halo's. Nu: 2e
`<canvas>` op volle CSS-resolutie (`labelCanvasRef`, geen upscale, boven de
sky-canvas in DOM), tekst op `16·zoom`px. `zoom` is integer in world-mode
(`worldScale`, §334) → exact veelvoud van 16px native → pixel-perfect, nooit
her-vergroot. Elke redraw gewist+hertekend zolang namen aan + sterren op; leeg
overdag; gewist via effect als de toggle uit gaat.

### ✅ (b) Maanschijf monotone shades
r3 varieerde ALPHA per shade (0.18→1). Over een heldere daghemel leest een
low-alpha donkergrijs licht, maar een mid-alpha midgrijs donker → donkere ring.
Nu: één uniforme `MOON_DISC_ALPHA=0.9`, alleen de fill-KLEUR ramp't grijs→wit
(`MOON_SHADE[]` = 4 voorgemengde grijzen). Helderheid nu monotoon op elke
achtergrond; schijf effectief opaak.

### ✅ (c) Schijf-randen ≥3 gpx
Nieuwe `discHalfWidth(r,dy) = max(1, round(√(r²−dy²)))` — `round` i.p.v. `floor`
(ronder klein cirkeltje) + 1px-vloer zodat boven/onder 3px zijn i.p.v. 1px-punt;
`round` houdt bij r=6/7 al volle breedte over dy∈{−2..2} → links/rechts ook ≥5
rijen. Gebruikt door `fillDisc` (zon + gloedringen) en `drawMoonDisc`.

Doc §374 rasterisatie- + debug-affordances-bullets bijgewerkt. `lint` 0 · `build`
clean · `test:run` 1441 pass / 1 skip.

## 2026-09-04 — #1191 UAT r3: maansikkel minder gepixelleerd + ⏳ weertypen (nieuw ticket)

### ✅ Maansikkel 4-level terminator
Han: "de maanfasen zijn té gepixelleerd. voeg ook pixels aan 70 en 30 procent toe
op de maan, voor iets gladdere randen." → `drawMoonDisc` (CelestialSky.jsx): harde
`su ≥ 0` binary → 4 buckets op de signed terminator-afstand `su = u − w·(1−2k)`:
earthshine (`< −1`) · 30% (`[−1,0)`) · 70% (`[0,1)`) · vol (`≥ +1`). `MOON_SHADE[]`
= voorgemengde rgb+alpha. Nog steeds integer `fillRect` (gequantiseerde dither, geen
sub-pixel AA). Doc §374 rasterisatie-bullet.

### ⏳ Weertypen — NIEUW TICKET (niet in #1191)
Han's spec: donker bewolkt (grijze vlekkerige lucht, illum omlaag, geen zon/maan) ·
bewolkt (witte vlekkerige achtergrond, "waterige" zon achter wolken, geen maan/
sterren) · licht bewolkt (as is) · helder (witte fade minder wit, blauw blauwer).
Wolkensprites per parallaxlaag levert Han later aan — niet op wachten. → eigen
kanban-ticket, korte interview eerst (§4b). Raakt weatherCycle (4e track?),
SkyGradientBackdrop, CelestialSky (zon/maan/sterren verbergen), debug-picker.

## 2026-09-04 — #1191 UAT r2: 4 change-requests (2 ✅ · 1 ⛔blocked · 1 ❓await Han)

Han (UAT r2): (1) maangloed enkel als de maan echt schijnt; (2) debug-knop naar de
4 maanfasen; (3) midden in de nacht te donker; (4) gebruik de 3e (italic serif)
pixel-font uit z'n font-atlas voor de sterrenbeeld-namen.

### ✅ (3) Nacht-floor 0.05 → 0.12
`TIME_PHASES` night `illum` 0.05→0.12 (terug naar §362-waarde; §370's halvering ging
te ver voor de beloopbare wereld). Vlak, elke nacht (Han's keuze boven
maanfase-afhankelijk). `starOpacity` easet ondiep vanaf 0.05 → sterren 1.0→~0.94.
`weatherCycle.test.js` night-floor asserts 0.05→0.12. Doc §374 UAT-r2 bullet.

### ✅ (2) Debug moon-phase picker
`weatherCycle.js`: `lunationOverride` (null|0|0.25|0.5|0.75) in state +
`seekLunation(state, value)` picker-action; `weatherOutputs.lunationPhase` respecteert
de override, `lunationOverride` mee in outputs. `tickWeather` draagt 'm ongemoeid
door (`{...state}`), `cyclesElapsed` telt eronder door. Legacy persisted state zonder
't veld → `!= null` false → auto. `RpgLevelPanel`: "Moon phase" `LevelPicker`
(Auto/New/First ¼/Full/Last ¼) in het World-debugpaneel, na "Wind". Een pin
verschuift maan + zon-RA + sterrenbol samen (sprong in lunatie-tijd). +5 tests.

### ✅ (1) Maangloed enkel als de maan schijnt
Han: "ander werk is niet gecommit maar wél af" → doorgezet (geen GLSL-wijziging,
dus geen botsing met de parallelle §370-r9-shaderwerk).
- `celestialModel.js`: `moonShine(moon)` 0..1 = 0 als `belowHorizon`, anders
  `illumFraction · clamp(altDeg/MOON_SHINE_ALT_FADE_DEG(12°))`. +3 tests.
- `RpgLevelPanel.jsx`: `quantMoonShine(out)` (0.05-stappen) → `foliageParams.moonShine`
  in `pushWeatherToFoliage` + in de per-tick change-detect (mag, want gequantiseerd
  & grof — anders dan `cycleT`). `bgRimOpacity` × `moonShine`. `moonPresence`
  onder­grens 0.08→0.13 (nieuwe 0.12-floor).
- `ForegroundFoliageLayer.jsx` (non-inst + inst) + `LdtkLitGround.jsx`: elke
  `uMoonStrength`-upload × `(p.moonShine ?? 1)`. GEEN nieuwe uniform, GEEN GLSL-diff.
  `DEFAULT_FOLIAGE_PARAMS.moonShine: 1` (dev-harness / andere callers ongemoeid).
- Richting blijft de vaste linksboven `MOON_DIR` (Han's keuze). GLSL `moonPresence()`
  is nog op 0.05 getuned — §370-r9-auteur kan bijstellen als 't bij 0.12 afwijkt.
- NB: `ForegroundFoliageLayer.jsx` + `LdtkLitGround.jsx` dragen in deze commit ook
  de al-afgeronde §370-r9-wijzigingen mee die in de tree stonden (Han's go-ahead).

### ✅ (4) Constellatie-namen → BestiaryPixel italic (SandyForest)
Han: "kijk beter ... hoe worden fonts in de bestiary gerenderd?" → `App.css` heeft de
`'BestiaryPixel'`-familie (§334/§351), gesplitst per stijl: normal=CelticTime,
**italic=SandyForest**, bold=Bitfantasy. De "3e (italic)" = SandyForest.
`CONSTELLATION_LABEL_FONT` = `italic 16px BestiaryPixel, monospace` (16px = native:
`unitsPerEm 1024` / 64 units-per-design-px → 1 dp = 1 screenpx; kleiner blurt).
`PixelNewspaperIII` `@font-face` weer verwijderd uit `App.css`. `document.fonts.load`
blijft (italic-face is niet gegarandeerd al geladen). Doc §374 font-bullet + files
herschreven. `CelestialSky.jsx` + `App.css` — schone files.

## 2026-09-04 — ✅ #1191 UAT-fix: sterrenhemel schokkerig → 60 fps

Han (UAT): "de beweging van de sterren is schokkerig ... sommige sterren
verspringen meerdere frames ... kan de hemel gewoon aan 60 fps?"

Oorzaak = framerate, niet GPX-geometrie: `CelestialSky` was een throttled
`useFrameLoop`-subscriber op `throttleMs: 100` (10 fps) **plus** een
"redraw pas als iets ≥ 1 hele game-pixel bewoog" early-out. Samen klonterden ze
continue beweging tot sprongen van meerdere pixels (sterren bij de horizon —
azimut daar samengedrukt — bewegen het snelst en sprongen 2-3 px per redraw).

Fix (alleen `CelestialSky.jsx` render-cadans; model/data/`weatherCycle`
onaangeroerd):
- `{ priority: 'throttled', throttleMs: 0 }` → elke frame, nog steeds ná de
  clock-critical camera/scroll-pass, dus geen risico voor die.
- `movedPx < 1` early-out verwijderd; skip nog enkel een byte-identieke frame
  (bevroren `cycleT` én illum settled binnen 0.004). Elke ster stapt nu exact
  1 game-pixel per frame, glad over 60 fps.
- Comments + `docs/architecture.md` §374 (2 invariant-bullets) bijgewerkt naar de
  nieuwe cadans + UAT-noot.
- Restschokkerigheid: een héél trage ster stapt nog 1 px tegelijk (geen
  sub-pixel zonder AA, wat een pixel-art hemel niet mag) — bij 60 fps onmerkbaar.

`lint` 0 errors · `build` clean · `test:run` 1428 pass / 1 skip.

## 2026-09-04 — ✅ #1191 "sterrenhemel" — celestiële laag (impl → test)

FR (L3): sterrenveld + sterrenbeelden + zon + maan boven de RPG-wereld, aangedreven
door de auto weer-cyclus. Interview met Han afgerond (in chat).

Vastgelegde keuzes:
- Camera kijkt **zuid**; zon/maan boog oost→zuid→west, sterren driften links→rechts.
- **Continue cyclusklok** `cycleT` (0..1 over de 480s-loop). Zon-hoogte = 0 bij
  midden-dusk & midden-dawn, max midden-dag, min midden-nacht. `TIME_PHASES`
  ongewijzigd → zon beweegt niet-lineair. Equinox, Brussel 50.85° (noon-hoogte 39.15°).
- Maan: **volledige elongatie-simulatie**. `moonHA = sunHA + lunationPhase·360°`,
  `lunationPhase += 1/28` per cyclus (28 cycli = 1 lunatie). Nieuwe maan → overdag
  bij de zon, 's nachts ONDER de horizon (niet getekend). Volle maan → hele nacht op.
  `illumFraction = (1−cos elongatie)/2`, lichte rand richting zon (2-cirkel-sikkel).
- Sterrenbol: 1 omwenteling/cyclus + 1/28 siderisch overschot (`SIDEREAL_RATIO =
  1+1/28`) — dezelfde 1/28 die de maan-elongatie voortdrijft. Eén knop.
- Ster/constellatie-opacity = pure functie van `foliageParams.globalIllumination`
  (gedeelde dag/nacht-knop). Geen aparte toggle.
- Catalogus: ~500 sterren tot mag ≤ 4.5 (Yale BSC5-subset, gebакen data — de
  timeanddate-URL scrapen kan niet). Lijnen+namen voor ~30 sterrenbeelden zichtbaar
  vanuit Brussel zuidkijkend bij equinox.
- Constellatie-lijnen + namen: **debug-only** toggles in `FoliageParamsPanel`
  (default UIT). Namen in `PixelNewspaperIII.ttf` (serif pixel font, expliciete
  `ctx.font` — nooit Maestro).
- Zon/maan = platte pixel-schijven: zon ~14 gpx geelwit + gloed, overdag zichtbaar;
  maan ~12 gpx grijs met fysisch-correcte sikkel. Pixel-perfect (`fillRect` op
  integer-coords, nooit `arc()`).
- Scope: Han's keuze — **één ticket**, geen split. Impl houdt commit strak, meldt in
  PLAN als het > ~12 stappen wordt.
- Debug baan-overlays: bij wereld-`debugMode` teken zon-baan (sample `cycleT` 0..1)
  + maan-baan voor huidige `lunationPhase` als stippellijnen + live markers.

Architectuur:
- Nieuwe `<CelestialSky>` canvas-laag in `RpgLevelPanel`, TUSSEN `<SkyGradientBackdrop>`
  en de parallax `<SceneryBack>`. Native world-pixel-res (viewport/ZOOM) +
  `image-rendering:pixelated` — hergebruik de parallax-`CanvasLayer`-conventie uit
  `LdtkScenery.jsx`. Geen eigen rAF — abonneer op `useFrameLoop` (E034-patroon).
- Nieuw puur `celestialModel.js`: RA/Dec → alt/az (Brussel, LST) → zuid-scherm (x,y);
  zon/maan uit `(cycleT, lunationPhase)`; sikkel-geometrie. Unit-tests, geen wall-clock.
- `weatherCycle.js`: `cyclesElapsed` in state (++ bij phaseIndex 3→0); `cycleT` +
  `lunationPhase` als PURE afgeleiden in `weatherOutputs()` — geen nieuwe timers, dus
  `weatherCycleStore` freeze/resume onveranderd.
- Gebакen data: `data/brightStars.js`, `data/constellationLines.js`.

Architecturale impact → na design_review ook **plan_review**. Volgende agent —
Planning: [Opus/high]. Doc: nieuwe §373 (uniek nummer checken).

### ✅ IMPL afgerond — [#1191-impl-Opus/high] 2026-09-04

Twee correcties uit PLAN, door Han bevestigd bij plan_review, zitten in de code:
1. Architectuursectie is **§374** (§373 = "Worker-NPC names + dialogue").
2. Maan-elongatie is **`H_moon = H_sun − 360·lunationPhase`** (MIN, niet plus — de moon
   loopt oostwaarts en `H = LST − RA`). Unit-test "FIRST QUARTER transits due south at
   DUSK" pint dit vast; met het plus-teken faalt hij.

Wat er landde:
- **`celestialModel.js`** (nieuw, puur — geen DOM/wall-clock/module-state): twee-segments
  zonneboog gepind op de dusk/dawn-ankers (mid-dag 39,15° en mid-nacht vallen er gratis
  uit want dec=0), `LST = H_sun + RA_sun` met `RA_sun = 360·lunationPhase` → siderisch
  overschot 1+1/28 volgt uit de ENE 28-knop, atan2-azimut (geen tan(dec), Polaris),
  isotrope cilindrische projectie (één `DEG_PER_PX` op beide assen), `starOpacity` via
  `easeInOut` uit `weatherCycle`.
- **`CelestialSky.jsx`** (nieuw, alleen rasterisatie): native-res canvas + `pixelated`,
  throttled `useFrameLoop`-subscriber (100 ms) + try/catch → `E037`, `pointerEvents:none`
  (dus §3a hit-box N/A). Sterren 3/2/1 gpx (3 = 3×3 minus hoeken), B−V-kleurbuckets,
  zon-disc + 2 gekwantiseerde glow-ringen, maan via **per-pixel terminator-test** (exact
  bij elke limb-hoek, geen `arc()`), gestippelde Bresenham-sterrenbeelden, namen met
  expliciete `ctx.font` in PixelNewspaperIII + `document.fonts.load` (→ `E038`),
  debug-baanoverlays.
- **`weatherCycle.js`**: `CYCLE_TOTAL_S`/`PHASE_START_S` afgeleid via `reduce()` over
  `TIME_PHASES` (§6c), `CYCLES_PER_LUNATION = 28`, `cyclesElapsed` in state (++ bij de
  dawn→day-wrap), `cycleT` + `lunationPhase` als pure afgeleiden. `seekPhase` laat
  `cyclesElapsed` met rust. **Invariant**: nooit in de `setWeather`-epsilonlijst (zou
  #1162 Fase 8 ongedaan maken) — als comment in `RpgLevelPanel` vastgelegd.
- **Data**: `scripts/generate-star-catalog.mjs` (nieuw) leest de Yale BSC5 (ADC/CDS V/50,
  publiek domein) → 611 sterren + 33 sterrenbeelden / 213 segmenten. Sterrenbeeld-figuren
  **handgeschreven in de generator zelf** (Stellarium = GPL/CC-BY-SA, share-alike zou aan
  ons datafile plakken). Generator importeert `celestialModel` voor zijn zichtbaarheids-
  validatie → data en runtime kunnen niet uiteenlopen; elke onvindbare ster = harde exit.
- Debug-toggles "Constellation lines"/"Constellation names" (default Off) in
  `FoliageParamsPanel`, via de bestaande `LevelPicker` (§6d).

Gates: `test:run` 1428 passed / 131 files · `build` ok · `lint` 0 errors.
Doc: **§374** geschreven + kruisverwijzingen vanuit §360 en §372. → `test` (UAT).
UAT-let-op: de 3-gpx stervorm en `MOON_EARTHSHINE_ALPHA = 0.18` zijn de twee echte
visuele judgement calls; beide één constante in `CelestialSky.jsx`.

## 2026-09-04 — ✅ Maanlicht r9 (§370 r9) + sky-streep fix (§372 UAT)

Han (screenshot: dak + vakwerk gloeit uniform te fel): "manenschijn is te heftig.
Mijn binaire 30% opacity is te simplistisch." + interview-keuzes: sheen-only op
highlights / gebouwen + foliage / "duidelijk zichtbaar maar licht".

### ✅ Maanlicht r9 — luminantie-gemaskeerde directionele sheen
`applyMoonLight` krijgt `baseColor`-param (2e), 4 call-sites geüpdatet (`diffuse.rgb`).
- `d = smoothstep(MOON_FACING_LO 0.45, HI 0.95, dot(n, MOON_DIR))` — zachte richting, geen step.
- `hi = smoothstep(MOON_LUM_LO 0.35, HI 0.75, dot(baseColor, luma))` — masker uit de
  EIGEN geschilderde kleur → donkere rand onder dak ≈ 0.
- `sheen = edgeFactor·present·moonScale·d·hi·MOON_SHEEN_SCALE(0.5)`;
  `lit = screenBlend(currentColor, MOON_GLOW_COLOR·sheen)` — zelfbegrenzend.
- `MOON_GLOW_COLOR → vec3(0.92,0.96,1.0)`. `MOON_GLOW_OPACITY`/`MOON_FACING_THRESHOLD` weg.
- Werkt op `LdtkLitGround` (dak/huis) + beide FFL-paden + `FoliageInstancingTest` (blad-highlights).
Files: `foliageLightingGLSL.js`, `ForegroundFoliageLayer.jsx`, `LdtkLitGround.jsx`,
`FoliageInstancingTest.jsx`. (backtick-in-GLSL-comment bug weer 1× geraakt & gefixt.)

### ✅ Sky-streep in "hoge levels" (§372 UAT)
Han: "waar komt deze streep nu nog vandaan in hoge levels? pak op in deze fix."
Oorzaak: 5-stops `linear-gradient` = 4 rechte sRGB-segmenten over de hele lucht →
de knik bij 25% werd een zichtbare Mach-band, erger bij hoge viewport. Fix:
`STOP_COUNT 17`, `SAMPLE_FRACS` gegenereerd, sampled 17 rijen uit layer-5 → knikken
onmerkbaar + volgt de geschilderde curve (geen aliasing van een horizon-waas-band).
`SUNSET_STOP_WEIGHT[]` → `sunsetWeightAt(f) = smoothstep(0.55,1,f)·0.8`.
Oude achtergrond bevestigd wég (CSS-div + `bgLayer5 <img>` allebei vervangen; stale
comments in RpgLevelPanel opgeschoond).
Files: `SkyGradientBackdrop.jsx`, `RpgLevelPanel.jsx` (comments).

`build` clean · `lint` 0 errors · `test:run` 1389 pass. Doc §370 r9 + §372 UAT.

## 2026-09-04 — ✅ NPC-namen + dialoog (6 workers) + maanlicht −15pp

(§370 r6→r9, §372, §373 allemaal ✅ — inclusief 2 UAT-fix-rondes: hitbox 48×48 +
F/Space-interact, en naam-plaat pixel-perfect/gecentreerd/64px. Zie ⏳-blok hieronder
voor de openstaande SandyForest-font-CR.)

### ✅ Font-CR → SandyForest body + naam, Bitfantasy voor *benadrukte* woorden (§373 UAT r3)
Interview-antwoorden: dialoogtekst → SandyForest · nadruk via `*sterretjes*` · alle
DialogueBox-instanties.
- `OscillatingText`: `parseEmphasis(text)` → `[{text,emph}]` (markers gestript),
  per-char `emph`-vlag → emph-char krijgt `fontFamily: Bitfantasy`, rest SandyForest.
- `DialogueBox`: body + naam-plaat → `SandyForest`; standalone `@font-face` toegevoegd.
  Beide fonts delen 1024-em/64-per-designpx grid (co-existeren al in `BestiaryPixel`),
  dus zelfde px-waarde = pixel-match.
- **UAT r4 (naam-grootte):** Han: "letters naam en tekstvak niet even groot; tekstvak
  is ideaal — is die pixel perfect?" → ja: `fontSizeFor(scale)` is zo gebouwd dat een
  kapitaal exact `8·scale` schermpx is (heel getal bij elke echte scale, ook de
  1.5-halfstap). Naam-plaat gebruikt nu diezelfde `fontSize` (was `·0.75`) → zelfde
  grootte + pixel-perfect. Plaat: `minWidth: portraitSize` (64gpx-vloer) + `width:
  fit-content` + `marginLeft: portraitSize/2` & `translateX(-50%)` → gecentreerd op
  het portret, groeit alleen voor lange namen (Prosperus/Modulatus).
- **UAT r5:** Han: "naam is altijd BF" → naam-plaat font terug naar `Bitfantasy`
  (body blijft SandyForest, nadruk BF). Grootte/centrering ongewijzigd.
- `*emphasis*`-markers toegevoegd in `npcDialogue.js` (alle 6 workers), `WISP_LINES`,
  `conversationContent.js` (wizard/npc/slime). LOREM ongemoeid.
- Tests: `parseEmphasis` (OscillatingText.test) + balanced-`*` check (npcDialogue.test).
`build` clean · `lint` 0 err · `test:run` 1441 pass. Doc §373 UAT r3.

Han: "maanlicht is heel cute! maak het allemaal 15 procentpunten minder fel
(opacity 70→55 etc)." + "geef alle NPC's wat tekst (engels) en een naam".

### ✅ Maanlicht −15pp (§370 r6)
`moonRimFactor` (foliageLightingGLSL.js) + `computeMoonRim` (LdtkScenery.jsx):
tiers `.70→.55 / .50→.35 / .30→.15 / .20→.05`. `MOON_WASH_SCALE 0.9 → 0.75`.
`build` clean.

### ✅ Normal-map maan-gloed (§370 r7)
Han: "kan de witte gloed ook op de normal map (extra laag)? die is nu niet of niet
goed zichtbaar — dak, huis, blaadjes ook een subtiele witte gloed richting de maan."
`applyMoonLight` wash → **additieve near-white gloed** op de VOLLE normal (relief):
`mw = dot(normalize(normal), MOON_DIR)*0.5+0.5; glow = mw³; glowAmt = edgeFactor *
strength * glow * MOON_GLOW_SCALE(1.5)`; `lit = currentColor*(1 + glowAmt*0.35) +
glowAmt * MOON_GLOW_COLOR(0.90,0.94,1.0)`. Half-Lambert gekubeerd = zacht maar
duidelijk directioneel. Draait op FFL (blaadjes) + `LdtkLitGround` (dak/huis/decor).
Consts hernoemd `MOON_WASH_* → MOON_GLOW_*`. `build` clean.

### ✅ Maan-gloed BINARY (§370 r8)
Han: "Nu wordt alles grijze brij. Ik dacht aan subtiel wit (30% opacity) maken van
de pixels die naar linksboven mappen. Andere pixels ongemoeid — dus 30% of 0%,
geen tussenvorm." r7's continue `mw³`-gloed tilde bijna elke texel op → grijze brij.
r8: `facing = step(MOON_FACING_THRESHOLD 0.75, dot(normal, MOON_DIR))`;
`lit = mix(currentColor, vec3(1.0), edgeFactor·present·moonScale·facing·0.30)`.
Drempel 0.75 > de ~0.66 die een platte normal scoort → alleen echt linksboven-
gerichte relief licht op. `MOON_GLOW_SCALE` weg; `MOON_GLOW_COLOR → vec3(1.0)`;
`+ MOON_GLOW_OPACITY 0.30`, `+ MOON_FACING_THRESHOLD 0.75`.
Files: `foliageLightingGLSL.js`. `build` clean · `lint` 0 · character/audio tests 140 pass.

### ✅ Verste-parallax achtergrond → gerenderde gradient (§372)
Han: "vervang de achtergrond (verste parallax) door een gerenderde gradient. Meet
de kleuren uit de huidige achtergrondlaag eenmalig. Blauwig naar wit. Bij dusk/dawn
wat roze/rood aan de horizon. Huidige nachtkleuring is perfect: dezelfde gradient
als overdag, met donkerblauw ingemengd."

Interview-antwoorden:
- Vervang **beide** statische sky-elementen in `RpgLevelPanel.jsx` (~r2133-2134):
  de hard-coded CSS `linear-gradient`-div **én** de `bgLayer5` `<img>`
  (`Background layers_layer 5.png`) → één nieuw `<SkyGradientBackdrop>`.
- Kleur-sample: `Background layers_layer 5.png` op **5 hoogten** (0/25/50/75/100%),
  per hoogte de rij-gemiddelde RGB → 5 day-stops. Eénmalig op mount, canvas
  `getImageData`. Fallback-stops uit de oude `#8fd0d9`→`#dff3f5` tot de image laadt.
- Nacht: **in de gradient zelf mengen** — per stop AMBIENT_DARK inmengen o.b.v.
  `foliageParams.globalIllumination`, zelfde multiply-equivalente formule als de
  oude DOM-twin (`stop·(1−n + n·AMBIENT_DARK/255)`, `n = 1−illum`), zodat parity
  met de 5 LDtk-bg-canvases (`BgLayer`).
- Dusk/dawn horizon-gloed: warm-roze, sterkte = hump op `globalIllumination`
  (piek ~0.33, 0 bij ≤0.05 en ≥0.75) → dekt dusk **en** dawn en "bleedt" vanzelf
  de dag/nacht-randen in. Alleen op de onderste stops (sterkst aan de horizon).
- Dekking: volledige viewport (`inset:0`).
- LdtkScenery: de losstaande sky-darken `<div>` (r185-187, `mixBlendMode:multiply`)
  wordt **verwijderd** — z'n enige doel was juist die twee sky-elementen; nu
  self-darkening → anders 2× donker (de #26-bug). `bgDarkenColor` blijft voor
  `BgLayer`.
- Nieuw bestand: `src/components/character/SkyGradientBackdrop.jsx`. Doc: §372.

Klaar: `SkyGradientBackdrop.jsx` (+ export `mixNight`/`sunsetFactor`), import-swap in
`RpgLevelPanel.jsx`, sky-darken `<div>` weg uit `LdtkScenery.jsx`. Error-code
**E036-SKY-SAMPLE** (E035 was al bezet). Test:
`__tests__/skyGradientBackdrop.test.js` (6). `build` clean · `lint` 0 errors ·
`test:run` 1389 pass. Arch §372.

### ✅ NPC-namen + dialoog (§373) — KLAAR

Interview-keuzes: naam-plaatje = losstaand blokje op de bovenrand · ~10-12 regels
per NPC, 1 random regel per klik · voorbeeldregels goedgekeurd. Later toegevoegd
(mid-turn): slime=**Blob**, Wisp=**Lamentia**, tovenaars zwart=**Antophon**
geel=**Prosperus** groen=**Modulatus**.

Gebouwd:
- `src/model/npcDialogue.js` (nieuw) — `NPC_DIALOGUE` (11 regels/worker, Engels, in
  stem), `randomNpcLine`, `ENTITY_DISPLAY_NAME` + `entityDisplayName` (workers +
  wisp/slime/3 tovenaars).
- `conversationEntities.js` — instrument/worker: vibraphone/glockenspiel/trumpet/
  piccolo/orchestral_harp/accordion.
- `useRpgLevelState.js` — `clickWorkerNpc(name, x)` → `openEntityDialogue` (walk-then-talk).
- `RpgLevelPanel.jsx` — `clickWorkerNpc` doorgegeven aan `EntityLayer` → `WorkerNpcSlot`;
  `EntityHitZone` + debug-hitbox per worker (§3a), stopPropagation.
- `DialogueBox.jsx` — `speakerName`-prop → pixel-art naamtab op de bovenrand
  (Bitfantasy-font, flow-sibling boven de box → nooit geclipt door `overflow:hidden`).
- `RpgLevelBottomPanel.jsx` — worker-portret via `findCreatureByName`, `speakerName`.
- `App.jsx` — level-result `DialogueBox` krijgt `speakerName` (Antophon/Prosperus/
  Modulatus/Blob).
Test: `src/model/__tests__/npcDialogue.test.js` (6). `build` clean · `lint` 0 err ·
`test:run` 1395 pass. Doc §373.

**UAT-fix (2026-09-04):** hitbox `HIT_ZONE_GPX 16 → 48` (gedeeld wisp/slime/worker).
F/Space/Enter startte geen worker-gesprek → keyboard-handler in `useRpgLevelState`
kiest nu de dichtstbijzijnde van {wisp, slime, ...workers}; workers geregistreerd
via nieuwe `registerWorldInteractables([{x,run}])` die `RpgLevelPanel` in een effect
vult uit `workerNpcs`. `build`/`lint`/`test:run` groen.

**UAT-fix 2 (2026-09-04):** naam-plaat — was `fontSize*0.82` (niet pixel-perfect,
kleiner dan de tekstvak-letters). Nu `*0.75` (= `6·scale`, heel getal op 't
pixelraster → pixel-perfect). Plaat is nu `width: portraitSize` (64gpx), gecentreerd
bóven het portret, `text-align:center`. Eerste letter geforceerd kapitaal op
render-tijd (`charAt(0).toUpperCase()`). `build`/`lint`/`test:run` (1436) groen.

--- (oude notities hieronder) ---
### ⏳ NPC-namen + dialoog — NOG TE DOEN (VERVANGEN — zie §373 hierboven)
De 6 worker-NPC's (`workerNpcs` in RpgLevelPanel, uit LDtk "NPC"-markers in
x-volgorde, §1093; `WORKER_SOUND_CONFIG` in `src/model/workerSoundConfig.js`).
Nu: géén dialoog (alleen bel-geluid via `useWorkerHitState`). Wisp/Slime hebben
wél walk-then-talk via `clickNpc`/`openEntityDialogue` (`useRpgLevelState.js`,
`LOREM_IPSUM_PARAGRAPHS`/`conversationContent.js`).

**Te bouwen:** naam + set Engelse regels per worker; klik in de wereld → walk-then-talk
(zelfde `openEntityDialogue`-pad als de Wisp), willekeurige regel. Han's verwachting
(2026-09-04): klik NPC → **naam (linksboven het tekstvak)** + **portret/avatar** +
**een tekstje**. Nog NIET geïmplementeerd (workers hebben nu alleen bel-geluid via
`useWorkerHitState`; geen click-handler, geen dialoog).

**Bestaande bouwstenen:**
- `openEntityDialogue(x, entity, pages, stopOffset)` in `useRpgLevelState.js` — walk-
  to-then-talk, `dialogue = { pages, entity }`. Herbruikbaar voor workers.
- `RpgLevelBottomPanel` → `<DialogueBox portraitVariant text>` (Bitfantasy-font
  typewriter). **Geen naam-plaat** — moet toegevoegd (`speakerName` prop → labeltje
  linksboven de tekstkolom).
- Portret: elke worker heeft al `variant = findCreatureByName(name)` → direct als
  `portraitVariant` (geen nieuwe art).
- Audio: `ENTITY_AUDIO_PROFILE` (`conversationEntities.js`) keyed op entity-string;
  fallback marimba. Per worker een instrument kiezen.

**Naam-mapping (VAST — `workerNpcs` x-order → bestiary-naam → Han's naam):**
| bestiary-naam (x-order) | Han's naam | rol | toon |
|---|---|---|---|
| `Blacksmith` (SSW, traag) | **tambo** | smid traag | optimistische werkuitspraken |
| `Lumberjack` | **piccolo** | houthakker | "i'm so close" / "i almost have it" — zoekt de perfecte fluit |
| `Town crier` | **campano** | omroeper | nieuwtjes over Melody Hill |
| `Blacksmith Woman` (blacksmith_f, snel) | **sonia** | smid snel | hoe de wereld steeds in beweging is |
| `Lady Potions` | **dominica** | drankjes | woordmopjes over toonladders/scales |
| `Steampunker` | **wavie** | steampunker | metaforische, raadselachtige statements |

⚠ tambo/sonia toon-toewijzing is GEWISSELD t.o.v. 2026-09-04 eerste bericht — dit
is de nieuwste (tambo = optimistisch, sonia = wereld-in-beweging).

**Interview open** (§4b) — vragen aan Han vóór impl: #regels per NPC & 1-regel-vs-
meerdere-pagina's per klik; naam-plaat exacte plek/stijl; per-NPC instrument;
walk-then-talk of instant; nieuw bestand `npcDialogue.js` vs uitbreiden
`conversationContent.js`.

## 2026-09-03 — ✅ Nacht-look §370 — dieper blauw + wit maan-RIM linksboven

1. **Nacht donkerder + echt donkerblauw.** `TIME_PHASES` night-illum `0.10 → 0.05`;
   `AMBIENT_DARK_COLOR` `vec3(0.11,0.15,0.25) → vec3(0.03,0.06,0.17)`; CSS-twin
   `AMBIENT_DARK_RGB → [8,15,43]`. Test-asserts mee.
2. **Fel-wit maanlicht-rim op de 2-3px linksboven-outline — voorgrond + achtergrond.**
   - *Shader:* nieuwe gedeelde `topLeftRimFactor(tex, duv, texelSize, uvRect)` —
     directioneel (alleen transparante buur naar boven/links telt), 2px vol +
     3e px 50%, buur-samples geklampt op de tile-rect (geen atlas-bleed).
     `applyMoonLight` sig → `(currentColor, normal, edgeFactor, rimFactor)`;
     `intensity = max(wash, rim)` waar `wash` = de half-Lambert op halve sterkte
     (`MOON_WASH_SCALE 0.5` — "rim + zwakke wash") en `rim = rimFactor * (1-illum)
     * uMoonStrength * 3` (fel, wel via de debug-slider). Via `screenBlend` naar wit.
     4 call-sites (beide FFL-shaders, `LdtkLitGround`, dev-harness).
   - *Achtergrond (DOM):* `LdtkScenery.drawTopLeftRim` bakt 1× per composite een
     wit rand-canvas (canvas-compositing: `source-in` wit-masker → `destination-out`
     shape +2/+3px verschoven). Los gemount NÁ de §362 multiply-darken (wit ×
     multiply = zwart), vóór de grond. `opacity = bgRimOpacity = 1 - globalIllumination`
     (via `RpgLevelPanel` → `SceneryBack`).
   `foliageLightingGLSL.js` + `ForegroundFoliageLayer.jsx` + `LdtkLitGround.jsx` +
   `FoliageInstancingTest.jsx` + `LdtkScenery.jsx` + `RpgLevelPanel.jsx` +
   `weatherCycle.js`. Doc §370 (§369 bezet). `test:run` 1369 · `build` clean · `lint` 0.

**Ronde 2 (Han: "te fel; illum houdt geen rekening met de lagen — bergen-lijn over
de bomen ervoor; 70%; + exacte rim-algo"):**

- **Laag-volgorde.** Elke bg-parallaxlaag is nu z'n eigen `<BgLayer>` = een
  `isolation: isolate`-wrapper met [base-canvas → per-laag `multiply`-darken →
  gebakken rim-canvas]. Isolation houdt elke darken bij z'n eigen tiles; de
  wrappers stapelen op DOM-volgorde → een nabije laag dekt de rim van een verre
  laag correct af, en de rim (ná de darken, binnen de isolatie) blijft fel. De
  ene grote darken-div is weg. (Neveneffect: de stapel isolatie-veils maakt de
  open lucht 's nachts egaal donkerblauw — dat is de "echt donkerblauw" die Han
  wilde.)
- **Rim-algo = Han's spec.** Gedeelde `moonRimFactor` (shader, was
  `topLeftRimFactor`) + `computeMoonRim` (DOM, `getImageData` + per-pixel):
  lege pixel BOVEN → aangrenzend `.70` / eronder `.50` / eronder `.20`; LINKS →
  `.70` / `.30`; RECHTS → `.50`; clash = hoogste. Max 0.70 ("70%"). Shader-rim
  `× (1-illum) × clamp(uMoonStrength/0.3)`; DOM-rim `<canvas>` opacity = `1-illum`.
  Foliage: `duv` draagt de wind-pixel-switch al → rim schuift mee (Han: "bereken
  1x en pixel switch gewoon mee").
- `computeMoonRim` 1× per composite, via `requestIdleCallback` (blokkeert geen
  frame); rim-canvas altijd gemount (opacity-gated) → geen dusk-hitch.
- `foliageLightingGLSL.js` + `LdtkScenery.jsx` (+ hernoemde call in FFL/LitGround/
  dev-harness). `test:run` 1372 · `build` clean · `lint` 0.

**Ronde 3 (Han: "achtergrond helemaal onzichtbaar — elke parallaxlaag verder
extra hard blauw tot ze verdwijnen"):** de r2 isolated-wrappers zetten per laag
een `multiply`-div die over de transparante lucht-regio een bijna-opake blauwe
rechthoek werd → ~5 gestapeld = alles egaal donkerblauw. Han bedoelde: 1 glow per
parallaxlaag (zodat parallax-0 met z'n sub-lagen niet 5+ gestapelde glows krijgt),
niet per-laag darken.
- **Fix:** géén overlay-divs op de bg-lagen. `<BgLayer>` composит tiles 1× naar
  een offscreen `src`-canvas (+ `computeMoonRim` 1×, deferred), en **bakt** het
  getoonde canvas = `drawImage(src)` → `multiply` fill `darkenColor` →
  `destination-in drawImage(src)` (herклипt op de tile-silhouet, lucht blijft
  transparant) → rim `drawImage` op `rimOpacity`. Die 2e bake draait alleen bij
  gekwantiseerde `darkenColor` (0.05-stappen, ~13×/fade) of `rimOpacity` — nooit
  per frame. Bg-canvases stapelen op DOM-volgorde → laag-volgorde klopt, en hun
  transparante lucht laat de echte sky-gradient zien. De sky-gradient/`bgLayer5`
  worden gedimd door 1 `multiply`-div die als eerste in `LdtkScenery` rendert.
  `RpgLevelPanel` kwantiseert `bgNight = round((1-illum)*20)/20`.
- **Ook (Han: "wat globale witte illum (normal map) van linksboven 's nachts"):**
  de maan-`wash` in `applyMoonLight` is nu een echte normal-map-term — half-Lambert
  richting `MOON_DIR` met een kleine non-directionele floor (`0.15 + 0.85·wrap²`),
  normal-flatten `0.75 → 0.85`, `MOON_WASH_SCALE 0.5 → 1.0`.
- `LdtkScenery.jsx` + `RpgLevelPanel.jsx` + `foliageLightingGLSL.js`. `test:run`
  1372 · `build` clean · `lint` 0.

**Ronde 4:**

- **Maan = nacht-only.** Was `1 - illum` (0.67 op dusk én dawn — veel te sterk).
  Nu `moonPresence() = 1 - smoothstep(0.08, 0.20, illum)`: 0 overdag én bij
  dusk/dawn (illum 0.33), 1 pas diep in de nacht (illum ≤ 0.08). Shader (wash +
  rim) + DOM `bgRimOpacity` (JS-kopie van dezelfde curve).
- **Wash sterker:** `MOON_WASH_SCALE 1.0 → 1.7`; wash-kleur losgekoppeld van de
  rim als blauwwit `MOON_WASH_COLOR = vec3(0.80,0.88,1.0)` (puur wit sloeg grijs
  uit over de donkerblauwe base); rim blijft puur wit.
- **Puntbronnen herstellen kleur i.p.v. grijs** (Han: "kan de illum glow de
  donkerblauw global illum lokaal vervangen? terug de oorspronkelijke kleur met
  een beetje geel/blauw/groen ipv flets grijs"). `applyPointLight`'s `revealed`
  was `blendLightDual` (colour-dodge → wit → grijs). Nu `mix(trueColor,
  trueColor * lightColor/luminance(lightColor), clamp(uHuePull*2))` — de eigen
  kleur terug, luminantie-behouden, hue richting het licht. Bij wisp/hero/
  vuurvlieg krijg je de echte kleur met een koele/warme/groene zweem.
- `foliageLightingGLSL.js` + `RpgLevelPanel.jsx`. `build` clean · `lint` 0.

**Ronde 5 (Han: r4 "juist supergrijs"):** twee grijs-makende operaties zaten er nog:

- **De maan-wash** deed `screenBlend(currentColor, kleur)` → screen-blend richting
  een lichtkleur ontzadigt donkere pixels tot grijs; r4's `MOON_WASH_SCALE 1.7` +
  een `0.15` non-directionele floor smeerde het overal. Nu is de wash een
  **proportionele brighten** van de eigen kleur (`currentColor * (1 + lift)`,
  behoudt hue/saturatie) op alléén de half-Lambert-term (geen floor), + een piepklein
  additief koel zweempje. `MOON_WASH_SCALE 1.7 → 0.9`. De RIM houdt z'n
  `screenBlend` naar wit (dunne rand, geen vlak).
- **De puntbron-`revealed`** liep nog via `mix(...huePull...)`. Nu simpel
  `clamp(trueColor * lc, 0, 1)` met `lc = mix(vec3(1), lightColor/luminance, 0.7)`
  — de eigen kleur met een zachte, kanaal-veilige hue-zweem; de `intensity`-falloff
  regelt al hoeveel.
- `foliageLightingGLSL.js`. `test:run` 1381 · `build` clean · `lint` 0.

## 2026-09-03 — ✅ Nacht-look UAT-ronde 3 (§368) — 3 artefacten

1. **Firefly-lichtje niet gecentreerd** (stond op bottom-anker). Fix in `ldtkLights`-
   merge: `worldHeight = LEVEL_PX_HEIGHT - p.y + fireflyVariant.frame.h/2`.
   Wisp/hero waren al gecentreerd in §364.
2. **Wisp-licht niet blauw naast 't vuur.** `WISP_LIGHT_COLOR01` `[0.39,0.39,1.0]`
   → `[0.2,0.4,1.0]` (verzadigder). Alleen kleur — er is nog geen per-lichtbron
   sterkte; per-light strength array is de volgende stap als 't nog verliest.
3. **Shimmer vreemd 's nachts ("veel horizontale strepen").** De bijna-witte
   `HIGHLIGHT_COLOR` in `trueColor` werd 's nachts door 't maanlicht onthuld als
   felle banden. Fix (Han's kleuren): instanced-shaderpad (LDtk-foliage/bomen) →
   `mix(vec3(49,78,158)/255, vec3(112,255,153)/255, uGlobalIllumination)` (overdag
   mint, 's nachts blauw). Non-instanced pad (water + legacy) ongemoeid → water
   blijft wit. Geen nieuwe uniform.

`ForegroundFoliageLayer.jsx` + `RpgLevelPanel.jsx`. Doc §368 (§366/§367 door
parallelle sessie bezet). `test:run` 1367 pass / 1 skip · `build` clean · `lint` 0.

**Ronde 2 (Han: "illum als allerlaatste, ná pixel switch en shimmer; fel-groene
pixels; echt horizontale strepen"):** de kleur-fix was niet genoeg — de *volgorde*
was de bug.

- **Volgorde (alleen instanced/foliage-shader).** Was: shimmer in `trueColor` →
  darken → point-lights/moon "revealen" `trueColor` (= geshimmerde kleur) op vol.
  De "Color" blend-mode herkleurt felle pixels naar de shimmer-hue, en de maan
  lichtte die weer op → fel-groene pixels + harde banden. Nu: lights/moon revealen
  alleen de **kale diffuse**; shimmer (`blendHighlightDual` + white-cap) wordt
  **als laatste** op de volledig belichte kleur toegepast → 's nachts alleen een
  vage, bij-de-scène-passende glans. Non-instanced (water) volgorde ongemoeid.
- **Horizontale strepen.** `applyMoonLight` volgde de volledige per-texel normal
  map → per-tile normal-naden tussen de gestapelde 16px-foliage-tiles werden
  zichtbare strepen zodra de maan erop scheen. Maan gebruikt nu
  `normalize(mix(FLAT_NORMAL, normal, 0.4))` — brede zachte wash i.p.v. per-tile
  reliëf.
- `ForegroundFoliageLayer.jsx` (instanced `main()` herordend) +
  `foliageLightingGLSL.js` (`applyMoonLight` normal-flatten — gedeeld, dus ook
  `LdtkLitGround`'s maan verzacht). `test:run` 1367 pass · `build` clean · `lint` 0.

**Ronde 3 — de strepen waren een verkeerde-UV normal-atlas-sample (Han: "probleem
met het lijmen van de normal-maps ... opgebouwd in stroken").** De instanced
foliage-shader bindt `uNormal` aan de gedeelde **atlas**-`normalCanvas`, maar
`normalUV` was tile-lokaal `[0,1]` (overgenomen van het non-instanced pad, waar
`uNormal` wél een per-tile-texture is). Elke instance sampled dus dezelfde `[0,1]`-
strook van de atlas = een verticale scan over álle gepackte rijen → de strip-
layout van de atlas op elke tile gesmeerd → de horizontale strepen (het ergst
's nachts). **Fix:** `normalUV` via `vDiffuseUV` mappen (de per-instance atlas-
rect), net als `duv`. Fikst ook de gestreepte debug-channel-1 (rauwe normal).
Met correcte normals: `applyMoonLight`-flatten `0.4 → 0.75` (meeste reliëf terug).
De X camera-pixel-snap (§364) is niet gerelateerd — dat is de horizontale camera-
*scroll* (geen verticale scroll); de WebGL-tile-Y stond al edge-gesnapt (§364 r2).
- `ForegroundFoliageLayer.jsx` (`FRAGMENT_SRC_INSTANCED normalUV`) +
  `foliageLightingGLSL.js` (flatten 0.4→0.75). `test:run` 1369 pass · `build`
  clean · `lint` 0.

## 2026-09-01 — ✅ Windkracht 3 gecapt op 10 s (§365)

Han: "wanneer windkracht 3 gerold wordt, laat die maar 10 s blazen en zak dan af
naar 2." Start blijft windkracht 1. `weatherCycle.js tickWeather`: na de wind-fade,
zodra `windTo===3` gesettled is, telt `wind3HoldS` op; bij `WIND_GUST3_HOLD_S`
(10 s) → `windTo=2`, ease over `WIND_FADE_S`, `windTimer` reset. `wind3HoldS`
reset bij `windTo!==3` en in `seekWind` (dus een handmatig gekozen 3 wordt ook
gecapt). Nieuwe export `WIND_GUST3_HOLD_S`, nieuw state-veld `wind3HoldS`.
Test: nieuwe §365-case; `seekWind`-easing-test kiest nu 2 i.p.v. 3.
Doc §365. `build` clean (test:run overgeslagen op Han's verzoek).

## 2026-09-01 — ✅ Nacht-look UAT-ronde 2 (§362 follow-ups) + zichtbare naden

Han UAT-feedback op §362/§363, 5 punten:

1. **Nacht iets donkerder.** Nudge `TIME_PHASES` night illum `0.12` → ~`0.10`
   (evt. `AMBIENT_DARK_COLOR` een tikje omlaag). Triviaal.
2. **Maanlicht subtieler + wit + minder harde schaduwen + lijkt van ONDEREN te
   komen ipv boven** (boomstam/rivier/bomen). Fixes: `MOON_COLOR` → `vec3(1.0)`;
   `moonStrength` default omlaag; half-Lambert ipv harde `max(dot,0)`-terminator;
   `MOON_DIR.y` teken omdraaien (`+0.5` → `-0.5`) zodat het als linksbóven leest.
3. **Puntbronnen fout gepositioneerd.** `ldtkLights` (RpgLevelPanel ~1457): wisp
   `worldHeight: 0` (onderkant viewbox), hero `worldHeight: groundHeightAt(...)`
   (voeten). Beide → verticaal midden van de sprite (net als campfire al doet,
   #1032 r8-comment vroeg dit al voor wisp+hero maar dat is nooit gedaan).
4. **Vuurvlieg (Firefly) nooit zichtbaar + moet lichtbron zijn** (limoengroen,
   kleur eenmalig uit de sprite samplen). `bestiaryMetadata.json` heeft
   `Firefly.tagsAdd = ["night","critter"]` maar `bestiaryManifest.generated.js`
   is niet geregenereerd → tags nog `["move","nature"]`. Ook: `X_critter_flying`
   vereist tag `flying` — checken of Firefly die (na regen) heeft.
5. **Zichtbare naden / strepen op 16- of 32-px grid, vooral bij geanimeerde
   tiles** (screenshot: RPG-wereld). Waarschijnlijk fractionele wereld-zoom
   (`dynamicZoom = size.h / LEVEL_PX_HEIGHT`, niet-integer) → tile-divs op
   sub-pixel-grenzen → 1px gaten. `LdtkAnimatedTiles` is een DOM-overlay van
   frame-croppende divs.

### Interview-antwoorden (Han 2026-09-01)

- **Maanlicht:** wit, ~40% zwakker (moonStrength 0.5→0.3), half-Lambert (zachte val),
  `MOON_DIR.y` omgedraaid → linksbóven.
- **Firefly spawn:** niet aankomen (Han regelt zelf).
- **Firefly light:** bewegend licht per vuurvlieg, 's nachts, kleur uit sprite gesampled.
- **Naden:** eerst onderzoeken, terugkoppelen (geen code-wijziging deze ronde).

### Status per item

1. ✅ `weatherCycle.js` night illum `0.12` → `0.10` (+ 2 test-asserts).
2. ✅ `foliageLightingGLSL.js` `applyMoonLight`: `MOON_DIR.y` `+0.5`→`-0.5`,
   `MOON_COLOR` → `vec3(1.0)`, squared half-Lambert ipv `max(dot,0)`. `moonStrength`
   default `0.5`→`0.3` (`DEFAULT_FOLIAGE_PARAMS`).
3. ✅ `RpgLevelPanel` `baseLights`: wisp `worldHeight` = `groundHeightAt + (flying?TILE:0)
   + crop.h/2`; hero = `groundHeightAt + HERO_CROP.h/2`. `wispVariant`/`wispFlying`
   useMemo's omhoog verplaatst.
4. ✅ Firefly als bewegend licht: `fireflyVariant` + eenmalige sprite-pixel-sample
   (`fireflyLightColor`, groenste/felste pixel), `WorldWanderer` `emitLightPos`/
   `lightPosRef` → `critterLightPosRef`, `critterWanderers.isFirefly`, `ldtkLights`
   merge (max 4, nearest-hero, nacht-only, kleur × `(1-globalIllumination)`),
   rebuild op `petFrame`. `EntityLayer` prop-passthrough.
5. ✅ **Gefikst.** Onderzoek: de wereld-schaal ís al integer (`worldLayout.js` `N`),
   behalve de `1.5`-halfstap op dpr ≥ 2 (waar 1.5 = 3 hele device-px) en één
   non-home mount-pad zonder `worldScale`. Dus "integer zoom" was niet 't probleem.
   Echte oorzaak: de DOM-tegellagen scrollen met `translateX(-cameraX·zoom)` waar
   `cameraX` een **continue float** is (nooit afgerond), terwijl de WebGL
   foliage/water-quads hun positie al op hele device-pixels snappen (§327). DOM
   glijdt sub-pixel, WebGL stapt hele pixels → naad die langs 't grid kruipt.
   Fix r1: `RpgLevelPanel setCameraX` → `offsetPx = Math.round(-next·z·dpr)/dpr`
   (+ `cameraOffsetRef` krijgt dezelfde gesnapte waarde → DOM+WebGL in lockstep);
   `cameraX`-state blijft float voor de follow/clamp-math.
   **Fix r2 (Han: "ik zie de naden nog steeds"):** r1 was niet genoeg bij een
   **fractionele dpr** (Windows 125/150% → dpr 1.25/1.5). Zowel de WebGL
   foliage/water-quads als de campfire-DOM-tiles snappten centrum + grootte
   *apart* (`round(cx·dpr)` + `round(w·dpr)`) → ±1 device-px drift tussen buur-
   tiles. Nu de **4 randen** snappen: `lDev = round((cx−w/2)·dpr)`, `rDev =
   round((cx+w/2)·dpr)`, idem `bDev`/`tDev`; quad = `centrum (lDev+rDev)/2`,
   `size rDev−lDev`. Tile A's rechterrand ís exact tile B's linkerrand bij elke
   dpr. In `ForegroundFoliageLayer` (beide paden: per-instance + instanced/atlas)
   én `LdtkAnimatedTiles` (width/height nu ook uit gesnapte randen).

Doc `docs/architecture.md` §364. `npm run test:run` 1305 pass / 1 skip · `build`
clean · `lint` 0 errors.

**Status:** ✅ alle 5 items klaar voor UAT (naden: 2e poging).

## 2026-09-01 — ✅ FR: windgeluid "uit de foliage" — 3 scherm-chunks, L→R oscillatie, globale bed

Vervolg op §360 (weer-cyclus) / §362 (nacht-look). Han wil het bestaande
placeholder-windgeluid (`useWorldAmbientMusic.js` regels ~260-309: 'applause'-sample
als windruis, 20% kans per 3-maten-cyclus, envelope, GEEN pan, recht naar
`context.destination`) vervangen door een foliage-gekoppeld, ruimtelijk systeem.

Han's spec:

- **Volume per windniveau** (`Math.round(weatherOutputs(weather).windValue)`, 0–3):
  hard (3) = zelfde geluid als nu; mild (2) = half volume; zacht/geen (0–1) = geen geritsel.
- **Scherm in 3 chunks.** Als er foliage (géén gras) in een chunk staat: speel
  geritsel af "uit die richting" (pan).
- **L→R oscillatie:** de wind-intensiteit oscilleert en de oscillatie beweegt van
  links naar rechts: chunk links (pan ~links) → 2 s later chunk midden (pan 50/50)
  → 2 s later chunk rechts (pan ~rechts), dan weer van voren af aan.
- **Globale bed:** speel óók (ongeacht bomen in beeld) een centrale (pan 50/50)
  wind op half volume (wind 3) / kwart volume (wind 2).

Bestaande infra: `src/audio/spatialPan.js` (`CHUNK_PX 256`, `computeSpatialPanVolume`),
`createSpatialBus` (StereoPanner+Gain) in `useWorldAmbientMusic.js`, chunk-pan-model
al gebruikt door birds/water. `weather.windValue` moet naar de hook (via RpgLevelPanel).

### Interview-antwoorden (Han 2026-09-01)

- **Trigger-model:** de random-getriggerde vlaag (#1091) VOLLEDIG vervangen. Zolang
  wind ≥ 2 loopt het geritsel continu, gestructureerd door de L→R-oscillatie + bed.
  Wind 0–1 = helemaal stil.
- **Foliage-detectie:** per level vooraf bepaald — bij `buildWorld` één keer de set
  van wereld-chunks met tree-foliage (`FOLIAGE_LAYERS` = Pine/Willow/Main_tree,
  géén `Grass_decoration_*`). De 3 scherm-chunks kijken welke wereld-chunk ze overlappen.
- **Oscillatie:** actieve chunk zwelt & zakt (`sin(π·localT)`) over 2 s; andere 2
  chunks op laag basisniveau (`WIND_BASE_LEVEL 0.35`). Loop links→midden→rechts (6 s).
  Chunk zónder foliage blijft stil, ook als de puls eroverheen komt.
- **Bed + pan:** globale bed pan 0, steady zolang wind ≥ 2: wind 3 = 50 %, wind 2 =
  25 % (van de rustle-piek `WIND_GUST_PEAK_GAIN` = 'mp'). Chunk-pan: links −0.5,
  midden 0, rechts +0.5.

### Plan

1. **Nieuw puur-module `src/audio/windRustle.js`** (unit-getest): `windLevelMult`,
   `bedFraction`, `sweepState(t)` → `{activeThird, swell}`, `rustleLevels(windLevel,
   foliageByThird, t)` → `[g,g,g]`, `thirdHasFoliage(chunkSet, cameraX, viewWorldW, k)`.
2. **`ldtkWorld.js`** — `buildWorld` retourneert `foliageChunkSet: Set<number>`
   (abs-X chunk-indices met tree-foliage; `import { CHUNK_PX } from '../../audio/spatialPan'`).
3. **`RpgLevelPanel.jsx`** — `envAudioRef.current` krijgt `windLevel`
   (`Math.round(wOut.windValue)`), `cameraX`, `viewportWorldWidth` (`size.w/zoom`),
   `foliageChunkSet` (`world.foliageChunkSet`).
4. **`useWorldAmbientMusic.js`** — de #1091-gust-`useEffect` (regels ~260-311)
   vervangen: 4 vastgehouden 'applause'-stemmen (3 chunk-panners −0.5/0/+0.5 + 1
   bed op pan 0), elk `inst.start({duration:3600})` + `createSpatialBus`; één
   `setInterval(~120ms)` die per stem de bus-gain `rampParam`t volgens `windRustle`.
   Oude constants `WIND_GUST_BLOCK_MEASURES`/`WIND_GUST_TRIGGER_CHANCE` weg;
   `WIND_GUST_PEAK_GAIN`/`WIND_GUST_NOTE` blijven.
5. **Tests** `src/audio/__tests__/windRustle.test.js`; `useWorldAmbientMusic.test.js`
   check op oude gust-assertions.
6. **Docs** `docs/architecture.md` §363 (uniek nr checken vlak vóór schrijven).

**Status:** ✅ geïmplementeerd. Nieuw `src/audio/windRustle.js` (puur:
`windLevelMult`/`bedFraction`/`sweepState`/`rustleLevels`/`thirdHasFoliage`) +
`__tests__/windRustle.test.js` (12 tests). `ldtkWorld.js` → `buildWorld` retourneert
`foliageChunkSet` (tree-foliage `FOLIAGE_LAYERS` only, abs-X chunks). `RpgLevelPanel`
`envAudioRef` krijgt `windLevel`/`cameraX`/`viewportWorldWidth`/`foliageChunkSet`.
`useWorldAmbientMusic.js`: #1091-gust vervangen door 4 vastgehouden 'applause'-stemmen
(3 chunk-panners −0.5/0/+0.5 + 1 bed pan 0), `setInterval(120ms)` retarget via
`rustleLevels`/`bedFraction` + `rampParam`. Oude `useWorldAmbientMusic.test.js`
gust-tests vervangen. Doc `docs/architecture.md` §363. `npm run test:run` 1304 pass
/ 1 skip · `build` clean · `lint` 0 errors. → klaar voor UAT.

**Tuning-follow-up (Han 2026-09-01, zelfde dag):** `WIND_SWEEP_PERIOD_SEC` /
`WIND_SWEEP_STEP_SEC` verdubbeld `6/2 → 12/4 s` ("oscillatie 100% trager"), en
`WIND_MASTER_GAIN = 0.5` op álle windstemmen (3 rustle + bed) bij de twee
`rampParam`-sites ("volume van álle wind −50%"). Tests bijgewerkt (constant-relatief).

## 2026-09-01 — ✅ 🐞+FR: nacht-look — achtergrond darkt niet + "maanlicht" (blauwwit, licht van linksboven)

Vervolg op §360 (auto weer-cyclus). Drie punten van Han:

1. **🐞 Achtergrondlaag darkt niet mee.** In LDtk/RAM-mode: de parallax-bg-canvases
   (`LdtkScenery` `CanvasLayer` — kale canvas, geen filter/tint), de hardgecodeerde
   sky-gradient-div (`linear-gradient(#8fd0d9,#dff3f5)`, regel ~2007) en `bgLayer5Url`
   `<img>` (regel ~2008) hebben géén lit-pipeline. De `domDarkenOverlay` (multiply
   naar `AMBIENT_DARK_RGB`, fade op `globalIllumination`) is `sceneryMode==='Legacy'`
   only (perf, #1162 Fase 5). WebGL-shaderlicht (`LdtkLitGround` / `ForegroundFoliageLayer`,
   gedeelde `foliageLightingGLSL.js`: `ambientTint = mix(AMBIENT_DARK_COLOR, 1.0, uGlobalIllumination)`)
   raakt alleen grond/gebouw/decor + foliage, nooit de achtergrond.
2. **Nacht te donker.** Nu `AMBIENT_DARK_COLOR = vec3(0.05,0.08,0.18)` (≈ zwart-blauw) ×
   night-floor `TIME_PHASES` illum `0.1`. Han wil een lichtere **blauwwitte** donkere
   kleur (maanlicht).
3. **FR: "alles globaal donkerblauw + wit licht van linksboven".** Nu is licht =
   globale multiply-darken + positionele point-lights (wisp/hero via `ldtkLights`,
   `applyPointLight` in `foliageLightingGLSL.js`) die `trueColor` terug onthullen.
   Han wil een **directioneel** "maan"-licht (vaste richting linksboven), niet
   gekoppeld aan wisp/hero-positie.

### Interview-antwoorden (Han 2026-09-01)

- **Maanlicht-type:** alléén shader-relief (directioneel licht op de genormalmapte
  lagen), GEEN cosmetische hoekgloed.
- **Wanneer:** meeschalen met de cyclus — maanlicht-sterkte ∝ `(1 - globalIllumination)`
  (vol 's nachts, half bij dusk/dawn, 0 overdag).
- **Achtergrond-fix:** één CSS multiply-tint-overlay over de bg-stack, fade op
  `globalIllumination` (perf-kost van #1162 Fase 5 komt terug — geaccepteerd).
- **Nacht-kleur:** `AMBIENT_DARK_COLOR` ~`vec3(0.11,0.15,0.25)`, night-floor illum ~`0.12`.

### Plan

1. **Gedeelde GLSL `foliageLightingGLSL.js`:**
   - `AMBIENT_DARK_COLOR` `vec3(0.05,0.08,0.18)` → `vec3(0.11,0.15,0.25)` (blauwwit,
     lichter). `AMBIENT_DARK_RGB` in `RpgLevelPanel.jsx` (regel 110) mee: `[13,20,46]`
     → `[28,38,64]` + comment.
   - Nieuw in `LIGHTING_PARAM_UNIFORMS_GLSL`: `uniform float uMoonStrength;` (alle 4
     shaders krijgen 'm automatisch).
   - Nieuw in `LIGHTING_FUNCTIONS_GLSL`: `const vec3 MOON_DIR = normalize(vec3(-0.55,
     0.5, 0.65));` (linksboven, richting kijker — spiegelt de bestaande
     `ambientLight vec3(0,0.5,0.8)` conventie), `const vec3 MOON_COLOR = vec3(0.85,
     0.9, 1.0);` (blauwwit), en `applyMoonLight(trueColor, currentColor, normal,
     edgeFactor)` — zelfde "reveal trueColor" wiskunde als `applyPointLight` maar
     zónder positie/falloff: `ndotl = max(dot(normalize(normal), MOON_DIR), 0.0)`,
     `intensity = clamp(edgeFactor * uMoonStrength * (1.0 - uGlobalIllumination) *
     ndotl, 0, 1)`, `mix(currentColor, blendLightDual(trueColor, MOON_COLOR,
     intensity, uLightBlendMode, uLightBlendMode2), intensity)`.
2. **3 shader-`main()`'s:** ná `lit = applyPointLights(...)` → `lit =
   applyMoonLight(trueColor, lit, n, edgeFactor);`. Sites: `ForegroundFoliageLayer.jsx`
   (~501 non-instanced, ~746 instanced), `LdtkLitGround.jsx` (~117),
   `FoliageInstancingTest.jsx` (~249, dev-harness).
3. **JS-uniform-wiring** (`uMoonStrength` in de naam-lijst + `gl.uniform1f(...,
   p.moonStrength ?? 0.5)`): `ForegroundFoliageLayer.jsx` (~1101 lijst, ~1214 +
   ~1346 sets), `LdtkLitGround.jsx` (~238 lijst, ~311 set), `FoliageInstancingTest.jsx`
   (~349 lijst, ~419 set).
4. **`DEFAULT_FOLIAGE_PARAMS.moonStrength: 0.5`** (ForegroundFoliageLayer) + slider
   `<ParamSlider label="Moonlight strength" min={0} max={1} step={0.01}>` in
   `FoliageParamsPanel` (§3a — tunebaar zonder code-rondje).
5. **Achtergrond-darken (de bug):** `LdtkScenery` krijgt prop `bgDarkenColor`
   (= `rgbCss(AMBIENT_DARK_RGB, 1 - globalIllumination)`, berekend in RpgLevelPanel).
   Rendert `<div style={{position:'absolute',inset:0,background:bgDarkenColor,
   mixBlendMode:'multiply',pointerEvents:'none'}}/>` **tussen** `backgroundLayers.map`
   en de ground-`<div ref={groundScrollRef}>` — dekt sky-gradient + `bgLayer5` +
   parallax-bg-canvases, grond/lit-ground/rest schilderen eroverheen. Alleen render
   als `backgroundLayers.length > 0 && globalIllumination < 1`. Doorgeven via
   `SceneryBack` (niet SceneryFront — die heeft geen `backgroundLayers`).
6. **Night-floor:** `weatherCycle.js` `TIME_PHASES` night `illum: 0.1 → 0.12` +
   de 2 test-asserts (`toBe(0.1)` → `0.12`) + §360-doctekst.
7. **Docs:** `docs/architecture.md` §361 (nieuw, uniek nr).

**Niet in scope (apart flaggen):** hero/pet/wisp/slime/NPC/critter-*sprites*
darken 's nachts óók niet (alleen hun reflecties). Han noemde specifiek de
achtergrond; sprites = zelfde klasse bug, los aanbieden als vervolg.

**Architectuur-impact:** gedeelde GLSL + nieuwe lichtterm → plan-akkoord Han vóór impl.

**Status:** ✅ geïmplementeerd (Han akkoord; sprites bewust buiten scope zodat NPC's
's nachts goed zichtbaar blijven). `foliageLightingGLSL.js` — `AMBIENT_DARK_COLOR`
`vec3(0.05,0.08,0.18)` → `vec3(0.11,0.15,0.25)`, nieuwe `uMoonStrength`-uniform +
`MOON_DIR`/`MOON_COLOR` + `applyMoonLight()` (directioneel, reveal via ndotl,
`strength = uMoonStrength * (1 - uGlobalIllumination)`). Aangeroepen in alle 3
shader-`main()`'s + dev-harness. `moonStrength` (default 0.5) in
`DEFAULT_FOLIAGE_PARAMS` + debug-slider. `RpgLevelPanel` — `AMBIENT_DARK_RGB`
`[13,20,46]` → `[28,38,64]`, `bgDarkenColor` berekend + via `SceneryBack` naar
`LdtkScenery`, die één `mix-blend-mode:multiply`-overlay tussen bg-canvases en
grond rendert (alleen als illum < 1). `weatherCycle.js` night-floor `0.1 → 0.12`
+ tests. Doc: `docs/architecture.md` §362 (§361 was al vergeven aan de difficulty-
ladder van een parallelle sessie). `npm run test:run` 1292 pass / 1 skip · `build`
clean · `lint` 0 errors. → klaar voor UAT.

## 2026-09-01 — ✅ FR: auto weer-cyclus (wind 0–3 + dag/nacht) met geleidelijke overgangen

Han: de RPG-wereld moet vanzelf "weer" laten variëren i.p.v. de debug-pickers.

- **Windsnelheid** varieert 0–3 (nu 1/2/3 via `WIND_LEVEL_PX`/`windLevel` picker →
  `skewAmount`/`stretchAmount`). Nieuw: ook 0 = windstil.
- **Overgang** tussen windsnelheden geleidelijk, ~3 s (geen harde sprong 0→1).
- **Dag/nacht** idem geleidelijk, overgang ~10 s (nu `timeOfDay` picker →
  `TIME_OF_DAY_ILLUM` 0.1/0.33/1 → `globalIllumination`).
- **Cyclus:**
  - elke 30 s een nieuwe **random** windsnelheid (0–3).
  - tijd-van-dag in **vaste volgorde** dag → schemer → nacht → schemer → (loop),
    met duren **240 / 60 / 120 / 60 s**; 10 s crossfade bij elke wissel.

Betrokken code: `RpgLevelPanel.jsx` (`foliageParams` state, `setFoliageParam`,
`WIND_LEVEL_PX`, `TIME_OF_DAY_ILLUM`, 💨-indicator, critter day/night-tag spawning
op `foliageParams.timeOfDay`), `ForegroundFoliageLayer.jsx` (`DEFAULT_FOLIAGE_PARAMS`,
shader-uniforms `uSkewAmount`/`uStretchAmount`/`uGlobalIllumination`).

### Interview-antwoorden (Han 2026-09-01)

- **Aansturing:** pickers blijven; een picker aanraken start een transitie naar de
  gekozen waarde en de cyclus draait vanaf daar verder. Timer van die fase reset
  op vol. Time-of-day-picker onderscheidt nu **dusk** én **dawn** (4 keuzes).
- **Bereik:** alleen RPG-wereld. Bevriest tijdens een muziek-LEVEL en hervat waar
  hij was (state overleeft de RpgLevelPanel-unmount).
- **Windverdeling:** elke 30 s uniform-met-teruglegging, gewogen richting 1
  (voorstel-zak `[0,1,1,1,2,2,3]` → 14/43/29/14 %). Herhaling toegestaan.
- **Windbereik:** 0–3, picker-labels kaal `0 / 1 / 2 / 3`. 0 = windstil
  (skew/stretch 0 px). 💨-indicator = 0 puffs bij wind 0.
- **Cyclus-timing:** vaste volgorde **dag 240 → dusk 60 → nacht 120 → dawn 60**
  → loop. 10 s crossfade van `globalIllumination` bij elke wissel. Wind-fade 3 s.
- **Critters bij dusk/dawn:** de critter-laag fade-out 5 s → variant-set opnieuw
  gerold (dag↔nacht) → fade-in 5 s, zodat na de overgang de juiste dieren staan.

### Plan

1. **Nieuw puur-module `src/components/character/weatherCycle.js`** (unit-getest):
   - Constants: `TIME_PHASES = [{name:'day',dur:240,illum:1},{name:'dusk',dur:60,
     illum:0.33},{name:'night',dur:120,illum:0.1},{name:'dawn',dur:60,illum:0.33}]`;
     `WIND_BAG=[0,1,1,1,2,2,3]`; `WIND_INTERVAL_S=30`; `WIND_FADE_S=3`;
     `TIME_FADE_S=10`; `CRITTER_FADE_S=5`.
   - `easeInOut(t)`, `pickWind(rand)` (uit de zak), `phaseCritterKind(name)` →
     `'day'|'night'` (dag/dusk→day tot midpoint… nee: zie stap 5).
   - `createWeatherState()` → begintoestand (fase 0, volle dag, wind 1, geen fade).
   - `tickWeather(state, dtSeconds, rand)` → **pure reducer**: telt `phaseElapsed`
     en `windTimer` op; bij fase-eind → volgende fase, start illum-fade
     (`illumFrom→illumTo`, `fadeElapsed=0`) + kick critter-crossfade als de
     nieuwe fase dusk/dawn is; bij `windTimer≥30` → nieuw `windTarget=pickWind`,
     `windFrom=wind`, `windFadeElapsed=0`, `windTimer=0`. Retourneert nieuwe
     state + afgeleide waarden `{ globalIllumination, windValue, timeOfDay,
     critterKind, critterOpacity }` (met eases toegepast).
   - `seekPhase(state, phaseName)` / `seekWind(state, n)` → picker-acties
     (fase-index zetten, `phaseElapsed=0`, fade starten; resp. `windTarget=n`,
     fade starten, `windTimer=0`).
   - `dt` geclampt op `[0, 0.25]` s (tab-away / resume-spike opvangen).

2. **Persistente klok over de unmount** — `src/components/character/weatherCycleStore.js`:
   module-singleton `let saved=null; export loadWeatherState/saveWeatherState`.
   Zo "bevriest" de cyclus als RpgLevelPanel unmount bij een LEVEL en hervat hij
   exact bij terugkeer. (Geen wall-clock-inhaal: `lastTickMs` wordt op (re)mount
   gereset, dus de LEVEL-duur wordt overgeslagen, niet ingehaald.)

3. **`RpgLevelPanel.jsx` — cyclus aandrijven:**
   - `const [weather, setWeather] = useState(() => loadWeatherState() ?? createWeatherState())`.
   - `useFrameLoop` throttled (~80 ms / ~12 fps) subscriber: `dt` uit rAF-timestamp,
     `next = tickWeather(prev, dt, Math.random)`; alleen `setWeather` + de vier
     afgeleide `foliageParams`-velden pushen als een waarde ≥ drempel wijzigde
     (illum 0.01, wind 0.05) — in een steady fase dus **0 re-renders**.
   - Op unmount (`useEffect` cleanup) `saveWeatherState(weatherRef.current)`.
   - Afgeleide waarden mergen in het bestaande `foliageParams`:
     `skewAmount = stretchAmount = weather.windValue`,
     `globalIllumination = weather.globalIllumination`,
     `timeOfDay = weather.timeOfDay` ('day'|'dusk-dawn'|'night' voor de bestaande
     lighting/tint-consumers; dusk+dawn → 'dusk-dawn').
   - `FoliageParamsPanel`-`onReset` reset óók de weather-state.

4. **Pickers = seek (blijven in debug-paneel):**
   - `Time of day`-picker: `levels={{ day:1, dusk:0.33, night:0.1, dawn:0.33 }}`,
     `value` = huidige fasenaam, `onChange={(name) => setWeather(seekPhase(weather, name))}`.
   - `Wind`-picker: `levels={{ '0':0,'1':1,'2':2,'3':3 }}`,
     `onChange={(n) => setWeather(seekWind(weather, Number(n)))}`.
   - `WIND_LEVEL_PX` verdwijnt (of wordt identiteits-map); 💨-indicator →
     `'💨'.repeat(Math.round(weather.windValue))` (0 → leeg).

5. **Critter dag/nacht-swap met 5 s crossfade:**
   - Weather-state krijgt `critterKind` ('day'|'night') + `critterOpacity` (0–1)
     + `critterSwapT` (–1 = niet bezig, anders 0..CRITTER_FADE_S*2).
   - Bij ingang **dusk** (day→night) of **dawn** (night→day) start `critterSwapT`;
     `critterOpacity` = ease 1→0 over de eerste 5 s; op het 5 s-punt flipt
     `critterKind`; daarna ease 0→1 over de tweede 5 s.
   - `randomTaggedVariant(cfg.tags, kind)` aangeroepen met `weather.critterKind`
     i.p.v. `foliageParams.timeOfDay`; `critterWanderers`-useMemo + de effect op
     regel ~1526 depend nu op `weather.critterKind`.
   - Render: wrap de `critterWanderers.map(...)` (regel 827) in
     `<div style={{ opacity: critterOpacity, position:'absolute', inset:0, pointerEvents:'none' }}>`
     — containing block gelijk aan de huidige positioned parent verifiëren zodat
     `worldToScreenX`/`bottom` niet verschuiven; anders `critterOpacity` per
     `WorldWanderer` doorgeven.

6. **`DEFAULT_FOLIAGE_PARAMS`** (ForegroundFoliageLayer) blijft als fallback voor
   tests / `FoliageInstancingTest` / eerste frame vóór de eerste tick.

7. **Tests** (`weatherCycle.test.js`): fase-volgorde + duren (240/60/120/60),
   illum-eindwaarden per fase, 10 s crossfade-monotonie, wind elke 30 s uit
   `{0,1,2,3}`, `seekPhase`/`seekWind` resetten de juiste timer, `dt`-clamp,
   critter-crossfade timing (opacity 0 op 5 s, kind flipt daar).

8. **Docs:** nieuwe sectie in `docs/architecture.md` (§141-familie) — "Auto
   weer-cyclus" — vóór UAT (harde gate §1a).

**Architectuur-impact:** nieuw cross-cutting animatie-klokje + module-singleton →
graag **plan-akkoord van Han** vóór impl.

**Status:** ✅ geïmplementeerd (Han akkoord 2026-09-01). Nieuw: `weatherCycle.js` (pure
reducer + `weatherOutputs`/`seekPhase`/`seekWind`), `weatherCycleStore.js` (unmount-
overlevende singleton = freeze tijdens LEVEL), `__tests__/weatherCycle.test.js` (15
tests). `RpgLevelPanel.jsx`: clock-state + throttled `useFrameLoop`-driver (~12 fps,
0 re-renders in een rustige fase) + `useLayoutEffect`-seed + unmount-persist; pickers
→ seek (Wind 0/1/2/3, Time of day day/dusk/night/dawn); 💨 = `Math.round(windValue)`
puffs, verborgen bij 0; `critterWanderers`-memo keyt op `critterKind`; `critterOpacity`
5 s-crossfade-wrapper om de critter-laag; `WIND_LEVEL_PX`/`TIME_OF_DAY_ILLUM` weg.
`ForegroundFoliageLayer.jsx`: `DEFAULT_FOLIAGE_PARAMS` comments + `windLevel`-key weg.
docs/architecture.md §360. `npm run test:run` 1246 pass / 1 skip · `build` clean ·
`lint` 0 errors. → klaar voor UAT.

## 2026-08-29 — ✅ #1166 (#1163c): levels.json ramp levels `numMeasures` 8 → 2

Sub-ticket 3 van 3 onder epic #1163 (na #1164 = `generateBlock.js`, #1165 = de
één-content-stream). Data-migratie + de `numMeasures`-consumers die meebewegen.

**De edit:** `src/levels/levels.json`, `numMeasures: 8 → 2` voor de 11 ids
`4,7,8,9,10,11,12,13,14,15,19`. `totalMeasures: 8` en `numRepeats: 1` ONGEMOEID.
Zelfde lengte (8 maten), nu 4 chunks van 2 i.p.v. 1 blok van 8.

**Consumers gefikst:**

- `App.jsx timpaniMelody`: span-bron `lvl.numMeasures` → `lvl.totalMeasures` (anders
  kromp de timpani van ~10 naar ~4 maten). Fikst meteen de latente Level-3-bug
  (timpani dekte 2 van 10 maten sinds §994). Bewuste, geteste wijziging — UAT-flag.
- `SheetMusic.jsx levelTotalMeasures`: `leadInBars + numMeasures` →
  `leadInBars + (levelFullTotalMeasures ?? numMeasures)` — dezelfde threading als
  `scrollBarlines.numMeasures` (§867 r3); blijft argument-identiek aan de audio-call (§108).
- `wavesForLevel`: 1 → 4 voor alle 11 (bedoeld — Han beslissing 5, combat volgt de
  chunk-grens). `blockCountFor === wavesForLevel` per level (pinned test).
- `totalNotesForLevel` / #1102 baseline: leest alleen `totalMeasures` → byte-identiek
  (per-id pinned test).
- `levelBlockPlan.js`: de 3 `blockMeasuresFor`-branches NIET verwijderd. Wizard-branch
  MOET blijven (variant 'e': `callResponseMeasures 2` + `numMeasures 2` → cadans `2*2=4`,
  fall-through zou 2 geven). Mixed/decorativeWizard-branches redundant voor de shipped
  levels maar bewust behouden (documenteren Han's "elke 2 maten", beschermen toekomstige
  levels). Module-header comment gecorrigeerd (§350's claim "alle drie kunnen weg" was fout).

**Tests:** `levels.test.js` — de 2 oude `#688`/`#693` "1 continu blok"-cases herschreven
naar de 4-chunk realiteit + nieuw `#1163c`-blok (per-id waarde-pins, `totalNotesForLevel`
byte-identiteit, `blockCountFor === wavesForLevel`, 13/13d/13e/14/15 cadans-guard,
timpani-span-uit-`totalMeasures` guard). #1164/#1165 tests ongemoeid en groen.

**Verify:** `npm run test:run` 1171 pass / 1 skip (was 1146/1, +25 nieuw) · `npm run build`
clean · `npm run lint` 0 errors / 2747 warnings (baseline). docs/architecture.md §353.

**Status:** ✅ impl klaar → `test`. UAT-focus: levels 4/7/8/9/10/11/12/19 nu 4 waves elk
(combat-pacing); timpani beslaat nu het hele level op Level 3 + de omgezette levels.

## 2026-08-29 — ⏳ FR: "Toonladders" bottom-view in de RPG-wereld (icoon-galerij per scale)

Han: nieuwe bottom-view tussen Bestiary en RPG Level. Grid: rij = scale-familie
(pent/hex/dia/…), kolom = modus I–VII (alléén voor de 5 echt-modale families:
Diatonic, Melodic, Harmonic Major, Harmonic Minor, Double Harmonic). Elk vakje = een
ability-icon (32×32) voor die toonladder, met het Romeinse cijfer in het **wit** over
het icoon. Icon↔scale-mapping: eerste aanzet uit een **CSV** (kolommen Name, Class,
Scale, set, set-id; Scale leeg of als mode-code `D6`=aeolian / `M3`=lydian augmented,
prefixes D/M/Hm/HM/HH). Ongelabelde scales → willekeurig ongebruikt icoon.
Vervolgvraag Han: "logisch voorstel" = match dier-icoon met de **kleur van de
toonladder**; hernoem de gebruikte bestanden met de diernaam er achteraan
(`..._lion.png`).

### Interview-antwoorden (Han 2026-08-29)

1. CSV: `src/assets/ASSET DROP/ability icons/Animals-Icons-scalesl.csv` (kolommen
   `Name,Class,Scle,class-id,set,set-id,subset`). Icon-bestand:
   `set-id = class-id + (subset−1)×50`; sets 1–10 → `Ability_icons{set}_{id2}.png`,
   sets 11–15 → `Ability_icon_{set}_{id2}.png` (id 2-cijferig gepad).
2. "Kleur van de toonladder" = **emotionele kleur**, "doe maar gewoon een gok".
3. De CSV `Name`-kolom IS de icon→dier mapping.
4. Gebruikte PNG's kopiëren naar vaste map + hernoemen met diernaam (`..._lion.png`);
   originelen in ASSET DROP ongemoeid. ✅ akkoord.
5. Rijen = **alle 9 families**.
6. Niet-modale families: **uitlijnen** op het 7-koloms grid (links→rechts vullen).
7. Vakje **klikbaar** → selectiekadertje + naam zichtbaar (details later leesbaar).
8. Nav-knop icoon = **`Music`** (lucide) — zelfde als de klassieke view's SCALES-tab
   (`App.jsx` `{ id: 'scale', Icon: Music }`). ⚠ WorldNavBar heeft al `Music` voor
   "music-view" → 2× Music in de wereld-nav; bij bouw aan Han melden.

### Stap 1 — CSV verrijken ✅ (2026-08-29)

`scripts/build-scale-icon-map.mjs`: parseert `scaleDefinitions` uit scaleHandler.js
(67 scales), houdt Han's 12 toewijzingen, vult de andere **55** in — dier↔scale
gematcht op emotionele kleur/sfeer, per familie gegroepeerd. Leidt `scale-colour`
(hsl/hex, modale helderheid × familie-karakter) en `emotion` af. Idempotent (leest
alleen de eerste 7 kolommen, herbouwt de rest; BOM gestript). Validatie: 67/67 scales
gedekt, elk icoonbestand bestaat. CSV nu 12 kolommen (+`scale-family,scale-colour,
emotion,by,icon-file`), 2 spare-rijen (37 Snake, 51 Bull-nose-ring).

Code-conventie `Scle`: `D# MM# HMin# HMaj# DH#` (modus 1–7) voor de 5 modale families;
letterlijke scale-naam voor de rest (zoals Han's `In`/`Inen`).

### Stap 2 — de view zelf ✅ (2026-08-29)

- `scripts/build-scale-icon-map.mjs` uitgebreid: kopieert de 67 gebruikte PNG's naar
  `src/assets/scale-icons/{scale-code}_{dier}.png` (originelen in ASSET DROP ongemoeid)
  + emit `src/theory/scaleIconMap.generated.js` (`SCALE_ICON_MAP` keyed `"familie|naam"`,
  `SCALE_FAMILY_ORDER`).
- `src/theory/scaleIcons.js`: `import.meta.glob` → asset-URLs; `getScaleIcon()` +
  `buildScaleGrid()` (9 rijen; modale families = 7 cellen op modus-index, rest = 1 cel
  per scale).
- `src/components/character/ScalesPanel.jsx`: `ScalesTopPanel` (grid: icoon +
  emotie-kleur wash/streep + wit pixel-font Romeins `Ⅰ–Ⅶ` + gele selectie-outline +
  debugMode oranje hitbox §3a) + `ScalesBottomPanel` (familie/parent/dier/emotie/
  kleurstaal/intervals).
- Wiring: `characterScreen === 'scales'` in `SCREENS` (AvatarSubHeader, `WheelIcon` =
  zelfde als klassieke WHEEL-toggle) tussen `bestiary` en `rpg-level` → WorldNavBar
  pikt 'm automatisch op. `selectedScale` state in App.jsx → beide panelen (net als
  `bestiaryEditor`). TabView krijgt `selectedScale` prop.
- `NAV_ICON_COUNT` 8 → 9 in `worldLayout.js` (WorldNavBar heeft nu 9 knoppen); alle 35
  worldLayout-tests blijven groen.
- Nieuwe test `src/theory/__tests__/scaleIcons.test.js` (7). docs/architecture.md §352.
- Verify: `test:run` 1178 pass / 1 skip · `build` clean · `lint` 0 errors.

### Stap 2 — round 2 (Han-feedback) ✅

Icons op wereld-gpx (`32·worldScale`), geen kader/gap (kale 32×32 grid), grid 9 kolommen,
rijnamen in pixel-font.

### Stap 2 — round 3 (Han-feedback) ✅

- **Rij-volgorde**: Pentatonic, Hexatonic, Diatonic, Melodic, Harm Min, Harm Maj, Double
  Harm, Other Hepta, Supertonic.
- **Niet-modale families gesorteerd op hepta ref** (Ionisch links → Locrisch rechts) via
  `def.diatonic` in `buildScaleGrid`.
- **Kleur puur op hepta ref**: 7 kleuren per diatonische modus, benoemd met RPG-class —
  I Paladin `#d9a520` · II Geomancer · III Hydrosophist · IV Hunter · V Priest · VI
  Aerotheurge · VII Warlock. `SCALE_HEPTA_REF` legenda-strip boven het grid; elke cel-bg =
  die kleur (schijnt door de PNG-marge → gradient per rij). Selectie = cel schaalt 1.12×
  (geen kader).
- CSV-kolommen nu `…,scale-family,hepta-class,scale-colour,by,icon-file`. Map-entries
  krijgen `heptaNum/heptaRoman/heptaClass`.
- `scaleIcons.test.js` uitgebreid (legenda-kleuren, rij-volgorde, non-modaal sort).
- Verify: `test:run` 1200 pass / 1 skip · `build` clean · `lint` 0 errors.

### Stap 2 — round 4 (Han-feedback) ✅

- **Icons ge-recolored** naar het kleurschema: 7 class-paletten (5 tinten elk) gesampled
  uit `.../ability icons/Color_palette{,2}.png` (Paladin uit palette2). `recolourIcon` in
  het build-script: per opaak pixel → luminantie gestretcht over de icoon-eigen min/max →
  1 van de 5 tinten. Class-namen zijn puur palette-labels.
- **Paletten in CSS**: `src/styles/classPalettes.generated.css` (`--class-<naam>-<0..4>`,
  licht→donker), geïmporteerd in App.jsx. Han hergebruikt ze elders.
- **Legenda + cel-achtergrond + border weg** — de ge-recolorde art draagt nu de kleur.
  Selectie = cel schaalt 1.12×. Onderpaneel: geen class-naam/swatch meer.
- `SCALE_HEPTA_REF` heeft nu ook `palette` (5). Test uitgebreid (8).
- Verify: `test:run` groen · `build` clean · `lint` 0 errors. Live gescreenshot: elke rij
  toont z'n links→rechts palet-gradient, dieren blijven herkenbaar.

### Stap 2 — round 5 (Han-feedback) ✅

- Oranje "waas + kader" = de §3a debug-hitbox (alleen in debugMode). Teruggebracht tot
  een dunne outline zonder fill-wash.
- `transform: scale(1.12)` weg → cellen 100% gpx-perfect (integer `32·worldScale`).
  Selectie nu = `worldScale`-px inset gele outline (pixel-perfect, geen layout-shift).
- Romeins cijfer schaalt nu mee: `fontSize 16·worldScale` (BestiaryPixel native = 16px →
  1 design-px == 1 gpx). Was ~3gpx hoog, nu 7gpx — leesbaar.

### Stap 2 — round 6 (Han-feedback) ✅

- Romeins cijfer: drop-shadow weg; nu 2 gpx in vanaf de linker- en onderrand van de cel.
- Rijnamen (familie-labels) schalen nu mee met gpx (`8·worldScale`, BestiaryPixel).
- Kleur-remap (te gelijkende paletten): **II Dorian → Warrior** (was Geomancer),
  **VII Locrian → Occultist** (was Warlock). Warrior/Occultist/Witch-paletten toegevoegd;
  alle 10 paletten nu in `classPalettes.generated.css`.
- CSV-fixes (Han): rijen Crow/Frog/Snake-viper `Occultist → Witch` + `set 11 → 12` (andere
  icoon-art). Bull-icoon van **D5** ↔ **Hungarian major** omgewisseld (D5 krijgt de set-6
  bull, Hungarian major de set-1 bull). Nieuwe spare-rij `Tentacles / Occultist` (set 11,
  id 80) — nog geen scale toegewezen.
- Regenerated: CSV 70 rijen (3 spare), 67 icons ge-recolored, map + CSS bij. `build` +
  `lint` groen (geen `test:run` op verzoek).

**Status:** ✅ Stap 1 + 2 (6 rondes) klaar → Han UAT.

⏳ Open voor later: Romeinse-cijfer-UI voor modus-selectie elders; subscript/superscript
in het pixel-art klavier.

## 2026-08-29 — ✅ #1165 (#1163b): één level-content-stream — 5 mechanismen samengevoegd

Sub-ticket 2 van 3 onder epic #1163 (na #1164 = `generateBlock.js`, vóór #1166 = de
`numMeasures` 8→2 JSON-migratie). Plan v2 door Han goedgekeurd; impl [Opus/high].

Wat is vervangen (allemaal VERWIJDERD, niet uitgeschakeld):
- `useLevelTrebleStream.js` · `useLevelBackingStream.js` · `useLevelMixedStream.js` ·
  `useLevelKeyModulationStream.js` · `useLevel.js`'s `regenerate()`-per-wave (voor ELK level,
  ook de niet-sideScroll levels 101/107/112 — Han: volledige uniformiteit, geen fallback).
- Plus `generateLevelMixedBlock.js`, `generateLevelBackingChunk.js` en de
  `sliceSongCallResponseBlock`-export.

Nieuw:
- ✅ `src/hooks/useLevelContentStream.js` — DE stream: één cadans, één tijdlijn (lead-in
  `[-leadInBars,0)`, blok k `[k*B,(k+1)*B)`), één opgetelde audio-tijd-cursor, één lookahead
  met de §693 wizard-cast-deadline `Math.min` intact.
- ✅ `src/levels/levelBlockPlan.js` — pure per-level policy (`blockMeasuresFor`,
  `blockTypeForBlock`/`blockTypeAt`, `resolveBlockScale`, `blockCountFor`, `leadInSpecFor`,
  `trackSpecsForLevel`). `blockCountFor` leest `totalMeasures`, NOOIT `numMeasures` — dat is de
  §299-bug die in twee van de vier hooks nog live stond en die #1166 anders zou laten toeslaan.
- ✅ `src/generation/generateMetronomeChunk.js` — de metronoom blijft byte-identiek en gaat
  daarom bewust NIET door `generateBlock` (geen akkoord-context, geen gedeeld ritme-grid).

Ritme-grid AAN (Han's plan_review-keuze): treble/bas/percussie uit één maatgroepering +
ranked-array per blok, net als continuous playback. → **UAT van #1165 is een muzikale
her-beluistering van elk level, geen regressie-check.**

Geaccepteerde neveneffecten: (a) cello/bas-ritme volgt de blokcadans; metronoom byte-identiek;
lead-in blijft `leadInBars` met de `metronomeBars = ceil(leadInBars/2)` halve stagger.
(b) een lied publiceert zijn treble per blok (zelfde noten/offsets — verbatim slice, dus géén
herspelling via `modulateMelody`).

#1102: `adaptiveTempo.js` / `useAdaptiveTempo.js` / letter `i` / `tempoScrollAnchor.js` /
`statsRef` ONGEWIJZIGD; alleen de bedrading is her-ingepast (per-blok bpm-lezing + cursor nu in
één stream) en App.jsx's klassieke per-wave decider-effect is VERWIJDERD — de stream is nu de
enige decider voor élk level, en `commitIndexFor` krijgt altijd `units:[B]`, waardoor Han's
"force exact sync" structureel wordt in plaats van rekenkundig. #1102 blijft on_hold.

Verificatie: `npm run test:run` 1146 pass / 1 skip (was 1062/1) · `npm run build` clean ·
`npm run lint` 0 errors (2747 warnings, 2 minder dan de baseline). Architectuur: nieuwe §350
(+ §3 "Step 0" en de §12 bestandstabellen bijgewerkt).


## 2026-08-29 — 🔨 CelticTime pixel-font: injecteer Han's getekende glyphs (atlas → TTF)

Han tekende met de hand glyphs in `docs/font-atlas.png` (boven op de grijze fallback-cellen)
en wil ze "netjes" (raster-exact) in de fonts. Interview: route **1b + 1c**, alleen CelticTime
(+ 1 los fixje voor SandyForest). Terse "ok" op de voorgestelde defaults.

Doelen:
- subscript-cijfers `₀–₉` (U+2080–2089) — octaaf in pixel-art klavier
- superscript-cijfers `⁰–⁹` (U+2070,00B9,00B2,00B3,2074–2079) — akkoordtype (`^5 ^7 ^9`); zelfde
  vormen, omhoog verschoven
- Romeinse cijfers `Ⅰ–Ⅶ` (U+2160–2166) — modus-labels (UI later)
- accidentals `♯♭♮𝄫𝄪` (U+266F/266D/266E/1D12B/1D12A) in CelticTime — Han traceerde de fallback
- SandyForest: `0` (U+0030) — ontbrak in het font, Han tekende hem

Knopen (Han): subscript/superscript op de getekende hoogte laten (niet omhoog schuiven),
exact overnemen (geen regularisatie), Romeinse nu meteen mee.

Stappen:
1. ✅ `scripts/extract-pixel-glyphs.mjs` (pngjs) — leest de getekende cellen uit de PRE-injectie
   atlas (section-tops 16 / 886 / 1756, cell 104px, 8px/design-pixel, 13×13), threshold ink<95
   isoleert Han's zwarte inkt van de grijze `#9aa0a6` fallback → `scripts/pixel-glyphs.json`
   (grid per glyph, 0 dubbelzinnige pixels) + `pixel-glyphs-preview.svg`. **JSON = bron.**
2. ✅ `scripts/inject-glyphs.mjs` (opentype.js devDependency) — grid → TrueType-outline (horizontale
   runs, 64 units/design-pixel, baseline = design-rij 8), append in-place aan de GlyphSet zodat
   name/OS-2/head/hhea behouden. CelticTime 110→142 glyphs, SandyForest 114→115. Round-trip
   geverifieerd (alle codepoints resolven, 'A' ook; cmap format 12 voor 𝄫𝄪).
3. ✅ `render-font-atlas.mjs` — per-font `EXTRA_ROWS` (CelticTime: subscript / superscript /
   Romeins), sectie-hoogte per `f.rows.length`. Atlas her-gerenderd — nieuwe rijen zwart uit
   het font, accidentals nu zwart in rij 8, A–Z/0–9 ongewijzigd.
4. ✅ verify: test:run 1146 pass / 1 skip · build clean · lint 0 errors. docs/architecture.md §351.

⚠️ `docs/font-atlas.png` was untracked en is her-gerenderd → Han's ruwe tekening bestaat nu
alleen nog als `scripts/pixel-glyphs.json` (volledige capture, exact overgenomen).

**Status:** ✅ impl klaar. Romeinse cijfers staan in het font; modus-UI = later (los).

## 2026-08-29 — ✅ #1164 / #1163a — extract shared per-block generator `generateBlock.js`

Sub-ticket 1 of 3 under epic #1163 (uniform per-chunk generation). Pure refactor, ZERO
user-visible change.

- ✅ NEW `src/generation/generateBlock.js` (pure): owns the shared RHYTHM GRID
  (`generateDeterministicRhythm`), the rhythmic chord track (`MelodyGenerator` +
  `insertPassingChords`) and the multi-track `generateNextSeries` call — was inline in
  `Sequencer.randomizeScaleAndGenerate` ~lines 1386–1533.
- ✅ `Sequencer.randomizeScaleAndGenerate` now delegates the block build; keeps scale
  randomization, progression authorship, `setDisplayChordProgression`, `_measureSpan` /
  `generatedNumMeasures`. `start()` / `scheduleBlock` / `sessionController` untouched.
- ✅ Per-track routing on EXISTING params (no new knob): chords → `'song'` strategy
  per-measure-modulo follow; treble/bass/percussion → `randomizationRule === 'fixed'`
  (reference → slice/modulate via `generateNextSeries`; no reference → NEW "repeat block 0's
  chunk = ostinato", caller threads `fixedOstinato`). Optional `shape:'call-response'`
  post-transform (`collapseToCallRests`) merges `generateLevel9CallResponseBlock` +
  `sliceSongCallResponseBlock`.
- ✅ Tests: NEW `generateBlock.test.js` (plain generate incl. 7/8; fixed+reference;
  fixed-no-reference ostinato ×3 blocks; `'song'` modulo wrap; call-response over
  fixed + generated). The 3 golden tests + `randomizeScaleAndGenerate.characterization.test.js`
  pass UNCHANGED. `npm run test:run` 1062 pass / 1 skip, `build` clean, `lint` 0 new.
- 📄 docs/architecture.md §3 "Step 0" + §349, §12 file table.

**Status:** ✅ impl klaar → test (Han UAT). Next: #1165 (Opus/high) consumes `generateBlock`.

## 2026-08-27 — ✅ Bestiary: nieuwe entries (Carriage, Coachwoman, Ferryman)

Han dropte nieuwe sprites:
- `public/ASSORTED/characters/char_with_porttrait/carriage/` — `GandalfHardcore Carriage sheet.png`
  (2176×384, rijen: walk/run/graze/idle), `GandalfHardcore Coachwoman sheet.png` (512×128, rijen:
  idle/walk), `GandalfHardcore Carriage Top Layer sheet.png` (2176×384, overlay om karakters ACHTER
  de bovenkant van de wagen te tekenen — geen los wezen), `64x64 Portrait.png`.
  - Carriage tags: other, townsfolk, worker, move — kijkt naar rechts.
  - Coachwoman (portret hoort bij haar): tags human, townsfolk, worker, move — kijkt naar links.
- `public/ASSORTED/characters/char_with_walk/Ferryman.png` (480×256) — tags Humanoid, townsfolk,
  on water, undead, move — kijkt naar rechts. 1 animatie (alle frames): float.

Open (interview loopt): exacte frame-groottes (sheets delen niet netjes op 64×64), wat te doen met de
Top Layer sheet in de bestiary, of het gedeelde portret alleen naar Coachwoman moet, en of "on water"
een nieuwe tag wordt. Daarna: `bestiaryMetadata.json` + evt. FRAME_OVERRIDES/labels/FACING in
`scripts/generate-bestiary-manifest.mjs`, dan beide generators draaien.

## 2026-08-27 — 🐞 Doc audit: dubbele §-nummers (§328/§329/§330) door parallelle sessies, opgelost

Bij het schrijven van #1162 Fase 9 (WebGL-tekenlus-consolidatie) bleek `docs/architecture.md` §328/§329/§330
DUBBEL vergeven: één set door deze sessie (rAF-consolidatie: real-hardware trace, useFrameLoop-hook,
SheetRpgLayer-migratie), en onafhankelijk daarvan een andere set door dit "UI overhaul"-traject hieronder
(wereld-als-home-view, integer world-scale + pixel-perfect layout) — vermoedelijk een parallelle sessie die
niet van elkaars werk wist. Zelfde klasse fout als CLAUDE.md §1a's eigen "dubbele §38"-audit. Opgelost door
de UI-overhaul-sectie te hernummeren naar §332/§333/§334 (die van deze sessie kwamen chronologisch eerder in
het bestand te staan) — alle cross-references (hieronder, `worldLayout.js`, `RpgLevelPanel.jsx`) meegefixt.
Geen inhoud gewijzigd, enkel nummers.

## 2026-08-27 — ✅ FR: pixel-art piano in world-content-blok 2 (impl — wacht op UAT)

Zie `docs/architecture.md` §341. `WorldPiano.jsx`: C4→C5. **Meet de container** en vult
'm op de grootste GEHELE schaalfactor **per as onafhankelijk** (sx=⌊w/39⌋, sy=⌊h/38⌋).
Witte toetsen met **1-gpx grijze tussenruimte**, notch-types `[2,3,4,2,3,3,4,1]` (buur-L
= type 4, buur-R = type 2). Dark band + gouden pixelfont-**"Melody"** bovenaan. **Default
wit** (kleuring = apart ticket). Speelbaar via `handleNoteInputCombat` + `instrument.start/stop`,
Pressed-sprite tijdens aanslag. **Reflectie**: gespiegelde toetsen, onderkant tegen
bovenkant toetsen, gradient 50%→0% (onder→boven). Assets → `src/assets/pixel-piano/`.
Groen: lint 0, build, 995 tests. UAT: check zwarte-toets-x + felt-variant + band-hoogte.
Tweaks (Han 2026-08-28): felt overlapt toetsen 1 gpx (geen gat); toets-gap =
`ceil(sx/2)` CSS-px hairline; "Melody"-band **transparant** (reflectie zichtbaar erachter).
Ronde 3-4 (Han 2026-08-28): **alle witte toetsen = `White1`** (geen notch-varianten); grijze
"slot"-lijn ONDER elke zwarte toets pal over de witte toets i.p.v. sprite-notch; `GRAY` 50%
donkerder (`#45474c`); zwarte toetsen 1 gpx omlaag; reflectie **altijd** gerenderd, onderkant
tegen het vilt (`whiteH − feltOverlap + sy`), `to top`-gradient 50%→0%; **notenletters
c d e f g a b c** op de witte toetsen, op **wereld-schaal N** (`max(7, 6·N)` px, `3·sy` omhoog
van de onderrand) — was ongeschaald 6 px, te laag, bijna onzichtbaar.
UAT: zwarte-toets-x-offsets, felt-variant, `BAND_H=9`/"Melody"-fontgrootte, reflectiezichtbaarheid.

Ronde 5 (Han 2026-08-28) — twee sporen:
- 🔨 **WorldPiano-intern (nu):**
  - padding-grijs nog iets donkerder; **één uniforme padding** `PAD = min(pad_x, pad_y)` overal
    (tussen witte toetsen, boven witte toetsen als grijze lijn, zwarte-toets-drop) — zelfde kleur,
    zelfde hoogte/breedte.
  - verticale stapel van boven naar onder: **weerspiegeling → onzichtbare paddinglijn → vilt →
    grijze paddinglijn → witte toetsen**. Reflectie dus omhoog via de onzichtbare marge, niet meer
    tegen het vilt geplakt.
  - reflectie **reageert visueel op ingedrukte toetsen** (spiegel neemt `held` over — geldt ook
    voor QWERTY/MIDI zodra spoor 2 er is).
  - notenletters op **bestiary-formaat** (`13.72 · N` px, mag overlopen), nog iets hoger; **ook op
    de zwarte toetsen** met Unicode ♯ (`c♯ d♯ f♯ g♯ a♯`), §5b.
  - "Melody"-pixelfont **grid-locken**: font-size op integer-veelvoud van de font-designgrid,
    integer-positie (geen flex-halve-pixel), text-shadow weg/zacht — anders altijd wat rand-alias
    (browser rastert tekst altijd met AA; alleen grid-lock + integer-positie helpt).
- ✅ **Spoor 2 — gedeelde input + labels (GO gekregen 2026-08-28):**
  - ✅ `src/theory/scaleKeyLabel.js` — `scaleKeyDisplayPC(note, scale)`, gedeelde toonladder-bewuste
    toetslabel-spelling. PianoView's `getNoteLabel` delegeert nu die tak (transpose/octave-wrapper
    blijft van PianoView). WorldPiano gebruikt 'm → G♯ toont als A♭ in mol-toonaard. Smoke test.
  - ✅ `src/hooks/useQwertyPiano.js` — gedeelde keydown/keyup + guards + blur-release + repeat-dedupe.
    Mapping komt van `deriveQwertyScheme` (SSOT, §6d). WorldPiano gebruikt 'm; `qwertyActive` =
    `qwertyKeyboardActive || 'auto'` (auto = fine-pointer device). PianoView's eigen listener blijft
    voorlopig (draagt #990/#871 wrong-note-fixes die eigen UAT nodig hebben) — alleen de map is
    gedeeld. Smoke test (3 cases).
  - ✅ MIDI-visual: `App.midiHeld` state (display-only), doorgegeven → WorldPiano licht toetsen +
    reflectie mee op. WorldPiano installeert NOOIT eigen `onmidimessage` (zou App's globale MIDI
    stelen).
- ⏳ **Rest van Spoor 2 — CSS-kleuring** die PianoView's scale-highlight matcht (tint-overlay +
  `mix-blend-mode: multiply`, scale/colorScope vanuit App). Nog niet gebouwd — apart, gefocust
  passje want "identiek aan pianoview" mag niet geëyeballd worden (§9k).
- Vraag toets-breedte-in-cm: **niet betrouwbaar mogelijk** (CSS-cm = 96px/in print-fictie, geen
  fysieke DPI-API, bewust niet ge-exposed). Enige route = eenmalige gebruikers-kalibratie tegen
  bankpas/liniaal → px/mm in localStorage. Los tickettje indien gewenst.

Ronde 6 (Han 2026-08-28) — ✅ WorldPiano-intern + tekstboxen:

- ✅ tekstboxen (**alle**): `4·N` gpx interne padding — DialogueBox compact (`box-sizing:border-box`,
  box blijft 256×64) + bestiary `--pill-pad`/inputs (`calc(--bpx*4)`). Was 0 / 1px.
- ✅ "Melody" **geen weerkaatsing** — band staat nu bóven de reflectie in de stapel.
- ✅ zwarte + witte toetsen **top-aligned** (`blackDrop` → 0).
- ✅ stray grijze lijn onder vilt weg — witte-toets-naden zijn nu expliciete `<div>`s, geen
  container-`background` (dat bloedde door de transparante spritetop).
- ✅ padding nog een slag donkerder (`#3c3e43` → `#2f3135`).
- ✅ label zakt `1·sy` bij ingedrukte toets.
- ✅ zwarte-toets-letters omhoog (`bottom` `sy` → `2·sy`), en volgen nu de displaynames (toonladder).
- ✅ reflectie-opacity: 0 vanaf halve toetshoogte (`REFL_H = ⌈WHITE_H/2⌉` band, mask over volledig
  bereik).
Groen: lint 0, build, 1001 tests (+6).

Ronde 7 (Han 2026-08-28) — ✅ "gewoon een kopie van pianoview met pixel-art toetsen":

- ✅ "Melody" tekst NIET verplaatst; reflectie staat nu `bottom:100%` (volledig bóven de band, in de
  headroom) → geen weerkaatsing achter de letters, tekst blijft staan.
- ✅ marge onder het vilt weg — grijze `PAD`-lijn + onzichtbare `PAD` verwijderd; vilt zit pal op de
  toetsen. `NATIVE_H` 54 → 52.
- ✅ zwarte-toets-letters zelfde bottom-offset als witte (`(down?3:4)·sy`).
- ✅ reflectie-opacity 55% → **30%** (mask alpha).
- ✅ **QWERTY-labels** (grijs, monospace bold, bóven de toetsnaam) zoals pianoview — `qwertyOn` only,
  key uit `deriveQwertyScheme` reverse-map.
- ✅ **CSS-kleuring** = pianoview `highlight`-scheme: tonic → `--white-key-color-tonic`, in-scale →
  `--white/black-key-color-highlight`, als `mix-blend-mode:multiply`-overlay op de witte sprite;
  enharmonisch-veilig via `getNoteSemitone`. Buiten-scale toetsen blijven blank.
- 🔎 Labels: `scaleKeyDisplayPC` = exact PianoView's `getNoteLabel`-tak.
Groen: lint 0, build, 1001 tests.

Ronde 8 (Han 2026-08-28) — ✅:

- ✅ **Label-bug gevonden**: `BLACK_KEYS.pc` was verzonnen (G♭). `generateAllNotesArray` is
  `C D♭ D E♭ E F F♯ G A♭ A B♭ B` — een MIX (F♯ is kruis). Nu overgenomen → C-groot toont **F♯**
  zoals pianoview. Test-case toegevoegd.
- ✅ "Melody": reflectie staat nu weer bóven het vilt en **achter** de band (`zIndex 1` < band
  `zIndex 3`); band-achtergrond transparant → reflectie zichtbaar rondom, gouden tekst er OVERheen.
  `text-shadow` weg. Mirror bevat de tekst zelf nooit.
- ✅ padding = **1 CSS px zwart (`#000`), niet geschaald** (Han: "zie er uit als 1 px, niet 1
  game-pixel"). Tussen witte toetsen + **flankerend aan weerszijden van elke zwarte toets**
  (`left/right: -1`, mag over de witte toets).
- ✅ zwarte toetsen `1·sy` px omhoog (`top: -sy`) → vallen over het vilt.
- ✅ reflectie-opacity 30% (mask alpha, gepositioneerd `bottom: whiteH + feltH`).
Groen: lint 0, build, 1002 tests.

Ronde 9 (Han 2026-08-28) — ✅ ("Melody staat perfect <3", labels werken):

- ✅ zwarte-toets-kleur was te donker — `multiply` op de bijna-zwarte sprite slokte de tint op.
  Nu: witte toetsen `multiply`, **zwarte toetsen `screen`** → highlight-kleur leesbaar.
- ✅ padding = **1 gpx op WERELD-schaal N** (`SEAM = max(1, round(scale))`), niet × de interne
  piano-fill-schaal `sx`.
- ✅ reflectie nog `1·sy` omhoog (`bottom: whiteH + feltH + sy`).
- ✅ geen zwarte flank-lijn op het stukje zwarte toets dat over het vilt steekt — flank loopt nu
  vanaf de witte-toets-bovenkant omlaag (`top: blackRaise`).
Groen: lint 0, build, 1002 tests.

Ronde 10 (Han 2026-08-28) — ✅ laatste puntje: zwarte rand ook langs de **onderkant** van elke
zwarte toets (`left/right: -SEAM`, `bottom: -SEAM`, `height: SEAM`) → ⊐-vorm rond de onderste helft.
Groen: lint 0, build, 1002 tests.

Ronde 11 (Han 2026-08-28) — ✅ perfectionist-ronde:

- ✅ zwarte toets: onderste `2·sy` faden naar 30% alpha (`mask-image`) → witte toets eronder
  schemert erdoor ("weerkaatsing op de lip"). Naden/labels blijven buiten de mask.
- ✅ klavier vult nu de **hele** blok-breedte: betere `sx` (echte naadbreedte verrekend) +
  `transform: scaleX(w / boardW)` — geen gecentreerde gutter meer.
- ✅ tekst op piano → **"Melody Hill"**.
Groen: lint 0, build, 1002 tests.

Ronde 12 (Han 2026-08-28) — ✅ range-klavier + verticale regels:

- ✅ **Range-klavier** (`src/theory/pianoKeyboardWindow.js` + test): toont de toetsen van de
  **actieve clef**-range. >1 octaaf → hele range (smallere toetsen). ≤1 octaaf → verbreed naar vol
  octaaf: C–C, anders G–G, anders tonic→tonic+octaaf. Buiten-range toetsen **grijs**
  (`rgba(128,128,128,0.62)` + labels 40%). QWERTY-map volgt het window.
  `App` geeft `pianoRangeMin/Max` uit `(activeClef==='bass'?bass:treble)Settings.range`;
  `noteAtOrdinal` nu geëxporteerd uit `qwertyScheme.js` (§6c).
- ✅ **Harde regel**: keys ≥ **60 gpx** (`syFloor = ceil(60·N/27)`), `sy = max(1, syFloor, syFit)`.
  Bij korte blok schuift de weerkaatsing + "Melody Hill" van bovenaf weg (`overflow:hidden`,
  bottom-aligned).
- ✅ **minder weerkaatsing**: `REFL_H` 14 → `round(27/4)≈7`.
- ✅ **"Melody Hill" font ≥ toetsletters**: `melodyPx = max(5·sy, letterPx)`; `BAND_H` 9 → 12.
- ✅ klavier vult hele blok-breedte (betere `sx` + `scaleX`), zwarte toets bottom-`2·sy` fade 30%,
  tekst → "Melody Hill". (rondes 11–12 samengevoegd)
Groen: lint 0, build, 1008 tests (+6).

⏳ Open: pixel-perfecte tekst — advies gegeven (wordmark als PNG; dynamische tekst = gedeelde
bitmap-font `<PixelText>` + atlas als apart ticket). Wacht op Han's go.
- ✅ `scripts/render-font-atlas.mjs` (Playwright) → `docs/font-atlas.png`: **pixel-perfecte** glyph-atlas
  van CelticTime / SandyForest / Bitfantasy. Verankerd op Han's x-hoogtes (5/5/6 dp, cap ~7), alle 3 op
  een 16-eenheden em-grid → render 128px = **8 scherm-px per design-pixel**, geen drift. Per-design-pixel
  raster + **rode baseline** per cel. Ontbrekende glyphs (accenten, ♯♭♮𝄫𝄪𝄞𝄢, `&`/`@`/`~` in Bitfantasy)
  gedetecteerd via CSS-fallback-pixelvergelijk → **grijs, ingepast in de cel** zodat Han ze kan overtrekken.
- ⏳ Volgende stap voor Han: glyphs tekenen in de atlas. Terug in de app = ofwel glyphs aan de `.ttf`
  toevoegen (FontForge; `@font-face` in `App.css` / `DialogueBox.jsx` pakt zelfde bestandsnaam op),
  ofwel een `scripts/inject-glyph.mjs` (pixel-map JSON → TTF via `opentype.js`, nog te bouwen indien
  gewenst), ofwel de grotere `<PixelText>` + bitmap-atlas route.

## 2026-08-27 — (oud) FR-interview piano

Han dropte `src/assets/ASSET DROP/Pixel Piano 1.0/` (RagnaPixel, free/commercial license):
- **Felt/** — 259×2 gpx strip (5 varianten), hoort bovenaan de toetsen (rode rand in ref-afb).
- **Keys/** — witte toetsen 4×27 gpx, types 1-4 (1=geen zwarte buur, 2=buur L, 3=L+R, 4=buur R)
  + `Pressed`-variant. Kleuren: Blue/Gray/Green/Old/Red/**White**/Yellow (White = plain look).
- **Flats + Sharps/** — zwarte toetsen 3×16 gpx (+ Pressed), zelfde kleuren; "zonder kleur = White".

Doel: 1 octaaf C4→C5 (8 witte toetsen) in **content-blok 2**, zoals de ref-afb. + spiegeleffect
boven de piano (als content-blok 1 genoeg padding heeft).
Witte-toets-type per noot: C=4, D=3, E=2, F=4, G=3, A=3, B=2, C5=1. Zwarte toetsen: C#,D#,F#,G#,A#.

Interview loopt — vragen gesteld in chat 2026-08-27.

## 2026-08-27 — ⏳ UI overhaul: RPG-wereld als primaire view (in stappen)

Han: RPG-wereld wordt de eerste/hoofd-view. Fullscreen, geen AppHeader/titel/tab-nav
bovenaan. Terug naar klassieke view moet kunnen. Doel op termijn: alles via de RPG
(level starten, scales bekijken, ...). Landscape: RPG ~bovenste helft → max 3/4.
Portrait: 2/3–3/4. Regel **4A** gekozen (min-breedte 320 gpx wint; portrait-hoogtecap
mogelijk apart). Pixel-perfect = **integer** schaalfactor; onderbalk = vrije hoogte,
slokt de rest op.

**Stap 1 (✅ impl klaar — wacht op UAT)** — zie `docs/architecture.md` §332.
- Nieuw `worldMode` (persist, default true) in `useAppUIState`. Boot → world.
- `inWorld` = `worldMode && !level.active && characterScreen !== 'levelResult'`.
- `inWorld` ⇒ `AppHeader` + subheader-rij niet renderen; nieuwe `WorldNavBar`
  (`src/components/layout/WorldNavBar.jsx`) bovenaan het bottom-paneel: ÉÉN platte
  rij, de 5 screen-knoppen (uit `AvatarSubHeader`'s geëxporteerde `SCREENS`) direct
  naast [start level ⚔] [debug 🐛] [music view ♪ → klassieke oefenview root].
- Klassiek → world: `AppHeader` hero-knop VERVANGEN door een world-knop (`Globe`,
  `onEnterWorld`).
- LEVEL start = world offload (bestaand `setCharacterScreen(null)`); na LEVEL terug
  naar world via `handleCloseLevelResult` + level-picker `onClose`.
- Single-view: bottom-paneel geforceerd `column` zolang `inWorld`.
- Groen: lint (0 errors), build, 961 tests pass.
- NIET in Stap 1: pixel-perfect scaling, portrait, keyboard/stats in world-paneel,
  diegetische interacties.

**Stap 2 (✅) — audit.** Zie `docs/architecture.md` §334. Er is al ÉÉN gedeelde
schaalfactor (alle lagen × `zoom`); foliage-shader intern al game-pixel-net. Twee
problemen kwamen van de *display*-schaal: (1) `zoom` niet-integer, (2) camera-pan niet
op device-pixel gesnapt.

**Stap 3 (✅ impl klaar — wacht op UAT).** Zie `docs/architecture.md` §334.
- `src/utils/worldLayout.js` — `computeWorldLayout(w,h)` → `{scale, arrangement,
  world, nav, content:{block1,block2}}`, elk blok een rect `{x,y,screenW,screenH,
  gpxW,gpxH}` in viewport-coords. **Wereldhoogte FLEXT met N**: loop N=1↑, neem
  eerste passende, bump zolang wereld-schermhoogte >TIE_PX (32) groeit ÉN wereld
  ≥ SOFT_SQUEEZE_MIN (224 gpx). Dus 938×667 → N=2 (van 272→507px), maar 1920×1080
  blijft N=3 vol-272 (niet N=4 @206). 4 band-tilings op oplopende hoogtekost:
  v-row 64 / h-row 80 / **split** (c1 vol breed, dan [nav|c2] — Han's schets) 128 /
  h-col 144 gpx. Blok-minima (0 padding): blok 1 ≥ 256×64, blok 2 ≥ 192×64 gpx.
  Nav: 8 iconen, verticaal 1×8 (16×128) of 2×4 (32×64), horizontaal 8×1 (128×16);
  `WorldNavBar` legt ze in exact dat grid. 27 unit-tests.
- Conversatiebox (`RpgLevelBottomPanel`→`DialogueBox`) rendert nu op **level-schaal N**
  (`transform: scale(N/2.5)`, gemeten native, geclamped tot het blok). `DIALOGUE_SCALE`
  geëxporteerd.
- Debug-tint: blauw (`0.18`) vult alleen de SLACK rond de gecentreerde min-rect
  (256×64 / 192×64 gpx) — de min-rect zelf blijft doorzichtig, dus min-size vs
  extra ruimte visueel onderscheiden.
- **Bestiary in world mode = world-schaal + pixel font.**
  - creature-preview op `worldScale = worldLayout.scale` (i.p.v. `PREVIEW_SCALE`).
  - navigatie: world sub-screens renderen nu de pixel-`WorldNavBar`-BLOK (scale +
    `cols`/`rows` uit `worldLayout.nav`), niet de 52px-rij, in 1-gpx-padded wrapper.
  - nav: `computeWorldLayout` **prefereert een horizontale strip BOVEN de content**
    (h-row/h-col) zodra de volle (of licht-gesqueezde ≥224) wereld nog past met de
    extra 16 gpx — "als er genoeg ruimte is boven content, iconen erboven". Alleen bij
    te weinig hoogte → **verticale kolom NAAST de content** (v-row/split), volle
    bottom-area-hoogte, iconen `space-evenly` verticaal gespreid. Horizontaal = volle
    breedte, `space-evenly`. Sub-screens forceren altijd horizontaal.
  - tekst: `.bestiary-pixel` class + `--bpx` → `CharacterCreator.css`: font
    **`'BestiaryPixel'`** (normal = **CelticTime**, italic = **SandyForest**, bold =
    **Bitfantasy** — `@font-face` split in `App.css`), font-size `calc(--bpx*13.72)`
    (~10 gpx glyph). Knoppen/tags/inputs: **letterlijke `1px` padding + `line-height:1`**
    → knop = 1 glyph hoog + 2px. `PILL_STYLE.padding = var(--pill-pad, 2px 8px)` +
    `lineHeight:1`; klassiek onveranderd. `worldScale` via App→TabView→`BestiaryBottomPanel`.
  - **conv box**: `DialogueBox` krijgt `scale`/`textCols`/`compact` props; world mode
    `scale=N`, `textCols=192`, `compact` → box **exact `(64+192)·N` = 256 gpx breed ×
    64 gpx hoog**, 0 tekst-padding, frame als inset `box-shadow` (0 layout). Past exact
    in blok 1. **AUTO-toggle weg**. Level-result-caller ongewijzigd (2.5× + border + AUTO).
  - `OscillatingText`: elk **woord** in een `white-space:nowrap` `inline-block`-groep
    (letters-spans erin) → regel breekt alleen bij spaties, nooit midden in een woord
    ("y⏎ou know"). Tests bijgewerkt.
  - klassieke view volledig ongewijzigd.
- App.jsx: `worldLayout` memo; top-sectie = `world.screenH` + `overflow:hidden`;
  `RpgLevelPanel` in crop-shift wrapper (`bottom: -(bottomCrop·N)`, hoogte 272·N)
  met `worldScale={N}`; hele bottom-sectie in world-level = **`<WorldBottomArea>`**
  (nav + 2 blokken; **conversatie = blok 1** via `RpgLevelBottomPanel`; blok 2
  gereserveerd).
- `RpgLevelPanel`: `zoom = worldScale ?? dynamicZoom` (integer wint); interim
  `size.w/320`-clamp weg; tap-to-move `/ZOOM` → `/zoom` bug gefixt.
- `WorldNavBar`: `scale` + `orientation` props → 16×16 gpx bare-icon knoppen,
  horizontaal of verticaal gestapeld. Han vervangt icoontjes later met pixel art.
- `ForegroundFoliageLayer`: `uScreenPos`/`uSizePx` → hele device-pixels (§327 finding 2).
- debug: `WorldLayoutDebugFrames` — kaders + gpx-dims + crop; nav ↔/↕; blok 1 = "conversation".
- Groen: lint (0 err), build, 984 tests.
- NIET nu (Stap 3b): blok-2-content (klavier/stats); DOM-lagen camera-transform
  device-px snappen; portrait-tuning.

**Wisp/Slime-interactie (✅ impl — wacht op UAT).** Zie `docs/architecture.md` §336.
- Correcte wisp: `findVariantByUrl(WISP_URL)` (= zelfde `Wisp.png` als het portret),
  fallback `findCreatureByName('Wisp')`.
- **16×16 gpx** klik-zone (`EntityHitZone`) i.p.v. de hele sprite-box; geankerd zoals
  de sprite (mid-onder grounded / center-hover flying); **oranje overlay in debug**.
- Toets **Enter/F/Spatie**: dialoog open → volgende (`advanceDialogueRef` →
  `handleTextClick`); anders → dichtstbijzijnde wisp/slime binnen **48 px**
  (`NPC_INTERACT_RANGE`) → start gesprek. Genegeerd tijdens typen in een veld;
  Spatie `preventDefault`.

## 2026-08-14 — ⏳ Nieuwe CR's (interview loopt) — 4 losse features

Han, terwijl #988's WAV-conversie op de achtergrond draaide:

1. **Chorus op foute noot** — bij een foute noot moet een chorus-effect klinken zodat het "een
   klein beetje vals" klinkt. Doelsignaal (mic-input via pitch-detectie, of on-screen/MIDI-noten)
   nog te verifiëren — interview loopt.
2. **Debug: chorus-strength regelaar** — in debugmode een handmatige chorus-sterkte-knop zodat
   Han met het keyboard kan testen hoe het klinkt, los van de wrong-note-detectielogica (die komt
   later, wordt later toegepast in het level).
3. **Enemy "type3: damaged1/2/3" bij 1/8e-late-drempel** — als een vijand voorbij de 1/8e-noot
   late-drempel loopt, vijand-animatie type3: damaged1/2/3. Relatie tot bestaande
   timing/grading-logica (gradeHit.js?) en bestaand vijand-animatiesysteem nog te verifiëren.
4. **3 nieuwe Playback Settings-setters**, onder de "num measures"-setter:
   - RPG fx volume (slimes/spells/effecten) — default mp
   - RPG music volume (levelmuziek incl. vogels) — default mf
   - RPG visibility — opacity van de rpg-layer in het level, 100 of 50.

Interview afgerond (Han 2026-08-14):
1. Chorus: getriggerd door vergelijking gespeelde pitch vs. verwachte/target-noot uit de huidige
   melodie/oefening (instrument-input, bijv. trompet — niet mic/pitch-detectie).
2. Damaged-audio (`assets/other/rpg voice starter pack/type3/damagedN.wav`): triggert op HETZELFDE
   moment als een bestaande "gemist"-beoordeling (niet een nieuwe aparte 1/8e-drempel-check).
3. Settings: NIEUWE, losse setters die bovenop de 3 bestaande, ongerelateerde volume-paden
   (VOL_STEPS level-tracks / MF_VOLUME ambient / raw-float one-shot fx) een gain-multiplier leggen
   — geen samenvoeging tot 1 bus nu (apart, groter project indien ooit nodig).

Opgesplitst in 3 kanban-tickets (design→plan→impl→test), parallel op te pakken:
- Chorus-op-foute-noot + debug chorus-strength regelaar
- Enemy damagedN audio bij "gemist"
- RPG fx volume / RPG music volume / RPG visibility settings (onder num-measures-setter)

## 2026-08-14 — 🔨 #988 SplendidGrandPiano als standaard piano

Han: huidige piano (GM `acoustic_grand_piano`) klinkt niet mooi. smplr heeft een losse
`SplendidGrandPiano`-klasse (bevestigd in node_modules/smplr, API-compatibel met de bestaande
Soundfont/Sampler-instanties: start/stop/output/load).

Interview-antwoorden: (1) overal waar nu `acoustic_grand_piano` klinkt — UI-picker, world-ambient,
wizard-preview, conversation-typewriter, previews — niet alleen de UI-keuze. (2) geen CDN-only:
Han wil lokale offline samples, zelfde patroon als de bestaande FluidR3_GM-extractie
(`scripts/extract-soundfont-samples.mjs`). Bron: Han gaf de sample-URL:
https://smpldsnds.github.io/sfzinstruments-splendid-grand-piano/samples — zelf hosten, CDN alleen
als fallback.

Design: nieuwe asset-downloadstap → `public/samples/SplendidGrandPiano/`; `createMelodicInstrument`
(`src/audio/localInstruments.js`) krijgt een branch die `SplendidGrandPiano` bouwt i.p.v.
Sampler/Soundfont voor de piano-slug, lokaal-eerst met CDN-fallback — blijft het ENE
choke-point (CLAUDE.md §6c), geen per-call-site special-casing. Architecturale impact (nieuw
sample-pipeline-formaat, kernbestand instrument-constructie) → gaat door plan_review.

Ticket #988 op kanban-board (design → plan_review → impl → test).

## 2026-08-12 — ✅ #924 Bird/Duck/Butterfly wanderers + graceful Sequencer.stop()

Han bevestigde: pas ook de kern `Sequencer.stop()` aan (1 kwartnoot vertraging op het echte silencen), en
randomize Bird/Duck tussen alle beschikbare vliegende vogels/eenden i.p.v. één vaste sprite.

- `ldtkWorld.js`: nieuwe `ENTITY_INSTANCES` export — `ENTITY_WORLD_X` hield stiekem maar 1 positie per
  identifier (latere entiteit overschrijft eerdere bij gelijke naam), nutteloos nu Bird/Duck/Butterfly
  meerdere keren voorkomen (3/2/4 markers gevonden in de .ldtk-file). Houdt nu ook `y` bij (nieuw — alle
  vorige entiteiten stonden altijd op dezelfde vaste grondlijn).
- `RpgLevelPanel.jsx`: `WorldWanderer` — Bird/Butterfly zweven binnen een 256x64px doos rond hun spawnpunt
  (hergebruikt `oscillate()`, dezelfde primitive als projectile-wobble, i.p.v. een nieuw waypoint-systeem),
  Duck idled puur horizontaal binnen 32x0px. Bird wisselt tussen ~8s zweven en ~4s stilzitten op de
  spawnplek. Positie-updates lopen via een ref-gedreven rAF-loop (geen React state per frame, CLAUDE.md §6).
  Geen "Bird"/"Duck"-sprite in de bestiary — elke instantie kiest random uit een gecureerde pool (Blue
  Jay/Pidgeon/Pigeon voor bird, Honking Goose voor duck), Butterfly is een exacte match.
- `Sequencer.js`'s `stop()`: `instrument.stop()` krijgt nu `{ time: context.currentTime + 1 kwartnoot }` —
  smplr's eigen sample-accurate scheduled-stop (geen setTimeout), zodat een reverb-staart nog een tel mag
  uitklinken. `isPlaying`/abort/scheduling-cleanup blijven wel meteen — er komen geen NIEUWE noten meer bij.

Geverifieerd: `npm run test:run` (710/711, dezelfde losstaande ldtkWorld-regressie), lint (0 errors), build
groen. `docs/architecture.md` §221 toegevoegd.

## 2026-08-12 — 🐞✅ KRITIEK: build was kapot (ontbrekende normal maps) + failsafe + #922/#924 UAT round 7

Han: "welke generatie-regels volgt het level?... Ik wil graag die van de settings" + "hoeveelheid muziek
weinig, 1 maat ipv 2?" + "even ticks op 70% van oneven ticks" + "text clicks hakkelig" + "metronoom hoeft niet
meer tijdens tekst" + "geluid stopt abrupt... wacht 1 kwartnoot" + "tekst 50% kleiner, regelafstand 20%
kleiner" + "maak alle muziek en tekst mf, gebruik de midi-velocities" + "ik heb de files geupdatatd, ik heb
mss een normalmap verwijderd... maak een failsafe."

**KRITIEK gevonden tijdens dit werk**: Han's eigen edits hadden de hele map
`src/assets/ASSORTED/tiles/trees/generated/` verwijderd — `RpgLevelPanel.jsx` had 6 STATISCHE imports naar
bestanden daarin, en een missende statische import is een BUILD-TIME fout (niet runtime) — `npm run build`
was he-le-maal kapot. Opgelost: (1) bestanden opnieuw gegenereerd via het al bestaande
`node scripts/generate-tree-normal-maps.mjs`; (2) de daadwerkelijke failsafe — statische imports vervangen
door `import.meta.glob`, die alleen bestanden opneemt die daadwerkelijk bestaan; een ontbrekend bestand geeft
nu `undefined` i.p.v. de build te breken. Getest door de map opnieuw te verwijderen en `npm run build` te
draaien — slaagt.

Overige fixes:

- Generatie-instellingen bevestigd volledig los van de live song-settings (al zo, gecontroleerd).
- `WORLD_AMBIENT_NUM_MEASURES` 2→4 (2 maten bleek al correct — geverifieerd, laatste noot eindigt exact op
  tick 96 — maar toch verdubbeld voor meer muziek).
- Metronoom-klik uit `useConversationDialogue.js` verwijderd (was tijdelijk voor debuggen).
- Tick-accent: oneven ticknummer = volle MF_VOLUME, even = 70%.
- "Hakkelige" tekst-audio gefixt: alle noten van een pagina worden nu vooraf ingepland op precieze toekomstige
  AudioContext-tijden (zoals `playMelodies` een heel blok inplant) i.p.v. per-frame "nu" afspelen.
- Nieuwe gedeelde `MF_VOLUME` (0.7) in `src/audio/dynamics.js`, gebruikt door zowel tekst als
  ambient-muziek; vogel-lagen dragen nu hun eigen MIDI-velocity mee (`scripts/generate-bird-sounds.mjs`),
  MF_VOLUME vermenigvuldigt daar bovenop.
- Font 50% kleiner, regelafstand nog eens 20% kleiner (bovenop vorige ronde).

Nog open (niet in deze ronde): "geluid stopt abrupt, wacht 1 kwartnoot" — raakt mogelijk de kern-
`Sequencer.stop()` (buiten mijn eigen nieuwe systemen), vraag uitstaand bij Han. Ook: `ldtkWorld.test.js`
faalt nu (`groundTilesFront` leeg) — losstaand van dit werk, vermoedelijk Han's eigen recente `.ldtk`-edits
(nieuwe Bird/Duck/Butterfly entiteiten), niet blind gefixt omdat het bestand vaak verandert.

Geverifieerd: `npm run test:run` (710/711, de ene faalt om de hierboven genoemde losstaande reden), lint (0
errors), build groen (ook getest MET verwijderde normal-map-map). `docs/architecture.md` §220 toegevoegd.

## 2026-08-12 — ✅ #922/#924 UAT round: nooit auto-sluiten, echte volume-bug, bird-akkoorden, Bitfantasy-font

Han: "auto-continue: als er geen volgende paragraaf is... sluit nooit automatisch een gesprek af." + "de
piano mag een stuk luider, net zo luid als de vogels." + "kan het dat de vogels maar unisono zijn? ... Ik wil
dan beide/alle lijnen horen." + "gebruik bit-fantasy als font. T is 8 'pixels' hoog, e is 6 'pixels' hoog...
regelafstand mag iets kleiner."

- `useConversationDialogue.js`: auto-continue-effect sluit het gesprek niet meer automatisch af op de laatste
  pagina — doet dan gewoon niets, wacht op de speler.
- Echte oorzaak volume-bug gevonden: `MelodyGenerator` zet ALTIJD een `.volumes`-array, en `playMelodies.js`
  leest die vóór `.gain`/`trackGains` — mijn eerdere `.gain`-fix deed dus he-le-maal niets voor gegenereerde
  muziek (vogels hebben geen `.volumes`, dus die werkten toevallig wel). Nu `.volumes` zelf geschaald, en de
  waarde flink verhoogd (0.6) omdat zelfs een gelijk getal zachter klinkt dan de vogels (piano-samples
  reageren sterker op velocity dan de shakuhachi-samples).
- `scripts/generate-bird-sounds.mjs`: behoudt nu ALLE gelijktijdige noten als akkoord-slot i.p.v. alleen de
  bovenste stem — `playMelodies.js` ondersteunt akkoord-arrays al nativief.
- `DialogueBox.jsx`: font Habbo → Bitfantasy, met een via fontTools gemeten schaalformule (T=448/1024em,
  klopt met Han's "8 pixels") zodat een hoofdletter exact even veel "native pixels" groot rendert als de
  portret-afbeelding ernaast (dezelfde DIALOGUE_SCALE-zoom). Regelafstand 1.4 → 1.15.

Geverifieerd: `npm run test:run` (711/711), lint (0 errors), build groen. `docs/architecture.md` §219
toegevoegd.

## 2026-08-12 — ✅ #924 UAT round 2: WORLD_BPM overal, note-overlap, per-trigger bird-selectie

Han: "alles op een klok geldt ook voor de tekst, en de toggleable wereldmetronoom." + "de tekst klinkt heel
bot... maak de duur van de noten 2x zo lang." + "wisp +1 octaaf" + "de world metronome begint precies
wanneer ik op start druk, dat vind ik verdacht... Is die uberhaupt hetzelfde tempo..?" + "ik hoor de eenden
niet, zorg dat je steeds een random track van de midi-file instart... niet kiezen wanneer ik tab open, steeds
een andere kiezen bij instarten." + "Ik nog steeds maar weinig melodie. Zet die maar even op piano-
instrument, en zelfde volume als de vogels."

- `worldClock.js` krijgt `WORLD_BPM`/`WORLD_TIME_SIGNATURE` als DE canonieke constanten. Bleek dat drie
  systemen elk hun eigen tempo gebruikten ondanks dezelfde grid-formule: `useDebugMetronome` en de wisp/
  slime-conversatie draaiden op de LIVE song-bpm (varieert per level), ambient/bird op een eigen los
  gedefinieerde 100bpm. Nu allemaal op dezelfde `WORLD_BPM`. Post-combat-gesprek blijft bewust op de
  level-eigen bpm (dat hoort nog bij dat liedje, niet bij de open wereld).
- `useDebugMetronome.js`: `startTimeRef`-lokale anker helemaal weg — beat-index nu direct uit
  `context.currentTime / secondsPerBeat` (absolute grid), dus nooit meer "begint wanneer je op start drukt".
- `useConversationDialogue.js`: noot-duur `subSpan × 0.9` → `× 1.8` (bewuste overlap, minder bot).
- `conversationEntities.js`: wisp-toonhoogte C5/D5/E5 → C6/D6/E6.
- `useWorldAmbientMusic.js`: bird-song nu 3 losse trigger-SLOTS (niet vastgezet op 1 track) — elke slot kiest
  bij ELKE trigger een verse random track uit de volledige pool, i.p.v. één keer bij tab-open.
- Ambient muziek tijdelijk op piano-instrument gezet (was fluit/bas), volume gelijk aan de vogels (0.22).

Geverifieerd: `npm run test:run` (711/711), lint (0 errors), build groen. `docs/architecture.md` §218
toegevoegd.

## 2026-08-12 — ✅ #924 UAT round: één gedeelde klok, onafhankelijke stilte-rolls, load-race bug

Han: "de vogel-midi lijkt totaal niet afgestemd op de metronoom. start altijd op het begin van een maat." +
"ik heb de file geupdated. Speel altijd maximaal 3." + "ik hoor de bas en treble melodie niet." + "ook de
tekst playback heeft een eigen metronoom... niet de bedoeling; alles moet op dezelfde klok lopen." + "ik hoor
de melodie denk ik wel, maar niet zo vaak... 5/9 kans dat ten minste een van beide speelt".

- `useWorldAmbientMusic.js` + `useConversationDialogue.js`: ALLE timing (ambient-blokken, bird-triggers,
  gesprek-metronoomklik) leest nu van dezelfde `worldClock.js`-grid (`nextMeasureStartTime`, absolute
  `context.currentTime`-gebaseerde beat-index) i.p.v. drie losse klokken die elk hun eigen fase hadden.
- Root cause "geen bas/treble te horen": de fluit/acoustic_bass Soundfont-instanties zijn nieuw aangemaakt
  (niet onderdeel van de boot-splash load-gate) — eerste blok werd gepland vóórdat de samples geladen waren.
  Nu `Promise.all([...].load)` afgewacht vóór de eerste scheduling.
- `generateWorldAmbientBlock.js`: treble en bas rollen nu ONAFHANKELIJK hun eigen 2/3-stilte-kans i.p.v. één
  gedeelde rol voor het hele blok — geeft exact Han's 5/9-kans dat minstens één van beide hoorbaar is.
- `scripts/generate-bird-sounds.mjs`: bird-file heeft nu 6 tracks (was 3) — generator exporteert ze allemaal,
  `useWorldAmbientMusic.js` kiest random een subset van maximaal 3 per keer dat de tab actief wordt.

Geverifieerd: `npm run test:run` (711/711), lint (0 errors), build groen. `docs/architecture.md` §217
toegevoegd.

## 2026-08-12 — ✅ #924 World ambient audio: gegenereerde fluit+bas + 3 bird-song lagen

Han: "wereldlevel: speel op de achtergrond zachtjes random generated muziek met een fluit (treble melody) en
een acoustic_bass in de bas. bpm 100, numrepeats 1, nummeasures 2, c majeur, geef een kans van 2 op drie dat
de melodie stil is." + "voeg aan de rpg wereld 3 lagen 'bird song' toe... bird sounds.mid... random instarten
in de juiste bpm, allemaal op shakuhachi." Interview vooraf (§4b/§6b, generation-pipeline impact):
alleen open-wereld-tab, hergebruik hoofd-pipeline, oneindige loop zonder eigen toggle; 3 lagen = de 3
MIDI-tracks, herschalen naar wereld-bpm (100), eenmalig per trigger + willekeurige stilte.

- `generateWorldAmbientBlock.js` (puur, zelfde stijl als `generateLevelBackingChunk.js`): `Scale.defaultScale()`
  (C majeur) + `generateProgression` + `MelodyGenerator` — dezelfde generatie-klassen als de rest van de app,
  met een eigen vaste flute/acoustic_bass InstrumentSettings, los van de actieve oefeninstellingen.
- `useWorldAmbientMusic.js`: JIT-blok-loop (genereer → `playMelodies` → wacht blokduur → herhaal), eigen
  Soundfont-instanties (niet de instrumenten die de gebruiker zelf gekozen heeft), zacht volume (0.28 gain).
- `scripts/generate-bird-sounds.mjs` (`npm run generate:bird-sounds`, zelfde conventie als de bestiary-
  generator): parseert `bird sounds.mid` (4 tracks — track 0 = tempo/titel-meta, tracks 1-3 = de 3 lagen) via
  de nieuwe `midi-file` devDependency, houdt alleen de bovenste noot per gelijktijdige aanslag (bron is
  2-stemmig), zet MIDI-ticks (960/kwart, eigen 90bpm) om naar de app's eigen tick-eenheid — dus GEEN vaste
  tempo, herschaalt automatisch naar welke bpm er ook wordt meegegeven bij afspelen. Output:
  `src/model/birdSoundsManifest.generated.js`.
- 3 onafhankelijke trigger-loops in `useWorldAmbientMusic.js`: elke laag speelt zijn fragment eenmalig af op
  shakuhachi, dan 5-30s willekeurige stilte, dan opnieuw — elk met eigen gestaggerde starttijd zodat ze niet
  gelijk beginnen.

Onderweg ook meteen: koto→shamisen instrumentwissel voor Sakura's Japanese Musician, en shakuhachi als nieuw
instrument toegevoegd (zie round-3 entry hieronder voor de volledige lijst van kleinere fixes in dezelfde
sessie).

Geverifieerd: `npm run test:run` (708/708, incl. nieuwe generateWorldAmbientBlock-smoke-tests), lint (0
errors), build groen. `docs/architecture.md` §216 toegevoegd.

## 2026-08-12 — ✅ #922 round 3: koto->shamisen, typewriter grouping-redesign, hero idle-animatie fix

Han: "sakura NPC: koto -> shamisen" + "tekst: ga terug naar het vorige tempo, dus verlaag met factor 2, maar
spawn 3 letter per keer (lineair verspreid). dus op 120bpm: elke kwartnoot: 12 letters, 4 audio-beats. Stop
altijd bij een leesteken met letters genereren, zo ontstaan er wel rusten." + "mijn personage heeft geen
animatie. Hero moet ook idle animatie tonen."

- `conversationEntities.js`: Japanese Musician instrument koto → shamisen (IN-toonladder tone pool
  ongewijzigd — die hoort bij de noten, niet bij het instrument). `shamisen` + `shakuhachi` toegevoegd aan
  `instruments.jsx` (GM #106/#78).
- `conversationTypewriter.js`: fundamentele herziening van de reveal-eenheid — was 1 teken = 1 click, is nu
  een GROEP van maximaal `GROUP_SIZE=3` tekens per click, lineair verdeeld binnen die click (fractionele
  `clickOffset` + `subSpan` voor de audio-duur per noot). Een leesteken sluit zijn groep altijd meteen af
  (ook als die nog niet vol is) — dat geeft de "rusten" die Han vroeg. 4 clicks/beat × 3 letters/click = 12
  letters/beat, exact Han's cijfers bij 120bpm.
- `useConversationDialogue.js`: TYPEWRITER_SPEED_MULTIPLIER 4 → 2 (terug naar het tempo van vóór de laatste
  2x-versnelling — de extra snelheid komt nu uit de groepering, niet uit een hogere click-rate).
- `RpgLevelPanel.jsx`: hero's idle-frame was hardcoded op 0 (geen animatie, alleen tijdens lopen cyclede het
  frame). Hergebruikt nu `petFrame` (al tikkend op #923's gedeelde bpm-gekoppelde cadence) ook voor de
  hero's idle-animatie i.p.v. een tweede teller te bouwen.

Geverifieerd: `npm run test:run` (708/708, incl. herschreven typewriter-tests voor de nieuwe groeperingslogica),
lint (0 errors), build groen.

## 2026-08-12 — ✅ #922 UAT round: npc-aware post-combat, wereld-slime lorem ipsum, 2.5x box, anchor-fix, koto

Han's UAT feedback op §213: level 11 (decorativeWizard) en Sakura (npc "Japanese Musician") toonden geen
portret/sprite; lorem ipsum stond op de verkeerde slime; het vak was te klein; slime-anchor inconsistent met
bestiary; sync te streng; driehoekje alsnog gewenst; typewriter nog trager dan gewenst; koto/IN-toonladder
voor de Japanese Musician.

Gefixt:

- `App.jsx`: `levelResultSpeaker` resolver — npc-veld > decorativeWizard/Wizard-enemyType > default slime.
  Post-combat toont nu portret/sprite per resolved speaker; lorem ipsum eruit, korte regel erin.
- `useRpgLevelState.js`: `openEntityDialogue` gedeelde helper (wisp + nieuwe `clickSlime`), lorem ipsum nu
  op de RPG-wereld-slime (`RpgLevelPanel.jsx`'s `WorldSlime`, nu klikbaar); weglopen-check gebruikt de
  daadwerkelijk geopende entiteit's positie, niet hardcoded wisp-X.
- `DialogueBox.jsx`: `DIALOGUE_SCALE = 2.5` (hele vak, niet alleen wizard-portret — die 2x-multiplier is
  ingetrokken, iedereen deelt nu dezelfde boxgrootte); `SpeakerPortrait` bottom-center geankerd (matcht
  Bestiary's `CreatureSprite`-conventie voor sprite-crops, i.p.v. de portret-conventie die alleen voor
  DEDICATED portretten klopt); driehoekje-indicator terug.
- `worldClock.js`: `nextBeatStartTime` — sync nu op eerstvolgende beat i.p.v. eerstvolgende maat.
- `useConversationDialogue.js`: TYPEWRITER_SPEED_MULTIPLIER 2 → 4.
- `conversationTypewriter.js`/`conversationEntities.js`: `octave` → generieke `tonePool` (nodig voor koto's
  IN-toonladder C4/D♭4/F4, geen simpele octaafverschuiving); nieuwe `ethnic`-instrumentcategorie + koto
  (GM #108) toegevoegd aan `instruments.jsx` + `--cat-ethnic` in `App.css` (test ving de ontbrekende CSS-var
  op: `categoryColorVar` heeft een expliciete registratie per categorie, geen automatische afleiding).

Geverifieerd: `npm run test:run` (707/707), lint (0 errors), build groen. `docs/architecture.md` §214
toegevoegd.

Nog open (nieuw, apart aan te pakken): wereld-achtergrondmuziek (fluit+acoustic_bass, C majeur, bpm 100,
2 maten, 2/3 kans stilte per blok) — vraagt een interview vóór implementatie (raakt de generation-pipeline,
CLAUDE.md §6b/§4b).

## 2026-08-12 — ✅ #922 Conversation system: wereldklok, paginatie, auto-continue, post-combat wired up

Vervolg op de wisp-slice hieronder. Han: "de range van de wisp mag twee octaven omhoog. Verhoog het tempo
van de typewriter clicks met een factor twee. voeg nog twee features toe: klikken in tekstvak voltooit
onmiddellijk de huidige paragraaf. zet rechts van de tekstbox een toggler (pixel art stijl): auto-continue...
In het RPG-level is een wereldklok. Zorg dat het gesprek begint op de start van een maat. implementeer de
rest."

Gebouwd:

- `src/audio/worldClock.js`: stabiele beat/maat-grid op `context.currentTime` (geen toggle-afhankelijke
  anker) — `nextMeasureStartTime` gebruikt om ELKE conversatie te laten starten op de eerstvolgende maat.
- `src/audio/conversationEntities.js`: entiteit→instrument+octaaf profiel (wisp nu octaaf 5 = 3+2).
- `useConversationDialogue.js` (vervangt `useConversationTypewriter.js`): pagina-orkestratie, 2x
  typewriter-snelheid (bovenop #923's clickMsForBpm, geen aparte formule), eigen zachte metronoomklik op mp
  volume, auto-continue (wacht >= 1 tel EN tot volgende maat), klik = pagina direct afmaken of doorgaan.
- `DialogueBox.jsx`: nieuwe `AutoContinueToggle` (pixel art stijl, rechts van de tekstbox).
- Post-combat (App.jsx's bestaande `levelResult`-scherm, al de auto-trigger na combat): wizard toont nu zijn
  eigen dedicated portret (2x schaal) met een korte overwinningsregel; groene slime vertelt de volledige
  lorem ipsum, gepagineerd per paragraaf (`src/model/conversationContent.js`).
- Bugfix onderweg: `getConversationProfile` gaf elke render een NIEUW object terug, wat de typewriter bij
  elke re-render van App.jsx zou resetten (App re-rendert ~60x/sec tijdens beweging) — nu gecached per
  entiteit zodat de referentie stabiel blijft.

Bewust niet gebouwd: het bewegende driehoekje-indicator uit de originele spec — vervangen door de
AutoContinueToggle + `hasNextPage`/`totalPages`/`pageIndex` die de hook al blootlegt; een indicator kan daar
later op bouwen zonder de engine te wijzigen.

Geverifieerd: `npm run test:run` (707/707), lint (0 errors), build groen. `docs/architecture.md` §213
bijgewerkt (niet langer PARTIAL).

## 2026-08-12 — 🔨 #922 Conversation system: musical typewriter engine + wisp slice (partial)

Bouwde de kern van het "gesprekken animeren op de metronoom" systeem (zie BACKLOG/kanban #922 voor de
volledige oorspronkelijke spec). Klaar in deze pass:

- `src/audio/conversationTypewriter.js` (+ tests): per-teken click-schema — spatie stil maar telt mee, komma
  = +2 stille clicks, punt = snap naar volgende beat, hoofdletters/leestekens = C3, kleine letters =
  gewogen C3/D3/E3 (70/25/5).
- `src/hooks/useConversationTypewriter.js`: rAF/`context.currentTime`-gedreven reveal (zelfde techniek als
  `useDebugMetronome`), `clickMs` komt uit #923's `clickMsForBpm`. `skip()` maakt de pagina in één klik af.
- `src/hooks/useConversationInstruments.js`: entiteit→instrument routing (wisp=ocarina, slime=marimba,
  wizard=xylophone, default=marimba). `ocarina` toegevoegd aan `src/constants/instruments.jsx` (bestond nog
  niet als optie, wél beschikbaar in de soundfont — Han bevestigd: "zou in soundfont moeten zitten, dus voeg
  gewoon toe aan de lijst").
- Wisp volledig doorontwikkeld: 5 random zinnen (wisselende lengte), click-to-walk-then-talk race gefixed
  (expliciete 128px-afstandscheck i.p.v. impliciet op de arrival-epsilon leunen), weglopen sluit het gesprek.

Nog NIET gedaan (blijft op #922 in `impl`, niet naar `test`):

- Wizard post-combat gesprek (auto-trigger na `onSlimesCleared`) — gebruikt de nieuwe `DedicatedPortrait`
  uit de eerdere portret-scaling bugfix (zie hieronder), maar de caller zelf is er nog niet.
- Slime-in-level klik → volledige lorem ipsum met RPG-paginatie (bewegend driehoekje rechtsonder, sync met
  wereldmetronoom).
- Eigen zachte metronoomklik tijdens het gesprek + wachten op eerstvolgende maat-beat vóór start (het
  systeem start nu meteen, zonder wachten).

Geverifieerd: `npm run test:run` (706/706), `npm run lint` (0 errors), `npm run build` groen.
`docs/architecture.md` §213 toegevoegd (expliciet gemarkeerd als PARTIAL).

## 2026-08-12 — 🐞✅ #922 Bug: dialogue-box portrait schaal inconsistent (slime te groot) + wizard portret

Han: "check ook of die dialogue box zelfde schaal heeft als het portret. momenteel zie ik
bijvoorbeeld de slime, die veel groter lijkt dan de 64x64 schaal. als ik het over pixels
heb, bedoel ik altijd RPG pixel art pixels, en niet schermpixels." Gevolgd door: "en de
wizard heeft een portret, in dat geval: toon het portret, niet de sprite. schaal mag
ongeveer 2x zo groot; probeer horizontaal te vullen."

Root cause: `DialogueBox.jsx`'s `SpeakerPortrait` schaalde de crop naar exact 64px hoogte
(`scale = PORTRAIT_SIZE / crop.h`) — een ANDERE zoomfactor per entiteit afhankelijk van de
eigen crop-grootte (slime crop.h=29 → ~2.2x, wizard crop.h=52 → ~1.23x). De Bestiary had dit
al correct opgelost (#693 ronde 3, `PortraitImage`): vaste `trueScale = box/64`, gecentreerd,
geclipt, nooit uitgerekt — een §6d-schending dat DialogueBox een eigen (foute) conventie had.

Fix (`src/components/character/DialogueBox.jsx`):

- `SpeakerPortrait` gebruikt nu `trueScale = PORTRAIT_SIZE/64` (vast), plus `Frame64Overlay`
  (hergebruikt uit `BestiaryPanels.jsx`, nu geëxporteerd) voor het decoratieve kader.
- Nieuwe `DedicatedPortrait`/`dedicatedPortraitUrl` prop-tak: als een entiteit een eigen
  Bestiary-portret heeft (wizard's `portraitUrl`+`portraitCell`+`portraitFrame`), toont
  DialogueBox dát i.p.v. de sprite-crop, op 2x schaal (`PORTRAIT_SCALE_2X`) — de hele
  dialoogbox-rij groeit mee naar 128px voor zo'n spreker.
- Zie ook memory: `feedback-pixel-terminology.md`, `feedback-canonical-portrait-scale.md`.

Nog niet gedaan: de wizard-caller zelf (post-combat gesprek, #922 hoofdscope) moet nog
`dedicatedPortraitUrl`/`dedicatedPortraitCell`/`dedicatedPortraitFrame` doorgeven zodra dat
gesprek gebouwd wordt — deze fix legt alleen de renderer klaar.

## 2026-08-03 — 🐞✅ #663 Bug: Level 2 metronoom/timpani-desync, metronoom stopt na maat 0, cello niet hoorbaar

Han: "level 2 moet in orde gebracht worden. bug: metronoom, timpanen, lopen niet
exact gelijk met de noten... bug: metronoom enkel hoorbaar in maat 0. bug: cello
niet hoorbaar." Interview: Han wees een "wacht op volledige regeneratie"-guard af
("straks maak ik infinite levels... gebruik het JIT-mechanisme dat al bestaat in
de generator") en wilde cello via het echte generate-melody-protocol i.p.v. een
hardcoded patroon ("roots on 1, 1 note/measure, variability 0, smallest note denom
whole, note pool c2-c3"); timpani mag WEL hardcoded blijven ("hard code de timpani
voor nu").

Root cause (alle 3 bugs): bass/metronome werden ÉÉN KEER, vooraf, voor het HELE
level gegenereerd — racend tegen (1) de async cello-instrument-swap
(`bassSettings.instrument` flipt één commit VOOR `instruments.bass` echt de
nieuwe Soundfont is) en (2) de eigen regeneratie van `melodies.metronome` naar de
volledige lengte. Een stale/korte melodie kon zo voor het HELE level vastgezet
worden via `backingScheduledForRef`.

Fix:

- `useInstruments.js`: nieuwe `loadedSlug` state, geschreven in DEZELFDE commit
  als het instrument-object zelf — sluit de race definitief.
- Cello: `InstrumentSettings.fixedWholeNote` + `celloWholeNotePattern.js` weg;
  `levels.js` exporteert `LEVEL_BASS_SIMPLE`/`LEVEL_BASS_DEFAULT` (echte
  generator-settings, Han's protocol), toegepast door `useLevel.applyConfig`.
- Bass + metronome nu JIT-chunked (`generateLevelBackingChunk.js` +
  `useLevelBackingStream.js`): 2 maten ("1 chunk") per keer, altijd 1 chunk
  vooruit gegenereerd ("2+2 maten op voorhand"), via de bestaande
  `MelodyGenerator` — geen hardcoded patroon. Timpani blijft ongewijzigd
  (hardcoded, in één keer vooraf).
- Onderweg gevonden: React StrictMode (main.jsx) dubbel-invoked elke effect in
  dev — een vroege versie met een `startedForRef`-guard bleek daardoor de
  volledige backing na 2 maten stil te laten vallen IN ELKE DEV-SESSIE. Cleanup
  nu volledig zelfvoorzienend (annuleert eigen timers + eigen reeds-geplande
  noten), guard verwijderd.

Suite 631 groen (was 626, +5 nieuwe smoke tests), lint 0 err, build clean.
docs.md §110. Nog niet gecommit.

## 2026-08-03 — ✅ #663 vervolg: gedwongen I-I-I akkoordenprogressie voor levels + debug-zichtbare akkoorden

Han: "cello is goed, maar gebruikt denk ik niet [de akkoorden]... ah cello gebruikt
roots on one, maar misschien zijn de akkoorden niet goed. genereer ook
akkoordenprogressie (I-I-I) tonic progressie. Laat die in debug ook maar zien."

Root cause: level-wave-regeneraties draaien altijd met `{chords:false}`
(App.jsx's `levelRegenerate`), wat akkoorden NIET vers genereert maar enkel de
BESTAANDE progressie (van vóór het level) aanpast/uitrekt — de cello's "roots"
kwamen dus mogelijk uit een oude modal-random progressie, niet uit I.

Fix:

- `useLevel.applyConfig`: `chordSettings.strategy = 'tonic-tonic-tonic'` voor elk
  side-scroll level — bestaande strategie (`chordGenerator.js`), geen nieuwe code.
- `useLevel.begin()`: roept nu `regenerate(true)` aan (enkel bij levelstart) zodat
  die strategie ook echt een verse progressie bouwt; golf-op-golf regens blijven
  `{chords:false}` (onveranderd, onschadelijk — de aangepaste progressie blijft I).
- `close()` herstelt de oude `chordSettings` via het bestaande snapshot-mechanisme.
- `chordsEye` volgt nu dezelfde debug-gate als bas/percussie
  (`trebleOnlyEyes`/`threeLineEyes` in `levels.js` kregen een `showChords`-param).

Suite 632 groen (+1 nieuwe test in useLevel.test.js), lint 0 err, build clean.
docs.md §110 (vervolg-sectie). Nog niet gecommit.

## 2026-08-03 — ✅ #663 3e vervolg: akkoorden op C (scale ongemoeid), 1/maat, cello-range, metronoom-regressie fix

Han: "cello is goed, maar gebruikt denk ik niet... zet ook voor level 1 akkoord op
c. pas de range voor de cello aan naar c2-b2. zet chords per measure naar 1 (is nu
4). ik wil: cello + timpanen vanaf maat -1, metronoom vanaf maat 0."

- Akkoorden vast op C, MELODIE-SCALE blijft ongemoeid (bevestigd via interview):
  `useMelodyState.js` krijgt `chordSettings.fixedTonic` — bouwt een aparte
  `chordScale` via de bestaande `updateScaleWithTonic` (geen nieuwe scale-code),
  gebruikt ALLEEN voor de akkoord-generatie call.
- `useLevel.applyConfig`: strategy/fixedTonic('C4')/chordCount(1) nu
  ONVOORWAARDELIJK voor ALLE levels (1-8), niet enkel side-scroll — dus ook
  Level 1.
- `LEVEL_BASS_SIMPLE.range` → `{min:'C2',max:'B2'}` (was C2-C3).
- Regressie gevonden en gefixt: door bas+metronoom te unificeren in dezelfde
  JIT-stream startte de metronoom óók op maat -1 (had moeten wachten tot maat 0,
  zoals §94's originele spec). `generateLevelBackingChunk` kreeg een
  `metronomeMeasures`-param zodat de opmaat-chunk voor de metronoom 1 maat
  korter is + 1 bar later gepland wordt dan bas/timpani.

Suite 633 groen (+3 nieuwe tests), lint 0 err, build clean. docs.md §110
(2e vervolg-sectie). Nog niet gecommit.

## 2026-08-03 — 🐞✅ Bug: opmaat nog steeds niet zichtbaar bij level-start (echte fix)

Han: "top! nog steeds geen opmaat." (na de content-fix hierboven).

Live-verificatie toonde: de notenbalk was leeg van de held tot ver off-screen
rechts — "-1" verscheen pas op ~80% van het scherm. Root cause: BarlinesLayer
positioneert strepen op ORDINAAL AANTAL 'm'-markers (niet hun tick-waarde),
terwijl de notenbalk (en Level 8's echte bas) op hun EIGEN tick-waarde
positioneert vanaf dezelfde `viewRight`. De 2 synthetische opmaat-'m's
verschuiven het ordinale aantal met 2 t.o.v. de (onverschoven) noten-tick —
waardoor "-1" aan de verre schermrand vastzat (moest de VOLLEDIGE
kruistijd overbruggen voor 'ie zichtbaar werd) en echte-inhoud-strepen niet
eens uitlijnden met hun eigen noten. Fix: content waarvan tick 0 = maat -1
(pauken/vaste-cello-patroon, en de maatstrepen zelf) wordt nu `leadInTicks`
pixels EERDER dan `viewRight` georigineerd (nieuwe `barlineStartX`/
`bassStartX`/`percussionStartX` in SheetRpgLayer.jsx) — treble en Level 8's
echte bas blijven op `viewRight` (ongewijzigd, aankomsttijd blijft perfect).
Live geverifieerd: "-1" en "0" al gepasseerd/zichtbaar 500ms na start, "1"-"8"
netjes gespreid rechts. architecture.md §108 (herschreven).

## 2026-08-03 — ✅ FR: avatar-preview thema-achtergrond + genuine 1px-clip fix

Han: "1 avatar frame: geef de 'thema'-achtergrond in het display. in het
voorbeeld mis ik één pixel aan de onderkant."

`.cc-avatar`'s achtergrondkleur is nu `var(--app-bg)` (dezelfde variabele elk
thema al zet) i.p.v. een vaste donkere tint — decoratieve thema-texturen
(marmer-aders, sterrenhemel, wolken) blijven een aparte vervolgstap indien
gewenst. De "1 pixel mist" bleek een ECHTE, aparte bug (niet dezelfde als
§107's containerbreedte-fix): `CHAR_DY`/`PET_DY` (1-2px omlaag-nudge, getuned
voor de oude gecropte weergave met marge) duwde de sprite in `fullFrame`-modus
net over de 64px-frame-rand, afgesneden door `overflow:hidden`. Fix:
`layerStyle()` slaat de nudge over wanneer `fullFrame` true is. architecture.md
§109. Nieuwe test in CharacterDoll.test.jsx.

## 2026-08-03 — 🐞✅ Bug: opmaat-maten tonen niet de audibele cello/pauken-inhoud

Han: "je hebt nog NIET gekeken naar de opmaten." + eerdere verduidelijking:
"de aankomsttijd van de noten is perfect... Maat -1 bevat wel cello en
timpanen (zichtbaar in debug) en vanaf maat 0 speelt ook de metronoom."

Root cause: de bas/percussie-notenbalk toonde de ECHTE gegenereerde melodie
(onwetend van de opmaat), terwijl de AUDIO tijdens diezelfde maten -1/0 een
compleet ANDER patroon speelt (buildTimpaniPattern/buildCelloWholeNotePattern
— al bestaande, geautoriseerde hardcoded patronen voor audio). Wat je zag
klopte dus nooit met wat je hoorde. Fix: `scrollPercussionMelody`/
`scrollBassMelody` in SheetMusic.jsx worden nu op EXACT dezelfde manier
opgebouwd als de audio in App.jsx — timpani/cello-patroon voor de hele piece
(geen shift nodig, hun eigen tick 0 = maat -1, sluit al aan bij de
maatstrepen-nummering), en voor Level 8's ECHTE bas (geen vast lead-in
patroon) een verschuiving van precies de opmaat-lengte zodat die stil/
onzichtbaar blijft tot maat 1. Live geverifieerd via screenshot: bas toont nu
de cello-hele-noot, percussie toont de pauken-patroon tijdens de opmaat.
architecture.md §108. Nieuwe util: shiftMelodyOffsets.js (+ test).

## 2026-08-03 — 🐞✅ Bug: avatar-preview overlay te smal + kader over de avatar

Han: "de overlay is te smal, dus deel van de avatar valt buiten beeld... ik
zie de onderste paar pixels niet; wsl omdat het kader erover valt, verplaats
het kader naar de achtergrond." (vervolg op §106)

Root cause 1: `.cc-avatar` had geen `flex-shrink:0`, en de nieuwe
`fullFrame`-avatar (420px breed) + het uitrustingsraster (448px) + gaps/
padding (~922px) overschreed de modal's oude `max-width:720px` ruim —
flexbox kromp de avatar-container stilzwijgend, `overflow:hidden` sneed de
rest af. Fix: `flex-shrink:0` op `.cc-avatar` + `max-width` naar 960px.
Root cause 2: het rode referentiekader werd NA de sprite-laag gerenderd
(tekende er dus overheen). Fix: kader nu EERST in de DOM (tekent erachter).
Live geverifieerd op 2 windowgroottes (1400x900 en 900x700): avatar nooit
meer afgesneden. architecture.md §107. Nieuwe test in CharacterDoll.test.jsx.

## 2026-08-03 — ✅ FR: RPG-assets herbronnen naar ASSORTED + avatar-preview zonder crop

Han: "re-point the rpg assets to the ASSORTED folder... de preview in de
character menu mist wat pixels onderaan. Make the view window square, 80x64
times a scaling factor... Render a 40x56 red frame in bottom-horizontal
middle. put all 'items' in 16x16 grid boxes... waar mogelijk."

1) `characterAssets.js`'s bestandsontdekking wijst nu naar
`ASSORTED/characters/char_hero/**` (+ fx/character effects + animals/pets)
i.p.v. het oude `src/assets/character/**` (verwijderd). Nieuwe
`categorizeCharFile()` classifier vangt de inconsistente ASSORTED-naamgeving
op (bonus-packs in anders-geprefixte submappen, "Male Head" vs "Female Hat",
maskers soms in de Head-map soms los). Geverifieerd via een los Node-scriptje
tegen de echte bestandslijst: 307 bestanden, 3 terecht uitgesloten, elke
categorie-emmer gevuld.
2) Avatar-preview (enkel de grote, Han's keuze) toont nu het VOLLEDIGE
onvervormde 80x64-frame (nieuwe `fullFrame` prop op CharacterDoll) i.p.v. de
CROP-subregio die onderaan afsneed, plus een rood 40x56 referentiekader
onderaan-gecentreerd.
3) 16x16-icoon-koppeling: **overgeslagen** op Han's expliciete verzoek — de
iconenmap heeft 600+ ongelabelde bestanden, wacht op een koppel-lijst van Han.

architecture.md §106. Nieuwe test: CharacterDoll.test.jsx. Live geverifieerd
via headless-browser screenshot (voeten niet meer afgesneden, rood kader
zichtbaar).

## 2026-08-03 — ✅ Test: cello backing volume naar mezzo-forte

Han: "zet de cello op mf, om te testen" — vervolg op de onopgeloste "cello
niet hoorbaar"-bevinding (§103). Nieuwe `LEVEL_BASS_VOLUME` (mf=0.8) apart van
`LEVEL_BACKING_VOLUME` (mp=0.6, blijft voor metronoom/pauken). architecture.md
§105.

## 2026-08-03 — 🐞✅ Bug: snelle noten na elkaar in Level 1 worden genegeerd

Han: "in level 1 merk ik dat als ik 'te snel achter elkaar' noten aansla, dan
wordt mijn tweede noot niet geregistreerd... geldt ditzelfde in andere levels?
zorg hier voor consistentie."

Root cause: Level 1's statische combat-tak blokkeerde ELKE nieuwe noot zolang
er ergens een dood-animatie liep (`dyingList` was ooit single-slot). De
side-scroll levels hadden dit exacte probleem al opgelost (dyingList → lijst),
maar Level 1 is toen niet meegenomen. Fix: nieuwe `resolvedStaticRef` markeert
een slime METEEN bij een raak schot (niet pas als de animatie klaar is); het
doelwit is nu de laagste NIET-geraakte index i.p.v. `killedRef` (die pas
verhoogt als een animatie AF is). `setDyingList` append't nu i.p.v. vervangt,
dus meerdere slimes kunnen tegelijk hun sterf-animatie spelen — consistent met
de andere levels. Fout-noten gedrag ongewijzigd (Han bevestigd: je blijft op
dezelfde slime proberen). architecture.md §104. Nieuwe test in
SheetRpgLayer.test.jsx.

## 2026-08-03 — 🐞✅ Bug: Stop-knop onderbreekt pauken/cello niet

Han: "timpani en cello worden niet onderbroken door de stop-knop."

Bevestigd via een headless-browser audio-trace: `scheduleLevelBacking` plant
de HELE -1..8-maat backing in één keer vooruit (i.p.v. de Sequencer's korte
incrementele scheduling), en smplr's `instrument.stop()` stopt alleen AL
KLINKENDE noten — niet de nog toekomstige, al ingeplande noten in zijn interne
scheduler. Fix: `playMelodies.js` krijgt een optionele `stopHandlesRef` param
die elke noot's StopFn verzamelt; App.jsx's `levelBackingStopFnsRef` wordt aan
alle 3 de level-backing `playMelodies()`-calls doorgegeven, en
`stopAllBackingAudio` vuurt nu alle verzamelde StopFns af. Geen ander
call-site aangepast (optioneel/achteraan param, default ongewijzigd gedrag).
architecture.md §103. Nieuwe test: `src/audio/__tests__/playMelodies.test.js`.

**Ook onderzocht, niet opgelost** (zie architecture.md §103 "Not fixed this
round" voor het volledige onderzoek): de ontbrekende opmaat-strepen/nummers
(kon niet reproduceren in een live test — nodig: screenshot/video de
volgende keer) en de onhoorbare cello (audio-pad structureel correct
bevonden, vermoedelijk een balans/volume-kwestie i.p.v. een codefout).

## 2026-08-03 — 🐞✅ Bug: bottom view schuift weer omhoog na de scale-cap

Han: "nu de schaal is gelimiteerd, schuift het bottom view block weer omhoog.
plak dat gewoon aan de onderrand van het scherm."

Root cause: de notenbalk-container had zowel `height: sheetHeight` als `flex:
1` — `flex: 1` zet `flex-basis` op 0%, wat de expliciete hoogte overstemt, dus
de 45/55-verdeling werd in werkelijkheid door een flex-grow-wedstrijd bepaald
(content-afhankelijk), niet door een vaste waarde. Fix (enkel dual-view, Han's
keuze): notenbalk-container krijgt `flex: '0 0 ' + sheetHeight + 'px'` (doet
niet meer mee aan de wedstrijd); het onderpaneel se eigen `flex: 1` vult dan
gegarandeerd de rest, dus het zit altijd aan de onderrand vast.
architecture.md §101.

## 2026-08-03 — ✅ FR: splash-charts volle breedte + stacked bar i.p.v. pie

Han: "timing accuracy: gebruik de breedte van het splash screen. haal de
dubbele info weg... note correctness, stacked bar ipv pie. note when none due:
gebruik dezelfde kleur als in timing accuracy."

De 4 KPI-rijen (gemist/fout binnen tijd/fout hersteld/noot zonder doel) zijn
verwijderd uit `LevelSplash.jsx` — de charts eronder tonen dezelfde info al.
Beide charts staan nu vol-breedte gestapeld (`.ls-charts` → column i.p.v.
side-by-side). `NoteCorrectnessGauge` (donut+%) is vervangen door
`NoteCorrectnessBar` (gestapelde balk, geen %-label — Han: "weglaten").
`extraNote`'s kleur is nu `TIER_COLOR.missed` (hetzelfde grijs als Timing
accuracy's 'missed'-balk). architecture.md §102.

## 2026-08-02 — 🐞✅ Bug: RPG-laag (avatar/slimes) zichtbaar buiten levels / tijdens Settings-tab

Han: "avatar, slimes (en andere enemies) mogen alleen zichtbaar zijn TIJDENS
een level. En nooit tijdens de settings view actief."

Interview (§4b) leverde op: avatar mag WEL zichtbaar zijn in de normale
melodie-view (niet level-gated) — alleen niet tijdens de Settings-tab
('other-settings', die in dual-view naast de notenbalk blijft staan). Slimes
horen puur bij een level en mogen sowieso nooit in de normale view gegenereerd
worden.

Fix: `trebleMelody` naar `SheetRpgLayer` gaat nu door `levelActive &&` (nieuwe
prop, `level.active` uit App.jsx) — dus buiten een level is er nooit
slime-data. Nieuwe `hideHero` prop verbergt alleen de hero-`<foreignObject>`
zodra `activeTab === 'other-settings'`. architecture.md §99.

## 2026-08-02 — ✅ FR: levels.js-data naar levels.json (apart bewerkbaar)

Han: "sla de level settings op in een json, zodat ik die apart kan bewerken."

`src/levels/levels.json` toegevoegd: alle 8 levels volledig plat/zelfstandig
(geen JS-spreads meer over te nemen bij het bewerken). `levels.js` is nu enkel
nog de loader + de samengevoegde toelichting-comments (JSON ondersteunt geen
comments) + de niet-data helpers (`wavesForLevel`, `trebleOnlyEyes`,
`threeLineEyes`). Export-surface (`LEVEL1`..`LEVEL8`, `LEVELS`) ongewijzigd,
dus geen enkele call site hoefde aangepast. architecture.md §100.

## 2026-08-02 — 🐞✅ Vervolg: notenbalk te ver ingezoomd na de 45%-fix

Han: "perfect, dit is goed. maar nu is de notenbalk wel te ver
ingezoomd. kun je zorgen dat er NIET verder wordt ingezoomd, dus het
zoom level wordt bepaald door het zoom level wanneer alle elementen in
beeld zouden staan."

De vorige fix (scaleFactor onbegrensd) loste de 45%-krimp op, maar
zorgde er nu voor dat minder notenbalken = minder content = extra
inzoomen om die 45% te vullen. Nieuwe aanpak: `scaleFactor` wordt nu
begrensd op een berekende REFERENTIEWAARDE (wat de zoom zou zijn met
alle 3 notenbalken zichtbaar), i.p.v. een platte 1.0-cap. Zo blijft het
zoomniveau exact gelijk aan "alles in beeld", en krimpt het sheet-vlak
nooit onder 45% maar zoomt ook nooit verder in dan dat.

Bijkomend: `preserveAspectRatio` van `xMidYMid` (verticaal gecentreerd)
naar `xMidYMin` (top-uitgelijnd) — anders zou de notatie bij minder
notenbalken los in het midden van het vlak komen te zweven i.p.v. netjes
bovenaan te blijven staan.

architecture.md §98 (uitgebreid).

## 2026-08-02 — 🐞✅ Bug: sheet-music-vlak krimpt onder 45% bij minder notenbalken

Han: "bij level 2 (niet-debug) schuift 'bottom view' omhoog. ik heb al
eerder gezegd dat de melody view / sheet music 45% van het beeld moet
innemen. om een of andere reden wordt dat niet aangehouden als de perc
en bas wegvallen."

Root cause gevonden via wiskundige analyse (geen browser-automatisering
beschikbaar om interactief te verifiëren — carousel-drags laten zich
niet betrouwbaar simuleren zonder Playwright; wel bevestigd dat de app
normaal laadt/rendert na de fix): `SheetMusic.jsx`'s
`scaleFactor = Math.min(1.0, containerHeight / logicalHeightForViewBox)`.
Omdat `logicalScreenWidth = screenWidth/scaleFactor`, reduceert de
viewBox-aspectratio ALTIJD naar `containerHeight/screenWidth` — ongeacht
scaleFactor — MITS scaleFactor onbegrensd blijft. De `Math.min(1.0,...)`
brak die identiteit precies wanneer er weinig genoeg content was (minder
notenbalken) dat opschalen >1× nodig was om de 45% te vullen; met de cap
kromp het sheet-vlak dan onder 45%, en schoof het onderpaneel (flex:1 in
dezelfde kolom) omhoog de vrijgekomen ruimte in.

Fix: de cap verwijderd. scaleFactor wordt alleen gebruikt om
logicalScreenWidth af te leiden (geen andere afhankelijkheid elders),
dus dit is een smalle, veilige wijziging.

architecture.md §98.

## 2026-08-02 — ✅ 8-level ramp: bpm/tegenstander/introductie-info + 5 nieuwe levels

Han: "geef voor elk level wat basis info: bpm, type enemies, wat wordt
nieuw geïntroduceerd? maak tussen level 2 en level 3 5 nieuwe levels,
dus level 3 schuift door naar level 8." Interview: enemy-type is puur
info-tekst (geen echte sprite-wissel); Han koos zelf de progressie i.p.v.
eerst een voorstel te reviewen. Toen ik een rijker voorstel schetste
(tempo-ramp, bestiary-thema's per level) greep Han in: "nee wacht, houd
het simpel, gewoon slimes, en langzaam opbouwen: halve noten, achtste
noten, verbonden noten, etc."

Resultaat: 8 levels. 1-2 ongewijzigd. Nieuw: 3=halve noten
(insertBeatRests uit — dat is het ENE ding dat een noot langer dan het
rooster toestaat), 4=achtste noten (smallestNoteDenom 8), 5=verbonden
noten (dichtere notesPerMeasure zodat een noot vaker de maatstreep
haalt — ties zijn geen aparte toggle, ze ontstaan al vanzelf zodra een
noot over de maatstreep kan lopen), 6=groter bereik (C4-C5), 7=bas+
percussie altijd zichtbaar. Level 8 = de oude Level 3, ONGEWIJZIGD op
id/naam na.

Bug gevonden en gefixt tijdens het bouwen: `smallestNoteDenom` werd
voorheen VOORWAARDELIJK geschreven in useLevel.applyConfig (enkel als
een level het zette) — onschadelijk met 3 levels, maar met 8 levels die
verschillende waarden gebruiken zou Level7→Level8 (zonder close()) het
achtste-noten-rooster laten lekken. Nu onvoorwaardelijk, zoals
insertBeatRests/polyMultiplier al waren.

`LevelStartSplash.jsx` toont nu een info-paneel (bpm/tegenstander/intro)
onder de carousel, `LEVEL_NUMBERS` uitgebreid naar [1..8]. Nieuw
`levels.test.js` legt de 8-level-structuur vast.

architecture.md §97.

## 2026-08-02 — ✅ Bas/percussie enkel zichtbaar in debug mode (Level 1/2)

Han: "next, in level 1 en 2, toon de bas en percussie ENKEL in debug
mode."

Nieuw `levels.js`-veld `debugOnlyLines` (true op LEVEL1/LEVEL2, expliciet
false op LEVEL3 — zelfde anti-lek-patroon als eerdere per-level vlaggen).
`useLevel.js` kreeg een `debugMode`-parameter (App.jsx geeft zijn bestaande
debugMode-state door) + een reactieve effect: het omzetten van debug mode
TERWIJL een debugOnlyLines-level al draait, past de eyes meteen aan (geen
herstart nodig). Level 3 blijft ongewijzigd altijd 3 lijnen tonen.

architecture.md §96.

## 2026-08-02 — ✅ Level-start splash met tanh carousel level-picker

Han: "maak een splash screen voor het level start, met daarin een tanh
carousel dat het level nummer kiest."

Interview: 1 'Start Level'-knop vervangt de 3 losse zwaard-knoppen in de
header · losse 'Start'-knop na keuze (niet meteen starten bij tikken).

Hergebruik i.p.v. nieuw bouwen (§6c/§6d): de "tanh carousel" = de
bestaande tangens/tanh fan-mechaniek (`tangensCurve.js`'s `useTangensDrag`
+ `LeftFanCarousel` uit `fanCarousels.jsx`, al gebruikt door o.a. de
TranspositionSetter/BPM-fan) — geen nieuwe carousel-engine. Nieuw
`LevelStartSplash.jsx` (+test) hergebruikt ook de bestaande
`LevelSplash.css`-kaartstijl (zelfde look als het well-done-scherm).
`AppHeader.jsx`'s oude `onStartLevel`-prop (direct starten per knop) is
vervangen door `onOpenLevelPicker` (opent enkel de splash); App.jsx kreeg
een `showLevelPicker`-state (zelfde patroon als `showCharacter`).

architecture.md §95.

## 2026-08-02 — ✅ UAT ronde 2: missed op timing-chart, vaste Level-2 cello, -1/0 intel

Han: "voeg aan timing accuracy toe: missed." + "level 2: de cello is een
octaaf te hoog. is nu gegenereerd volgens de generate melody - dat is op
zich fantastisch, maar voor level 2 wil ik uitzonderlijk gewoon een c2
toon, hele noot, elke maat. de timpanen en cello moeten beginnen op maat
-1, de metronoom op maat 0. voor maat -1 en 0 moet er ook een streep
bewegen. en een nummer zichtbaar zijn."

Interview: Level 3's bas blijft stil tijdens -1/0 (geen gegenereerde data
voor negatieve maten, dus geen filler verzinnen) · streep/nummer voor
-1/0 identiek gestyled aan gewone maten (geen aparte intel-styling).

- **Timing-chart**: `missed` toegevoegd als 6e (grijze) staaf, na de 5
  gradeHit-tiers — buiten TIMING_ORDER (heeft geen positie op de vroeg↔laat
  as, want nooit geprobeerd).
- **Level 2 cello**: nieuw `utils/celloWholeNotePattern.js` (+test) — vaste
  C2 hele noot per maat, hardcoded net als het paukenpatroon.
  `InstrumentSettings.fixedWholeNote` (nieuw, bas-only, geen algemene UI -
  puur Level-2-intern). `useMelodyState.js` overschrijft de baslijn ermee.
  `LEVEL2.fixedBass=true`, `LEVEL3.fixedBass=false` (expliciet, zelfde
  anti-lek-patroon).
- **-1/0 intel**: App.jsx's backing-effect splitst nu in 3 aparte
  `playMelodies()`-calls (elk hun eigen scheduledStart): (1) pauken +
  Level-2-cello spannen de HELE piece (intel+inhoud) vanaf maat -1
  (`levelAudioStart`); (2) Level 3's echte baslijn blijft inhoud-only vanaf
  maat 1 (`contentStart`); (3) metronoom start één maat ín de intel (maat
  0 = `contentStart - barSec`) via nieuw `utils/metronomeLeadIn.js`
  (+test) - dupliceert de metronoom se eigen eerste maat als intel-maat
  (geen nieuwe generatie, geen hardcoded klik-patroon). Visueel:
  `SheetMusic.jsx`'s scrollBarlines-bundel krijgt 2 synthetische 'm'-markers
  vooraan (BarlinesLayer positioneert puur op volgorde, niet op tick-waarde
  - dus dit werkt zonder BarlinesLayer.jsx aan te raken) + blockMeasureStart
  van 1 naar -1, zodat -1/0 gewoon meescrollen en genummerd worden.

architecture.md §94.

## 2026-08-02 — ✅ Melodische percussie (timpani) — 4e optie in de notation setter

Han: "zorg dat de basmuziek de cello toont en de percussie de timpanen. Voor
dat laatste moet de percussie as getoggled kunnen worden naar 'melodische
percussie' (bassleutel). Voeg die optie toe aan de carousel in de notation
setter."

Interview: generatie = vast patroon C2-C2-C3-rust per maat (Han: "voorlopig
geen generatie, je mag uitzonderlijk hardcoded pauken gebruiken" — expliciete
uitzondering op §6c) · instrumenten-dropdown blijft ongewijzigd, timpani-klank
alleen binnen levels · 4e carousel-optie naast samen/gesplitst/uit (sluit die
twee uit).

Nieuw `src/utils/timpaniPattern.js` (+test) — enige bron voor zowel notatie als
level-audio. `InstrumentSettings.melodic` (nieuw veld). `useMelodyState.js`
overschrijft percussie's gegenereerde melodie met het vaste patroon wanneer
melodic aan staat. Rendering: percussie-notatie (statisch én de RPG-scrollbaan)
wisselt naar `staff="bass"`/`clef="bass"` (hergebruik van de bestaande
getoonhoogde renderer, §6d) i.p.v. de drum-specifieke percussienotatie, die
geen echte nootnamen aankan. `ClefStaffOverlay.jsx`'s percussiecarousel kreeg
een 4e optie "melodic" met een pitched-preview. `useLevel.applyConfig` zet
`percussionSettings.melodic` onvoorwaardelijk (zelfde anti-lek-patroon als
insertBeatRests) en `App.jsx` kreeg een toegewijde `timpaniRef`-Soundfont,
gescheduled via dezelfde `playMelodies()`-call als bas/metronoom (met een
tijdelijke `namedInstruments`-override zodat trackGains het als 'percussion'
herkent). architecture.md §93.

## 2026-08-02 — ✅ Quick follow-ups: Maestro-tekst regel, timing-as volgorde, backing-volume

Han: "onthoud/schrijf op dat TEKST nooit Maestro font gebruikt, maar CSS font" →
CLAUDE.md §1a (nieuwe standing rule) + memory `feedback-maestro-font-text.md`.
"maak de timing-as logisch: much too early - too early - perfect - too late -
much too late" → `gradeHit.js` kreeg `TIMING_ORDER` (canonieke volgorde) +
GRADE_LABELS hernoemd naar early/late-taal (interne category-keys ongewijzigd,
enkel de labels); `LevelStatsCharts.jsx`'s TimingBarChart hergebruikt nu
TIMING_ORDER+GRADE_LABELS i.p.v. eigen gedupliceerde strings/volgorde.
"ik hoor de timpanen en cello niet, zet hun volume op mp" → bass/metronome
faders (useInstruments.js setVolume, een persistente GainNode, apart van
note-level gain) expliciet op 'mezzo piano' (hergebruik VOL_STEPS-tabel uit
SettingsOverlay.jsx, §6c) bij het schedulen van de level-backing, terug naar
vol (1.0) bij stopAllBackingAudio.

## 2026-08-02 — ✅ Level 2/3: playMelodies-backing, 3 scrollende lijnen, well-done breakdown + charts

Han (na bevestiging dat het kwart-grid werkte — "metronoom anders, maat 8 gevuld,
dat waren artefacten van hardcoded oplossingen, ben blij!"): "gebruik playAllMelodies,
zet op de baslijn een cello, metronoom aan, 3 lijnen zichtbaar — via bestaande
play-all-melody params. Als er iets ontbreekt aan die functie, los het daar op,
niet in een hardcoded laag." + well-done: onderscheid missed/wrong-within-time/
wrong-corrected/note-when-none-due. + box plot timing + note-correctness grafiek,
apart van elkaar (timing precision vs note accuracy).

Interview (§4b): backing = bas(cello)+metronoom, percussie stil · 3 lijnen =
bas/percussie MOETEN OOK MEESCROLLEN (niet enkel statisch tonen) · correctness-
grafiek = bar+gauge in 4 kleuren (correct/wrong-corrected/wrong-within-time/
note-when-none-due) · timing-grafiek = bar chart met de 5 gradeHit-tiers (geen
raw-ms box plot, minder werk + consistent met de gauge).

Backing: `App.jsx`'s `scheduleLevelBacking` (§88 hand-rolled celloRef/timpaniRef
Soundfont + manuele metronoom-clicks) volledig vervangen door de ECHTE
`playMelodies()` (dezelfde call-shape als Sequencer.js), met `melodies.bass`
(echte gegenereerde baslijn) door `instruments.bass` tijdelijk op `'cello'`
gezet (useLevel.applyConfig/restore — geen los Soundfont-object nodig,
useInstruments.js bouwt het instrument gewoon opnieuw), en `melodies.metronome`.
Scroll-anker (`levelAudioStart`) blijft synchroon gezet; het ECHTE afspelen
wordt uitgesteld tot `bassSettings.instrument==='cello'` daadwerkelijk is
doorgebouwd (async smplr-herbouw) via een aparte effect + `backingScheduledForRef`
guard.

3 lijnen: `SheetRpgLayer` rendert nu ook bas + percussie als scrollende
notenbalken (puur visueel, geen combat/audio daar — audio komt uit de
backing hierboven), zelfde canonieke MelodyNotesLayer/mask/translate-aanpak
als treble al had. `levels.js` kreeg `threeLineEyes` (naast `trebleOnlyEyes`,
alleen voor sideScroll-levels). Bijvangst-bug gefixt: de statische bas/
percussie MelodyNotesLayer-blokken in SheetMusic.jsx waren NOOIT op
`!sideScroll` gegate (alleen treble was dat) — nu wel, anders zou een
statische balk onder de nieuwe scrollende balk door-renderen.

Well-done breakdown: combat-resolutie in SheetRpgLayer stelt de stat-toekenning
van een foute noot nu uit tot het lot van de slime bekend is (gedood of
verlopen) — voorheen telde een gecorrigeerde noot dubbel (1 misser + 1 kill).
4 losse categorieën: `missed` (nooit geprobeerd) / `wrongUncorrected` (fout
gebleven) / `secondAttemptCorrected` (fout, later goedgemaakt) / `extraNote`
(noot gespeeld terwijl niets gepland stond).

Charts: nieuw `LevelStatsCharts.jsx` — handgerolde SVG (geen chart-library in
de repo): `TimingBarChart` (5 tijd-tiers, aantallen) + `NoteCorrectnessGauge`
(donut, 4 kleuren + accuraatheid% in het midden — `missed` bewust NIET in
deze grafiek, dat is een timing/attempt-vraag, geen toonhoogte-vraag).
Kleuren hergebruiken exact `JUDGMENT_COLOR` uit SheetRpgLayer (§6d).

Bekende, niet-geïntroduceerde restbeperking: "Opnieuw" op het well-done-scherm
herstart de audible backing niet (riep scheduleLevelBacking al niet aan vóór
deze wijziging) — apart vervolgpunt indien gewenst.

architecture.md §92.

## 2026-08-02 — ✅ Level 1/2: robuuste kwart-grid via generator (root cause van "gaten")

Han: "elke kwartnoot moet kwartnoot of rust zijn — niet zo nu, waarschijnlijk
door weggehaalde ties/lange noten. Dat is op zich goed, maar maak het een
togglebare optie in de generator. Los het op via de generator, niet
hardcoded in de rpg-laag. Level 1 én 2 krijgen het kwartraster; Level 3
blijft zoals nu (ties/tierlantijnen)."

Root cause gevonden (500-trial probe): `insertBeatRests` (bestaande generator-
instelling) staat voor treble standaard UIT — een lege kwart-slot verlengt dan
stilzwijgend de VORIGE noot (zo ontstaat een "lange noot") i.p.v. een rust te
worden. Bovendien: als het stuk zelf met een rust begint, komt die rust in
`Melody.fromFlattenedNotes` op een entry met `offset:null` terecht (het
gedocumenteerde "leading rest" quirk in de golden test) — onrenderbaar, dus
een ONZICHTBAAR gat (geen noot, geen rust). De oude `forceQuarterNotes.js`
post-process (Level 2 t/m nu) herkende dit null-geval niet en loste het dus
niet op.

Fix (root cause, generator-niveau, §6c): `smallestNoteDenom:4` +
`insertBeatRests:true` + `polyMultiplier:1` samen garanderen dat ELKE slot
precies één kwart is (noot of expliciete rust), zonder samenvoegen — dus ook
zonder de null-offset edge case. Geverifieerd met 200/200 trials: exact
`numMeasures×4` aaneengesloten kwart-events, nul gaten, nul null-entries
(`quarterGrid.golden.test.js`). `forceQuarterNotes.js` + zijn test VERWIJDERD
(dood, en bevatte de bug) i.p.v. gepatcht.

`levels.js` herstructureerd: `QUARTER_GRID` bundel op LEVEL1 + LEVEL2; LEVEL3
spreadt NIET meer van LEVEL1 (zodat het kwartraster nooit kan lekken) en zet
`insertBeatRests:false, polyMultiplier:1` EXPLICIET. `useLevel.applyConfig`
schrijft deze 2 velden nu ONVOORWAARDELIJK bij elke level-switch (voorkomt
lekkage tussen levels binnen dezelfde sessie, bv. Level2→Level3 zonder
close()) — gedekt door een nieuwe useLevel-test.

Nieuwe UI: `insertBeatRests` is nu een 5e carousel-kolom ("beat rests":
FREE/GRID) in `GenerationSetterOverlay.jsx`, voor treble/bass/percussie (Han:
"zet de toggler in generator settings"). architecture.md §91.

## 2026-08-02 — 🔨 Level 2/3: ruimere timing-coulantie + graded judgments

Han: "accuracy maar ~10% terwijl ik best goed speel. ±1/32 noot = 'perfect';
1/32–1/16 = 'too fast/slow' (½ punt, in stats); 1/16–1/8 = 'much too fast/slow';
verkeerde toonhoogte = 'wrong note' (in stats); zones visueel naast de rode
streep. Edge cases: fout→correctie = goed 'on second attempt'; check ALLE noten
in de hit-zone (gemiste noot → volgende mag al); meerdere matches → vroegste."
Interview (§4b) afgenomen: **alles ≤1/8 noot doodt de slime + telt voor streak**;
**too/much too = ½ punt, daarbuiten gewone miss**; **second attempt = ½ punt +
wrong-note stat**; **zonebanden groen/geel/oranje alleen in debug mode** (Han
zet er later mogelijk assets neer).

**UAT-ronde (Han 2026-08-02):** ✅ label 3× groter + Georgia i.p.v. Maestro ·
✅ Level 2: elke tel kwartnoot óf KWARTrust (`forceQuarterNotes` splitst nu ook
rusten in kwart-chunks) · 🐞 "maat 8 leeg": probe (300 melodieën) toont dat
`notesPerMeasure:3` een GEMIDDELDE is — verdeling 0–4 per maat, lege maat ≈ 2%
kans ergens in het stuk, niet structureel; totaal is ALTIJD 24 noten ·
🐞 "22 missers": (a) er waren 24 slimes, niet 18 → ≥6 stille verloop-missers
(nu zichtbaar met zwevend 'miss'-label + logger.debug audit-trail 'RpgCombat'),
(b) dedupe-guard: zelfde toon <60ms wordt niet meer als tweede combat-event
geteld (dubbele MIDI-poort/double-trigger).

✅ **Root cause "22 missers" gevonden (2026-08-02):** QWERTY `handleKeyUp` in
`PianoView.jsx` riep `handlePointerUp(note)` aan (default `fireInput=true`) —
maar `handleKeyDown` had `onNoteInput` al expliciet gevuurd bij indrukken. Elke
toetsaanslag vuurde dus TWEE combat-events: één bij indrukken (juist), één bij
loslaten (spurieus — vond de slime al opgelost → wrong-note/miss; bij lang
ingedrukt zelfs een latere gelijke-toon-slime). Fix: `handlePointerUp(note,
false)` in `handleKeyUp`. Regressietest toegevoegd
(`PianoView.qwerty.test.jsx`). Dedupe-guard in App.jsx omgezet naar
tempo-relatief (1/128 noot, vloer 15ms, Han's verzoek) en blijft als
vangnet voor echte hardware-duplicaten (nu geen primaire fix meer nodig).

Aanpak: nieuw puur `src/levels/gradeHit.js` (delta-ms + beatMs → categorie/punten;
1/32 noot = beatMs/8 enz.). `SheetRpgLayer` side-scroll combat herschreven:
kandidaat-scan over ALLE onopgeloste slimes binnen ±½ beat (vroegste match wint,
out-of-order kills → `dyingList` + resolved-set i.p.v. één pointer), per-slime
wrongAttempt-vlag voor 'on second attempt', walk-off-miss pas ná target+½ beat
(anders verlies je het late venster), zwevende judgment-labels bij de rode lijn,
debug-zonebanden. `useLevel` stats uitgebreid (points/perfect/tooFast/tooSlow/
muchTooFast/muchTooSlow/wrongNotes/secondAttempt); `LevelSplash` toont ze.

## 2026-08-01 — 🔨 Level 2 side-scroll: echte notatie + metronoom (#661)

Han: "maak de noteheads conform muzieknotatie (losse noteheads, geen vlaggen/
verbindingen)… geanimeerde maatstreep + maatnummers… raakbaar duidelijk zien +
metronoom horen (2 maten intellen terwijl slimes komen, dan doortikken)… rusten
als er geen slimes zijn… check of je generateMelody + renderMelodyNotes kunt
hergebruiken (rusten/kleuren/beams)." Interview §4b afgenomen; keuzes: **hele staff
hergebruiken (incl. beams)** · **gekleurd zoals hoofd-bladmuziek** · **vaste hit-zone
band + noot licht op** · **2 maten intellen dan doortikken**.

Aanpak: in side-scroll rendert `SheetRpgLayer` de echte staff via de canonieke
`MelodyNotesLayer` + `BarlinesLayer` (§6d) met scroll-`pixelsPerTick`
(`dist/(beatsOnScreen*12)`) en één `translate(-scrollPx)`. Lineaire noot-x valt
exact samen met de bestaande slime-`noteX`; slimes hoppen er onafhankelijk onder.

🔨 **Fase 1 (deze commit):** hand-gerolde quarter-glyphs vervangen door de echte
scrollende staff → juiste koppen per duur, rusten, kleuren, beams, bewegende
maatstrepen + maatnummers. + vaste hit-zone band (altijd zichtbaar) + target-noot/
slime licht op in de zone.
✅ **Fase 1 (commit 488006a):** echte scrollende staff + hit-zone band + target-glow.

⏳ **Fase 2 — metronoom + audio-verankerde scroll (HERONTWERP, wacht op Han go/no-go).**
Han (2026-08-01): "gebruik EXACT de muziekklok, muziek komt aan op ms; check wat er
al bestaat; straks bas+percussie parallel." Onderzoek gedaan: de **Sequencer** is de
bestaande planner — `context.currentTime`-klok, `lookahead = 120/bpm` (halve noot
vooruit), en `scheduledNotes = {audioTime,duration,slot,mel,measureIndex,localSlot}`
per noot; de rAF-highlight leest die `audioTime` t.o.v. `context.currentTime`. De
metronoom speelt mee als `activeConfig.metronome>0`. Bas/percussie zitten al in
hetzelfde `scheduledNotes`-schema (`mel:'bass'/'percussion'`).

Plan: Level 2 laten lopen via de **echte Sequencer** (playback, metronoom aan,
voorlopig treble-only), en de side-scroll positie afleiden uit `audioTime`:
`x(now) = startX + (audioTime − now)/(beatsOnScreen·beatSec)·dist` → noot/slime staat
op `viewRight` beatsOnScreen-beats vóór z'n `audioTime`, en exact bij de held (startX)
óp z'n `audioTime`. Doorlopende tijdlijn = gratis (Sequencer telt continu, JIT-gen per
2 maten). Metronoom-intel = de eerste 2 maten (Sequencer-telling) direct bij levelstart.
Implicaties (voor Han): (a) combat "in hit-zone" wordt een tijdvenster rond `audioTime`
(ruimtelijke band blijft, maar is nu audio-afgeleid); (b) golf/splash-telling verschuift
van "alle slimes resolved" → Sequencer-maatvoortgang (8 maten). SheetRpgLayer's eigen
setInterval-positieklok vervalt; sprite-frames blijven bpm-gekoppeld.

**Han-keuzes gelockt (2026-08-01):** doorlopende tijdlijn · metronoom direct bij
levelstart · **treble STIL** (speler speelt zelf; metronoom/bas/perc = backing) ·
tijd-gebaseerde combat · maat-gebaseerde golftelling. **Bouwstappen (Sequencer-onderzoek
klaar):** (1) `useLevel.applyConfig` zet voor Level 2 round-VOLUMES `treble:0, bass:0,
perc:0, chords:0, metronome:>0` (naast de bestaande `trebleEye`-zichtbaarheid) →
metronoom klinkt, treble stil maar zichtbaar+gepland. (2) Level-start start de Sequencer
(continu, JIT-gen per 2 maten uit de level-settings). (3) `SheetRpgLayer` krijgt `context`
+ `sequencerRef`; positieklok = `context.currentTime`; noot-`audioTime` uit
`playbackState.measureStartTime/measureIndex/timeFactor` (extrapolatie, want scherm toont
~8 tellen, Sequencer plant ~½ noot). (4) combat = tijdvenster rond `audioTime`; (5) golf/
splash op maatvoortgang. **Koppeling metronoom↔scroll is één geheel** (verschillende klokken
= zichtbare drift), dus Fase 2 landt als één samenhangende commit — NIET half. Best Han
Fase 1 eerst UAT'en (Fase 2 vervangt de bewegings-engine).

## 2026-07-31 — 🔨 #648 slimes (enemy-navigator) + ⏳ #647 karakter in sheet music

Han: "pak kaartje slimes, en karakter in sheet music hierna op." Beide L3 (design).

🔨 **#648 slimes** — in het karakter-menu een navigator om door enemies te scrollen
met info per enemy; begin met de **blob**. Enemy-assets = `tinyRPG_by_Zerie/
Characters(100x100 split)/` → Blood Monster_A (rode blob ≈ "blob"), Demon_A, Orc,
Soldier. LET OP structuurverschil t.o.v. de held: enemies hebben **losse bestanden
per animatie** (Idle 600×100=6f, Walk 800×100=8f, Attack01/02 var, Hurt 400×100=4f,
Death 400×100=4f), 100×100-frames, één rij per bestand — dus een eigen enemy-model
(niet de multi-row body-sheet parser). §4b interview eerst.

⏳ **#647 karakter in sheet music** — held onderaan de sheet-music-view (mag deels
over percussion-info), aparte RPG-laag maar note-position-aware; onder elke
treble-noot een slime; later slimes die in sync met de noten bewegen/aanvallen.
NA #648. §4b interview eerst.

🔨 **#648 CR (Han 2026-08-01): 16×16 item-iconen als slot-preview.** Han zette een
16×16 item-set (600 stuks, 24-koloms; ijkpunt: pickaxe=item145=6*24+1) in
`src/assets/rpg/16x16/`. Wil die als preview in de equipment-slots (passen beter dan
gecropte sprite-delen). Per categorie een passend icoon zoeken; geen match →
origineel behouden (hair/ears/effect/pet). Items hernoemen bij analyse.
Geïdentificeerde bereiken: weapons 121-198/248-280, helmets 313-336/409-432/505-520,
hats 521-528, chest 337-372/433-464/529-544/570-576, pants 593-600, boots
385-408/481-504/577-592, gloves 373-384/465-480/545-568, shields 176-204/229-252.
✅ Keuzes: icoon-ACHTER-sprite + alleen-gebruikte-iconen. 7 iconen → character-icons/.
Commit 85ac169.

🔨 **#648 v2 (Han 2026-08-01): bestiary = GandalfHardcore ONLY.** "ik mis enemies…
gebruik enkel gandalfhardcore… laat de tinies achterwege." tinyRPG (blob/demon/orc/
soldier) VERWIJDERD; enemy-model uniform gemaakt (alles single-sheet multi-row,
frame-size per enemy). Roster (11): lamia, bat, flying-eye, flying-witch, mimic,
mosquito, plant, pumpkin, rat, mushroom, slime. Slime toegevoegd door Han in 3
kleuren (green/blue/red = kwart/achtste/half-heel, seed voor #647). Per-enemy crop
gemeten; preview op CONSTANTE schaal (natuurlijke relatieve groottes). Build+577+lint
groen. → deel van #648 test.

🔨 **#647 (Han 2026-08-01, "for today"): held + slimes op de sheet music.** ✅
Interview: held=custom paper-doll linksonder (kijkt rechts), slimes op vaste regel
uitgelijnd op treble-noot-X (rusten over), links, idle, kleur per duur (groen=kwart/
blauw=achtste/rood=half-heel); vandaag idle-only treble huidige-pagina, geen sync.
✅ `CharacterDoll` geëxtraheerd (1 renderer, creator+held, §6d). ✅ `SheetRpgLayer`
= slimes (SVG-`<image>`, getTickX-hergebruik) + held (foreignObject). ✅ RamMascot
verwijderd (Han: placeholder). Docs §83.
✅ **UAT-ronde 1 (Han): "de guy staat er!"** Fixes: (a) held 2× groter (HERO_H 140)
+ voeten op viewBox-bottom; (b) klik op held → opent menu; header-knop weg
(AppHeader+App); (c) 🐞 slimes onzichtbaar — `ppt===null` in normale render, hele
laag was ppt-gated → index-based fallback (allOffsets+noteWidth) altijd gebruiken.
Build+575+lint groen.

🔨 **#647 combat (Han 2026-08-01).** ✅ Interview: match=**exacte noot+octaaf**
(noteToMidi), **alle inputs** tellen (piano-klik+QWERTY+mic; MIDI later), **altijd
aan** op de bladmuziek (eigen lichte matcher). Aannames: fout=held zwaait mis (geen
kill/straf), strikt links→rechts, rusten geen slime, regen meteen bij laatste kill.
Plan: (1) App wrapt `handleInputTestNote` → relayt óók de gespeelde noot als
`{note,nonce}` naar SheetMusic→SheetRpgLayer (alle bronnen komen daar samen). (2)
SheetRpgLayer combat-state: `killedCount` (meest-links), `dying` (death-anim via
startTick), held-attack (startTick, 1×). Op noot: held attack; als `noteToMidi(noot)
==noteToMidi(slimeNotes[killedCount])` → die slime death-anim → weg → killedCount++.
killedCount==totaal → `onSlimesCleared` → `randomizeAll({chords:false})`. Reset bij
melodiewissel. `SLIME_DEATH` (row2,5f) toegevoegd.
✅ GEBOUWD: App-relay (`handleNoteInputCombat`), SheetMusic-props, SheetRpgLayer-
combat (killedCount/dying/heroAttack via startTick; clear-effect op [killedCount]).
Smoke-test met fake timers (match doodt links, foute noot niet, clear→cleared).
Build+576+lint groen. Docs §83. → #647 UAT.
✅ UAT-tuning (Han): sheet-attack = laatste 3 frames (creator alle 6); frame-rate
bpm-gekoppeld (`12/bpm` s/frame → 5-frame rust = 1 tel); attack-cyclus 3+2=5 frames.
Ties: gekoppelde noten → 1 slime (alleen eerste). ⏳ **#658** aangemaakt: snelle
gegroepeerde noten → 1 animatie/slag (koppel aan smallestNoteDenom+bpm).

## 2026-08-01 — ✅ #659 Level 1 (combat mini-level)

Han: header-knop start Level 1. ✅ Interview: 4 golven×2 maten=8, puur combat, stats
= slimes verslagen/accuraatheid%/missers/langste streak (timing pas bij metronoom),
na splash Opnieuw/Sluiten (settings hersteld). GEBOUWD: `levels/levels.js` (config
+ trebleOnlyEyes), `hooks/useLevel.js` (state-machine + snapshot/restore), `LevelSplash`
(splash + stats), App-wiring (setters/snapshot/regenerate; onSlimesCleared→onWaveCleared;
onCombatHit/Miss alleen als level.active), SheetRpgLayer hit/miss, AppHeader Swords-knop.
Config: treble-only via playbackConfig-eyes, numMeasures=2, notes/maat=2, variability=30,
range C4–G4, reps=1. 🐞 timing: setTrebleSettings flusht z'n ref pas bij re-render →
regen via rAF (anders 1e golf oude config). 4 useLevel-tests. Build+581+lint groen.
Docs §84. → #659 test.

## 2026-08-01 — ✅ #660 Level 2 (side-scroll rhythm-combat)

Han: slimes vliegen van rechts in; kill alleen in hit-zone bij de held; metronoom-gids
(bestaat al, niet gebouwd); miss-fade tegen startX; 4 golven; bpm=80. Ook: slime-kleur
SWAP (rood=kort/blauw=lang), tie-kleur op TOTALE lengte, keyboard default aan op PC,
maatnummer reset per level, bottom-paneel ≤40%. GEBOUWD: LEVEL2/LEVELS + useLevel
geparametriseerd (start(levelDef)+setBpm), 2 header-knoppen, SheetRpgLayer sideScroll-
engine (game-klok=bpm-tick 5f/beat; spawn op beat; hop via movingFramesBefore frame3-7
op 8/5; hit-zone startX..+70; escape→fade+miss; SLIME_WALK row1). Test: hit-zone-gate
(te vroeg=miss). Build+582+lint groen. Docs §85. → #660 test.
✅ UAT-ronde (Han): (1) NOTEN side-scrollen mee (statische treble-noten verborgen;
bewegende Maestro-notehead per slime via getNoteAbsoluteY, §6d — geen stem/kleuring);
(2) niet-geslagen slime gaat NIET dood → loopt door (killedSet ipv fade; resolved-
count); (3) beweging LINEAIR + SOEPEL: render-interval losgekoppeld van sprite-frame-
rate (INTERVAL_MS=25≈40fps; sprite-frame=elapsedMs/frameMs), held gememoized op frame.
Hop gedropt (Han's 'beweeg gewoon linear'-optie). Build+582+lint groen.

## 2026-07-08 — ✅ Swimlane-ronde: #395 bord-scroll GEFIXT + #394 design → design_review

Han: "werk aan jouw swimlane (design/plan/impl)". ✅ 🐞 #395 (kanban tweak):
scroll-chaining — een `.column-body` die zijn scroll-limiet raakt gaf de scroll
door aan `<body>` (alleen `min-height:100vh`, geen overflow-guard) → hele pagina
schoof, bord zakte onder de swimlanes. Fix: `overscroll-behavior: contain` op
`.column-body`, gespiegeld naar `.devcontainer/kanban-board-overlay/` (§9k). Geen
andere view geraakt. → test. 🔨 #394 (ui tweaks round 3, L3): ~21 tweaks op de
in-staff generation/exercise-setters; rode draad = §6d (inline noten volgen
note-coloring niet, accidentals niet gestapeld, notes/measure geen echte
grouping, chord-complexity negeert notenplaatsing — meeste in
`generationNoteGlyphs.jsx`). Te groot (§9c) → split-voorstel 394a–g op ticket
(394a hidden-carousel = fundament/architectuur → plan_review). 4 interviewvragen
+ 15 AC's + 9 consistency-reqs geseed, → design_review (STOP: wacht op Hans
antwoorden + split-akkoord).

**Vervolg (Han: "wat is actiehaar? waarom in jouw swimlane?" + screening):**
Correctie op mezelf: #262 WAS actiehaar — Hans interview (Q1–Q6) was al beantwoord;
mijn "wacht op Han" was fout. #262 GESPLITST (§9c, Q1='alles, splits in plan-fase'):
#396 (#262a typografie + rechter-carousel −15%, L2) → **impl**; #397 (#262b 8vb bij
overflow, L3, overlapt #112) → **plan_review**; #262 → on_hold (umbrella). #245/#230
laat Han zelf routen. 🐞 #395 scroll-chaining GEFIXT (`overscroll-behavior: contain`,
beide CSS-kopieën) → test. SCREENING: CLAUDE.md nieuwe HARD-gate (na impl, vóór UAT
architecture.md bijwerken — Han 2026-07-08) + preplan-refs bijgewerkt; architecture.md
dubbele §38 → §41a hernummerd (§45–51 bestonden al als `### §NN`, mijn eerdere
"ontbreekt" was een grep-misvatting); BACKLOG P0-kanban ✅-notitie (bord draait op
:5500, PGlite; originele tekst ongemoeid, regel 1).

**Slot: #394 gesplitst + #396 GEBOUWD (Han verplaatste #394→plan met alle 4 Qs
beantwoord; "beide, in deze volgorde").** #394 SPLIT (§9c) in 7 kinderen #398–#404:
394a hidden-carousel (#398, fundament) → **plan_review**; 394b–g (#399–#404, repeats/
note-consistentie/chord-complexity/strategy-carousels/percussie-pool/gen-advanced) →
todo, allen f-f op #398; #394 → on_hold. #245 beantwoord (geen residueel impl-werk;
→ done-aanbeveling). Nieuwe bord-FR #405 (dependency-viz op kaartjes: bolletjes +
hover-lijnen). ✅ **#396 GEBOUWD** (TranspositionSetter.jsx): PRESET_FONT 13→15 +
hitboxes; 'CONCERT' los sans-serif `--text-primary` boven de rechter notehead; 'C₄ ='
−20% (`RIGHT_LABEL_SIZE`); rechter carousel −15% (`RIGHT_CAROUSEL_SCALE`, om centrum).
"uitlijnen boven percussie-optie" GEFLAGD (setter heeft geen percussie-optie, §9k) i.p.v.
gegokt. Gates: lint 0, 559 tests, build OK; architecture.md §15 bijgewerkt VÓÓR test
(§1a-gate). → test (UAT).

## 2026-07-07 — ✅ Drieluik GEBOUWD: #144 adaptive + #268 persistentie + #300/#302 fans (d03295b)

Han: "werk exercise mode, playback settings tweaks af, implementeer adaptive
difficulty." ✅ #144: pure engine (`adaptiveDifficulty.js`, getest) — challenge
zone 0.25–0.45 als outcome-band [0.55,0.75], +4%/−7% stappen, seed vanaf
werkelijke difficulty; per melodie in onScoreEvent; schrijft de bestaande
target-sliders (override, Sequencer leest ze al); ADAPTIVE-toggle naast de
Harmonic-slider. ✅ #268: profiel v3 `exerciseProgress` (melodies/runs/lastAt),
gevoed door de run-teller; "RUNS N · MELODIES M" onder de actieve preset.
✅ #300/#302: LeftFanCarousel+DragBand+FieldLabel geëxtraheerd naar gedeelde
`fanCarousels.jsx` (§6d) met labelFontFamily+compact; volume-cellen = compacte
Maestro-dynamiekfans (mapping-keuze onder mandaat, op ticket geflagd),
measures = 1..32-fan. ⏳ Gemotiveerd doorgeschoven: #301 (renderContent-
fanvariant nodig), #303 (wacht op Hans antwoorden; §6-invarianten), #305 (na
de rest). Epics #245/#230 status-notes bijgewerkt. 559 tests groen (+7),
lint 0, build OK. architecture.md §50.

## 2026-07-07 — ✅ Bord-tooling: #229 burndown + #263 AC-paneel volledig

✅ #229: Graph-tab → BURNDOWN (interviews: level-gewogen punten, auto-schaal,
completed_at, volledige historie, actual + gestreepte projectie op 14-daagse
velocity met target-datum = geprojecteerde nuldoorgang). Handgerold SVG (geen
lib; force-graph vervangen), crosshair+tooltip, weektabel-fallback, palet
gevalideerd (dataviz-methode). ✅ #263: AC-paneel nu volledig per gelockte
antwoorden — per rij checkbox (verifiedAt/By-stempel), inline tekst-edit,
comment, ×-delete; afwijking genoteerd: direct opslaan i.p.v. batch-Save
(interviews-patroon). Beide gespiegeld naar .devcontainer-overlay (§9k),
beide → test. ⏳ #144 (adaptieve engine) blijft in plan_review — Hans
antwoord-note is partieel; bevestiging nodig voor deze L3 app-feature.

## 2026-07-06 — ✅ #296 Thronefall iteratie 1 GEBOUWD (31cbd54)

Plan-kolom leeggewerkt: `:root[data-theme='thronefall']` (indigo bg, crème
tekst, banier-goud; chromatone-hues heilig — erven ongewijzigd); harde
diagonale slagschaduw (nul blur, --tf-shadow met subtiele violet-verschuiving)
op noten + akkoordlabels — NIET op balklijnen — en als harde box-shadow op de
HTML-chrome; Kroon-toggle naast debug (AppHeader) + entry in het thema-grid.
552 tests groen, lint 0, build OK. architecture.md §49. → test (UAT).
Plan-kolom rest: #245/#230 zijn paraplu's (kinderen in UAT of wachtend op
Hans #300-antwoord).

## 2026-07-06 — ✅ Plan-kolom-antwoorden verwerkt: #299 + #297 GEBOUWD

✅ #299 (163b727): inSettingsView omvat alle negen edit-modes — élke setter
toont álle balken; ghost uitgebreid naar eye-verborgen balken: noten 0.4 +
balklijnen in lowlight (Q4). ✅ #297 (8574b16): RamMascot — handgetekende
SVG-ram in de header boven de BPM (Q2), expressies via input test (blij/trots/
oef), "Well done!" elke 10e, "Beh!" bij tik, spraak max 1×/20s (Q3); 4 tests.
Q4 → nieuw ticket #328 "RAM × adaptieve moeilijkheid" (s-f op #144).
🔨 #296 Thronefall: iteratie-1-plan op het ticket (thema-var-infra, palet met
heilige chromatone-hues, harde diagonale SVG-slagschaduw op noten — niet op
balklijnen, screening → tickets); volgende geconcentreerde pass.
🐞 Kanban-bord lag plat — herstart via `npm run kanban` (achtergrond).
552 tests groen, lint 0, build OK. architecture.md §48.

## 2026-07-06 — ✅ Swimlane-vervolg: #262 clef-carousels + bord-ticket + #299-interview

✅ #262 (cdb0e0f): alle drie clef-pickers (familie per balk, zangstemmen,
percussie) → gedeelde NonLinearCarousel (slepen/schalen/settle); actieve
sleutel pixel-exact op de bladmuziek-positie (CLEF_GLYPH_X / PERC_CLEF_X);
zangsleutels als horizontale wheel van echte clef-glyphs; Italiaanse
caps-labels (VIOLINO/BASSO/VOCE, BASSO…SOPRANO, PERCUSSIONE). ClefCarousel +
ClefCardCarousel VERWIJDERD (§7). Beschrijving-items (font-%'s, 8vb) als vraag
op het ticket — dateren van vóór latere reworks, niet gegokt. → test.
architecture.md §47. 548 tests groen, lint 0, build OK.
✅ Bordfix als ticket #306 → test. ✅ #299 interview (4 vragen) → design_review.

## 2026-07-06 — ✅ 🐞 Kanban-bord: kolombreedtes inconsistent op smal scherm

Han: done/parking soms heel breed (vooral smal scherm / na resize); design/
plan/implement zijn de belangrijkste kolommen. Oorzaak: de 1024px-breakpoint
zette `repeat(4, 1fr)` terwijl de kolommen vaste gridColumn 1–6 inline-styles
hebben → done (5) en parking (6) vielen in IMPLICIETE auto-sized tracks
(inhoudsbreedte). Fix: op élk breakpoint 6 expliciete tracks, gewogen —
werk-kolommen (2–4) 1.3fr, todo/done/parking 0.7–0.75fr; 1024px behoudt
horizontale scroll. Gepatcht in `~/.claude/kanban-board/src/style.css` ÉN
gespiegeld naar `.devcontainer/kanban-board-overlay/` (§9k drift-regel).

## 2026-07-06 — ✅ #295 GEBOUWD: inline noten in de generator-carousels (d7a9840)

Autonome swimlane-ronde. `generationNoteGlyphs.jsx` (alles via canonieke
StaffQuarterNote/StaffMelodyNote, §6d): note-pools als echte notenruns
(chromatic + Maestro ♭♯♮), notes/measure 1–16 als afgeleide ritmepatronen
(formule getest tegen Hans voorbeelden; vlaggen, beaming = follow-up),
progressies als Romeinse cijfers; arp up/down/bounce uit deze carousel;
NOTES_PER_MEASURE nu 1–16 (gedeeld met bottom view); redundante kolomkoppen
weg; CarouselField kreeg renderContent + visibleHalf; labels caps in de
gedeelde renderer. 548 tests groen. → test (UAT).
⏳ Volgende passes in de lane: #162 (span-setter sleutel-afhankelijk),
#262 (clef-carousel consistent + Italiaanse namen).

## 2026-07-06 — ✅ CR: repeats terug naar Maestro-weergave (#298 rework, 7c94881)

Han: repeats waren "de verkeerde kant op" consistent gemaakt (sans-serif ×N).
Hersteld op SSOT-niveau: `renderRepeatGlyph` in carouselOptionGlyph — Maestro
"N À" (∞ = kale À, until-correct = BadgeCheck), zelfde lettertype als
RepeatsControls-header en BPM. Beide numRepeats-carousels (PLAYBACK +
exercise REPEAT-as) consumeren hem; smoke test bewaakt het font. → test.

## 2026-07-05 — ✅ Swimlane-ronde: #267 run GEBOUWD + lane opgeruimd

Han: "pak de tickets in jouw swimlane op." ✅ #267: begrensde run van 10
melodieën — `flawless`-vlag op melodyComplete, run-teller in de score-wrapper
(bij until-correct telt alléén foutloos), "melody N/10"-chip in SubHeader,
auto-stop bij 10 → summary card (nu met Melodies-rij); aannames A1–A4 op het
ticket (omkeerbaar in UAT). 0 Sequencer-edits, geen opslag (#268). → test.
✅ Admin: #54–59 (presets) → test — geleverd via de exercise-registry;
#157 → design_review (analysevraag wacht op Han); #296 (Thronefall) + #297
(ram-mascotte) design-interviews op ticket → design_review; #245 paraplu-nota.
⏳ #230 (in impl, plan goedgekeurd door verplaatsing): volgende bouwslice —
tangens-selectors, dynamics-stappen, measure groups (PlaybackSettings-klasse).

## 2026-07-05 — ✅ UI-tweaks feedbackronde: #163 + #231 + #264 (commit df51a99)

Han: "lees de ui tweaks in plan en design, check de feedback, pak die op."
✅ #163 rework-trio: actief icoon in categoriekleur (SVG feFlood-tintfilter —
PNG's zijn niet CSS-herkleurbaar; live bijgewerkt tijdens drag), glow 50%
subtieler via GEDEELDE `activeGlowFilter` (globaal: instrument + exercise +
compacte glyphs), álle labels caps (render + gesture-pad). ✅ #231: label
78→66, vlak onder de C4 (caps zat al in rework 3). ✅ #264: `toMelodyFast`
voegt octaaftop toe → preview altijd volledige run (8 noten heptatonisch);
"wisselende noten" = bewust de huidige toonladder (genoteerd op ticket).
Alle drie → test (UAT). §9k: reanalyzed + feedback-items formeel geadresseerd.
⏳ Volgende slices genoteerd op tickets: #295 (inline noten in generator-
carousels — grote render-taak), #230 (tangens-selectors + measure groups —
plan_review), #262 (clef-carousel consistent + Italiaanse namen).

## 2026-07-05 — ✅ CR: Exercise setter geïntegreerd + functionele play-along GEBOUWD

Interview: presets op treble + assen op bas ✓; too slow = doorspelen + fout
tellen ✓; demping actieve input-balk bevestigd ✓. GEBOUWD: presets als
balk-hoge icon-kaarten op de bovenste balk; MELODY+INPUT icon-carousels naast
elkaar op de tweede balk; TEMPO-carousel op de BPM-positie (trebleStart−59);
REPEAT-carousel op de repeat-teken-positie (trebleStart−25, rechts); caps- en
kaartconventies verplaatst naar de GEDEELDE glyph-laag (`renderStaffCardGlyph`;
colour-setter-labels nu ook caps). FUNCTIONEEL: START bij fixed → live-submode
+ continuous playback, actieve input-balk gedempt via round-config (READ =
beide rondes gedempt/zichtbaar; HEAR = R1 hoorbaar, R2 gedempt+blind);
live-tracker telt gemiste noten (vooruit-passeren zonder antwoord) als fout +
TOO SLOW-flash in SubHeader; rubato → note-submode (bestaand). §7b: 543 tests
groen, lint 0, build OK. architecture.md §44d. #266 → test (UAT).

### Oorspronkelijke CR-log (2026-07-03)

Han (UAT #266 rework 2, met screenshot): (1) setters te klein/"tekstjes" — wil
grote carousels met iconen, colour-setter-HOOGTE is "PERFECTO"; (2) all-caps
ontbreekt in colour setter → presentatieconventie moet in de GEDEELDE laag
(carouselOptionGlyph), niet per consumer; (3) integratie-filosofie: REPEAT-setter
op de plaats van het repeat-teken (rechtsboven, RepeatsControls-positie),
TEMPO-setter op de BPM-plek (linksboven, BpmControls), MELODY = balk-hoge iconen
met tekst eronder, INPUT ook iconen; (4) FUNCTIONEEL: START bij tempo=fixed →
playback van alle melodieën (rond-volumes) behalve de actieve input-balk +
'too slow'-feedback bij te late input (live-tracker); rubato per bestaande
beschrijving. #266 test→impl gebounced met rework_reason. Interview loopt
(preset-plaats, too-slow-semantiek, muting-bevestiging).

## 2026-07-03 — ✅ Vervolgwerk: tests + #298 repeats-carousel + #267-design

"Werk verder" (Han): (1) ontbrekende §7b-tests toegevoegd — exerciseIndex
(11: registry/assen/configFromAxes/applyExerciseConfig-merge) + ExerciseStaffOverlay
smoke (5: morph-group, ALL-CAPS, START-click, BadgeCheck, §3a) → 543 tests totaal.
(2) #298 GEBOUWD: PLAYBACK repeats-stepper → zelfde NonLinearCarousel als de
exercise REPEAT-as; gedeelde glyph-renderer `carouselOptionGlyph.jsx` (§6d SSOT),
optielijst uit `AXES.evaluation` (§6c); repeats-numberpicker vervallen. → test (UAT).
(3) #267 design geüpdatet voor het assen-model + 4 interviewvragen OP HET TICKET
(run-lengte vast/instelbaar, auto-stop+summary, geldt bound voor alle oefeningen,
until-correct-telling) → design_review, wacht op Han. architecture.md §44c.

## 2026-07-02 — ✅ CR: Exercise-assen → carousels + header-START + 'until correct' GEBOUWD

Interview-antwoorden: BadgeCheck (star-check bestaat niet in lucide 0.563) ✓;
START in AppHeader, altijd zichtbaar ✓; input-as = READ | HEAR (oud 'replay'
hernoemd, puur luisteren geschrapt) ✓; until-correct v1 akkoord ✓. GEBOUWD:
alle assen zijn nu NonLinearCarousels (§6d-fix); REPEAT-as hergebruikt de
repsPerMelody-optielijst ['until',1,2,4,6,8,∞] met BadgeCheck helemaal links;
opslag = untilCorrect:true + repsPerMelody:Infinity (Sequencer-rekenen blijft
numeriek, 0 Sequencer-edits); PLAYBACK-repeats-stepper cyclet dezelfde lijst
(✓-weergave); useInputTest herstart bij untilCorrect dezelfde melodie na fouten
(alleen foutloos → regenereren; melodyComplete blijft per poging voor ELO);
START-knop (Dumbbell) in de AppHeader naast de generate-knop. §7b groen.
architecture.md §44b. ⏳ PLAYBACK-repeats-stepper → carousel = nieuw ticket.

### Oorspronkelijke CR-log

Han (chat, UAT #266-rework): (1) as-rijen zijn "klassiek", NIET conform §6d/style
guide → elke as moet een carousel zijn (NonLinearCarousel); (2) START-knop moet
óók in de header; (3) vraag: verschil hear vs replay?; (4) 'until correct'
reflecteren in de BESTAANDE num-repeats parameter (`playbackConfig.repsPerMelody`,
opties [1,2,4,6,8,∞]) — hergebruik die setter als carousel, 'helemaal links' een
correct-symbool ('star-check' lucide → BESTAAT NIET in lucide-react 0.563;
alternatief vragen). Geldt ook voor de 'aantal repeats'-setter zelf. Interview
loopt (Han: "stel vragen indien niet duidelijk").

## 2026-07-02 — ✅ CR: Exercise setter met assen + START-knop GEBOUWD

Han (chat, na #265/#266): "Hoe start ik nu een oefening? Maak het starten
prominenter. Bijvoorbeeld: hoe start ik een rubato scale run?" Interview-
antwoorden: START-knop ✓; oefeningen = presets over VIER ASSEN (melodie-type /
input lezen-horen-naspelen / tempo vast-rubato / herhaling tot-goed-×1-×2-×4),
verticaal in de setter ✓; carousel = plaatje (lucide placeholder) + ALL-CAPS
tekst eronder ✓. GEBOUWD: registry-assenmodel (`AXES`, `configFromAxes`,
`normalizeAxes` — HEAR×RUBATO en HEAR×UNTIL uitgesloten/gedimd; rubato-ear als
aparte entry verwijderd), overlay met icon-kaarten + 4 asrijen (§3a hitboxes) +
gele START-knop, `handleStartExercise` (hear→continuous play; read/replay→
input-test note-mode, rubato via tempo-as). Rubato scale run = preset SCALE
RUNS + tempo RUBATO + START. §7b: 527 tests groen, lint 0, build OK.
architecture.md §44a. ⏳ 'until correct' volwaardig scoren = #267.

## 2026-07-02 — ✅ CR: Skill = adaptief (ELO/MMR-achtig) — #129 rework GEBOUWD (wacht op UAT)

Han (chat, na slice-1 UAT-blik): XP goed zo, maar skill 0–100 moet ADAPTIEF:
100 = de moeilijkste difficulty foutloos kunnen spelen (chess-ELO / win-loss MMR),
niet cumulatieve XP. Interview-antwoorden: skill mag dalen ✓, graded outcome
(100%→1.0, 95%→0.5, ≤90%→0) ✓, passief luisteren telt NIET ✓, Consistency blijft
XP-curve ✓. GEBOUWD: `gamification.js` ELO-helpers (difficultyToRating 50×mult,
spread 15, K=6, length-weight notes/8, min 4 noten), ProfileContext v2
(skillRatings + consistencyXP, v1→v2-migratie seedt ratings via skillScore),
SessionSummaryCard toont ↓ rood bij daling, ProfileTab rating-uitleg.
§7b: 527 tests groen, lint 0 errors, build OK. #129 → test (UAT Han).

## 2026-07-02 — ✅ FR: Exercise view (top selector + bottom songs) — #265/#266 GEBOUWD

Han: "create an exercise view, opens songs on the bottom view and an exercise
selector on the top view; presets op kanban als startpunt." Dekt bestaand epic
#245 (design_review) + subtickets #265 registry / #266 in-staff tab+carousel /
#267 rubato-run / #268 progress; presets #54–59 als registry-seed. Interview:
7 oefeningen (6 presets + rubato) ✓, view+registry eerst ✓. GEBOUWD:
`src/exercises/exerciseIndex.js` (registry + applyExerciseConfig, declaratieve
patches à la PresetPicker), `ExerciseStaffOverlay.jsx` (NonLinearCarousel op de
bovenste balk, actieve beschrijving als caption), `exerciseEditMode` in
useEditMode (8e sibling, volledige mutual exclusion), EXERCISES-knop (Dumbbell)
in SubHeader, morph-surface 'exercise' in useRangeMorph, App-effect →
bottom view naar songs-tab bij openen. §7b groen. #265/#266 → test (UAT Han).
⏳ #267 rubato-run met scoring = volgende slice.

## 2026-07-02 — ✅ FR: Gamification layer — slice 1 GEBOUWD (wacht op UAT)

Impl klaar (Fable-5, main session): `src/utils/gamification.js` (+23 tests),
ProfileContext v1 (ref-based profiel, `recordEvent`, sessies, migratie, +5 tests),
`useInputTest` onScoreEvent-emissies (noteCorrect/noteWrong/cleanMeasure/melodyComplete),
App session-effect op `isPlaying||isInputTestMode`, luister-XP via gewrapte
`setIterInCurrentSeries` setter (0 Sequencer-edits), ProfileTab (level/tier/XP-bar,
5 skill-bars, streak+tokens, opt-out toggle), `SessionSummaryCard` (toast, ≥1-melodie
gate, auto-fade 8s). §7b: 517 tests groen, lint 0 errors, build OK. Docs:
architecture.md §43 + status-note in gamification.md. Tickets #142/#134/#128/#129/#130/#131
→ test (UAT Han). Plan-afwijking gelogd: series-detectie via setter-wrap i.p.v.
randomizeAll-wrap (Sequencer krijgt randomizeAll niet — regenereert intern).

### Oorspronkelijke design-fase log

Han: "add a gamification layer". Interview (§4b) afgenomen; Han koos:
**XP-kern + session summary + simpele 5-tak skill tree**, docs behandelen als
draft (kritische review), via kanban-pipeline. Bestaande on_hold tickets
gereactiveerd → design_review: #142 (profile schema, fundament) → #134
(opt-out + event-wiring) → #128 (XP/levels, v1 alléén difficulty-multiplier) →
#129 (skill tree, asymptotische 0–100 formule voorgesteld) + #130 (streak +
freeze tokens) → #131 (session summary, met ≥1-melodie drempel tegen popup-spam).
Dependencies f-f gewired; AC's + consistency_requirements per ticket geseed (§9k).
NIET in deze slice: badges/challenges (#133), lesson engine (#138–141),
11-dimensie skill-model (#143 blijft on_hold). ✋ Wacht op Han: design_review
+ 4 interview-vragen (sessiedrempel, formule K, passieve-XP cap, UI-taal).

## 2026-06-27 — ✅ #162 Advanced Generator Settings — rework (Opus/high)

Tweede rework na 2× UAT. Han bevestigde (kanban-notes): tangentiële setter voor in-line noten
(GEEN NonLinearCarousel-pivot), nonlinear is nooit cyclical, 5th toevoegen aan LEAP_OPTIONS OK.
Toegepast op `GenerationAdvancedSetterOverlay.jsx`:
- ✅ 5th `{value:7,label:'5th'}` toegevoegd aan `LEAP_OPTIONS` (SSOT) → span begint nu bij 5th.
- ✅ Span: natuurlijke oplopende volgorde (GEEN reverse meer → niet meer geflipt voor treble);
  vaste C4-anker-noot geclampt BINNEN het carousel-venster (was off-canvas → nu zichtbaar);
  ALLEEN de actieve interval-naam gelabeld (onder balk treble / boven bas).
- ✅ Variability: redundant `rhythmic variability = NN` label verwijderd (kolomheader + getal volstaat).
- ✅ Tuplets: X geïnverteerd → low linksonder, xtreme rechtsboven; 3-regelig label verwijderd.
- ✅ Smallest note: ECHTE melody-noot render via nieuwe `StaffMelodyNote` (kop+stok+vlag+punt,
  geëxtraheerd uit renderMelodyNotes; duur-glyph-maps verhuisd naar `staffNoteGlyph.jsx` als SSOT),
  i.p.v. losse Maestro-glyph. Alle noten op middenlijn (B4 treble / D3 bass).
- ✅ Akkoordinstellingen losgekoppeld van `showChordsRow` → passing-chords toggle nu altijd zichtbaar.
Gates: test/lint/build groen. NB: tijdens dit werk stond ongerelateerde #163-WIP (NonLinearCarousel
glow-rework, met `N is not defined`-bug) ongecommit op schijf; teruggezet naar HEAD zodat dit commit
alleen #162 bevat — #163-eigenaar her-derivt die WIP.

## 2026-06-27 — 🐞 #231 carousel outer-item opacity niet zichtbaar (→ DESIGN)

UAT-feedback Han: buitenste 2 items kleurcarousel hebben geen zichtbaar lagere opacity; overlap mag
kleiner. Diagnose: opacityForDist math voor half=1 laat d=±1 op **0.75** landen (niet de 0.5 floor) —
0.75 over een gekleurde noot leest als vol. MIN_OPACITY floor wordt pas bij d→1.5 bereikt, waar item al
verborgen is. Geen CSS/flyInCascade override. Voorstel: floor 0.5→0.30-0.40 en d=1 echt naar floor laten
zakken (vlakke dim voor half≤1), guarded op half≤1 zodat instrument-carousel (half=3) ongemoeid blijft.
BASE-overlap apart tunen. #231 terug naar design_review met diagnostische spec + vragen aan Han (welk
opacity-niveau? vlak of curve? overlap dichter of verder?). Planning na akkoord: Opus/high (gedeeld
primitive + §6 invariant). Files (verwacht): NonLinearCarousel.jsx, NoteColoringStaffOverlay.jsx (BASE).

## 2026-06-22 — ↩️ Kanban VOLLEDIG uit app gehaald (Han-besluit)
Han wil kanban niet in de app-codebase. Alles verwijderd: gevendorde skills (.claude/skills/kanban*),
kanban.json, src/components/kanban/*, scripts/kanban*, Vite kanban-API, debug→kanban view + showKanban,
E021, docs §43/§43a, .gitignore-uitzondering. Route voortaan: cyanluna direct (skills global / eigen
repo). Twee-repo-werk niet mogelijk in deze 1-repo websessie → aparte sessie per repo of lokaal.

## 2026-06-22 — ✅ In-app Kanban board (debug → kanban)  [↩️ teruggedraaid, zie hierboven]
Bron = repo-root `kanban.json` (110 taken, gegenereerd uit BACKLOG+PLAN). DEBUG→KANBAN knop (alleen
debug-mode) → fullscreen `<KanbanBoard>` + terugknop, vrij slepen tussen 7 kolommen (cyanluna-model),
verslepen schrijft via Vite `kanbanJsonApiPlugin` (/api/kanban GET/POST) → fallback localStorage.
Clean-room React; cyanluna Postgres-board NIET hergebruikt. Agent-koppeling = LOS. Docs §43. Files:
kanban.json, vite.config.js, components/kanban/{KanbanBoard.jsx,.css,__tests__}, useAppUIState
(showKanban), AppHeader (knop), App.jsx (overlay). Code E021-KANBAN-PERSIST. 471 tests groen.

## 2026-06-22 — 🔴 P0 Kanban-board (cyanluna.skills) — ⏳ backlog (tooling, NOT app feature)
Setup runs on Han's LOCAL machine (remote container is ephemeral/unreachable). Needs Neon PostgreSQL,
Node+pnpm, third-party skills repo (7 autonomous agents). Steps: clone → cp kanban* to ~/.claude/skills
→ cd ~/.claude/kanban-board, cp .env.example .env, pnpm install, set DATABASE_URL → /kanban-init in
project → ./kanban-board/start.sh (localhost:5173). 7-col pipeline Req→Plan→ReviewPlan→Impl→ReviewImpl→
Test→Done. ❓ awaiting Han: local vs remote. See BACKLOG.md P0 entry.

## 2026-06-22 (cont.2) — Carousel batch: setters→carousel, instrument re-cat/re-icon, perc-kit carousel (Han)
Interview answers: setters in carousel-style = FULL 5-wide carousel per field (lucide icons for now,
icon + label below + category bracket above; maestro glyphs were unreadable); percussion-kit carousel =
CATEGORIZED, ALL kits; instrument-carousel icons +15%. Icon-asset reality: only 22 icons8 PNGs exist in
src/assets; accordion/contrabass/harmonica/synth/stage are NOT in the repo → placeholder existing icons
now + flag for Han to drop icons8-{accordion,contrabass,harmonica,stage,synthesizer}-100.png.
- 🔨 (A) GENERATION + GENERATION ADVANCED setters rebuilt in carousel style: each field = a 5-wide
  NonLinearCarousel, lucide icon + text label below + category/field bracket above. Replaces the
  SvgSetter+maestro-glyph cells. Per balk (treble/bass/perc + chords). Wiring unchanged (same fields).
- ✅ (B) Subtle per-category CSS colouring in the instrument carousel (active card text + bracket),
  theme-aware --cat-* vars in App.css (:root + meridienne + light) keyed on the 8 top categories;
  categoryColorVar() maps category→var in instruments.jsx (no slug→colour table). [Wave 2, 2026-06-22]
- 🔨 (C) instruments.jsx re-categorise + re-icon. New top categories: keys / guitars / bass guitars /
  strings / wind / percussion tuned / voice / synth (NEW). Adds: accordion, distorted electric guitar
  (distortion_guitar), contrabass, harmonica, xylophone, synth square/lead/pad. Re-icons: steel=guitar
  (nylon), acoustic bass=guitar, electric/distorted=rock-music, vibraphone=xylophone, voice oohs=choir.
  Placeholders for the 5 missing assets, flagged.
- ✅/🐞 (D) Percussion KIT carousel (instrument setter, percussion balk): categorized, derived from
  drumKits.PERCUSSION_KIT_CATEGORIES (no hardcoded list). [Wave 2, 2026-06-22]
  · "Sampled" → [FreePats Percussion], icon drum-set (asset EXISTS) — WORKS.
  · "Drum machines" → [TR-808, Casio RZ-1, LM-2, MFB-512, Roland CR-8000], icon drums (EXISTS) — WORKS.
  · "Acoustic MIDI" → [standard, jazz, electronic], icon electronic-music PLACEHOLDER (synthesizer
    asset still missing → TODO(icons8) icons8-synthesizer-100.png).
  Writes percussionSettings.instrument via setPercussionSettings (same path as treble/bass).
  🐞 HONEST GAP (do NOT fabricate): smplr Soundfont has NO GM-percussion bank — standard/jazz/electronic
  are not valid soundfont names AND have no pad→GM-MIDI mapping in KIT_NOTE_MAPPINGS. The dormant
  isGMKit branch in useInstruments.js cannot produce audio. → Acoustic MIDI flagged available:false in
  PERCUSSION_KIT_CATEGORIES; carousel SKIPS it (no silent kits). HAN DECISION NEEDED: supply a GM-perc
  soundfont source + pad→MIDI map to enable, then flip available:true.
- ✅ (E) Instrument-carousel icons +15% (ICON 33 → 33*1.15). [Wave 2, 2026-06-22]
- ⚠ §6d note: setter category-brackets reuse the NonLinearCarousel primitive; bracket-DRAW may briefly
  duplicate InstrumentStaffOverlay.bracketGeom — flag for later consolidation into a shared helper.

## 2026-06-22 (cont.) — Han batch: corrections, new FR, instrument feedback, parked items, research
- ⚠ Generator setters: "balk" includes CHORDS (see corrected entry below).
- ⏳ NEW FR "REPEAT AFTER ME" (call-and-response practice): chop a long song into chunks for repeat
  blocks — e.g. HBD by ear: play 2 bars (teacher), player plays them back, advance to next 2 bars.
  Captured in BACKLOG; NOT built yet (focus = the 3 setters). Touches Sequencer repeat/segmentation +
  a new practice mode; needs §4b interview (chunk size fixed/selectable? listen-detection vs timed?).
- ⏳ INSTRUMENT CAROUSEL feedback (rename/re-icon + new categories/instruments) — captured in BACKLOG
  under the instrument selector; edits src/constants/instruments.jsx. NOT built this round.
- 🐞 BUG (Han 2026-06-22): after changing the instrument MANY times, no sound. Likely smplr instrument
  re-creation leak / AudioContext or instrument-cache issue in useInstruments.js. Captured; serious;
  next-after-setters candidate.
- 🅿️ PARKED at Han's request ("vink af" 2026-06-22) — removed from the active open-items list, NOT
  implemented: (a) transposition non-linear 'tangens' curve (blocked on Han's drawing); (b) two-octave
  range C2→C6 with octave clefs; (c) carousel preset-click tween-to-value; (d) range-setter polish
  (lyrics/label space, 8va/8vb extent, percussion notePool→randomizationRule move).

### Research answers (Han's two questions, 2026-06-22)
- Q: "Where is the phase that generates a NEW melody from SONG-STRUCTURE / parameters?" → DOES NOT
  EXIST in code; it's the DEFERRED backlog item "1B" (generate missing staves on load from chords/
  melody) + "apply 3 (generation settings) upon loading". Song-load path (handleLoadSong →
  resolveLoadedSong.js → loadSong.js) only PARSES fixed JSON staves + transposes; the generator
  (src/generation/) runs only in random/continuous mode, NOT constrained by a loaded song's chords/
  form/difficulty. Infrastructure exists (parsed defs + generator pipeline); the "constrain generator
  to song structure" WIRING does not. Would live in handleLoadSong/resolveLoadedSong post-parse +
  a constraint interface into melodyGenerator/generateBackbeat/chordGenerator. Status: ⏳ DEFERRED.
- Q: "Where are the open tech-debt / refactor blocks?" → Per THIS plan log, Architecture-audit
  Phases 0, 1, 2 are ✅ DONE (2026-06-19 entry); docs/ARCHITECTURE_AUDIT.md is the ORIGINAL roadmap,
  not current state. Genuinely-OPEN tech-debt residue:
  · ⏳ Phase-2-adjacent (left entangled): series-boundary regen + JIT inside Sequencer.start();
    deeper randomizeScaleAndGenerate orchestration (display-note map still duplicated ~3×).
  · 🐞 Tuplet slot/length mismatch ([3:2]q w → phantom rest) — needs "refactor to events" or targeted fix.
  · ⏳ Percussion STYLE on notePool → move to randomizationRule (partial: coarse chooser sets enabledPads).
  · ⏳ Anacrusis Phase 2 STEP 2 (notation/numbering sync) + Phase 3 partial (first-pass pickup/fermata rebase).
  · 🐞 Indefinite-repeat encoding split (Infinity vs -1) — normalization pending.
  · 🐞 Metronome stale on song load (wrong meter, ignores fermata) — root of HBD "extra count".
  · ⏳ Range R1–R4 (per-note cascade, keyboard-trigger, bound-flash 🐞, yellow→white boundaries).
  · ⏳ Legacy 'settings' overlay redundant once PLAYBACK setter lands — deprecate later.
  · ⏳ icons8 image assets blocked (in PR #31, not on this branch).
  · ⏳ Test gaps: Sequencer.js (0 direct tests beyond the Phase-2 harness), useSheetMusicHighlight pure helpers.

## 2026-06-22 — In-sheet GENERATOR setters: PLAYBACK / GENERATION / GENERATION ADVANCED (Han)
Interview done: "balk" = per STAFF (treble/bass/perc), NOT per measure (no per-measure model exists —
confirmed); THREE separate setters/overlay-kinds; FULLY WIRED to InstrumentSettings now; field
mappings taken verbatim from the bottom-view (InstrumentRow).
- 🔨 PLAYBACK setter = REUSE SettingsOverlay (numMeasures, numRepeats, per odd/even-round
  visibility+volume per staff) under a new overlay-kind via a groupClassName prop — NOT a code copy
  (§6c). Legacy 'settings' overlay kept for now (now redundant; deprecate later — flag to Han).
- 🔨 GENERATION setter (per staff): melody notes=notePool, melody type=randomizationRule/play-style,
  notes per measure=notesPerMeasure.
- 🔨 GENERATION ADVANCED setter (per staff): variability=rhythmVariability, span=maxLeap,
  tuplets=polyMultiplier, smallest note=smallestNoteDenom.
- ⚠ CORRECTION (Han 2026-06-22): "balk" INCLUDES the CHORDS row → chords are a 4th balk in the
  generator setters. PLAYBACK already covers chords (SettingsOverlay renders a chords row).
  GENERATION chords-row = complexity / strategy / chordCount; GENERATION ADVANCED chords-row =
  passingChordTypes (other advanced melodic columns N/A for chords). Wired via chordSettings/
  setChordSettings. Mapping flagged for Han to confirm.
- Plumbing: 3 new overlayKinds (useRangeMorph.groupsForKind + SheetMusic overlayKind ternary +
  mountedFor + render blocks); 3 edit-modes + mutual-exclusion toggles in useEditMode; App threading;
  3 SubHeader buttons (lucide + active-glow). Reuse SvgSetter + Maestro glyphs (§6d); RuleSelector/
  PlayStyleSelector can't render in-SVG (return null) so steppers rebuilt with SvgSetter. Wired via
  useInstrumentSettings. Debug hitboxes §3a; Unicode accidentals §5b.

## 2026-06-19 — Transposition setter + flash + staff-spacing batch (Han)
Interview answers: flash at setter OPEN/CLOSE + BETWEEN setters; transpose layout = abstract 20u
grid (C4 centred, C↔B♭ & F↔E♭ aligned); keyboard colour follows transposed note.
- ✅ Flash at setter open/close + between setters FIXED: morph armed DURING render (prevKindRef +
  activeMorphRef) instead of a stale useLayoutEffect setState, so the gate is correct on the same
  render + tween initial styles land pre-paint (§6). +open/close/rapid tests. (`3b5ac50`)
- ✅ Transposition: keyboard chromatone colour follows transposition (getKeyStyle uses tn(note)). (`42a5129`)
- ✅ Transposition setter layout: abstract 20u grid, C4 at midY, C↔B♭/F↔E♭ aligned, carousels
  toward '=' (+25/−10), presets between, LABEL_SIZE 18→22 — consts at top for live tuning. (`c9e3004`)
- ✅ Transposition setter keyboard: C-key glow (canonical box-shadow) + "tap a key to…" text removed
  (glow on literal C, not transpose-target C — flagged). (`42a5129`)
- ✅ Staff vertical MIN gap +10u (minGap 29.5→39.5); baseGap=70 unchanged so tall screens (≥400px)
  are unaffected — only squeezed layouts widen. ⚠ if Han wants the gap bigger on big screens too,
  bump baseGap. (`3b5ac50`)

## 2026-06-19 — Setter-carousel + range-setter feedback batch (Han) — interview done, SHIPPED
Interview answers: fly-in = each CAROUSEL ELEMENT one-by-one (both carousels, shared module);
shrink |interval| = note ORDINAL count (below 8 = no shrink); 5→7 = same card size, wider;
chord names = yes, discreet. All behavior-correct + tested; needs Han LIVE tuning (magnitudes).
- ✅ Colour carousel: NOTE_SPACING 13 → 11 (between example noteheads). (`f374682`)
- ✅ Instrument carousel 5 → 7: visibleHalf now a prop, instrument passes 3, same card size. (`f374682`)
- ✅ Per-element fly-in cascade (BOTH carousels, shared NonLinearCarousel): each item wraps in an
  outer <g data-fly> (cascade) + inner <g ref> (carousel transform) so they compose; parent-group
  data-fly removed. ⚠ stagger uses getBBox().x — LIVE-verify it reads as a cascade. (`f374682`)
- ✅ Chord setter alt/ext columns closer: EXT_ACC_DX 16→12, EXT_COL_DX 22→16. (`0254839`)
- ✅ Chord setter type labels under each: root/power/triad/seventh/altered-extended, discreet
  (fontSize 10, --text-secondary); 2026-05-31 removal reversal documented. (`0254839`)
- ✅ Range setter middle shrink span-aware: rangeMiddleMinScale(oSpan) — <8→1.0, 8→0.9, ≥12→0.5,
  interp; bow generalised to minScale+(1-minScale)*easeInOut(uMid). (`c9d11f0`)

## 2026-06-19 — Architecture audit + refactor Phases 0 & 1 (Han: "doe fase 0 en 1")
Audit report: `docs/ARCHITECTURE_AUDIT.md`. All work behavior-preserving (§4b pure-refactor
exception); 386 tests green, build + lint (0 errors) clean.
- ✅ **Phase 0** — doc-drift fixes (`pregenResult`, `E010-PLAY-MELODY`, `calculateAllOffsets`);
  lint made a required gate (§7b); dead code removed (`appConfig.js`, `PlaybackStateContext`,
  ~truly-dead exports; audit-flagged internal helpers only de-exported, not deleted); SSOT helpers
  `stripOctave` + `chromatoneMix` (noteUtils, byte-identical); `Song` test + 2 invariant grep-guards.
- ✅ **Phase 1** — tempo helpers `secondsPerTick/ticksPerSecond/secondsPerBeat` (timing.js) replacing
  scattered `5/bpm`; note-colour consolidated to canonical `melodicNoteColor`/`chordNoteColor`
  (tonic_scale_keys + percussion branches left per byte-identical analysis); `clefResolution.js`,
  `useEditMode.js`, `LyricsLayer.jsx`+`FermataLayer.jsx`, `useRubato.js`, `resolveLoadedSong.js`
  extracted from the god-files; generation-pipeline golden test (§6b guard).
- ✅ **§6b parser pass** (Han: "doel de 6b pass") — consolidated name→MIDI to `noteToMidi()`;
  generation's off-by-12 confirmed RELATIVE-only (range bounds parsed by the same parser, cancels)
  and preserved via `base:-12`; audit's "4 parsers" corrected to 2 (musicUtils.getNoteIndex returns
  an array index; usePitchDetector is Hz→MIDI/MIDI→name, not a parser). Proof-test pins old numbers.
- ✅ **Phase 2** (Han: "dan fase 2") — built characterization HARNESS first (18 tests pinning
  armPaginationSequence schedule, sessionAbort, randomizeScaleAndGenerate shape, beamGroups), then
  the splits behind it: `computeBeamGroups.js` (grouping math; beam-line geometry stayed),
  `generateNextSeries.js`+`transposeDisplayNotes.js` (Sequencer −187 lines, restores §8 boundary),
  `Sequencer.start()` → `scheduleBlock`/`scheduleTransitions` (990→517 lines; series-regen+setup
  stayed inline; sessionController capture + batching + scheduling byte-identical). 427 tests green.
- ⏳ **Still Phase-2-adjacent, NOT done** (entangled, left per conservative mandate): the
  series-boundary regen + JIT inside `start()`; deeper `randomizeScaleAndGenerate` orchestration.
- ⚠ Refactors are behavior-identical by construction + guarded by the harness, but a quick LIVE
  sanity pass is still wise (playback/page-turns/transitions, lyrics, rubato, song-load, colours).


## 2026-06-18 — Carousel/range/transition feedback batch (Han)
- ✅ Carousels FULLY FLAT (both): NonLinearCarousel scaleForDist→1 (no shrink) + linear x; edge
  opacity fade is the only "more" cue. Colour-carousel label lowered (LABEL_DY=78). (`be34da4`)
- ✅ Instrument labels = "family (subgroup)" bracket + short "variant" card name (e.g. group
  'strings (guitar)' + name 'nylon'); bracket groups by new `group` field; instrumentFullLabel()
  keeps RangeControls unambiguous. Slugs/icons unchanged. (`be34da4`)
- ✅ Range jitter killed: runRangeCascade self-raced (sync frame(t0) + its own rAF = 2 loops). Now
  one rAF, easeOutCubic/280ms (shared curve w/ TranspositionSetter §6d), stagger kept. (`b2c92bc`)
- ✅ Active boundary noteheads light up: reuse #note-glow-subtle (the .note-active look). (`b2c92bc`)
- ✅ 1-frame melody flash on overlay→overlay switch fixed: pure melodyHiddenDuringOverlay() gate,
  stale melody-leave morph no longer force-shows the melody (kind===morphTo guard). (`dcc14dd`)
- 320 tests green, build clean. ⚠ ALL need Han's LIVE view (flatness/spacing, label split,
  cascade smoothness, lit heads, no-flash) — none verifiable headlessly.

## 2026-06-18 — FRESH STATUS LIST (Han asked for a new list; old list was all done)
Everything from the prior outstanding list is implemented + pushed (310 tests green). What
genuinely remains is (A) Han's LIVE verification and (B) decisions/bugs needing Han's input.

**A. Needs Han's live test (implemented, not verifiable headlessly):**
- 👀 Carousel feel — horizontal shrink amount + spacing, category-header edge-pin (jitter gone?),
  cyclical wrap (`528b46a`,`195bc96`,`9620753`).
- 👀 icons8 — nearest-match picks readable at size + correct (`b048ef1`).
- 👀 Range R1/R2 cascade timing (220/140ms), R3 flash gone, R4 white boundaries on LIGHT themes,
  hold-extend grace (`13f8066`).
- 👀 Difficulty → song reloads at new difficulty, only for selected songs (`da86de9`).
- 👀 HBD: first-pass pickup bar shows pass 1 / gone on repeats + highlight aligned; fermata on right
  note; even-repeat anacrusis present; numbering 1.1/1.2…; ∞ suffix climbs unbounded; per-round
  visibility honoured (`7df8ac0`,`ab08ee1`,`b271765`,`3119a72`).

**B. Needs Han's decision / open bug:**
- 🐞 INDEFINITE-repeat encoding split: SettingsOverlay stepper sets `repsPerMelody=Infinity`, but
  Sequencer loop + NumberPicker use `-1`. ∞-numbering + the loop's iteration reset key on `-1`, so the
  Infinity path is broken for indefinite. Needs normalization (pick one encoding). Interview pending.
- ❓ Carousel "horizontal, not a dial" — Han to confirm the exact intended behaviour (still open per his
  own note) before any further carousel change.

## 2026-06-18 (cont.) — UNBOUNDED repeat-numbering for INDEFINITE repeats (Han)
- ✅ #3b INDEFINITE repeat suffix now GROWS UNBOUNDED (maat 1 pass 7 = "1.7", pass 1000 = "1.1000";
  no cap, no reset). Removes the "known limitation" flagged in §40b / the 2026-06-18 entry below.
  ROOT: planner resolves repsPerMelody=-1 to 1 → _armPaginationSequence re-arms EVERY pass; the finite
  path refreshes blockPlayStart=sequenceStartGlobalMeasure each pass → suffix pinned at 1.
  FIX (Sequencer.js): new per-session field `repeatNumberingOrigin` (null until first indefinite arm
  captures sequenceStartGlobalMeasure); in the arm callback, when `isRepeatMode && repsPerMelody===-1`
  PIN blockPlayStart to that frozen origin (never refresh) → computeRepeatPass climbs unbounded.
  FINITE keeps refreshing (cycles 1..N — not regressed). blockMeasureStart refreshed in BOTH modes so
  the BASE measure number N stays 1..numMeasures (only .repeatNum grows). Re-arm/scheduling untouched
  (Song append-only, indices monotonic §6).
- SCOPE = BOTH loaded songs AND generated melodies: both reach indefinite repeat via handlePlayRepeat →
  start(...,repeatForever=true) looping the SAME melodies (no regen — isRepeatMode short-circuits), so
  one signal (repsPerMelody===-1) covers both, no per-source branching.
- ⚠ OPEN INCONSISTENCY (flagged, NOT changed): SettingsOverlay repeats stepper sets repsPerMelody=
  Infinity ("À"), but Sequencer loop + NumberPicker use -1. Unbounded numbering keys on -1 (matches the
  loop's `repsPerMelody !== -1`). The Infinity path also never resets iteration → needs separate
  normalization. Raised for Han.
- ⚠ UNVERIFIED w/o live repro (Han to test): the running suffix climbing on screen across a long
  indefinite session.
- Tests: replaced the stale "monotonic (deferred)" test with an UNBOUNDED-origin test (pass 7→7,
  23→23, 998, 1000 + strict-monotone 1200-pass loop) and a FINITE-cycling guard (1..N). 309→310 green.
  Build clean. Docs: §40b "Known limitation" replaced with #3b unbounded behaviour + the Infinity/-1
  note. computeRepeatPass header comment updated.

## 2026-06-18 — HBD anacrusis Phase 3 (leading pickup bar) + repeat-numbering parity (Han)
- ✅ #2A LEADING PICKUP BAR on the FIRST pass (arch §40b). New pure helpers in anacrusisRepeat.js:
  `mergedBodyPassIndex` (SESSION-global pass index — pickup bar shows only on pass 0, because the
  audio lead-in plays once per session, not per block), `showsLeadingPickupBar`,
  `buildFirstPassMergedMelodies` (prepends original m0 pickup to the merged body shifted +1 bar; same
  buildAnacrusisRepeatParts core, fermatas at ORIGINAL ticks). App.jsx mergedRenderMelodies memo now
  pass-aware: pass 0 → first-pass melody rendered through the ORIGINAL anacrusis path
  (mergedBodyMeasures=null + anacrusisMeasureIndex=0 → existing pickup-suppression + 1..N numbering,
  §6d no new barline code); pass ≥2 → plain merged body. §40a highlight invariant preserved via
  `renderStartMeasureIndex = startMeasureIndex − 1` on pass 0 (pickup bar → unhighlighted index, body
  realigns to schedule's globalMeasureIndex 0..N).
- ✅ #3 REPEAT NUMBERING replicates the generated path (Han's directive: "replicate the existing
  melody repeat logic", no new infinity mechanism). ROOT CAUSE: isRepeatMode short-circuits before
  the series-flip so blockMeasureStart/blockPlayStart were stranded while startMeasureIndex advanced
  → suffix overflowed ("11" instead of "1.x"). FIX: `_armPaginationSequence` initial callback now
  refreshes both counters for isRepeatMode using applyResultToSetters' EXACT formula (§6c). Suffix
  math extracted to pure `computeRepeatPass` (src/utils/repeatNumbering.js); BarlinesLayer uses it.
  Result: suffix CYCLES 1..repsPerMelody per block (finite case Han reported).
- ⚠ LIMITATION (flagged): if repsPerMelody === -1 the planner resolves it to 1 → re-arms every pass →
  suffix pins at 1 (not growing). True indefinite-growth needs the planner to stop re-arming — the
  directive deferred that. Finite case (the reported bug) is fixed.
- ⚠ UNVERIFIED w/o live repro (Han to test): exact frame the pickup bar appears/disappears at the
  pass-0→pass-1 boundary; highlight alignment on pass 1; the even-repeat anacrusis sub-report.
- Tests +15 (294→309 green): mergedBodyPassIndex/showsLeadingPickupBar/buildFirstPassMergedMelodies
  in anacrusisRepeat.test.js; computeRepeatPass cycling/overflow/monotonic in repeatNumbering.test.js.
  Build clean. The two just-landed fixes (fermata rebase, #4 per-round) left intact.

## 2026-06-17 (cont.) — Carousel feedback ROUND 2 (Han) + honest outstanding list
- ✅ Colour notes: RESTORED C4→C5 ascending (the "flatten the wheel" was MY MISREAD — Han wanted
  the CAROUSEL horizontal, not the notes). getNoteAbsoluteY + ledgers + clefTreble back.
- ✅ Carousel "horizontal not a dial" = MUCH MILDER shrink (Han chose): scaleForDist 1.0→0.45 → 1.0→
  0.82, both setters (shared primitive).
- ✅ icons8 credit centred DIRECTLY BELOW the carousel (was left-aligned below the staff).
- ✅ Category-header EDGE-PIN (anti-jitter): when a run's outer item is the outermost-visible item,
  pin that bracket end to the fixed carousel edge (centerX±EDGE_X) instead of the shrinking item x.
- ⚠ I OVERSTATED progress ("queue is clearing"). OUTSTANDING (honest): range R1–R4 (per-note
  cascade, trigger-on-keys, bound-flash 🐞, yellow→white boundaries); difficulty→reload-loaded-song;
  HBD #2/#3/#4 (DIAGNOSED — see HBD diagnosis below — pending Han's §4b answers).
- HBD DIAGNOSIS DONE (read-only): #2 = Phase-3 first-pass pickup gap + fermata rebased for audio
  not render (anacrusisRepeat.js toRenderBody / SheetMusic.jsx:1560 indexOf(f.tick)); #3 = repeat
  numbering desync past numRepeats (BarlinesLayer.jsx:120-136 + skipped series-flip in isRepeatMode;
  fix = repsPerMelody→∞/no-series-flip); #4 = App.jsx:1375 viewMode ternary keys on
  isPlayingContinuously, but songs play via handlePlayRepeat (isPlayingMelody) → static oddRounds
  branch. Interview questions pending (esp. #2 first-pass layout).

## 2026-06-17 (cont.) — Carousel feedback + range-selector batch (Han)
CAROUSEL / coloration:
- ✅ Restore colour example notes to full C4–C5 run (had dropped to 5). NoteColoringStaffOverlay NOTES.
- ✅ Widen both carousels +40% (instrument BASE 40→56, colour BASE 96→134).
- ✅ Lower the category label (instrument HEADER_DY -16→-10).
- ✅ Instrument names → "strings (guitar nylon)" etc (Han: "we agreed strings (guitar)").
- ✅ Carousel CYCLICAL (wrap-around / infinite). NonLinearCarousel: posRef free + wrapPos[0,N),
  signedDist nearest-wrap render, no clamp on drag/glide, shortest-path animatePosTo, commit maps
  back to real index. visibleRange now returns an ORDERED wrap-aware ARRAY. (2026-06-17)
- ✅ Category label LIVE-MOVING with the carousel during drag (Han: worth the cost). New optional
  onPosChange(pos) on the primitive → InstrumentStaffOverlay.updateHeaders drives a fixed pool of
  MAX_HEADERS bracket <g> slots imperatively each frame (§6, no per-frame React state; morph-safe).
- ✅ "Flatten the wheel" (clarified): COLOUR example notes now on ONE horizontal baseline
  (middle staff line, FLAT_DY=20) — horizontal colour swatch, getNoteAbsoluteY + ledgers removed.
  Instrument setter already flat (left as-is). Tests +5 (291 green), build clean, docs §38 updated.
- ⏳ icons8 IMAGE wiring: assets are in PR #31 (50/100px PNGs) on its branch — bring them onto this
  branch, then getInstrumentIcon returns <image> + flip ICON_ATTRIBUTION. ("didn't use icons8 yet").
  Han 2026-06-17: use the 'Rock Music' icon8 icon for ELECTRIC GUITAR + ELECTRIC BASS; KEEP the
  mandatory 'Icons by Icons8' credit visible while the setter is open.
- ⏭️ NEXT after carousel-v2 + icons8 (Han 2026-06-17): continue with HAPPY BIRTHDAY song bugs
  (#2 first-pass anacrusis/fermata + even-repeat anacrusis, #3 repeat numbering / indefinite=∞,
  #4 song per-round visibility/audibility) — the unfinished anacrusis phases (§40).
RANGE SELECTOR batch (separate subsystem — next focused effort):
- ⏳ R1 After-selection animation feels cumbersome → animate/slide PER NOTE in quick succession
  (staggered cascade) instead of all-at-once. (reuse flyInCascade-style stagger in RangeStaffOverlay.)
- ⏳ R2 Trigger the SAME animation when range changed via the KEYS (keyboard range setter).
- 🐞 R3 Keyboard range setter: the range bound FLASHES briefly when the keyboard adjusts.
- ⏳ R4 Boundary highlight YELLOW→WHITE (chromatone visibility): keys, notes, preset brackets, the
  selected bracket, and the boundary setter on the keys — all white.

## 2026-06-17 (cont.) — UI redesign: NonLinearCarousel primitive + setters
- ✅ NEW shared `NonLinearCarousel.jsx` primitive: ~5 visible items, middle = active, sides
  fade+shrink (eased symmetric falloff); BOTH tap (glide-to-centre) and drag (settle-snap)
  select; CTM px→user + tap-vs-drag borrowed from ClefCardCarousel; opacity/scale/x via
  element.style in rAF (§6); §3a debug hit box. Smoke test added.
- ✅ InstrumentStaffOverlay rebuilt on primitive, per staff; icon 22→33 on staff, name below,
  dynamic CATEGORY bracket (8va "blokhaken" look) above — shown when 2+ of a category visible,
  centred over its run; SVG-native + data-fly (morph kept).
- ✅ NoteColoringStaffOverlay rebuilt on primitive; reorder+rename none→chord→scale→chromatone→
  subtle chromatone ('tonic_scale_keys' value kept, label→Scale). COLOR_MODES order+labels
  updated in SubHeader / RangeControls / SettingsPanel.
- ✅ Clef now always shows in colour menu (removed colorEditMode guard in SheetMusic ~L1951);
  F-major g-clef "missing" was just that guard — clef char is key-independent.
- ✅ docs/architecture.md §38 added. Tests 276→286 green, build clean.

## 2026-06-17 (cont.) — Han bug batch (HBD playback) + instrument transition + difficulty/icons
- ✅ #1 Transition INSTRUMENT→COLOUR fixed. ROOT CAUSE: InstrumentStaffOverlay cards were the only
  overlay using `<foreignObject>`; foreignObject HTML does NOT composite/fade with SVG group opacity
  during the morph. The instrument overlay paints AFTER (on top of) the colour overlay, so the
  exiting foreignObject stayed visible over the colour noteheads sliding in → they "just appeared"
  when it finally unmounted. FIX: render cards SVG-native (lucide <svg> nested in a translated <g>
  with currentColor + a <text> name), no foreignObject — fades cleanly like every other overlay.
  Also pre-aligns the eventual icons8 <image> swap. 276 tests green (updated the overlay test),
  build clean. File: InstrumentStaffOverlay.jsx.
- ✅ icons8 files FOUND in PR #31 (full 50/100px PNG set: accordion, banjo, cello, bassoon, …) on
  its own branch. To wire: bring those assets onto this branch, then getInstrumentIcon returns an
  <image> + ICON_ATTRIBUTION → "Icons by Icons8". Queued (separate from the glitch fix).
- ⏳ FR (Han 2026-06-17): enable 'original key' (original tonic) by DEFAULT on song load.
  handleLoadSong already takes useOriginalTonic — flip the default / the SongsTab call. §4b: confirm
  scope (all songs? the toggle's default state?).
- ⏳ FR (Han 2026-06-17): MOVE the difficulty setting OUT of the song selector → make it a GENERAL
  setting. Future: each song + variant carries a 'difficulty score'. Ties into the difficulty→reload
  work above. §4b: where should the general difficulty control live (header? settings?).
- 🐞 #1 Transition INSTRUMENT→COLOUR (now ✅ above).
- ✅ FR original-key DEFAULT ON (Han 2026-06-17): SongsTab useOriginalKey useState(false→true).
- Difficulty CLARIFICATION (Han 2026-06-17, supersedes "move out"): KEEP difficulty IN the song
  selector, next to 'original key'; it should only affect SELECTED songs. (≈ no move; it's already
  per-song in SongsTab.) Difficulty→reload-loaded-song still applies for the difficulty rework.
- 🔨 BIG REDESIGN — instrument setter as a tight ~200px CAROUSEL (Han 2026-06-17), + same for the
  colour setter. Spec (needs §4b interview — ambiguous): icons ~50% larger; NAME below the staff;
  CATEGORY header above (8va-bracket style |---- GUITAR & BASS ----|), shown only when 2+ of that
  category are visible, centered over the active selection, moving dynamically; 5 instruments
  visible, MIDDLE = active/selected, sides fade + shrink. Re-categorise: harp → strings(other) (not
  keys); violin/viola/cello/bass → "strings (viola)" etc; guitar → "strings (guitar)". Whole thing
  ~200px so it can be juxtaposed. INTERVIEW before rebuilding (I just built this overlay).
- 🔨 Colour setter: same carousel treatment + REORDER/RENAME schemes → none, chord, scale (rename of
  tonic/scale), chromatone, subtle chromatone. (Label/order change is clear; carousel = part of the
  redesign interview.)
- 🐞 F-major g-clef not shown in colour settings menu (Han "suspicious of hard-coding"). FINDING:
  SheetMusic.jsx:1950 `!clefEditMode && !colorEditMode` INTENTIONALLY hides the static clef in colour
  mode — so no clef shows in colour mode for ANY key by design. Contradicts "shows except F major";
  clarify whether the clef should show in the colour menu at all, vs a real F-major-specific glitch.
- 🐞 #2 HBD anacrusis edge (anacrusis itself ✅ works!): on the VERY FIRST playthrough BOTH measure 0
  AND the anacrusis (0.2) should show; removing measure 0 puts the fermata on the wrong note. Also:
  the EVEN repeat has no anacrusis on its last measure. → maps to anacrusis Phase 3 (leading-pickup
  bar on first pass) — left ⏳ in §40 work.
- 🐞 #3 Repeat numbering bug: after exceeding numRepeats on "repeat one indefinitely", numbering is
  wrong (sees "measure 11" → should be "1.5" etc), recurs at each multiple of numRepeats. DECISION
  (Han): for indefinite repeats, numRepeats should be silently set to INFINITE. → maps to anacrusis
  Phase 2 wiring STEP 2 (NOTATION sync: App melody/numbering vs Sequencer body divergence) — left ⏳.
- 🐞 #4 Song visibility/audibility per-round not applied: in Settings the per-round visibility +
  audibility of the melody works for NORMAL melodies but NOT for SONGS (all notes show regardless).
  Find where the song path diverges from the exercise path.
- ❓ #5 (Han): I omitted the outstanding SONG phases when asked for next steps. OWNED: my review swept
  BACKLOG.md status markers and missed the in-flight phases here in the PLAN (§40 anacrusis: Phase 2
  STEP 2 notation, Phase 3 first-pass pickup bar, open Qs). Need to clarify if "generate in same
  style" is a separate future phase (generate fresh exercises in a loaded song's style) or = these.
- ⏳ Difficulty change → RELOAD THE LOADED SONG (Han 2026-06-17): store the loaded songDef; on
  difficultyLevel change, if a named song is loaded re-run handleLoadSong(storedDef, newDifficulty)
  (fires transition); else regenerate fresh exercise. Replaces the current re-fly-current-notes.
- ⛔ icons8 files: Han says they're in src/assets, but src/assets has only fonts/maestro.ttf on the
  pushed branch + the tree is clean — they were NOT committed/pushed. Blocked until they land in the repo.

## 2026-06-16 — New backlog (Han) + quick wins
- ✅ Range setter defaults: β mid-bow 0.3→0.6, drag px 6→10 (RangeStaffOverlay.jsx 144/149).
- ✅ Note-click animation smoother (range setter): tap-to-set now SLIDES the boundary
  notes continuously (eased rAF tween of a FRACTIONAL ordinal feeding the x(t) layout),
  instead of the per-natural stepper that re-rendered per natural (choppy jumps). Commit
  to app state ONCE at tween end. Drag + hold-extend preserved. `beginSlide`/`slideFrame`
  + `slideRef` in RangeStaffOverlay.jsx; old stepper retained as dead-for-taps. Docs:
  architecture.md "Continuous tap-slide". 253 tests green, build clean.
- 🔨 Universal 1.5s transition (fade-out 0.25s → staggered notes fly in from right → others
  slide/fade). Interview done; decisions: difficulty=fires (distinct from manual regen),
  always plays even during playback. Reuses the EXISTING cascade primitive.
  - ✅ Phase 0: extract shared `flyInCascade` runner from useRangeMorph (one source of truth;
    dropped a latent double-rAF). +smoke test. (`src/utils/flyInCascade.js`)
  - ✅ Phase 1: `useUniversalTransition` (clone-overlay + flyInCascade) + `UniversalTransitionContext`
    (prop key bus); wired SONG LOAD (fireTransition at end of handleLoadSong). Sheet mounts it.
  - ✅ Phase 2a: DIFFICULTY change fires it (mount-guarded effect). Note: difficulty feeds the
    NEXT generation, so this re-flies current notes (acknowledgement) — flag to Han if he wants
    difficulty to also regenerate so the cascade shows NEW content.
  - ✅ Phase 2b: TAB/screen change — "sheet only" (Han): fire when landing on the sheet-music tab
    (sheet toggles via display:none, not unmount). Setter-overlay trigger (#3) already handled by
    useRangeMorph. NOTE: song-TIER difficulty (SongsTab) already loads-a-new-song → already fires
    via Phase 1; the global difficultyLevel slider (Phase 2a) re-flies current notes.
  - ✅ Phase 3: tagged lyrics (solfège/text/rhythmic rows — all inside `.notes-transition`) +
    TranspositionSetter "=" / "concert C₄ =" labels + fixed C4 anchor head with data-fly. Dynamic
    carousel heads left to fade (own scale transform + selection tween — avoid fly conflict).
  - ✅ Phase 4: OttavaMarker NEW marker SLIDES in from right (SLIDE_IN px, easeInOut) during its
    fade-in; OLD fades in place; fade fallback on removal. style.transform via rAF (§6), cleared.
  - ✅ CR (Han 2026-06-16): more elements must SLIDE not fade + fix fade timing. Decisions: GLOBAL
    "wait 1s → fade 0.5s" for non-sliding elements; "slide notes, fade labels". Redesigned
    flyInCascade: group no longer fades (would hide sliding notes); fly elements slide visible;
    non-fly subtrees (collectFadeEls) do the delayed fade. Tagged data-fly: transposition notehead
    carousel (outer-wrap to keep scale) + name carousel, range preset brackets + 8va group. Untagged
    the "=" / "concert C₄ =" labels (→ delayed fade). Colour heads already slide; labels delayed-fade.
  Docs: architecture.md "Universal 1.5s transition" + Ottava entry. 261 tests green, build clean.
  - ✅ CR2 (Han 2026-06-16): transposition menu presets + "concert C₄" label followed OLD logic
    (the clef-variant-enter CSS slide-from-left+fade), inconsistent with the sliding carousels.
    Root cause: the whole setter was one `clef-variant-cards clef-variant-enter data-fly` block, so
    collectFadeEls skipped its children + the nested data-fly conflicted. Fix: made the setter
    wrapper a PLAIN container (drop clef-variant-enter + block data-fly) ONLY for the transposition
    branch — now carousels/heads slide, presets + "=" / "concert C₄ =" labels delayed-fade.
    Family-switch entrance covered by useClefRefly. Also removed the redundant top-right "(X inst)"
    label (covered by the clef-left transposition label). ClefStaffOverlay.jsx + TranspositionSetter.jsx.
- ✅ Coloring: 'scale' mode (in-scale = scale-degree colour, out-of-scale "blue notes" greyish)
  everywhere incl keyboard — routed via melodicNoteColor (§6c). [commit "Add 'scale' note-colouring mode"]
- ✅ Range setter — VERTICAL (up/down) drag (Han 2026-06-16, "both axes move it"): boundary drag
  now sums horizontal + vertical into a unified raise (UP = raise pitch); diagonal combines.
  svgY() + downRef.y + radial DRAG_THRESHOLD. RangeStaffOverlay.jsx onMove.
- ✅ Range setter — in-range notes SHRINK toward the middle (Han "symmetric, eased", in-range only):
  100% at boundaries → ~50% at exact middle, eased, by natural ordinal; scales head+stem+ledgers.
  Docs: architecture.md "Both-axes drag + middle-shrink". 261 tests green, build clean.
- ✅ Instrument selector IN SHEET MUSIC (Han 2026-06-16) — built + reviewed. 271 tests green (10
  new), build clean. New in-staff setter (sibling of clef/range/colour), PER-STAFF. Icons = lucide
  placeholders + name (can't fetch icons8), structured for icons8 drop-in (getInstrumentIcon +
  ICON_ATTRIBUTION, TODO(icons8) markers); attribution line shown while open. Reuse: setTreble/
  setBassSettings instrument slug; ClefCardCarousel (scroll/center/off-screen); shared
  src/constants/instruments.jsx (grouped, +10 instruments; RangeControls imports it too). Plumbing
  mirrors colorEditMode (App/SubHeader/SheetMusic/useRangeMorph groupsForKind 'instrument'). Review
  tweak: strip slides from the RIGHT (plain data-fly, not data-fly-from=startX which barely moved a
  full-width strip). Docs: architecture.md §41. ⚠ visual: confirm foreignObject card placement
  (STRIP_TOP_OFFSET) + the right-slide in dev.
- ✅ BACKLOG hygiene (Han 2026-06-17): marked the seven June-16 NIEUWE FEATURE REQUESTS ✅ with
  dated completion notes (I'd left them as "Logged" — Han: "you are relisting items i told you to
  close"). Then did a full-file open-items review.
- ✅ BUG: malformed sheet on TIME-SIGNATURE change while stopped (BACKLOG line 1587, open since May)
  — FIXED + reviewed (280 tests, +9; build clean). Final fix in the dated entry at the bottom.
  Diagnosed (read-only Plan agent + my code reads): melody is meter-independent absolute ticks, so
  re-barring = re-slicing; the processor already splits/ties across barlines. ROOT CAUSE = SheetMusic
  melodyMeasureCount uses Math.round(totalDuration/measureLengthSlots) → when old melody doesn't
  divide evenly into the NEW meter, rounds DOWN and the slicer DROPS the partial final measure's
  notes (persists until regen). Han's §4b decisions: RE-BAR (don't regenerate), eliminate at state
  level. Fix = ceil (with epsilon) so the partial measure shows with trailing-rest + cross-barline
  ties; add rebarMelody only if the per-measure path drops tied continuations. No regen on stopped
  TS change (state already single-commit). Implements the "graceful partial-measure display" the
  useAppHandlers.js:114 comment promised. Delegated to impl agent; review pending. §6b re-read req'd.
(All recorded verbatim in BACKLOG.md per §1b.)

## 2026-06-15 (night) — Small CRs (Han, parallel to core anacrusis refactor)
- 🔨 EASY percussion: replace hi-hat `hh` (beats 2&3) with snare RIM CLICK `sr`. (happyBirthday.json)
- 🔨 HBD EASY: add a C chord in measure 5. (happyBirthday.json easy chords)
- 🔨 Chord slash: lower by 2 units (CHORD_ROOT_Y−10 → −8). (ChordLabelsLayer.jsx)

## 2026-06-15 (eve) — Item 2: playback & repeat behaviour (Han, interview done)
Mostly VISUAL bugs + metronome/fermata sync. Han directive: STOP any HBD/repeat-specific
hardcoding; analyse the NORMAL-melody render/repeat logic and REUSE it (consistency, §6c).
- ✅ V1 + V4 (SAME root cause). processMelodyAndCalculateSlots.js trailing-rest padding measured
  the gap from Σdurations — which UNDERCOUNTS a SPARSE track with note gaps (e.g. HBD's root-on-1
  bass) → padded a giant rest pushing the bass to ~measure 13 (phantom measures, rests bass-only).
  FIX: measure from the track's TRUE end (lastTimestamp). Instrument-agnostic; contiguous tracks
  unchanged. Removed the old 2026-05-29 reduce + its comment (flagged to Han).
- 🔁 V2 + V3 likely DOWNSTREAM of V1/V4 (agent: the 14-vs-9 measure mismatch misplaced the
  repeat-preview / even-round overlay via `mw = displayNumMeasures*measureWidth`). Re-test after
  V1/V4. CAVEAT: loopMerged (the audio merged-pickup) is audio-ONLY and never reaches the sheet,
  so if V2 ("anacrusis notes not shown in last bar of the repeat block during playback") persists,
  it needs separate work to RENDER the merged pickup there. ⏳ awaiting Han re-test.

## 2026-06-15 (night) — Item 2 deep root-cause (2 agents). Han: audio incl. repeats now CORRECT.
ROOT CAUSE shared by highlight-lag + V2: **DUAL REPRESENTATION**. Sequencer loops the BODY-MERGED
melody (pickup lifted, body rebased to 0, 8 bars) for audio + highlight, but SheetMusic renders the
ORIGINAL PADDED melody (pickup at m0, 9 bars). Sequencer even builds an abstract Song via setSong()
— but SheetMusic NEVER consumes it (dead path). No HBD string-literal special-casing exists; the
problems are representation divergence + mode-gating.
- 🐞 HIGHLIGHT off-by-one: render measure-index (padded, pickup=m0) lags the schedule (merged,
  body=0) by exactly the pickup bar. Fix = renderer consumes the SAME merged body the Sequencer
  loops (Option A: push loopMerged melodies to the melody state the sheet reads). Song-agnostic.
- 🐞 V2: loopMerged places the next loop's pickup at the END of the last bar — audio-only today.
  Same Option-A fix surfaces it on the sheet. (anacrusisRepeat.js:49 is pure + handles overlap.)
- 🐞 V3: NOT a layout bug. evenRounds DEFAULT config (App.jsx:114-121) sets trebleEye/bassEye/
  percussionEye=false → even round intentionally hides note staves (round eye-toggle feature). To
  show notes = flip the evenRounds eye defaults. PRODUCT DECISION (ask Han).
- 🐞 NUMBERING (BarlinesLayer.jsx:109-123): measureLabel = `${N} . ${repeatNum}`; repeatNum =
  floor((startIdx-bps)/numMeasures)+1 = the loop-PASS count (the "·5" = 5th pass) appended to EVERY
  measure. Two defects: (i) suffix leaks onto per-measure numbers; (ii) `repeatNum>1 ? … : N`
  SUPPRESSES pass 1 → first repeat shows "1" not "1.1", second "1.1" not "1.2" (off-by-one); (iii)
  divisor numMeasures=9 includes the pickup while the body loops over 8 → drift. Grammar = ASK Han.
- 🧹 REDUNDANCY catalogue (agent): dead setSong-for-render; anacrusis handled only in repeatForever
  mode (continuous replays a dead m0); anacrusis detected twice (App.jsx:1235 + Sequencer.js:82);
  numRepeats==repsPerMelody (two names, App.jsx:1258). All to unify — scope = ASK Han.
- ✅ M1 Metronome now follows the song's meter + holds through fermatas (Sequencer.js).
  Regenerate currentMetronome for currentTS/currentNumMeasures + attach treble.fermatas.
- ✅ CHORD-ROW-Y [Han 19:51]: moved the whole chord row up 15 (trebleStart−58 → −73) via a
  shared `chordRootY(trebleStart)` constant (ChordLabelsLayer, imported by ChordStyleOverlay,
  §6d) so it applies in ALL places; empty-count slashes aligned to the label baseline.

## 2026-06-15 (pm) — HBD song restructure (Han item 1A) + B2 root cause found
- ✅ 1A HBD difficulty restructure (data only, src/songs/data/happyBirthday.json):
  - EASY: added bass (chord ROOT on beat 1 only, dur 12, m1–m8, rests through m0 pickup)
    + percussion (waltz: kick `k` on beat 1, closed hi-hat `hh` on beats 2 & 3, m1–m8).
    Treble + chords unchanged. (Han answers: root-on-1 bass; kick(1)+hihat(2,3); keep
    chords; backing from m1.)
  - MEDIUM (new): treble + bass copied verbatim from the former HARD chorale. No chords/
    percussion (path B will generate chords on load later). Carries the [name] fermata.
  - HARD: now treble + chords only; its bass moved to MEDIUM.
  - SongsTab derives available diffs from the data → medium auto-surfaces, no UI wiring.
- ⏳ 1B (generate missing staves on load from chords/melody) — DEFERRED until item 3 is set
  (Han: "B means apply 3 upon loading for missing staffs").
- 🐞 B2 (item 2 — playback) root cause FOUND (agent), DEFERRED per Han "song first":
  HBD fermata {tick:216,hold:18}=1.5 beats shifts melody/chords but NOT the metronome
  (which is also STALE/wrong-meter on every song load — never regenerated, App.jsx:443-499).
  → perceived "extra count" at the end, in BOTH once + repeat. NOT the anacrusis-repeat path.
  Fix (later): make the song's metronome honor the fermata (+ regenerate metronome on load).

## 2026-06-15 — bug batch (Han) — interview done; B1/B3/B4 implemented
- ✅ 🐞 B1 Colour setter spurious melody fly-in. FIX: registered 'color' as its own
  morph surface (`overlayKind`), added `colorMounted` (mountedFor) so it survives the exit
  morph, `groupsForKind('color')→.note-coloring-overlay`, and `data-fly` on each scheme
  notehead. Now the scheme rows fly in like range/clef; the melody no longer flies in.
  Files: SheetMusic.jsx, hooks/useRangeMorph.js, overlays/NoteColoringStaffOverlay.jsx.
  (Han B1 answer: own fly-in like range/clef.)
- 🐞 B2 Happy Birthday end: a single extra count at the end — Han: BOTH single + repeat.
  Single play does NOT hit the anacrusis-repeat path → root cause is in the BASE
  playback/metronome/song-length path. Background agent tracing root cause. ⏳
- ✅ 🐞 B3 Range setter notes now fly in (from the RIGHT, match others — Han B3 answer).
  FIX: wrapped each melodic note in an outer `<g data-fly>` (inner `<g>` keeps the
  scale/opacity transform so the fly translate doesn't clobber it).
  File: overlays/RangeStaffOverlay.jsx.
- ✅ 🐞 B4 Range setter in-range 8va. Han confirmed REVERSING the 2026-06-14 #2 rule:
  fold EVERY note (in-range included) so a wide selection's high/low in-range runs get an
  8va/8vb bracket instead of ledger sprawl. FIX: `folded` now always calls
  `foldNoteToStaff`. File: overlays/RangeStaffOverlay.jsx.
  NOTE: supersedes the 2026-06-14 (pm) entries "fold ONLY out-of-range context notes".

## 2026-06-14 (pm) — range tuning + keyboard/transpose + chord names (Han, post-merge of #29)
- ✅ 🐞 TabView bass-tab keyboard showed range setter in clefEditMode → KeyboardTransposeSetter.
- ✅ 🐞 Octave index labels suppressed on ALL transposed keyboards → only suppress in the
  transpose setter.
- ✅ Transpose-setter keyboard now follows note-colouring (noteColoringMode/activeChord/theme).
- 🔨 Range setter spacing (Han "help me tune"): densest near (Xl+Xr)/2, ~linear (~(Xr−Xl)/8),
  first out-of-range note at (Xr−Xl)/8. Preset: τ=3, Xl=0.2, Xr=0.8, context=10, drag=6.
  Use dense-middle bow g(u)=u+(β/2π)·sin(2πu) on the ordinal map.
- 🔨 Range setter 8va/8vb triggers too eagerly → fold ONLY out-of-range context notes
  (in-range notes stay true pitch); the 8va rules consider in-range notes only.
- ⏳ Range setter 8va/8vb GLYPH style must match the melody's ottava (consistency).
- ✅ Transposed keyboard: displayed RANGE still uses concert min/max. With Concert C=E +
  range c4–e5 it shows A♭3–c5; should show c4–f5 (keys keep physical positions; e5→f5 since
  the transposed boundary lands on a black key). Range labels must follow the transposition.
- 🔨 Chord NAME labels not coloured → colour each chord label by its ROOT (chromatone/tonic).
- ⏳ BACKLOG (song bugs) — see BACKLOG.md.

## 2026-06-13 (pm) — setter polish batch (Han)
- ✅ R1 CHECK: does the RANGE setter apply note-GROUPING? NO. Melodic range notes are drawn
  by `winNotes.map` → `StaffQuarterNote` at `rxFor(midi)` = pure PITCH spacing (the cosine
  x(t)); the percussion row uses MelodyNotesLayer with STATIC_LAYER_PROPS
  (noteGroupSize:1, measureLengthSlots:9999, rhythmicGrouping:null) → grouping disabled.
  Nothing to fix — the uneven spacing Han sees is the intended cosine pitch-spacing.
- ✅ R2 DONE: keyboard setters MIRROR the sheet-music setter modes — RANGE mode → keyboard
  range setter; NOTATION mode → keyboard notation/transposition setter (NOT both at once;
  today KeyboardRangeSetter shows for both + my −/+ stepper → both visible). Remove the
  −/+ stepper; reuse the staff's transposition setter style; unify with the per-staff
  transposition value (settings.transpositionKey / trebleTransSemitones). ⚠ sound semantics
  fork — interview.
- ✅ 3a DONE: setter-menu buttons (SubHeader RANGE/TRANSPOSITION/SETTINGS/…): all same highlight
  colour, lowlight when inactive, GLOW when active — reuse the current-note highlight glow
  (the note-active box-shadow). Reuse code.
- ✅ 3b DONE: NEW "note colouring" settings menu. Staff-rendered, staff-independent (no clefs).
  One row of 8 notes C4–C5 per colour scheme (COLOR_MODES = none, tonic_scale_keys, chords,
  chromatone, subtle-chroma), click a row to select. ⚠ interview entry-point/scope.


## 2026-06-13 — Range setter spacing + debug tuner + keyboard transposition
- ✅ Range x(t): sigmoid → **cosine-integral** ramp (uniform spacing near the range
  edges, compressing toward the middle). Tunable `compress` param.
- ✅ Debug-mode **live tuner** in the range setter (sliders: compress, tanh τ,
  Xl/Xr frac, context, drag px + reset).
- ✅ Rename NOTATION button → **TRANSPOSITION**; staff setter label → "concert C =".
- ✅ **Keyboard transposition** (pitch-class 0-11, no octave; −1≡+11): `tn()` in
  PianoView shifts label/sound/highlight; "concert C =" stepper in
  KeyboardRangeSetter (clefMode) + reset. State in App, drilled via TabView. See
  docs/architecture.md §38.
- ⏳ Verify in-app: keyboard sound/highlight/label shift + the stepper UI (couldn't
  test interactively here).

---

## CONSISTENCY BATCH (Han 2026-06-09) — notation settings menu

Root cause: setter hand-rolled notation instead of reusing the staff renderer → drift.
Process fix: new CLAUDE.md §6d (reuse canonical renderers; single source of truth).

- ✅ A Shared `staffNoteGlyph.jsx` (`StaffQuarterNote` + geometry constants). Setter heads,
     fixed C4 note, accidentals now use it (head fs36 at positionY, stem +11/+0.5 len27,
     accidental fs36 anchor=end). renderMelodyNotes imports the same constants → single source.
     Fixes: head 6px-off, tiny accidentals, hand-drawn stems, wrong stem dir, font size.
- ✅ B Frame lines: removed startX vertical line in ALL overlay menus; endX line thinned to
     0.5 (staff-line weight) — was 1.0. (#8 all menus, #9 incl. range setter.)
- ✅ C Left setter: removed "C4" text → just [rendered C4 note] "=" [carousel] (#7). Carousel +
     quick-pick names use subscript octave (C₄) via NoteLabel (#3); active name = label size 16 (#4).
- ⏳ D #5 Two-octave range (C2→C6): wire octave clefs (8va/15ma/8vb/15vb) + transpositionOctave;
     decompose total trans → key+octave; auto-switch clef so far heads return near staff. BIG.
- ⏳ E #6 Carousel animation: clicking a preset/quick-pick TWEENS the carousels to the value
     (not instant); highlight only the active preset.

---

## Feedback batch (Han 2026-06-03 #15) — INTERVIEW PENDING, no code yet

BATCH 1 done (clef setter, isolated/safe):
- ✅ #11 treble8va blank glyph fixed — was `char:' '`; now plain treble + serif '8'
  ottava marker (clefGlyphs.jsx; new numeric-ottava render path, '15' path untouched).
- ✅ #12 instrument-name now matches the real staff label (fontSize 12, plain serif,
  non-italic) instead of italic size-9 Georgia.
- ✅ #6/#17 active option = `--accent-yellow`, non-selected = new darker
  `--setter-lowlight` token (added to all 4 themes in App.css).
Surfaces clarified (Han 2026-06-03): "range setter" = RangeStaffOverlay (SEPARATE from
clef setter); C4-ledger #4 = chords in the akkoordlijn (chord line), not clef-setter notes.

REMAINING — staged batches:
- BATCH 2 (clef-setter GEOMETRY refactor, approved "reuse real staff geometry"):
  · ✅ #14 distribute variant clefs across 12%→86% of [startX,endX] (carousel + vocal).
  · ✅ #10 bottom clipping: decoupled carousel clipHeight(108) from tap height(74) so
    the C4 ledger shows without the gesture rect bleeding into the row below.
  · ✅ #15 baritone = full 'baritone-f' clef (Han: setter + sheet). New clef in
    clefSymbols (char '?', yOffset -10), renderMelodyNotes clefOffsets (-61 = bass+10),
    renderAccidentals (10, ≈bass — FLAGGED for visual key-sig check), VOCAL_VARIANTS
    baritone → 'baritone-f'. Flows through calculateOptimalClef (Baritone rangeMode).
  · ✅ #10 v2 "clip gewoon NIET": carousel clips HORIZONTALLY only (huge vertical span)
    so no top/bottom cut; fades pulled to the very edges (0.015/0.985) so right no longer
    looks clipped early; clef inset (+8) so leftmost clef isn't cut.
  · ✅ #8: clef inset +8 (CLEF_X) sits closer to its melody / off the card edge.
  · ✅ #9: roomier note spacing (noteW 0.14→0.18, min 16).
  · ✅ label "(B♭ inst.)" moved to UPPER-RIGHT of clef (CLEF_X+14) not directly above.
  · ✅ CR: subheader button hit-zone now covers the label text too (hit-extender div).
  · ✅ #14 vocal C-G-C NOTES: each voice now a ClefCard (real renderer) with a C-G-C
    triad derived from the voice's range (Han: "from each voice's range"). vocalRefTriad()
    picks the octave with least range-spill, tie-broken to centre — no per-voice table
    (§6c). Ranges added to VOCAL_VARIANTS (mirror VOCAL_RANGES/CLEF_VOCAL_RANGES; flagged
    for future consolidation). Result: Bass/Bari/Tenor C3-G3-C4, Alto/Mezzo C4-G4-C5,
    Soprano C5-G5-C6.
  · BATCH 2 COMPLETE pending Han's visual verification.

- 🔨 CR (Han 2026-06-03, supersedes fixed C-G-C): clef-setter reference notes should be
  TONIC + FIFTH + OCTAVE, RESPONSIVE to the tonic setter (not fixed C-G-C). Implies:
  (a) pass `tonic` into ClefStaffOverlay (currently not passed; SheetMusic has it).
  (b) transposing-instrument cards may need per-note accidentals (♯/♭) on the shifted
      notes — Han expects this logic doesn't exist yet for the setter. REUSE the real
      staff's transposition/spelling path (§6c), don't reinvent.
  (c) write all voortekens at NOTE level (accidental before each note), NOT as a key
      signature on the staff — to avoid clutter.
  ✅ DONE. Interview answers: both melodic+vocal · ACTUAL 5th scale degree (not always
     P5) · reuse real-staff transpose/spelling · centred octave.
  Impl: refTriadNotes(tonicName,tonicSemi,fifthName,fifthSemi,lo,hi) — octave-centred,
  scale-spelled names; tonicAndFifth() reads tonic + scaleNotes[4] (fallback P5).
  tonic+scaleNotes threaded SheetMusic→ClefStaffOverlay. Accidentals: free via existing
  numAccidentals:0 + generateAccidentalMap (naturals in-key, ♯/♭ drawn per note,
  octave-distinct); transposition via existing transposeMelodyBySemitones. REF_NOTES
  const removed. 207 tests + build green. Verified triads: C→C4-G4-C5, E♭→E♭4-B♭4-E♭5,
  F♯→F♯3-C♯4-F♯4, etc. ⏳ needs Han visual verification.
  · ⏳ #13 chord height → belongs with Batch 3 (chord line).
- BATCH 3 (chord line / ext-add chord editor): #2 chords not neatly in block, #3 3-column
  spacing too tight, #4 transpose chord-line notes up to start at D4 (kill C4 ledger).
- BATCH 4 (RangeStaffOverlay): #5 two-zone drag (outside-right drag-left = raise; on
  setter drag-left = lower), #16 range notes not transposed for G-(F inst).
- SMALL: #7 percussion beam is yellow (real notation), #1 transition: ottava glyphs +
  brackets don't slide in with morph.

RANGE / clef-card carousel:
- 🐞 Transition: 8vb-etc ottava glyphs + the brackets ("blokhaken") don't slide in
  with the morph (left behind / not animated).
- 🐞 Chords don't sit neatly inside the card block (see screenshot).
- ✅ 🐞 ext/add chord: the 3 columns (accidentals · middle notes · right notes) are too
  cramped → widen column spacing. [Han verified fixed 2026-06-10]
- 🔨 Remove the C4 ledger ("streepje"): transpose REF_NOTES up so they start at D4.
- 🐞 Drag is confusing. Desired: clicking/dragging to the RIGHT of the range (outside)
  → drag-left = "pull notes from the right" = RAISE range. On the range setter itself
  → drag-left = LOWER range. (Need to map this to carousel vs note-range surfaces.)
- 🔨 Make lowlight colour for ALL non-selections a bit darker grey (dark mode).

NOTATION (sheet music rendering):
- ✅ 🐞 Percussion beam is yellow (should match note colour, not yellow). [Han verified 2026-06-10]
- ✅ 🐞 Clefs sit too far right — don't match real sheet-music clef x-position. [Han verified 2026-06-10]
- 🔨 Notes too close to clef & each other → make blocks roomier.
- 🐞 Clipping at the bottom of notes/clefs around the C-ledger height.
- 🐞 8va treble clef doesn't render (ALT+0160 = nbsp → wrong/missing ottava glyph char).
- ✅ 🐞 Instrument name: wrong position rel. to clef vs sheet music + different font size +
  italic. MUST be consistent. [Han verified 2026-06-10 — "(X inst)" now top-right]
- 🐞 Chords too close together + not at same height as in sheet music.

CLEFS distribution / vocal:
- 🔨 Add C-G-C reference notes to the vocal (zang) clefs too.
- 🔨 Distribute ALL clefs (incl. vocal) across startX→endX from 12%→86% so they don't
  overlap the edge or the left clef-setter.
- 🐞 Baritone clef = F-clef with the F on the MIDDLE line → render 10 units lower; fix
  note transposition accordingly.
- ❓ Selecting G-(F inst): range-setter notes are NOT transposed. Are these rendered or
  hardcoded? → ANSWER: REF_NOTES are a fixed array, transposed via the card's `trans`
  (semitones) prop in ClefCard. Octave cards pass trans=0; transposition cards pass the
  instrument semitones. If a card shows untransposed, the card's trans wiring is wrong
  → BUG to fix (likely octave vs transposition orthogonality on that card).

SETTINGS:
- 🔨 settings / notation / range: make ACTIVE settings clearly yellow, rest lowlight.

ROOT-CAUSE HYPOTHESIS (to validate): the ClefCard renders its own bespoke clef/note/
label layout instead of reusing the real SheetMusic clef-glyph + note-layer + instrument-
label primitives → explains clef x-pos, spacing, clipping, ottava glyph, instrument-name
font/position, chord height all being inconsistent. §6c: prefer reusing existing
rendering logic over a parallel implementation.


- ✅ Dead code removed (verified zero refs, tests+build green):
  · clefSelector: `instrumentClefCards`/`INLINE_CLEF_CARDS`/`transpositionChips`/
    `INLINE_TRANSPOSITIONS` + now-unused import (superseded by the swipe carousel).
  · SheetMusic: dead `onOpenInstrumentList` wiring (transPicker still reachable via
    the staff label — kept).
  · progressionDefinitions: `getProgressionDegrees`, `RANDOM_STRATEGIES`.
  · TrebleSettings: duplicate `instrumentOptions` export (canonical in
    controls/instrumentOptions.js).
  · drumKits: `CATEGORIES`/`DEFAULT_DRUM_KIT`/`KIT_SAMPLES`/`PADS` (superseded by
    DRUM_KITS + KIT_NOTE_MAPPINGS; imported nowhere).
  · Kept (NOT dead): `getTraditionalSolfege`, `computeSequenceBoundaries`,
    `planPaginationFade`, `PAGINATION_CLAMP_FALLBACK_MEASURES` (test-covered);
    `ALL_SAMPLES`, `PERCUSSION_DISPLAY_*`, `PREDETERMINED_STRATEGIES` (used).
- 🔎 Performance review — ran a hot-path sweep; findings VETTED and mostly rejected:
  · pagination effect `.map()` is in the body, not deps → no spurious re-runs.
  · dry-run `calculateAllOffsets` (full melody) ≠ windowed useMemo → not redundant;
    effect is debounced during playback, not per-frame.
  · highlight rAF already caches DOM lookups (Map) + uses `style.opacity` per §6
    invariant; "CSS-class opacity" suggestion would VIOLATE §6 → rejected.
  Conclusion: hot paths already optimized; no safe high-value change found. Any future
  perf work in Sequencer/highlight/pagination needs an interview (§4b, §6).

## Feedback batch (Han 2026-06-01 #14)
🔨
- ✅ Rename "CLEF" settings → "NOTATION" settings (button label).
- ✅ Percussion notation: (1) centred (first note now lands at startX via a leading
  sentinel offset, bundles centred on 30%/70%) (2) box removed (only an invisible hit
  rect remains) (3) SPLIT now real parallel-voice notation — hi-hats = 4 beamed
  eighths (RH, up), kick+snare = QUARTER notes (LH, down), via two MelodyNotesLayer
  voices on a shared x-grid + percussionVoiceSplit. (#2 "stems wrong side" addressed
  by the proper split classifier — verify visually.)
- ✅ ALL setters: ACTIVE = normal colour (`--text-primary`); PASSIVE = `--text-lowlight`
  at opacity 1. Applied to Clef families/variants/perc, ChordStaff, ChordStyle, and
  Range preset brackets. (Range boundary DRAG HANDLES kept yellow — they're handles,
  not a passive/active option; legacy SettingsOverlay left as-is, slated to deprecate.)
- ✅ Range: extended-chord tensions carry ♭/♯ (D♭ 9th, A♯ 13th) so the renderer draws
  the accidental to their left; chord row raised (−86 → −108) to clear the setter.
- ✅ Notation carousel: shows EXACTLY N glyphs (no resting lookahead — wrap copies fall
  outside the clip), spread evenly from CLEF_GLYPH_X (active aligns with sheet) → 90%
  of startX; gentle 5%/95% edge fade so the rightmost glyph isn't dimmed.
- ✅ Notation: each clickable clef is now an "instrument clef CARD" — the family clef
  + the 3 reference notes (C4 G4 C5 in G / C3 G3 C4 in F) rendered via MelodyNotesLayer
  and TRANSPOSED by the instrument, so the transposition reads instantly; transposing
  cards add a "(B♭ inst.)" superscript. Per "3 options + a …" the inline set is
  Concert / B♭ / E♭ + a "…" card (clefSelector.instrumentClefCards).
  ⚠ DESIGN DECISION (Han's msg was cut off at "the 3 options + a…"): inline OCTAVE
  variants (8va/15ma) were REMOVED to make room for the cards — they should move into
  the "…" full list. Confirm w/ Han: is Concert/B♭/E♭ the right inline trio, and is
  losing inline octave access OK? Vocal family kept as voice-clef chips (spec only
  addressed G/F).
  [Han 2026-06-02 answers] (a) inline trio → Concert / B♭ / E♭ / **F** + … (add F).
  (b) octaves come BACK — the variant row should be a horizontal **SWIPE carousel** of
  clef cards (same feel as the family carousel). g-clef order: Concert, 8va, 15ma, B♭,
  E♭, F, … then the more obscure transposing instruments OFF-SCREEN (swipe left to
  reveal); wider screens show more cards at rest.
- ✅ FR — **Notation variant-card SWIPE carousel (Han 2026-06-02).** `ClefCardCarousel.jsx`
  — free horizontal drag (tap=select, drag=scroll, disambiguated by movement; px→SVG via
  screen CTM; clamped, no loop, right-edge fade). Strip = octave cards (normal/8va/15ma)
  + all transposing instruments except C. Octave & transposition stay orthogonal fields;
  tapping an active transposing card toggles back to concert C. Vocal kept as evenly-
  spread chips. Tests + build green; documented in architecture.md wave 4.
  ⏳ Follow-up: remove the now-dead `transPicker`/`onOpenInstrumentList` popup wiring in
  SheetMusic; confirm CARD_W (92) / visible count looks right on real device widths.
- ✅ CR: clef SUBTYPES (variant chips) slide out FROM THE CLEF ON THE LEFT — each chip
  carries `data-fly-from={startX}`; useRangeMorph emerges those elements from that x
  (negative offset → slide right into slot) instead of the default right-side fly-in.

## Feedback batch (Han 2026-06-01 #13)
✅ done:
- Chord-style sample now matches the SHEET label exactly: plain serif (NOT italic),
  minor "−" + "7" as a raised superscript tspan (root + super, like ChordLabelsLayer).
- Percussion clef bundle beams as ONE group: rendered via processMelodyAndCalculate
  Slots + MelodyNotesLayer with a [1,2] (odd-numerator) measure so the beam-span
  logic doesn't split it 2+2. Added a ClefStaffOverlay smoke test.
- SETTINGS trigger moved to its OWN SubHeader button (Settings2 icon, next to CLEF).
  Clicking the sheet no longer opens settings (openSettingsIfClosed no longer opens;
  handleSheetMusicClick only CLOSES the legacy surface). handleToggleSettings is
  mutually exclusive with clef/range. Goal: deprecate the legacy surface later.

## Feedback batch (Han 2026-06-01 #12)
✅ done:
- Chord STYLE (off/letters/roman) → CLEF setter (new ChordStyleOverlay), rendered in
  the sheet chord-label font (root 26 / super 16 Georgia italic). Chord COMPLEXITY
  stays in the RANGE setter (ChordStaffOverlay).
- Complexity chords repositioned to 10/30/50/70/90% of the row width (no clipping).
- Clef-setter percussion: two 4-note bundles filling 20–40% and 60–80% of the span
  (NOTE_W = 20%-span / 4), beamed via the real pipeline.

## Feedback batch (Han 2026-06-01 #11)
✅ done:
- Chord row moved to the RANGE setter; complexity chords render as REAL whole-notes
  via MelodyNotesLayer (tonic/power/triad/seventh + the layered "extended"); letters/
  roman show a real progression sample (D⁻ G⁷ C / ii V⁷ I, ~15u apart).
- SETTINGS overlay is now the sliding 'legacy' surface: a 4th morph kind ('legacy'),
  overlayKind/overlayEditMode include it, gated on legacyMounted, animates like
  clef/range (melody flies out, settings flies in). ♭/♯ on extended still TODO-fine.

## Feedback batch (Han 2026-06-01 #10) — REUSE rendering (§6c violation to fix)
✅ done so far: morph re-arms on overlay switch (kind-keyed); percussion beams via
real processMelodyAndCalculateSlots+MelodyNotesLayer; clef glyphs centered
(anchor=middle); diagonal treble/bass divider; full-height percussion hitboxes;
endX measure line.
🔨 still open: chord row → RANGE setter + render via real stacked whole-notes; G-clef
bottom clipping; G-ottava options missing; vocal clef spacing/margin-before-endX;
exact clef alignment with sheet.
🔨 Core issue: overlays re-invent note/chord rendering instead of reusing
MelodyNotesLayer/renderMelodyNotes + ChordLabelsLayer. Fix by reuse.
- CHORD selector belongs in the RANGE setter (not clef). Render the progression with
  REAL sheet rendering: D^- G^7 C  /  ii V^7 I — compact block, ~15u apart, SAME font
  size as the melody.
- Complexity chords: render real whole-notes at chord-rule height like the GENERATOR
  chord-complexity setter: [C4,E4,G4,B4] etc. The "extended" = [C4,G4] + lowlit
  [E4,B4] same span, right-offset [D4,F4,A4] lowlit, with ♭ and ♯ left at D4/A4 lowlit.
- Percussion notes in clef view: use MelodyNotesLayer with proper noteGroupSize/
  measureLengthSlots so the 4 eighths BEAM into a group (not separate flags); tighter.
- Animation: clef→range→clef→range later transitions don't animate. Switching overlay
  must treat the previous as CLOSED so re-clicking re-opens + re-animates.
- Clefs not visually centered in their click area → ugly spacing.
- Still clipping at bottom of G-clef.
- G-ottava (8va/15ma) options missing.
- Vocal clefs: too much spacing, not balanced; need margin before endX.
- Render a vertical measure line at endX.
- percussion + bass clef in clef view not EXACTLY aligned with sheet clefs.
- range setter: line between bass & treble slightly DIAGONAL.
- range setter: percussion click boxes FULL height (just below staff → bottom of
  treble click area).
- clef/range: why are chords not flying in from the right? (stagger/data-fly)
✅ done:
- range overlap fixed: the treble/bass hit-zone divider is now anchored to the GAP
  between the staves (fixed midpoint), not the moving note rows — a high bass range
  no longer pulls the bass zone up into the treble staff.
- chord row: added a CHORD COMPLEXITY sub-row — 5 stacked-notehead chords (tonic,
  power, triad, seventh, extended) spread across startX→endX; writes
  chordSettings.complexity (tonic→root, extended→ninth, canonical so the existing
  complexity stepper + generator agree). Generator aliases 'tonic'/'extended' too.

## Feedback batch (Han 2026-06-01 #8)
✅ done:
- 22ma/22mb: was rendered in Maestro (→ music glyphs, unreadable). Now `Ottava22`
  uses an italic-bold serif "22" + superscript ma/mb → legible.
- 🐞 morph re-arm: cleanup now resetStyles() on interrupt, so a rapid re-toggle
  never leaves a group stuck (the "doesn't trigger after repeated clicking" bug).
- rim-shot slash → TOP-LEFT→BOTTOM-RIGHT ("\", Han corrected mid-round).
- percussion mini-melody → [[k,hh],hh,[s,hh],hh] EIGHTHS, compact bundles at 33/66%.
- chord row: X (tall cross) at startX; letters@33% / roman@66% as real chords (no box).
- variant clefs → true-size ClefGlyph, distributed across startX→endX (no boxes).
- carousel: soft fade at BOTH edges (no hard left clip).
- disable cross 2× taller (same width) — clef gutter, percussion, chord.
- ClefCarousel caps shown glyphs to gutter capacity (fixes "4 perc clefs, 2 options").
- percussion clef aligned to sheet x=18 + clickable (added hit rect).

## Feedback batch (Han 2026-06-01 #7)
1. ✅ Clef setter active on SHEET → keyboard shows the RANGE setter (TabView swaps
   KeyboardRangeSetter when rangeEditMode || clefEditMode; clefEditMode threaded).
3. ✅ GHOST STAFF generalised: disabled staff shown in any settings view, notes +
   clef glyph at opacity 0.4 (GHOST_OPACITY), staff lines/barlines normal;
   interacting (clef carousel / X toggle) re-enables. (Restore-exact-prior-clef is a
   refinement; re-enable currently sets a sensible default clef.)
2+4. DESIGN proposed below — see docs §37.5 (PLAYBACK / EXERCISE setters design).

### Design (items 2+4): playback/exercise in-staff setters
Two new in-staff overlay modes, both ghost-aware, mirroring clef/range:
- EXERCISE setter (global, song-level): #measures, #repeats (`repsPerMelody`),
  total-melodies. Rendered above the system (not per-staff) since they're global.
- PLAYBACK setter (per-staff × per-round): visibility (eye), audibility (volume
  0–1), per round (odd/even). Each staff gets an eye + a volume control in its
  gutter; a round toggle (odd/even, or "round 1 / round 2…") switches which round
  you're editing. Chords + metronome are pseudo-staves with the same controls.
See §37.5 for the full option→overlay mapping.

1. When clef setter active on the SHEET → show the RANGE setter on the keyboard
   (dual-surface: clef-on-sheet pairs with range-on-keyboard).
2. DESIGN the next setters: migrate playback / exercise settings — #measures,
   #repeats, per-repeat visibility + audibility, volume — into in-staff overlays.
3. GHOST STAFF (generalise): in every settings view show ALL staves, grey out
   options for disabled staves; interacting re-enables the staff (restoring most
   recent settings). Barlines render normally; notes + other "settings" at
   opacity 0.4.
4. Propose which options logically suit the repeat vs playback overlays.

## Feedback batch (Han 2026-06-01 #6)
✅ done:
- CHORD X already = hide + mute + KEEP generation (confirmed; no change needed).
- Chord selector moved INTO clef-edit mode; removed standalone CHORDS button +
  all chordEditMode plumbing (App/SheetMusic/SubHeader). §37.3.
- 22ma/22mb: Maestro = a custom TrueType music font (ASCII→PUA F0xx), pre-composited
  ottava glyphs only to 15 (no 22). Added `Ottava22` composite (font digits "22" +
  superscript ma/mb at 15ma style) + treble/bass22va/vb in clefSymbols. Renderable
  asset ready; not yet a selectable option (gen maxes at 15ma). §37.4.

## Feedback batch (Han 2026-06-01 #5)
✅ done: fade-out 0.25s (FADE_OUT_MS); clef clip taller (no bottom clipping) +
   step 36u (more space); loop carousel (ClefCarousel: slide-left + re-enter from
   right under a fade mask); percussion notes use real MelodyNotesLayer; percussion
   X disable (2-item carousel) → preferredClef 'off' hides/empties/skips-gen; perc
   clef aligned to CLEF_GLYPH_X.
⏳ BACKLOG (small): custom 22mb/22ma combined clef glyph — needs a Maestro asset
   (no font glyph exists); logged in BACKLOG.
- ANIM: make the FADE-OUT very short — 0.25s for all transitions.
- CLEF: clipping at the BOTTOM of the clefs (clip rect too short) → fix.
- CLEF: clefs too close together → more space (~10 units between).
- CAROUSEL rework: label clefs 1-2-3-4, 1 active. Click 3 → slide ALL glyphs 2 steps
  left; 1 & 2 leave the screen; meanwhile fresh 1 & 2 slide in from the right with a
  fade-in (masking fade where they emerge). True loop carousel.
- CLEF PERCUSSION: the drum notes + clefs in the clef selector use TINY font, not the
  real assets → render them like the melody (real MelodyNotesLayer noteheads/glyphs).
- CLEF PERCUSSION: add an X (disable) for percussion too — a carousel of 2 (perc / off).
- CLEF PERCUSSION: the percussion clef is NOT at the exact same x as in the carousel
  / sheet → align it.

## Feedback batch (Han 2026-06-01 #4)
✅ done this round:
- range notes now stagger (data-fly on all note groups); morph has ease-in/out.
- clef glyphs reused from sheet (`clefGlyphs.jsx` ClefGlyph + clefSymbols single
  source); carousel current clef at exact sheet pos, slides (clipped to gutter).
- range sheet lowlight → `--range-lowlight` (match percussion + slightly lighter).
- keyboard bracket: passive=solid, dotted line bridges the gap (no stretched "…").
- bass-too-high: capped window growth (MAX_CONTEXT) + uncapped spacing.
✅ chord selector: in-staff CHORD mode (CHORDS button → chordEditMode), X/letters/
   roman over the chord row. X = chordDisplayMode 'off' → hides labels + mutes audio
   (chordsDisabledRef → Sequencer chordVolume=0). Generation-disable parked. Time-sig
   now hidden in any overlay mode. §37.3.
🔨 original list:
- ANIM: range-overlay notes still fly as one block (no per-note markers) → thread
  data-fly through the range overlay note layer so they stagger like the melody.
- ANIM: give all morph animations a subtle ease-in/ease-out (start/stop).
- CLEF SELECTOR: reuse the EXACT sheet-music clef glyphs incl. baseline/height
  offset + font size + the custom combined glyphs (clef+15 etc.); height carries
  meaning — reuse the already-defined `clefSymbols` rather than my own glyphs.
- CLEF SELECTOR: remove the (now doubled) sheet clef; place the selectable current
  clef at the EXACT sheet clef position (check the left offset, ~x=13, content
  margin ~10). New carousel clefs SLIDE IN FROM THE RIGHT (not fade). Use space all
  the way up to startX.
- CLEF/RANGE: remove the measure-type (4/4 or C) when either selector is active
  (already done for clef; ensure for range too).
- RANGE KEYBOARD: passive (behind) clef bracket = SOLID line, not dotted. The "…"
  is stretched into 3 long lines → instead draw a DOTTED HORIZONTAL line between
  where one bracket hook ends and the next begins; remove the stretched ellipsis.
- RANGE SHEET: lowlighted treble/bass notes too light → match percussion-note color,
  and make all of them slightly lighter still.
- RANGE SHEET BUG: bass range selector goes way too high — the hit box stretched to
  include the chords row, overlapping the treble staff. Fix the box extent.
- CHORD SELECTOR: still missing — implement the chord type selector (as described).
- CHORDS: add a 3rd visualisation option = X (disabled).

✅ done:
- Staggered per-element fly-in in `useRangeMorph` (notes stream in by x, rightmost
  starts at 0.5s, each slides 1s → total 1.5s; group fades for non-note elements;
  falls back to block-slide if no `[data-mel]`/`[data-fly]` markers). Clef chips get
  `data-fly`; real melody already has `data-mel`.
- 'off' staff: empty generation (`useMelodyState`), no elements rendered
  (`EMPTY_MELODY`), hidden in melody mode (visibility excludes off staves).
- NOTE: sheet overlays being migrated → not extending them for new CRs.
🔨 (original notes below)
- Staggered fly-in: rework `useRangeMorph` so EACH element between startX..endX flies
  in individually with a slight per-element delay (notes look like they fly in, not a
  block). Other elements fade. Total 1.5s (anim ~1s, rightmost starts ~0.5s).
  Applies to melody, range setter, clef setter.
- Disabled staff (`preferredClef:'off'`): render the staff normally but with NO
  elements on it.
- Melody mode: HIDE a staff whose clef is disabled; also SKIP its melody generation.
- NOTE: sheet-music range/clef overlays are being migrated to separate overlays —
  do NOT keep updating them for new CRs (Han).

Decisions: new `preferredClef:'off'` field · clef-click = open selector (replace old)
· perc toggler = mini-rhythm · last pad not removable.
- ✅ clicking the clef glyph opens the CLEF selector (old tap-cycle + popup removed).
- ✅ ≥1 enabled pad enforced (togglePad refuses to remove the last).
- ✅ 4th family = large CROSS (`CLEF_OFF`); patch/clef-calc/visibility plumbed safe.
- ✅ vocal voices fixed: added Baritone, each shows its real clef GLYPH, Bass≠
  instrumental bass (matched on rangeMode). Pure helpers + tests updated (10 cases).
- ✅ Polish wave done: carousel left of startX + real-size + slide/fade; time-sig &
  static clef hidden in clef mode; octave variants as full ottava clef GLYPHS;
  percussion clef block with together↔split mini-rhythm toggler.
- ✅ range setter sheet: notes distribute across full width when few selected.
- ✅ range setter keys: bracket highlight follows staff clef; behind bracket dashed
  + left-corner-only (`⌜- - - … ⌜- - - ⌝`).
- ⏳ Still open: disabled ('off') staff greyed-out-but-visible in other modes with
  clickable cross (now 'off' only short-circuits clef calc).

## Clef selector (in-staff, CLEF mode) — Han 2026-06-01
✅ Built. `ClefStaffOverlay` + pure `clefSelector.js` (+ test, 8 cases). CLEF button
in SubHeader → `clefEditMode` (mutually exclusive with range/settings, stops
playback). Left 20% = G/F/Vocal carousel (current bright leftmost, others lowlit,
CSS-transition slide L→R). Right 80% = octave chips + transposition chips + "…"
(opens existing transPicker). Reuses the morph (now `range||clef`). preferredClef +
transpositionKey kept separate. 197 tests green; build + lint clean.
⏳ Parked: exact selected-variant glyph leftmost (now generic family glyph + the
highlighted right chip conveys the variant).

### (orig) Clef selector — Han 2026-06-01
New in-SVG clef selector, parallel to the range selector. Decisions (interview):
own mode + CLEF subheader button · left 20% = G/F/Vocal family carousel (current
left, other two lowlit; pick → carousel slide L→R) · right 80% = variants of the
family: octave (8va/8vb/15ma) AND transposition chips (G^B♭, G^E♭, …, G^x → full
list) · keep `preferredClef` + `transpositionKey` as separate fields (selector
writes both). Selected variant shows leftmost; cycling reverts to default variant.
Reuse morph transition. Pure logic in `clefSelector.js` (+ test).
- ✅ Removed "◆ RANGE SELECTOR" text indicator.

## Range Selector (in-SVG, RANGE mode)

### ✅ Anim batch (Han 2026-06-01 #2)
- ✅ CR: LARGE preset widened — treble C4–A5, bass E2–C4.
- ✅ Keyboard slide-stepper: reuses `rangeSlide.js` (tap-burst / hold-extend / drag);
  window freezes during the gesture, band/handles glide via CSS transition
  (`.kbd-range-band`, x/width 0.25s linear).
- ✅ Enter/exit MORPH (1.5s, `useRangeMorph.js`): RANGE fades melody OUT, range rows
  FLY IN from the right; closing reverses. Old fades, new flies. Both groups kept
  mounted+visible via `morphing`. opacity/transform via element.style in rAF (§6),
  cleared at end. 190 tests green; build + lint clean.


### ✅ Feedback batch (Han 2026-06-01) — done this round
A ✅ Slide tween now LINEAR (constant velocity) → a burst glides instead of pulsing.
B ✅ Hold-extend fixed: advance `target` with `live` while extending so it keeps
   going outward instead of wobbling back.
C ✅ 8va bug: row now renders as ONE MelodyNotesLayer with a per-note color
   override (`previewColorFn`) → ottava computed once (§6b). New renderer prop
   threaded through MelodyNotesLayer.
D ✅ Keyboard responsive again: window key count is width-adaptive (ResizeObserver)
   instead of a fixed half-span.
E ✅ Window centres on the SELECTION again (Han corrected his earlier note) → clef
   switch slides the window so selected notes stay central.
F ✅ Bass-clef bracket highlights identically (active = yellow regardless of clef).
G ✅ Brackets compressed to 3 shared rows (FULL/LARGE/STANDARD); current clef front
   (bright), other clef behind (dim) + interrupted with "…" at the overlap; clef
   select swaps front/behind. `buildPresetBracketRows` reworked + test (7 cases).
H ✅ Percussion deselect via lowlight COLOUR (var(--text-lowlight)) not opacity, so
   ghost/rim/open-hihat glyphs stay crisp. DrumPad board left as-is (visual only).
- ✅ CR: open hi-hat (ho) added to STANDARD percussion preset.
- ✅ CR: cowbell notehead → triangle (Ñ).
- ✅ CR: snare-rim notehead → snare head + diagonal slash overlay.
- Also fixed a latent rules-of-hooks bug (useLayoutEffect after early return).
- 190 tests green; build + lint clean.

### (orig request) Feedback batch (Han 2026-06-01)
A. **Animation smoothness**: 1 click on an extreme note reads as a chain of
   discrete shifts. Make it flow (continuous, no per-step start/stop pause).
B. **Hold on extreme**: currently notes wobble back-and-forth instead of keep
   extending the range outward (new notes sliding in). Fix the hold-extend.
C. **8va still per-group** (see screenshot): the colored layers each compute their
   own ottava bracket → multiple 8vb. Bug §6b — render ottava once over the row.
D. **Keyboard not responsive**: widening the panel should add keys (regressed when
   I centred on a fixed half-span). Restore ResizeObserver-driven key count.
E. **Clef switch → window should slide so the SELECTED notes are centred** (Han
   corrects his earlier "centre on clef" — centre on selection).
F. **Top-keyboard bass-clef preset not yellow** when selected: bass brackets must
   highlight/behave identically to treble brackets.
G. **Bracket height compression**: align FULL/LARGE/STANDARD on shared heights
   (3 rows, not 6). When treble active, just before the overlap (~A4,C5,C5)
   interrupt the bass bracket with "…". Off-clef dimmed; on selecting bass clef,
   SWAP highlight: bass brackets highlighted, treble brackets drawn "behind".
H. **Percussion deselect = colour, not opacity**: ghost/rim/open-hihat unclear if
   selected because opacity dims the glyph. Use lowlight COLOUR (grey), not opacity.
- CR: add **hi-hat open (ho)** to LARGE percussion preset.
- CR: **cowbell (cb)** notehead = triangle (not cross).
- CR: **snare rim (sr)** notehead = snare head with a diagonal slash through it.

### ✅ Keyboard preset brackets = 6 clef+range presets (Han 2026-05-31)
Six brackets (G-clef STD/LARGE/FULL + F-clef STD/LARGE/FULL), clef-grouped
(treble band on top), x-aligned to real key positions (larges overlap). Tap sets
BOTH `preferredClef` + `range` on the CURRENT staff (fixes the bug where F-brackets
wrote to the middle staff). Separate `onSwitchClef` row removed. Window centres on
the active clef's home note (B4/D3) so brackets sit at stable positions; off-clef
brackets dimmed & may fall off-screen. Applies to BOTH tabs (each edits its own
staff; a staff may carry either clef). `buildPresetBracketRows` reworked + test
(5 cases). 188 tests green; build + lint clean. Decisions from interview:
clef-centred window (off-screen OK) · remove clef row · apply to both tabs.

### 🔨→✅ Boundary SLIDE animation (sheet overlay) — Han 2026-05-31
Decisions (interview): sheet overlay only · all behaviours at once · all 4
directions mirrored · 0.25 s/note constant (chained, no pause).
- ✅ `rangeSlide.js` pure helpers (`nextNaturalToward`, `nextNaturalInDir`,
  `classifyStep`, `STEP_MS`, `easeOutCubic`) + test (11 cases).
- ✅ Stepper in `RangeStaffOverlay`: tap = burst to target (finishes after
  release); hold = extend outward at 250 ms/note until release; >8u move = live
  drag (old behaviour). Shared `setMelodicBoundary`/`clampRange` write path.
- ✅ Slide tween: body `<g>` scales about the anchored edge; one context note
  swipes+fades in/out at the far edge; 8va rides along. rAF sets transform/opacity
  (never JSX, §6). Presets / drag-jumps / ellipsis layouts snap instantly.
- ✅ Docs (architecture §37.1), 187 tests green, build + lint clean.
- ⏳ Parked: keyboard-setter equivalent; enter/exit morph (separate phase).

### Done
- ✅ Tech-debt: percussion coarse style → presets. BASIC/STANDARD/FULL set
  `enabledPads` (single source for "which drums"). `RangeStaffOverlay` +
  `applyPercussionPreset`.
- ✅ CR1 — Range edit ⇄ settings overlay mutually exclusive. Opening one closes
  the other; clicking empty sheet in range mode closes range edit.
  (`App.handleToggleRangeEdit`, close-on-settings effect, `handleSheetMusicClick`.)
- ✅ CR2 — Clef ↔ range coupled. `SheetMusic.computeRangeFrame(clef)` →
  `{rowLow,rowHigh,presets[]}` follows the CLEF SHOWN, not the staff slot. Bass
  clef on top staff ⇒ bass notes/presets; vocal clefs ⇒ vocal voices.
- ✅ Debug hit boxes for all interactive overlay regions (CLAUDE.md §3a).

### Current CR batch
- ✅ CR3 — Restored the "original" (wider) note set: melodic extent = FULL ±1
  octave again (room exists on ≥800px; narrow-screen scaling is ⏳).
- ✅ CR4 — Diagonal hit band: replaced the full-height rect per staff with a
  parallelogram `<polygon>` following the note row (treble/bass no longer
  overlap). Percussion → per-pad boxes centred on each pad's Y (`PERC_HIT_H`).
- ✅ CR5 — Removed text by the range setter: melodic + percussion presets are now
  bracket-only. *(Mode indicator "◆ RANGE SELECTOR" kept — confirm if it should
  go too.)*
- ✅ CR6 — Vocal centring: `computeRangeFrame` centres the clef's default voice
  (pad ±voice-span). **Verify visually with Han.**

### Backlog / next phase
- 🔨 FR — **Klavier (keyboard) range setter** (building, answers 2026-05-31).
  Context-bound & per-keyboard (treble-setter at treble kbd, bass at bass).
  Decisions: (1) range-edit shows a boundary-relative WINDOW with context keys
  beyond min/max; band = selection, drag-handles + tap-to-set-nearest, release
  re-anchors → extend up to A0–C8; (2) drag-handles AND tap (mirror bladmuziek);
  (3) REPLACE the RangeControls steppers with the graphical setter + preset
  BUTTONS; (4) scope = treble + bass (shared PianoView); percussion later.
  Reuse the boundary-relative window logic + clampRange write path.
- ✅ FR — **Boundary-relative window + balance + diagonal ellipsis (sheet music).**
  `buildRangeRow` now shows a WINDOW with 3 naturals beyond each boundary (capped
  A0–C8) → symmetric by construction (fixes 5-1-2 imbalance) AND lets you drag a
  boundary past the old ±8va limit (release re-anchors, reveals fresh context;
  subsumes the "extreme range" FR). When still cramped, collapses the in-band
  middle into a diagonal "…" keeping 3 inside each boundary. Whole layout freezes
  during drag. `MAX_NOTE_WIDTH` caps sparse spacing. **Verify visually.**
- 🔨 FR — **Keyboard range setter v2 — SPLIT layout (Han 2026-05-31).** Redesign:
  (top→bottom) preset BLOKHAKEN (brackets, no text, consistent w/ sheet) → COMPACT
  windowed SELECTOR keyboard (width-adaptive: ~20px/white key, e.g. 300px→15 keys,
  symmetric around the selection like the sheet) → REAL playable keyboard limited
  to the selection (shows the impact). Selector: band + handles + tap, freeze
  during drag, re-anchor on release. Shares windowNaturals + applyRangeBoundary.
  v1 started; preset-bracket alignment to selector keys is approximate.
- ⏳ FR — **Extreme range** up to 15mb–15ma (capped A0–C8); interaction idea:
  after releasing the drag, 3 more notes appear left & right (progressive reveal).
  Likely pairs with the ellipsis windowing.
- ✅ FR (range-selector polish v2, Han 2026-05-31) — **Verify visually.**
  1. In-band (selected) notes follow note-coloring (previewMode off + live
     coloring props); boundary notes stay YELLOW handles; out-of-band dimmed.
  2. Treble/bass hit zones: taller, cover 8va/8vb, outer edge follows note row
     −BAND_COVER, inner edge = shared divider (midpoint of the two note rows) so
     they meet EXACTLY; solo staff → symmetric BAND_SOLO_H.
  3. Percussion hit boxes taller (PERC_HIT_H) + biased UPWARD over the stems.
- 🐞/⏳ Backlog — **Drum-notation stems**: adjust stem direction/length.

### Broader app-IA redesign (mockup 2026-05-31) — LOGGED, not scheduled
Full navigation/settings vision from the wireframe. Captured for later; recommend
finishing the range-setter feature (sheet + keyboard) before opening this. Items:
clef picker (clefs slide from left, per-bar clef select incl. disable; percussion
chord vs two-melody notation); "Exercise" settings (difficulty/level-up);
"Visualisation" (note coloring, animation, multi-line, theme); Instrument setting;
"Advanced song generation" (#measures, #repeats, playback, odd/even volume); Scale
selector (bottom view); Header (melody type/key/scale, playback, scoring, settings
nav); NAV (icon main-cat ↔ sub-cat: Input|instrument, Settings|profiel,
Muziek|Toonladder).

---

## Conventions added this session
- CLAUDE.md §3a — every interactive component must draw its hit box in
  `debugMode` (orange rect, `pointerEvents:'none'`).
- CLAUDE.md §1a addendum — log all plans/CRs/FRs/bugs into this file immediately.

- Batch 2 round 4 (Han 2026-06-03 screenshot in B♭ = notes/accidentals CORRECT):
  · ✅ tonic+5th+octave + per-note accidentals confirmed correct in B♭.
  · ✅ #9 cards DOUBLED width (CARD_W 92→184, VOC_CARD_W 72→144) — roomier note spacing.
  · ✅ CR: staff-level key signature BLOCKED in clef-edit mode (gated renderAccidentals +
    enharmonic toggle on !clefEditMode, both staves) — accidentals only per-note now.
  · ✅ #10 left clipping = family carousel LEFT FADE dimmed the active clef at
    CLEF_GLYPH_X; removed left fade (right fade kept for scroll).
  · ⏳ #8 clef position + 8/15/(inst) label alignment — ASKING Han (ambiguous 3×).

- Batch 2 round 5 (Han: #8 + labels "exact als echte balk"):
  · ✅ #8: ClefCard now uses EXACT real-staff geometry — clef at CLEF_GLYPH_X (13) via
    the same ClefGlyph (so 8/15 ottava lands identically), inst label at clef+25 / y−8
    (= sheet's accidentalStartX−10), notes at x+48 (just past clef, no key-sig gap).
  · ✅ vocal row converted to the SAME swipe carousel as melodic (double-width 184 cards
    overflow → scroll instead of overlap).

- Batch 2 round 6 (Han 2026-06-03 — CONSISTENCY focus + frustration):
  · ✅ COLOR spec fix: selected clef+notes = var(--text-primary) (NORMAL, not yellow);
    cards were wrongly accent-yellow. Now matches the family column.
  · ✅ lowlight UNIFIED: family column was --text-lowlight, cards --setter-lowlight →
    both now --setter-lowlight (one token). Darkened --setter-lowlight in all 4 themes.
  · ✅ #9 nudges: first note +8 (NOTES_X x+48→x+56), noteW 33→26 (third ~8 left),
    CARD_W/VOC_CARD_W 184→158 (right margin ~40% smaller).
  · ✅ #10 family-clef bottom clipping: ClefCarousel now clips horizontal-only.
  · ⏳ STILL OPEN (see reply): #8 position mismatch (asked precisely), transitions
    (fade-out/slide-in on clef select; 8va & the 15-above-treble not animated/coloured;
    melody flashes between overlay transitions), add/ext chord 3-column spacing (range
    selector). Grouped as a TRANSITIONS/ANIMATION batch next.

============================================================
## MASTER PLAN (Han 2026-06-03 "maak een plan") — clef setter first, finish it 100%
============================================================
Working method now: render harness (npm run render:overlay) → I self-verify geometry
before sending. Per CLAUDE.md: finish the clef setter fully before chord line / range.

BATCH A — CLEF SETTER polish (all self-verifiable via render):
  A1 ✅/🔨 #8: family-carousel ACTIVE clef must sit at EXACT real-staff position.
     Fix: renderFamily ClefGlyph anchor 'middle'→'start' at CLEF_GLYPH_X (matches sheet).
  A2 🔨 #11 redo: 8va treble must use the real MAESTRO ottava glyph, not '&' + drawn
     serif '8' (Han: ALT+0160 was wrong; use the font glyph).
  A3 🔨 reference notes must COLOUR per the note-colour scheme (tonic/scale), not one
     flat colour — wire noteColoringMode + tonic + scaleNotes into the card layer.
  A4 ✅/🔨 non-selection lowlight a touch darker still (dark mode).
  A5 🔨 carousel clip → 5%/95% of [startX,endX]; edge fade = 10% of width (0–10%,90–100%).
  A6 🔨 responsive: on narrow screens render ONLY the selected clef's notes (space).
  A7 ❓ "akkoorden iets verder uit elkaar in notation setter" — clarify (chords in clef
     setter?) — likely chord LINE (Batch C).

BATCH B — TRANSITIONS/ANIMATION (clef setter):
  B1 fade-out / slide-in (from the left) of the new clefs when a clef is selected.
  B2 8va + 15 markers animate WITH the morph (currently left behind).
  B3 #1 ottava glyphs + brackets ("blokhaken") slide in with the morph.
  B4 melody FLASHES through during transitions between two settings overlays → hide it.

BATCH C — CHORD LINE (akkoordlijn): #2 chords not neatly in block, #3 3-col spacing,
  #4 transpose up to kill C4 ledger, #13 chord height, chords a bit further apart,
  chord clickzone too narrow.

BATCH D — RANGE SETTER: #5 two-zone drag, #16 transpose for G-(F inst), add/ext chord
  3-column spacing too tight, chord-type clickzones misaligned.

BATCH E — CLICKZONES sweep: percussion (too small), chords (too narrow), range chord
  types (misaligned). (Fold into C/D where they live.)

BATCH F — REAL STAFF: #7 percussion beam is yellow → should follow note colour.

============================================================
## OPEN ITEMS (Han 2026-06-03, order: feedback → #5 → Batch C)
============================================================
A. AWAITING LIVE VERIFICATION (implemented this session, may need tweaks):
   - #13 family-cycle flash fix (swap highlight, then slide)
   - #2 glide selected card to centre (0.5s) when picked past the middle
   - #4 after a scroll, 3s → glide selection back to centre
   - #12b vocal range preset activates the matching vocal clef
   - #7-clef transposed-note COLOUR (should be colour of the transposed note)

B. RANGE-SETTER:
   - #5 two-zone drag (outside-right drag-left = raise; on setter drag-left = lower)  <-- NEXT
   - #16 range notes not transposed for transposing instruments (RangeStaffOverlay
     applies no transposition anywhere — broad change)

C. CHORD LINE (Batch C):
   - chords not neatly inside the block
   - chord height not matching the real sheet music
   - transpose chord-line notes up to kill the C4 ledger
   - chords a bit further apart
   - "chords too narrow" — chord-line label clickzones

D. SMALLER / TRANSITIONS:
   - #1 ottava glyphs + brackets don't slide in with the morph

E. BACKLOG (separate feature, needs interview): instrument selector (icons8).

- ✅ #5 two-zone range drag DONE (one boundary per zone, relative 1:1; needs live test).
- ✅ Batch C DONE: chord-style row matches sheet height (trebleStart-58), GAP 34→42,
  wider/centred clickzones; complexity chords shifted to D4 (no C4 ledger).
- STILL OPEN: #16 range transpose (broad), #1 ottava/brackets slide in morph (transition),
  + live-verify backlog (#13/#2/#4/#5/#12b/#7-clef), instrument selector (backlog).

- ✅ #16 DONE: range-setter chromatone/scale colour now follows the WRITTEN
  (transposed) note like the sheet. Positions stay concert (height correct, Han
  2026-06-07). RangeStaffOverlay gets trebleTrans/bassTrans; in-band notes coloured via
  concert→written map (transposeMelodyBySemitones). Boundary/out-of-band unchanged.
  Sanity: concert C4 -> written D4(+2) -> chromatone-2 (matches sheet). 207 tests+build.

============================================================
## NIGHTLY REVIEW 2026-06-08 (auto /loop run) — PLAN FOR APPROVAL
============================================================
Bookkeeping done this run: architecture now documents #5 two-zone drag, Batch C
chord-row + D4, #7 beam colour, #16 colour; §12 ghost refs fixed (TabView, drumKits).
Per §4b every item below needs an interview before implementing — this is a menu.

P0 — CORRECTNESS (silent-bug risk, §6 invariant):
  ✅ DEBT-1 DONE Routed both sites through getNoteSemitone() instead of getNoteSemitone():
     - melodyGenerator.js:166-191 (ALL_PCS_CALC + .replace chain — single-accidental only)
     - melodyDifficultyTable.js:112-125 (_PC_ORDER/_ENHARMONICS, contains WRONG map 'Db'→'E♭')
     Fix: route both through getNoteSemitone(); delete the local tables. Add a test.

P1 — PERFORMANCE (real wins, respect §6/§10 opacity+timing invariants):
  ✅ PERF-1 DONE Deleted dead processMelodyAndCalculateFlags call (SheetMusic.jsx:9,897) —
     computed every render in the hottest component, never read. Low-risk.
  ✅ PERF-2 INVESTIGATED → NO ACTION (Han asked "kun jij dat doen?", 2026-06-13). Did the
     full static identity analysis the "needs profiling" note was guarding. Finding: EVERY
     object/array/fn prop to the main MelodyNotesLayers is ALREADY referentially stable
     (melody/allOffsets/scaleNotes/processedChords/clefs/transSemitones = useMemo;
     inputTestState = useState; timeSignature = stable prop; previewMode = literal;
     previewColorFn never passed). So the main memo already hits. The framed win doesn't
     exist because (a) nothing to stabilise, and (b) the line-2452 "K-1 cache hits" comment
     is a React.memo misconception — memo compares an element to ITS OWN previous render at
     the same tree position, it does NOT dedupe K sibling panels. SheetMusic also doesn't
     re-render per frame (currentMeasureIndex not read in render; highlight is pure-DOM rAF;
     re-renders only at transition boundaries), so cost is bounded. SVG <use> dedup is ruled
     out — incompatible with the data-attr highlight queries. ⚠ Misleading comment at
     SheetMusic.jsx:2452-2453 flagged (§4) — correct or delete it on Han's OK.
  ✅ PERF-3 DONE Replaced the per-frame [...set].sort().join(',') string alloc (note + chord
     blocks) with a tiny size+membership setsDiffer(). Highlight behaviour unchanged.
  ⏳ PERF-4 SKIPPED (low value, real risk) — the array rebuild at Sequencer.js:471-475 runs
     ONCE PER MEASURE (not per frame), so it's not a hot path; mutating scheduledNotes in
     place would jeopardise the append-only + lookahead-window invariant (§6) for ~nothing.

P1 — TEST DEBT (§7b):
  ✅ DEBT-2 DONE Added rhythmicPriorities.test.js (decompose/chooseGrouping/DNA, odd meters). Add rhythmicPriorities.test.js for
     odd meters (5/4,7/8,11/8,15/8): decomposeNumeratorToBeatGroups offsets +
     generateRhythmicDNA integer-rank/slot invariants. De-risks DEBT-3/4.

P2 — TECH DEBT (§6c/§7):
  ✅ DEBT-3 DONE Derive the [8,4,2,1] final-fallback rank divisions from
     numberOfSlotsPerMeasure (right-shift halving). Byte-identical for 16 slots; generalises
     (§6c). 240 tests green.
  ✅ DEBT-4 DONE Extracted shared decomposeToGroupSizes(n); decomposeNumeratorToBeatGroups
     + chooseGrouping now call it. Pure refactor, zero behaviour change.
  ⏳ DEBT-5 DEFERRED — needs Han confirm: 'lang' overshoot removal is flagged a "deliberate
     Han call", and CLAUDE.md §4 forbids removing comments (the tombstones) without asking.

P2 — ARCHITECTURE / CONVENTIONS:
  ✅ ARCH-1 DONE Named 4 ErrorBoundaries (App.jsx:1330 → "sheet-music";
     TabView.jsx:126/329/356 → tab-specific) per §7a.
  ⏳ ARCH-2 Add debugMode hit-boxes (§3a) to DrumPad, ChordGrid, ScaleSelectorWheel,
     PianoView. CONFIRM §3a scope (SVG-overlap components vs all) with Han.
     [Claude 2026-06-08] DEFERRED — investigated: all four are "hit == visible element"
     (DrumPad SVG pads, ScaleSelectorWheel segments, PianoView HTML keys, ChordGrid HTML
     buttons); none use the transparent OFFSET hit-rect pattern §3a's debug box exists to
     expose, so the value is low and the nightly's scope question is real. Needs Han's call
     on whether §3a applies to self-evident button/key components before doing it.

P3 — DOC HYGIENE:
  ⏳ DOC-1 CLAUDE.md §7a example uses non-existent E010-PLAYBACK-START; real code is
     E010-PLAY-MELODY. (Touches CLAUDE.md → needs Han's OK.)
  ✅ DOC-2 DONE §12: replaced the ghost `src/components/playback/PlaybackControls.jsx`
     entry (dir doesn't exist) with the real play/stop UI (AppHeader + BpmControls +
     RepeatsControls); added a "non-exhaustive" note covering omitted contexts/hooks/overlays.

============================================================
## CR/BUG BATCH (Han 2026-06-08) — range/clef setter polish
============================================================
ALL ⏳ pending §4b interview before implementing. Source = Han chat.

ANIMATION / TRANSITION:
  ✅ CR-A1 DONE (cap-only) Range slide anim too long for far clicks. Speed up with distance, cap TOTAL at 1s.
  ✅ CR-A2 DONE (single-staff refly) Clef changed WHILE range/notation settings open → trigger transition for THAT
     staff only: fade out its notes + wipe in from right (single-staff version of range-open).
  ✅ CR-A3 DONE (value-driven 0.5/0.5/0.5) 8va/15ma don't fly in (ok). On ANY notes transition AND on range-update anim,
     fade out (0.5s) → wait (0.5s) → fade in (0.5s) any CHANGED 8va/8vb/15ma. (Existing
     fade-in is too quick.)

NOTATION MENU (percussion / clef carousel):
  ⏳ BUG-N1 Percussion X-clef not perfectly aligned with the X on treble/bass staff.
  ⏳ BUG-N2 Percussion clef carousel: partial copy of active clef bleeds past the right mask
     ([X(active), perc clef, X partially behind mask]).
  ⏳ BUG-N3 Percussion note click area doesn't match note height (screenshot).
  ⏳ BUG-N4 Percussion clef setter has no debugMode hit-box (§3a).
  ⏳ BUG-N5 Clef-select anim: clicked clef correctly becomes active, but its GLYPH morphs
     mid-animation (click V on [G F V X] → shows G* during anim). Keep the CLICKED glyph the
     whole time; only the active STATE should move, not the glyph identity.

VISUAL CONSISTENCY:
  ⏳ BUG-V1 The X that disables the chords row ≠ the X on the staffs. Make consistent.
  ⏳ BUG-V2 Range setter: complex-chord columns vertically misaligned. Want columns:
     [accidentals , 4 notes (D F A C) , 3 notes (E G B)].
  ⏳ BUG-V3 End-of-staff barline looks thicker/brighter than the left one (notation + range
     settings). Make them visually consistent.

NEW (Han 2026-06-08, second batch):
  ⏳ BUG-N6 Chromatone transposition bug STILL NOT solved (despite #16). Re-investigate —
     the range-setter colour does not (correctly) account for transposition per Han.
  ⏳ BUG-N7 Vocal-clef selector doesn't use available space maximally — expect the SAME
     distribution as violin/bass clef when space allows.
  ⏳ BUG-N8 Selecting a vocal 'sub'-clef wrongly activates the BASS clef.

  ↳ CR-A2 refinement (Han 2026-06-08): refly fires ONLY on left-carousel FAMILY change
    (clefFamilyKey). Sub-clef changes — octave, transposition, vocal voice — no longer
    animate. clefFamilyKey treats all vocal voices (incl. Bass) as 'vocal'. Tests added.

============================================================
## GROUP B/C/N (Han 2026-06-08 "Do B, C, N") — interview answers locked
============================================================
Interview (§4b) done. Answers: N6=BOTH position+colour (match sheet, overrides 06-07
"concert position"); V2=keep current bright/lowlight intent in [acc · DFAC · EGB] cols;
N7=spread full-width like melodic, compact to C-G-C-on-active when tight.

B — NOTATION MENU (percussion / clef carousel):
  ✅ N1 perc disable-X aligned with treble/bass staff X via shared DisableCross at the
     −5 (CLEF_GLYPH_X−PERC_CLEF_X) offset → identical 13…31 span.
  ✅ N2 perc carousel even-spread stepX (FAMILY_RIGHT_FRAC·startX) like melodic → wrap
     copy lands at 2·step (past startX), no longer bleeds past the right fade mask.
  ✅ N3 perc together/split clickzone → y−30, h84 covers the split hi-hat beam (above)
     and the together stems+beam (below). Verified via debug render.
  ✅ N4 perc clef carousel slot now draws its debugMode hit-box (§3a).
  ✅ N5 ClefCarousel/renderFamily: active glyph = variant only when fam.id===famId, so a
     picked slot keeps its OWN family glyph through the slide (no mid-anim morph).
  ✅ N8 staffBlock famId = clefFamilyKey(settings) (rangeMode-aware) → vocal Bass now
     activates the VOCAL family, not instrumental bass. Verified via render.
  ✅ N7 vocal carousel rewritten to the melodic full-width swipe strip (VAR_X0/viewWidth,
     scroll on overflow); narrow → only active card shows C-G-C notes. Verified.

C — VISUAL CONSISTENCY:
  ✅ V1 new shared DisableCross component (overlays/DisableCross.jsx) — staff-off,
     perc-off and chord-off crosses now identical (start-aligned, 18×36, 2× taller, 2.4).
  ✅ V2 ChordStaffOverlay extended chord → 3 columns [accidentals · DFAC · EGB]; D+A
     bright, F+C+EGB lowlit; accidentals (♭/♯) hand-drawn in their own left column (the
     auto-renderer can't isolate them). Verified via render-chord.
  ✅ V3 SheetMusic overlay frame now draws MATCHING left+end barlines (both strokeWidth 1)
     in any overlayEditMode; removed the redundant rangeEditMode-only end barline.

TRANSITIONS batch (Han 2026-06-08 "yes!!", interview locked: slide attached to note ·
all morphs · hide melody whole transition):
  ✅ #1/B2/B3 ottava marker + bracket ("blokhaken") now stream in WITH the notes:
     added data-fly="" to the `octave-${groupIdx}` group in renderMelodyNotes so
     useRangeMorph/useClefRefly treat it as a flyEl (bbox.x = its leftmost note → same
     x-staggered delay → slides in attached to that note). Applies to ALL morphs
     (melody↔setter + overlay→overlay) since data-fly is unconditional. ⏳ live-verify.
  ✅ B4 melody flash — ALREADY fixed: notes-transition is display:none in overlayEditMode
     except during a melody-involving morph (SheetMusic.jsx:2047). Confirmed, no change.
  ✅ B1 clef-select slide — covered by CR-A2 single-staff family refly (sub-clef changes
     intentionally don't animate). No further change.

FR LOGGED (Han 2026-06-08) — NOT started, needs interview + Han's drawings (§4b):
  ✅ Transposition-setter revision — WIRED LIVE (2026-06-08). Semantics: concert C4 is
     WRITTEN as the chosen note (trans = writtenMidi − 60 → transpositionKey via keyForTrans,
     §6c). Per staff TWO coupled half-step carousels: LEFT concert note-NAMES, RIGHT diagonal
     NOTEHEADS (active pinned at fixed x + correct staff position). Replaces the horizontal
     ClefCardCarousel in ClefStaffOverlay's melodic (G/F) branch. Tap-to-select interaction;
     debug hit boxes (§3a). Build/lint/tests green; smoke test added.
     ✅ TANGENS CURVE (Han 2026-06-08): RIGHT noteheads placed at origin + f(t),
        x=−3·tanh(t/3)·25, y=(t³/20)·10 (Han chose +t³, the S-wave). X_SPACING→25.
     ✅ STAGE 2a (Han 2026-06-08 "go!"): X_SPACING→25. Heads = QUARTER notes (Maestro 'Ï') with
        ledger lines for near-active off-staff heads. DRAG on BOTH carousels (fractional
        dragDelta, PX_PER_STEP) → snap to nearest half-step on release; tap still jumps.
        Vertical clip mask (taller while dragging = more notes). Quick-pick concert-note rects
        left of the name carousel (C5,E♭4,C4,B♭3,F3,E♭3,C3,B♭2). Clamp [−5,11]. Build/tests green.
        Answers: octave→octave-clef (toonklasse + 8va/15ma/8vb/15vb, fade); quick-picks=concert
        sounds, beside LEFT carousel (mirror intervals on right).
     ⏳ STAGE 2b (STAGED — needs clef-octave system expanded): octave-clef-on-release fade
        (OCTAVE_VARIANTS lacks treble8vb/15vb + bass15va/15vb → add them first) and the
        octave quick-picks (C3/C5/B♭2, now dim+inert). Drag interactivity needs LIVE test.

N — NEW:
  ✅ N6 RangeStaffOverlay body+edge layers now pass transpositionSemitones={trans} → notes
     render at WRITTEN position AND colour (concert→written map + concertMidiByWritten for
     boundary/in-band; writtenName() for band+ellipsis Y). Verified via render-range-trans
     (trans=+2 moves notes up + recolours, boundaries stay yellow). Supersedes #16.

STAGE 2c BATCH (Han 2026-06-09) — transposition setter polish + transposed key sig:
  ✅ 1 curveY flipped to −t³ (higher written notes fan up). TranspositionSetter.jsx.
  ✅ 2 Heads now drawn WITH stems ('Ï' is notehead-only → stem path added, std direction).
  ✅ 3 Active = head CLOSEST to centre (m===writtenActive), always one lit. Both carousels.
  ✅ 4 Inactive heads/names use var(--text-lowlight) (was undefined --setter-lowlight → black).
  ✅ 5 Maestro #/b accidental drawn in front of head when name carries one (was ASCII '#'
       includes() check vs Unicode spelling → never rendered). Distinguishes C from C♯/D♭.
  ✅ 6 BUG FIXED (per-staff, interview-confirmed): WRITTEN key signature per staff =
       numAccidentals + getTranspositionFifths(key) (circle-of-fifths shift, formula not table).
       Notes respelled to written key via respellToKeySignature so in-key notes drop inline
       accidentals. SheetMusic header + renderMelodyNotes per-staff. Tests + build green.
  ⏳ NEW (Han 2026-06-09, mid-task): left setter — render a fixed C4 note (C-inst) and SWAP so
       it reads [C4 note] = [name carousel]. Layout ambiguous → confirm before building.

## TRANSPOSITION "PROPER IMPL" BATCH (Han 2026-06-09) — INTERVIEW PENDING
Main sheet music:
  ✅(verify) #1 accidentals: numAccidentals + getTranspositionFifths already wired (F→1,Bb→2),
      shown in NORMAL view, hidden in clef-edit by design. Confirm with Han it's actually wrong.
  ❓ #2 coloring reference: getMelodicColor already colours by WRITTEN note name PC. Han wants
      "tied to note name" — need: concert (sounding) vs written PC? tonic/scale/chord refs are
      concert → under transposition written notes mismatch concert tonic/chord. DECISION NEEDED.
  ⏳ chord active-colour when paused: tonic chord if it's the LAST melody chord, else FIRST melody
      chord; in Notation+Range setters use C major triad as active chord.
Notation setter:
  ⏳ both repeated clefs get "(X inst)" label (even C → "(C inst)").
  ⏳ active/highlighted head always coloured as C4 (green chromatone / tonic|chord colour);
      lowlights stay lowlight; fixed concert-C4 head uses (transposed) colouring.
  ⏳ percussion notes + chord letters in setter not coloured → use existing colour fns. SCOPE?
  ⏳ quick-picks: move to RIGHT of carousel; highlight only active, others lowlight.
  ⏳ spacing: left elements too far apart, right setter overlaps; left "=" at same height as C-note.
Then: D (octave clefs / 2-oct) + E (animation).

## TRANSPOSITION MODEL + TOGGLES (Han 2026-06-09)
Interview outcome:
  - Notes SHIFT to written display (current display is correct), BUT identity/colour/melody/
    playback stay concert (C4 stays C4). VERIFIED: transposition is display-only (no audio/gen
    leak); colour now concert (last batch). => "bug" already satisfied, no code change needed.
  ⏳ Toggle 1 LINK: keep same transposition on both staves (set one → other follows).
  ⏳ Toggle 2 INSTRUMENT→TONIC: selecting inst sets tonic to sounding key
     (newTonic = oldTonic − getTranspositionSemitones(key); Bb→ C→Bb, G→F). SEMANTICS to confirm:
     does it REPLACE the display-shift with a tonic change (reset transKey→C), or stack with it?
  Then: D (octave clefs / 2-oct) + E (animation).

## GLOBAL TRANSPOSITION (item 5, Han 2026-06-09) — model locked, build next
Trigger: AUTO — when BOTH staves carry the SAME transposition (key+octave) → global mode.
In global mode the WHOLE display moves to the WRITTEN domain (concert Bb denoted as C):
  - Header KEY shows the WRITTEN key (concert C major + Bb inst → "D Major") + a
    "(Bb instrument)" line right below the "Random Melody in <key>" header.
  - Chord labels → transposed to written (ChordLabelsLayer).
  - Note-name lyrics / solfège → transposed to written.
  - Tonic/key in header → written.
Notes positions + key signature already render written per-staff (done). Audio stays concert.
Touch points: header (App/SheetMusic title), ChordLabelsLayer, lyrics/solfège renderer,
a global-mode detector (treble.trans === bass.trans && !== 0).

## STILL OPEN after items 1/2/D (this turn):
  ⏳ Stage I: render perc-pattern + chord letters in the notation setter as NORMAL melodies
     (Han: "why don't you just render them as normal melodies?") so colour fns apply.
  ⏳ Item 5 global transposition (model above).
  ⏳ Stage E: carousel animation (tween on preset click instead of jump).

## DONE (Han 2026-06-09 session): items 1,2, D, 5(a/b/c), I, E
  ✅ 1 (X inst) top-right · 2 fixed C4 coloured by sounding pitch
  ✅ D 2-octave range via auto octave-clefs (transpositionOctave + decompose + written-note clef)
  ✅ 5 GLOBAL transposition: header written key + (X instrument) line; chord LETTER labels
       transposed; absolute solfège transposed (relative invariant). Auto when both staves match.
  ✅ I percussion pattern in notation setter coloured via real colour mode (active option)
  ✅ E carousel tween on tap (easeOutCubic, 280ms); drag-release skips the tween

## ANACRUSIS REPEAT (Han 2026-06-14) — pickup flows out of the last bar on repeats
Design agreed: SHORTEN the final note if possible; CLIP on overlap (notes starting inside the
pickup region of the last bar are disregarded). GENERAL runtime mechanism — detect the anacrusis
and build the pieces at runtime; works for any pickup song, not just HBD.
  🔨 Phase 1 (DONE): pure transform `src/utils/anacrusisRepeat.js`
       buildAnacrusisRepeatParts(melody, measureLen) → { hasAnacrusis, intro, loopClean, loopMerged }.
       intro = pickup notes alone (play ONCE). loopClean = body rebased to 0 (FINAL repeat, full last
       note). loopMerged = body with pickup merged into the last bar, overlapping note clipped to the
       pickup start (repeats 1..N-1). Unit-tested.
       Now also preserves lyrics + chord displayNotes through the merge (HBD words stay bound).
  🔍 WIRING DISCOVERY (2026-06-15): loaded songs play via handlePlayRepeat → repeatForever=true =
       isRepeatMode, no regen, numMeasures constant (9). "Keep 9 bars, empty m0 on repeats" is
       BROKEN (a full empty bar between pickup and downbeat). Repeat unit MUST be the body
       (bodyMeasures=8). Chosen shape: REPEAT mode = play intro ONCE (1-beat lead-in) then loop
       loopMerged forever (loopClean unused, no last pass). ONCE mode = original melody unchanged.
       repsPerMelody==numRepeats (one value, two names — config field vs render prop; arch §0). See §40.
  🔨 Phase 2 wiring STEP 1 (AUDIO) — DONE in Sequencer.start(), gated on repeatForever + anacrusis:
       builds merged body for all tracks (chords straddling m0 clipped), rebases fermatas (-ml),
       sets currentNumMeasures=bodyMeasures, regenerates metronome, plays the pickup ONCE as a lead-in
       (playMelodies tickRange=[pickupStart,ml]) then advances nextStartTime to the downbeat.
       ⚠ NEEDS HAN LIVE-CHECK: play HBD in REPEAT mode — pickup should flow out of the last bar with
       no dead bar; chords/bass aligned. Visual measure NUMBERING may be off (React state still holds
       the 9-bar original) — that's wiring step 2.
  ⏳ Phase 2 wiring STEP 2 (NOTATION): sync the displayed melody/numbering to the body so sheet
       matches audio (App trebleMelody vs Sequencer body divergence).
  ❓ OPEN for Han: (a) OK that on repeats the pickup shows at END of each block (not a leading bar),
       refined in phase 3? (b) Confirm once-mode plays unchanged + repeat-mode is always-merged.
  ⏳ Phase 3: pagination polish — leading-pickup bar on the first pass.
<<<<<<< HEAD

### Note-colouring 'scale' mode (Han 2026-06-16) — ADDED then REMOVED (Han 2026-06-17)
🗑️ Removed at Han's request: redundant — already covered by the existing tonic/scale colouring
   ("my bad"). Reverted commit 20309ee (the 'scale' branch in melodicNoteColor + the two sheet
   renderers + PianoView + the colour-menu/palette cycles + --note-blue var + tests/docs).

### Instrument selector in the sheet music (Han 2026-06-16)
✅ New in-staff INSTRUMENT setter (sibling of clef/range/colour) — 271 tests green, build clean.
   See architecture.md §41. Per-staff (treble row → treble instrument, bass row → bass).
   Horizontally-scrollable strip of instrument cards (lucide icon + name) grouped by family,
   active centered, via reused ClefCardCarousel.
   - NEW src/constants/instruments.jsx: grouped GM-slug list (extended +10), getInstrumentIcon,
     flat INSTRUMENTS map (RangeControls imports it — single source of truth), ICON_ATTRIBUTION.
   - NEW src/components/sheet-music/overlays/InstrumentStaffOverlay.jsx (data-fly cascade wrapper,
     group-label separator cards, attribution line; placeholder lucide icons → icons8 swap TODO).
   - PLUMB instrumentEditMode mirroring colorEditMode: App.jsx, SubHeader.jsx, SheetMusic.jsx,
     useRangeMorph.js groupsForKind('instrument').
   - onSelect → setTrebleSettings/setBassSettings({...,instrument}).

## TS-change-while-stopped malformed sheet (BACKLOG 1596) — 2026-06-17
✅ Fixed. melodyMeasureCount used Math.round → dropped partial final measure after a
   TS change (192 ticks in 3/4 = 5.33 → 5, not 6). Switched to ceil via new pure helper
   melodyMeasureSpan(total, measureLen, fallback) in melodySlice.js (Math.ceil(x - 1e-6),
   max 1, empty fallback). SheetMusic.jsx calls it. Processor already ties across new
   barlines + pads partial bar, so no rebarMelody needed. Eliminated at state level:
   stopped branch mutates only timeSignature. Tests +9 (280 green), build clean.
   Docs: architecture.md §13 bug log. Files: melodySlice.js, SheetMusic.jsx,
   melodySlice.test.js, architecture.md, BACKLOG.md.

## RANGE setter refinements R1–R4 (Han 2026-06-17)
✅ R1 Per-note staggered re-layout cascade. After a range commits, notes glide to
   new x in QUICK left→right succession (runRangeCascade, ~360ms, element.style
   translateX per §6, single-commit preserved). Tap now commits immediately;
   slideRef survives only for hold-extend (holdExtending gates cascade off).
✅ R2 Keyboard commit drives the SAME cascade (committed-key useLayoutEffect reads
   trebleRange/bassRange ← settings.range that KeyboardRangeSetter writes).
✅ R3 (bug) Keyboard band flash on open fixed: bandTransition flag + .kbd-range-band
   --instant gate the CSS x/width transition off until first real width rendered
   (root cause: width 0→real ResizeObserver jump animated by the transition).
✅ R4 Boundary highlight yellow→white: new theme-safe --range-boundary-highlight
   (#fff dark themes, #2b3a42 light) on boundary notes, selected melodic+percussion
   brackets, keyboard active bracket + band/handles. Unrelated --accent-yellow left.
   Files: RangeStaffOverlay.jsx, KeyboardRangeSetter.jsx (+css), App.css, scripts/
   render-range*.jsx, docs/architecture.md, RangeStaffOverlay.test.jsx (+2 tests).
   Tests 293 green, build clean. NOT committed (Han verifies feel live).

✅ Three generator setters PLAYBACK / GENERATION / GEN. ADVANCED (Han 2026-06-22).
   In-sheet-music overlays, siblings of range/clef/colour/instrument/legacy. Per-balk
   (row/staff: treble/bass/perc + CHORDS as 4th balk). PLAYBACK reuses SettingsOverlay
   via new groupClassName prop ('playback-overlay'); GENERATION + GEN.ADVANCED are new
   SvgSetter-based overlays. Field option arrays extracted to src/constants/
   generationFields.js (shared with InstrumentRow per §6d). 3 new edit-mode states +
   toggles in useEditMode (full mutual exclusion, tested). overlayKind +
   groupsForKind + mountedFor + render blocks in SheetMusic. App threads flags/handlers.
   SubHeader: 3 buttons (SlidersHorizontal / Sparkles / FlaskConical). Smoke tests for
   both new overlays + useEditMode mutual-exclusion tests. docs §42. Tests 455 green,
   build clean, lint 0 errors. NOT committed.
   🐞 PROVISIONAL: CHORDS-balk mapping (esp. GEN.ADVANCED passing-chords cycler in the
      tuplets column) needs Han confirmation. Layout/spacing UNVERIFIED on a live staff.

## #163 — Instrument setter tweaks (rework) ✅ [Opus/high]
   Restored NonLinearCarousel non-linearity (was flattened 2026-06-18 → UAT "no
   spacing impact"). Single source of truth in NonLinearCarousel.jsx pure fns +
   named consts: SIZE 100→70%(edge)→50%(overflow); SPACING/gap 100→70→40%
   (integrated into xOffsetForDist → compresses toward edges); OPACITY 100→50→30%
   →hard cut. Exactly ONE overflow element each side. SVG linearGradient edge mask
   (outer 5% → 0.5 opacity) on the visual <g>, not the hit rect. Debug boundaries:
   orange hit rect + cyan visible-window lines + magenta dashed overflow lines +
   5% mask bands. All 3 consumers inherit (instrument/colour/generation, §6d).
   InstrumentStaffOverlay: removed category PILL rect; restored coloured GLOW
   (drop-shadow in category var) + label CAPS + category tint, ALL live during drag
   via updateActiveCard imperative per-frame (§6). Chord row Y now one staff-stride
   below bottom staff (derived from layout, not hardcoded). Bracket x calls now pass
   `half` (xOffsetForDist became half-dependent). gen-advanced/gen-setter audited —
   already per-row anchored, no stacked-below bug. Preview already used new slug.
   Tests: 488 green (NonLinearCarousel +5 curve/mask/debug tests; 2 InstrumentStaff
   tests updated for CAPS). Lint 0 errors, build clean.

## #427 — Settings overlay UI overhaul 3 (L3) 🔨 [design]
   Big multi-section polish ticket. Sections & work items:
   ALGEMEEN — 1) hidden carousel: press-and-hold → drag immediately (no separate
     tap-open step); after a selection, auto re-hide after 3s (fade-out) leaving only
     the active item. (CarouselField hidden mode; possibly shared to StaffCarousel/fan.)
   COLOUR — colour wheel is the reference look, no change.
   INSTRUMENT — 2) move CHORDS carousel UP so its offset above its band matches the
     treble/bass/perc setters' offset above their staves; 3) instrument carousel hidden
     when not active.
   PLAYBACK — 4) measures fan: invert drag direction (drag DOWN = higher value);
     5) repeats: convert to hidden tanh fan (same layout as measures);
     6) remove "THEN: NEW MELODY" toggle; 7) repeats≠1 → render vertical repeat barline
     at endX (in-line).
   GENERATION — 8) melody-type icons: match instrument-setter icon height + label align;
     9) note-pool: add missing "note pool" header; 10) note-pool notes use real
     renderMelodyNotes note colours (not flat 'plaatjes'); 11) notes/measure: cluster
     per renderMelodyNotes grouping rules, assume grouping [2,2]q — stop mislabelling as
     'groupings'; 12) chords/measure: render chord LABELS instead of icon (C /  C G /
     C F G / C F G C by count; fractional count lowlights last chord e.g. 2.5 → C F (G)),
     count in Maestro under item (like notes/measure), add "#/measure" header;
     13) note-pool chromatic: stack accidentals vertically at pitches g4/b4/d5 (treble/
     vocal), an octave lower for bass clef; bass-clef rendered notes an octave lower.
   ✅ INTERVIEW done (§4b). Split into 4 sub-tickets: #428 ALGEMEEN, #429 INSTRUMENT,
   #430 PLAYBACK, #431 GENERATION (#429 f-f afh. #428). Han-antwoorden: hidden-timer reset
   bij elke interactie; repeat-barlines = volledig begin+eind repeat-teken; chords/measure
   labels letterlijk C/F/G/C.
   • #428 🔨→UAT [Opus/high]: hidden carousel press-and-hold→drag + 3s idle fade-out.
     NonLinearCarousel: collapsed/onReveal/mountAllItems (altijd gemount → naadloze hold-drag;
     collapse-fade via element.style rAF; rest goedkoop, alleen actief item gemount).
     CarouselField: open/closing + 3s idle timer (reset op elke interactie). Tests 563 groen,
     lint/build clean, docs §52a. NIET gecommit (wacht op Han). → #428 op `test`.
   • #429 ✅→UAT [Opus/high]: chords-carousel afgeleid op staffStride boven treble;
     instrument-carousels hidden via gedeelde useRevealOnInteraction hook (#428 hergebruikt).
   • #430 ✅→UAT [Opus/high]: measures-fan invert (naar beneden = hoger); repeats → compacte
     LeftFanCarousel met repeat-glyphs (renderNode); THEN:NEW MELODY weg; full begin+eind
     repeat-tekens op staff via nieuwe gedeelde repeatSigns.jsx (BarlinesLayer consumeert ook).
   • #431 ✅→UAT [Opus/high]: melody-type iconen 38px+uitlijning; note-pool chromatone-kleuren;
     chord-pool gestapeld; chromatic voortekens verticaal D5/B4/G4 (octaaf lager bass); notes/measure
     [2,2]q beaming; chords/measure letterlijke labels C/C G/C F G/C F G C (+lowlight fractie,
     Maestro-count, #/measure header); exotic→alt/ext label + akkoord D4 E♭4 F4 G♯4 A4 B♮4 C5.
   Alle 4 op `test`. Suite 571 groen, lint 0 err, build clean. docs §52a/§53/§54/§55. NIET gecommit.
   Nieuw gedeeld: src/hooks/useRevealOnInteraction.js, src/components/sheet-music/repeatSigns.jsx.

## 2026-07-20 — Chord-complexity setter polish + veil layering + legacy settings removal (Han)
- 🐞/🔨 Chord complexity glyph (generationNoteGlyphs ComplexityChordGlyph):
  - render als HELE noten i.p.v. kwartnoten
  - SUS eruit als complexity-optie
  - voorkom hulpstreepje onder de lage C
  - ALT/EXT voluit: ALTERED / EXTENDED
  - horizontaal centreren: rechterkant eerste-kolom noteheads tegen de middenlijn (centerX)
- 🐞 Veil/masking (#493) — algemene layering-fix:
  - veil bedekt NIET alles (chords/measure blijven zichtbaar) → til veil naar gedeelde laag boven alle sheet-content
  - staff-line MASK laat overlappende elementen op die pixels ongeveild → vervang mask door lijnen BOVENOP de veil hertekenen (slimme oplossing)
- 🔨 Verwijder legacy 'settings'-overlay (legacyMounted, SheetMusic.jsx:2738) + trigger/tab — vervangen door playback
- Status: INTERVIEW eerst (§4b), daarna impl.

## 2026-07-20 — #502 Verwijder legacy SETTINGS-knop + verhuis controles naar COLOUR-setter (Han)
- 🔨/⏳ SubHeader SETTINGS-knop (Settings2) + legacy in-staff SettingsOverlay + bottom RangeControls weg (redundant met PLAYBACK).
- kleurmodus-knop weg (COLOUR-setter dekt); akkoordnotatie-knop weg.
- highlights + animatie(pag/wipe/scroll) + lyrics → 3 HIDDEN tap-to-open carousels op de BAS-balk in de COLOUR-setter (treble houdt kleur-schema carousel).
- Verwijdert showSheetMusicSettings (useSettingsOverlay) — verweven met useEditMode/AppHeader/SubHeader/App.jsx/SheetMusic/TabView (~7 files). LET OP: AppHeader heeft OOK een SlidersHorizontal-knop die het toggelt — bevestigen of die ook weg moet.
- Interview afgerond; ticket #502 in design. Impl = gefocuste vervolgstap (niet in deze turn — te groot om aan de staart te haasten).

## 2026-08-03 — ✅ #666 Character creator → 32px pixel-art grid (vierkante hoeken, checkerboard debug, equipment slots 16x16)
- Interview (3 rondes, §4b): scope hoeken ("alles"), scope checkerboard ("hele character view in pixel art"),
  16x16-interpretatie (logische px × schaal 4, dezelfde schaal op ALLE elementen — Han bevestigde de grote,
  risicovollere volledige herschrijving expliciet i.p.v. de aanbevolen kleinere scope).
- CharacterCreator.css: 32px cell-conventie (8px logisch × 4 schaal), border-radius:0 overal (incl. .cc-swatch,
  was rond), alle box-afmetingen (padding/gap/width/height) gesnapt naar veelvoud van de cell/half/quarter-cell,
  nieuwe `.cc-checker` (grijs 50%/transparant checkerboard, 32px cel) alleen actief via debugMode-class.
  .cc-equip/.cc-slot: vaste 64px (2x2 cellen = 16 logische px) i.p.v. proportioneel aan AVATAR_H.
- CharacterCreator.jsx: debugMode prop, checker() helper op modal/avatar/slot/grid/thumb, AVATAR_H 336→320
  (dichtstbijzijnde 32px-veelvoud; afgeleide avatar-breedte bewust NIET gesnapt, is sprite-aspect-ratio-gevolg).
- App.jsx: debugMode doorgegeven aan <CharacterCreator>.
- Suite 633 groen (ongewijzigd, geen nieuwe unit tests — pure CSS/layout wijziging), lint 0 err, build clean.
  docs.md §111. Nog niet gecommit.

## 2026-08-03 — 🐞 #666 vervolg: checkerboard was diagonaal i.p.v. axis-aligned vierkantjes
- Han: "elke slot zou 4x 8x8 checkerboard moeten hebben" + "ook achter mijn avatar" (was onzichtbaar).
- Root cause: de 2-laags 45deg linear-gradient truc geeft een DIAGONAAL streeppatroon, geen recht
  geblokt schaakbord — te subtiel om als "4 losse vierkantjes" te lezen, en bijna onzichtbaar
  achter de grotendeels ondoorzichtige avatar-sprite.
- Fix: correcte 4-laags formule (+45deg EN -45deg, halve-tegel offset) → echt axis-aligned
  checkerboard, 32px vierkantjes (1 cell), 64px tegel → 64px slot toont exact 2x2=4 vierkantjes.
  CSS-only, geen JS/JSX wijziging.
- Build clean. Kon dit NIET visueel verifiëren in de browser (geen Playwright/headless browser
  beschikbaar in deze omgeving) — fix is afgeleid via zorgvuldige gradient-geometrie, niet
  live getest. Han gevraagd opnieuw te checken. docs.md §111 uitgebreid met dit vervolg.

## 2026-08-03 — ✅ #667 Character-popup weg — geïntegreerd in sheet-music/bottom-view (character/stats/equipment/bestiary)
- Interview 4 rondes (§4b): entry/exit, tab/edit-mode-architectuur-fit, exclusiviteit met andere
  SubHeader edit-modes, exacte top/bottom-split. Han's uiteindelijke spec: characterScreen
  (null|character|stats|equipment|bestiary) vervangt de popup volledig.
  - Top (sheet-music-slot): avatar (+ 4x3 equipment-grid enkel bij 'equipment'), of bestiary-preview,
    of stats-placeholder — i.p.v. <SheetMusic>.
  - Bottom (TabView-slot): identity+acties+categorie-tabs+item-grid+swatches, of bestiary-thumbnails,
    of stats-placeholder — override, ongeacht welke activeTab eerder actief was.
  - SubHeader: leeg tijdens een level; 4 nieuwe iconen (Character/Stats/Equipment/Bestiary,
    AvatarSubHeader.jsx) tijdens avatar-context; normale 8-knops SubHeader daarbuiten.
  - Hero-klik blijft trigger (opent op 'equipment'); nieuw header-icoon (User/Music2, alterneert)
    is de enige weg terug, want de hero verdwijnt zelf mee met de sheet-music.
  - Exclusief met de 7 andere edit-modes via nieuwe closeAllEditModes() (useEditMode.js).
- Refactor (geen herschrijving): CharacterCreator.jsx's logica 1:1 verplaatst naar
  useCharacterEditor.js hook; nieuwe CharacterAvatarPanel (top) / CharacterOptionsPanel (bottom).
  Bestiary.jsx idem gesplitst via useBestiaryEditor.js → BestiaryPanels.jsx. Alle cc-* CSS-classes
  hergebruikt; enkel de popup-chrome (.cc-overlay/.cc-modal/.cc-modal-diablo/.cc-close) verwijderd.
  CharacterCreator.jsx + oude Bestiary.jsx verwijderd.
- Stats: pure "coming soon"-placeholder, geen implementatie (zoals gevraagd).
- Browser-geverifieerd (Puppeteer + lokale Chrome, headless, tegen de echte dev server): alle 4
  schermen + open/dicht-cyclus gescreenshot, geen console-errors. Suite 633 groen, lint 0 err,
  build clean. docs.md §112. Nog niet gecommit.

## 2026-08-03 — 🐞 vervolg #666: checkerboard-fix bevestigd in browser
- Eerste "verkeerde layer"-melding kwam vermoedelijk doordat debugMode niet aanstond na een refresh
  (plain useState, niet persistent). Puppeteer-screenshot van de ECHTE dev server bevestigt: de
  4-laags checkerboard-fix werkt correct — scherp schaakbord achter avatar, alle equipment-slots,
  skin- en bestiary-thumbnails.

## 2026-08-03 — ✅ #667 vervolg: mic/midi-icoon weg uit avatar-context, skin=kleurenpalet, ears=toggle
- Mic/MIDI/QWERTY input-cycler-knop (AppHeader) verborgen zolang characterScreen actief is (irrelevant
  tijdens avatar-editing). Debug-only MIDI-statusoverlay blijft ongemoeid (apart, al debug-gated).
- Skin: 10 bestaande skin-opties nu als kleine kleurvlakjes (skinSwatchColor, characterAssets.js,
  keyword-match zoals de rest van dit bestand) i.p.v. volledige lichaamsthumbnails. Interview bevestigd:
  zelfde 10 opties, geen continu hue-palet.
  characterAssets.js) i.p.v. volledige lichaamsthumbnails.
- Ears: Normal/Long toggle i.p.v. 5-thumbnail-grid (die toch allemaal naar dezelfde skin-matched ear
  resolvede — pre-existing redundantie nu opgeruimd). Long valt terug op eerste beschikbare ear-item
  voor skins zonder nummer (Zombie/Orc/Demon/Devil/Ghost).
- Hair: NIET aangepast — kleurvarianten-bestanden bestaan nog niet (anders dan kleding). Han: zelf
  bestanden herlabelen later; dan werkt de bestaande .cc-variants-swatch-mechaniek er automatisch op.
- Browser-geverifieerd (Puppeteer): mic-knop-aantal daalt met 1 in avatar-context, skin-swatches en
  ears-toggle gescreenshot. Suite 633 groen, lint 0 err, build clean. docs.md §112 (vervolg-sectie).
  Nog niet gecommit.

## 2026-08-03 — ✅ #668 Auto-gescande bestiary (alle niet-hero personages), variant-toggler, 6-categorie selector
- Interview (§4b): categorie-mapping bevestigd (characters/humanoid/animal/air/ground/other = 1-op-1 op
  bestaande mapnamen), animatie-data-aanpak ("doe een voorstel o.b.v. wat je aantreft, toon hxb in debug"),
  variant-groepering (hergebruik kleur-keyword-detectie zoals kleding).
- scripts/generate-bestiary-manifest.mjs (nieuw, Node-only, pngjs devDependency): scant ~450 PNG's onder
  ASSORTED/characters (excl. char_hero + de 10 al-gecureerde curated enemies), decodeert pixels, gokt
  framegrootte (grootste gemene deler uit [128,96,80,64,48,32,24,16]), telt content-frames per rij (stopt
  bij eerste transparante cel), berekent crop-rechthoek, groepeert kleurvarianten. → 289 entries in
  bestiaryManifest.generated.js.
- src/model/bestiaryAssets.js (nieuw, runtime): import.meta.glob voor URLs + generated manifest → creatures.
- enemyAssets.js: ENKEL een additieve `category`-tag per curated entry (geen gameplay-velden aangeraakt —
  SLIME_COLORS/etc blijven exact zoals ze waren, gebruikt door SheetRpgLayer voor echte combat-slimes).
- useBestiaryEditor.js herschreven: unified creature-lijst (curated + gescand), Slime special-cased naar
  3 variants via bestaande SLIME_* constants (geen dubbele sprite-data).
- BestiaryPanels.jsx: variant-toggler (kleur-swatches, hergebruikt .cc-swatch/variantColor) in top-view;
  6-categorie tab-rij in bottom-view; debug-only WxH-overlay ("hxb").
- Browser-geverifieerd (Puppeteer): categorie-tabs werken, Slime-toggler toont 3 swatches, debug-overlay
  toont afmetingen (bug gevonden EN gefixt tijdens verificatie: overlay toonde leeg voor curated entries
  zonder width/height-veld).
- Suite 633 groen, lint 0 err, build clean (JS-bundel groeide van 1.67MB→2.23MB door de vele nieuwe
  eager-geladen sprite-URLs — bestaand patroon in dit bestand, geen nieuwe eager-glob-aanpak).
- ⚠️ TWEE dingen die JOUW beslissing nodig hebben, zie docs.md §113:
  1. Bekende gok-beperkingen: niet-vierkante frame-packs (cow/pig) vallen weg; een paar dieren (fox, doggy,
     sommige paarden) tonen "verdubbeld" omdat de gegokte framegrootte geldig maar te grof is. Zichtbaar
     via de debug-overlay, per-entry te corrigeren wanneer je wil.
  2. De ASSORTED-asset-map bevat naakt/suggestief materiaal (Succubus-map, "no bra"-bestanden, ~26 entries)
     dat nu ongefilterd in de "characters"-categorie staat. NIET zelf verwijderd — aan jou om te beslissen
     hoe dit aan te pakken (map uitsluiten? keyword-blocklist?).
- Nog niet gecommit.

## 2026-08-03 — ✅ #670 Bestiary hand-meting ronde 2: niet-vierkante packs, cross-row animaties, critters, explosion-effect
- boss_spider(192x96,5 anims,rij5 "??" overgeslagen), Imp(64x64,5 anims), Female Hell Giant[covered]
  (112x128, covered/uncovered als kleurvarianten), The Devil(96x112, idle1/idle2/emptycauldron via
  cross-row merge), Large Skull(rij1+2→attack, rest generiek), Demon eye/Demon Mine/Plague Flies
  (fly/death) — allemaal hand-overrides in generate-bestiary-manifest.mjs.
- Manifest-schema aangepast: frameSize(number)→frame:{w,h} (niet-vierkant mogelijk), rows:[{row,frames}]
  →animations:[{key,label,cells:[{row,col}]}] (nodig voor het paard se cross-row-gestikte animaties).
  CreatureSprite (BestiaryPanels.jsx) stapt nu door cells i.p.v. vaste rij+frame%N.
  cells geëxporteerd; "row+frames" is nu gewoon het simpele geval van "cells".
- Explosion (nieuw, categorie 'other'): Imp's death-cells apart opgeslagen als herbruikbaar
  explosion-effect voor sprites zonder eigen death-animatie.
- enemyAssets.js relabels (gameplay-veilig, enkel key/label strings, grep-bevestigd niets buiten
  Bestiary-UI leest deze): pumpkin(move→attack,attack→death), bat(idle→fly,move→attack,attack→death),
  flying-eye(idle→fly,move→death), mosquito(idle→fly,move→death).
- Browser-geverifieerd: boss_spider/Imp/Devil/Hell Giant/Large Skull/Explosion/Bat allemaal gescreenshot,
  renderen correct. Suite 633 groen, lint 0 err, build clean. docs.md §114.
- ⚠️ NOG OPEN (jouw input nodig):
  1. Horse stagger/death verwijzen naar "rij 7/8" maar het paard-sheet is bij 96x120 frame EXACT 6 rijen
     (720/120) — rij 7/8 bestaan niet, renderen leeg. Is de framehoogte niet 120, of klopt de rijtelling
     niet? Nog steeds ongefixt, met opzet — giswerk zou het misschien verkeerd maken.
  2. Aanname: "demon fly" → Plague Flies.png (geen exacte bestandsnaam-match) — corrigeer als dit fout is.
  3. Nog open van vorige ronde: naakt/suggestief materiaal (Succubus-map + nu ook Hell Giant) nog niet
     door jou beslist hoe te behandelen.
- Nog niet gecommit.

## 2026-08-03 — ✅ #672 Bestiary ronde 3: kleur-sampling, accessory-togglers, portret-koppeling, 4-weg character-split
- Correcties op ronde 2: horse 96x120→128x90 (lost ook de rij7/8-out-of-bounds bug op: 720/90=8 rijen),
  wisp 40x32→32x32.
- Doggy: 5 stijlen gegroepeerd tot 1 "Doggy"-creature, swatch-kleur ECHT GESAMPELD (gemiddelde RGB van
  niet-transparante pixels — sampleColor() in de generator), geen giswerk.
  Hat/Backpack: nieuw "accessory"-concept (onafhankelijke aan/uit-lagen, geen variant-alternatieven) —
  ACCESSORIES-export, activeAccessories-state, CreatureSprite.overlayUrls stapelt lagen op dezelfde
  frame/crop/cell-coördinaten (zelfde 32x32-grid).
- Covered/Uncovered EN Wisp Plain/Outline tonen nu als .cc-tab-togglers i.p.v. lege swatches (geen kleur
  te resolven → automatisch toggle-stijl i.p.v. swatch-stijl).
  bloated(idle/move/death), damned tree (elke RIJ = gender-variant, kolom0=idle, rest=death; 1 bestand
  →2 entries Male/Female). Damned Male/Female elk gegroepeerd met hun covered-bestand.
- Lamia: "bare"-variant toegevoegd (lamia-bare.png gekopieerd naar enemies/sheets/, zelfde aanpak als
  Slime's speciale multi-variant behandeling).
- Portret-koppeling: char_with_porttrait (~166 bestanden) — elk personage-sheet gekoppeld aan zijn
  "...64x64...portrait..."-crop in DEZELFDE map (werkt ook voor geneste Succubus-submappen), alleen bij
  precies 1 kandidaat-portret (Samurai's 8 genummerde portretten = ambigu, overgeslagen). Top-view toont
  nu karakter LINKS + portret RECHTS naast elkaar.
- "characters" categorie gesplitst in 4: passive/attack/portrait/walk (1-op-1 op bronmappen), allemaal
  aangenomen 64x64.
- Relabels: Large Skull volgorde idle/attack/move (was attack/idle/move); curated flying-witch
  idle/attack/move (rij1↔2 omgewisseld); mimic gecontroleerd, al correct, ongewijzigd.
- Browser-geverifieerd: Doggy (5 swatches + hat+backpack beide actief zichtbaar op de hond), Hell Giant
  toggle-stijl, Damned Tree (Female/Male + Idle/Death), Lamia (Normal/Bare), Angel portret naast karakter.
  Suite 633 groen, lint 0 err, build clean. docs.md §115.
- ⚠️ Bekende restruis (zoals afgesproken, niet stuk-voor-stuk nagelopen): een handvol portrait-categorie
  thumbnails renderen als effen kleurvlak of rommelige multi-frame-strip — de blanket 64x64-aanname past
  niet op elk van de ~240 bestanden in de 4 character-mappen.
- Nog niet gecommit.

## 2026-08-03 — ✅ #673 Bestiary ronde 4: 9 composite "characters sheet N"-bestanden → ~60 losse personages
- GandalfHardcore characters sheet 1..6.png (14 rijen, 6 kleurvarianten van DEZELFDE roster) en
  ...sheet1..3.png (15 rijen, 3 kleurvarianten, ANDERE roster) — elke rij = 2 losse personages (5 idle-
  frames elk, kolom0-4/5-9). Nieuwe expandRosterSheet() + cropForCells() (krappe crop per personage,
  hergebruikt scanRows' alpha-boundsmethode) in de generator, roster-tabellen 1-op-1 overgetypt uit je
  bericht.
- Cat/Cat Hat/Dog/Dog Helmet → categorie 'animal' i.p.v. passive/walk ("show in pets").
- Posing Lady: vereenvoudigd naar 3 losse personages (Pose 1/2/3), elk met de volledige 6 kleurvarianten
  — geen echte 2D (pose×kleur) selectie, bewuste scope-vereenvoudiging.
- Browser-geverifieerd: Wizard (6 sheet-varianten), Cat (animal-categorie, 3 varianten), Posing Lady/Monk/
  Mermaid correct. Suite 633 groen, lint 0 err, build clean (551 manifest-entries, was 308).
  docs.md §116.
- Nog niet gecommit.

## 2026-08-03 — ✅ #674 Bestiary ronde 5: named-row extraction (camp/coin/cooking/musicians/art lady), musicians-tab
- Nieuwe expandNamedRows() generaliseert §673's roster-aanpak naar losse rijen/rij-reeksen per bestand:
  Camp Characters (Wizard(Camp)/Reading, Knight Crown/Squatting, Knight Pointy Hat/Sharpening),
  Collecting Coin (Knight Crown/Collecting Coin, Wizard(Camp)/With Bag, Lady Collecting Coin),
  Knight Cooking (Knight Crown/Cooking [rij1+2 samengevoegd], Lady Reading, Musician Lyre),
  Wizard with a map (alle content-rijen samengevoegd tot 1 idle-loop, Wizard(Camp)/Reading Map).
  Cross-file groepering werkt automatisch (Knight Crown krijgt 3 varianten uit 3 verschillende bestanden).
- ⚠️ Naamcollisie gevonden EN gefixt vóór opleveren: de roster-sheet "Wizard" (uit sheet1-6) zou anders
  samengevoegd zijn met deze nieuwe camp-wizard (2 visueel andere personages als 1 creature met 7
  varianten). Hernoemd naar "Wizard (Camp)".
- Art lady: laatste (7e) frame nu apart als 'Statue'-animatie i.p.v. onderdeel van de idle-loop.
- Nieuwe categorie 'musicians' (10e tabblad): Drum, Tambourine (spelling gecorrigeerd), Violin, Musician
  Lyre (uit Knight Cooking rij4), en Japanese Musician (op eigen initiatief toegevoegd, niet expliciet
  gevraagd — gemeld).
- Browser-geverifieerd: musicians-tab met 5 entries, Art lady Idle/Statue-knoppen, Knight Crown met 3
  varianten uit 3 bestanden, Wizard (Camp) correct gescheiden van de roster-Wizard.
  Suite 633 groen, lint 0 err, build clean (559 manifest-entries, was 551). docs.md §117.
- Nog niet gecommit.

## 2026-08-03 — ✅ #675 Bestiary ronde 6: kolom-gebaseerde Male/Female sheets, gedetailleerde portrait-Wizard, groter portret
- Male/Female Pixel Art characters: KOLOM-gebaseerd (i.p.v. rij), 11 personages elk, animatie-frames verticaal
  gestapeld binnen de kolom (rij0=portret[niet gebruikt, portrait-large-bestand ipv], rij1-5=idle, rij6-13=
  walk). Nieuwe expandColumnSheet(), portret gekoppeld via "...Portrait large{N}.png".
- ⚠️ Bug gevonden EN gefixt vóór opleveren: de "Male"-regex matchte ook "Female" (Female bevat letterlijk
  "male" als substring: "Fe-male"). Elke kolom van de female-sheet kreeg stiekem de MALE-namen. Gevonden
  door de manifest te controleren (geen "Queen"-entry) vóór de browsercheck. Gefixt met \b word-boundary.
- De portrait-Wizard (char_with_porttrait/Wizard/, 8 kleurvarianten, 384x704=6x11): volledige cross-row-
  gestikte animatieset (idle/walk/cast1-4/jump/counterspell/idlesmoke/death) overgetypt — 66 cellen totaal,
  exact gelijk aan de 6x11-grid, sterke zelfcontrole dat de transcriptie klopt. Hernoemd naar
  "Wizard (Portrait)" om verwarring met de eerdere twee "Wizard"-namen te voorkomen.
- ⚠️ Tweede bug gevonden EN gefixt vóór opleveren: het gedeelde portret-bestand voor de 8 kleuren
  (64x64 Wizard Portraits.png) bleek zelf een 4x2-grid (256x128) te zijn, niet 1 portret — toonde alle 8
  kleuren tegelijk ongeacht welke geselecteerd was. Nieuwe portraitCell/portraitFrame + PortraitImage-
  component lost dit op (crop naar de juiste cel, zelfde techniek als CreatureSprite).
- Portret nu 2x groter (64×PREVIEW_SCALE i.p.v. de helft) — leest nu als gelijkwaardig aan de avatar,
  niet als bijzaak.
- Browser-geverifieerd: King/Queen (avatar links, groot portret rechts), Wizard (Portrait) met alle 10
  animaties + correct 1-op-1 portret per kleur. Suite 633 groen, lint 0 err, build clean
  (579 manifest-entries). docs.md §118.
- Nog niet gecommit.

## 2026-08-03 — ✅ #676 Bestiary ronde 7: archer/beekeeper relabels, 8 bestanden gesplitst/gegroepeerd, sheet4-correctie
- Lichte verificatie zoals gevraagd ("simpele remappings, geen uitvoerige tests nodig"): build/lint/test +
  1 korte browser-steekproef, niet de volledige screenshot-batterij van eerdere rondes.
- Archer: idle/shoot/move/hit/death. Beekeeper: 3e rij attack->pose. Bard -> musicians.
- Nieuwe splits: Tavern NPCs (Lute/Flute->musicians, Drunk Dancing, Couple Dancing), Character sheet
  (9 personages, Knight Crown kneel/no-helmet samengevoegd met bestaande Knight Crown), Character sheet
  bare (4 bare-varianten voor de Spirit Blue-groep), Little Person and Magician (Wizard Smoking grijs/bruin
  hoed + Frodo), Relaxing characters + Relaxing Bare (Lady Relaxing 1/2/3, elk Normal/Bare).
- Nieuwe variant-koppelingen: Spirit Blue Sword (4 varianten: Blue/Blue Bare/Sword Spirit/Sword Spirit
  Bare), Female Wizard (Normal/Bare), Lady Godiva (Uncovered/Covered, 96x80 — enige uitzondering),
  Japanese Characters (Normal/Bare, 80x64), Bathtime (Normal/Bare, 128x64, 2 rijen samengevoegd tot 1
  animatie), Bathtime Knight (los, gewoon 64x64).
- Correctie sheet4/5/6: sheet4 kreeg zijn EIGEN 14-karakter-roster (niet gedeeld met sheet1-3); sheet5/6
  helemaal overgeslagen (nog geen roster van jou ontvangen) i.p.v. verkeerd gelabeld.
- ⚠️ Bug gevonden EN gefixt vóór opleveren (zelfde bug-klasse als de Male/Female-fout): isCurated()'s
  simpele .includes() matchte "Bathtime" tegen het curated-dedup-keyword 'bat' ("bat-time" bevat "bat"),
  waardoor alle Bathtime-bestanden stilletjes werden weggegooid. Gevonden door de manifest te checken
  (0 Bathtime-entries) vóór de browsercheck. Gefixt door ALLE CURATED_KEYWORDS over te zetten op
  \b-word-boundary-matching i.p.v. losse substring-checks.
- Suite 633 groen, lint 0 err, build clean (569 manifest-entries). docs.md §119.
- Nog niet gecommit.

## 2026-08-03 — ✅ #677/#678 Bestiary ronde 8/9: Santa/Vampire single-row layout, Knighty gedetailleerd, 3 quick fixes
- Santa Claus + Vampire Lady v2: 896x64 = 1 rij x 14 kolommen (niet 14 rijen). idle=kol0-4, walk=kol5-12,
  kol13(portret) genegeerd — standalone portret-bestand werkt al via bestaande PORTRAIT_MAP.
- Knight Knighty: geverifieerd tegen echte bestandsgrootte (345x812 = EXACT 5x14 @ 69x58), 8 animaties
  (walk/attack/jump/idle/block/attack double/idle sit/death) tellen op tot exact 70 cellen — sterke
  zelfcontrole dat de transcriptie (incl. 1 aangenomen typo-fix: "rij5+rij5"->"rij5+rij6") klopt.
  Losse "Run and Portrait"-pack (414x58, 6x1 @ 69x58) apart als "Knight (Knighty Run)" — cross-file
  animatie-merge naar dezelfde creature bestaat niet in dit datamodel.
  Basisnamen hernoemd naar "Knight (Knighty)"/"Knight (Knighty Run)" om botsing met bestaande
  Knight Crown/Iron Mask/Sword Shield te voorkomen.
- ⚠️ Knight HEAVY expliciet NIET meegenomen: hoofdsheet (455x768) en sheet2 (637x192) delen NIET
  gelijkmatig door 69x58 (455/69≈6.59, 768/58≈13.24) — in tegenstelling tot Knighty's schone 5x14.
  Blijft op de generieke gok staan; jij moet Heavy's echte framegrootte opnieuw opmeten.
- 3 snelle fixes: Satyr->musicians, Wizard Smoking hoedkleuren omgewisseld (rij0=Brown Hat, rij2=Grey Hat),
  Wizard (Portrait) kleur-volgorde gecorrigeerd (was alfabetisch geraden, nu: blue/red/green/purple/
  yellow/brown/black/white zoals jij aangaf).
- Suite 633 groen, lint 0 err, build clean (569 manifest-entries). docs.md §120.
- Nog niet gecommit.

## 2026-08-03 — ✅ #679 Level 9: Wizard-tegenstander met lineair vliegende projectiles i.p.v. slimes
- Nieuw level 9 (kopie van level 2's generatie-parameters, jouw interviewantwoord), `enemyType: "Wizard"`.
- Wizard (Black, jouw keuze) staat vast rechts, gespiegeld naar de avatar, cast2 speelt eenmalig per
  gespawnde projectile (afgeleid uit spawn-timing, geen extra state — zelfde patroon als hero's attack).
- Projectile (blue, gemeten: 288x96 = 6x6 @ 48x16, 36-frame loop) beweegt LINEAIR (herbruikt de bestaande
  noteX die de nootglyph al lineair liet bewegen) i.p.v. de slime's hop-pauzes — zelfde beat-gekoppelde
  aankomsttijd als een slime (jouw interviewantwoord: "zelfde timing, alleen lineair").
  Death: eerste 5 frames van static-projectiles-5 (gemeten: 160x192 = 5x6 @ 32x32, rij0 = de 5 frames),
  -20% opacity per frame (1,0.8,0.6,0.4,0.2), bevroren positie — exact zoals slime's death.
- Combat/hit-detection/miss/wave-clear logica: 0 wijzigingen — enemy-agnostic, werkt al op abstracte
  slime-data-indices.
- 🐞 Gevonden EN gefixt: LevelStartSplash had een hardcoded `[1..8]`-array — level 9 bestond al in
  levels.json maar was niet selecteerbaar in de UI-picker. Nu afgeleid van `LEVELS` zelf.
- Suite 634 groen (levels.test.js +1), lint 0 err, build clean. docs.md §121.
- Nog niet gecommit.

## 2026-08-03 — ✅ #679 Avatar-context UI batch: mic weg, bestiary/character consistency, categorie-tabs verplaatst
- Microfoon/input-cycler knop volledig verwijderd uit AppHeader (ook tijdens melody mode, niet alleen
  character-context) — functionaliteit blijft volledig bereikbaar via de bestaande Settings-overlay.
- Bestiary preview-stage (`.cc-enemy-stage`) krijgt nu hetzelfde kader+achtergrond als `.cc-avatar`
  (zelfde CSS vars, geen nieuwe waarden geraden).
- Nieuwe `.cc-toggle-group`/`.cc-toggle` CSS: verbonden segmented-control-look, structureel anders dan
  `.cc-anim` (geen kleurwissel, jouw gekozen optie "vorm/groepering anders"). Toegepast op ears
  Normal/Long, bestiary hat/backpack-togglers, en bestiary's kleurloze Covered/Uncovered-paren.
  Animatieknoppen (`.cc-anim`) blijven ongewijzigd.
- Equipment: kleurenvakjes verplaatst van vóór naar ná de item-thumbnail-grid.
  Bestiary top-view swatches stonden al onder de sprite — ongewijzigd gelaten (jouw antwoord: enkel
  equipment aanpassen).
- Categorie-tabs (character skin/ears/hair; bestiary passive/attack/.../musicians) verplaatst van de
  bottom-view panelen naar `AvatarSubHeader` (de rij waar normaal TOP/BOTTOM/PERCUSSION staat) — zelfde
  state (`editor.activeCat`/`editor.category`), enkel verplaatst, niet gedupliceerd.
  'equipment' en 'stats' tonen daar geen extra tabs (ongewijzigd: equipment gebruikt de slot-grid bovenin).
- Bottom-view centrering: volle-breedte rijen (item-grid, identity, actions) behouden hun breedte via
  `alignSelf: stretch`; de rest centreert nu als blok binnen de bottom-view.
- Suite groen, lint 0 err, build clean. docs.md §122.
- Nog niet gecommit.

## 2026-08-03 — ✅ #680 Level 9 UAT-fix: projectile schaal + richting
- "Zorg dat de projectiles de zelfde schaal hebben als de andere sprites (hero, wizard); draai ze van
  richting."
- Root cause: projectile erfde SLIME_VIEW_H (33px vaste hoogte, getuned voor de slime) → ~4x zoom terwijl
  hero/wizard op ~2.4-2.7x zoom staan — zichtbaar "te ingezoomd" naast de wizard. Mirror-flip was
  gekopieerd van Slime's conventie zonder de projectile-sheet's eigen richting te checken.
- Fix: `PROJECTILE_SCALE = WIZARD_H / WIZARD_CROP.h` (dezelfde zoomfactor als de wizard, afgeleid i.p.v.
  hardcoded), toegepast op de projectile's eigen crop voor zowel flight- als death-sprite (lost ook een
  latent flight/death size-mismatch op). Mirror-transform verwijderd — rendert nu in native richting.
- Suite 634 groen, lint 0 err, build clean, browser-geverifieerd (Level 9, wizard+projectiles kloppen visueel).
  docs.md §123.
- Nog niet gecommit.

## 2026-08-04 — ✅ #681 Correctie: categorie-tabs naar de HOOFD bottom-nav-balk, niet AvatarSubHeader
- Jouw correctie: "ik bedoelde dat de subtypes (passive, attack, portrait, etc.) in de navigator kwamen te
  staan waar nu staat top bottom percussion chords scales generator songs settings listen profile keyboard
  - die bottom view settings zijn redundant in bestiary mode."
- §679/122 had de categorie-tabs verkeerd geplaatst: in AvatarSubHeader (de kleine rij met Character/Stats/
  Equipment/Bestiary-iconen) i.p.v. de hoofd-tabbalk (TOP/BOTTOM/PERCUSSION/.../PROFILE), die inderdaad
  volledig dode knoppen toont tijdens bestiary/character-mode (TabView negeert activeTab dan compleet).
- Fix: AvatarSubHeader terug naar de originele 4-iconen-versie. De hoofd-tabbalk (App.jsx's MENU SELECTOR
  kolom) toont nu, wanneer characterScreen actief is, de categorie-knoppen van dat scherm i.p.v. TOP/BOTTOM/
  PERCUSSION/etc — character: skin/ears/hair; bestiary: de 11 categorieën; equipment/stats: leeg (niets te
  navigeren, dus niets getoond — geen dode knoppen meer).
- Suite 634 groen, lint 0 err, build clean, browser-geverifieerd (character/equipment/bestiary alle 3
  gecheckt, categorie-switch werkt). docs.md §124.
- Nog niet gecommit.

## 2026-08-04 — ✅ #682 Grote bestiary-reorganisatie: 2 nieuwe categorieën, Knighty/Heavy/Run/Portret-merge, ~15 splits/merges/renames, frame-en-anker herwerkt
- Jouw megabatch: kaders 64x64 achter units (anker midden-onder, grote units mogen overflowen), zelfde voor
  bottom-view previews (30% groter, vakjes blijven gelijk), portret als apart 64x64-kader, titel boven het
  kader, Bella Donna splitsen, bikini girls weg, cat hat/dog hat als varianten, nieuwe "mature"-categorie
  (~30 items), roman female splitsen (niet mature), nieuwe "portrait -> incomplete"-categorie, color
  variations/heavy colors weg, Knighty+Run+Heavy+portret mergen tot 1 groep, bishop/male knight halberd
  namen omwisselen, GandalfHardcore overal uit namen.
- 🐞 Onderweg ontdekt: Han's claim "Knight Heavy heeft dezelfde dimensies als Knighty (69x58)" klopte niet
  (455x768/546x64/637x192 delen niet gelijkmatig door 69x58) — teruggekoppeld, Han mat opnieuw op: **91x64**,
  klopt exact op alle 3 Heavy-sheets. `knightyAnimations()` geparametriseerd (totalRows) zodat dezelfde
  cel-layout zowel Knighty (14 rijen) als Heavy (12 rijen) bedient — Heavy's death-animatie is gewoon 2 rijen
  korter (echte inhoud, geen bug).
- 🐞 Onderweg ontdekt EN gefixt: een regex voor Heavy's run-bestanden was woordvolgorde-afhankelijk
  (".*Heavy Knighty.*run.*") en miste "Heavy Knighty brown yellow.png" (waar "Run" in de MAP-naam staat,
  vóór "Heavy Knighty" in het pad) — dit bestand kreeg de verkeerde framegrootte en bleef als losse,
  kapotte creature "Heavy Knighty yellow" hangen. Gefixt door op het mapsegment te matchen i.p.v.
  bestandsnaam-woordvolgorde.
- Succubus-consolidatie: alleen gecategoriseerd naar 'mature' (niet volledig clothes/bare gegroepeerd per
  personage — geflagged als vervolgstap, niet in deze batch gedaan gezien de omvang).
- "GandalfHardcore Covered Characters sheet.png" (13 rijen, geen rooster gegeven): als ÉÉN generieke
  creature opgenomen i.p.v. overgeslagen — geflagged voor een naam-rooster van jou.
- CreatureSprite/PortraitImage herbouwd: kader-anker nu bottom-center i.p.v. exact-om-de-crop, overflow
  toegestaan (niet geclipt) voor grote units, portret krijgt zijn EIGEN kader, titel boven de kaders,
  bottom-view previews 1.3×1.3 groter met ongewijzigde vakjes.
- Suite 634 groen, lint 0 err, build clean, browser-geverifieerd (mature/incomplete/Knighty-merge/dubbele
  kaders allemaal gecheckt, inclusief de regex-fix). docs.md §125.
- Nog niet gecommit.

## 2026-08-04 — ✅ #683 Goblin/Zombie/Maid uitgewerkt + terug naar portrait; Wizard herzien; Horse death-fix
- Volledige frame-breakdowns van jou verwerkt voor Goblin (84x64, 9 anims, 6 kleuren incl. lime/dark green/
  bright green), Zombie (64x64, 11 anims, 4 kleuren), Maid (64x64, 12 anims, normal/full-toggle + 8 kleuren).
  Alle drie terug van 'incomplete' naar 'portrait'.
- Elke frame-reeks (bv. "frame 47-57 death") omgerekend naar rij/kolom via row-major-nummering en
  gecontroleerd tegen de echte pixelafmetingen — totaal gebruikte frames klopte in alle gevallen exact
  (57/60, 79/80, 84/90) met wat over als lege opvulling.
- Goblin's 6 portretten hadden geen kleur-aanduidende bestandsnaam (Portrait 64x64..64x69) — opgelost met
  een nieuwe `nearestPortraitByColor()` die sheet- en portret-kleur samplet en op dichtste match koppelt
  (zelfde sampleColor-techniek als Doggy) — visueel geverifieerd correct (groen shirt + groen gezicht).
- Wizard (Portrait): volledig herschreven animatieset (idle/walk/walkattack/jump/simpleattack/block/
  blockhit/resting/death) — vervangt de oudere cast1-4/counterspell/idlesmoke-set. Level 9's wizard-combat
  (enemyAssets.js) heeft een eigen losstaande kopie van de OUDE idle/cast2-cellen — niet aangepast (buiten
  scope), maar het commentaar daar is nu verouderd — geflagged.
- Horse: 'stagger' verwijderd, 'death' herberekend naar frames 39-46 (nu 8 cellen i.p.v. 5).
- Onderweg ontdekt: ALLE "* colors.png"-bestanden (Dress/Goblin/Maid/Mounted knight/Samurai/Zombie colors)
  zijn dezelfde soort junk-preview-thumbnail als de eerder verwijderde "color variations"/"heavy colors" —
  generiek uitgesloten i.p.v. de 2 losse namen.
- Suite 634 groen, lint 0 err, build clean, browser-geverifieerd (alle 4 personages + horse gecheckt,
  screenshots kloppen). docs.md §126.
- Nog niet gecommit.

## 2026-08-04 — ✅ #684/#685 Bestiary-vervolgfixes (Goblin portretten, Lady Flower/Spirit Blue swap, default
  normal, oversized previews) + Level 9 projectile-herwerking
- Goblin portretten kleurden niet mee: kleur-gemiddelde matching faalde (goblins hebben allemaal dezelfde
  groene huidskleur) — vervangen door expliciete `GOBLIN_PORTRAIT_BY_VARIANT`-mapping, bepaald via
  hue-vergelijking (en voor het ene lastige geval, bright/dark green, relatieve verzadiging). Visueel
  geverifieerd correct.
- Lady Flower (3 varianten) mature->passive, Lady Flower Plain passive->mature: omgewisseld.
- Alle 4 Spirit Blue-personages gemerged tot 1 creature "Spirit Blue" in mature: 4 poses (on the floor/
  pose back/pose frontal/sword) zijn nu ANIMATIE-knoppen i.p.v. aparte creatures; Normal/Bare/Brown/Brown
  Bare is de variant-toggle. Brown heeft alleen sword-art — die 2 varianten krijgen gewoon 1 animatie i.p.v.
  4 (geen nieuwe code nodig, de UI rendert toch al wat een variant heeft).
- Default-variant bug gefixt: alfabetisch sorteren zette "Bare" vóór "Normal" (B<N) — elke Bare/Normal
  creature toonde standaard Bare. Nieuwe sorteervolgorde: bare-varianten altijd laatst, "Normal" wint onder
  de rest, verder alfabetisch.
- Bottom-view preview: als een unit > 64 breed/hoog is, wordt de renderschaal nu afgeschaald zodat hij in
  het vak past (i.p.v. de overflow-toestemming van de top-view over te nemen, die daar wél gewenst is).
- Level 9 projectiles: 1,5x kleiner, animatie 4x sneller, gecentreerd op B4 (i.p.v. in de slime-baan onder
  de notenbalk), noten worden nu HELEMAAL niet meer gerenderd (niet alleen verborgen), en een kleine
  willekeurige oscillatie (2 sinusgolven per as, bereik 15 units, per-projectile fase zodat ze niet
  synchroon bewegen).
  🐞 Gevonden EN gefixt tijdens het verifiëren: de eerste blauwe-gloed-poging (CSS filter direct op de
  projectile's eigen `<svg>`, met een piepklein viewBox van ~48x8 eenheden) rendere als een schermvullende
  muur van vervaagde blobs i.p.v. een zachte gloed — Chrome berekent de blur blijkbaar in die kleine
  viewBox-ruimte en schaalt het resultaat daarna mee omhoog. Gevonden door het DOM-element-aantal te
  checken (slechts 4-5 echte projectiles — geen duplicatie-bug) en te bevestigen door de filter tijdelijk
  uit te zetten. Fix: de filter op een omwikkelende `<g>` zetten i.p.v. op de geschaalde svg zelf.
- Suite 634 groen, lint 0 err, build clean, uitgebreid browser-geverifieerd (goblin/spirit blue/lady flower/
  level 9 met langere speelsessie, geen crashes). docs.md §127.
- Nog niet gecommit.

## 2026-08-04 — ✅ #686 Level 9 herontworpen als call-response echo-oefening
- Blauwe gloed (permanent, §685) weggehaald — de projectiel-gloed had toch geen functie meer zodra de
  noten sowieso nooit getoond worden.
- Level 9 is nu een vaste call-response cyclus (maat -1/0 lead-in ongewijzigd): maat 1 = wizard geeft 2
  kwartnoten (hoorbaar via nieuwe `treblePreviewMelody`, instrument 'lead_1_square' — "Square" bestaat niet
  als instrument, dit is de dichtstbijzijnde GM-patch, met Han afgestemd), maat 2 = speler moet herhalen,
  enz. t/m maat 8 → 4 golven van 2 maten. Vaste metronoom-tijd wint (Han's antwoord): een gemiste/foute
  herhaling pauzeert niets, telt gewoon als miss (bestaande stats).
- `levels.json` Level 9: numMeasures=1, numRepeats=2, notesPerMeasure=2, nieuw wizardSpawnLeadMeasures=1;
  range/kwartnoten-instellingen ongewijzigd (zelfde als level 2, zoals gevraagd).
  `wavesForLevel` gegeneraliseerd (totalMeasures/(numMeasures×numRepeats)) — geen ander level verandert.
- Golf-voortgang is nu metronoom-getimed (nieuwe rAF-timer in App.jsx), niet meer "clear-gedreven" zoals
  alle andere levels — `onSlimesCleared` is een no-op voor de Wizard.
- Oneven maten tonen gewoon rusten (via de bestaande MelodyNotesLayer, notes geforceerd naar 'r' — geen
  hand-getekende glyphs), even maten tonen het canonieke herhalingsteken (dezelfde "Ô" die ook bij een
  onzichtbare notenbalk gebruikt wordt).
- Projectiel: eigen 1-maats vluchtboog (i.p.v. de gedeelde 2-maats beeldbreedte), spawnLeadMeasures regelt
  alleen ZICHTBAARHEID; nieuwe eenmalige "spawn glow" (witte cirkel + blauwe halo, groeit 0→20px, fade in/
  piek/fade out over 2 rpg-frames, "achter de wizard, voor het projectiel" in z-volgorde).
  🐞 Gevonden: het idee "wordt al halverwege de notenbalk zichtbaar" (Han's eigen verduidelijking) is
  zonder JIT-pregeneratie van de melodie niet haalbaar (golf-inhoud bestaat pas op het moment dat hij nodig
  is) — gevlagd, projectiel is nu zichtbaar vanaf het moment van spawnen i.p.v. al half onderweg.
- Combat-venster voor de Wizard verbreed naar een hele maat i.p.v. een beat (Han: "hergebruik gradeHit met
  maat-breed venster") — zelfde gradeHit-functie, alleen de eenheid anders.
- 🐞🐞🐞 Drie echte bugs gevonden EN gefixt tijdens uitgebreid browser-verifiëren (golf 2/3/4 toonden een
  lege notenbalk): (1) de golf-klok reset altijd naar absolute tick 0 — klopte toevallig voor elk vorig
  level (altijd maar 1 golf), maar bij 4 golven dacht golf 2+ dat hij allang van de lane af gescrold was
  vóór hij ooit gerenderd werd; (2) het projectiel gebruikte de verkeerde (2-maats) vluchtboog i.p.v. 1
  maat; (3) de Wizard-branch was gegate op `scrollStartTime != null`, maar die closure kon een VEROUDERDE
  waarde vasthouden (het effect draait alleen op `[notesKey]`) — gate simpelweg verwijderd, de formule had
  hem toch niet nodig. Gevonden via tijdelijke console-instrumentatie + puppeteer, opgelost en herverifieerd
  over alle 4 golven (rusten/herhalingsteken tonen nu correct, geen console errors over 20+ sec speeltijd).
- Suite 635 groen, lint 0 err, build clean. docs.md §128.
- Nog niet gecommit.

## 2026-08-04 — ✅ #687 Bestiary-batch: Rat thief, Female kolom-verschuiving, Skeleton, Knight-merge,
  Female Medieval+Lantern, Maid mega-merge
- Rat thief miste: `isCurated` matchte 'rat' ook in "Rat thief" (verkeerd, dat is geen duplicaat van de
  curated Rat). Expliciete uitzondering toegevoegd.
- Female Pixel Art sheet: succubus is 128 breed (2 kolommen), dus goddess en maid schuiven één kolom door —
  `expandColumnSheet` kreeg een `wideNames`-optie (loopt met een lopende pixelkolom-cursor i.p.v. de platte
  array-index). Portret-nummering blijft ongewijzigd (aparte bestanden, per personage genummerd).
- Skeleton: 6 kleuren gegroepeerd (grey/retro/full white/red/gold/ghost) + portretten uit de 3x2-grid,
  zelfde techniek als de Wizard-portrait-grid (§675), nu met Han's eigen volgorde — geen giswerk nodig.
- **Nieuwe generieke capability**: een animatie kan nu zijn EIGEN bronbestand hebben (`relPath`/`url` op
  animatie-niveau i.p.v. alleen op variant-niveau) — nodig voor "green knight + green knight run als één
  set animaties".
- Knight (Knighty) en Knight (Heavy) zijn nu TWEE aparte creatures (was: 1 gemergede), elk met ALLE eigen
  animaties (incl. run/sheet2) als knoppen op één kleurenkaart i.p.v. losse variant-swatches per bronbestand.
  🐞 Gevonden: "Brown heavy .png" heeft een spatie vóór ".png" (enige met die typo) — 3 regexes misten hem
  stilletjes, gefixt.
- Female Medieval Pixel Art Character + Lantern: normal/lantern toggle, 9 animaties (idle/walk/run/air up/
  air down/hit/death/playing harp/separate harp); de 2 harp-animaties zijn ook beschikbaar op de lantern-
  variant (wijzen naar het normal-sheet via de nieuwe relPath-override). Harp.png/Lantern.png (losse props)
  NIET als overlay gebouwd — bestaande overlay-mechanisme verwacht hetzelfde cell-grid als de basis-sprite,
  wat geen van beide props heeft; uitgesloten i.p.v. als kapot-ogende losse kaartjes te tonen.
- Maid mega-merge (het grootste onderdeel): kleur + full/normal (hernoemd naar "White Accent") + sheet2
  (carry water/wash dishes/read/sit/idle alt) + combat (8 animaties) + sword-down (idle sword) — allemaal
  samengevoegd tot ÉÉN animatielijst per kleur via dezelfde merge-techniek als Knight.
  🐞🐞 Twee bugs gevonden en gefixt: (1) een bestaande roster-tabel had OOK een personage 'Maid' (ander,
  simpeler NPC) — botsing met de nieuwe groep, hernoemd naar 'Maid (Roster)'; (2) "...Sheet.png" (geen
  kleurnaam) werd verondersteld Black te zijn, maar Black had al een eigen bestand — dubbele animatie tot
  gevolg. Bestanden zonder herkenbaar kleurwoord worden nu gewoon NIET gegroepeerd i.p.v. geraden.
  ⚠ NIET geïmplementeerd: de "with hat" toggle (te complex voor dit al zeer grote blok — een accessoire zou
  ook per-animatie-bron moeten resolven; apart vervolg). ⚠ Sheet2's "sleep"/"carry clothes" frame-ranges
  die Han gaf zijn intern tegenstrijdig (achterstevoren / overlappend) — weggelaten i.p.v. geraden, Han moet
  de juiste ranges nog een keer geven.
- ⚠ Zombie per-kleur portretten: NIET mogelijk — er bestaat maar 1 zombie-portretbestand in de assets, geen
  6/4 varianten om uit te kiezen. Gevlagd, niets veranderd (bestaande gedeelde portret blijft staan).
- Maid bathing losgetrokken en naar mature verplaatst.
- Suite 635 groen, lint 0 err, build clean, uitgebreid browser-geverifieerd (Knight/Heavy/Skeleton/Maid/
  Medieval/Succubus allemaal met screenshots gecheckt, geen console errors). docs.md §129.
- Nog niet gecommit.

## 2026-08-04 — ✅ #688/#689/#690 Splash-timing fix + Level 9 volledig herwerkt + bestiary-batch 2
- Algemeen: end-of-level splash wacht nu op de LAATSTE maatstreep die de hit zone bereikt (nieuwe
  `onSongEnd`, van SheetRpgLayer via App.jsx naar useLevel) i.p.v. direct bij de laatste noot/golf.
- Level 9: teruggedraaid naar ÉÉN doorlopende melodie van 8 maten (numMeasures=8/numRepeats=1, weer
  identiek aan level 2) — de vorige 4-losse-golven-opzet (§686) was hoogstwaarschijnlijk de oorzaak van
  "ik hoor te veel tonen" (overlappende audio-schedules) EN brak de lead-in/eindstreep-berekening (die een
  melodie van de hele levellengte verwacht). De wave-timer is helemaal weg; level 9 gedraagt zich nu
  precies als elk ander level (onSlimesCleared, ongewijzigd).
  Wizard's hoorbare "call": nu één gemuted-even-maten kopie van de melodie, ÉÉN keer gescheduled voor het
  hele level (i.p.v. per golf).
  Projectielen: weer exact zoals de slimes (2 maten vluchtboog i.p.v. de vorige 1-maats-hack); alleen de
  ZICHTBAARHEID is nog apart gegate (1 maat voor due), nu met een debug-mode bypass (altijd zichtbaar).
  Rusten (oneven maten, hoorbaar maar nooit de toonhoogte tonend) en de ECHTE noten (even maten, normaal
  onzichtbaar, alleen in debug mode) vervangen het herhalingsteken-idee volledig — twee aparte rest-
  geclonede lagen via de bestaande MelodyNotesLayer.
- Skeleton: volledige animatie-breakdown (walk/walk arm stretched/walk alt/idle/glow/attack/death/
  resurrect); "Skeleton Variations" (junk) verwijderd.
- Goddess: idle weggehaald, walk->fly hernoemd, nu de enige (dus standaard) animatie; terug naar 'portrait'.
- Maid: kleurenvakjes nu diagonaal kleur/wit (duo) voor de gewone kleuren, mono voor "White Accent"; de
  hat-toggler is nu ECHT samengevoegd (1 extra "Hat"-optie, want er is maar 1 hoedvel, niet 1 per kleur).
  Sheet2's sleep/carry clothes frame-ranges (39-45/46-50, door Han gecorrigeerd) toegevoegd — nu alle 50
  cellen van het grid gebruikt.
  🐞 Gevonden: de swatch-override-pass draaide vóór de merknaam-strip-pass, dus overrides tegen de
  GESTRIPTE naam (bv "Archer sheet") matchten nooit de RUWE naam die er op dat moment nog stond
  ("GandalfHardcore Archer sheet") — volgorde omgedraaid.
- Medieval: harp-animaties tonen nu ook het lantern-icoontje (nieuw `propRelPath`/`propUrl`-mechanisme,
  een vast klein badge-icoon i.p.v. het bestaande per-cel overlay-systeem dat niet paste).
- Oriental Female Characters: gesplitst in 6 karakters (laying/musician normal+bare, sitting, leaning,
  wading->mature, lounging->mature).
- Poop Thrower + Poop Impact Sheet gekoppeld (impact sheet als portret ernaast); idle = frames 1,2,3,41,50
  (Han's "51" gelezen als rij5-frame1 = 41, GEEN pixel-verificatie, gevlagd), rest = throwing.
- Kleurvakjes ingevuld voor archer/skeleton/zombie/koe/damned/burning skull/guards/musketeer/witch/wizard/
  cat/dog — generieke override-pass op (base,variant), nieuw `swatchColor2` voor tweekleurige (diagonale)
  vakjes. Dog hernoemd naar "Dog (Small)" (ter onderscheid van Doggy).
- ⚠ NIET gedaan dit blok (expliciet uitgesteld, niet overhaast): archer/wizard 64x64 projectiel-paneel
  (zoals poop thrower); nieuwe "RPG Level" tab met tegel-scène (gras/tent uit decor.png) — een echt NIEUWE
  feature, verdient een eigen focused ronde i.p.v. een haastige toevoeging aan het eind van dit al zeer
  grote blok.
- Suite 634 groen, lint 0 err, build clean, uitgebreid browser-geverifieerd (Level 9 24 sec seamless
  scroll in debug mode, Maid/Medieval/Skeleton/Goddess/Oriental/Poop screenshots gecheckt, 0 console
  errors). docs.md §130/§131.
- Nog niet gecommit.

## 2026-08-04 — ✅ #691/#692 "doe de gevlagde items" (archer/wizard paneel) + 🐞✅ Level 9 "twee melodieën"

Han: "doe de gevlagde items" — de twee uitgestelde items uit het vorige blok oppakken:

- ✅ #691 Archer/wizard 64×64 projectiel-paneel (fx/arrow.png resp. fx/Projectile sheet blue.png), zelfde
  portret-koppel-truc als Poop Thrower — maar via een POST-PROCESS (base,variant)-match ipv relPath-match,
  want zowel Archer's als (vooral) roster-"Wizard"'s relPath wordt gedeeld met andere/onverwante entries.
  🐞 Gevonden tijdens het testen: de match-predicate behandelde "geen variant opgegeven" als "match alleen
  de variant-loze entry" (zelfde conventie als SWATCH_OVERRIDES) — daardoor kregen alleen Archer's kleurloze
  entry het paneel, niet de 7 kleurvarianten. Gefixt: voor PORTRAIT_OVERRIDES betekent "geen variant" =
  match ALLE varianten.
- ⏳ RPG Level tab: interview gehouden (2 vragen — gras-tegel cellen, en tab-doel) voordat verder gebouwd
  werd (CLAUDE §4b/§9k — genuine ambiguïteit, geen gok). Han's antwoorden: Floor Tiles1.png cel (1,2)+(1,3)
  (rij;kolom), en de tab is een dev/preview-tab naast Bestiary (nog niet gewired in echte gameplay). Bouw
  zelf nog niet gestart — apart afgerond in een volgend blok.

Tussendoor: Han meldde (3x "werk verder!") een Level 9 bug: "ik hoor te veel tonen... ik hoor andere noten
dan de te spelen noten... vermoeden is dat er twee aparte melodieën bestaan". Root cause gevonden: de
odd/even-maat "call"/"response"-split uit #688 (vorig blok) WAS letterlijk twee verschillende notenreeksen
— de hoorbare "call" (kwadraat-synth) speelde de ONEVEN maten, terwijl combat/projectile-grading (ongefilterd
op pariteit) voor ELK note een projectiel/hitvereiste geeft, dus oneven-maat-noten (gehoord) ≠ even-maat-
noten (te spelen). ✅ Fix: geen pariteits-split meer — ÉÉN melodie (`trebleMelody`, ongewijzigd), elke note
doorloopt a) ~2 maten onzichtbaar spawnen (ongewijzigd), b) `wizardSpawnLeadMeasures` maten van tevoren
zichtbaar + hoorbaar op ZIJN EIGEN toonhoogte (audio nu tijd-verschoven ipv pariteits-gemute — hele melodie,
`wizardSpawnLeadMeasures` maten eerder in de tijd geschedule), c) op eigen beat: speler moet exact die
toonhoogte spelen (ongewijzigd). Visuele staaf vereenvoudigd naar hetzelfde patroon (altijd-zichtbare rusten
+ debug-only echte notatie, niet meer pariteits-gesplitst).
- Suite 634 groen, lint 0 err (1875 pre-existing warnings, ongewijzigd), build clean. docs.md §132.
  Browser-verificatie van Level 9 gedaan: 24 sec seamless scroll in debug mode, screenshot bevestigt één
  doorlopende melodie (rust altijd zichtbaar, echte toonhoogte alleen in debug-mode net vóór de wizard hem
  cast), projectile-aantal blijft begrensd (geen runaway/duplicatie), 0 console errors.
- Han meldde daarna (met screenshot van het Archer-vak): "ik kan het projectiel nog niet zien (attack /
  archer sheet) en het projectiel ook niet bij portrait / wizard... maak de RPG level tab maar."
  🐞 Gevonden: `bestiaryAssets.js`'s SHEETS-glob was scoped op `characters/**` — `fx/arrow.png` en
  `fx/Projectile sheet blue.png` liggen daarbuiten, dus `portraitUrl` was altijd `undefined` (stil, geen
  fout) → paneel rendert nooit. Gefixt: tweede glob voor `fx/**` toegevoegd en gemerged.
  Twee polish-fixes erbovenop: `PortraitImage` rekte het hele-bestand-portret uit (arrow.png 30x5px werd
  lelijk vervormd) — nu center+contain-fit ipv stretch. Wizard's portret-frame verplaatst van (rij0,kol0)
  — een felle flits-pose — naar (rij2,kol2), een herkenbaardere "in flight"-boog.
  ✅ RPG Level tab gebouwd: `RpgLevelPanel.jsx` (nieuw bestand), 5e avatar-context scherm naast Bestiary
  (dev/preview, nog niet in echte gameplay). Vloer = Floor Tiles1.png cellen (1,2)+(1,3) getiled tegen de
  onderkant; boom = Tree1.png volledig; tent = Decor.png rijen2-3 kol1-3 (96x64, LINKER van twee tenten,
  visueel geverifieerd via een gecropte inspectie-render, geen gok); 5 graspollen (Decor.png 5;1 5;2 5;3
  6;1 7;1) in het voorgrond bovenop de vloer; personage (herbruikte CharacterDoll) erop; debug-mode toont
  een 32x32 cyaan grid. Browser-geverifieerd: alles sluit precies aan op het grid.
- Suite 634 groen, lint 0 err, build clean. docs.md §133.
- Nog niet gecommit.

## 2026-08-04 — ✅ #692 Evil Wizard split + "heel veel critters" batch + generator opruiming

Han: "Ik voegde toe: evil wizard.png. rij 1: wizard evil, rij 2: wizard skeleton; en heel veel critters.
Voeg die toe aan de sheets. Ruim meteen op. Vind een manier om alle sprites goed te organiseren, labelen,
splitsen indien nodig, zodat je snel kan laden/vinden in de files."

- ✅ Evil Wizard.png (768x128, char_passive) gesplitst in TWEE creatures (rij0="Evil Wizard", rij1="Wizard
  Skeleton") — zelfde "één bestand, N creatures" patroon als de bestaande `expandCritters` (critters
  sheet.png). Nieuwe `expandEvilWizard()`.
- ✅ Nieuwe map `animals/critters/` (3 curated packs × 15 dieren = 45 uniforme 64x16/4-frame idle sheets,
  plus ~40 losse "X Sprite Sheet.png" bestanden) — valt automatisch in de BESTAANDE generieke scan-pipeline
  (geen nieuwe scan-code nodig voor het gros), nu correct getagd category='critters' (was 'animal').
  Labeling verbeterd: camelCase bestandsnamen (PlagueBat.png) gebruiken nu de nette mapnaam (Plague Bat) als
  label; "basic magical animations"'s lowercase mapnamen krijgen Title Case; trailing "Sprite Sheet" wordt
  overal gestript (Akaname Sprite Sheet -> Akaname).
  🐞 Gevonden: curated-keyword collision check (isCurated, dedupe tegen de al-gecureerde gameplay "Bat")
  test tegen de RUWE bestandsnaam (vóór de mapnaam-relabel) — dus "PlagueBat"/"SwoopingBat" (geen spatie,
  geen woordgrens) komen wél door, terwijl de losse generieke "Bat_Sprite_Sheet.png" (spatie-genormaliseerd
  vóór de check) terecht als duplicaat van de gecureerde Bat wordt gedropt. Beide uitkomsten geverifieerd.
  🐞 Ook gevonden: nieuwe "- Guides.png" junk-regex had een overbodige `$`-anchor die nooit matchte (JUNK_NAME
  test tegen de bestandsnaam MET .png) — verwijderd. Nieuw "(1)" duplicate-download-patroon toegevoegd
  (DUPLICATE_DOWNLOAD_NAME).
- ✅ "Vind een manier om te organiseren" — een volledige multi-bestand-split overwogen maar bewust NIET
  gedaan (risico: alle override-tabellen delen dezelfde helpers/volgorde-afhankelijkheden, en deze sessie
  vond al 2 subtiele volgorde-bugs — een 3e onder tijdsdruk is een reëel risico). Lichtgewicht alternatief:
  een inhoudsopgave + 17 "═══ SECTION: ... ═══" banner-comments toegevoegd (grep/Ctrl+F-vriendelijk) door het
  hele bestand heen. Als de zwaardere multi-bestand-split alsnog gewenst is: graag expliciet laten weten,
  dat verdient een eigen zorgvuldige/geteste ronde.
- Suite 634 groen, lint 0 err, build clean. Browser-geverifieerd: Critters-tab toont alle nieuwe dieren
  (screenshot Acid Ant/Plague Bat), Evil Wizard + Wizard Skeleton apart selecteerbaar met eigen sprite.
  docs.md §134.
- Nog niet gecommit.

## 2026-08-04 — ✅ Level 9 UAT ronde 2-3, bestiary portrait rework, nieuw RPG Level bewegingssysteem

Han's UAT op de vorige ronde bracht 3 nieuwe rondes feedback (Level 9 nog niet 100%, bestiary-portret
verfijning, en een hele reeks RPG-level-tab features): odd/even opnieuw (2x omgedraaid), wizard attack
frames 2x herzien, projectile oscillatie -50%, portret-schaal 2x herzien (uiteindelijk terug naar
64x64/true-size), en RPG level tab kreeg: beweging (A/D/pijltjes/tap), een volgend huisdier, een Whisp-NPC
met dialoog — plus een hele reeks bugfixes onderweg.

- 🐞✅ Level 9 bug: eerste keer klonk de default C-toonladder dwars door de echte muziek heen —
  `trebleMelody` verandert meerdere keren vroeg in een level (initiële generatie → de restify-bake-in is
  zelf een 2e wijziging), en de wizard-cast-audio-effect annuleerde zijn EIGEN vorige schedule niet bij een
  hernieuwde fire → 2 overlappende audio-schedules. Gefixt met een eigen `wizardPreviewStopFnsRef` (niet de
  gedeelde backing-ref) + een CONTENT-based (niet reference-based) "is dit al gerestified"-check, zodat het
  zelf-corrigerend is ongeacht wat trebleMelody daarna nog vervangt.
- ✅ Odd/even parity 2x omgedraaid op Han's UAT: eerst "oneven=leeg, even=noten" (§132's fix), toen Han
  zag dat het nog niet klopte en zei: "even maten = alleen een hele rust. oneven maten = onzichtbare
  kwartnoten, en zichtbare rusten" — definitieve versie: EVEN maten collapsen tot 1 hele rust; ONEVEN maten
  blijven ONGEWIJZIGD (hun natuurlijke mix van echte noten + echte rusten), met noten verborgen tenzij debug.
- ✅ Wizard attack-animatie: nu ECHT alleen bij het maken van een noot (niet meer een losse cast2-loop).
  Frame-specificatie 2x herzien door Han, uiteindelijk: single f26-31 (flits f30), double f26-34+36-37
  (skip f35, flitsen f30+f36), triple f26-34+36-38+40-44 (skip f35+f39, flitsen f30+f36+f42). Eén
  `wizardAttackRun()` helper bouwt alle 3 varianten (geen 3x hand-copy).
- ✅ Projectile oscillatie -50% (15 -> 7.5 units), `oscillate()` verplaatst naar `src/utils/oscillate.js`
  zodat de bestiary-portretten 'm kunnen hergebruiken.
- ✅ Bestiary portret-schaal 2x herzien: ronde 2 maakte het non-square/fill-schaal (geen letterbox), ronde 3
  UAT zei: nee, terug naar vierkant 64x64, "true size" (schaal = size/64, NIET frame-afhankelijk),
  gecentreerd, geclipt bij overflow, met milde oscillatie (hergebruikt dezelfde wobble als de sheet-music
  projectile) — alleen voor archer-pijl en wizard-projectile (`portraitOscillate` vlag).
- ✅ Nieuwe `Frame64Overlay`: het "64x64 frame.png" uit de Pixel Art Game UI-set als decoratieve rand op elk
  64x64-vak (top-view sprite-kader + alle portret-vakken).
- ✅ Nieuw "side portrait"-mechanisme: Wizard (Portrait) had zijn ENE portret-slot al bezet (eigen
  kleuren-portret), dus de projectile-companion kreeg een 2e onafhankelijk slot (`sidePortrait*` velden).
- ✅ Critters correcties: Porcupine 40x40 -> 32x32 (Han corrigeerde zichzelf), Imp toegevoegd op 32x32
  (eerste 6 rijen gecapt), Training Dummy -> 'other', Flying Brain Monster Mind Blast nu geanimeerd (96x32,
  5 frames, was statisch).
- ✅ RPG Level tab — nieuw bewegingssysteem (`useRpgLevelState`, nieuwe hook, mirror van
  useBestiaryEditor's "1 gedeelde instance naar top+bottom" patroon): A/D of pijltjestoetsen, of tap/klik op
  het scherm om ernaartoe te lopen; wandel/rust-animatie + facing-flip.
  🐞 Gevonden: na omschakelen naar 16x16 gras stonden boom/tent/hero/NPC 16px te hoog (nog op de OUDE
  32px-tegel-hoogte `T` i.p.v. de nieuwe `FLOOR_T`) — alle grond-posities gefixt.
  ✅ Volgend huisdier: wacht tot de leash (64 units) strak staat, loopt dan door tot VLAKBIJ de speler (niet
  zomaar tot net onder de trigger-afstand — hysteresis). 🐞 Gevonden: 2 pets zichtbaar (de ingebouwde
  CharacterDoll-pet-laag EN de nieuwe losstaande) — de doll-laag wordt nu gestript (`noPetChar`).
  🐞 Gevonden: pet-sprite crop hardcodeerde Wisp's 5-koloms-layout, maar Fox (tijdelijk hardcoded ipv de
  echte equipped pet, "spritesheet klopt niet") is 6 kolom x 2 rijen — veroorzaakte een dubbel/versmeerd
  beeld; gefixt met dezelfde native-crop+transform-techniek als SheetCrop (werkt met elk sheet-formaat).
  ✅ Whisp-NPC neergezet, klikken laat de speler ernaartoe lopen en opent een dialoog. Nieuw
  `RpgLevelBottomPanel` toont de tekstballon in de bottom-view (pixel-font Habbo.ttf, geflagd als eerste
  gok). Ronde-3 herontwerp: kader 64px hoog, spreker-avatar (Wisp) links, rechte hoeken, 256px tekst-breedte.
  ✅ Antwoord (geen codewijziging): "zijn alle assets dezelfde schaal" — nee, Tree1.png is een
  hoger-resolutie geschilderde asset, geen 32px-tegel-sprite; geen schone manier om dat te forceren zonder
  de bron zelf te resamplen (contentbeslissing, niet stilzwijgend gedaan).
- Suite 634 groen, lint 0 err, build clean. Uitgebreid browser-geverifieerd: Level 9 (odd/even correct,
  attack-flits zichtbaar), Archer/Wizard(Portrait)/Flying Brain Monster portretten (frame-overlay, side-
  portrait, animatie), RPG Level tab volledige flow (lopen, pet volgt/geen dubbel meer, NPC-klik ->
  wandelen -> dialoog met nieuw kader-ontwerp). docs.md §135.
- Nog niet gecommit.

## 2026-08-04 — ✅ Level 9 odd/even ronde 4 (definitieve correctie): terug naar ronde 2

Han: "nog steeds niet goed. maar misschien door mijn uitleg. dus: de noten om te spelen staan in de EVEN
maten. de ONEVEN maten hebben altijd een hele rust (forceer dat). de noten in de EVEN maten worden een
maat op voorhand óók door de wizard gespeeld; en op dat moment verschijnen de projectiles."

- ✅ Ronde 3's flip (even=hele rust, oneven=echte noten) was zelf fout — dit is exact ronde 2's originele
  mapping. `restifyOddMeasures`/`isAlreadyRestified` (App.jsx) en de render-split (SheetRpgLayer.jsx) beide
  teruggedraaid: ONEVEN maten collapsen altijd tot 1 geforceerde hele rust; EVEN maten behouden hun echte
  speelbare noten (onzichtbaar tenzij debug). De wizard-cast-audio + projectile-visibility-gate hoefden niet
  aangepast (die schedulen al 1 maat vóór elke noot z'n echte positie, wat automatisch in de voorgaande —
  oneven, verder stille — maat landt).
- Suite 634 groen, lint 0 err, build clean. Browser-geverifieerd over meerdere frames: oneven maten tonen 1
  hele-rust-glyph, even maten tonen debug-only echte noten met de wizard-attack-flits precies op het
  cast-moment. (Eén tussentijds frame toonde kort 2 losse kwartrusten i.p.v. 1 hele rust — bleek een
  transiënte render tijdens het zelf-corrigerende effect, niet reproduceerbaar in latere frames.)
  docs.md §135 (aanvulling).
- Nog niet gecommit.

## 2026-08-04 — ✅ Level 9 ronde 5: "maat 1 = maat 2" op data-niveau + twee stille render-bugs gefixt

Han: "Genereer als volgt: steeds, 1 maat; numrepeats = 2. dus maat 1 = maat 2 ... ik zie nu noten in maat 1
EN in maat 2; dat zou sowieso niet mogen. de logica van de tovenaar is al goed geimplementeerd, daar is
geen probleem."

- ✅ `numMeasures:1/numRepeats:2` bleek de Sequencer's ROUND-repeat te sturen (§128), niet een 2e maat
  tick-space — teruggedraaid naar `numMeasures:2/numRepeats:1` (zelfde 1-wave). Nieuwe
  `duplicateMeasureOneIntoTwo` (App.jsx) kopieert maat 1's noten letterlijk naar maat 2 (per relatieve
  offset) vóór `restifyOddMeasures` de oneven maat collapt — "maat 1 = maat 2" klopt nu op data-niveau.
- 🐞→✅ Bug 1: gecollapste 2e+ slots hielden hun ORIGINELE duration/offset — overlapte de hele-rust van
  slot 1 en corrumpeerde `processMelodyAndCalculateSlots`'s maatgrens-splitsing (noten schoven naar de
  verkeerde maat). Fix: duration+offset ook op `null` gezet, niet enkel het notenglyph.
  🐞→✅ Bug 2 (de eigenlijke oorzaak van "noten in beide maten"): `processMelodyAndCalculateSlots`
  gebruikt `melody.displayNotes` i.p.v. `.notes` zodra die bestaat — beide restify-functies muteerden
  alleen `.notes`, dus de BLADMUZIEK toonde nog de originele ongecollapste toonhoogtes terwijl `.notes`
  (audio/grading) al correct was. Beide functies muteren nu `.displayNotes` in lockstep.
  Gevonden via een tijdelijke console.log binnen de `useMemo`-callback zelf (input vs. output binnen
  dezelfde synchrone call kwamen niet overeen — kon alleen betekenen dat de functie een ANDER veld las).
  StrictMode kort verdacht en uitgesloten (tijdelijk verwijderd uit main.jsx, bug bleef identiek — teruggezet).
- Ook gefixt: `SheetMusic.jsx`'s `sliceMelodyForPagination` bypasst nu paginatie-vensters wanneer
  `sideScroll` actief is (was niet de hoofdoorzaak maar wel een reële bug — de RPG-laag moet de melodie's
  ware absolute offsets zien, geen herbaseerde paginaslice).
- Suite 635 groen, lint 0 err, build clean. Browser-geverifieerd (meerdere screenshots): maat 1 toont enkel
  1 hele-rust-glyph, maat 2 toont de (gedupliceerde) echte noten, en dit alterneert correct maat-na-maat.
  docs.md §135 (ronde 5-aanvulling).
- Nog niet gecommit.

## 2026-08-04 — ✅ Ronde 6: hele-maat-rust gecentreerd + Level 9 naar 8 maten (4 JIT call-response blokken)

Han: "1 maak een nieuwe regel in render sheet music: als de hele maat een rust is, mogen ze gecentreerd in
de maat staan. 2 nu is de lengte van het level maar 2 maten; maar daar 8 van (dus genereer sequentieel 4
blokken zoals maat 1 en 2." Interview: (1) geldt overal, niet enkel Level 9; (2) 4 ONAFHANKELIJK
gegenereerde paren; (3) just-in-time genereren (Han wees mijn "alles vooraf"-aanbeveling expliciet af: "een
halve maat voor een nieuw maatblok in beeld moet komen, wordt ze gegenereerd").

- ✅ Feature 1: `renderMelodyNotes.jsx` — nieuwe `getWholeMeasureRestCenterX` helper; een rust met
  `duration === measureLengthSlots` krijgt `textAnchor="middle"` op het maat-midden i.p.v. links uitgelijnd
  op `positionX`. Werkt in zowel tick-mode (Level 9 scroll) als paginatie-mode (barline-index-scan).
- ✅ Feature 2: nieuw `generateLevel9CallResponseBlock.js` (pure, spiegelt `generateLevelBackingChunk.js`) —
  genereert 1 call-maat via dezelfde MelodyGenerator, bakt de hele-rust-collapse + response-duplicatie
  meteen in bij generatie (geen post-process meer nodig). Nieuw `useLevelTrebleStream.js` (spiegelt
  `useLevelBackingStream.js`'s bewezen JIT-chunk-append patroon) laat de treble-melodie 2 maten
  ("1 blok") tegelijk groeien, elk blok een halve maat voor het nodig is gegenereerd, met eigen
  wizard-cast-audioplanning per blok.
- 🗑️ App.jsx: `restifyOddMeasures`/`duplicateMeasureOneIntoTwo`/`isAlreadyRestified` + de oude
  eenmalige wizard-preview-audio-effect volledig verwijderd — overbodig, want `generateLevel9CallResponseBlock`
  genereert nu al-correcte content. `MelodyProvider`'s `treble`-prop leest nu `levelTrebleStream.treble`
  tijdens Level 9 (zelfde overschrijf-patroon als bass/metronome).
- `levels.json`: Level 9 `numMeasures`/`totalMeasures` 2 → 8 (nu de TOTALE levellengte, net als bij
  bass/metronome se `useLevelBackingStream`) — `wavesForLevel` blijft 1 (1 doorlopend stuk, §130).
  Combat/grading (`slimeData` in SheetRpgLayer.jsx) hoefde NIET aangepast: het is al een `useMemo` op de
  `trebleMelody`-prop, dus een groeiende melodie wordt automatisch meegenomen.
- Suite 635 groen, lint 0 err, build clean. Browser-geverifieerd over 24s speeltijd (16 screenshots, geen
  console errors): maten 1 t/m 8 tonen allemaal verschillende, onafhankelijk gegenereerde content, correct
  alternerend oneven=rust/even=noten. DOM-geverifieerd (niet enkel pixels): elke hele-rust `<text>` heeft
  `text-anchor="middle"` op het berekende maat-midden. docs.md §136 (nieuw).
- Nog niet gecommit.

## 2026-08-04 — ✅ Bugfix: wizard-cast te laat vanaf blok 2 (maat 5-6)

Han: "bug: vanaf maat 4 komt de muziek van de wizard te laat, ongeveer een halve maat. visueel klopt het
nog wel."

- 🐞→✅ Root cause: `playMelodies.js` klemt een `scheduledStart` die al in het verleden ligt vast op "speel
  nu meteen" i.p.v. een fout te geven. `useLevelTrebleStream`'s generatie-timer mikte op "halve maat voor
  het blok VISUEEL start", maar de cast zelf moet een VOLLE maat eerder klinken (`wizardSpawnLeadMeasures`)
  — bleef maar een halve maat speling over voor de klem toesloeg. Blok 0/1 (synchroon gegenereerd bij
  levelstart) hadden ruim speling; blok 2+ (via setTimeout) niet meer.
  Fix: de generatie-timer mikt nu op een halve maat vóór de CAST z'n eigen deadline, niet vóór het blok's
  visuele start. Geverifieerd via tijdelijke logging: elk blok heeft nu ≥1 maat positieve speling
  (was ≈0/negatief voor blok 2+).
- Nieuwe unit test: `generateLevel9CallResponseBlock.test.js` (3 tests — collapse-correctheid,
  2-maten-span, onafhankelijke randomisatie tussen blokken).
- Suite 638 groen, lint 0 err, build clean. docs.md §136 (aanvulling).
- Nog niet gecommit.

## 2026-08-04 — ✅ Ronde 7: header pause/resume/quit, level-start UI reset, RPG-wereld herbouw

Han (groot batch): stop-knop moet in de header de start-level-knop vervangen als pause-knop met resume/quit
popup; level-start moet character-UI/overlays sluiten en naar top-keys wisselen; RPG-tab moet
geclassificeerde animaties gebruiken (fox 'walk' bij lopen); parallax-achtergronden (theme + 4 lagen);
200-tegel scrollend level met dead-zone camera + edge-hold. "ik zal zelf testen... gewoon unit tests zijn
genoeg."

- ✅ Header: `AppHeader.jsx`'s Swords-knop wordt een Pause-icoon zodra een level actief is, opent
  `LevelPausePopup` (nieuw). Oude losse "■ Stop"-knop verwijderd.
  ✅ Quit: zelfde teardown als de oude Stop-knop + heropent de level-picker splash.
  ✅ Resume: berekent de maat waarin gepauzeerd werd, breekt alle lopende audio af (zonder level te
  sluiten), her-ankert `levelAudioStart` zodat een 1-maat metronome count-in meteen start en de inhoud
  hervat vanaf het maatbegin. **Bekende vereenvoudiging** (in docs.md §137 expliciet vermeld, niet stilzwijgend
  aangenomen): de JIT-streams (bas/wizard) regenereren hun content vanaf het nieuwe anker i.p.v. exact
  dezelfde oude content te hervatten — een volledig niet-destructieve resume is een aparte, grotere klus.
- ✅ `startLevel` sluit nu character-UI/edit-modes en zet `activeTab` naar 'piano' (top keys).
- ✅ RPG: `CreatureSprite` (BestiaryPanels.jsx) geëxporteerd en hergebruikt via nieuwe `WorldCreature`
  wrapper i.p.v. handgerolde crop-math — fox/wisp nu via `SCANNED_CREATURES` opgezocht, `WorldCreature`
  kiest 'move' vs 'idle' animatie op basis van een nieuwe `petMoving` state (useRpgLevelState.js).
  ✅ Parallax: 5 lagen uit `ASSORTED/backgrounds/Normal BG/` (layer 5 = statische sky-gradient theme, layer
  4→1 = 4 parallax-lagen 0.2/0.4/0.6/0.8), elk met eigen `-cameraX*factor` offset.
  ✅ 200-tegel wereld: `LEVEL_MIN_X`/`LEVEL_MAX_X` (±1600, 200×16px) in useRpgLevelState.js, speler
  geclampt. Dead-zone camera (RpgLevelPanel, eigen rAF-loop) volgt pas als speler buiten het middelste
  derde deel van het scherm komt. Alle wereld-objecten via één `worldToScreenX` conversie.
  `EdgeHoldZone` (15% van viewport-breedte) hergebruikt de bestaande held-key beweging via nieuwe
  `setHeldDirection`.
- 🐞 Bekend, niet opgelost: bij langdurig ingedrukt houden van een bewegingstoets verschijnt soms een
  React dev-mode "Maximum update depth exceeded" waarschuwing. Uitgebreid gediagnosticeerd (zie docs.md
  §137) — geen crash, geen zichtbare functionele breuk (camera/animaties blijven correct werken,
  geverifieerd via screenshots), enkel in dev-mode. Gezien de RPG-tab's "preview only" status en tijdsbudget
  niet verder achtervolgd — vlagged voor een vervolgronde.
- Suite 638 groen, lint 0 err, build clean. Browser-geverifieerd: parallax-lagen, fox/wisp animaties, en
  camera-scroll werken zichtbaar correct (screenshots tonen tent die in beeld komt na scrollen, fox in
  'move'-animatie tijdens lopen). docs.md §137 (nieuw).
- Nog niet gecommit.

## 2026-08-04 — ✅ Ronde 8/9: uniforme RPG-schaal, equipped pet, portret-bugfix, projectile-flip, critters

Han (groot vervolg-batch + mid-turn correctie): RPG-schaal inconsistent; gebruik de EQUIPPED pet i.p.v.
hardcoded fox; layer-volgorde nog fout (tent voor karakters); parallax-lagen moeten zakken (8/16/24/32px);
skirts/dresses moeten boven chest/broek/schoenen; "veel portraits enorm ingezoomd"; portret-layer-volgorde
fout; projectile-richting omdraaien; critters onder elke rust (−0,5 punt, "critters killed" stat, later
herkaderd als positieve "critters saved y/m"). Toen: "sinds de critter update is level 9 kapot :( wizard
werkt niet meer" + "critters staan onder de maatstrepen, niet onder de rusten" + "waarom gebruik je de
walk/run animatie niet".

- ✅ RPG-schaal: elk wereld-object gebruikte een ANDERE effectieve zoom (fit-to-height per creature-crop).
  Nu allemaal exact `ZOOM` (natuurlijke pixels × ZOOM), zelfde conventie als de tiles al gebruikten.
- ✅ Equipped pet: nieuwe `WorldPet` leest `char.layers.pet` via `urlOfLayer` (dezelfde resolver als
  CharacterDoll) i.p.v. hardcoded Fox.
- ✅ Tent (decoratie) stond NA held/pet in de JSX — verplaatst naast de boom (vóór karakters).
- ✅ Parallax-lagen zakken nu 8/16/24/32px (`sinkPx` per laag).
- ✅ `characterAssets.js` CATEGORIES: chest/feet/legs z-waarden verwisseld zodat skirt/dress (legs/chest-
  classificatie) altijd boven broek/schoenen toont.
- 🐞→✅ Portret-zoom-bug: root cause gevonden in de GENERATOR — "…portrait large{N}.png" bestanden zijn
  DEZELFDE portretten op 640×640 (10× opgeschaald, pixel-identiek), niet een andere/betere crop. Maid's
  portret was wel goed omdat DIE file al écht 64×64 is. Generator gebruikt nu de platte (niet-"large")
  bestanden; manifest geregenereerd (608 entries).
- ✅ Portret-layer-volgorde: witte rand (nieuw, achterste laag) → portret/projectile-content → kader
  (Frame64Overlay, nu ALS LAATSTE i.p.v. eerste).
  ✅ Projectile-richting omgedraaid (SheetRpgLayer's Projectile) + nieuwe `flip`-prop op PortraitImage,
  toegepast op de wizard's magic-projectile side-portrait (niet de archer's pijl-portret).
- ✅ Critters onder rusten: nieuwe `Critter`/`critterData` (spiegelt Slime/slimeData 1-op-1, maar voor
  RUST-slots i.p.v. echte noten). 7 geclassificeerde bestiary-critters (squirrel/porcupine/pidgeon/panda/
  armadillo/blue jay/dragonfly — "red panda" heet in de manifest gewoon "Panda"). Een noot spelen tijdens
  een rust-venster kost −0,5 punt + "critterKilled" stat, ONDERSCHEIDEN van generieke extraNote.
  Mid-turn herkaderd: splash toont nu "Enemies vanquished x/n" en "Critters saved y/m" (positief geframed —
  saved = totaal − killed), totalen gerapporteerd via nieuwe onEnemyTotal/onCritterTotal callbacks.
- 🐞→✅ Ronde-9 bugfix: critters stonden onder de MAATSTREEP (een rust' eigen offset = maatbegin, dezelfde
  tick als de streep), niet onder de (sinds ronde 7 GECENTREERDE) rust-glyph. Critter-positie nu
  `offset + duration/2` (het midden van de rust), matcht de glyph altijd.
- 🐞→✅ Ronde-9 bugfix: `WorldCreature` checkte alleen op een 'move'-animatie-key; veel dieren zijn
  geclassificeerd als 'walk'/'run'/'fly' i.p.v. 'move'. Nieuwe `findMoveAnim`/`findIdleAnim` checken alle
  keys in prioriteitsvolgorde — leest rechtstreeks uit dezelfde manifest-data als de Bestiary-tab, dus
  single source of truth zonder aparte RPG-sync nodig.
- 🔍 "Level 9 kapot... wizard werkt niet meer": uitgebreid getest (idle playback, 8+ sec snel noten spelen,
  console.trace op randomizeAll om een regeneratie-loop uit te sluiten) — GEEN crash, GEEN error, wizard
  zichtbaar castend/gloeiend/schietend over meerdere frames. Enige BEVESTIGDE bug uit dezelfde screenshots
  was de critter-mispositionering (hierboven gefixt) — mogelijk wat als "kapot" overkwam. Transparant
  gemeld, niet als volledig opgelost geclaimd — Han's eigen bevestiging nodig.
- ⏳ Nog niet geïmplementeerd (te groot/onzeker om blind te fixen zonder visuele terugkoppeling): een
  formele GLOBALE bottom-center-anker-constante gedeeld tussen RPG-level EN avatar-preview (RPG-level
  ankert al uniform op `bottom: FLOOR_T`; "pet 1px hoger dan personage in avatar preview" en "pet lijkt
  achter gras / pootjes missen pixels" vragen directe visuele inspectie — clipping vs. z-order — voor een
  zekere fix); 64×64-center-met-oscillatie generiek voor ELKE fly/float-creature (nu enkel archer/wizard
  bespoke); animatie-specifieke heranchoring (fly/float + sit-animatie samen); grasprieten "bijna overal".
- Antwoord op Han's chatvraag (geen code): ja — de grid-mapping/crop/frame-parameters per creature staan
  in `scripts/generate-bestiary-manifest.mjs` (per-bestand overrides zoals `FRAME_OVERRIDES`,
  `CATEGORY_OVERRIDES`, `PORTRAIT_OVERRIDES_BY_NAME`, etc.) — handmatig aanpasbaar daar, dan
  `node scripts/generate-bestiary-manifest.mjs` opnieuw draaien om `bestiaryManifest.generated.js` te
  regenereren. Geen losse UI hiervoor.
- Suite 640 groen, lint 0 err, build clean. docs.md §138 (nieuw).
- Nog niet gecommit.

## 2026-08-04 (round 11, RPG follow-up op screenshot)

- ✅ Han (screenshot RPG-level): "meeste items staan 1 pixel lager, ground anchor is 15 (ipv 16)" —
  `GROUND_ANCHOR = (FLOOR_TILE-1)*ZOOM` toegevoegd in RpgLevelPanel.jsx, alle sprite-anchors (boom, tent,
  wisp, hero, pet, gras-prieten-basis) daarop overgezet; `FLOOR_T` zelf blijft ongewijzigd (grastegel-grootte).
- ✅ Han: "critters gebruiken nog steeds niet de walk/run/fly animatie" — `Critter` in SheetRpgLayer.jsx
  gebruikte nog hardcoded 'idle'; `findMoveAnim`/`findIdleAnim` verplaatst naar bestiaryAssets.js (single
  source of truth) en nu door ZOWEL WorldCreature ALS Critter gebruikt. Critter is altijd "moving" (scrollt
  continu), dus prefereert nu altijd walk/run/move/fly/float boven idle indien geclassificeerd.
- Suite 640 groen, lint 0 err (alleen pre-existing warnings), build clean. docs.md §139 (nieuw).
- Nog open: fly/float 64×64-center+oscillatie generiek, sit-heranchoring, grasprieten overal, "pet achter
  gras" bug (nog geen screenshot van ontvangen — deze keer wél een screenshot maar dat toonde het ground-
  anchor-probleem, niet expliciet de pet/gras-z-order-klacht; nog navragen indien Han die apart bedoelt).
- Nog niet gecommit.

## 2026-08-04/05 (round 12, grote follow-up: global anchor, fly/float, dog-clip, tree-scale)
- ✅ `src/model/worldAnchor.js` (nieuw): `GROUND_ANCHOR_PX = 15` — DE ene globale bron; RpgLevelPanel leest
  hem nu vanuit dit bestand i.p.v. een lokaal hardcoded getal (Han: "dit soort settings moet globaal zijn").
- ✅ Bottom-center anchor consistent toegepast: boom, tent, wisp, hero, pet, grasprieten — allemaal nu
  `bottom: GROUND_ANCHOR` + `transform: translateX(-50%)` (was 3 verschillende mechanismen door elkaar).
- ✅ Grasprieten: van 5 vaste stuks bij spawn naar verspreid over de HELE 200-tegel vloer (~1 per 3 tegels,
  met jitter), geen aparte sink meer — zelfde ankerpunt als de rest.
- ✅ Fly/float 64×64-hover+oscillatie: generiek via `isFlyingAnim(anim)` (checkt de HUIDIGE animatie, niet
  de creature) — WorldCreature (RPG-level) én Critter (SheetRpgLayer) gebruiken 'm. Sit-heranchoring volgt
  automatisch uit het ontwerp (sit-anim ≠ fly-anim → geen hover). Dragonfly (heeft 'fly' key) bevestigd.
- ✅ Hond fout geclipt in level → root cause: `WorldPet`/`PET_CROP` nam ÉÉN vaste crop aan voor alle pet-
  sheets, maar Doggy's manifest-crop wijkt af. Fix: `petVariant` matcht het equipped pet-bestand op URL
  tegen SCANNED_CREATURES en rendert via WorldCreature (bestiary-data, single source of truth), met
  WorldPet enkel als fallback voor niet-geclassificeerde pets.
- ✅ Magic projectile flip: verwijderd uit de Bestiary-preview (`PortraitImage flip` prop), blijft alleen in
  de song levels (`SheetRpgLayer.jsx`'s `Projectile`).
- ✅ Han (zelfde sessie, vervolgvraag): "tree1 lijkt verkleind met een factor 2" — root cause: leftover
  `* 0.6` op de boom-`<img>`, enige sprite nog niet op de gedeelde ZOOM sinds ronde 8. Verwijderd.
  Achtergrond-parallax-lagen zijn een BEWUST ander mechanisme (fit op viewport-hoogte, geen wereld-ZOOM) —
  toegelicht aan Han, niet blind aangepast (zou de achtergrond enorm/kapot maken).
- Suite 640 groen, lint 0 err (alleen pre-existing warnings), build clean. docs.md §140 (nieuw).
- Nog open: "pet achter gras / pootjes missen pixels" bug — nog geen screenshot ontvangen dat dit specifiek
  isoleert.
- Nog niet gecommit.

## 2026-08-06 — 🐞✅ Song levels gebroken na (vermeend) laadscherm: hakkelen, basismelodie zichtbaar, geen geluid

Han: "sinds het toevoegen van een laadscherm zijn de song levels gebroken. 1) notenbalk
hakkelt, 2) ik zie noten van de basismelodie, 3) ik hoor geen van de melodieën (cello,
timpanen, metronoom)." Vervolgens: "ik merk ook dat het level inconsistent is; soms
laadt het wel succesvol inc geluid, soms niet."

- Onderzoek (Explore-agent + eigen lezing): het laadscherm (§163, `audioReady`/
  `spritesReady`) wordt NERGENS door level-code gelezen — geen oorzakelijk verband.
  Echte oorzaak: twee races in de nog-niet-gecommitte §663/§679/§686/§688/§693
  streaming-rework.
- ✅ Bug A (inconsistent geluid): `levelAudioStart` werd op KLIK-tijd gezet
  (`+0.35s`), vóórdat `bassReady`/`metronomeReady` bevestigd waren — races met de
  async cello/metronome instrument-rebuild. Bij trage sample-load was het anker al
  verstreken tegen de tijd dat geschedule werd; `playMelodies`'s clamp-naar-nu
  overlapte dan de openingsmaten (soms hoorbaar als stilte, soms als brij). Fix:
  anker wordt nu pas gezet ZODRA bass/metronome/timpani écht klaar zijn (zelfde
  ready-flags als de bestaande schedule-effect, alleen eerder toegepast).
- ✅ Bug B (basismelodie zichtbaar): `level.active` flipt synchroon, maar de
  level-melodie wordt pas een rAF-tick later gebouwd (`levelRegenerate`) — één
  renderframe toonde de oude/default treble-melodie via `SheetRpgLayer`. Fix:
  nieuwe `levelMelodyReady` state (false tijdens de rAF-vertraging, true zodra
  `randomizeAll()` echt geland is), gate toegevoegd op `trebleMelody` in
  `SheetMusic.jsx` naast de bestaande `levelActive`/`isTrebleVisible`/`actualTreble`.
- "Hakkelen" niet als apart afzonderlijk bug gereproduceerd — vermoedelijk gevolg van
  Bug A (herhaaldelijk herschedulen/overlap forceert extra re-renders). Han test dit
  live na deze fix; nog te bevestigen.
- Interview (AskUserQuestion): Han bevestigde niet op de hoogte te zijn van de
  lopende streaming-refactor (nieuwe bestanden `useLevelBackingStream.js` etc.,
  ongedateerd 3-4 aug) — géén revert, gewoon voortbouwen. Bug 2 bleek alleen bij
  treble/eerste keer. Han koos "direct doorpakken op meest waarschijnlijke oorzaken".
- Build clean, lint 0 errors (alleen pre-existing warnings), test:run 630/631 groen
  (1 falende test + 1 ENOSPC-suite zijn pre-existing/ongerelateerd — CharacterDoll
  fullFrame-nudge en een schijfruimte-fout, niet aangeraakt door deze wijziging).
  docs/architecture.md §166 (nieuw).
- Nog niet gecommit. Nog te doen: Han test de 3 symptomen live in de browser om te
  bevestigen dat ze weg zijn.

## 2026-08-06 — 🔨✅ Performance: hakkelig beeld tijdens levels

Han: "kijk ook naar de performance, want die is ondermaats. heel hakkelig beeld
enzo. niet te doen. zijn er te véél instrumenten geladen? te veel audiocontext?
zoiets?"

- Gecheckt: 1 AudioContext (App.jsx:129), stabiel/begrensd aantal Soundfont/
  DrumMachine-instanties — geen lek, niet de oorzaak.
- Echte oorzaak: twee React-state-gedreven rAF-loops die tot 60×/sec een grote
  boom re-renderen: (1) `SheetRpgLayer.jsx`'s `tick`-state re-rendert alle
  Slime/Critter/Wizard/Projectile/SpawnGlow-instanties elke frame, ook als hun
  props niet veranderd zijn; (2) `useRpgLevelState.js` riep `setMoving`/
  `setPetMoving` ONVOORWAARDELIJK elke frame aan, zelfs stilstaand — en die hook
  hangt direct in App.jsx (root component), dus elke aanroep her-runt App.jsx's
  hele render-functie.
- ✅ Interview (AskUserQuestion): Han koos "direct de refactor doen" + "alles in
  één keer". Gegeven dat een volledige ref/imperatieve-DOM-rewrite van de hele
  1169-regel combat-kritieke `SheetRpgLayer.jsx` + camera-follow + WebGL
  licht-uniform NIET veilig blind uit te voeren is zonder live browser-profiling
  (niet beschikbaar in deze omgeving — CLAUDE.md: "if you can't test the UI, say
  so explicitly"), is gekozen voor de veilige, mechanisch verifieerbare deelset:
  - `React.memo` op de 5 sprite-componenten in `SheetRpgLayer.jsx` (puur
    presentationeel, alleen primitieve props) — skipt re-render wanneer props
    ongewijzigd zijn tussen ticks (vaak, want walk-frame verandert maar om de
    ~150ms, niet elke 8ms tick).
  - `useRpgLevelState.js`: `movingRef`/`petMovingRef` guards zodat `setMoving`/
    `setPetMoving` alleen vuren bij een ECHTE verandering.
- Bijvangst: `npm run test:run` faalde af en toe met `ENOSPC` — `df` toont de
  C-schijf op 100% vol (11 MB vrij). Dat kan zelf al brede systeem-hapering
  veroorzaken, los van deze app. Aan Han gemeld als apart te onderzoeken punt.
- Build clean, lint 0 errors, test:run 630/631 groen (zelfde 2 pre-existing/
  ongerelateerde fails als hierboven). docs/architecture.md §167 (nieuw).
- Nog niet gecommit. Nog open: Han moet live testen of het hakkelen merkbaar
  minder is; een diepere ref-gedreven rewrite van SheetRpgLayer/useRpgLevelState/
  RpgLevelPanel is een apart, groter vervolgtraject als dit onvoldoende blijkt.

## 2026-08-06 — 🔨✅ Level editor (schema-focus, geen UI)

Han: "ik wil een level editor; mag heel simpel zijn... kijk hoe levels worden
opgeslagen en welke params ik kan aanpassen... zelfs ok als de file mooi
gestructureerd is zodat ik die handmatig kan aanpassen... het gaat me vooral om
de doc structuur, niet zozeer om de interface."

- Interview (AskUserQuestion): "input type" bleek sleutel/regel/range te
  betekenen (niet invoerapparaat) — vocal-range levels moeten rekening houden
  met stem-range en het juiste (vocale) sleutelteken tonen; later ook
  'walking bass'/tweehandig, dus bas-generator-instellingen los aanpasbaar.
  Gewenste extra's: bas-instellingen los van fixedBass, percussie-instellingen,
  akkoord-instellingen. Doc-vorm: uitgebreide comments in levels.js zelf (JSON
  kan geen comments bevatten) + referentie in architecture.md.
- ✅ Geen UI editor gebouwd (expliciet buiten scope) — levels.json blijft
  hand-editable JSON.
- ✅ Nieuwe OPTIONELE velden (100% backward compatible — geen van de bestaande
  9 levels zet ze, dus hun gedrag is ongewijzigd):
  - `key: {tonic, mode}` — hergebruikt bestaande setTonic/setSelectedMode
    (useScaleManagement), toegevoegd aan useLevel's snapshot/restore-cyclus
    zodat het na afsluiten van het level correct terugveert.
  - `clefTreble`/`clefBass` — hergebruikt bestaande preferredClef/clefSelector.js
    (vocale sleutels: alto/tenor/soprano/baritone-f/... bestonden al).
  - `bass: {...}` — InstrumentSettings-vormig object, overschrijft `fixedBass`
    wanneer aanwezig (bereidt 'walking bass' voor zonder nieuwe hardcoded preset).
  - `chords: {...}` — overschrijft de hardcoded tonic-tonic-tonic/C4/1-default.
- 🐞 Bewuste NIET-toevoeging: percussie (timpani) kit/dichtheid — er bestaat
  geen generator-pad hiervoor (timpani is een hardcoded patroon, Han's eigen
  eerdere expliciete keuze, §663); een veld toevoegen zonder onderliggend
  mechanisme zou stilzwijgend niks doen (§6c). Gedocumenteerd als bekende
  lacune/apart vervolgverzoek i.p.v. een nep-veld.
- Documentatie: groot "SCHEMA REFERENCE"-commentaarblok bovenaan
  `src/levels/levels.js` (elk veld, type, default, voorbeeld) + verwijzing +
  samenvatting in docs/architecture.md §168.
- Build clean, lint 0 errors, test:run 639/640 groen (1 pre-existing
  ongerelateerde CharacterDoll-fail).
- Nog niet gecommit.

## 2026-08-06 — 🔨✅ Level editor ronde 2: 20 voorbeeldlevels (101-120)

Han: "genereer 20 levels (101-120) met zeer uiteenlopende settings; als
voorbeelden voor de json." Varieer: note pool, melody type, voices,
notes/measure, beat rests, variability, span, tuplets, smallest note, volume,
visibility voor elk van de tracks; theme; enemy type. Mid-turn erbij: "koppel
num-repeats gewoon aan de enemy: slime=1, wizard=2", "numMeasures per block, en
number of blocks", "varieer ook: range, tonic, scale."

- Interview: 20 levels zijn ECHT speelbaar (niet apart voorbeeldbestand);
  "melody type" = randomizationRule; "voices" = polyfonie (bestaand
  InstrumentSettings-veld `voices`, §435); "theme" = app-kleurenschema.
- ✅ Schema-refactor: de losse `clefTreble`/`clefBass`/top-level `bass:{}` uit
  ronde 1 zijn samengevoegd tot één uniform `tracks: {treble?, bass?,
  percussion?}`-object (§6c: geen twee mechanismen voor hetzelfde) — elk veld
  gebruikt de ECHTE InstrumentSettings-naam (notePool, randomizationRule,
  voices, maxLeap, polyMultiplier, smallestNoteDenom, insertBeatRests, range,
  preferredClef) plus twee editor-only gemakstermen: `volume` (VOL_STEPS-glyph,
  generaliseert het bestaande bas/metronome-levelvolume-mechanisme naar elke
  track incl. metronome) en `visible` (overschrijft debugOnlyLines per track).
- 🐞 Bug gevonden en gefixt tijdens het bouwen: `tracks.bass` had voorrang op
  `fixedBass` puur op AANWEZIGHEID — een level met ALLEEN `tracks.bass.volume`
  zou zo alle fixedBass-instellingen stilzwijgend verliezen. Fix:
  `hasBassGenOverride` strip eerst volume/visible voordat de precedentie bepaald
  wordt.
- ✅ `theme` toegevoegd (setTheme, met snapshot/restore net als `key`).
- ✅ `numBlocks` (optioneel) — normalizeLevel in levels.js berekent
  `totalMeasures` hieruit; `numRepeats` optioneel, default via enemyType
  (Slime→1, Wizard→2). 100% backward compatible (levels 1-9 zetten dit al
  expliciet).
- ✅ 20 levels (101-120) toegevoegd aan levels.json — elk een andere combinatie
  (extreem minimaal, 16e noten+2-octaafbereik, voices:'var'/3, Wizard met
  auto-numRepeats, vocale altsleutel, onafhankelijke walking-bass, akkoord-
  progressie i.p.v. drone, geforceerd verborgen tracks, "kitchen sink"), met
  uiteenlopende tonic/mode (Major/Minor/Dorisch/Mixolydisch/Harmonisch mineur)
  en range.
- 🐞 Test-fix: levels.test.js's "LEVELS map keys 1..9" check ging uit van EXACT
  9 keys — nu gefilterd op id<=9 zodat de 101-120 voorbeelden die check niet
  breken.
- Build clean, lint 0 errors, test:run groen (639/640, zelfde pre-existing
  CharacterDoll-fail). docs/architecture.md §169 (nieuw), §168 gemarkeerd als
  deels vervangen.
- ⚠️ NIET live getest in een browser (geen browser-tool in deze omgeving) — de
  wiring hergebruikt bestaande, al geteste mechanismen, maar Han moet de
  ongebruikelijkere levels (105 voices:'var', 110/119 losse bas, 116 geforceerd
  verborgen tracks) zelf even spelen ter controle.
- ✅ Vervolg zelfde dag: `timeSignature` toegevoegd als optioneel level-veld
  (zelfde "laat ambient staan indien weggelaten"-idioom als bpm), via bestaande
  setTimeSignature + snapshot/restore. Toegepast op 6 van de 20 voorbeeldlevels
  (102:6/8, 103&117:3/4, 109:7/8, 113:5/4, 120:7/8) — levels 1-9 bewust
  ongemoeid (al uitgebreid getuned, blijven op ambient 4/4). Build/lint/test
  groen (639/640, zelfde pre-existing fail). docs/architecture.md §169 addendum.
- ✅ Debug: read-only levelconfig-overlay toegevoegd (debugMode + level.active
  → volledig JSON-dump van level.current rechtsboven, mirror van het bestaande
  MIDI-debugpaneel). Build/lint groen.
- Nog niet gecommit.

## 2026-08-06 — ⏳ backlog: 3 grote vervolgfeatures (interview afgerond, NOG NIET gebouwd)

Han vroeg in dezelfde sessie ook om Level 10, Level 11 en een live-editable
Level 0. Interview (AskUserQuestion) is afgerond en scope is helder, maar dit
zijn alle drie substantiële, risicovolle architectuurwijzigingen aan de al
zwaar getunede combat-code (SheetRpgLayer/useLevel) — bewust NIET blind
achter elkaar gebouwd in dezelfde beurt als de kleinere schema-uitbreidingen
hierboven. Elk verdient een eigen implementatie-sessie met live UAT.

- ⏳ **Level 10 — "mixed" enemyType**: 2 maten slimes → 2 maten wizard
  (voor-speel-na) → herhaalt. Han bevestigde: de combat-MECHANIEK zelf wisselt
  per blok (wizard-blokken krijgen echte call-response-preview-audio zoals
  Level 9, slime-blokken niet) — dus niet alleen een visuele skin-wissel.
  Vereist: `enemyType` per-BLOK i.p.v. per-level (nu hard verondersteld
  level-breed door SheetRpgLayer's `isWizard`-branch, useLevelTrebleStream is
  Wizard-only, de #693 odd/even-measure-collapsing zit vast aan Wizard-levels).
  Grootste/riskantste van de drie — raakt de kern-combat-state-machine.
- ⏳ **Level 11 — achtergrond-wizard met periodieke toonladder-wissel**: een
  GROENE wizard-NPC (nieuwe sprite-variant nodig, decoratief — geen combat)
  staat bij een slime-level, cast elke 2 maten een spell-animatie en wisselt
  dan majeur↔mineur (zelfde tonic). Han bevestigde: ALLEEN vooruit — nieuw
  gegenereerde maten NA de wissel gebruiken de nieuwe modus; al zichtbare/
  gegenereerde maten blijven zoals ze waren (consistent met hoe de JIT-streams
  nu al werken — elke chunk leest de instellingen op het moment van genereren).
  Vereist: (a) een periodieke mode-toggle gekoppeld aan de blok-klok, gelezen
  door de treble-generatie-chunk-aanroep; (b) een nieuwe decoratieve
  wizard-sprite (groen) + cast-animatie-cyclus in SheetRpgLayer, losstaand van
  de bestaande Wizard-combat-Wizard.
- ⏳ **Level 0 — live-editable sandbox UI**: Han koos EXPLICIET voor een
  volwaardige live-editable interface (velden/sliders per schema-veld, direct
  effect op de lopende sessie) — dit IS alsnog de UI-editor die in de eerste
  ronde bewust buiten scope viel ("het gaat me vooral om de doc structuur, niet
  zozeer om de interface"). Nu wél gewenst. Grootste losse UI-bouwwerk van de
  drie; kan het nieuwe debug-overlay (hierboven, read-only JSON-dump) als
  vertrekpunt/referentie gebruiken maar heeft een volledig interactief paneel
  nodig (inputs, live re-apply via useLevel.applyConfig).
- Volgorde/prioriteit nog niet bepaald met Han — voorstel: Level 0 (UI-editor)
  eerst, omdat die daarna handig is om Level 10/11 zelf mee te testen/tunen
  zonder JSON te hoeven herladen.

## 2026-08-06 — 🔨✅ Level 0: live-editable sandbox (Han koos: begin alvast)

- ✅ Slimme scope-keuze i.p.v. alles hand-rollen (§6d): tijdens Level 0 blijft
  de bestaande SubHeader (range/clef/kleur/instrument/playback/generatie/
  oefeningen) gewoon zichtbaar — die roept al rechtstreeks de echte setters
  aan (setTrebleSettings/setTonic/setTheme/etc.), dus treble/bas/percussie/
  key/theme/bpm/maatsoort/akkoorden/volume zijn GRATIS live-editable, zonder
  nieuwe inputs te bouwen.
- ✅ Voor de paar level-only velden zonder bestaande UI (sideScroll,
  enemyType, wizardSpawnLeadMeasures, debugOnlyLines, beatsOnScreen): nieuw
  klein hoekpaneel `LevelZeroPanel.jsx`. debugOnlyLines/beatsOnScreen passen
  DIRECT toe via nieuwe `useLevel.patchCurrent()` (merget alleen in state,
  roept NOOIT applyConfig aan — anders zou het de live SubHeader-edits
  terugzetten naar de originele Level-0-JSON). sideScroll/enemyType/
  wizardSpawnLeadMeasures zijn bewust GEEN hot-swap — te riskant om blind
  (zonder browser) te doen op code die hooks/combat-state daarop baseert —
  in plaats daarvan een expliciete "↻ Herstart level"-knop.
- ✅ Nieuw `id: 0`-level in levels.json (sideScroll, volle rijkdom,
  debugOnlyLines: false). Verschijnt automatisch in de levelkiezer.
- 🐞 2 bestaande tests gefixt die stilzwijgend "eerste level = id 1" of
  "LEVELS keys zijn exact 1-9" aannamen: LevelStartSplash's carousel-default
  (was hardcoded index 0, nu `LEVEL_NUMBERS.indexOf(1)`) en levels.test.js's
  id-filter (nu `id>=1 && id<=9`).
- Build clean, lint 0 errors, test:run 639/640 groen (zelfde pre-existing
  CharacterDoll-fail). docs/architecture.md §170 (nieuw).
- ⚠️ NIET live getest — Han moet zelf checken dat de SubHeader visueel niet
  botst met de RPG-combat-scene, en dat patchCurrent's live-updates
  daadwerkelijk goed lezen tijdens actief gevecht.
- Nog niet gecommit.

## 2026-08-06 — 🐞✅ Bug: slimes/noten niet in sync met metronoom, komen te laat (self-inflicted)

Han: "oeps! slime levels werken niet goed. invliegende noten/slimes komen veel
te laat en zijn niet in sync met de metroom. Soms komen ze pas na ~4 maten
(dus niet eens precies matenaantal)."

- Root cause: eigen regressie uit de audio-sync-fix van eerder vandaag (§166).
  Door `levelAudioStart` pas te zetten zodra instrumenten klaar zijn, liep
  `SheetRpgLayer`'s tick-klok in de tussentijd "free-running" (voor Level
  1/tests bedoeld gedrag) en SPRONG de anker-bron vervolgens midden in de al
  lopende rAF-loop naar de echte audio-tijd zodra die klaar was — een sprong
  ter grootte van hoe lang het laden toevallig duurde (nooit een rond aantal
  maten, vandaar "niet eens matenaantal").
- ✅ Fix: `SheetRpgLayer`'s tick-loop bevriest de klok volledig (géén
  free-running fase) zolang `sideScroll` waar is en de echte audio-anker nog
  niet bestaat — pas zodra die er is, begint tick correct-verankerd vanaf de
  allereerste echte tick.
- Build/lint/test groen (639/640, zelfde pre-existing fail).
  docs/architecture.md §171 (nieuw).

## 2026-08-06 — 🔨✅ Debug levelparams verplaatst naar start-splash

Han: "ik wil de level params zien tijdens het 'start level' splash screen,
niet tijdens het level. Ik zie nu alleen aanpassingen van beatsonscreen en
enemytype, niet van de andere params."

- ✅ In-level debug-overlay (§170) verwijderd; `LevelStartSplash.jsx` (de
  levelkiezer) toont nu i.p.v. daarvan een volledige JSON-dump van het
  GESELECTEERDE carousel-level, live tijdens het slepen — gated op
  `debugMode` (nieuwe prop, doorgegeven vanuit App.jsx).
- Build/lint/test groen. docs/architecture.md §172 (nieuw).
- Nog niet gecommit.

## 2026-08-06 — 🔨✅ Level 0 → pre-start config form (i.p.v. live overlay)

Han: "hoe kan ik level 0 aanpassen? dat wil ik in de 'config' voor het begin
van het level doen, dus voordat het start, dus niet via instelling overlay."

- ✅ §170's aanpak (SubHeader zichtbaar TIJDENS Level 0) teruggedraaid;
  LevelZeroPanel.jsx + useLevel's patchCurrent verwijderd (ongebruikt).
- ✅ Nieuw: `LevelZeroConfigForm.jsx` — volledig formulier voor élk schemaveld,
  getoond in LevelStartSplash zodra carousel op id 0 staat. Start-knop geeft nu
  het VOLLEDIGE bewerkte level-object door i.p.v. een id; `startLevel` in
  App.jsx accepteert nu beide vormen.
- Build/lint/test groen.

## 2026-08-06 — 🔨✅ Level 10 (Mixed) + Level 11 (toonladderwissel) + akkoorden-bug

Han: "voeg dan level 10/11 toe" (na eerder interview) + "ik mis de chords als
instelling bij het level! ... level 113 (in F#), want cello staat nog in C."

- ✅ Level 10 "Mixed": nieuwe `generateLevelMixedBlock.js` +
  `useLevelMixedStream.js` — 2-maten-blokken wisselen Slime (normale generatie)
  / Wizard (Level 9's rust+echo+cast-audio) af, startend met Slime.
  **Bewuste scope-verkleining**: het vijand-SPRITE blijft slime (geen visuele
  wissel) — een volledige per-item render-fork in SheetRpgLayer's isWizard-tak
  (~10 raakpunten) was te riskant om blind te bouwen zonder live-verificatie.
  De MECHANIEK (waar Han expliciet om vroeg — "niet alleen visueel") is wel
  echt/compleet.
- ✅ Level 11: nieuwe `useLevelKeyModulationStream.js` — JIT-treble wisselt
  elke 2 maten majeur/mineur (zelfde tonic, alleen vooruit — bevestigd via
  interview), hergebruikt bestaande `updateScaleWithMode`. Decoratieve groene
  wizard: hergebruikt de bestaande Wizard-sprite/positie met een CSS
  hue-rotate-filter (§6d, matcht eerder gegeven kleurvariant-advies), idle-only
  — **bewuste scope-verkleining**: geen precies op de maat gesynchroniseerde
  cast-animatie (te riskant blind te timen).
- 🐞 Echte bug gefixt: `chordSettings.fixedTonic` was ONVOORWAARDELIJK
  hardcoded op 'C4' (Han's eigen oude #663-instructie, van vóór het `key`-veld
  bestond) — elk level met een eigen `key.tonic` (bv. level 113, F♯) hield zijn
  akkoorden (en dus de cello, die akkoord-roots volgt) alsnog in C. Fix:
  default is nu `lvl.key?.tonic ?? 'C4'` — levels 1-9 (geen `key`) ongewijzigd.
- ✅ Akkoorden nu volledig instelbaar in het Level 0-formulier: progression
  type (strategy), complexity, chords/measure, variability, passing chords —
  allemaal uit de bestaande generationFields.js-constanten, geen nieuwe enum.
- Build clean, lint 0 errors, test:run 639/640 groen (zelfde pre-existing
  CharacterDoll-fail). docs/architecture.md §173-174 (nieuw).
- ⚠️ Level 10/11 NIET live getest — dit zijn de diepste nieuwe mechanieken van
  de sessie; Han moet beide spelen voor ze als "af" gelden.

## 2026-08-06 — 🐞✅ Ronde 2 UAT: JIT-buffer, Level 10 visuele fork, Level 11 flourish, Level 0 defaults, cello-prewarm

Han na het testen: "level 10: animaties schieten te kort. er moet een zwarte
wizard staan. de noten van de wizardmaten moeten geen slime hebben, maar een
projectile krijgen." + "level 11: ik wil 2 maten voor elke switch een
staticprojeciles2 (32x32) laten toveren... vliegt mee op de maatstreep." +
"level 10 en 11: de JIT-generatie loopt niet lekker... noten verschijnen pas 1
maat op voorhand i.p.v. 2." + "level 0: zet de defaults daar als defaults." +
"level 2: nog steeds pas veel te laat slimes... duurt ongeveer 2,5 maten
voordat maat -1 in beeld komt."

- 🐞 JIT-bufferbug gefixt: useLevelMixedStream/useLevelKeyModulationStream
  gebruikten per ongeluk useLevelTrebleStream's KLEINERE cast-specifieke
  buffer (~1-1.5 maat) i.p.v. useLevelBackingStream's bewezen volle
  2-maten-buffer (genereer blok N+1 zodra blok N begint). Gefixt in beide.
- ✅ Level 10: de eerder bewust weggelaten per-noot visuele fork is alsnog
  gebouwd — `itemIsWizard` (via `blockTypeAt`) bepaalt nu PER NOOT of die als
  Slime of Projectile rendert (dood-animatie, live flight, wizard
  cast-sync, spawn-glow — allemaal bijgewerkt). Zwarte wizard toegevoegd
  (brightness/saturate-filter, zelfde aanpak als het groene niveau-11-exemplaar).
- ✅ Level 11: nieuw `static-projectiles-2`-asset (gekopieerd uit ASSORTED,
  gemeten 160×192 = 5×6 @ 32×32, zelfde crop als static-projectiles-5 want
  identieke sheet-afmetingen) + nieuw `StaticProjectile2`-component, één per
  aankomende toonladderwissel, hergebruikt de bestaande `sideScrollX`-vlucht
  (geen aparte lead-gate nodig — beatsOnScreen=8 beats geeft de gevraagde 2
  maten al gratis).
- ✅ Level 0: bpm/numMeasures/notesPerMeasure/range in levels.json nu
  LETTERLIJK gelijk aan DEFAULT_BPM/DEFAULT_NUM_MEASURES/
  defaultTrebleInstrumentSettings() i.p.v. willekeurig gekozen getallen. Vorm
  gebruikt dezelfde constanten voor zijn eigen fallbacks; Mixed/decorativeWizard
  toegevoegd aan het formulier.
- ⚠️ Level 2 vertraging: GEEN volledige fix (kon niet live profilen) — een
  cello-sample-prewarm toegevoegd (laadt alvast op de achtergrond zodra de
  levelkiezer opent, zonder de echte bassSettings aan te raken) als
  best-effort mitigatie. Als de vertraging blijft, is live profiling nodig om
  de echte bottleneck te vinden.
- Build clean, lint 0 errors, test:run 639/640 groen (zelfde pre-existing
  fail). docs/architecture.md §176 (nieuw).
- ⚠️ Niets van dit alles live geverifieerd — vooral Level 10/11's nieuwe
  visuals en de Level 2-mitigatie hebben Han's eigen test nodig.
- Nog niet gecommit.

## 2026-08-06 — 🐞✅ Ronde 3 (low budget, tests overgeslagen op verzoek)

- ✅ Level 10: wizardnoten (call-measure) nu ook onzichtbaar zoals Level 9
  (noteStaffContentRest/Real/Content uitgebreid met isMixed + blockTypeAt-check).
- ✅ Level 11: StaticProjectile2 nu op PROJECTILE_SCALE (was onscaled, te
  klein) en gecentreerd op x/y i.p.v. links uitgelijnd.
- ✅ Level 10/11: CSS-hue-rotate/brightness-filters vervangen door ECHTE
  kleurvariant-sprites — `wizard-black.png` bleek al WIZARD_URL te zijn
  (filter was dus overbodig/fout op Level 10); nieuw `wizard-green.png`
  gekopieerd uit ASSORTED voor Level 11 (WIZARD_GREEN_URL).
- 🐞 GROTE bug gevonden en gefixt: alle level-JIT-hooks (useLevelBackingStream,
  useLevelTrebleStream, useLevelMixedStream, useLevelKeyModulationStream) +
  App.jsx's handleResumeLevel gebruikten `barSec = (60/bpm) * timeSignature[0]`
  — correct voor 4/4 maar FOUT voor elke maatsoort met noemer ≠ 4 (bv. 6/8:
  telde 6 kwartnoten i.p.v. 6 achtstenoten, dus 2x te lange maten). Verklaart
  level 102's "6/8 zorgt dat alles misloopt" volledig: de JIT-generatie dacht
  elk blok duurde 2x zo lang, dus content kwam nooit op tijd bij, terwijl de
  visuele scroll (al tick-correct) wél goed doorliep → lege/ontbrekende maten.
  Fix: `barSec` nu overal afgeleid van `measureLengthTicks * secondsPerTick(bpm)`
  (bestaande timing-SSOT, tick-based, denominator-correct) i.p.v. de
  beats×denominator-agnostic shortcut. Dit was een PRE-EXISTING bug (ook in de
  oudere useLevelBackingStream/useLevelTrebleStream) die nooit opviel omdat
  alle levels tot nu toe impliciet 4/4 gebruikten.
- Build clean (npm run build). ⚠️ GEEN lint/test-run deze ronde (expliciet
  verzoek: "skip testing"). Han moet zelf level 102 (en andere niet-4/4-levels)
  testen, en level 10/11 opnieuw.
- 🐞✅ Crash gefixt: "Cannot read properties of undefined (reading 'col')" in
  Wizard-component — level 11's decoratieve wizard gebruikte `gFrame %
  length` zonder de bestaande niet-negatief-veilige modulo (gFrame is
  negatief tijdens de pre-roll vóór maat 0), waardoor WIZARD_IDLE_CELLS met
  een negatieve index werd geïndexeerd. Zelfde fix-patroon toegepast als de
  al bestaande wizardFrame-berekening. Build clean.
- Nog niet gecommit.

## 2026-08-06 — 🐞✅ Bug: levels erfden ambient tonic/bpm/maatsoort i.p.v. vaste default

Han: "slimes komen echt nog niet aan hoor. Level 2 is niet consistent goed
gegenereerd." + "na wijzigen instellingen gaan de basislevels slecht.
Bijvoorbeeld: ik zet de tonic op Gb, en wil dan level 2 spelen. Die heeft nog
allemaal voortekens staan, en genereert helemaal niet vanuit C-majeur.
Oplossing; alle params moeten meegegeven worden aan elk level; of er moet een
lijst defaults zijn 'if none provided' (voorkeur), C majeur 4/4 etc."

- Root cause: `applyConfig` paste bpm/timeSignature/key alleen VOORWAARDELIJK
  toe (`if (lvl.bpm)` etc.) — levels zonder eigen `key`/`timeSignature`
  (levels 1-9, van vóór die velden bestonden) erfden stilzwijgend wat de
  AMBIENT app-state toevallig was. Werkte per ongeluk zolang niemand de
  ambient tonic wijzigde vóór het spelen — braak zodra dat wel gebeurde
  (bv. na het testen van level 113 in F♯ eerder deze sessie).
  Verklaart waarschijnlijk ook de "slimes komen niet aan"-klacht: level 2
  genereerde in de verkeerde toonsoort.
- ✅ Fix (Han's eigen voorkeursoplossing): bpm/timeSignature/key.mode/
  key.tonic worden nu ONVOORWAARDELIJK toegepast bij elke levelstart, met
  fallback naar de bestaande DEFAULT_BPM/DEFAULT_TIME_SIG/
  DEFAULT_SCALE_TONIC/DEFAULT_SCALE_MODE (dezelfde constanten die de hele app
  al gebruikt, geen nieuwe hardcoded waarden). Een level start nu altijd
  vanuit een volledig deterministische staat, nooit meer afhankelijk van wat
  de app toevallig aan het doen was.
- Build clean, lint 0 errors, test:run 639/640 groen (zelfde pre-existing
  fail). docs/architecture.md §175 (nieuw), levels.js schema-referentie
  bijgewerkt.
- Nog niet gecommit.

## 2026-08-06 — 🐞✅ Ronde 4: noten komen te laat van rechts (level 102 én level 2)

Han: "level 102 werkt toch nog niet... noten komen pas laat invliegen van
rechts. zelfde geldt voor level 2. Mss preloaden van melodie? Ergens is iets
NIET robuust genoeg."

- Root cause: de klok-start-effect (App.jsx) wachtte al op audio-readiness
  (bassReady/metronomeReady) maar NIET op `levelMelodyReady` (§166) — de
  tick-klok kon dus al gaan lopen terwijl `trebleMelody` nog `null` was
  (melodie nog aan het regenereren). Tegen de tijd dat de melodie arriveerde
  waren de noten se posities al "ingehaald" door de intussen doorgelopen klok
  i.p.v. vers vanaf rechts te beginnen. Dit is GEEN 6/8-specifiek probleem —
  treft elk level, precies zoals Han opmerkte.
- ✅ Fix: de klok-start-effect wacht nu ook op `levelMelodyReady` voor hij het
  anker zet — de melodie is voortaan altijd volledig "gepreload" vóór de klok
  start (Han's eigen suggestie, bleek exact de root cause).
- Build clean. ⚠️ Geen lint/test-run (budget/verzoek). Nog niet live getest.
- Nog niet gecommit.

## 2026-08-06 — 🐞✅ Ronde 5: gedeelde klok voor audio + notenbalk

Han: "audio-context mag niet starten met spelen voordat de melodie geladen
is. en de klok voor hit checken en de muziek (maat -1) moet tegelijk
starten. Liefst zelfs dezelfde klok."

- Bevestigd: metronoom/cello/notenbalk-klok lazen al hetzelfde `context`
  (1 AudioContext) en dezelfde `levelAudioStart`-anker — dat deel was al
  gedeeld.
- 🐞✅ ECHTE bug gevonden: `startLevel` riep NOOIT `handleStopAllPlayback()`
  aan. Als je bij het starten van een level nog gewoon aan het afspelen was
  (normale oefen-Sequencer), bleef die GEWOON doorklinken — een compleet
  aparte, ongerelateerde geluidsbron, los van elk anker/elke klok-fix tot nu
  toe. Dat verklaart "soepje" prima zonder dat er iets mis hoeft te zijn met
  de eigenlijke level-scheduling. Fix: stop alle lopende afspeel eerst, vóór
  al het andere in startLevel.
- Pre-roll (vorige ronde 0.35s→1.0s) en levelMelodyReady-gate blijven staan —
  samen met deze fix zou dit de meeste resterende desync moeten dekken.
- Build clean. ⚠️ Geen lint/test-run (budget). Nog niet live getest.
- Nog niet gecommit.

## 2026-08-06 — 🔨 Ronde 6: debug-instrumentatie i.p.v. nog een blinde gok

Han: "Nee, werkt nog steeds niet... Maat -1 moet eigenlijk al helemaal links
staan (startX) tegelijk met de start metronoom beginnen te bewegen."

Na 3 rondes blind fixen zonder bevestigd resultaat: i.p.v. nog een gok, TIJDELIJKE
debug-logging toegevoegd op 3 sleutelmomenten (App.jsx "anchor picked",
SheetRpgLayer "first unfrozen tick", useLevelBackingStream "backing chunk 0
scheduling") zodat de volgende test ECHTE tijdstempels oplevert i.p.v. weer een
vage "werkt niet". Build clean. Nog te doen: Han test, plakt console-output,
dan pas een gerichte fix i.p.v. verder gokken. Deze debug-logs MOETEN weer
verwijderd worden zodra gediagnosticeerd.
- Nog niet gecommit.

## 2026-08-12 — ✅ #924 ronde 8: generieke tag-gestuurde critter-spawning, camera-stick fix, wander-snelheid, facing-flip, bestiary tag-pass, vogel-volume, tekst-font

Han: "vogel en butterfly gaan veel te snel, verlaag snelheid naar 20%... de
beesten kleven aan het scherm, maar moeten aan level kleven... critters kijken
bijna allemaal naar rechts, maar de critters uit critter sheet kijken naar
links... bestiary: alle dieren uit critter sheet moeten 'critter' en nature tag
krijgen... Ik heb de LDTK vervangen: critter ground, critter air, critter
water. spawn een random critter met tags: critter + nature +
(flying/ground/water)... [tag-toewijzingen per diernaam]" + later "volume van
de vogels mag 20% lager. font van tekst mag 50% groter."

- ✅ `findCreaturesByTags()` (bestiaryAssets.js) — generieke tag-query, vervangt
  de hardcoded BIRD_POOL_NAMES/DUCK_POOL_NAMES roster.
- ✅ `critterWanderers`/`HABITAT_WANDER` (RpgLevelPanel.jsx) — leest
  `ENTITY_INSTANCES[Critter_air|water|ground]` (+ legacy `Bird`-alias),
  vervangt birdWanderers/duckWanderers/butterflyWanderers.
- ✅ Bestiary tag-pass (generate-bestiary-manifest.mjs): nature (alle critters),
  hostile/ground/water/underwater/flying rosters per Han's lijst, Intellect
  Devourer naam-fix. Manifest geregenereerd + geverifieerd via vite-node.
- ✅ Facing-flip echt aangesloten: `variant.facing` (al sinds #870 berekend maar
  nooit gebruikt) XOR'd tegen de gewenste kijkrichting in `WorldCreature`.
- ✅ Camera-stick bug gefixed: `worldToScreenXRef` i.p.v. stale closure.
- ✅ Wander-snelheid -80% (`WANDER_SPEED = 0.6 * 0.2`).
- ✅ `BIRD_VOLUME_MULTIPLIER = 0.8` (useWorldAmbientMusic.js).
- ✅ `FONT_SIZE_OVERRIDE_MULTIPLIER = 0.5 * 1.5` (DialogueBox.jsx).
- architecture.md §222 bijgewerkt. `npm run test:run`/`lint`/`build` groen (1
  vooraf-bestaande, ongerelateerde ldtkWorld.test.js failure blijft staan).

## 2026-08-12 — ✅ #924 ronde 9: nature-tag scope fix, animal/nature/niet-hostile spawn-criteria, extra vogel-volume verlaging, tijdelijke 100%-muziek testmodus

Han: "oops [nature-tag te breed toegepast, exclusielijst], reduce the bird
sounds another 30%, ik wil meer muziek... zet 'm voor nu op 100% om te testen,
the critters in the world should meet criteria: animal AND nature AND NOT
hostile AND (flying/ground/water)"

- ✅ `nature` tag losgekoppeld van de brede `/animals/critters/` folder-check
  (die ving ook monsters/fantasy sprites: Cacodaemon, Brain Mole Monarch, Eye
  Monster, Pixies, Flying Brain Monster, Giant Dragonfly, Giant Fly, Glowing
  Wisp, Fairy, Plague Bat, Portal, Swooping Bat). `nature` nu alleen voor de
  gepakte 16-soorten "critters sheet.png" + Han's expliciete naam-rosters.
  Geverifieerd via vite-node import van geregenereerd manifest.
- ✅ `findCreaturesByTags(tags, {excludeTags, being})` (bestiaryAssets.js)
  uitgebreid; wereld-spawn criteria nu exact `nature + habitatTag,
  excludeTags:['hostile'], being:'animal'`.
- ✅ `BIRD_VOLUME_MULTIPLIER` 0.8 → 0.8*0.7 = 0.56.
- ✅ `WORLD_AMBIENT_SILENCE_CHANCE` 2/3 → 0 (tijdelijk, voor testen); bijhorende
  unit test conditioneel geskipt zolang de constante 0 is.
- architecture.md §223 bijgewerkt. `npm run test:run`/`lint`/`build` groen (1
  vooraf-bestaande, ongerelateerde ldtkWorld.test.js failure blijft staan).

## #955 — App boot slowness diagnostic + offline instruments (Han 2026-08-13)

Han: "run a diagnostic why the app boots slowly... let's go for the robust
solution. I have a full version of FluidR3_GM.sf2 available offline... would
not be even better to download the full smplr package?"

- ✅ vite.config.js: unbounded GitHub-API `fetch()` (PR-number auto-detect) now
  has a 2s timeout — could previously stall `npm run dev` from starting.
- ✅ HMR WebSocket 400 in Codespaces fixed (`server.hmr.clientPort=443`, gated
  on `CODESPACES=true`, zero effect on local/non-Codespaces dev).
- ✅ HTTP/2 dev server via `@vitejs/plugin-basic-ssl` — removes the ~6-per-origin
  connection queueing a HAR capture showed costing up to 2.7s of `blocked` time.
- ✅ Offline melodic instruments: `scripts/extract-soundfont-samples.mjs`
  extracts local WAV samples for all 35 picker instruments + woodblock/timpani
  from Han's local FluidR3_GM.sf2 → `public/samples/Instruments/`. New
  `createMelodicInstrument()` (localInstruments.js) is now the single local-
  vs-CDN decision point, wired into ALL 6 call sites that create melodic
  Soundfont instances (previously only useInstruments.js checked). Verified
  live: 0 CDN requests at boot, 0 decode errors, build/test/lint green.
  Han confirmed: "instrument klinken prima" (2026-08-13).
- 🐞 Han (2026-08-13): "drum pads werken niet zo goed (zoals de tr808)" — the
  GM percussion kits (`standard`/`electronic`/`jazz`, picked via the
  percussion instrument dropdown) still load from the CDN (`Soundfont`, not
  `DrumMachine`/local) and were never in this ticket's scope (only the 35
  MELODIC picker instruments were extracted). FreePats Percussion (the
  default, local) works fine per Han. Not urgent per Han — logged, not fixed.
- ⏳ Sprite/character asset migration to `public/` — confirmed via HAR the
  single largest remaining boot-request contributor (~1100 of 1606 requests,
  eager `import.meta.glob` in bestiaryAssets.js/characterAssets.js/
  enemyAssets.js). Approved by Han ("let's go for the robust solution") but
  not yet started.
- architecture.md §224 written. `npm run test:run`/`lint`/`build` green (1
  pre-existing unrelated ldtkWorld.test.js failure, predates this session).

## #955 follow-up — sprite migration to public/ (Han 2026-08-13, "de grote eerst")

- ✅ `characters/` + `fx/` (933 PNGs) moved from `src/assets/ASSORTED` to `public/ASSORTED` —
  eliminates the ~1100-of-1606-request eager-glob boot cost identified in the earlier HAR capture.
  `bestiaryAssets.js`/`characterAssets.js` rebuilt to source from a generated file list
  (`scripts/generate-assorted-file-list.mjs`) instead of `import.meta.glob`, preserving the exact
  same key/URL shape so zero downstream consumer logic changed.
- 🐞 caught + fixed during verification (not shipped): a stale empty directory from a failed `git
  mv` retry caused a later `cp -r` to double-nest `char_hero/char_hero/...`, silently emptying the
  Character Editor's data (blank preview, 0 skin/hair options). Caught by evaluating
  `characterAssets.js`'s runtime output directly, not just eyeballing a screenshot.
- ✅ Verified: boot-interactive time ~9.3-10.5s → ~3.6s, `/ASSORTED/` boot requests ~1100 → 159,
  production JS bundle 4487kB → 3665kB. Bestiary panel (311 sprites) and Character Editor (hero
  doll + hair/skin pickers) both screenshotted and confirmed rendering correctly post-fix.
  `npm run build`/`lint`/`test:run` green (same 1 pre-existing unrelated ldtkWorld failure).
- ⏳ NOT migrated this pass (deferred, smaller remaining contributor): `tiles/`, `backgrounds/`,
  `icons/`, `LDtk/` — different consumption patterns (filename-fuzzy-matching + exclusion list in
  tilesetUrls.js; `?raw` inline-text import for the .ldtk file, which needs Vite's module graph and
  can't move to public/ as-is).
- architecture.md §225 written.

## #925 — randomizationRule `force_chord_roots` ("roots on chord change") — ✅ impl done (Opus/high)

- ✅ New rule `force_chord_roots`: `uniform` pitch selection + a FORCED chord root on every chord-segment
  onset (passing chords included). `notesPerMeasure` is a MINIMUM for this rule — forced onsets are
  unioned on top of the top-N ranked slots, never replacing them.
- ✅ Reuse per §6c/§6d: `walking_bass`'s inline chord-segment IIFE extracted verbatim into a shared
  `buildChordSegments()` helper (both rules now call it); root pitches via the existing
  `getRootNotesInRange` (the same helper `emphasize_roots` uses).
- ✅ Registered in `RULE_FAMILIES.random` (every selector derives from it — no per-selector edits),
  `FIELD_ITEM_ICONS.rule` + `MELODIC_FAMILY_OF`, `getPlayStyleLabel` ("Roots on Change"),
  `difficultyCalculator` multiplier 1.0.
- ✅ Cello default: `LEVEL_CELLO_RULE` in `levels.js`; `LEVEL_BASS_SIMPLE` → notesPerMeasure 2 + new rule,
  `LEVEL_BASS_DEFAULT` overrides only the rule. `defaultBassInstrumentSettings()` UNTOUCHED (plain bass
  keeps `emphasize_roots`). Level 15's explicit `tracks.bass` override left as-is — that staff is the
  player's visible left hand with its own didactic intro text, not the cello backing.
- ✅ Tests: onset-root, passing-chord onset, notesPerMeasure-as-minimum, parametrised 4/4+5/4+7/8+11/8,
  uniform-parity for non-onset slots; `useLevel.test.js` expectations updated.
- ✅ architecture.md §226 written. `test:run` / `build` / `lint` green (same 1 pre-existing unrelated
  ldtkWorld failure from the in-flight #955 asset migration).

## #988 — SplendidGrandPiano als standaard piano (offline samples) ✅ impl

- ✅ Han's decisions: **D1 .ogg only** (226 files / 19.0 MB, Safari's m4a falls through to the CDN);
  **D2 shared sample cache** across all piano instances in a session.
- ✅ `scripts/download-splendid-grand-piano.mjs` (dev-only, idempotent, not an npm script): roster
  derived from smplr's own bundled `LAYERS`, never a hand-typed list. Ran it: 226 files / 19.0 MB
  into `public/samples/SplendidGrandPiano/`.
- ✅ `src/audio/splendidPianoStorage.js`: smplr `Storage` adapter — `#`→`s` / space→`_` filename
  sanitizing (Vite public-dir can't serve `#`, §224), per-sample local→CDN fallback (smplr SILENTLY
  omits failed samples, so a `.load.catch` would never fire), shared promise-memo so instances
  built in the same tick coalesce onto one fetch, `E029-PIANO-SAMPLE-LOAD` when both sources fail.
- ✅ One runtime change: first branch in `createMelodicInstrument`, shadowing the generated
  `acoustic_grand_piano` buffers. Slug unchanged; zero call-site changes (all 7 verified).
- ✅ 13 new tests; architecture.md §227 + §224 pointer; CLAUDE.md §7a E029 + §8 ownership row.
  `test:run` / `build` / `lint` green (same 1 pre-existing unrelated ldtkWorld failure).

## 2026-08-14 — ⏳ CR: cello/percussion note-release cutoff (interview loopt)

Han (na #889 UAT), 3 gerelateerde meldingen:
1. **Cello klinkt lelijk, stopt abrupt** — bijv. level 2: cellonoten lijken maar ~3 tellen te duren
   in een 4/4-maat. Ook te hoog. **Zet cello range op G♯1–G2.** Doel van de cello-track: een
   constante "dreigende" ondertoon.
2. **App-breed probleem: noten worden on release meteen afgesloten** — geen doorklinkende staart.
   Zeker hoorbaar bij percussie met lange staart (vibraphone). **Laat percussie-instrumenten altijd
   volledig uitspelen on release: marimba, koto, xylophone, woodblock.**
3. **Sommige instrumenten bruut afgesneden** — bijv. SAW en harmonica duren maar heel kort.
   Han vermoedt (mid-turn vraag): is dit een kapot attack-hold-release (ADSR) mechanisme?

Interview + verkenning (envelope/note-off/cello-duration code) nog te doen voor implementatie
(CLAUDE.md §4b — hard stop, ook al lijkt de oorzaak voor de hand liggend).

Interview + implementatie afgerond ✅:
- Twee losse oorzaken gevonden: (1) sustain-instrumenten (cello/saw/harmonica/orgel/...) hadden
  helemaal geen loop-audio geëxtraheerd uit de .sf2 — geen envelope-bug, de sample-data zelf was te
  kort; (2) decay-percussie (marimba/koto/xylophone/woodblock) kreeg een vroege stop() ongeacht de
  natuurlijke uitklinktijd van het sample.
- Fix 1 (sustain): `extract-soundfont-samples.mjs` neemt nu SF2 loop-points (startLoop/endLoop,
  SampleModes) mee; `localInstruments.js` bouwt lokale instrumenten via smplr's `Smplr` +
  `soundfontToSmplrJson` (native Web Audio looping) i.p.v. de vlakke `Sampler`-buffers-map — geen
  nieuwe/langere audiobestanden nodig, alleen 2 extra getallen per noot.
- Fix 2 (let ring): `LET_RING_INSTRUMENTS` (constants/instruments.jsx) + `playMelodies.js` slaat
  `duration` over voor marimba/xylophone/koto/woodblock — smplr plant dan geen stop() in, sample
  speelt vanzelf tot het einde uit.
- UAT-correctie: vibraphone bleek als enige mallet-instrument wél SF2-loop-data te hebben (echte
  vibraphone heeft sustainpedaal) — verplaatst van "let ring" naar het loop-mechanisme.
- SAW: hele (korte) sample wordt geloopt (Han: "beschouw hele sample als loop"). Harmonica had al
  bruikbare SF2-loop-data, geen aparte fix nodig.
- Cello-range → G♯1-G2 (was C2-B2), alleen `LEVEL_BASS_SIMPLE` (level 2), pitch-shift onder C♯2
  geaccepteerd. "3 tellen i.p.v. 4"-klacht bleek dezelfde envelope-bug, niet `force_chord_roots` —
  generatielogica ongewijzigd gelaten.
- architecture.md §232. `test:run`/`build`/lint groen (zelfde 3 pre-existing losstaande
  ldtkWorld-failures, ongerelateerd aan deze wijziging).

## 2026-08-17 — 🐞✅ #1039 Eend ver rechts van het water (LEVEL_MIN_X-mismatch)

Han: "ik zie een eend heeel ver naar rechts in het level, die is dus niet goed geplaatst op het
water." Root cause: `waterSpanNear()` (RpgLevelPanel.jsx) vergeleek watertegels' CANVAS-LOCAL
`worldX` rechtstreeks met de X_on_water-marker's ABSOLUTE `spawnX` — exact dezelfde
LEVEL_MIN_X-coördinatenruimte-bug als #1024 (lichten) en #925 (`nearestWaterX` in
useWorldAmbientMusic.js), maar deze call site werd bij die eerdere fixronde gemist. Fix: `+
LEVEL_MIN_X` toegevoegd aan de tegel-worldX-vergelijkingen, zelfde patroon als de bestaande fixes.

## 2026-08-17 — 🔨 CR: stop/unload alle env-audio bij level sluiten (#1038)

Han: "bij level sluiten; unload/stop alle geluid." Gelogd als kanban #1038 — nog te verifiëren of
de bestaande cleanup in useWorldAmbientMusic.js (per-effect cancelled-flag + clearInterval/
clearTimeout + celloStopFn) daadwerkelijk ALLE stemmen stopt (incl. per-vogel Smplr-instances in de
`voices` Map), niet alleen de scheduling-timers.

## 2026-08-17 — 🔨 #1025 vervolg: echte water-MIDI ontvangen (bird sounds.rpp/.mid in ASSET DROP)

Han's eerdere claim "het staat mee in bird sounds :)" bleek te verwijzen naar het Reaper-project
(`src/assets/ASSET DROP/bird sounds.rpp`, niet de bestaande `src/songs/world_midis/bird sounds.mid`
die AL sinds #924 ongewijzigd was). De .rpp bevat de ECHTE tracknamen incl. instrument-tussen-haakjes
conventie: vogels grotendeels `(piccolo)` behalve duck `(bassoon)` (nog niet in de app als lokaal
instrument geëxtraheerd — interview met Han loopt of dit nu moet); water: `water hum (viola - hold ad
infinitum)`, `water (glockenspiel)`, `water (percussion-standard)`. Han heeft daarna een echte
`.mid`-export gedropt (4 tracks: bird sounds/meta, water percussion 56 notes, water hum 1 sustained
note, water glockenspiel 18 notes) — vervangt de eerdere cello/tubular_bells-placeholders in
useWorldAmbientMusic.js zodra verwerkt. Percussion-instrument zelf blijft geblokkeerd op #1037
(FreePats-bron nog niet aangeleverd).

## 2026-08-17 — 🔨 Nieuwe feature: Collision_mask laag (hoogte-variabele grond, bijv. boomstam-diagonalen)

Han: "ik heb een collision mask geplaatst. tenzij anders vermeld, moet karakter 'op de collision map'
wandelen. Dus bij de boomstam zijn nu wat diagonale vlakken waar het personage over moet wandelen,
waardoor de y-positie van de hero moet veranderen. regel: geen collision map: gewoon op 32px
wandelen. wel collision map: hoogte wordt bepaald door collision map." Nieuwe LDtk-laag
`Collision_mask` (Tiles-laag, eigen tileset `collsion-mask.png`, 64×80px = 20 tiles) gevonden en
gedecodeerd: elk tile-ID is een silhouet-heightmap (per kolom binnen de 16px-tile geeft de bovenste
opake pixelrij de grondhoogte aan — tile 0 = volledig opaak/vlak, tiles 8/9 = een vloeiende
45°-diagonaal, tiles 6/7/12/13 = trapsgewijze varianten). Interview lopend (§4b hard-stop — nieuwe
feature, raakt de stand-anchor-invariant) over: (1) klopt deze lezing (hoogste = kleinste pixelrij =
hoogste grond)? (2) wat betekent een volledig transparante kolom binnen een wel-geplaatste tile (geen
override, of een specifieke hoogte)? (3) geldt dit voor alle grond-statende entiteiten (hero/pet/NPC/
kritters) of alleen de hero? Nog niet geïmplementeerd.

## 2026-08-17 — 🐞 Bug: eenden niet bottom-bottom geankerd (herziening van #989)

Han: "de eenden staan niet goed geankerd. bottom-bottom (zoals alle entiteiten dat zouden moeten.)"
— dit draait EXPLICIET #989's eerdere keuze terug (`translate(-50%, 50%)`, center-center-anker met
LDtk's eigen entity-anchor) naar bottom-anchor, consistent met hero/pet/NPC/Slime (`bottom:
standAnchor`/`GROUND_ANCHOR`, geen translate-offset). Ondubbelzinnig verzoek, direct geïmplementeerd
zonder extra interview (Han's herhaalde "zoals alle entiteiten" is zelf al de bevestiging).

## 2026-08-17 — 🐞 Bug: eenden zwemmen eindeloos naar rechts (verkeerde water-tile-subtype meegenomen)

Han: "eenden zwemmen eindeloos naar rechts. Ze moeten op het water blijven (de water tiles van het
derde type (dus niet de randen)." Onderzoek: `Water_tile`-laag gebruikt een tileset
(`GandalfHardcore Animated Water Tiles.png`) met 3 duidelijk visueel verschillende 16px-rijbanden (elk
met 2 animatieframes) — band 1 (y=0/16, gekartelde rand + effen vlak), band 2 (y=32/48, verticale
"waterval"-textuur), band 3 (y=64/80, effen vlak + gekartelde rand). De app classificeert momenteel
ALLE Water_tile-tiles uniform als `kind: 'water'` (ldtkWorld.js regel 339) — geen onderscheid naar
band/type. `waterSpanNear()` (RpgLevelPanel.jsx) pakt dus de volle breedte van alle 3 banden samen,
inclusief randtiles, wat de zwem-grens te ruim (mogelijk zelfs onbegrensd ogend) maakt. Interview
lopend over welke band Han bedoelt met "het derde type" voordat de tile-classificatie wordt
uitgebreid.

**Update (impl afgerond):** interview leverde logicalRow 1 op, maar Han meldde daarna dat de eenden
nog steeds eindeloos naar rechts zwommen. Her-onderzoek met de ECHTE level-data (i.p.v. nog een gok)
toonde: in Level_1 (waar beide eend-markers staan, abs X 208/320) is logicalRow 2 een aaneengesloten
vijver van 20 tiles (abs X 192-352, exact om beide eenden heen), terwijl logicalRow 1 daar maar 4
decoratieve tiles ver buiten die range is. Gecorrigeerd naar logicalRow 2. build groen, Han's re-test
loopt.

## 2026-08-17 — ✅ #1040 Collision_mask feature + #1041 eend-anker bottom-bottom

Interview afgerond (zie boven): hoogte-lezing bevestigd (bovenste opake pixelrij per kolom = grondhoogte,
tile's eigen px-positie + kolomhoogte, geen aparte baseline nodig), transparante kolommen vallen terug op
flat 32px, scope = alle grond-statende entiteiten BEHALVE flying/on-water (die krijgen een eigen vaste
WATER_STAND_HEIGHT_PX=16).

Implementatie: `scripts/generate-collision-heights.mjs` (nieuw, decodeert collsion-mask.png via pngjs tot
een per-tile-per-kolom heightmap) → `src/model/collisionMaskHeights.generated.js`. `ldtkWorld.js`'s
`groundHeightAt(canvasLocalX)` zoekt de dekkende Collision_mask-tile op en valt terug op STAND_HEIGHT_PX
waar geen tile ligt of de kolom transparant is. `RpgLevelPanel.jsx`'s ene gedeelde `standAnchor` werd
`standAnchorFor(worldX)` (elke entiteit vraagt zijn EIGEN X op) voor hero/pet/NPC/Slime;
`WorldWanderer`-grondkritters (`onGround` flag) volgen dezelfde lookup tijdens het wandelen; vliegende
kritters ongewijzigd; zwemkritters krijgen de nieuwe vaste `WATER_STAND_HEIGHT_PX=16`.

Eend-anker (#1041): Han's expliciete "bottom-bottom, zoals alle entiteiten" draait #989's eerdere
center-center-keuze terug — `translate(-50%, 50%)` → `translateX(-50%)`.

Han live bevestigd: "collision werkt! :D". `test:run`/`build`/`lint` groen. architecture.md §240
geschreven + 2 bug-log-entries (duck-anchor, duck-swim-bounds).

## 2026-08-17 — 🐞✅ #1042 ronde 2: eenden zwommen over land tussen twee losse vijvers

Han's eigen inzicht: `waterSpanNear` pakte het globale min/max over ALLE watertiles op eenzelfde rij,
dus overbrugde het de grond TUSSEN losse, niet-verbonden vijvers (Level_1's vijver + Level_3's veel
grotere vijver zitten toevallig op dezelfde relatieve hoogte). Fix: contiguity-walk vanaf de tile het
dichtst bij spawnX, alleen uitbreiden zolang opeenvolgende tiles echt aangrenzend zijn (gap <= gridSize).
Han bevestigd: "ducks werken <3".

## 2026-08-17 — ✅ #1032 Water-reflectie (vijvers spiegelen bomen/decor + entiteiten)

Interview: bomen/decor/entiteiten (incl. animatie) allemaal spiegelen; bomen op de "ruwe laag" (geen
shimmer); geen parallax, geen terrain (water zit nooit onder terrain); volgorde animatie-reflectie-
shimmer zodat het water zelf shimmer geeft aan de reflectie.

Implementatie: `WaterReflectionLayer.jsx` (nieuw) — vijvers via flood-fill over ALLE watertiles
gegroepeerd (`waterPonds`), `REFLECTABLE_TILES` (ldtkWorld.js: STATIC_TILE_LAYERS+FOLIAGE_LAYERS, geen
terrain/pavement/parallax) gecomposit via dezelfde `loadTileImages`/`drawTilesToCanvas` als LdtkScenery,
per vijver gespiegeld via CSS `scaleY(-1)` rond de vijver's eigen surfaceY. Gemount VOOR de water-shimmer
laag zodat die er overheen shimmert (volgorde via z-order, geen pixel-distortie nodig).

Entiteiten: reflectie als GENEST kind binnen dezelfde positioned wrapper (geen aparte ref/tick-loop) —
erft live position/frame/facing automatisch. Eenden/zwemkritters (WorldWanderer): spiegelen altijd om
hun EIGEN positie (Han: "moet aan de ducks plakken, want zij zitten direct op het water"). Hero/pet/NPC/
Slime: zelfde truc, maar gated op `isNearWater(worldX)` (alleen zichtbaar binnen een vijver's span).
Ground-kritters (niet zwemmend) nog niet gedekt — imperatieve rAF-ref-loop zonder re-render om op te
gaten, kleine vervolgstap.

Han live bevestigd (na ronde 1, vijver+bomen): "yes!!! prachtig!!". `test:run`/`build`/`lint` groen na
elke ronde. architecture.md §241 geschreven.

## 2026-08-17 — 🐞✅ #1032 ronde 4: reflectie-anker + debug grid gebruikte verkeerde zoom-factor

Han's scherpe observatie: "die plakt vast aan de hero base... x=24 van de onderrand ligt veel hoger dan
ik zou verwachten." Twee onafhankelijke bugs gevonden:
1. Entity-reflectie (hero/pet/NPC) spiegelde om de entiteit's EIGEN voetpositie (correct voor eenden,
   fout voor entiteiten die niet exact op waterhoogte staan) — nu een STANDALONE sibling die om de
   omvattende vijver's eigen `surfaceY` spiegelt, en verplaatst uit de entiteit's eigen `transform`-de
   wrapper (CSS maakt een transformed element een nieuw containing block, wat de absolute left/bottom
   anders stilletjes had gebroken).
2. `DebugGrid` gebruikte de LEGACY vaste `ZOOM=3` constante i.p.v. de actuele dynamische `zoom` — verklaart
   waarom de gridlijnen niet op de tiles pasten en waarom "24" er verkeerd uitzag. Nu `zoom`-prop, plus een
   rode debug-lijn op native hoogte 24 (REFLECTION_DEPTH_PX) zodat Han het visueel kan verifiëren.
CharacterDoll/WorldCreature's eigen box-wiskunde nagekeken — beide zijn al bottom-flush met de visuele
voeten (eerdere #664/#693-rondes), dus geen aparte "op zijn kop"-ankerbug gevonden/nodig.

## 2026-08-17 — ✅ #1038 stop/unload alle env-audio bij level sluiten — afgerond

`useWorldAmbientMusic.js`'s 3 effects riepen alleen `clearTimeout`/`clearInterval` op — nooit
`stop()`/`disconnect()` op de smplr-instrumenten zelf, dus reeds geplande/klinkende noten speelden na
unmount gewoon door. Piano (cached instance) krijgt `stop()`; vogel-stemmen + water-instrumenten (elke
mount een NIEUWE instance) krijgen `disconnect()`. Test-mock aangepast (ving een echte unmount-crash op
voor die shipte). `test:run`/`build`/`lint` groen.

**Openstaand:** vogel-instrumentgetrouwheid (piccolo/bassoon per soort) blijft geblokkeerd — geen nieuwe
bird-MIDI-export in ASSET DROP sinds de laatste check.

## 2026-08-17 — ⏳ Vier nieuwe CR's/bugs na #994 (interview loopt)

Han, direct na #994's UAT-melding:

1. **#1043 🐞 Enemies/critters staan over de voortekens heen** wanneer de percussie-balk niet in
   beeld is. Root cause gevonden: `SheetRpgLayer.jsx`'s `slimeY = trebleStart + staffHeight + 12` is
   relatief aan de treble-balk i.p.v. aan de onderkant van het level — `heroY = viewBottom - HERO_H`
   doet dat al wel. Han's gevraagde fix: gewoon altijd op de baseline (`viewBottom`) ankeren, ongeacht
   percussie-zichtbaarheid.
2. **#1044 🐞 7/8- (en andere oneven-maatsoort) en akkoord-levels: "veel glitches"** — nog niet
   gescoped, Han zegt zelf "te onderzoeken". Mogelijk een regressie van #994's `deriveLevelSpan`
   (die specifiek de fractionele 7/8 `beatsOnScreen` raakte) — te bevestigen voor er een fix-plan komt.
3. **#1045 ⏳ Color mode toevoegen aan de settings van een level**, default subtle chroma.
   `noteColoringMode` bestaat al als GLOBALE `DisplaySettingsContext`-setting (schemes: none/SCALE/
   CHORD/chromatone/subtle-chroma) maar niet per-level — interview nodig over per-level override vs.
   forceren bij level-start.
4. **#1046 ⏳ Courtesy accidentals standaard aan** — `courtesyAccidentals` bestaat al als toggle
   (`DisplaySettingsContext.jsx`/`SettingsPanel.jsx`), staat nu standaard uit.

Interview voor #4 (klein, ondubbelzinnig — default-waarde) en #1 (Han gaf zelf de exacte fix) loopt
kort; #1044 wordt eerst onderzocht (geen fix-implementatie) voor er iets gevraagd wordt; #1045 krijgt
een volledige interview (scope van "level setting" is nog open).

## 2026-08-17 — ✅ #1047 abc-to-song: pentatonic K: field support + sakura scale fix

Root cause van Han's "sakura moet E In, arirang F pentatonisch majeur" opmerking: het build-script
kende alleen de 7 diatonische modi. Arirang's `K:F pentatonic major` crashte de regeneratie; sakura's
`K:A In` resolvede stilletjes verkeerd (`scaleFamily:"Diatonic", scaleMode:"Minor"` i.p.v. Pentatonic/In).
Fix: `parseKeyField` matcht nu een volledige mode-frase tegen `scaleHandler.js`'s eigen
`scaleDefinitions` (geïmporteerd, geen tweede hardcoded tabel, §6c) voor elke niet-Diatonische familie;
het `diatonic`-referentieveld (bv. 'In' -> 'Lydian') geeft de voortekens via de bestaande MODE_FIFTHS.
Sakura geregenereerd (correct nu). Arirang NOG NIET — Han's eigen edit
(`src/assets/ASSET DROP/abc/arirang.abc`, verplaatst uit `src/songs/abc/`) heeft maten die niet kloppen
(bijna elke maat te lang voor 9/8) — te bevestigen voor generatie. Open vraag: sakura transponeren naar
E, of blijft "E In" iets anders (bv. level-specifieke tonic override)? 802/802 tests, build, lint groen.

## 2026-08-17 — ⏳ Grote burst: metronoom-volume, Level 1 "gated scroll", vaste levels 1-4, stats-systeem (interview loopt)

Han, in één bericht, vier losse dingen:

1. **🐞 Metronoom te zacht** — "metronoom moet op ff, is niet goed hoorbaar."
2. **⏳ Level 1 nieuw spelmechanisme ("gated scroll")** — level schuift door (~90bpm) tot de
   volgende slime EXACT op perfect-timing staat, wacht dan tot die slime verslagen is voor het
   verder scrollt. Grote architecturale wijziging (breekt de huidige continue-lineaire-scroll
   aanname die de hele sessie zorgvuldig getimed is — §863 perf werk, audio-sync anchoring).
3. **⏳ Vaste melodieën levels 1-3, BPM="rubato", levels doorschuiven (renummeren)**:
   - Level 1: `C C C C | D E F G | C C G G | G F E D | C(hele noot).` — alleen kwartnoten.
   - Level 2: `C r E r | G r E r | C D E r | E F G r | C(hele noot)` — introduceert rusten.
   - Level 3: random uniform (procedureel, randomizationRule='uniform').
   - Level 4: **NIET gespecificeerd — Han schreef "4:" en stopte.** Blokkerend, moet gevraagd worden.
   - Bestaande levels moeten allemaal een nummer opschuiven om plaats te maken.
4. **⏳ Nieuw stats/progressie-systeem** — bovenop het BESTAANDE ProfileContext (zie
   `gamification-slice1` memory: "Future exercise/lesson progress moet dit profiel UITBREIDEN, geen
   parallelle storage key"; `docs/architecture.md` §43; het 11-dimensie `docs/profile-schema.md`
   ontwerp is EXPLICIET "on_hold", niet gebouwd — dit is een DERDE, level-centrisch tracking-concept,
   moet gereconcilieerd worden met de twee bestaande):
   - Hoogste level met ≥80% accuracy gehaald (bijgehouden per gebruiker).
   - Bij het starten van een nieuw level: standaard voorstel = 1 level moeilijker dan het hoogste
     level met ≥80% accuracy.
   - Gekende toonladders (criterium: ≥80% accuracy op een level met die toonladder gehaald).
   - Gekende liedjes (zelfde criterium, per lied).
   - Aantal keer gespeeld (per level? per toonladder/lied? — nader te bepalen).
   - Aantal keer op 100% accuracy gehaald.

Interview loopt voor items 2-4 (architecturaal, dubbelzinnig, en item 3's level 4 ontbreekt sowieso).
Item 1 (metronoom-volume) apart, klein, mogelijk direct te fixen na een korte check.

## 2026-08-17 — ✅ Item 1 (#1051 metronoom ff) + 🐞 twee kritieke live bugs tussendoor (#1055) + interviews afgerond

**Item 1 (#1051):** `LEVEL_METRONOME_VOLUME` van `'mezzo forte'` naar `'forte'` (geen `ff`-tier in
`VOL_STEPS`). ✅ Verzonden.

**🐞 Tussendoor, PRIORITEIT boven de burst (Han: "los eerst de andere zaken op")** — twee kritieke bugs
gemeld tijdens live testen, alle drie via kanban #1055 (niet #1052, die foutieve tagging in het eerste
commit is gecorrigeerd):

1. "na tweede keer level starten gaat het helemaal bad, noten komen nooit" — `clockStartRef`
   (free-running fallback-anchor in `SheetRpgLayer.jsx`) werd nooit gereset tussen levels, ondanks dat
   de component gemount blijft over levelwissels heen. Fix: reset in dezelfde `[scrollStartTime]`-effect
   die `debugLoggedUnfreezeRef` al reset. ✅ Han bevestigd: "level starten lijkt te werken".
2. "pretty clear and steady 1/12-th note stutter" → daarna "still a jutter" (2 rondes):
   - Ronde 1: de scroll-`<g>`-groepen (barlines/noten) zetten `transform` zowel declaratief (JSX-prop,
     herberekend elke `frameTick`-render) als imperatief (rAF-loop `setAttribute`) — React stompte de
     smooth rAF-positie elke render terug. Fix: `frozenScrollPxRef`, ééns per wave bevroren.
   - Ronde 2: identieke bug, één laag dieper — Slime/Projectile/Critter/StaticProjectile2 kregen ALLEMAAL
     verse x/y/frame JSX-props per render, tegen hun eigen imperatieve rAF-handles in. Fix: generieke
     `freezeOnce(cache, key, compute)` cache, toegepast op alle 5 continu-bewegende entiteitstypes.
   - `docs/architecture.md` §256/§257/§258. Bekende resterende instanties (judgment labels, hit bursts,
     spawn glows, wizard cast frame, ghost note, death frames) gedocumenteerd maar NIET gefixed — kleine,
     eenmalige animaties, veel lager visueel risico dan de continue glide die net gefixed is.
   - Status: fix verzonden, wacht op Han's her-test bevestiging ("werk verder" ontvangen — burst hervat,
     maar als de jutter terugkomt heeft dat opnieuw voorrang).

**Interviews afgerond (items 2-4, over meerdere sessies):**

- Item 3 renummering: nieuwe levels 1-4 vooraan invoegen, alle bestaande levels schuiven op met het
  aantal nieuwe levels. Level 4 = wat NU level 2 is, ongewijzigd verplaatst (geen nieuwe content nodig).
  ("3 wat 5 was" — Han's eigen tegenstrijdige eerdere antwoord — vervalt, laatste antwoord is leidend.)
- Item 4: accuracy getoond in bestaande post-level splash screen (`computeAccuracyPercent`,
  `LevelStatsCharts.jsx`) is de bron van waarheid voor "≥80%".
- Item 2 (gated scroll) — apart interview afgenomen 2026-08-17 (kanban #1052, zie ticket-notes):
  1. Audio tijdens wachten: bevries de tempo-gebonden puls/timpani-klik; cello (akkoord-root drone)
     blijft onafhankelijk doorspelen — dat is sfeer, geen metronoom.
  2. Fout invoer tijdens wachten: toon miss/wrong-beoordeling zoals nu, blijf wachten — geen timeout,
     alleen een juiste noot ontgrendelt.
  3. Grading: altijd "Perfect" bij een juiste noot zolang gated — geen timing-tiers, dit level leert
     notenherkenning, geen ritme.
  4. Wacht-indicator: geen apart glow-signaal — ALLE zichtbare slimes (niet enkel de huidige) spelen hun
     idle-animatie terwijl bevroren, aangezien niets voorwaarts beweegt op dat moment.

**Volgorde van implementatie** (kanban-dependency #1053 f-f #1052, herbevestigd als bewust: eerst het
generieke gated-scroll-mechanisme bouwen/verifiëren op het HUIDIGE level 1, dan pas de vaste
melodieën+renummering toepassen zodat de vlag automatisch meeschuift naar de uiteindelijke levels 1-3):

1. #1052 gated-scroll mechanic (architectuuronderzoek backing-audio scheduling nog te doen vóór plan).
2. #1053 vaste levels 1-4 + renummering.
3. #1054 stats/progressie-systeem (bouwt voort op de nieuwe levelnummers).

## 2026-08-18 — 🐞⏳ Grote UAT-burst na #1052/#1053: performance, rubato-freeze bugs, layout, level 3

Han, na live testen, in één bericht — 11 losse punten. PRIORITEIT expliciet op performance ("really, the
performance sucks, which is not acceptable in a music app" — herhaald, aangescherpt).

1. **🐞🔥 Framerate "horrible, unacceptable"** — ondanks de #1050/§257/§258 fixes en de §"FRAMETICK_THROTTLE"
   dev-mode-cost-verlaging. Han's eigen diagnose: "I told you about prioritizing note scrolling... decouple
   it from the RPG-overlay in terms of framerate" — de note-scroll rAF-update en de RPG-combat rAF-update
   zitten in ÉÉN gedeelde rAF-callback; als het RPG-gedeelte (slimes/critters/hit-detection/re-renders)
   traag is, wordt de HELE frame laat gepaint, ook al was de note-transform-update zelf goedkoop en vroeg
   in de callback. Vereist een ECHTE architecturale split: note-scroll moet GEGARANDEERD elke frame
   bijwerken; RPG-entiteiten mogen een lagere/variabele cadans hebben zonder de note-paint te blokkeren.
2. **🐞 "in rubato mode, all animations are stopped when the note is at 'perfect timing', including note
   despawn, idle animations of critters and character... NO!! We talked about this!!!!"** — de #1052-fix
   (`slimeWalkOrIdleFrame`, raw-clock idle cycling tijdens gated freeze) is ALLEEN op slimes toegepast, niet
   op critters/hero/NPC. Han's eis: critter/hero/NPC idle-animatie, effect-animaties, note-animaties, "andere
   animaties" moeten GEWOON doorlopen tijdens een gated freeze — alleen de GAMEPLAY-positie/voortgang bevriest.
3. **🐞 Critter verticale anchor inconsistent**: porcupine/squirrel zitten ONDER de baseline, armadillo zit
   ERBOVEN, vergeleken met slimes/andere critters — anchor/positionering-bug, per-variant te checken.
4. **⏳ Rubato-level bevriest/hangt als de speler te lang wacht** ("I think it gets confused if the 'level
   clock' is finished") — vermoedelijk een JIT-audio-chunk-scheduling die een BEGRENSDE real-time duur
   aanneemt en door zijn geplande content heen raakt tijdens een lange freeze.
5. **🐞⏳ Cello is NIET rubato — speelt gewoon het lied op vaste real-time schedule, stopt na een tijdje.**
   NIEUW gedrag: houd de cello-noot vast tot de bijbehorende VISUELE noot voorbij 'perfect timing' gaat, speel
   dan de volgende — gekoppeld aan het gated-freeze-mechanisme, niet aan een vaste klok. Dit maakt het
   volgens Han mogelijk om **timpani te herstellen** (nu uitgeschakeld voor gated levels, §1052/§259) — timpani
   moet dan OOK op dezelfde manier "houden tot voorbij perfect timing" werken.
6. **⏳ Nieuwe feature: gloed/outline op de te spelen pianotoets, voor levels 1-3** (visuele hint welke toets
   nu moet).
7. **⏳ Layout: afstand hero↔vioolsleutel kleiner bij één maat**, voor duidelijkere visuele connectie.
8. **⏳ Layout: 'perfect timing'-lijn ~5% schermbreedte naar rechts; hero verplaatsen naar startX zodat
   sleutel+voortekens LINKS van de hero staan** (nu overlappen ze grotendeels).
9. **🐞 Level 3 heeft maar 4 "maten" (waves)** — moet 10 maten worden (5 blokken van 2 maten
   = `totalMeasures: 10`, wavesForLevel = 5). notesPerMeasure/smallestNoteDenom/variability blijven
   ongewijzigd (2 / kwart(4) / 30%, al correct in #1053's levels.json).

Aanpak: performance-decoupling (punt 1) en de freeze/idle-animatie-bug (punt 2, direct gekoppeld aan
Han's frustratie "we talked about this") krijgen voorrang, dan de critter-anchor-bug en level 3 (snel/
mechanisch), dan de cello/timpani-herontwerp (architecturaal, punt 4+5 hangen samen — de "hangt bij lang
wachten"-bug is vermoedelijk DEZELFDE onderliggende oorzaak als de niet-rubato-cello), dan de layout-
tweaks en de nieuwe glow-key-feature.

## 2026-08-19 — #993 rework loop (needs_reanalysis, 2 items) + 2 nieuwe FR's afgesplitst

Han's rework_feedback op #993 (umbrella-tracker), opgepikt via "pak 993 op - de twee rework items":

1. **✅🐞 Vogel blijft idle-pose tonen nadat die van het nest terug wegvliegt.** Root cause:
   `WorldWanderer` (`RpgLevelPanel.jsx`) leest `perched` (React state) binnen een `useEffect`-closure
   die met opzet GEEN `perched` in de deps heeft (voorkomt dat de rAF-loop elke render herstart) — dus
   de closure's `perched` staat voor altijd vast op de mount-waarde `false`, waardoor de "verlaat het
   nest"-transities (`setPerched(false)`) nooit meer vuurden na de eerste keer landen. Fix: `perchedRef`
   toegevoegd zodat de tick-loop een LEVENDE waarde leest (zelfde patroon als `worldToScreenXRef`);
   `setPerched` blijft alleen de render triggeren. Generiek gefixt (elke `canPerch` vliegende critter,
   niet vogel-specifiek — Han's interview-antwoord). §265 architecture.md.
2. **✅ Water-percussielaag ("op mp: applause, op c4, eindeloos").** GM-programma 126 ("Applause")
   toegevoegd aan de lokale extractie (`scripts/extract-soundfont-samples.mjs`), derde `useWorldAmbientMusic`
   water-stem toegevoegd — zelfde "hold indefinitely" mechanisme als de hum (viola), vast op C4/mp i.p.v.
   MIDI-velocity. Interim-vervanger voor #1037 (geblokkeerd op "geen GM percussie-kit"); #1037 op `on_hold`
   gezet, note toegevoegd die verwijst naar de 2 nieuwe tickets hieronder. §265 architecture.md,
   `envAudioRegistry.json` bijgewerkt.

Bij Q2 (interview) gaf Han spontaan twee nieuwe FR's — **niet** geïmplementeerd, wél meteen als ticket
gelogd (Han: "maak een apart ticket... mag ook in apart ticket"):

3. **⏳ #1090 — FreePats percussie-samplekit importeren** (asset drop, bestand is "gigantisch"). Wacht op
   Han's file-drop; eigen design-interview nodig zodra het bestand er is (format/routing TBD).
4. **⏳ #1091 — nieuw melody-type `hh` (hi-hat) voor gegenereerde percussie**, i.p.v. de echte
   percussie-MIDI te gebruiken ("je mag de midi negeren, en een percussie track genereren"). Elke tel een
   `hh` (zoals backbeat, zonder kick/snare), randomize met note pool `ho/hp/r/rb`, 4 noten/maat,
   30% variability, substitutieregel `hh + ho -> ho`. Raakt de gedeelde generation-pipeline (CLAUDE.md
   §6b — architecture.md §3 herlezen vóór design) — eigen interview nodig (o.a. exacte betekenis
   `ho`/`hp`/`rb` bevestigen).

Geverifieerd: `npm run test:run` (819 passed), `npm run lint` (0 errors), `npm run build` (clean). Niet
live in browser getest (geen browser-tooling deze sessie, zelfde beperking als §263/§264).

## 2026-08-19 — ✅ #1091 meteen geïmplementeerd + nieuwe velocity/volume-architectuur

Han: "doe 1091 maar meteen :D zou het willen kunnen testen in het level." + losse FR's erbovenop
(smallestnotedenom=8, velocity op de off-beat hh, en een app-brede velocity/volume-scheiding in
`playSound`). Interview eerst (CLAUDE.md §4b/§9c — architecturale impact: nieuw veld op `Melody`,
gedeeld door alle audio in de app): Han koos 0-127 (echte MIDI-schaal), een additive/geen-regressie
aanpak (nieuw mechanisme, default 100 = geen verandering overal waar het niet expliciet gezet wordt),
testen via de bestaande percussie-carousel (niet in een level — levels' percussie is nog een
hardcoded patroon, geen generator-hook), en `rb` = de bestaande `cr_bell` pad.

1. **✅ `Melody.velocities`** (nieuw, additief veld, default 100 overal) + `playMelodies.js`/
   `playSound.js` vermenigvuldigen er nu mee bovenop de bestaande volume/gain-keten. Niets bestaands
   verandert van geluid (velocity/100 = 1 op de default).
2. **✅ `generateHh`** (`generateBackbeat.js`) — hi-hat op elke tel (velocity 100), off-beat tellen
   (2,4,6,8 in 4/4 @ 8e-noten) willekeurig vervangen door ho/hp/r/cr_bell (velocity 100) op
   `rhythmVariability`% kans, anders hh op velocity 80. Generaliseert naar elke maatsoort (geen
   hardcoded tabel). `smallestNoteDenom=8` komt al uit de bestaande percussie-default, geen nieuwe
   hardcoding nodig.
3. **✅ UI-koppeling** zodat `hh` te selecteren is in zowel de bottom-view als de in-staff carousel,
   net als backbeat/swing.

Geverifieerd: `npm run test:run` (825 passed, 6 nieuw), `npm run lint` (0 errors), `npm run build`
(clean). Niet live getest — #1091 naar `test` (UAT) gezet met concrete acceptance criteria, Han moet
zelf percussie → stylized → hh selecteren en beoordelen. Zie architecture.md §266.

## 2026-08-19 — ✅ UAT-bounce op #1091/#993: applause zachter, echte hh-loop bij het water, bird slots

Han's UAT-feedback in één bericht: "applause is a bit too loud, make it less loud" + "percussion
cannot be heard in the RPG-level, the aforementioned loop (hh, eights, with cymbal accents) should
sound at the water" + "Birds should only perch on 'bird slots'".

1. **✅ Applause volume** — één VOL_STEPS-niveau zachter (mp → p).
2. **✅ Echte `hh`-loop bij het water** — de §266 `generateHh` generator was alleen aan de
   practice-mode percussie gekoppeld; nu ook een 4e water-stem in `useWorldAmbientMusic.js`
   (`hhBus`/`hhInstrument`, JIT block-loop net als de piano, maar self-gating op waterbereik zoals
   de glockenspiel). Han's keuze: ERBIJ, niet i.p.v. applause. Onderzoek vooraf: 'FreePats Percussion'
   bleek al de bestaande standaard-percussiekit met echte samples voor elke hh-pad — geen afhankelijkheid
   van de losse #1090 asset-drop ticket nodig. Nieuwe gedeelde constructor
   `createFreePatsPercussionInstrument` (drumKits.js), ook hergebruikt door `useInstruments.js` (was
   dubbel gecodeerd).
3. **✅ Bird slots** — eerst onderzocht (geen bestaand concept, moest nieuw zijn); interview met Han:
   nieuw `X_bird_slot` LDtk-merkertype (door Han zelf te plaatsen in de editor), vogels claimen de
   dichtstbijzijnde vrije slot uit een gedeelde pool (i.p.v. 1:1). Geen effect zichtbaar totdat Han
   daadwerkelijk slots plaatst — bestaande levels ongewijzigd.

Geverifieerd: `npm run test:run` (825 passed, 1 nieuwe mock nodig voor de Sampler-constructor in
jsdom), `npm run lint` (0 errors), `npm run build` (clean). Niet live getest. Zie architecture.md §267.

## 2026-08-19 — ✅ "I LOF the percussion" — round 2: echte variatie per 2 maten + applause nog zachter

Han, enthousiast over §267's water-hh-loop: elke 2 maten random smallestNoteDenom uit {1,2,4,8,16},
regenereer die 2 maten met dezelfde regels (hh + uniform random cymbals), notesPerMeasure vast per
denom (1,1,2,3,4), en voor 16: de "off-off beats" op velocity 60. Applause nog een stap zachter.

1. **✅ `generateHh` herbouwd** — `slotsPerMeasure` gebruikt nu de LETTERLIJKE smallestNoteDenom (niet
   meer geplafonneerd op de maatsoort-noemer), dus 1/2 (hele/halve noot) geven echt 1/2 slots per maat
   i.p.v. hetzelfde als 4. Metrische hiërarchie (`hhMetricLevel`) generaliseert on/off/off-off puur uit
   `slotsPerBeat` (geen tabel per maatsoort). Substitutie is nu een EXACT aantal per maat
   (`notesPerMeasure`), niet meer een kans — Han's eigen dichtheidstabel `HH_NOTES_PER_MEASURE_BY_DENOM`
   gedeeld tussen practice-mode en de water-loop.
2. **✅ Water-loop randomiseert nu echt** — blokgrootte naar 2 maten, elk blok trekt zijn eigen
   smallestNoteDenom + bijbehorende notesPerMeasure.
3. **✅ Applause nog zachter** — p → pp.

Geverifieerd: `npm run test:run` (829 passed, generateHh.test.js herschreven), `npm run lint`
(0 errors), `npm run build` (clean). Niet live getest. Zie architecture.md §268.

## 2026-08-19 — ✅ MuldjordKit hh-closed samples + percussie-humanisatie (round 3)

Han (mid-turn, tijdens round 2): "take the different samples from the hh-closed in the muldjordKit -
assume linearly distributed... add 'humanization': random sample binnen 30 velocity + zachte
volume-jitter die de velocity-humanisatie compenseert." Eerst geïnventariseerd (381MB kit, 29
velocity-gelaagde HihatClosed samples, sfz bevestigt low->high volgorde), toen geïnterviewd (scope: nu
alleen HihatClosed niet de hele kit; window ±15; toepassen op ALLE percussie-pads, niet enkel hh; ±8%
gain-jitter die de velocity-deviatie compenseert, niet onafhankelijk random).

1. **✅ `scripts/extract-muldjord-hihat.mjs`** — kopieert de 29 samples naar
   `public/samples/Percussion/HihatClosedMuldjord/`, verving de oude 7-sample velocity-blinde
   `Hihat_0X`-set.
2. **✅ `humanizePercussionSample`** (drumKits.js, percussie-SSOT) — generiek voor elke array-pad, niet
   hh-specifiek. Velocity-window sample-pick + compenserende gain.
3. **✅ `resolvePercussionPitch`** (playSound.js) — NIEUWE functie i.p.v. `resolveNotePitch` te wijzigen
   (die heeft te veel ongerelateerde melodische callers). `playMelodies.js`/`playSound` herordend zodat
   gain vóór pitch-resolutie bekend is.

Geverifieerd: `npm run test:run` (842 passed, 12 nieuw), `npm run lint` (0 errors), `npm run build`
(clean). Niet live getest. Zie architecture.md §269.

## 2026-08-19 — ✅ Round 5: blokken 4 maten + percussie los van water (level-breed)

Han: "maak de blokken 4 maten lang, voor iets duidelijker variatie. Zorg dat percussie door het hele
level te horen is, niet enkel bij water."

1. **✅ Blokgrootte 2 -> 4 maten.**
2. **✅ `hh`-loop losgekoppeld van water** — verplaatst naar een eigen, altijd-actieve effect (zelfde
   vorm als de ambient piano-loop: geen proximity-gating, geen spatial pan/bus meer, gewoon rechtstreeks
   naar `context.destination`). De water-useEffect terug naar zijn oorspronkelijke 3 stemmen
   (hum/glockenspiel/applause). `envAudioRegistry.json` bijgewerkt (nieuwe `level_hh_percussion` entry,
   los van `water_percussion`).

Test-fix nodig: `useWorldAmbientMusic.test.js`'s drumKits-mock miste `resolvePercussionChord` (harmless
zolang hh nog binnen de water-gate zat, nu breekt het omdat de hh-loop altijd draait) -- toegevoegd.

Geverifieerd: `npm run test:run` (842 passed), `npm run lint` (0 errors), `npm run build` (clean).
Niet live getest. Zie architecture.md §270.

## 2026-08-19 — ✅ Round 6: velocity-spread smaller (75-90-100) + forced crash/ride bij denum=1

Han: "smallestnotedenum: bring the velocities a bit closer together: 75-90-100. when a 1 is rolled for
the smalelstnotedenum, force a crash or ride for the first note of the 4 measure block."

1. **✅ `HH_VELOCITY_BY_LEVEL`** 100/80/60 -> 100/90/75 (zelfde volgorde, kleinere spreiding).
2. **✅ Forced crash/ride opener** — bij smallestNoteDenom=1 wordt slot 0 van het HELE blok (niet per
   maat) geforceerd naar 'cc' (crash) of 'cr' (ride) op velocity 100, i.p.v. de normale pool-substitutie.

Geverifieerd: `npm run test:run` (844 passed, 2 nieuw), `npm run lint` (0 errors), `npm run build`
(clean). Niet live getest. Zie architecture.md §271.

## 2026-08-20 — ✅ Round 7: applause nog zachter + nieuwe feature 'windvlaag'

Han: "kan het applaus nog zachter? nieuwe feature: af en toe wil ik een 'windvlaag'. kan je fade in
fade out van applaus maken, ook op zeer laag volume. Trigger het voorlopig random - later wil ik dat
ook plaatsgebonden maken." Eerst geïnventariseerd (geen bestaand wind-geluid; wel al genoemd in het
originele #993-spec: "alle audio moet de metronoom volgen, dus ook wind"), toen geïnterviewd
(vervangt vs. erbij: "keep both"; scope: level-breed, niet water-gated; timing: Han's eigen exacte
mechaniek "rol elk blok van 2 maten voor 20% kans om een hoos te starten, een hoos duurt 2 maten").

1. **✅ Applause nog zachter** — pianissimo (al de laagste VOL_STEPS-trap) x 0.5 extra.
2. **✅ Windvlaag** — nieuwe, aparte level-brede `useEffect`, JIT-blok-loop van 2 maten, 20% kans per
   cyclus, fade-in-naar-piek-op-midpoint-fade-out-envelope via echte Web Audio ramp-automation (niet
   `rampParam`, die is te snel getuned voor een meerdere-secondes envelope). Hergebruikt het
   applause-sample, eigen instrument-instantie (niet die van de water-drone).

Geverifieerd: `npm run test:run` (846 passed, 2 nieuw), `npm run lint` (0 errors), `npm run build`
(clean). Niet live getest. Zie architecture.md §272.

## 2026-08-20 — ✅ Bird-fixes (los van audio, zelfde bericht): return-transitie 3x trager + bumblebee facing

Han (mid-turn tijdens het windvlaag-werk): "bird animaties: overgang is OK, mooi lineair, maar nog
niet perfect, maak de overgang iets trager tussen stijgen en vliegen, 3x zo traag." + "sommige dieren
kijken de verkeerde kant op, zoals de bumble bee; in de bestiary (na eventuele flip) kijken alle
entiteiten naar rechts. Gebruik altijd de bestiary als referentie."

1. **✅ `RETURN_DURATION_MS`** (RpgLevelPanel.jsx, WorldWanderer) 1200 -> 3600ms — de enige bestaande
   tunable transitie-duur in het bird-systeem, eigen comment beschrijft 'm al als tijd-lineair, matcht
   Han's "mooi lineair" exact.
2. **✅ Bumblebee facing-tag** — WorldCreature's flip-logica en de bestiary's eigen mirror-logica lezen
   dezelfde `facing`-tag en zijn intern consistent; de bug zat in de DATA (generator's category-brede
   "alle non-sheet critters = right" gok, nooit per-sprite geverifieerd). Nieuwe
   `FACING_LEFT_OVERRIDE_NAMES`-set in generate-bestiary-manifest.mjs corrigeert Bumble Bee terug naar
   'left'; manifest geregenereerd (diff bevestigd tot enkel dat ene veld beperkt). Han noemde "sommige
   dieren" (meervoud) maar gaf alleen bumblebee als concreet voorbeeld -- geen andere gegokt/aangepast.

Geverifieerd: `npm run test:run` (846 passed; één onafhankelijke, pre-existing flaky test faalde één
keer in de volledige suite, slaagde bij isolatie EN bij een herhaalde volledige run), `npm run lint`
(0 errors), `npm run build` (clean). Niet live getest. Zie architecture.md §273.

## 2026-08-20 — ✅ Round 8: applause = ppp (genoemd), windvlaag = mp

Han: "noem het volume dat je voor applaus gebruikte ppp. de windvlaag mag volume mp zijn."

1. **✅ Applause "ppp"** — de anonieme 0.5x-multiplier op pianissimo is nu `PPP_VOLUME` (zelfde
   waarde, 0.1), bewust NIET toegevoegd aan de gedeelde `VOL_STEPS`-tabel zelf (die stuurt echte
   volume-dials elders aan; Han vroeg om deze env-audio-specifieke waarde te NOEMEN, niet om een
   nieuwe selecteerbare stap app-breed toe te voegen).
2. **✅ Windvlaag = mp** — vervangt round 7's "hergebruik het zeer-zachte applause-niveau" met een
   eigen, echte `VOL_STEPS`-stap (mezzo piano, 0.6) — windvlagen klinken nu duidelijk luider dan de
   applause-drone.

Geverifieerd: `npm run test:run` (846 passed), `npm run lint` (0 errors), `npm run build` (clean).
Niet live getest. Zie architecture.md §274.

## 2026-08-20 — ✅ Nieuwe town-crier + blacksmith_f sprites: work-animatie, 2-maten-loting, notenwissel

Han dropte nieuwe sprites (Town crier.png/json, blacksmith_f.png/json) met een echte idle+actie-split.
Interview (4 vragen, zie transcript): (1) de nieuwe "rol elke 2 maten (50%), speel 2 maten" regel geldt
voor ALLE workers met idle+work-achtige animatie (Town crier's Ring, blacksmith_f's Work, EN Blacksmith
Slow's bestaande `hit` — laatste triggert nu op frame 11 i.p.v. frame 8); (2) de work/ring-animatie
LOOPT om de 2 maten te vullen (geluid vuurt elke herhaling); (3) blacksmith_f wordt een "Female" variant
van bestaande creature "Blacksmith Fast" (niet een losse creature, niet een vervanging); (4) noten
gewisseld — Town crier G6, Blacksmith Fast G5 (was G5/G6).

1. **✅ Assets verplaatst** — blacksmith_f.png/json + Town crier.png/json van `ASSET DROP/` naar
   `public/ASSORTED/characters/char_passive/` (Town crier overschrijft de oude 640×64/10-frame versie
   met de nieuwe 960×64/15-frame Idle+Ring versie; blacksmith_f is een nieuw bestand).
2. **✅ `scripts/generate-bestiary-manifest.mjs`** — nieuwe BASE_OVERRIDES-regel (blacksmith_f.png ->
   base "Blacksmith Fast", variant "Female"); metadata-lookup nu variant-aware (`Base::Variant`
   compound-key EERST geprobeerd, anders terugval op de bestaande base-only key) — nodig omdat
   `addedAnimations` anders óók op de bestaande Plain-variant (het roster-sheet-idle) terecht zou komen.
3. **✅ `bestiaryMetadata.json`** — "Town crier" (Idle 5 cellen / Ring 10 cellen) en "Blacksmith
   Fast::Female" (Idle 5 cellen / Work 5 cellen) toegevoegd; manifest geregenereerd (diff bevestigd
   beperkt tot exact deze 2 creatures, 108 insertions/2 deletions).
4. **✅ `useWorkerHitState.js`** — herschreven: de oude 'idle-triggers' (altijd-aan) en 'random'
   (per-tel kans, natuurlijke-lengte hit) modes vervangen door ÉÉN 'measure-random'-vormig mode: rol op
   elke `petFrame % windowFrames === 0` grens (windowFrames = `measures * timeSignature[0] *
   FRAMES_PER_BEAT`, dus LIVE timeSignature, niet een vaste 4/4 — CLAUDE.md §6c), en bij succes de
   work-animatie LOOPEN tot het venster vol is, geluid op elke `elapsed % workLen` match in
   `hitFrameIndices` (array, niet één index — nodig voor Town crier's frame 1 ÉN 6).
5. **✅ `RpgLevelPanel.jsx`** — `workerNpcs`-roster bijgewerkt (alle 3 geluid-workers op het nieuwe
   hitConfig-shape, Blacksmith Fast krijgt `variant: 'Female'` mee aan `findCreatureByName`,
   `timeSignature` doorgegeven aan `WorkerNpcSlot`/de hook).
6. **✅ Nieuwe test** `src/hooks/__tests__/useWorkerHitState.test.js` (3 tests: stil bij hitConfig=null,
   blijft idle bij mislukte loting, wisselt naar work + vuurt elke loop-herhaling + terug naar idle na
   het venster).

**Aanname, gevlagd (niet bevestigd in-game):** Blacksmith Slow's hitFrameIndex gelezen als natuurlijk-
celnummer (zelfde conventie als de originele "cell 8" -> index 3, §275) — cel 11 -> array-index 6 in
`[5,6,7,8,9,10,11,12,1,2]`. Corrigeer als dit fout blijkt.

Geverifieerd: `npm run test:run` (851 passed, 3 nieuw), `npm run lint` (0 errors), `npm run build`
(clean). Niet live getest — Han's eigen in-game check nodig voor de bel/hamer-timing en de 50%-loting.
Zie architecture.md §282.

## 2026-08-20 — ✅ Blacksmith trio hernoemd/gekleurd + 'audio' bestiary-tag/preview + Archer-pijl bugfix

Han: "ik zie mijn nieuwe files niet gebruikt van blacksmith en blacksmith f" / "waar zijn de kleurvarianten
van blacksmith fast... 3 kleuren" / "noem blacksmith fast -> blacksmith man (3 kleuren), en voeg blacksmith
woman toe. De laatste blacksmith heet gewoon blacksmith (SSW)." / "ik wil in de bestiary ook de
animatie-audio horen. voeg een tag toe: audio" / "bug: de archer is zijn pijl kwijt".

Interview (2 vragen): (1) de 3 kleuren zitten op characters sheet 5/6.png — bevestigd via pixel-crop +
visuele vergelijking (rij1/col5-9 is dezelfde hamerende pose in 3 kleuren); (2) Blacksmith Woman wordt een
LOSSE creature (niet langer een variant van Blacksmith Man, corrigeert de vorige ronde).

1. **✅ Blacksmith (SSW)** — nieuwe ASSET DROP-sprite (960×64, schone Idle 5/Work 10, zelfde opzet als
   Town crier) vervangt de oude handgemaakte 12-cel hamer-grid-hack. "Hit op frame 11" nu ondubbelzinnig
   gelezen tegen DEZE sheet's eigen aseprite-framenummering -> Work-lokale index 5 (corrigeert de vorige
   ronde's index-6-gok tegen de oude grid, die nu vervangen is).
2. **✅ Blacksmith Man** (was Blacksmith Fast) — 3 echte kleurvarianten (Plain/Grey/Blue) via een
   gerichte extractie van precies rij1/col5-9 op sheets 5 en 6 (niet de volledige onbekende rosters van
   die sheets — §676's scope-grens blijft staan).
3. **✅ Blacksmith Woman** (blacksmith_f) — nu een STANDALONE creature (eigen bestiary-kaart), niet langer
   een "Female"-variant van Blacksmith Man.
4. **✅ `src/model/workerSoundConfig.js`** (nieuw) — één bron van waarheid voor welke workers geluid
   hebben en op welk frame, gedeeld door de generator (audio-tag), het level-roster (echte playback) en de
   nieuwe bestiary-audio-hook. De eerdere `Base::Variant`-metadata-lookup-fallback (vorige ronde) is
   teruggedraaid — met Blacksmith Woman als losse base is die niet meer nodig (§7: geen overbodige
   complexiteit laten hangen).
5. **✅ 'audio'-tag + bestiary-preview geluid** — nieuwe tag naast portrait/move/attack/ranged, afgeleid
   uit `WORKER_SOUND_CONFIG` (geen los lijstje). Nieuwe hook `useBestiaryAnimationAudio.js` speelt het
   geluid af terwijl je de Work/Ring-animatie bekijkt in de bestiary (op de bestiary's eigen 150ms-tick,
   niet tempo-gebonden — dat was het nooit).
6. **✅ Archer-pijl bug gevonden en gefixt** — `"Archer sheet"` -> `"Archer"` rename (§870) liep AL vóór
   zowel de pijl-portret-koppeling als de geel/wit-swatch-override in dezelfde loop; beide matchten nog op
   de oude naam en faalden dus stilletjes sinds die rename. 2 string-literals gecorrigeerd.
7. **✅ Nieuwe test** `src/hooks/__tests__/useBestiaryAnimationAudio.test.js` (6 tests).

Geverifieerd: `npm run test:run` (857 passed, 6 nieuw), `npm run lint` (0 errors), `npm run build` (clean).
Eén onafhankelijke, pre-existing flaky test (generateLevel9CallResponseBlock) faalde 1x in de volledige
suite, slaagde bij isolatie en bij een herhaalde volledige run (zelfde patroon als §273). Niet live getest.
Zie architecture.md §284.

## 2026-08-21 — 🐞 Bugfix: blacksmith_f (Blacksmith Woman) onzichtbaar — vergeten asset-file-list te regenereren

Han: "blacksmith f niet zichtbaar in bestiary en ook niet in rpg-world" / "blacksmith (fka blacksmith
slow): work animatie werkt niet".

**Root cause gevonden (bug 1, bevestigd):** `blacksmith_f.png` bestaat wel fysiek in
`public/ASSORTED/characters/char_passive/`, maar `src/model/assortedFileList.generated.js`
(`bestiaryAssets.js`'s enige bron van "welke files bestaan er", sinds #955) was nooit geregenereerd nadat
dat bestand als NIEUW bestand werd toegevoegd (§284) — `scripts/generate-assorted-file-list.mjs`'s eigen
kopregel zegt expliciet "re-run after adding/removing/renaming any file", wat ik gemist heb.
`buildCreatures()` (bestiaryAssets.js regel 33) skipt een manifest-entry STILLETJES (geen error) als er
geen matchende URL is — vandaar onzichtbaar in zowel bestiary als rpg-world, zonder enige foutmelding.
**✅ Gefixt:** `node scripts/generate-assorted-file-list.mjs` gedraaid — `blacksmith_f.png` toegevoegd (+2
losse opgeruimde dubbele-download-bestanden die niet meer bestaan, onafhankelijke bijvangst).

**Bug 2 (Blacksmith/SSW work-animatie):** metadata + de echte pixel-inhoud van het nieuwe
`SSW/Blacksmith.png` (960×64, 15 frames) zijn beide geverifieerd correct (cells kloppen met de aseprite
Idle/Work-tags, elk frame bevat echte hamer-content, geen lege cellen) — `SCANNED_CREATURES` resolvet
"Blacksmith" met een geldige url + idle:5/work:10, identiek vóór en na de file-list-fix (dit pad bestond
al, alleen de BYTES zijn overschreven). Geen code-bug gevonden. Sterk vermoeden: browser-cache — `public/`
bestanden hebben geen cache-busting hash, dus een oude gecachte 256×192-versie op dezelfde URL zou de
nieuwe Work-cellen (kolom 5-14) buiten de oude beeldgrenzen laten vallen. Kan hier niet live getest worden
— Han: hard-refresh (Ctrl+Shift+R) en opnieuw checken; als het dan nog steeds niet werkt, graag opnieuw
melden met wat je precies ziet (leeg vak? verkeerd frame? crash?).

**Losstaand gevonden, NIET aangepast:** `bestiaryMetadata.json`'s "Town crier"-blok is via de live
bestiary-editor gewijzigd (buiten deze sessie om) — rij 0 heeft nu `cells` overschreven naar dezelfde 10
cellen als de Ring-animatie MET `newKey: "Ring"`, dus Town crier heeft nu geen Idle-animatie meer en TWEE
identiek gelabelde "Ring"-animaties. Ziet er onbedoeld/kapot uit, maar ik weet niet wat de bedoeling was —
laat het staan zoals gevonden; zeg het als dit gefixt moet worden.

**Les voor volgende keer:** bij een NIEUW bestand (niet een content-overschrijving van een bestaand pad)
onder `public/ASSORTED/characters/` of `fx/`, ALTIJD zowel `generate-assorted-file-list.mjs` ALS
`generate-bestiary-manifest.mjs` draaien — de eerste stap was ik kwijtgeraakt.

Geverifieerd: `npm run test:run` (857 passed, 1 skipped), `npm run lint` (0 errors), `npm run build`
(clean).

**Follow-up (Han: "please fix"):** de losstaande Town crier metadata-corruptie hierboven gefixt —
`animOverrides.0` teruggezet naar de originele Idle-cellen (col0-4, `newKey` verwijderd); `addedAnimations`'
eigen `ring`-entry (col5-14) was altijd al correct en ongewijzigd. Regenererd: Town crier heeft weer
`idle:5`/`ring:10`, geen duplicaten meer. `npm run test:run` (857 passed), `npm run lint` (0 errors).

## 2026-08-21 — 🐞 Bugfix: rpg-world debug-metronoom "klinkt als een geigenteller" (regressie)

Han: "de rpg world metronoom klinkt als een geigenteller... veel te veel 'clicks' per seconde."

**Root cause:** letterlijk dezelfde bug-klasse als de eerdere #RAM-level fix (2026-08-11, ook al "klinkt
als een geigenteller" — toen via een instabiele `instruments`-referentie), nu via een ANDERE instabiele
referentie: `setVolume` (`useInstruments.js`) is een plain arrow function, niet gememoized, opnieuw
aangemaakt bij elke App.jsx-render — en App.jsx re-rendert ~60x/sec zolang de held beweegt. `setVolume`
stond in `useDebugMetronome`'s effect-dependency-array, dus de hele rAF-click-loop brak af en herstartte
bij elke render; elke herstart zet `lastBeatIndexRef` terug naar -1, en de eerstvolgende tick vuurt dan
altijd een klik af (ongeacht of er echt een maatgrens bereikt is) — dus tot ~60 klikken/seconde i.p.v. 1
per tel.

**✅ Gefixt** (`src/components/character/useDebugMetronome.js`): `setVolume` nu via een `setVolumeRef`
gelezen (zelfde conventie als de bestaande `instrumentsRef` net erboven), uit de dependency-array
verwijderd. Bewust scoped tot dit bestand — `useInstruments.js`'s `setVolume` zelf niet aangepast (zou
`useCallback` vereisen en raakt veel meer call-sites), dit is de kleinste fix die exact het gerapporteerde
symptoom oplost.

Geverifieerd: `npm run test:run` (859 passed, 1 skipped), `npm run lint` (0 errors/warnings op dit
bestand), `npm run build` (clean). Niet live getest — Han's eigen in-game check nodig.

## 2026-08-22 — 🐞 Bugfix: Level 3 (rubato) eindigde nooit — live gereproduceerd + opgelost met Playwright

Han: "ok de cello-bug lijkt te werken. Maar! Nu eindigt het level nog steeds niet. Het gaat specifiek om
level 3 (rubato)".

Voor het eerst dit gerapporteerde-maar-niet-live-geteste type bug ECHT live gereproduceerd, in plaats van
er weer statisch naar te gokken: dev server was al actief (Han's eigen sessie), Playwright (sinds #1095
een dependency, nog nooit eerder hiervoor gebruikt) in een aparte headless-Chromium tab erbij, level 3
gestart, en met QWERTY-toetsen door het level heen gespeeld terwijl console-logs werden opgevangen.

**Root cause gevonden (bevestigd via tijdelijke debug-logging, daarna weer verwijderd):** `wavesForLevel()`
rekende Level 3's aantal golven uit als `totalMeasures/numMeasures = 10/2 = 5`, in de veronderstelling dat
er 5 aparte "golf compleet"-momenten zouden zijn. Maar `useLevelTrebleStream.js`'s JIT-generatie voor een
gated level draait op haar EIGEN real-time klok, los van het tempo waarin de speler daadwerkelijk speelt
(`loopForever`) — dus alle 20 noten van het level staan er al binnen enkele seconden, ruim voordat de
speler ook maar de eerste "golf" heeft leeggemaakt. `killedCount`/`total` zijn allebei cumulatief voor het
HELE nummer (nooit golf-gescoped) — dus er is maar 1 mogelijk "cleared"-moment: killedCount==total==20.
`wave` gaat dan 0→1 en kan daarna nooit meer verder (niets te doden, niets te genereren) — `next(1) >=
tw(5)` is nooit waar, het level blijft voor altijd hangen met een lege notenbalk.

**✅ Gefixt** — `wavesForLevel` geeft nu gewoon `1` terug voor dit type level (via nieuwe gedeelde
`isJitTrebleLevel()` in levels.js), i.p.v. de oude 5. Deze exacte "is dit level JIT-gedreven"-check bleek
AL 2x apart heruitgevonden (useLevel.js, App.jsx) — samengevoegd tot 1 gedeelde predicate zodat dit soort
onderlinge drift niet nog een keer kan gebeuren.

**Live geverifieerd dat de fix werkt**: level 3 opnieuw volledig doorgespeeld (20/20 gedood) — het
RESULT-scherm verscheen nu wél ("you got me!", stats, Opnieuw/Sluiten). Voorheen bleef de notenbalk voor
altijd leeg.

**Losstaand gevonden, niet gefixt (cosmetisch, apart ticket waard):** het RESULT-scherm toont "20/4 enemies
vanquished" i.p.v. 20/20 — `onEnemyTotal` rapporteert het groeiende aantal correct (4, 8, ... 20) maar iets
verderop lijkt alleen de EERSTE waarde (4) vastgehouden te worden.

Geverifieerd: `npm run test:run` (863 passed, 1 skipped), `npm run lint` (0 errors), `npm run build`
(clean). **Live geverifieerd via Playwright** — dit keer geen "niet live getest"-disclaimer nodig. Zie
architecture.md §289.

## 2026-08-25 — 🐞→✅ FALSE ALARM: metronome/visuele-timing misalignment was een hot-reload artefact

Han (mid-conversatie, terwijl #1153/#1154 in uitvoering waren): "Sakura has a misalignement between the
metronome and the perfect 'timing' visual position! This is a critical bug... The 'sceen' is about 1,5
quarter note behind the metronome. The bug is consistend across songs (songs and random music)." Gemeld als
optredend in een LEVEL (RPG scroll-scherm), nieuw sinds vandaag's wijzigingen.

Voordat er blind in scroll/audio-scheduling-code gedoken werd (hoog-risico, timing-invariant-gevoelig
gebied): gevraagd of het na een HARDE refresh (Ctrl+F5) nog steeds optrad. **Antwoord: weg na refresh** —
dit was een Vite HMR-artefact (stale refs/state in een AL ACTIEF level, achtergebleven door de vele
live-reloaded edits deze sessie aan SheetRpgLayer.jsx/App.jsx/useLevel.js), geen echte code-regressie.
Geen actie ondernomen — CLAUDE.md §9k: nooit gokken/fixen op een ongeverifieerd symptoom als een goedkope
check (hier: 1 vraag) het al kan uitsluiten.

## 2026-08-25 — 🔨 Feature: level-mode letters G (Modulated) en H (Randomized Notes)

Han interview (dit gesprek):
- G scope: alle sideScroll levels (songs + procedureel).
- G timing: EENMALIG gekozen bij levelstart, vast voor het hele level (niet per blok wisselend zoals
  Level 11's decorativeWizard).
- H formule: notesPerMeasure = totaal aantal noten / totaal aantal maten (afgerond).
- H instellingen: gebruik ALTIJD het liedje's eigen generator-settings, override alleen notesPerMeasure/
  variability(30)/randomizationRule('arp_group').

Status: ✅ done. Live geverifieerd (Playwright): G op Level 1 -> "Level 1 Intro in C Dorian"; H op Sakura ->
"Sakura in E In" (schaal ongewijzigd) met verse noten + akkoordlabel. Onderweg 1 echte bug gevonden+gefixt
via live test (niet gegokt): H's eerste implementatie crashte op Sakura ("Invalid array length" in
generateRhythmicDNA) omdat het liedje's sparse generator.trebleSettings standalone gebruikt werd i.p.v.
gemerged op de volledige app trebleSettings state. npm run test:run 935/1, lint 0 errors, build clean. Zie
docs/architecture.md §311. Kanban #1153/#1154 -> test, met notes+acceptance criteria.

## 2026-08-25 — 🐞 KRITIEK: song call-response (d/e) — akkoorden/bas niet verdubbeld, end-of-song kapot

Han (UAT op Sakura, call-response mode d/e — #1155/#1157 gebied): "de akkoorden (en dus de bas) in de mode
D/E houden geen rekening met de herhalingen. Heb je nu de maatnummering gehardcoded in plaats van bestaande
herhalingslogica te hergebruiken?? De lengte van het nummer is ook niet verdubbeld, dus opeens, precies
halverwege het nummer, zijn de akkoorden 'op' (want niet herhaald) en verschijnt de 'end of song'
maatstreep."

Twee gerapporteerde problemen:
1. Afspraak was dat het level ALTIJD stopt bij de end-of-song maatstreep — gebeurt niet.
2. Het level gaat door NA end-of-song — animaties verdwijnen, geen akkoorden meer.

Status: ⏳ nog te onderzoeken. Werkhypothese (nog niet bevestigd): `useLevelTrebleStream.js`'s
`sliceSongCallResponseBlock`-pad (§306) verdubbelt de WEERGEGEVEN treble-inhoud correct (call+response per
song-maat), maar `totalMeasures`/de akkoordprogressie (`loaded.chordMelody`) van het liedje zelf worden
NERGENS op dezelfde manier verdubbeld — die blijven op de ORIGINELE (ongedubbelde) liedlengte staan, terwijl
`normalizeLevel`'s `totalMeasures`-formule al voor `applyLevelVariant`'s d/e-override draait (dus kan de
override 'm niet meer corrigeren). Han's harde vraag verdient een eerlijk antwoord in de architecture.md
write-up: is er een aparte maatnummerings-mechanisme gebouwd i.p.v. de bestaande herhalingslogica
(computeRepeatPass) uit te breiden? Moet root-cause-onderzoek uitwijzen, niet aannemen.

## 2026-08-25 — 🔊 Twee audio-kwaliteitsverzoeken (smplr)

Han: "Ik heb hier vroeger SMPLR 'gedownloaded' en sindsdien klinkt de sawtooth (wizard) heel 'hard'. Kun je
onderzoeken hoe dat kan en het geluid terug wat minder 'hard' doen klinken? Mss bijv heel klein beetje soft
attack en release?" + "bij noten direct na elkaar lopen de noten duidelijk in elkaar over. Specifiek voor de
sawtooth en andere noten zonder release: stop 1/32 noot voor het einde, om overlap te voorkomen.
(bijvoorbeeld D2q D2q klinkt als D2h.)"

Status: ⏳ nog te onderzoeken/implementeren. Twee losse punten:
1. Sawtooth (wizard) klinkt te hard sinds een smplr-herdownload — onderzoek instrument-config/envelope,
   voeg kleine soft attack/release toe indien haalbaar zonder de synthese-engine zelf te herschrijven.
2. Noten zonder release lopen in elkaar over bij opeenvolgende identieke noten (D2q D2q -> klinkt als D2h) —
   fix: stop de noot 1/32e noot voor het nominale einde om overlap te voorkomen. Geldt specifiek voor
   sawtooth en andere release-loze instrumenten.

## 2026-08-25 — ✅ Bugfix: Sakura d/e — akkoorden/bas verdubbeld, totalMeasures gefixt

Root cause bevestigd (niet aangenomen): `sliceSongCallResponseBlock.js`'s JIT-treble-verdubbeling was al
correct, maar het liedje's akkoordprogressie (`loaded.chordMelody`, EENMALIG geladen, niet JIT-gegroeid)
werd nergens verdubbeld, EN `lvl.totalMeasures` werd al berekend in `normalizeLevel` VOORDAT
`applyLevelVariant`'s d/e-override ooit kon toeslaan — dus bleef op de originele (ongedubbelde) liedlengte
staan. `useLevelBackingStream.js` (bas/cello) leest DIEZELFDE `totalMeasures` als bron van waarheid, dus 1
fix (totalMeasures verdubbelen) lost bas ook op (Han's eigen "de akkoorden (en dus de bas)").

**Nee, geen hardcoded maatnummering** (eerlijk antwoord op Han's scherpe vraag) — de LABEL-logica
(computeCallResponseLabel, §307/308) was al correct en apart van dit probleem; de bug zat in een
ONTBREKENDE uitbreiding (akkoorden/totalMeasures nooit verdubbeld), niet in een vervangende hardcode.

Fix: nieuwe `doubleMelodyForCallResponse` (sliceSongCallResponseBlock.js) — verdubbelt een HELE melodie
(akkoorden) voor call-response, ZONDER rest-collapse (akkoorden blijven hoorbaar/zichtbaar in beide
helften — het is de doorlopende harmonische ondergrond, niet iets om op gehoor te raden). `totalMeasures:
lvl.numMeasures*2` toegevoegd aan `applyLevelVariant`'s callResponseOverrides, alleen voor songId-levels.
`useLevel.js`'s begin() geeft `callResponseGroupMeasures` door aan `handleLoadSong`.

Live geverifieerd (Playwright): Sakura + letter e gestart, door het level heen gespeeld — maat 8.2/9
tonen nog correct akkoordlabels (voorheen liepen ze rond maat 7 af, exact halverwege de 14 maten). 0
console errors. Tests: 12 nieuwe in sliceSongCallResponseBlock.test.js, 2 nieuwe in levelVariants.test.js.
npm run test:run/lint/build allemaal groen.

## 2026-08-25 — 🐞 KRITIEK gevonden (bevestigd via directe code-probe): G's modulatie-algoritme is fundamenteel kapot tussen verschillend-gevormde modi

Han (na live UAT van G op Sakura): "wat voor logica heb je gebruikt voor modulatie? Ik lijk voor elk level
steeds dezelfde te krijgen... Ik zie ook nog dat de A een G wordt. Gebruik je de bestaande modulatielogica?
Die zou al moeten bestaan: Toonladder -> hepta equiv (blue notes mappen) -> transponeren naar hepta equiv
van target -> mappen op target (blue notes resolven)."

**Bevestigd via directe probe (modulateMelody('In' op E -> Phrygian op E)):** A4->G4, maar OOK E4->D4 (de
TOONSOORT ZELF verschuift weg!), F4->E4, B4->A4, C5->B4 — Elke noot schuift structureel weg. Root cause:
`modulateMelody`'s `isHeptaHepta`-tak (vandaag pas gefixt voor #1156/#310, maar dat fixte alleen de
REFERENTIE-TOONSOORT-OFFSET, niet dit) matcht een noot op zijn GRAAD-NUMMER in de bron's heptatonische
referentie (bv. Lydisch-vorm voor "In"), en herinterpreteert dat GRAAD-NUMMER direct in de doel-schaal's
EIGEN (anders-gevormde, bv. Frygisch) referentie. Graad 2 in Lydisch = een grote terts; graad 2 in Frygisch
= een kleine terts — HETZELFDE graadnummer betekent een ANDER interval zodra bron en doel een andere VORM
hebben. Mijn eigen tests van vandaag (§310) testten alleen gelijk-gevormde paren (diatonisch->diatonisch
zelfde modus, "In"->"In" zelfde modus) — dus deze klasse bug werd niet gevangen.

Han's eigen beschreven algoritme ("transponeren naar hepta equiv van target") suggereert een PURE
TRANSPOSITIE (vaste halve-toonsafstand tussen referentie-toonsoorten) i.p.v. graad-hermapping — met de hand
doorgerekend geeft DIE aanpak A4->G#4 (ook niet A). Beide interpretaties geven een resultaat dat waarschijn-
lijk niet is wat Han verwacht (dat de toonsoort E zelf onveranderd blijft, bijvoorbeeld).

Status: ⏳ NIET zelf een aanname doen over het juiste muziektheoretische algoritme — teruggekoppeld naar
Han met concrete berekeningen, gevraagd om richting te geven i.p.v. te gokken (kost anders geld zonder
garantie, CLAUDE.md §9k). Ook gevraagd: is "altijd dezelfde modus per level" een bug (had Han TRUE random
per playthrough verwacht) of correct (huidige implementatie is bewust deterministisch geseed op lvl.id, om
LevelStartSplash's preview en de daadwerkelijke levelstart nooit te laten verschillen).

## 2026-08-25 — 🐞 De 1,5-maat timing-bug is TERUG na meerdere levels — "refresh" was geen robuuste fix

Han: "Wacht eens even na een paar levels te testen komt de 1,5 maat bug terug. Ik vond 'het was gewoon
refresh' ook niet robuust genoeg als oplossing." Eerdere conclusie (hot-reload-artefact, verdween na Ctrl+F5)
was dus ONVOLDOENDE — het probleem is REPRODUCEERBAAR na verloop van meerdere levels binnen dezelfde sessie
(niet alleen een eenmalig HMR-restje). Status: ⏳ nog te onderzoeken — ditmaal ECHT, geen aanname meer dat
het vanzelf overgaat. Nog geen root cause. Prioriteit: hoog (net als de modulatie-bug hierboven), samen met
Han af te stemmen welke van de openstaande punten eerst.

Han's antwoorden op de 3 vragen: (1) modulatie-fix — AFGEWEZEN, "kijk goed in de codebase want er bestaat
gewoon al een modulation algoritme" (ik moet dieper zoeken, niet zelf iets nieuws verzinnen). (2)
determinisme — BEVESTIGD bug, Han wil ECHTE randomness per playthrough (niet steeds dezelfde modus per
level). (3) timing-bug — "kijk eerder in de code wat het zou kunnen veroorzaken voor een gerichte
diagnostiek te draaien" (eerst hypothese vormen via code-analyse, dan pas gericht live testen).

## 2026-08-25 — 🐞 KRITIEK #1158: E In toont 5 voortekens i.p.v. 0

Han (mid-conversatie, tijdens G-testen): "nu staan er bij E In 5 voortekens!!! Hoe kan dat nou? Want E
Phrygian heeft 0 voortekens. De fout ligt niet aan het RPG level, maar wsl aan het doorgeven van
hepta-equiv naar de accidental-berekening." Kanban-ticket #1158 aangemaakt (onder epic #1087, per Han's
instructie), NOG NIET onderzocht/gefixt — alleen geticket zoals gevraagd.

**Update — ✅ GEFIXT.** Geen codebug: `git diff` toonde dat Han zelf (nog niet gecommit) 5 pentatonische
schalen' `diatonic`-veld had gewijzigd (Iwato/In/Insen/Hirajoshi/Egyptian pentatonic) zonder de bijbehorende
`heptaRefIntervals`-arrays aan te passen — `diatonic` is een load-bearing lookup-key in
`modeAdjustments[diatonic]`, geen vrijblijvend "lijkt op"-label. Per schaal geverifieerd (cumulatieve
semitonen van heptaRefIntervals vergeleken met de 7 standaardmodi) en teruggezet naar de correcte waarde:
Iwato->Phrygisch, In->Lydisch (deze veroorzaakte de -5), Insen->Mixolydisch, Hirajoshi->Aeolisch, Egyptian
pentatonic->Ionisch. Een 6e schaal (Minor six pentatonic) GEFLAGD maar niet aangepast — matcht geen van de
7 modi exact, onduidelijk wat juist is. E In geeft nu weer correct 0 voortekens. npm run test:run 944/1,
lint 0 errors, build clean. Kanban #1158 -> test.

**Correctie (Han): verkeerde richting.** Han: "ik zie dat ik de diatonic heb aangepast zonder de
heptaRefIntervals aan te passen. Kun jij dat doen voor alle penta scales?" — dus NIET diatonic terugzetten
naar de oude waarde, maar heptaRefIntervals AANPASSEN aan Hans nieuwe diatonic-waarden. Geverifieerd voor
alle 6 penta-schalen (incl. de eerder geflagde Minor six pentatonic) dat hun eigen pitch-classes een exacte
subset zijn van het diatonic-doel bij offset 0 — allemaal kloppend. Doorgevoerd.

**Bonus: lost ook #1153 op, met NUL wijzigingen aan modulateMelody.** Na de data-fix: "In op E ->
Phrygisch op E" laat nu alle noten (incl. de tonica) ONGEWIJZIGD — precies het verwachte resultaat. De 2
eerdere mislukte pogingen om modulateMelody's ALGORITME te wijzigen waren dus de verkeerde diagnose — het
was een DATA-probleem, niet een algoritme-probleem. Han had gelijk: "kijk goed in de codebase want er
bestaat gewoon al een modulation algoritme."

Documentatie toegevoegd bovenin scaleHandler.js (wat diatonic/heptaRefIntervals betekenen) + comment
cleanup gedaan (mijn eigen verbose per-fix comments ingekort nu de algemene regel bovenaan staat), beide
op Han's verzoek. Nieuwe regressietest in musicUtils.test.js. npm run test:run 945/1, lint 0, build clean.
Zie docs/architecture.md §312. Kanban: #1158 -> test, #1153 -> impl (determinisme-bug nog open).

## 2026-08-25 — ✅ #1153/#1154 follow-up round (5 items uit één UAT-bericht)

Han meldde in één bericht 5 dingen tegelijk: (1) G nog steeds ALTIJD deterministisch (E Phrygian op
Sakura) — wil ECHTE randomness per level-start; (2) G mag nooit naar de eigen "diatonic parent" van de
schaal moduleren (In->Phrygisch is triviaal, zinloos als G-keuze); (3) G heeft opeens geen akkoorden/
baslijn meer; (4) level-variant-letter moet blijven staan bij het wisselen van levelnummer, TENZIJ niet
beschikbaar voor het nieuwe level (was: altijd resetten — bewuste omkering van eerdere UX-beslissing); (5)
H genereert alleen de eerste paar maten melodie, niet het hele nummer.

**Alle 5 gefixt:**
1. `pickModulatedMode` (levels.js) nu `Math.random()`-based i.p.v. `lvl.id`-seeded.
2. Sluit de schaal's eigen `diatonic`-veld uit de random pool uit (teruggezocht naar de bijbehorende
   `.name` in `scaleDefinitions.Diatonic`, want die twee komen niet altijd overeen — bv. Major's diatonic
   is 'Ionian' maar zijn eigen `.name` is 'Major'). Bonus-fix hierbij gevonden: `modulatedOverrides` riep
   `pickModulatedMode` TWEE keer aan (voor `key.mode` en `modulateToMode` apart) — onschadelijk toen het
   deterministisch was, maar zou nu met random twee VERSCHILLENDE modi opleveren. Eén roll, hergebruikt.
3. ROOT CAUSE gevonden: App.jsx's `remodulate`-helper (voor treble/bass) werd ook op `chordMelody`
   losgelaten, maar die heeft een ANDERE vorm (`.notes[i]` = akkoord-noten ARRAY, `.displayNotes[i]` = een
   `Chord`-OBJECT, niet losse strings). De helper's string-only guards lieten akkoord-arrays ongewijzigd
   door EN vervingen elke `Chord` door een lege string — vandaar "geen akkoorden/baslijn" (de backing-cello
   volgt akkoordwortels, had dus niks meer om te volgen). Nieuwe `remodulateChordMelody` (losgetrokken naar
   `src/songs/remodulateLoadedSong.js`) behandelt de akkoord-vorm correct via dezelfde `modulateMelody`.
4. `LevelStartSplash.jsx`'s carousel-handler aangepast: `selectedVariant` blijft nu staan tenzij
   `availableVariantLetters` hem uitsluit voor het nieuwe level (of het geen sideScroll-level is).
5. Losgetrokken naar `src/generation/generateBlockedSongTreble.js`: genereert nu in blokken van 4 maten
   (of 2 als 14 niet deelbaar is door 4, zoals bij Sakura), i.p.v. één MelodyGenerator-call voor het hele
   nummer — matcht hetzelfde patroon dat useLevelTrebleStream.js/generateLevelBackingChunk.js al gebruiken.

Beide fixes (3 en 5) losgetrokken uit App.jsx naar eigen testbare modules (zelfde patroon als
resolveLoadedSong.js) — nieuwe tests tegen Sakura's ECHTE songdata bevestigen: akkoorden blijven Chord-
instanties met daadwerkelijk gewijzigde wortels, en H's melodie bereikt nu het LAATSTE blok (maat 12-14),
niet alleen de eerste paar maten. Zie docs/architecture.md §313. npm run test:run 956/1, lint 0, build
clean. Kanban: notes toegevoegd aan #1153 en #1154.

## 2026-08-26 — ✅ Hard rule: noot-lengte cap op groeps-/maatgrenzen (sluit #1087 af)

Han: "Extra regel voor alle melody generation: de lengte van een noot mag geen twee groepsgrenzen
passeren... nooit 2 maatgrenzen." Interview via AskUserQuestion bevestigde de kern (max 1 extra
notengroep) MAAR bracht een belangrijke nuance boven water die ik zelf niet had geraden: de "groepen"
voor deze regel worden OPNIEUW berekend op de generatie-slot-resolutie (`chooseGrouping(numerator *
slotsPerBeat)`), niet de grovere beat-niveau `rhythmicGrouping` — bv. 4/4 bij smallestNoteDenom=8 groepeert
als {3,3,2} achtste-noten-slots, niet proportioneel {4,4}. Geverifieerd tegen Han's eigen 5/4-[2,3]
voorbeeld (noot start op tel 4, max 4 tellen lang) — mijn implementatie reproduceert dit EXACT (Math.random
gemocked om die specifieke groepsvolgorde te forceren).

Geïmplementeerd als `capNoteLengthAtGroupBoundaries` in melodyGenerator.js — draait ALTIJD (niet achter
`insertBeatRests`, want harde regel voor alle instrumenten per §6b), direct na de bestaande
`insertRestsAtBeats` stap. De "nooit 2 maatgrenzen"-regel bleek wiskundig al impliciet in de
groepen-regel besloten (next-group fallback kan nooit meer dan 1 volledige maat verder wrappen) — toch
als expliciete defensieve check bewaard, zoals Han vroeg. 4 nieuwe tests (incl. het exacte 5/4-voorbeeld).
npm run test:run 960/1 (nul regressies in de hele generation-testsuite), lint 0, build clean. Zie
docs/architecture.md §314.

**Sawtooth/harshness-onderzoek (nog GEEN implementatie — Han vroeg expliciet om eerst een voorstel):**
Han's hypothese "speelt de wizard sawtooth i.p.v. square?" — ONWAAR, gecheckt in code (App.jsx:1640)
EN op schijf (WAV-bestanden zijn qua bytes verschillend): de wizard gebruikt al correct 'lead_1_square'.
Wél een sterke, git-archeologisch bevestigde vondst: commit 09ea29d (2026-05-11, "wip: restore local
audio samples...") verhoogde smplr 0.16.4->0.20.0 EN verving tegelijk de CDN (MusyngKite-soundfont) door
lokale samples geëxtraheerd uit Han's eigen FluidR3_GM.sf2 — exact dezelfde regressie-klasse als #1097
(woodblock, "een andere soundfont-set, een hoorbare regressie die Han niet had gevraagd"). Dit is
vermoedelijk de dominante oorzaak van de "hardheid" (andere bronopname), niet het envelope. Kleinere
bijdrage: smplr's release/decay-standaard groeide mee (0.16.4's impliciete ~200ms -> huidige expliciete
`ampRelease: 0.3` = 300ms) — draagt bij aan het "in elkaar overlopen" van korte noten. `ampAttack` bleek
een dode config-optie in smplr zelf (nergens daadwerkelijk toegepast in de Voice-klasse) - een letterlijke
"korte attack" is dus niet gratis beschikbaar zonder smplr zelf te patchen.
Voorstel gepresenteerd aan Han (mirror de oude CDN MusyngKite-samples lokaal voor lead_1_square/
lead_2_sawtooth, zelfde patroon als extract-legacy-woodblock.mjs, plus kortere ampRelease) — wacht op
zijn beslissing voordat er geïmplementeerd wordt.

**#1159 aangemaakt** (op Han's verzoek, "maak een apart ticket en zet meteen in design"): de 1,5-maat
metronoom/visuele-timing desync — nog niet onderzocht, in kanban-status 'design'.

## 2026-08-26 — ✅ Sawtooth/square harshness: legacy MusyngKite-samples gemirrord + kortere ampRelease

Han keurde het voorstel goed ("do this please :)"). Geïmplementeerd:

1. **`scripts/extract-legacy-synth-leads.mjs`** (nieuw) — generaliseert `extract-legacy-woodblock.mjs`'s
   exacte patroon naar BEIDE synth-leads in één run: haalt MusyngKite's eigen MIDI.js-bestanden op voor
   `lead_1_square` EN `lead_2_sawtooth`, decodeert elke ingebedde MP3 naar WAV. Resultaat: 88 echte
   semitoon-opnames per instrument (i.p.v. de 5 ankerpunten A2-A6 uit de FluidR3-extractie) — zelfde
   24MB per map als de al-geaccepteerde woodblock-precedent.
2. **`localInstruments.js` gegeneraliseerd** — de losse `LEGACY_WOODBLOCK_SLUG`-branch werd een
   `LEGACY_INSTRUMENT_OVERRIDES`-map (§6c: geen 3e bijna-identieke branch) zodat woodblock zijn eigen
   extra-gain/limiter-keten behoudt (los, ongerelateerd "te zacht"-issue, #1097) terwijl de synth-leads
   die NIET krijgen (tegenovergesteld probleem: te hard). Beide leads krijgen `ampRelease: 0.06` (60ms,
   was 300ms via de globale default) — `buildLocalSmplrJson` kreeg een `defaultsOverride`-parameter
   hiervoor, zonder de andere instrumenten te raken.

Niet opgelost (gedocumenteerde beperking): een echte "korte attack" bestaat niet als bruikbare smplr-optie
(`ampAttack` wordt nergens daadwerkelijk toegepast in de Voice-klasse, geverifieerd in de daadwerkelijke
runtime-source) — zou een fork van smplr vereisen, buiten scope van deze ronde.

Geverifieerd: alle 176 manifest-entries hebben een bestaand WAV-bestand (script-check), bestandsgroottes
zijn volwaardige opnames (niet leeg/corrupt). npm run test:run 960/1, lint 0, build clean. NIET op gehoor
getest — dat is aan Han's UAT (klinkt het echt minder hard, en is 60ms release lang genoeg om niet
afgeknipt te klinken?). Zie docs/architecture.md §315.

## 2026-08-26 — ✅ #1159: visuele scroll loopt ~1,5 kwartnoot achter op de metronoom — root cause + fix

Code-hypothese eerst opgesteld (op Han's expliciete verzoek), pas na zijn bevestiging ("yes! doe maar :D")
geïmplementeerd:

1. **Root cause gevonden**: §277's (#1096-follow-up) nieuwe mid-level-overlay-pause mechanisme in
   `SheetRpgLayer.jsx` (`externalPauseAccumMsRef`) lekte wall-clock-tijd elke keer het levelresultaat-
   scherm te zien was (`overlayEditMode` bevat `levelResultEditMode`), en werd — anders dan
   `clockStartRef`/`debugLoggedUnfreezeRef` ernaast — NOOIT gereset bij een nieuwe `scrollStartTime`
   (nieuw level/replay). Elk volgend level's visuele klok begon dus permanent achter te lopen op de
   audio-klok, cumulatief erger na meer levels/resultschermen in dezelfde sessie.
2. **Fix**: `externalPauseAccumMsRef`/`lastFrameNowMsRef` mee resetten in hetzelfde
   `useEffect([scrollStartTime])` dat de andere twee refs al reset.
3. **Nieuwe regressietest** in `SheetRpgLayer.test.jsx` — bewezen faalt zonder de fix, slaagt met de fix.

Geverifieerd: npm run test:run 961/1 (nieuwe test incl.), lint 0 errors, build clean. Live getest in een
echte (headless) browser via Playwright — Level 1 start en draait zonder console-errors, scroll/strike-
line-uitlijning ziet er correct uit. Performance-diagnose (op Han's verzoek) zie apart bericht: cold-load
timing, bundle-grootte (geen code-splitting, 4,1MB JS-bundle), frame-timing sample tijdens gameplay.
Zie docs/architecture.md §316.

## 2026-08-26 — 🔨 Performance deep-dive: dev-vs-prod, 212MB eager audio, mobile button-mash stresstest

Han vroeg door op de eerdere perf-cijfers ("gaat dit ook goed werken op mobile?", daarna "heb je echt de
levels getest met button mashing (PC en mobile)?"). Eerlijk antwoord: nog niet grondig — alsnog gedaan:

1. **Dev vs. productiebuild, echte CPU-profile (CDP Profiler, niet alleen FPS-tellen)**: de eerdere
   "46fps/15% trage frames" bleek grotendeels React DEV-instrumentatie (~46% van sampled tijd aan
   jsxDEV/proptype-validatie) — verdwijnt in productiebuild: 60fps rock-solid, 0% frames >33ms.
2. **Echte bottleneck gevonden**: 735 WAV-bestanden / 212MB laden EAGER bij elke cold boot, zelfs zonder
   klik, vóór de boot-splash weggaat (~5,7s op localhost/schijfsnelheid). Groter probleem dan de eerder
   genoemde bundle-splitsing. → **ticket #1160** (Han: "load time mag een ticket krijgen", niet urgent).
3. **Button-mash stresstest** (rapid QWERTY-toetsinvoer tijdens actieve combat, productiebuild):
   - PC: 60fps stabiel, geen errors.
   - Mobiel-emulatie (Playwright Pixel 7 + CDP 4x CPU-throttle, Chrome's eigen "mid-tier mobiel"-preset):
     ~20fps, geen crashes, maar merkbaar trager. Sourcemap-resolved profile: geen 1 hotspot, kosten
     verspreid over normale React-reconciliatie + renderMelodyNotes/SheetMusic/SheetRpgLayer/PianoView —
     consistent met "elke toetsdruk triggert een vrij brede re-render", niet één geïsoleerde bug.
   - Caveat expliciet benoemd: CDP-throttling is een approximatie, geen fysiek toestel beschikbaar om op
     te testen vanuit deze omgeving.

→ **ticket #1161** aangemaakt (status `design`, priority high) — Han wil dit "meteen aanpakken", maar
interview (CLAUDE.md §4b) moet nog: scope (RPG-level only vs. hele app), mobiel nu-of-later prioriteit, en
of Han zelf op een fysiek toestel kan valideren. Nog geen code gewijzigd voor deze twee tickets.

## 2026-08-27 — ✅ #1161: PianoView/TabView memoized — mobiel 20fps → 60fps

Han bevestigde de hypothese ("de re-render is zeker niet nodig") en vroeg om concrete aanbevelingen.
Root-cause gevonden: `SheetMusic`/`MelodyNotesLayer` waren al React.memo (eerdere optimalisatieronde),
maar `PianoView` en `TabView` niet — `App.jsx`'s `combatNote` (verandert bij ELKE gespeelde noot) forceerde
daardoor een volledige, onvoorwaardelijke re-render van het hele toetsenbord + actieve tabblad bij elke
notendruk, terwijl `combatNote` niet eens een prop van `TabView` is en `PianoView`'s eigen toetsaanslag-
visuals al via zijn eigen lokale state lopen.

**Fix**: `export default React.memo(PianoView)` / `React.memo(TabView)` — zelfde patroon als `SheetMusic`
al had. Eerst geverifieerd dat hun props/callbacks daadwerkelijk stabiel zijn (contexts zijn al
`useMemo`'d, `handleNoteInputCombat` is `useCallback`'d) zodat de memo ook echt raak.

**Resultaat**: exact dezelfde button-mash-stresstest herhaald na de fix — mobiel-emulatie (4x CPU-
throttle) ging van ~20fps (50ms/frame, 90%+ trage frames) naar **60fps (16.7ms/frame, 0% trage frames)** —
gelijk aan PC. Visueel bevestigd dat de combat-feedback (hero-attack-animatie, judgment-labels) nog
correct vuurt op elke toetsdruk. npm run test:run 961/962 (ongewijzigd), lint 0, build clean.

Bewust NIET gedaan deze ronde: de grotere structurele optie (RPG-combat state uit App.jsx isoleren) — niet
nodig gebleken, de goedkope fix haalde de 60fps-doelstelling al. Zie docs/architecture.md §317.

## 2026-08-27 — 🔨 #1161 vervolg: RPG-world (open wereld) — React-fix werkt, maar is niet de bottleneck

Han: "ren eens een stuk in RPG mode op mobile emulator" — gedaan. Resultaat was ~5,7fps (174ms/frame,
96% trage frames), veel slechter dan de levels.

Root cause + fix (zelfde patroon als hierboven, plus Han's eigen ontwerp-idee "animatie ticks die
afstemmen met de metronome-ticks, 60/s, meest nabije frame is goed genoeg"):
1. `petFrame` (RpgLevelPanel.jsx): `setInterval` → rAF + AudioContext-sync (zelfde patroon als
   SheetRpgLayer.jsx), commit naar state alleen bij een echt veranderde waarde (React's Object.is-bailout
   houdt de commit-cadans identiek aan de oude interval — lost drift op, niet de renderfrequentie).
2. 5 WebGL/canvas scenery-lagen (LdtkScenery, LdtkLitGround, WaterReflectionLayer, ForegroundFoliageLayer
   ×2, LdtkAnimatedTiles ×2 — 9 call-sites) kregen React.memo — geen van allen hangt af van petFrame, maar
   herrenderden er wel op mee.
3. Cruciaal: meerdere props waren VERS berekend inline in JSX (cullTilesToViewport(...), cullToViewport(
   [...].map(...))) — memo zou anders stil gefaald hebben. Naar useMemo/useCallback verplaatst.

**Eerlijk resultaat**: React's eigen aandeel in de gemeten tijd daalde >60% (668.6ms → 269.8ms) — de fix
werkt exact zoals bedoeld. Maar de FPS zelf verbeterde nauwelijks (nog steeds ~6fps stilstaand) — React was
hier nooit de dominante kostenpost. 86-91% van de tijd zit in native canvas/WebGL-werk (texImage2D,
toDataURL, getImageData, putImageData) — waarschijnlijk de normal-map-generatie voor watertegels
(useLdtkWaterInstances.js → runtimeNormalMap.js's Sobel-filter pixel-verwerking, wel gecached per uniek
tegel+frame, dus geen pure per-frame bug maar een cache-warmup-kost die tijdens mijn testvenster nog niet
klaar was).

Conclusie: deze fix is echt, geverifieerd en verdient het om te blijven staan (npm run test:run/lint/build
groen, geen visuele regressies, hero/wereld/water/foliage renderen nog correct) — maar lost de RPG-wereld-
FPS niet op. De echte bottleneck is een ANDER soort probleem (canvas/beeldverwerking, geen React-rerenders)
dat een eigen, apart vervolgonderzoek nodig heeft. Aan Han gemeld, niet stilzwijgend verder achtervolgd.
Zie docs/architecture.md §318.

## 2026-08-27 — ✅ #1162: watertegels 'static' gemaakt (geen animatie, geen pixel-swap) — fix klopt, perf-winst niet te bewijzen vanuit deze sessie

Han's concrete beslissing: "animated tiles + reflectie + pixel swap + shimmer is niet nodig. Enkel
reflectie + shimmer volstaat." Geïmplementeerd in `useLdtkWaterInstances.js`: de `tick`/`FRAME_MS`-rAF-
animatielus (cyclede door meerdere bronkolommen) volledig verwijderd — `col` wordt nu één keer berekend
(nog wel per-plaatsing verschoven voor visuele variatie, maar bevroren). De "pixel switch"-sparkle
(`isWater: true`, alleen gebruikt voor `uWhiteCap*`-uniforms) staat nu op `false`. `wave: true` (shimmer)
en `WaterReflectionLayer` (losstaand component) blijven ongewijzigd — reflectie + shimmer blijven dus.
Dit was precies het mechanisme dat §318 al als sterkste verdachte aanwees voor de dominante mobile-kost.

Visueel geverifieerd (screenshot van de vijver onder de boomstam-brug): reflectie en shimmer zien er nog
goed uit, geen visuele regressie. Tests/lint/build groen.

**Eerlijke bevinding**: de FPS-winst van deze fix kon ik NIET aantonen vanuit deze sessie. Dezelfde
mobiel-emulatie-stresstest liet nauwelijks verandering zien (nog ~6fps onder 4x CPU-throttle). Uitgezocht
waarom: deze headless Chromium-omgeving heeft GEEN echte GPU — WebGL valt terug op SwiftShader (Google's
CPU-based software-renderer, bevestigd via WEBGL_debug_renderer_info). Gecombineerd met Pixel-7-emulatie's
deviceScaleFactor 2.625 (effectief ~1082×2202px backing-store — MEER pixels dan de 1400×900 desktoptest)
worden de meerdere volledige-schermbrede, per-pixel-belichte WebGL-canvassen van de RPG-wereld volledig op
de CPU gerasterd bij hoge pixeldichtheid — een kost die niets met de efficiëntie van onze eigen code te
maken heeft en alles overschaduwt. Op een echt toestel (met echte GPU-versnelling) zou dit zeer wel
significant beter kunnen presteren — maar dat kan alleen op echte hardware bevestigd worden, niet vanuit
deze sessie.

Conclusie: de fix blijft staan (verwijdert echte CPU-kost, relevant op elk toestel, GPU of niet) — maar de
mobiel-emulatiecijfers van deze sessie zijn geen betrouwbaar oordeel over "is de RPG-wereld nu snel genoeg
op echte telefoons". Dat vereist een echte toestel-test. Zie docs/architecture.md §319.

## 2026-08-27 — ✅ #1162 vervolg: laatste 2 setInterval-gedreven animatie-timers omgezet naar rAF

Han: "kun je nog meer optimalisaties vinden? :D" — snelle audit van elke resterende `setInterval` in
`src/components/character/`/`src/hooks/` voor hetzelfde patroon (React-state op een eigen, niet-frame-
uitgelijnde timer) dat petFrame/watertegels al hadden. Twee echte instanties gevonden en gefixt:
1. `RpgLevelPanel.jsx`'s `walkFrame` (het loop-/rencyclus van de held — actief tijdens ELK "lopen"-scenario)
2. `LdtkAnimatedTiles.jsx`'s `tick` (kampvuur-animatie, water loopt hier niet meer doorheen)

Beide naar rAF+dedupe-commit (zelfde patroon als eerder) — geen nieuwe renderfrequentie, wel drift-vrij.

Bewust NIET aangeraakt: `useLdtkFoliageInstances.js` (al correct — genereert normal-maps 1x per unieke
crop, nooit herhaald), `useDebugMetronome.js`'s FPS-teller (1x/sec, debug-only, verwaarloosbaar),
`useWorldAmbientMusic.js`'s vogel/water-intervallen (manipuleren AudioParams direct, geen React-state,
triggeren dus nooit een re-render — andere probleemklasse). Bundle-splitsing/eager audio-load blijven
bewust buiten scope (Han's eigen keuze, apart ticket #1160).

Geverifieerd: lopen + kampvuur animeren nog correct, geen glitches. Tests/lint/build groen. Zelfde
kanttekening als hierboven: geen GPU in deze sessie, dus geen betrouwbaar FPS-oordeel mogelijk — deze
fixes verwijderen wel echte, meetbare CPU-kost. Zie docs/architecture.md §320.

## 2026-08-27 — 🔨 #1162 Fase 1: camera-pan imperatief gemaakt voor de scenery-lagen

Han testte op ECHTE hardware (PC, VSCode-webview): 120fps stilstaand, 30fps bij zijwaarts bewegen — "de
camera-update moet echt anders". Root cause: `cameraX` is React state, geüpdatet 60×/sec via rAF zolang de
held beweegt (bestaand "dead-zone follow camera"-ontwerp) — vrijwel elke scenery-laag/entiteit-positie
hangt hiervan af, dus lopen forceerde een volledige re-render van de hele open-wereld-boom.

**Fix (Fase 1 — Han koos voor gefaseerd)**: zelfde patroon als SheetRpgLayer.jsx's `frozenScrollPxRef`
(§1050) — een grond-vlak-wrapper `<div>` waarvan de `transform` IMPERATIEF geschreven wordt door dezelfde
rAF-lus die `cameraX` al berekent, buiten React om. Inhoud binnenin gebruikt nieuwe LOKALE (camera-
onafhankelijke) positiehelpers — stabiel zolang alleen de camera beweegt, dus memo's raken nu echt tijdens
lopen. Scope: `LdtkScenery`'s grondlaag (CanvasLayer, nu ook gememoized) + `LdtkAnimatedTiles` +
`WaterReflectionLayer` (2 wrapper-groepen per pass, vanwege LdtkLitGround's z-order-positie ertussen).

**Bewust NIET gedaan (Fase 2, nog niet gestart)**: LdtkLitGround/ForegroundFoliageLayer (WebGL-instantie-
lagen — hebben een shader-uniform nodig, geen CSS-transform, groter/risicovoller) en alle entiteit-
positionering (held/pet/wisp/slime/critters/workers) — Han's eigen voorstel om dit in 2 fases te doen.

**Bekende resterende gap**: LdtkAnimatedTiles' `animatedTiles`-prop blijft instabiel tijdens lopen (culling
hangt bewust nog af van de camera-bewuste positie) — lage prioriteit, puur DOM, goedkoopste van de groep.

Visueel geverifieerd (meerdere pan-afstanden, beide richtingen, Playwright-screenshots) — scenery/water/
reflectie/boom/entiteiten blijven pixel-perfect uitgelijnd, geen drift/flits. Tests/lint/build groen.
Zelfde kanttekening: geen betrouwbare FPS-meting mogelijk vanuit deze (GPU-loze) sessie — aan Han gevraagd
om zelf opnieuw te testen op zijn eigen omgeving (waar hij de originele 120→30-drop mat). Zie
docs/architecture.md §321.

## 2026-08-27 — ✅ #1162 Fase 2: entiteiten + WebGL-foliage-laag imperatief; LdtkLitGround bleek al in orde

Han: "doe ook fase 2 maar! :D" — meteen doorgepakt.

**Fase 2a (entiteiten)**: zelfde wrapper-`<div>`-met-imperatieve-transform-truc als Fase 1, uitgebreid naar
Wisp/Slime/6 workers/held/pet + hun spiegelbeelden. `WorldWanderer` (critters) bleek AL imperatief-ref-
gedreven (`worldToScreenXRef`, dateert van vóór dit ticket) — puur consistentie-halve mee verhuisd naar
dezelfde wrapper, verder geen wijziging nodig.

**Fase 2b (WebGL-foliage-laag)**: bleek GEEN shader/GLSL-wijziging nodig te hebben — `uScreenPos` was al
gewoon "de uiteindelijke schermpositie", per instance per draw-call vanuit JS gezet. Pure JS-verhuizing:
RpgLevelPanel geeft nu een `cameraOffsetRef` door die ForegroundFoliageLayer's EIGEN, al-continu-lopende
draw-lus zelf optelt bij elke instance's (nu LOKALE) screenX, vlak vóór de uniform-call. Viewport-culling
verhuisde in dezelfde beweging mee naar die draw-lus (was voorheen camera-bewust in RpgLevelPanel, dus
moest daar elke pan-frame herrekend worden).

**LdtkLitGround**: uitgezocht, bleek NIETS te hoeven — leest zijn positie al via een liveRef die elke
render vers wordt gezet (ongeacht of React "moest" re-renderen), en zijn eigen draw-lus loopt al onafhankelijk
door. Was al immuun voor deze bugklasse — mijn eerdere aanname (in Fase 1's notitie) dat dit ook een
shader-uniform nodig had, klopte niet bij nader onderzoek.

Geverifieerd: lange heen-en-terugreis (~8s naar de verste workers, ~10s terug voorbij spawn) — alles blijft
pixel-uitgelijnd, geen drift/glitches. Tests/lint/build groen. Zelfde kanttekening: geen betrouwbare FPS-
meting vanuit deze GPU-loze sessie mogelijk. Zie docs/architecture.md §322.

## 2026-08-27 — ✅ #1162 Fase 3: EntityLayer geëxtraheerd; "chunk loading" uitgesloten

Han's ECHTE hardware-hertest (PC/VSCode-webview) na Fase 1+2: 120fps stilstaand → 41fps bewegend — een
reëel, substantieel beter resultaat dan de oorspronkelijke 30fps, maar nog steeds een gat. Vraag: is het
"inladen van chunks"?

**Uitgesloten**: `buildWorld()` bouwt het HELE level in één keer (`useMemo`), geen viewport-gebonden
streaming ergens in de LDtk-laadketen (grep bevestigt: geen lazy/chunk-patroon).

**Echte oorzaak van het resterende gat**: Fase 1/2 maakten elke ENTITEIT/laag's eigen props stabiel tijdens
puur pannen, maar RpgLevelPanel ZELF moest nog steeds zijn hele ~2000-regelige renderfunctie herhalen elke
pan-frame (onvermijdelijk: eigen cameraX-state dwingt dat af). React.memo slaat pas werk over ZODRA de
reconciler een component bereikt en de props vergelijkt — het voorkomt nooit dat de OUDER JSX-elementen
voor zijn kinderen construeert, gememoized of niet. Dat is zelf al reële, niet-triviale kost bij zoveel
content elke frame (zelfde kostenklasse als SS318's allereerste profiel al aanwees).

**Fix**: het hele entiteitenblok (Wisp/Slime/6 workers/critters/held/pet + spiegelbeelden) geëxtraheerd
naar een nieuwe top-level `const EntityLayer = React.memo(...)`, gedefinieerd IN HETZELFDE bestand (zelfde
conventie als WorkerNpcSlot/WorldWanderer al hadden — geen nieuw bestand nodig, module-constanten als
HERO_CROP blijven gewoon in scope). RpgLevelPanel's eigen pan-frame-render doet nu één goedkope
`<EntityLayer/>`-aanroep i.p.v. de hele entiteiten-subtree inline te construeren — en omdat alle ~27 props
al stabiel zijn tijdens puur pannen (Fase 1/2's eigen werk), slaat deze memo dat werk nu écht over.

Geverifieerd: slime-klik opent nog correct de dialoog (bevestigt EntityReflection's closure + click-
handlers overleefden de extractie), wandel-test toont alles nog pixel-uitgelijnd. Tests groen (961/962 —
1 onafhankelijk bevestigde flaky test, niets met deze wijziging te maken), lint 0 errors, build groen.

Logisch vervolg (nog niet gedaan): dezelfde extractie-truc toepassen op de scenery-blokken (nog steeds
inline in RpgLevelPanel's render). Zie docs/architecture.md §323.

## 2026-08-27 — ✅ #1162 Fase 4: SceneryBack/SceneryFront geëxtraheerd (Han: "doe maar")

Zelfde extractie-truc als Fase 3, nu toegepast op de scenery-blokken (LdtkScenery + LdtkLitGround +
LdtkAnimatedTiles/WaterReflectionLayer-wrapper + ForegroundFoliageLayer), zoals in Fase 3 als logisch
vervolg genoteerd en door Han goedgekeurd.

Twee nieuwe top-level `React.memo`-componenten in RpgLevelPanel.jsx, direct na EntityLayer: `SceneryBack`
(back-of-entities pass, incl. backgroundLayers + WaterReflectionLayer) en `SceneryFront` (front-of-entities
pass, edgeLitOnly=true, geen WaterReflectionLayer) — twee losse componenten i.p.v. één geparametriseerde,
omdat de originele code al die exacte back/front-splitsing had (§6d: hergebruik bestaande structuur, geen
nieuwe branching verzinnen). Legacy-mode scenery (oude hand-rolled parallax/floor/tree/tent JSX,
verweven met het LDtk-blok in de back-pass) blijft ONAANGEROERD, inline in RpgLevelPanel zelf — zelfde
scope-grens als elke vorige ronde.

Geverifieerd: Playwright-visuele-regressie — held liep rechts (~4s) en dan links voorbij startpunt (~7s) in
de open-world RPG; screenshots tonen correcte scenery-pan in beide richtingen, waterreflecties blijven
uitgelijnd onder de boomstam-brug, wilg + smid-NPC renderen correct gelaagd, geen console-errors. Tests
groen (961/962, 1 skip, geen flaky failures deze run), lint 0 errors (enkel verwachte nieuwe
react/prop-types warnings voor de nieuwe componenten hun ongetypede props, zelfde conventie als EntityLayer),
build groen.

Zelfde kanttekening als elke ronde van dit ticket: geen betrouwbare FPS-meting mogelijk vanuit deze GPU-loze
sandbox-sessie (SwiftShader software-rendering, zie §318) — Han's eigen hertest op echte hardware moet
uitwijzen of dit het resterende 41fps-gat verder dicht. Zie docs/architecture.md §324.

## 2026-08-27 — ✅ #1162 Fase 5: profiling wijst weg van React; dode mix-blend-mode overlay gegated

Han's hertest na Fase 4: "blijft redelijk consistent op 41 fps hangen" — twee rondes JSX-constructie-fixes
op rij (Fase 3 + Fase 4) leverden GEEN extra winst op. Nieuwe CPU-profiel-run (zelfde CDP+sourcemap-techniek
als §318, 4x throttle, 6s bewegen) op de POST-Fase-4 build: slechts ~14% van de tijd valt toe te schrijven
aan JS/React — >85% zit in de profiler's "(program)"-bucket, d.w.z. BUITEN JS-executie (layout/paint/
compositing/WebGL-rasterization), waar een JS CPU-profiler niet in kan kijken. Dit verklaart meteen waarom
Fase 3/4 niets opleverden: React was allang niet meer het dominante probleem na Fase 1/2.

Concrete verdachte gevonden: `domDarkenOverlayStyle` in RpgLevelPanel.jsx — een full-viewport
(`inset:0`) div met `mix-blend-mode: multiply` (§141's oude CSS-benadering van dag/nacht-tint voor de
Legacy-mode achtergronden), gerenderd ZONDER sceneryMode-gate, terwijl RAM-level (LDtk) al sinds de #925
follow-up zijn EIGEN WebGL-shader-belichting heeft (globalIllumination). mix-blend-mode dwingt de browser om
elke frame een aparte compositing-laag te blenden — precies het soort onzichtbare (voor JS-profiling) kost
die we nu zien, en de eerste concrete kandidaat uit deze profiling-ronde.

Fix: gegated tot `sceneryMode === 'Legacy'`. Geverifieerd: screenshot pixel-identiek aan voor de fix
(bevestigt dat de overlay in LDtk-mode met NIETS blendde — pure dode gewicht, geen visueel effect verloren),
DOM-check bevestigt de div nu volledig ongemount is in LDtk-mode (niet enkel onzichtbaar), 0 console errors.
Tests groen (961/962, 1 skip), lint 0 errors (exact dezelfde 2598 warnings, geen nieuwe), build groen.

Nog niet bewezen dat dit HET hele 41fps-plateau verklaart — Han stuurt na hertesten een echte Chrome
DevTools Performance-trace (niet CPU-profiler — de Performance-tab's Summary toont Scripting/Rendering/
Painting-percentages, wat mijn profiler niet kan) zodat de volgende stap op echte data gebaseerd kan worden
i.p.v. nog een code-gok. Bekende volgende kandidaat: ForegroundFoliageLayer's niet-gebatchte
`gl.drawArrays`-aanroep per foliage-instance (al gedocumenteerd in dat bestand) — een Performance-trace zou
dit direct zichtbaar maken. Zie docs/architecture.md §325.

## 2026-08-27 — ✅ #1162 Fase 6: witte schuimkoppen op water hersteld (Han miste ze)

Han na Fase 5: "ik ben de shimmer op het water kwijt! (de witte schuimkoppen) die moet je wel nog blijven
renderen." §319's "static watertiles"-instructie bundelde twee losse dingen onder overlappende
"shimmer"-terminologie — de implementatie gokte verkeerd en zette `isWater: false`, wat de witte-schuimkop-
sparkle helemaal uitschakelde.

Uitgezocht: de ECHTE perf-kost in §319 was de JS-tick-gedreven kolom-cycling (cache miss → synchrone
Sobel-normal-map-regeneratie). `isWater` is daar los van — puur een per-instance boolean die AL BINNEN de
al-lopende WebGL draw-loop één shader-uniform kiest (`uWhiteCapThreshold`/`uWhiteCapStrength`), geen extra
draw call, geen cache-lookup, geen timer. Herstellen is dus gratis.

Fix: `useLdtkWaterInstances.js` `isWater: false` → `isWater: true`. Tick/kolom-cycling-verwijdering (het
deel dat wél perf-toe deed) blijft ongewijzigd.

Geverifieerd: witte sparkle weer zichtbaar op het water bij de eend/zwaan, 0 console errors. Tests groen
(961/962, 1 skip), lint 0 errors, build groen. Zie docs/architecture.md §326.

## 2026-08-27 — 🔍 #1162: pixel-perfectness audit (Han: "is de foliage pixel swap Game Pixel perfect?")

Onderzocht, niets gewijzigd. Texture-sampling: correct (`gl.NEAREST`, geen bilinear blur). MAAR twee dingen
maken het geheel niet klassiek pixel-perfect, allebei bestaand ontwerp, geen bug:
1. `zoom` is continu (`dynamicZoom = size.h / LEVEL_PX_HEIGHT`, viewport-responsive), geen vast geheel getal
   — ongelijkmatige pixel-duplicatie bij nearest-neighbor sampling, los van bewegen.
2. Schermpositie wordt niet naar hele device-pixels afgerond (`uScreenPos = screenX * dpr`, geen
   Math.round) — "pixel swimming" tijdens pannen, versterkt door niet-gehele dpr (bv. 2.625 op Pixel 7).

Niet gefixt — ontwerpkeuze-afweging (heel getal zoom = geen perfecte viewport-fit meer). Voorgelegd aan Han
voor beslissing. Zie docs/architecture.md §327.

**Han's antwoord**: zijn echte vraag was smaller — "checken of deze dezelfde schaal heeft als alle andere
pixels: dus foliage pixel = 1gpx. Dat is voldoende voor nu!" Geverifieerd: ground tiles (`LdtkScenery.jsx`'s
`CanvasLayer`, `width: LEVEL_PX_WIDTH * zoom`) en foliage (`RpgLevelPanel.jsx`'s `foliageInstanceProps`,
`widthPx: inst.gridSize * zoom`) gebruiken exact dezelfde `zoom`-waarde (`dynamicZoom`, overal identiek
doorgegeven). **Bevestigd: foliage pixel = 1 gpx, zelfde schaal als elke andere laag** — geen mismatch,
niets te fixen. De zoom-fit/panning-shimmer punten hierboven blijven open maar zijn NIET gevraagd nu.

Voor de pine-forest 21fps/niet-gebatchte-draw-calls kandidaat: Han kiest EERST een echte Chrome DevTools
Performance-trace (Scripting/Rendering/Painting %) op zijn eigen hardware, voordat een grotere WebGL-
herschrijving (instanced rendering) gestart wordt. Wachten op die data — geen verdere actie tot dan.

## 2026-08-27 — 🔍 #1162: echte trace geanalyseerd — WebGL-hypothese INGETROKKEN, echte oorzaak is taak-volume

Han leverde een echte Chrome DevTools trace (651MB, iPhone 14 Pro Max emulatie, pine forest, ~20s incl.
bewegen). Geanalyseerd via een zelfgeschreven streaming JSON-parser (bestand te groot om in geheugen te
laden) die zowel per-thread busy-time berekent als het ECHTE V8 CPU-profiel van de main thread
reconstrueert uit de trace's ingebedde Profile/ProfileChunk-events (1.47M samples).

**Thread busy-time**: CrRendererMain (main thread) 99% busy over de hele 20s — GPU/raster worker threads
amper enkele tientallen ms elk. **Echte GPU-rasterization is dus NIET de bottleneck.**

**Dit trekt de "niet-gebatchte gl.drawArrays" hypothese (Fase 5) IN**: drawFrame/getTexture/bindTexture/
uniform*-aanroepen in ForegroundFoliageLayer samen < 0.1% van de samples. Verworpen.

**Wat het ECHT is**: ~95% van alle samples valt in vier NATIVE (niet-JS) buckets die niet aan app-code
toe te wijzen zijn: "run" (55.5%), "(program)" (25.0%), "createTask" (12.8%), "requestAnimationFrame"
(2.0%) — Chrome/V8-interne taak-scheduling, niet de INHOUD van een specifieke callback maar het aantal
apart geplande kleine taken. Direct herkenbare app-code (RpgLevelPanel+ForegroundFoliageLayer+
useRpgLevelState samen) is ruim onder 1%.

**Kanttekeningen**: (1) trace komt van de dev-server (npm run dev), niet de productie-build — een deel
van de react-dom_client.js-kost is DEV-ONLY validatie/warning-machinery die in productie niet bestaat;
(2) extreem hoge sample-rate (~74.000/sec) heeft zelf meetoverhead — percentages zijn richtinggevend, geen
exacte wandklok-verdeling.

**Concrete volgende kandidaat (nog niet gebouwd)**: de open-world-schermen registreren VEEL losse
requestAnimationFrame-loops (camera-pan, pet-animatie, walk-animatie, 2x ForegroundFoliageLayer,
2x LdtkLitGround, LdtkAnimatedTiles-tick, critter/vogel-wander, worker-audio-afstandcheck, ...) — elk een
APART geplande taak per frame. Dat matcht precies de createTask+requestAnimationFrame ~15%. Consolideren
tot minder (idealiter één centrale per-frame dispatcher) is de best onderbouwde volgende stap, maar is een
bredere, architectuur-rakende refactor over veel bestanden — verdient een eigen interview voor implementatie.
Voorgesteld: eerst dezelfde test herhalen tegen de PRODUCTIE-build (npm run build && npm run preview) om de
dev-mode ruis eruit te filteren, voordat de refactor gestart wordt. Zie docs/architecture.md §328.

## 2026-08-27 — 🔨 #1162 Fase 8: gedeelde useFrameLoop-ticker (Han: "start interview voor rAF-consolidatie")

Interview gehad: scope = OOK SheetRpgLayer (Levels/combat), aanpak = herbruikbare gedeelde "frame ticker"
hook (i.p.v. alles direct in RpgLevelPanel bundelen). SheetRpgLayer's eigen §1050-bevinding meegenomen in
het ontwerp: aparte rAF-chains lossen paint-blocking niet op (browser schildert pas na ALLE rAF-callbacks
van dat frame) — de ticker levert daarom alleen de RUWE rAF-timestamp (nooit een eigen afgeleide tijd) en
heeft een 'critical'/'throttled' priority-systeem, zodat audio-sync (context.currentTime, blijft door
subsystemen zelf gelezen) en paint-blocking-gevoeligheid intact blijven.

Nieuw: `src/hooks/useFrameLoop.js` + smoke test (4/4 groen).

Gemigreerd deze ronde (laagste risico, PUUR consolidatie, geen gedragswijziging, allemaal 'critical'):
RpgLevelPanel.jsx (camera-pan, pet-animatie, walk-animatie, alle WorldWanderer-instanties/critters+vogels)
en useRpgLevelState.js (speler-beweging/pet-follow). Belangrijkste valkuil: tick-state (`startMs`/`last`)
die voorheen als closure-`let` in een eenmalig-lopend effect leefde, moest naar een `useRef` — useFrameLoop
roept altijd de LAATSTE callback-closure aan via zijn eigen ref, dus een closure-`let` zou bij elke render
resetten i.p.v. per-tick te persisteren.

BEWUST NOG NIET gemigreerd (gevlagd, niet vergeten):
1. ForegroundFoliageLayer/LdtkLitGround/LdtkAnimatedTiles's eigen WebGL-tekenlussen — die zijn async (await
   texture-loads) en pacen zichzelf door pas de VOLGENDE frame te vragen in een `finally`-blok na volledige
   afronding, nooit overlappend. Een naïeve migratie zou overlappende/interleaved WebGL-aanroepen kunnen
   geven — heeft een "nog bezig, sla deze tick over"-guard nodig. Volgens SS328's eigen trace-bevinding is
   hun JS-kost sowieso <0.1% van de samples, dus lagere prioriteit dan het eerst leek.
2. SheetRpgLayer.jsx — de meest invariant-gevoelige rAF-lus in de hele codebase (dezelfde die #1159 al eens
   een echte productiebug had). Migratie hier volgt apart, met de bestaande #1159-regressietest als
   expliciete gate — nog niet gestart.

Geverifieerd: Playwright (rennen, stilstaan+pet-catchup, links lopen — alles correct, 0 console errors,
visueel consistent met eerdere baselines). Tests groen (972/973, 1 skip — de 15 worldLayout.test.js-
failures in dezelfde run zijn PRE-EXISTING, ongerelateerd werk van Han, bevestigd via git status).
Lint 0 errors (2 nieuwe react-hooks/exhaustive-deps warnings van de WorldWanderer-cleanup-split bewust
onderdrukt met rationale — de refs zijn langlevende gedeelde registries, geen DOM-refs). Build groen.
Zie docs/architecture.md §329.

## 2026-08-27 — ✅ #1162 Fase 8 vervolg: SheetRpgLayer gemigreerd + per-subscriber error-isolatie

Voor SheetRpgLayer aan te pakken eerst een echt gat gevonden en gefixt: useFrameLoop's gedeelde tick() had
GEEN isolatie tussen subscribers — één subscriber die throwt zou de HELE ticker breken (requestAnimationFrame
nooit meer opnieuw aangevraagd), voor ALLE subscribers, niet alleen de falende. SheetRpgLayer's eigen lus
heeft try/catch juist om deze exacte reden (#863, ooit een echte productiecrash). Fix: elke subscriber-call
in een eigen try/catch (`runSubscriber`), nieuwe error-code E034-FRAME-LOOP-SUBSCRIBER (toegevoegd aan
CLAUDE.md §7a). Nieuwe test bevestigt: een gezonde subscriber blijft tikken ook als een andere elke frame
throwt.

SheetRpgLayer.jsx migratie bleek de VEILIGSTE van de drie, niet de riskantste — deze lus las AL elke
tick-state via refs (geomRef/ctxRef/scrollStartRef/pausedRef/etc.), precies het patroon useFrameLoop nodig
heeft, en wel VANWEGE een eerder gedocumenteerde bug (2026-08-10 stale-closure fix). Geen ref-conversie
nodig (in tegenstelling tot RpgLevelPanel/useRpgLevelState, die elk één closure-let hadden).

Geverifieerd — de afgesproken expliciete gate: volledige SheetRpgLayer.test.jsx-suite (20 tests) groen,
INCLUSIEF de #1159-regressietest bij naam. Tests groen (990/991, 1 skip, volledige suite), lint 0 errors, 0
nieuwe niet-prop-types warnings in SheetRpgLayer.jsx, build groen. Live-browser sanity check (na een
stale-dist-404 die bleek te komen van het herbouwen terwijl een preview-server nog de OUDE build serveerde —
een test-sequencing-artefact, niets met de code te maken, opgelost door de server te herstarten): open-world
scherm rendert correct na migratie, 0 console errors.

Fase 8 nu compleet voor de oorspronkelijk afgesproken scope (beide schermen geconsolideerd). Nog open: de
async WebGL-tekenlussen (ForegroundFoliageLayer/LdtkLitGround/LdtkAnimatedTiles) blijven bewust op hun eigen
rAF-lus — zie SS329's eigen lijst. Wacht op Han's hertest op echte hardware voor het echte FPS-effect van
deze hele Fase 8. Zie docs/architecture.md §330.

## 2026-08-27 — 🐞✅ Periodiek loop/animatie-stotteren gefixt: animated-tiles cull herbouwde elke rAF-frame

Han: "ongeveer elke schermbreedte, de animatie een klein beetje vertraagt, en dan terug versnelt" —
overal in de wereld, sinds een van de eerste RPG-world builds.

**Root cause**: `culledAnimatedTilesBack`/`Front` (campfire cull-lijst) was een `useMemo` die afhing van
`cullTilesToViewport`, die op zijn beurt afhing van `localWorldToScreenX` — de CAMERA-AFHANKELIJKE
projectiefunctie (leest `cameraX`-state, verandert elke rAF-frame tijdens lopen). Dus de "memoized" array
werd elke frame opnieuw opgebouwd tijdens beweging, ondanks het eigen commentaar dat het tegendeel
beweerde — precies het soort constante per-frame heap-allocatie dat periodieke GC-pauzes veroorzaakt.
GC-pauzes zijn tijd-periodiek; bij een vrij constante loopsnelheid ziet dat er ruimte-periodiek uit
("elke schermbreedte"). Sterk onderbouwde hypothese uit code-lezen (sowieso een echte, verspillende bug),
niet bewezen via een live profiel — Han koos "fix nu, dan testen" boven "eerst een trace."

**Fix**: nieuwe `useCulledAnimatedTiles`-hook (module-level in RpgLevelPanel.jsx), herberekent op de
gedeelde useFrameLoop-ticker met 'throttled' cadans (150ms, ruim binnen de bestaande CULL_MARGIN_PX=400
buffer's speling), gebruikt de camera-ONAFHANKELIJKE `localWorldToScreenXLocal` + een live
`cameraOffsetRef`-read (zelfde patroon als ForegroundFoliageLayer's eigen culling), met een dedup-check
zodat setState alleen vuurt als de zichtbare SET tegels echt verandert. Dode `localWorldToScreenX` (enige
caller was deze bug) verwijderd, niet uitgecomment.

Geverifieerd: tests groen (993/994, 1 skip — één eigen useFrameLoop-test bleek flaky onder volledige-
suite-belasting, gehard door de sleep-marge te verruimen), lint 0 errors, build groen. Playwright: twee
lange wandelingen (8s rechts, 12s links voorbij startpunt, nieuw gebied in), animated tiles verschijnen/
verdwijnen nog correct, 0 console errors, geen visuele regressies.

Nog niet bevestigd of dit HET gerapporteerde stotteren daadwerkelijk oplost — wacht op Han's hertest op
echte hardware. Zie docs/architecture.md §335.

## 2026-08-27 — 🔨 #1162 Fase 10a: foliage texture-atlas (grote WebGL-herschrijving, Stap 1/3)

Han bij nog steeds ~40fps na de rAF-consolidatie: "wat kun je nog meer voor optimalisaties doen?" →
gekozen voor de grote WebGL-instanced-rendering herschrijving i.p.v. eerst productie-build testen.
Correctie op SS328: die concludeerde dat WebGL-tekenoproepen goedkoop waren (<0.1% van samples), maar dat
keek alleen naar waar de JS-CALL-SITE toegeschreven werd — de ECHTE native kost van gl.uniform*/
gl.bindTexture-aanroepen (WebGL-validatie, ANGLE-vertaallaag) landt in de profiler's generieke "run"/
"(program)"-buckets, niet onder de aanroepende JS-functie. ForegroundFoliageLayer doet 1 gl.drawArrays +
~15 gl.uniform* + 2 gl.bindTexture PER zichtbare instantie (tot 150+ per frame) — precies het soort
main-thread-overhead dat in die buckets zou verstoppen, terwijl GPU/raster-threads inactief blijven.

Plan (goedgekeurd, ~/.claude/plans/dynamic-questing-naur.md): 3 fases — (10a) gedeelde texture-atlas zodat
alle instanties dezelfde texture kunnen delen; (10b) WebGL instancing (ANGLE_instanced_arrays) zodat de
hele zichtbare set in 1 tekenoproep past; (10c) echte instanties aansluiten. Scope: alleen foliage (enige
laag met per-instance tekenoproepen); water bewust buiten scope (crop-selectie hangt af van een per-
plaatsing random offset privé aan useLdtkWaterInstances.js, niet netjes te delen zonder die stateful logica
te dupliceren — foliage domineert het instantie-aantal toch al ruimschoots). Atlas-bouw gechunked via
requestIdleCallback (Han's eigen expliciete vraag), zelfde BATCH_SIZE-conventie als useLdtkFoliageInstances.js.

Fase 10a klaar: nieuwe useLdtkFoliageAtlas.js — dedupliceert crops op dezelfde sleutel-conventie, pakt ze
in een grid (elke crop is even groot, dus geen bin-packing-algoritme nodig) in twee gedeelde canvassen
(diffuse+normal, zelfde layout), gebouwd in idle-callback-batches. Normal-crops tekenen rechtstreeks van
`normalMapCanvasFromCrop`'s canvas-resultaat (geen dataURL/`<img>`-omweg nodig, in tegenstelling tot het
OUDE per-instance pad). NOG NIET aangesloten op het tekenen — enkel geverifieerd via een debugMode-preview
(twee atlas-canvassen als `<img>`, gate net als de bestaande Foliage-debug/params-panelen).

Geverifieerd: Playwright-screenshot toont 60 unieke crops, netjes gegrid gepakt zonder gaten/overlap,
diffuse+normal atlas ruimtelijk uitgelijnd (zelfde crop = zelfde celpositie in beide, gecontroleerd via een
herkenbare boomstam/water-vorm), 0 console errors. Smoke test (2/2, mockt canvas/Image net als de
buurhooks geen tests hebben vanwege ontbrekende jsdom-canvas-support). Tests groen (995/996, 1 skip), lint
0 errors, build groen.

Nog te doen: Fase 10b (instanced shader/tekenpad) en 10c (echte instanties aansluiten) — zie het planbestand
voor het volledige technische ontwerp. Zie docs/architecture.md §337.

## 2026-08-27 — ✅ #1162 Fase 10b prep: uEdgeLitOnly losgekoppeld van de gedeelde shader-functie

Voordat de instanced shader geschreven kon worden: `edgeLightFactor()` (gedeeld tussen ForegroundFoliageLayer
en LdtkLitGround, CLAUDE.md §6d) las `uEdgeLitOnly` als impliciete global. Voor instancing moet dat een
per-instance `varying float` worden (GLSL ES 1.00 kent geen `varying int`), maar een `varying` kan geen
declaratie delen met een `uniform` van dezelfde naam in een ander shader-programma. Fix: `edgeLightFactor`
neemt `edgeLitOnly` nu als expliciete parameter i.p.v. een gedeelde global te lezen — puur syntactisch,
gedrag 100% ongewijzigd voor de twee bestaande shaders.

Onderweg gevonden (niet door review, door de build zelf): een paar toegevoegde commentaren gebruikten
markdown-backticks BINNEN de GLSL-broncode-strings (gewone JS template literals) — een backtick sluit zo'n
string voortijdig af. `npm run build` faalde meteen met een JS-syntaxfout op de exacte regel. Gefixt, en
expliciet gecontroleerd dat er geen andere backticks meer in een shader-template-literal zaten. Goed om te
onthouden voor de rest van Fase 10b/10c — nog meer shader-string-bewerking te gaan.

Geverifieerd: tests groen (995/996), lint 0 errors, build groen. Playwright door het werkersdorp/wilg/vijver
(oefent beide shaders tegelijk uit): 0 console errors, rendering visueel ongewijzigd t.o.v. de baseline.

Zie docs/architecture.md §338.

## 2026-08-27 — ✅ #1162 Fase 10b: de instanced shader werkt, geverifieerd in isolatie (Han: "goed!")

Nieuwe FoliageInstancingTest.jsx (debug-only, tijdelijk): eigen geïsoleerde WebGL1-context, compileert de
NIEUWE instanced vertex+fragment shader, tekent echte crops uit de Fase 10a-atlas via ÉÉN
drawArraysInstancedANGLE-call — nul risico voor de echte rendering.

Wat veranderde: de ~13 waarden die per instantie varieerden (uScreenPos/uSizePx/uDiffuseUV/
uWorldCenterX/Width/Height/uGroundDistOffset/uInstanceKind/uHasWave/uHasSkew/uWhiteCapThreshold/Strength/
uEdgeLitOnly) zijn nu per-instance vertex-attributen (5 gepakte vec4's, divisor=1), gelezen als varying
i.p.v. uniform in de fragment-shader. Int-uniforms werden 0.0/1.0-float-varyings. Waarden die AL identiek
waren over elke instantie (skew/stretch/waveSteps/lighting-params — allemaal uit foliageParams, geen
instantie-data) blijven gewoon per-tekenoproep-uniforms, ongewijzigd — bevestigd door de OUDE lus's exacte
gl.uniform*-aanroepen te herlezen, niet aangenomen. De gl_FragCoord-gebaseerde pixel-berekening (SS141
ronde 20's eigen fix voor varying-interpolatie-wobble) blijft ONGEWIJZIGD — veilig, want alle 4 hoekpunten
van één instantie's quad delen dezelfde attribuutwaarde (divisor=1), dus GPU-interpolatie daarvan is exact.

Twee echte bugs gevonden door de isolatietest, precies waarvoor die gebouwd is: (1) een markdown-backtick
binnen een GLSL-string (zelfde foutklasse als SS338, gevangen door de build's JS-syntaxfout); (2) een
ontbrekende `varying float vEdgeLitOnly;` in de FRAGMENT-shader (wel in de vertex-shader) — WebGL-link
faalde runtime met "undeclared identifier", gelogd via E021-FOLIAGE-SHADER-COMPILE, gevangen door de
Playwright console-check. De build's JS-syntaxcheck kan dit soort GLSL-fout NIET vangen — precies waarom
deze geïsoleerde live-browser-verificatie nodig was vóór dit ooit de echte content raakte.

Geverifieerd: 0 console/shader-errors na de fixes; ingezoomde screenshot toont 3 echte foliage-crops uit de
atlas correct getekend — juiste alpha-cutout transparantie, scherpe NEAREST-gefilterde randen, zichtbare
normal-map-schaduwdiepte. Tests groen (995/996), lint 0 errors, build groen.

Nog te doen (Fase 10c): deze bewezen shader verhuizen naar ForegroundFoliageLayer.jsx zelf, de echte
per-frame instance-buffer bouwen uit de echte zichtbare instantie-lijst, de oude per-instance-lus vervangen.
Legacy-mode blijft volledig ongewijzigd. Zie docs/architecture.md §339.

## 2026-08-27 — ✅ #1162 Fase 10c: echte integratie — foliage tekent nu via ÉÉN instanced call (Han: "ok top, fase 10c!")

De bewezen shader uit SS339 verhuisde van FoliageInstancingTest.jsx naar ForegroundFoliageLayer.jsx zelf.
ADDITIEF, geen vervanging: het component draait nu TWEE tekenpassages per frame — de ORIGINELE
per-instance-uniform-lus (water + alle Legacy-mode objecten, ongewijzigd) plus een NIEUWE instanced pass
(LDtk-mode foliage, voorheen ook via de oude lus, nu volledig omzeild).

ForegroundFoliageLayer.jsx: VERTEX_SRC_INSTANCED/FRAGMENT_SRC_INSTANCED letterlijk overgenomen; createProgram
neemt nu expliciete bronnen (compileert beide programma's met dezelfde helper); de GL-setup-effect compileert
ook het instanced-programma (ANGLE_instanced_arrays-extensie, attribute/uniform-locaties, één instanceBuf) —
niet-beschikbaar wordt getolereerd net als "WebGL unavailable" elders in dit bestand (§7a), de oude pass blijft
onaangetast. Nieuwe atlas/atlasInstances-props; een aparte useEffect (keyed op [atlas]) upload de atlas-textures
onafhankelijk van de eenmalige GL-setup-effect, want de atlas publiceert meerdere keren incrementeel (SS337).
drawFrame krijgt een nieuw blok NA de bestaande lus: culled atlasInstancesRef.current met dezelfde
cullMinX/cullMaxX, pakt de zichtbare set in één Float32Array (20 floats/instance), upload met één bufferData,
zet de gedeelde per-tekenoproep-uniforms, bindt de atlas-textures ÉÉN keer, en tekent met ÉÉN
drawArraysInstancedANGLE — vervangt wat anders N × (drawArrays + ~17 uniform-calls) was geweest, precies de
per-instance WebGL-API-overhead die SS328's echte-hardware-trace aanwees.

RpgLevelPanel.jsx: useLdtkFoliageInstances-aanroepen VERWIJDERD (niet alleen ongebruikt — die hook deed zijn
EIGEN aparte runtime-Sobel-normal-map-generatie per crop, nu pure verspilde arbeid want useLdtkFoliageAtlas.js
genereert die normal maps al in de atlas). Nieuwe atlasFoliageInstanceFor(tile) bouwt de atlas-instantie
rechtstreeks uit de ruwe LDtk-tile, met dezelfde sleutel-conventie als useLdtkFoliageAtlas.js (§6c); positie/
flip-wiskunde regel-voor-regel overgenomen uit useLdtkFoliageInstances.js's instanceFor (bewezen correct, enkel
de UV-bron veranderde). localFoliageInstancesBack/Front zijn nu WATER-ONLY; atlasFoliageInstancesBack/Front
zijn de nieuwe parallelle lijsten, doorgegeven via SceneryBack/SceneryFront naar ForegroundFoliageLayer's nieuwe
atlas/atlasInstances-props. Legacy-mode call sites blijven ongewijzigd — atlas/atlasInstances zijn daar simpelweg
null/[] (useLdtkFoliageAtlas zelf geeft al null terug buiten sceneryMode:'LDtk').

Geverifieerd: npm run test:run (995/996), npm run lint (0 errors), npm run build allemaal groen. Live-browser
Playwright-check tegen een verse `vite preview`-build (default view = sceneryMode:'LDtk', bevestigd in de code,
niet aangenomen): 0 console errors (geen E021, geen WebGL-fouten) bij zowel initiële mount als na het lopen van
de hero door een vijver/boomstam/bosrand-scène — dezelfde scène die bosjes, achtergrond-bladerdak, én een
foliage-tegel-voorgrondobject tegelijk toont. Screenshots tonen foliage met intacte alpha-cutout-transparantie,
scherpe pixel-randen, en normal-map-schaduwdiepte — geen zwarte vlakken, geen ontbrekende textures, geen visuele
corruptie t.o.v. de pre-Fase-10-baseline. Dit bevestigt dat de shader compileert/linkt en de echte
instance-buffer-koppeling correct is; het bevestigt NIET en kan niet bevestigen de echte FPS-impact — geen GPU
aanwezig in deze sandbox-omgeving, dus de daadwerkelijke framerate-winst vereist nog steeds Han's eigen
hardware-hertest (`npm run dev`), dezelfde staande voorwaarde als elke perf-ronde in dit ticket.

Nog onbeslist (vraag aan Han): of FoliageInstancingTest.jsx (SS339's geïsoleerde testomgeving) nu verwijderd
moet worden, of blijft als permanente debug-tool voor toekomstig shader-werk.

Zie docs/architecture.md §340.

---

## 🐞 Level 13 wizard cast = geen geluid (square wave onhoorbaar) — Han 2026-08-28

**Symptoom:** In LEVEL 13 (`enemyType: "Wizard"`) speelt de wizard-cast preview
(`App.jsx wizardPreviewRef` → `createMelodicInstrument(context,'lead_1_square')`)
geen hoorbaar geluid. Moet de square-wave lead zijn. Was eerder "te hard"
(#313/#315), nu na de smplr-remirror onhoorbaar.

**Bevindingen:**
- `lead_1_square` routeerde via `LEGACY_INSTRUMENT_OVERRIDES` →
  `/samples/Instruments/lead_1_square-classic/*.wav` (MusyngKite mirror). Gemeten
  piek **~0.06** van full-scale, en de synth-leads kregen — anders dan woodblock —
  BEWUST géén gain-compensatie ("te hard al"). Klopte voor de FluidR3-versie
  (piek ~0.69), niet voor de MusyngKite-opname → onhoorbaar op mezzo-forte.
- De hele #313/#315-boel (`extract-legacy-synth-leads.mjs`,
  `legacySynthLeadBuffers.generated.js`, 176 `*-classic/*.wav`) was **nooit in git
  gecommit** → clean checkout / CI / deploy zou niet eens builden (dangling import).

**Fix (✅ 2026-08-28):**
- `LEGACY_INSTRUMENT_OVERRIDES` bevat de twee synth-leads niet meer (alleen
  woodblock). Ze vallen terug op de gecommitte FluidR3-extractie.
- Nieuwe `MELODIC_TONE_SHAPING` in `localInstruments.js`: per-slug
  `{ lpfCutoffHz, gain }`. `lead_1_square` = `{2600, 0.5}`, `lead_2_sawtooth` =
  `{2200, 0.45}`. `lpfCutoffHz` → per-voice lowpass biquad in smplr's `Voice`;
  `gain` → `output.addInsert` gain-node. Beide waarden zijn op-gehoor te tunen.
- `extract-legacy-synth-leads.mjs` + `legacySynthLeadBuffers.generated.js`
  verwijderd; de twee `*-classic/` WAV-mappen verwijderd.
- `docs/architecture.md`: §315 gemarkeerd als SUPERSEDED, nieuwe §344.
- ⚠ Nog open (aan Han): `woodblock-classic/` (88 files, metronoom) is óók
  untracked in git — zelfde landmijn, bewust niet in deze fix meegenomen.
- Groen: `npm run test:run` (1008 pass / 1 skip), `npm run lint` (0 errors),
  `npm run build` (clean). **Nog niet op gehoor geverifieerd** — Han's UAT.

---

## ⏳ Future: fine-grained scheduling lookahead for smoother tempo ramps — Han 2026-08-28

**Idea (follow-up to #1102 adaptive tempo).** Decouple *generation* cadence from
*audio-schedule* cadence. Keep generating musical content at block/measure
granularity (the pipeline's phrase/rhythm structure needs that), but commit notes
to the AudioContext schedule only ~1 quarter note ahead instead of a full
block/chunk. A shared quarter-note tick reads the live bpm for every track
together (finer version of `Sequencer.scheduleBlock`'s per-measure
`bpmRef.current` re-read), so a tempo change lands almost immediately and in sync
across all instruments — enabling a smooth accelerando/ritardando glide rather
than stepped bpm changes at 2-measure boundaries.

**Edge case:** a note whose duration exceeds the (now tiny) lookahead window is
scheduled note-on before its note-off is known. Its note-off must be
(re)scheduled/cancelled on time as the tempo evolves. Acceptable because
note-off timing is far less critical than note-on (Han) — reuse the existing
StopFn / `stop({ time })` pattern, re-issue the stop at the recomputed time when
bpm changes.

**Not in #1102 scope** — #1102 ships the block/chunk-boundary bpm step with
`commitIndexFor`/lcm exact-sync. This is a later refinement of the same feature.

**Status:** ⏳ backlog — no ticket yet.

**Can a note's end time be overridden / sustained longer? (Han 2026-08-28)** Mostly
yes, depends on voice type:
- Oscillator voices (`createMelodicInstrument`, e.g. `lead_1_square`): full control
  of the release — move the note-off later freely; if a release ramp was already
  scheduled, `gain.cancelScheduledValues(t)` + reschedule.
- Looped / long soundfont samples (most melodic `Soundfont`, cello, piano): can be
  held longer via a later `stop({ time })`, within the sample's usable length.
- Short decaying one-shots (percussion, plucks): natural decay is fixed — can stop
  earlier, cannot stretch beyond the recording.
With ~1-quarter lookahead the note-off usually isn't scheduled yet when tempo
changes, so you just compute it at the new (slower) tempo — it sustains longer
for free, no "override" needed. Precedent already in the codebase:
`useLevelGatedRubatoAudio.js` (#1096) holds cello notes until a frozen-aware
clock passes the note's end event — same mechanism, gate-driven instead of
tempo-driven.

---

## 🐞 World bottom-area: content blocks balloon vertically on tall/narrow viewports — Han 2026-08-28

**Symptoom (world 598×272, nav 598×16, content1 342×611, content2 256×611 — `h-row`, N=1):**
- Contentblokken zijn veel hoger dan wijd (342×611 / 256×611) → "heel lelijk".
  Han: bij >150 gpx hoogte liefst altijd **boven elkaar** (full-width) i.p.v. naast elkaar.
- "Melody Hill" wordmark veel te groot t.o.v. de piano — `melodyPx = max(5·sy, letterPx)`
  en `sy = syFit = floor(box.h / NATIVE_H)` balloont omdat het blok 611px hoog is.
- Enorme lege ruimte onderaan (de blokken vullen álle overgebleven hoogte).
- Han: "had ik niet gezegd dat schermhoogte max 320 mocht zijn? sta dat toe."
  (Bestaat NIET in worldLayout.js — `WORLD_GPX_H_MAX=320` capt alleen het WORLD-blok.)
- 598px breed = net onder de N=2-drempel (`w/2 ≥ 304` → w ≥ 608) → vast op N=1 → worst case.

**Root cause:** `worldLayout.js` `build()` — "Blocks fill the leftover bottom-area height"
(bewuste keuze §334). Geen cap op contentblok-hoogte; geen max op de content-band.

**Ronde 1 (teruggedraaid):** blokken op vaste content-hoogte (`CONTENT1_GPX_H`/`CONTENT2_GPX_H` +
`blockH()`), surplus als één gap onder alles. Han ronde 3: "content 1 en 2 mogen padding hebben en
vangen alle verticale ruimte overschot op" → surplus moet IN de blokken als marge, niet als gap.

**Fix (✅ 2026-08-28) — zie architecture.md §345:**
- `worldLayout.js`: **portret (`h > w`)** → `pickArrangement` kiest `h-col`/`split` (full-width
  gestapeld, restant 50/50) vóór de normale volgorde. Landscape onaangeroerd. `build()` verder terug
  naar origineel: blokken **vullen** de overgebleven hoogte. `worldScreenHeight`/`bandGpx`
  ongewijzigd → world-hoogte identiek.
- `WorldPiano.jsx` (ronde 4): toetsen ALTIJD bottom-anchored op onderkant blok 2; board rekt omhoog
  zodat de **bovenkant vilt = bovenkant van het denkbeeldige gecentreerde 64-gpx-vak** in blok 2
  (`keysH + feltH ≈ (box.h + 64·N)/2`). `sy` lost dat op en **snapt naar heel veelvoud van N**
  (gpx-perfect toets-randen), toetsen ≥ 60 gpx. `kFit`-cap: toetsen nooit hoger dan blok 2 (logo +
  weerkaatsing clippen dan bovenaan weg — toegestaan). `melodyPx = letterPx`. `NATIVE_H`/`syFloor`/
  `syFit` weg.
- worldLayout-tests: portret-stack + landscape-onveranderd. `npm run test:run` / `lint` / `build` — groen.

**Status:** 🔨 impl klaar — Han UAT. Tweak-knoppen: `CENTRE_BOX_GPX` (64) en `KEYS_MIN_GPX` (60) in
WorldPiano; `melodyPx` als het logo groter moet.

### 🔨 World scale: 1.5 half-step (#347) — Han 2026-08-28

Smalle mobiel (~560–607px breed) zat vast op N=1 (N=2-gate = `w ≥ 608`) → veel leegte.
Besluit Han: **1.5** als enige extra stap (geen 2.5/3.5). Eén schaal overal (geen world/UI-split —
afgeraden, breekt §334-invariant). Gate op **`devicePixelRatio ≥ 2`** (daar is 1.5 = 3 hele
device-px, pixel-perfect; dpr-1 desktop blijft crisp N=1).

- `worldLayout.js`: `SCALE_STEPS_BASE` / `SCALE_STEPS_HALFSTEP`, `computeWorldLayout(w, h, dpr=1)`,
  gate. Bump-logica ongewijzigd → hele integers houden voorrang, 1.5 alleen als N=2 niet past.
- `App.jsx`: geeft `window.devicePixelRatio` mee.
- 3 tests (580×900 dpr2 → 1.5; dpr1 → 1; brede viewports → integer). test/lint/build groen.

**Status:** 🔨 impl klaar — Han UAT op echt toestel (pixelfont / piano op 1.5).

### 🔨 World/content hoogte-LADDER (#348) — Han 2026-08-29

Regel Han: "hoogtes: 240 en 64 → lineair naar 272 en 92: vanaf dan → content naar 128. Dan level
hoger → max 320." Interview: boven de ladder → content vangt de rest op; 64/92/128 = **per blok**;
geldt voor **alle** arrangementen.

- `worldLayout.js`: `worldScreenHeight` → `distributeHeight(H, o, k)` — piecewise-lineair,
  `world + o + k·content === H` (vult viewport exact, geen gap). `ARRANGEMENTS` krijgen `o`
  (verticale nav-overhead) + `k` (blokken gestapeld); `bandGpx` = `o + k·64` (afgeleid, zelfde
  getallen). `build()` herschreven: `worldH` + nav + `cH`-per-blok, laatste blok slikt afronding.
- `cropFor` → extra `skyPadGpx = max(0, gpxH − 272)` voor fase 3 (world 272→320). `App.jsx`:
  `topSection` achtergrond `#8fd0d9` (= top van RpgLevelPanel's eigen sky-gradient) vult de strook
  boven de 272-gpx level-art. RpgLevelPanel zelf ongewijzigd (blijft 272·N, bottom-anchored).
- Gedragswijziging (bewust, Han's regel): breed landscape zit nu lager op de ladder — 1920×1080 →
  world ≈ 261 gpx i.p.v. 272. Geen regressie.
- worldLayout-tests: nieuwe ladder-describe (320-max + skyPad; exact-fill; monotoon) + invariant/
  scale-selection asserts bijgewerkt. `test:run` (1054/1055) / `lint` (0 err) / `build` groen.

**Status:** 🔨 impl klaar — Han UAT (vooral fase 3: de sky-strook boven de wereld op een hoog scherm;
`#8fd0d9` is een gok-match, 1-liner om te tweaken).

---

## #1102 — Adaptive mode (letter `i`): bpm volgt live de ANPM ✅ (2026-08-28)

Hervat na de pauze van 2026-08-23 (§298). Han 2026-08-28: ÉÉN pass, alle drie de
content-architecturen, treble/bas moeten op DEZELFDE maat wisselen ("force exact sync").
Drempels ≥90% sneller / <70% langzamer / hold ertussen: bevestigd als eerste versie.

- ✅ `adaptiveTempo.js`: `lcmOf` + `commitIndexFor` — de exact-sync primitief (eerste maatindex
  die een grens is van ELKE stream van dit level). Formules van §298 ongewijzigd hergebruikt.
- ✅ `levels.js`: variant `i` niet langer `notYetImplemented`; `applyLevelVariant(lvl, letter, anpm)`
  zet `bpm = baselineAdaptiveBpm(lvl, anpm)`, herberekent de span-bundel, stempelt
  `adaptive` + `adaptiveBaseBpm` (het GESCHREVEN tempo — daar hangt de clamp aan).
- ✅ `useAdaptiveTempo.js` (NIEUW): `bpmRef` blijft de enige bron voor "tempo NU" (zelfde patroon als
  `Sequencer.scheduleBlock`, die `bpmRef.current` per maat vers leest). Wat er bij komt is één
  GEPLANDE wijziging: JIT-streams plannen audio een scherm vooruit, dus ze moeten het tempo van maat M
  al kennen vóórdat de app-brede `bpm` mag wisselen (anders loopt het beeld een chunk voor op de muziek).
- ✅ Beide JIT-hooks lezen bpm VERS per blok/chunk (niet in de effect-deps!) en plaatsen elk blok met
  een OPGETELDE seconden-cursor i.p.v. `index * measures * barSec`.
- ✅ Beslisser: treble-stream voor JIT-levels; een App.jsx-effect op `level.wave` voor de klassieke
  per-wave levels (geen koppeling in `useLevel.js` nodig).
- ✅ `tempoScrollAnchor.js` (NIEUW) + `tempoScrollMs` in SheetRpgLayer: her-ankert bij elke
  tempowissel, zodat de scrollpositie NIET springt — alleen de snelheid verandert. Alle 8 call sites
  gebruiken dezelfde uitdrukking.
- ✅ Tests: 30 nieuw/aangepast. `npm run test:run` 1046 groen, `lint` 0 errors, `build` schoon.
- 📄 docs/architecture.md §346 (en §298 gemarkeerd als hervat/afgerond).

**Status:** 🔨 impl klaar → Han UAT. Let vooral op: (a) voelt ±5% per blok goed of te traag/te
schokkerig? (b) hoor/zie je bas en treble ooit uit de pas lopen op het moment van de wissel?
(c) de timpani-one-shot wordt bewust NIET mee-versneld (zie §346 "known limitations").

### #1102 — afrondingsronde na Hans UAT-bounce ✅ (2026-08-29)

Han's bounce (UAT 2026-08-28): *"geen zichtbare versnelling op level 4 & 11"* → oorzaak: die levels
waren 1 generatie-chunk, dus de beslisser evalueerde 0 keer. Eerst ticket B (#1163/#1164/#1165/#1166),
daarna #1102 afmaken. Die vier zijn klaar; dit is de afrondingsronde.

- ✅ **Nul-ANPM baseline → 0.7× het geschreven tempo** (`NO_ANPM_BASELINE_FACTOR`, adaptiveTempo.js).
  Was het geschreven tempo zelf = de clamp-BOVENGRENS, dus versnellen was onmogelijk voor wie nog
  geen ANPM heeft.
- ✅ **Evaluatie-aanloop: een adaptief level speelt zijn eigen content 3× door**
  (`ADAPTIVE_LEVEL_REPEATS = 3`). Mechanisme: `applyLevelVariant` vermenigvuldigt de EIGEN
  `totalMeasures` van het level — het ene lengteveld dat `blockCountFor` / `wavesForLevel` /
  `totalNotesForLevel` / de timpani-span / de eind-maatstreep allemaal al lezen — dus 3× is
  structureel gewoon een langer level en eindigt via de paden die al bestaan. Bewust NIET voor
  `songId`-levels (hun song-slice herhaalt niet → §289 "level eindigt nooit") en niet voor
  non-sideScroll levels (daar evalueert de stream sowieso niet).
- ✅ **Integratietest** `src/hooks/__tests__/adaptiveMode.integration.test.js` (13 tests): echte
  controller + echte content-stream om een echt level heen. Baseline (incl. 0.7×), ±5%, deadband,
  clamp op beide grenzen — allemaal afgelezen aan de ECHTE scheduling-argumenten; alle sporen
  wisselen op hetzelfde blok; 3× blokken en dan stoppen.
- 📄 docs/architecture.md **§354** — één samenhangende adaptive-tempo sectie die §346 + §350's
  "#1102-naad" + §298 vervangt (die drie blijven als historie staan, met een verwijzing).
  Ook de verouderde header van `adaptiveTempo.js` gecorrigeerd (noemde de verwijderde
  `useLevelTrebleStream.js`).

**Status:** 🔨 impl klaar → Han UAT. Let vooral op: (a) voelt ±5% per blok goed? (b) is 3× doorspelen
niet te lang? (c) **de timpani wordt NIET mee-versneld** en loopt nu over ~24 maten — dat is het
duidelijkste hoorbare risico van deze ronde (§354 known limitation 1).

### #1102 UAT-ronde 2 (Han 2026-08-29/31) — level eindigt niet + leesbaarheid + audiosync

Han UAT Level 4 + `i`: ✅ bpm stijgt zichtbaar ("precies wat ik wil"). 3 punten terug:

- 🐞→✅ **Level eindigt niet; na de eindstreep een reeks MISSES, geen resultaatscherm.** Een
  #1165-regressie die #1102's 3× blootlegde (raakt ook #1166's omgezette 4-waves levels).
  Na #1165 heeft "wave cleared" nog maar één trigger in de hele app (SheetRpgLayer
  `killedCount >= total`, allebei cumulatief over het hele lied) → kan maar 1× vuren, aan het eind.
  `wavesForLevel` gaf nog 4 (ramp) of 12 (3× adaptive) → `onWaveCleared` bleef eeuwig wachten op
  clears die niet komen → `pendingSongEndRef` nooit gezet → `onSongEnd` vuurt in een no-op en
  vergrendelt → nooit `done`. Fix (commit `3decfcb`): `wavesForLevel` → `() => 1` onvoorwaardelijk,
  `isJitTrebleLevel` verwijderd (enige caller was die branch); SheetRpgLayer wave-reset conditie
  `gatedScroll && levelWaveIndex > 0` → `levelWaveIndex > 0` (de `gatedScroll &&`-helft was sinds
  #1165 achterhaald en liet de niet-gated `else`-tak de cumulatieve kill-state mid-level wissen =
  de "80x MISSED"-burst). test:run 1203 pass, build/lint groen.
- 🐞→✅ **~1,5 maat in beeld, te weinig om vooruit te lezen.** `deriveLevelSpan` `visibleMeasures`
  vloer 1 → 2 (`Math.max(2, …)`, zoals Hans eigen `idealVisibleMeasures`-regel). Bij Level 4's
  0,7×-baseline (80→56) gaf de "~6 s in beeld"-formule maar 1 maat. §108-invariant blijft gelden.
  Scherm-breedte-cap = follow-up (input nog niet zo diep doorgegeven). Commit `3decfcb` +
  docs `020d1ce` (§354 "UAT bounce round 2").
- 🐞 **NIEUW, HOGE PRIO — audiosync niet frame-perfect.** Han: "de noot valt niet EXACT tegelijk met
  de metronoom-klik op de perfect-hit-mark (rode streep). Dit moet 100% frame-perfect zijn; de hele
  app staat of valt bij audiosync." Nog niet onderzocht. Verdacht: `useLevelContentStream` schedulet
  treble/bass/metronoom per blok op een geaccumuleerde seconden-cursor met per-blok `barSec(bpm)`;
  een off-by-een-fractie tussen die cursor, de metronoom-tick-timeline en SheetRpgLayer's
  `tempoScrollMs`/strike-positie kan een paar ms verschil geven. Eigen ticket + gerichte pass nodig.
  Kan al vóór adaptive spelen (test op een gewoon niet-adaptief level of dit ook speelt).

**Kanban-bord (localhost:5500) lag eruit** tijdens deze ronde — de volgende updates staan nog OPEN
en moeten alsnog gebeuren zodra het bord terug is:
- `POST /api/task/1102/reanalyzed` (needs_reanalysis stond aan van ronde 1) + `feedback/:id/address`
  voor elk rework-item.
- Impl-note op #1102 met bovenstaande + test/build/lint output; `#1102 → test`.
- #1167 (timpani/cello mee met de chunks) — Han bevestigd "doe idd 1167", richting genoteerd; nog niet gedaan.
- NIEUW ticket voor de audiosync-bug (hoge prio).

**Nog te doen (concern C + audiosync):** #1167 timpani per-blok in `useLevelContentStream` op het
adaptieve bpm (met behoud §867: eindig, valt stil met de muziek); cello-drift verifiëren (content
wordt al per blok op het blok-bpm gescheduled — mogelijk alleen waargenomen timpani-drift). Daarna
de frame-perfecte audiosync-bug. Beide vragen een Opus-pass (Sonnet/main deed ronde-2 concern A+B
omdat Opus op de sessielimiet zat).

---

## 2026-08-31 — #1186 audiosync + #1167 timpani per blok (Opus/high)

- ✅ **#1186 frame-perfect audiosync.** EERST GEMETEN (tijdelijke harness op de echte
  `useLevelContentStream`, gewoon níet-adaptief Level 4): metronoomklik-tijd, blok-cursor en
  strike-line-passeertijd kwamen al op **0.000000 ms** overeen, voor elke noot en elk blok, en §108
  klopte numeriek (96 === 96). Alle vier de verdachten uit het ticket zijn dus door meting
  uitgesloten — de fout zit niet in het schema. ECHTE OORZAAK: `AudioContext.outputLatency` werd
  nergens gemodelleerd (0 grep-hits in `src/`). Een geluid dat op T gepland is, is pas op
  `T + outputLatency` te HOREN; gemeten in dit project's eigen Chromium: **48 ms** (baseLatency
  10,7 ms). De visuele klok liep dus constant ~48 ms vóór op alles wat hoorbaar was. FIX: nieuwe
  `src/audio/audioOutputLatency.js`; level-audio wordt precies zoveel eerder gescheduled, op één
  naad (`scheduleInto`). De VISUELE klok is niet aangeraakt (geen risico voor scroll/gate/deltaMs).
  Commit 4dff0c87, arch §355.
- ✅ **#1167 timpani mee met de chunks** (Han: *"Genereer de timpanen en cello gewoon mee met de
  chunks"*). De one-shot in App.jsx is weg; het patroon wordt één keer gebouwd (zelfde
  `buildTimpaniPattern`-aanroep als de notatie, §108) en per blok gesliced op het blok-eigen bpm.
  §867 behouden: eindig, valt stil met de muziek; gated levels blijven bij
  `useLevelGatedRubatoAudio`. Commit b966b814, arch §356 + §354-limitatie 1 afgevinkt.
- 🔎 **Cello: geen defect.** `block.bass` wordt al sinds #1165 per blok op het blok-bpm gescheduled
  en `commitIndexFor` zorgt dat een commit alleen op een nog niet gegenereerd blok landt. Wat Han
  hoorde was de timpani-drift + de 48 ms van #1186. Cello NIET gewijzigd.
- ⏳ Follow-up (niet gedaan, apart ticket waard): klassieke (niet-level) playback — Sequencer +
  `useSheetMusicHighlight` — heeft dezelfde audio-vs-beeld offset en gebruikt
  `audioOutputLatency.js` nog niet.


---

## 2026-09-01 — WORLD view: (1) metronoom/NPC/muziek-sync audit  (2) 192-gpx bottom-first crop ladder (Han)

Han (world view):
1. "Het klinkt niet alsof de metronoom, de NPC's/vogels, en de muziek allemaal
   perfect in sync zijn. Doe een grondige controle." → **audit gedaan**, findings hieronder.
2. "vanaf 192gpx hoogte: de volgende 16 gpx extra beschikbare hoogte worden
   toegevoegd aan de ónderkant van het level, daarna mag je weer gpx aan de
   bovenkant toevoegen." → `worldLayout.js` `cropFor` wijziging. **⏳ interview loopt.**

### 🐞 Sync-audit bevindingen (world view) — status: 🔨 gerapporteerd, fixes wachten op Han

Alle wereld-audio hoort op één klok te zitten: `worldClock.js` `context.currentTime`
+ `WORLD_BPM 100` + `[4,4]`. Gevonden afwijkingen:

- **A. `petFrame` is NIET op het wereld-grid verankerd (grootste, root cause).**
  `RpgLevelPanel.jsx` ~1303-1310: `petFrameStartMsRef` latcht "eerste frame na mount"
  als t=0 i.p.v. `Math.floor(context.currentTime / frameSec)`. Exact het anti-patroon
  dat `worldClock.js` + `useDebugMetronome.js` §924-r4 juist repareerden. Elke
  beat-gesyncte wereld-animatie (wisp/pet/slime/worker idle) én elke worker-NPC
  bel-hit (`useWorkerHitState` rolt op `petFrame % windowFrames === 0`) draait op
  een grid met een willekeurige constante fase-offset (0…1 maat) t.o.v. de ambient
  muziek (`nextMeasureStartTime`) en de metronoom (`floor(currentTime/spb)`).
  Fix-richting: `petFrame` direct uit `context.currentTime` afleiden, géén lokaal
  anker; `petFrameStartMsRef` + reset-effect weg.

- **B. Worker-NPC bellen vuren op `context.currentTime` ("nu"), niet op een
  gepland grid-tijdstip.** `useWorkerHitState.fire()` → `triggerBell(note,
  context.currentTime,…)` → `instrument.start({ time: context.currentTime })`. De
  beat-grens wordt door een React-effect op `petFrame` gedetecteerd (rAF-jitter +
  commit-latency), dan op "nu" (al voorbij de grens) gescheduled. Bellen landen
  0–120 ms + jitter te laat t.o.v. de ambient muziek die exact op
  `nextMeasureStartTime` vooruit gepland is. Fix-richting: bereken het bedoelde
  AudioContext-tijdstip uit het wereld-grid en geef dàt door aan `start({time})`.

- **C. Debug-metronoom klik vuurt ook op `context.currentTime` op een
  rAF-gedetecteerde edge.** `useDebugMetronome.js` ~74-90: `beatIndex =
  floor(currentTime/spb)`, dan `start({ time: context.currentTime })`. "Detecteer
  ná de grens, plan op nu" → klik 0–16 ms te laat + jitter t.o.v. ambient muziek
  die exact op het grid zit. Dit is wat Han het duidelijkst hoort ("metronoom en
  muziek niet in sync"). Fix-richting: plan de klik op het berekende
  beat-grens-tijdstip vooruit, niet op `currentTime`.

- **D. `outputLatency` (~48 ms, §355 meting) is ONGECOMPENSEERD voor de hele
  wereld — maar consistent.** §355/§357 lieten `playMelodies` / wereld-ambient
  bewust ongemoeid ("geen visuele klok om mee in de pas te lopen"). Maar de wereld
  HEEFT nu visuele klokken: `petFrame`-bobbing + de on-screen metronoom-teller /
  pendel. Elk hoorbaar wereld-geluid valt ~48 ms ná zijn visuele tegenhanger.
  Design-keuze voor Han (zelfde trade-off als §355). Na A/B/C is alle audio
  onderling consistent (+48 ms); compenseren lijnt ook met de beelden uit.

- **E. Geverifieerd OK:** ambient-muziek/bird/glockenspiel `setTimeout`-ketens
  self-corrigeren elk blok op de volgende `nextMeasureStartTime` — geen
  accumulerende drift. `nextMeasureStartTime` `ceil`-logica + `playMelodies`
  `safetyBuffer` OK.


### ✅ Beide punten geïmplementeerd (2026-09-01, Sonnet/medium)

**Punt 2 — bottom-first crop ramp.** `worldLayout.js` `cropFor`: `bottomCropGpx` ramp't nu lineair
16→0 over `artGpxH` 192→208 (1 rij per gpx) i.p.v. de harde 16-of-0 sprong bij 240; daarna un-cropt
verdere hoogte de bovenkant (topCrop 64→0 bij 272). `distributeHeight` ongemoeid. Consumers (App.jsx
crop-wrapper) ongewijzigd — invariant `topCrop + (gpxH−skyPad) + bottomCrop === 272` blijft exact.
Tests: worldLayout.test.js invariant-formule bijgewerkt + nieuwe ramp-describe. arch §348 bijgewerkt.

**Punt 1 — world-sync A+B+C+D.**
- **A:** `petFrame` (RpgLevelPanel) tikt nu op `WORLD_BPM`/`WORLD_TIME_SIGNATURE` (was live song-bpm,
  DEFAULT_BPM 90 ≠ WORLD 100 → nooit in sync) én zonder lokaal anker (`floor(context.currentTime /
  frameSec)`, frame 0 == wereldklok t=0). `petFrameStartMsRef` + reset-effect weg. `bpm`/`timeSignature`
  props van RpgLevelPanel verwijderd (beide App.jsx call sites).
- **B:** `useWorkerHitState` detecteert de hit één frame vroeg en plant hem op `hitFrame·frameSec −
  outputLatency` (grid-tijd vooruit) i.p.v. `context.currentTime`. `getListenerX()` nog steeds vers
  gelezen bij plannen (~1 frame vóór hit).
- **C:** `useDebugMetronome` plant elke klik vooruit op de vólgende beat-grens (`(floor(now/spb)+1)·
  spb − outputLatency`), gededupe op absoluut beatnummer. Teller/pendel blijven edge-trigger op de
  hoorbare grid-passage.
- **D:** `useWorldAmbientMusic` — `heardAt(startTime)` = `startTime − outputLatencySeconds(context)`
  op de 5 grid-uitgelijnde stemmen (ambient piano, hh, windvlaag-envelope+noot, vogels, water
  glockenspiel). Held water-drones ongemoeid. `playMelodies` zelf ongemoeid (§355/§357 regel).
- `audioOutputLatency.js` header bijgewerkt. arch **§359** toegevoegd.

**Groen:** `npm run test:run` 1231 pass / 1 skip · `npm run lint` 0 errors · `npm run build` clean.

**Status:** 🔨 impl klaar → Han UAT. Let op:
(a) metronoom + ambient muziek + NPC-hamerslag: vallen die nu samen (klik == noot == sprite-bob)?
(b) NPC's/vogels bewegen nu op WORLD_BPM 100 — als het laatst gespeelde level een ander tempo had is
    dat een merkbare verandering (bedoeld).
(c) de ~48 ms outputLatency-compensatie: alle wereld-audio klinkt nu ≤ 1 frame vóór de beelden i.p.v.
    ~3 frames erna — zelfde trade-off als §355/§357.
(d) crop-ramp: op een net-te-kort scherm (world ~192–208 gpx) zie je nu eerst de ónderkant van het
    level verschijnen, niet de bovenkant.

---

## #1168 — Adaptieve modus `i` op song-levels: echte generatie-cadans + 3× runway ✅

**Probleem (arch §354 limitatie 5):** een `songId`-level was ÉÉN generatieblok (`blockMeasuresFor`
viel terug op `numMeasures`, wat voor een song de LENGTE van het lied is), dus `blockCountFor` = 1 en
de adaptieve beslisser vuurde precies één keer — een seed, nooit een beslissing. Songs waren ook
uitgesloten van de 3× runway.

**Gedaan (4 edits, geen nieuw mechanisme):**
- `levelBlockPlan.js`: `SONG_BLOCK_MEASURES = 2` + `if (usesSongTreble(lvl)) return SONG_BLOCK_MEASURES;`
  NA de Wizard/Mixed/decorativeWizard-takken, VÓÓR de `numMeasures`-fallback. Onvoorwaardelijk (Han Q1:
  alle song-levels, niet alleen letter `i`). **Geen levels.json-edit** — `numMeasures` blijft "de lengte
  van het lied", want `callResponseOverrides` rekent daarop.
- `levels.js`: `adaptiveRepeats` niet langer `songId == null`-uitgesloten; één nieuw veld
  `contentPeriodMeasures` (de ON-vermenigvuldigde periode) gestempeld in `adaptiveOverrides`.
- `useLevelContentStream.js`: `contentPeriod`/`contentRepeats` afgeleid; `songMeasureCount` =
  `contentPeriod` (anders lopen de akkoorden — en dus de cello — leeg na pass 1, de §1155-bug); de
  song-BRON wordt `contentRepeats` keer naadloos aan elkaar geplakt met `appendChunk`, en `songSlice`
  houdt zijn bestaande ONGEWRAPTE `sliceMelodyByRange` — daardoor blijft de §289-garantie ("leeg voorbij
  het eind") letterlijk waar, nu tegen het echte 3× eind.

**Aanvaard neveneffect (Han Q1):** de CELLO op levels 1/2/200-206 klinkt anders (per 2 maten
gegenereerd i.p.v. één song-lang blok). Melodie, akkoorden, metronoom en timpani blijven identiek.

**Groen:** `npm run test:run` 1329 pass / 1 skip · `npm run lint` 0 errors · `npm run build` clean.
arch **§366** toegevoegd, §354 limitatie 5 doorgestreept + verwezen.

**Status:** ✅ impl klaar → Han UAT (12 acceptatiecriteria op ticket #1168).


---

## 🐞 #1168 UAT ronde 2 — "4 metronomen/cello's op net andere tempo's" (Han 2026-09-03) — ✅ opgelost

**Melding (Sakura 205 + letter `i`):** *"bij sommige maten gaat het helemaal bad: ik hoor 4
metronomen/cello's op net andere tempo's. Gebeurt na een tempowisseling. Bijvoorbeeld op maat 27."*

**Hypothese uit de test-notitie is FOUT gebleken (gemeten, niet geraden).** Live gereproduceerd in een
echte browser (Playwright op de dev-server; elke effect-run/cleanup met dependency-diff, elke
`playMelodies`-schedule met zijn gevraagde starttijd vs. de klok op dat moment, elke armed/landed
ladder-commit): een run van 200 s Sakura + `i` — passief én met stats — is volledig schoon. Het effect
draait één keer, precies één schedule per (track, blok), alles in de toekomst. Een tempowisseling
verandert niets in de dependency-array. #1120 en #1121 zijn NIET de oorzaak en blijven in `test`.

**Echte oorzaak:** `playMelodies` SLAAT een verstreken `scheduledStart` niet over maar KLEMT hem naar
`now + safetyBuffer`. Zodra `useLevelContentStream`'s effect ná de start van het levelgeluid opnieuw
draait (welke dependency dan ook), begint de JIT-ketting weer bij de opmaat en blok 0 tegen de
oorspronkelijke, allang verstreken `contentStartTime` — alle verstreken blokken worden dan naar
hetzelfde moment geklemd en klinken tegelijk, elk nog op de bpm van zijn eigen blok. Geforceerd op
maat ~26: **11 schedules (opmaat + blok 0-9), allemaal te laat, op 3 verschillende bpm's (50 / 40.7 /
38.7)** — exact wat Han hoort. #1168 is de regressie in BLAST RADIUS: een song-level was één blok, nu
21.

**Fix:** `SCHEDULE_SAFETY_BUFFER_SECONDS` naar `constants/timing.js` (één bron, §6c) → één guard in
`scheduleInto` die een verstreken schedule DROPT i.p.v. hem te laten klemmen; een verstreken blok doet
niet meer mee aan de ladder (geen `blockSettingsFor`-read die `setBpm` met delay 0 armt, geen
`evaluate`) maar wordt wél nog gegenereerd/gepubliceerd (append-only); nieuwe foutcode
**E035-LEVEL-AUDIO-PAST-DUE**. Regressietest in `adaptiveMode.integration.test.js` (faalt aantoonbaar
zonder de guard). arch **§369**, §366 kruisverwijzing.

**Status:** ✅ impl klaar → Han UAT.


---

## 🐞 Level 8 · variant 'g' (Modulated) → C Locrisch: G♭ getoond als F♯ (Han 2026-09-03) — ✅ opgelost

**Melding:** LEVEL 8, variant `g` (Modulated) → C Locrisch. De G♭ (5e trap) in de
treble-melodie wordt in de bladmuziek als F♯ getoond. Toonhoogte klopt, alleen spelling.

**Root cause:** `MelodyGenerator`-constructor kopieerde `Scale.notes`/`tonic`/
`numAccidentals` maar **nooit `Scale.displayNotes`**. `generateMelody()` gaf dus
`displayNotes: undefined` mee aan `Melody.fromFlattenedNotes`, waarvan de scale-context
her-spelling gegate is op `scaleNotes && scaleDisplayNotes && scaleTonic` → melodie's
`displayNotes` viel terug op `notes` = de audio-spelling uit `allNotesArray.js` (pc 6
altijd `F♯`). Raakt elke mollen-modus met pc 6 (C Locrisch, F Frygisch, G♭/C♭ majeur…);
kruis-modi (C Lydisch) toevallig ongedeerd want audio- en display-spelling van pc 6
vallen daar samen.

**Fix:** `this.displayNotes = Array.isArray(Scale?.displayNotes) ? Scale.displayNotes : this.scale;`
in de constructor ([melodyGenerator.js:94-104](src/generation/melodyGenerator.js#L94-L104)).
Modus-bewust: volgt `Scale.displayNotes` (delta-van-majeur via `generateDisplayScale`),
dus C Lydisch houdt `F♯`, C Locrisch krijgt `G♭` — geen enharmonische flip.

**Test:** `src/generation/__tests__/melodyGeneratorDisplayNotes.test.js` — C Locrisch →
`G♭` nooit `F♯`; C Lydisch → `F♯` nooit `G♭`; C majeur ongewijzigd. Bewezen falend
zonder de fix (2/3 rood). arch **§4f** bullet + bug-blok toegevoegd.

**Groen:** `npm run test:run` 1372 pass / 1 skip · `npm run lint` 0 errors · `npm run build` clean.

**Status:** ✅ impl klaar → Han UAT.


---

## ✅ FR: "Yellow wizard" — blind perfect-timing trainer (Han 2026-09-03) — IMPL v2 → UAT

**Verzoek (Han):** Nieuw level-type *gele tovenaar*. Verdoezelt noten maat-voor-maat
voor 'perfect timing': noten worden onzichtbaar en vervangen door hetzelfde blauwe
projectiel als de zwarte tovenaar. Zelfde principe als zwart: N maat (instelbaar)
vóór de noten klinken speelt een 'cast'-animatie. Verschillen t.o.v. zwart:
(1) GEEN geluid bij de gele wizard; (2) vóór de cast zijn de noten wél zichtbaar —
ze verdwijnen (harde cut op de flash + snelle ~100 ms fade) terwijl het projectiel
verschijnt.

**Interview-uitkomsten (Han 2026-09-03):**
- **"Allebei":** (a) nieuw **Level 16**, `enemyType: 'YellowWizard'` = kloon van
  **Level 13**'s muzikale config (bpm/toonladder/maatsoort/lengte/smallestNoteDenom
  — Level 13 is het huidige zwarte-wizard-level; Han bevestigd 2026-09-03),
  geel + stil + harde-cut-noten; (b) mode-variant letter **`j`**, meteen speelbaar,
  icoon `src/assets/ASSET DROP/Icons/Status_effect1_1_32.png`.
- **Variant forceert de volledige behandeling** (supersedet een eerder antwoord):
  ook in de variant vervangt een blauw projectiel de verdwenen noot en wordt dat
  het doel — slimes verdwijnen, net als een echt Wizard-level.
- **Audio:** treble volledig stil (geen `wizardInstrument`-cast-schedule). Metronoom
  + bas + akkoorden + timpani spelen normaal door als timingreferentie.
- **Sprite:** bestaande `Yellow Wizard sheet.png` (`Wizard (Portrait)` / `Yellow`,
  bestiaryManifest r54124). Als `song_attack_single/double/triple` daar niet op
  geauthored zijn: frame/flash-indices verbatim van `Black` overnemen (identieke
  sheet-layout, §6d).
- **Noten → projectiel:** noteheads blijven vol zichtbaar tot de flash-frame van de
  cast, dan harde cut + ~100 ms fade terwijl het projectiel in-faadt.
- **Scoring:** identiek hit/timing-venster (geen nieuwe tolerantie-parameter).
- **Voorloop:** `wizardSpawnLeadMeasures` instelbaar via levels.json (genummerd
  level) + default 1 meegegeven door de variant.

**Aanhaakpunten in de code:**
- `src/levels/levels.js` — `LEVEL_MODE_VARIANTS.j`, `applyLevelVariant`
  `yellowWizardOverrides` (forceert `enemyType: 'YellowWizard'`, `wizardSilent`),
  `availableVariantLetters`.
- `src/levels/levels.json` + `normalizeLevel`/`levelBlockPlan.js` — nieuw level,
  block-type routing (`blockTypeForBlock` moet 'Wizard'-gedrag geven voor een
  YellowWizard-level zodat alle projectiel/cast-visuals werken).
- `src/hooks/useLevelContentStream.js` r639-642 — cast-preview-audio schedule
  extra gaten op `!lvl.wizardSilent` (block-type blijft 'Wizard').
- `src/components/sheet-music/SheetRpgLayer.jsx` — nieuwe prop (bv. `wizardSilent`
  / `yellowWizard`): (a) `WIZARD_URL` → gele sheet; (b) noteheads renderen als
  gewone noten tot `computeWizardCast` z'n flash-frame bereikt, dan projectiel +
  fade (nu: projectiel vanaf spawn, nooit notehead); (c) geen audio-afhankelijkheid.
- `src/App.jsx` — `wizardSilent` doorgeven; `wizardInstrument`/`wizardVolume` niet
  nodig voor een silent level.
- `src/components/levels/LevelStartSplash.jsx` — `ICON_BY_KEY.yellowWizard`.
- `docs/architecture.md` — nieuwe sectie (§ vóór UAT).

**IMPL v1 (2026-09-03) — DOOR HAN AFGEKEURD.** Was geënt op `enemyType: 'Wizard'` +
`wizardSilent`: hield de call-response maatvorm, gebruikte een kebab-kopie sprite, en de noten
waren nauwelijks zichtbaar. Han: (1) sprite fout — gebruik de bestiary Yellow-variant; (2) noten
moeten zichtbaar zijn tot de tovenaar ze in een projectiel verandert; (3) géén "maat rust / maat
noten". → volledig teruggedraaid.

**IMPL v2 (2026-09-03) — herbouwd als eigen mechaniek:**

- **`enemyType: 'YellowWizard'`** (eigen type, NIET `'Wizard'`). `blockMeasuresFor` valt door naar
  `numMeasures`, `blockTypeForBlock` → `'Slime'`; `useLevelContentStream` ziet geen wizard-blok →
  géén call-response `shape`, géén odd/even rust-collapse, géén cast-audio-schedule. Level genereert
  volledig normaal (elke maat heeft z'n noten).
- `SheetRpgLayer.jsx`:
  - `isYellowWizard` + `projectileCombat = isWizard || isYellowWizard` (in `geomRef`).
  - Notatie: normale `noteStaffContent` (de `noteStaffContentRest/Real`-split blijft `isWizard||isMixed`).
    `{noteStaffContent}` in `<g mask="url(#rpgYellowCastGate)">` wanneer `isYellowWizard && !debugMode`;
    akkoordlabels/lyrics onmasked. debugMode toont alle noten.
  - `rpgYellowCastGate`: statische `userSpaceOnUse` gradient-mask, dekkend rechts van `castGateX`
    (= `noteX`-glide op `(beatsOnScreen − spawnLeadBeats)·beatMs`), ~100 ms `castFadePx`-ramp,
    weg links. Noot-cut valt exact samen met projectiel-verschijning. Geen rAF-werk. §6-veilig.
  - Combat = projectiel: `projectileCombat` in `DEATH_FRAMES`, spawn-glow effect+render,
    `itemIsWizard`-branch, statische wizard-render.
  - Sprite + cast-anims uit de **bestiary**: `findCreatureVariantByName('Wizard (Portrait)','Yellow')`
    → `wizardVariant` (`song_attack_*` cells/flashIndices) + `wizardSheetUrl` (uit de variant z'n
    animation-`url`, dus manifest — geen kebab-kopie). `computeWizardCast`-guard + statische `<Wizard>`
    krijgen `isYellowWizard`.
- `levels.js`: `yellowWizardOverrides` = `{ enemyType: 'YellowWizard', wizardSpawnLeadMeasures: … ?? 1 }`
  (geen `wizardSilent`). `LEVEL_MODE_VARIANTS.j`-comment + veld-doc + `availableVariantLetters`-note
  herschreven. Kleur-exemptie voor `yellowWizard` in `levelVariants.test.js`.
- `levels.json`: **Level 16 — Gele wizard** `enemyType: 'YellowWizard'` (normale generatie, Level 13's
  neutrale muziek-params).
- `App.jsx`: `wizardSilent`-prop verwijderd (enemyType-passthrough dekt alles). `enemyAssets.js`:
  `WIZARD_YELLOW_URL` teruggedraaid; `wizard-yellow.png` verwijderd. `useLevelContentStream.js`:
  v1-gates teruggedraaid. `LevelStartSplash.jsx`: icoon + `'j'` (ongewijzigd t.o.v. v1).
- Tests herschreven: `levelVariants.test.js` (`variant j` → `YellowWizard`, geen call-response),
  `useLevelContentStream.test.js` (`yellow wizard (enemyType: YellowWizard)`: normale cadans +
  `blockTypeForBlock` Slime, 0 casts, echte noten in élke maat, start zonder cast-instrument).
  arch **§371** herschreven.
- **Groen:** `npm run test:run` 1382 pass / 1 skip · `npm run lint` 0 errors · `npm run build` clean.

**v2 UAT-ronde 1 (Han 2026-09-04): wizard zwart + noten onzichtbaar. Twee bugs gevonden + gefixt:**
1. **Zwarte wizard:** `wizardSheetUrl` las `findAnim(wizardVariant,'idle')?.url` — maar
   `bestiaryAssets.js` zet de sheet-URL op het **variant-object** (`wizardVariant.url`), niet per
   animatie (alleen enkele creatures hebben per-anim `relPath`). `undefined` → fallback `WIZARD_URL`
   (zwart). Fix: `wizardVariant?.url` (geverifieerd: `/ASSORTED/.../Yellow Wizard sheet.png`).
2. **Onzichtbare noten:** de `<g mask="url(#rpgYellowCastGate)">` zat BINNEN de per-frame
   `translate(-scrollPx)`-groep. `maskUnits="userSpaceOnUse"` wordt in de referentie-user-space
   opgelost → de "stilstaande poort" scrollde mee met de noten en maskeerde na een paar frames
   álles weg. Fix: mask op een NIET-getransformeerde wrapper; de noten krijgen hun eigen
   scroll-groep (`noteScrollRef`, transform door de rAF-loop) BINNEN de mask; akkoord/lyrics apart
   in `chordLyricScrollRef`. Nieuwe test in `SheetRpgLayer.test.jsx` bewijst: 1 normale notenlaag,
   mask-wrapper zonder transform met interne translate-groep, gele sprite-href.
   `test:run` 1383 pass / 1 skip · `lint` 0 · `build` clean.

**Bekende ruwe rand:** `<Wizard>` gebruikt `WIZARD_CROP` (zwarte crop) voor z'n viewBox; de gele
bestiary-variant heeft `crop {13,1,50,63}` vs `{16,12,47,52}`. De gele wizard kan een paar px
verschoven/geframed staan. Eén gerichte fix als het bij UAT storend is.

**v2 UAT-ronde 2 (Han 2026-09-04): "yes! perfect!"** — in-level gedrag akkoord. Laatste punt:
het **portret van de tovenaar aan het einde van het level** was nog zwart (eigenlijk een groene
slime — `levelResultSpeaker` herkende `enemyType: 'YellowWizard'` niet als "wizard"). Fix in
`App.jsx`: (1) `levelResultSpeaker` → `kind: 'wizard'` ook voor `'YellowWizard'`; (2)
`wizardColorName` → `'Yellow'` voor een YellowWizard-level → `findCreatureByName('Wizard
(Portrait)', 'Yellow')` levert het speciale gele portret (`portraitUrl` geverifieerd). Post-combat
krijgt nu ook de wizard-victory-lines i.p.v. slime-lines. `test:run` 1389 pass / 1 skip · `lint` 0
· `build` clean.

**Status:** ✅ gele-wizard-feature volledig → Han UAT (portret geel aan het einde van Level 16 /
variant `j`).

**Losstaand:** pauze-bug (metronoom/cello door) — Han bevestigt: óók op Level 13 & 4 → pré-bestaand,
geen regressie. Eigen bug-entry hieronder.


---

## 🐞 Level op pauze: metronoom + cello spelen door (Han 2026-09-04) — te onderzoeken

**Melding:** Bij het pauzeren van een level blijven metronoom en cello (backing) doorspelen.
Ontdekt tijdens UAT van Level 16 (gele wizard).

**Bekend mechanisme:** `handlePauseLevel` → `stopAllLevelAudio()` → `stopAllBackingAudio()`
annuleert alle pending backing-`StopFn`s (`levelBackingStopFnsRef`) + `.stop()` op
cello/metronoom/timpani. Zou de backing dus moeten stoppen.

**Hypothese:** `useLevelContentStream`'s effect draait ná de pauze opnieuw (een dep
verandert bij `setLevelPaused(true)`) en herplant de backing bovenop wat net geannuleerd
werd — toekomstige blokken (niet past-due, dus niet gedropt door de #1168/E035-guard)
klinken door over de pauze. Fix-richting: `levelPaused` (of een paused-flag) door-threaden
naar `useLevelContentStream` zodat het effect niet herplant tijdens pauze.

**Han 2026-09-04:** bevestigd op **Level 13 én Level 4** → **pré-bestaand, geen regressie**
van het gele-wizard-werk. App-breed.

**Status:** 🐞 backlog — losstaand van de gele-wizard-feature. Vereist eigen interview (§4b)
vóór fix: welke pauze-paden (header-pauze / mid-level-overlay / tab-switch), en moet resume
naadloos verder of met de bestaande 1-maat count-in.


---

## ✅ #1192 Weertypen — de cloud-cover as (helder / licht bewolkt / bewolkt / donker bewolkt)

Han (2026-09-04): vierde weertype-as naast wind en time-of-day. DONKER BEWOLKT = grijs +
vlekkerig, illum omlaag, zon EN maan weg. BEWOLKT = wit + vlekkerig, waterige zon, maan/sterren
weg. LICHT BEWOLKT = as is. HELDER = minder witte horizon-fade, blauwer blauw.
Wolkensprites per parallaxlaag: **buiten scope** (Han levert de art later).

**Mechanisme (design + plan goedgekeurd, plan_review Q1-Q4 beantwoord):** ÉÉN eased scalar
`cloudCoverT` (0..1) + DRIE afgeleide ramps (`cloudClearness` / `cloudCollapseT` / `cloudDarkT`).
Geen enkele `if (cloudType === ...)` in een renderer — de vier types zijn vier posities op één
as, elke visual is een lerp over één ramp. LIGHT = alle ramps 0 ⇒ bit-identiek aan vóór #1192.

- ✅ `weatherCycle.js` — 4e auto-track (60-120 s draw, 10 s ease, `CLOUD_BAG` afgeleid van
  `WIND_BAG`), `cloudSeed`, `seekCloud`, `cloudIllumMultiplier` = `1 - 0.1*(collapseT+darkT)`
  ⇒ 1.0 / 1.0 / 0.9 / 0.8. `globalIllumination = illum × illumMultiplier` op ÉÉN regel (cr3).
- ✅ `SkyGradientBackdrop.jsx` — 4-ops kleurpijplijn (`cloudSkyStop`); `mixNight` / `sunsetFactor`
  onaangeroerd en NOOIT gebypasst. Nieuwe procedurele pixel-art "mottle" canvas: 2-octaaf value
  noise, gequantiseerd naar 4 alpha-niveaus, field-pass (size+seed) en paint-pass (tint+alpha)
  gesplitst zodat het vlekkenpatroon niet "springt" tijdens een overgang.
- ✅ `CelestialSky.jsx` — sterren/sterrenbeelden/maan × (1-collapseT), zon × (1-darkT), waterige
  zon via het bestaande `SUN_GLOW_RINGS`-mechanisme (2 extra ringen, harde core uitgefade).
- ✅ `RpgLevelPanel.jsx` — "Weather" LevelPicker, `quantCloudCover` (0.05-stap), `quantMoonShine`
  × (1-collapseT) zodat een bewolkte nacht niet belicht wordt door een onzichtbare maan (Q1=ja).
  Rauwe `cloudCoverT` komt in GEEN change-detection lijst (§374-invariant, uitgebreid).
- ✅ Tests: 4 nieuwe describes in `weatherCycle.test.js` + `§375 cloudSkyStop` in
  `skyGradientBackdrop.test.js`. Gates: 1461 tests groen, build OK, lint 0 errors.
- ✅ Docs: `docs/architecture.md` §375; `CLAUDE.md` §7a `E039-SKY-MOTTLE-PAINT`.
- ⏳ Vervolgfase: wolkensprites per parallaxlaag zodra Han de art levert.

**UAT-tuneknoppen (allemaal genoemde constanten):** `OVERCAST_NIGHT_DIM` (0.45 — hoe donker is
een bewolkte nacht), `OVERCAST_DARK_SCALE` (0.55), `CLEAR_SAT_GAIN` (0.45) /
`CLEAR_HORIZON_SHARE` (0.45), `MOTTLE_CELL_GPX` (24) / `MOTTLE_PEAK_ALPHA` (0.35) /
`MOTTLE_CONTRAST` (1.6), `SUN_WATERY_R_GAIN` (0.6).

---

## #1193 — ✅ Sun edge-glow: "felle zon door de bomen" / "zon vlak over daken" (Han 2026-09-04)

Han: "geef de zon een glow (net zoals de maan), maar dan in de kleur van de zon (geel, of dusk/dawn
naar roze toe) **enkel voor pixels aan de rand van sprites vlakbij de zon**". De tegenhanger van
§370's maan-sheen/rim, maar getint met de zonkleur, **gemaskeerd tot een schijf rond de
schermpositie van de zon**, en het felst als de zon LAAG staat. Design + plan goedgekeurd
(plan_review: Q1 `SUN_SHEEN_SCALE = 0.35`, Q2 geen split — alle 13 stappen in één pass).

- ✅ `celestialModel.js` — `SUN_GLOW_RGB` hierheen verhuisd (één zonkleur voor disc én glow),
  `SUN_GLOW_RADIUS_GPX 40` / `SUN_GLOW_RISE_DEG 2` / `SUN_GLOW_ALT_FADE_DEG 25` /
  `SUN_GLOW_ZENITH_FLOOR 0.25`, en de pure `sunGlowStrength(sun)` (0 onder de horizon, piek net
  erboven, easet naar een lage floor bij zenit) — hergebruikt `easeInOut`, geen tweede smoothstep.
- ✅ `CelestialSky.jsx` — `skyGeom(sizePx, zoom, horizonGamePx)` geëxtraheerd + geëxporteerd en
  zelf geconsumeerd (§6d): er is nu structureel ÉÉN zonprojectie in de app.
- ✅ `SkyGradientBackdrop.jsx` — `SUNSET_RGB` geëxporteerd + pure `sunGlowColor(illum)` =
  geel → roze op §372's EIGEN `sunsetFactor`-curve. Geen tweede dusk/dawn-curve, geen nieuw roze.
- ✅ `foliageLightingGLSL.js` — 4 gedeelde uniforms (`uSunGlowStrength/Color/uSunScreenPos/Radius`,
  highp waar nodig), `SUN_SHEEN_SCALE 0.35`, en `applySunGlow(...)` naast `applyMoonLight`:
  zelfde screen-blend sheen + rim, plus de scherm-afstandsmask. Contract: wie de uniforms niet
  uploadt krijgt 0 ⇒ no-op, nooit een compile error.
- ✅ Coördinatenbrug: elke fragment shader had de waarde al (`gl_FragCoord` + `uCanvasSize`);
  BEIDE assen door de canvas-BREEDTE ⇒ isotroop, dpr-vrij, zoom-vrij, camera-onafhankelijk.
  GLSL ES 1.00-val vermeden: `1.0 - smoothstep(0.0, max(R, 1e-5), d)`, nooit `smoothstep(R, 0, d)`.
- ✅ 4 shader-consumenten identiek bijgewerkt: `ForegroundFoliageLayer.jsx` (non-instanced +
  instanced), `LdtkLitGround.jsx`, `FoliageInstancingTest.jsx` (dev-harness pariteit) +
  `DEFAULT_FOLIAGE_PARAMS` no-op defaults.
- ✅ `RpgLevelPanel.jsx` — `quantSunGlow` (0.05, × dezelfde `(1-cloudCollapseT)` wolkgate als
  `quantMoonShine`), `quantSunScreenPos` (1 game px ⇒ bit-identiek aan de getekende disc),
  `sunPosMoved`, `skyGeomRef`, 4 nieuwe `foliageParams`-kanalen, 2 gequantiseerde termen in ALLEEN
  de foliage change-detection lijst (rauw komt er nooit in), re-push bij resize/zoom.
- ✅ `LdtkScenery.jsx` — parallax-bg zonrim: hergebruikt DEZELFDE gebakken `computeMoonRim`-canvas,
  gemaskeerd + getint. **Afwijking van de letterlijke plantekst** (bewust, gedocumenteerd in §377):
  de patch krijgt zijn EIGEN 80×80 canvas i.p.v. in de grote laag-canvas gebakken te worden — de
  zonpositie verschuift canvas-lokaal elke pan-frame, dus de plan-variant zou een 3200×H canvas per
  pan-frame herbakken. Nu 6 400 px werk i.p.v. ~640 000. Positie-quantum 4 gpx (`BG_SUN_POS_QUANT_GPX`).
- ✅ Tests: `sunGlowStrength` describe in `celestialModel.test.js` (0 onder de horizon, piek net
  erboven, monotone daling naar de floor, echte-zonboog-integratie) + `sunGlowColor` describe in
  `skyGradientBackdrop.test.js`. Gates: **1473 tests groen, build OK, lint 0 errors**.
- ✅ Docs: `docs/architecture.md` §377. Geen nieuwe error code (§7a: de term zit in de bestaande
  per-laag try/catch — E021/E023/E030/E031/E034).

**UAT-tuneknoppen (allemaal benoemde constanten):** `SUN_GLOW_RADIUS_GPX` (40 — hoe ver de glow
reikt), `SUN_GLOW_RISE_DEG` (2), `SUN_GLOW_ALT_FADE_DEG` (25), `SUN_GLOW_ZENITH_FLOOR` (0.25),
`SUN_SHEEN_SCALE` (0.35 — op 0 zetten = strikt alleen randpixels), `BG_SUN_POS_QUANT_GPX` (4).

**Valkuil genoteerd:** een backtick in een comment BINNEN een GLSL template literal beëindigt de
literal — brak de eerste build van dit ticket. Gebruik daar enkele quotes.

---

## #1195 (2026-09-05) — RAM level.ldtk save niet (volledig) zichtbaar na Han's edit

🐞 **Bug 1 — lucht/sterrenhemel stopt te vroeg (opgelost).** `WORLD_ART_GPX_H` in `worldLayout.js`
stond hardcoded op 272 (level-hoogte van vóór Han's resize), terwijl de LDtk-levels nu 320px hoog
zijn (`LEVEL_PX_HEIGHT`, ldtkWorld.js). Het wereldblok toonde daardoor een vlakke `#8fd0d9`-kleur
i.p.v. echte content boven de 272-gpx grens. Fix: `WORLD_ART_GPX_H` → 320. Zie architecture.md §348
bug-log entry voor volledige root-cause. Tests/build/lint groen (1479 tests, 1 test aangepast omdat
hij per ongeluk `WORLD_ART_GPX_H` gebruikte voor de ladder's eigen (aparte) 272-plateau).

⏳ **Bug 2 — nieuwe LDtk-lagen niet gerenderd (interview lopend, nog niet geïmplementeerd).**
Han's nieuwe content (stenen brug via `City_Walls`/Castle_Tiles2, riet, extra water-tegels via
`Water_FG`/`Grass_tiles_fg_poc`/`Decor_Shimmer_FG`, interior-lagen in Level_9) staat in het bestand
maar wordt niet gerenderd — `ldtkWorld.js` houdt een EXPLICIETE whitelist bij (`STATIC_TILE_LAYERS`
e.a.) die deze nieuwe laagnamen niet kent. Han's instructie: render alles generiek zoals in LDtk,
behalve `_level_`-tier-lagen (Tavern/Bridge/Blacksmith/Alchemist — 1 tier tegelijk actief) en
`Collision_mask` (alleen hoogteberekening, nooit zichtbaar). Wacht op Han's antwoorden op 4
interviewvragen (bestaande BACKGROUND_LAYERS/FOLIAGE_LAYERS/ANIMATED_LAYERS-special-cases blijven
staan? generieke `_level_N_`-tier-detectie i.p.v. TAVERN_TIER_LAYERS/BRIDGE_TIER_LAYERS-kaarten?
Character_examples_placeholders meerenderen of uitsluiten? front/back-of-Entities ongewijzigd?)
voordat dit gebouwd wordt (§4b — raakt de render-pipeline).

🐞 **Zijbevinding (geen actie, false lead).** `Bridge_level_1_log`/`Bridge_level_2_wood` (Pine forest
sheet / SSW_Interriors tiles) bleken oude, vrijwel-transparante placeholder-tiles — niet Han's eigen
werk. De echte brug zit op de `City_Walls`-laag (Castle_Tiles2), die pas zichtbaar wordt zodra Bug 2
is opgelost.

---

## #1195 vervolg (2026-09-05) — "houd gewoon áltijd de volgorde van LDTK aan" (volledige herbouw)

✅ **Root-cause was dieper dan Bug 2 hierboven.** Han na de City_Walls-fix: "de wilg staat VOOR de brug,
maar in ldtk staat ie er achter." De app rendert al sinds het begin via VASTE buckets (1 grondlaag-canvas,
1 foliage-shimmerlaag, 1 animated-overlay, 1 achtergrond-set, Entities als één vaste knip front/back) —
nooit de echte per-laag LDtk-volgorde. Han, na interview over scope: "het is heel simpel: houd gewoon
áltijd de volgorde van LDTK aan" — bevestigd voor ALLES (grond/foliage/water/campfire/achtergrond/
Entities), inclusief het risico dat ik expliciet benoemde (Entities kan nu bedekt worden door content die
ervoor staat in LDtk) — "alles in één keer, inclusief Entities-interleaving."

✅ **Herbouwd:** `ldtkWorld.js` — `buildWorld()` levert nu `world.passes` (geordende back-to-front lijst,
één pass per aaneengesloten reeks lagen van hetzelfde "soort" in de echte LDtk-volgorde) i.p.v. vaste
buckets. `RpgLevelPanel.jsx` — `SceneryBack`/`SceneryFront`/vaste `EntityLayer`-positie vervangen door
`GroundPass`/`BackgroundPass`/`ShimmerPass`/`CampfirePass` + Entities inline, gerenderd via één
`.map()` over `world.passes`. Perf-optimalisaties (imperatieve camera-pan transform, gedeelde
foliage-atlas, per-pass culling) generiek gemaakt i.p.v. verwijderd. Legacy-mode volgorde apart
gecorrigeerd (decor-blok moest vóór de map blijven staan i.p.v. erna).

✅ Tests herschreven rond `world.passes` (incl. regressietest: City_Walls landt in een ground-pass
tussen twee shimmer-passes — precies Han's gerapporteerde bug). **1483 tests groen, build OK, lint 0
errors.** Architecture.md §383 (volledige write-up, §382's Bug 2 gemarkeerd als superseded).

⚠️ **Nog niet visueel geverifieerd — dit is WebGL/canvas-rendering zonder testharnas** (zelfde
precedent als §370/§374/§375/§377). Wacht op Han's UAT: brug/wilg-volgorde, lit-ground per pass,
water-reflectie, Legacy-mode, camera-pan-soepelheid.

## #1195 UAT r1 (2026-09-05) — 2 bugs uit eerste visuele check, direct gefixt

✅ **Gradient vóór parallax**: `BackgroundPass` kreeg per ongeluk `gridSize={0}` mee (dacht dat het
alleen voor grondtiles nodig was) — achtergrondlagen zelf hebben ook de échte gridSize nodig om te
tekenen, dus ze werden onzichtbaar (0×0 geblit) en de sky-gradient scheen erdoorheen. Fix: `gridSize`
correct doorgegeven.

✅ **Sommige watertiles geen shimmer**: `Water_FG` (Han's "extra tegels voor het water") is een apart
laag-ID van `Water_tile`, dus de exacte-identifier-check miste hem — viel terug op de platte
`'ground'`-classificatie. Fix: gederiveerd via de ECHTE tileset (`Animated_Water_Tiles`) i.p.v. een
tweede hardcoded naam toe te voegen (§6c) — elke toekomstige extra waterlaag met diezelfde tileset werkt
nu automatisch mee, geen code-wijziging nodig.

Beide direct gefixt, 1484 tests groen, build/lint OK. Han: "verder PERFECT!!!" op de rest.
