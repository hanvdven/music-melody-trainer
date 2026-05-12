# Backlog & Feature Requests

---

## ⚠ WORK IN PROGRESS (cloud agents, please read)

[Claude 2026-04-30]: Phases 8-10 of the cleanup refactor are currently in progress. The following items are RESERVED for the active local refactor session — cloud-scheduled agents should NOT pick them up:

- App.jsx slim-down (specifically: setTonic / setSelectedMode / applyHarmonyAtDifficulty extraction)
- Sequencer.js decomposition (SongBuilder, AnimationScheduler extractions)
- Test infrastructure (new tests for hooks, noteUtils)

If a backlog item below relates to these areas, leave it alone and pick something else. See CLAUDE.md "Currently In Progress" section for the full file off-limits list. This notice will be removed once the work is complete.

---

## BACKLOG REGELS (voor de AI-agent)

> Deze regels gaan voor alles. Lees ze bij elke sessie opnieuw.

1. **Pas de originele tekst nooit aan.** Verzoeken, vragen en bugs van de gebruiker blijven ongewijzigd staan. Alleen de gebruiker mag tekst verwijderen of herschrijven.
2. **Voeg implementatienotities toe ónder de oorspronkelijke tekst**, nooit ertussen of ervoor. Gebruik altijd het formaat: `[Claude YYYY-MM-DD HH:MM]: <notitie>`
3. **Geef ✅ alleen als de oorspronkelijke intentie volledig gerealiseerd is.** Zet het teken voor de originele tekst, maar laat de tekst zelf ongewijzigd.
4. **Herstructureer af en toe per thema, maar verwijder nooit tekst.** Verplaatsen is toegestaan; verwijderen niet.
5. **Geef elke categorie een sectie (`##`), elke feature een heading (`###`).** Bugs horen bij de feature waarop ze betrekking hebben.
6. Zet een ❓ wanneer je een vraag aan mij (Han) hebt.
7. Items die in NIEUWE FEATURE REQUESTS staan verplaats je naar de juiste categorie.
8. Voeg altijd relevante debugging elementen toe, die getoggled kunnen worden met de debugging toggler in de header.

---

## NIEUWE FEATURE REQUESTS

Deel deze features in bij de juiste categorie.

### Bestaande liedjes
bestaande liedjes (happy birthday, ...)

### Profiel-icoon & submenu (navigatie)
vervang profile settings icoon met Lucide: user.
Submenu: kennisbank (graduation-cap) en settings (waar nu thema etc onder staan).

### Afgesloten items: slot-icoon vervangen + klikgedrag
vervang het slotje (emoji) bij afgesloten componenten voor Lucide graduation-cap. Wanneer je op een gesloten item klikt: krijg je opties:
1) ik wil les (open de les indien deze bestaat - voorlopig altijd greyed out) -> open de relevante les
2) ik wil dit oefenen -> selecteer dit item in de sequencer
3) ik ken dit -> callout (wil je [item] permanent toevoegen aan je kennisbank zonder de les te volgen? ja/nee) -> ja: voeg permanent toe aan kennisbank

✅ bug: op instellingen klikken in settings overlay, sluit het overlaymenu. Los op, en zorg voor een fatsoenlijke klikzone. Visualiseer uiteraard in debug mode.
[Claude 2026-05-07]: Root cause: clicks inside SettingsOverlay bubbled up to `handleSheetMusicClick` which closes the overlay when `showSettings=true`. Fixed by adding `onClick={(e) => e.stopPropagation()}` on the root `<g className="settings-overlay">` plus a transparent background `<rect>` covering the full overlay bounding area so clicks on empty space also stop propagation. Files: `src/components/sheet-music/SettingsOverlay.jsx`.

alle odd repeats / even repeats settings:
volume, spelen / pauzeren;
aantal maten
aantal herhalingen.
[Claude 2026-05-10]: ⬇ LAGE PRIORITEIT — markering op verzoek van Han. Feature is nog niet geïmplementeerd; oppakken zodra hogere-prioriteit items klaar zijn.

✅ Verwijder 'randomize now' uit de settings.
[Claude 2026-05-10 12:00]: Bevestigd door Han — al geïmplementeerd in een vorige sessie.

bug: ik hoor soms precies extra drumsamples die niet in de bladmuziek staan. Ze zijn consistent wanneer ik herhaal; dus niet willekeurig. Lijkt vaak te gebeuren vlak na woodblocks.
VERMOEDEN: misschien zijn er 'akkoorden' die niet goed worden genoteerd? Ik zie nu een maat waarin een kwartnoot 'ontbreekt' in de bladmuziek; daar spelen wel degelijk verschillende drumnoten.  
Ah! nadere inspectie: ik hoor een basnoot die niet genoteerd is!

[Claude 2026-05-06]: Gedeeltelijk opgelost. Twee inconsistenties gevonden en gefixed in `convertRankedArrayToMelody.js`:
1. `percussionIDs` miste `'wm'` (mid woodblock) en `'cb'` (cowbell) — backbeat/swing konden deze noten wél genereren (via PERC_POOLS.all in generateBackbeat.js), maar 'uniform' mode niet. Nu gelijk getrokken.
2. `claves` notepool miste `'wm'` — nu `['wh', 'wm', 'wl']`.
De diepere oorzaak ("basnoot niet genoteerd", "kwartnoot ontbreekt in maat") is nog niet gevonden via code-inspectie. Alle rendering-maps (`percussionNoteHeads`, `noteYMap`) zijn compleet voor alle bekende noot-IDs. ❓ Kan je een reproduceerbaar geval maken? Bijv: welke instellingen (time signature, randomization rule, notePool), welke maat, en kun je de specifieke noten benoemen die je hoort vs. ziet? Dan kan ik gerichter debuggen. Een debug-screenshot of console-log van `melody.notes` zou ook helpen.

✅ Bug: in drumnotatie worden soms dubbele beams gebruikt voor achtsten, zouden enkele beams moeten zijn.
[Claude 2026-05-06]: Oorzaak: standaard percussie gebruikt `smallestNoteDenom=16` (zestienden) als raster. Elke noot krijgt dan duration=3 ticks. Bij het groeperen (beaming) zijn dat technisch gezien zestienden → 2 balken. Oplossing: standaard `smallestNoteDenom` voor percussie verlaagd van 16 naar 8 in `InstrumentSettings.defaultPercussionInstrumentSettings()`. Het percussieraster is nu gebaseerd op achtststen (duration=6 ticks), wat de standaard drumnotatie is (1 balk bij beaming). Bestaande instellingen van de gebruiker zijn niet gewijzigd.

✅ Overdadig gebruik van verbindingsboogjes; ik zie vaak verbindingsboogjes waar een dot of dubbel dot een perfecte optie is. Ik zie nu een harde cut-off bij kwartnoten; evalueer de regels en doe een tegenvoorstel, voor iets minder verbindingsboogjes, zonder leesbaarheid op te offeren.
De filosofie is dat noten worden gesplitst zodat op te tel steeds een noot staat. Logischerwijs gaan noten nooit over de maatgrens, en liever niet over de beats (als ik beat, back beat), en liever gegroepeerd per kwartnoot; maar in sommige gevallen is het overbodig om verbindingsboogjes te trekken. Gebruik je kennis van muziektheorie om iets gebalanceerder te noteren
[Claude 2026-05-06]: Opgelost in `processMelodyAndCalculateSlots.js` stap 3. Oorzaak: stap 3 stond een noot alleen heel als `duur ≤ kwartnoot` OF `eindpositie % kwartnoot === 0`. Dotted kwartnoot (18 ticks) op slag 1 in 4/4 voldeed aan geen van beide → werd gesplitst in ♩ + ♪ met verbindingsboogje.
Nieuwe voorwaarde: noot mag ook heel blijven als hij binnen de *secundaire tel-span* valt (halve maat voor enkelvoudig tweedelig/vierdelig maatsoort, hele maat voor driedelig/samengesteld). Resultaat:
- ♩. op slag 1 of 3 in 4/4 → heel (was: ♩ ♪ met boogje)
- ♩. op slag 2 in 4/4 → gesplitst (overschrijdt halvemaat-grens, slag 3 moet zichtbaar zijn)
- ♩. op elke slag in 3/4 → heel
- Dubbel-gestippelde noten (bijv. 𝅗𝅥. op slag 1 in 4/4) → gesplitst (gaan over de halve maat)
Maatgrens- en slaggrens-splits uit stap 1 en 2 zijn ongewijzigd.
---

## BLADMUZIEK / NOTATIE

### Vrij tempo / Tempo ad libitum / Tempo rubato

add symbols and play mode for free time aka tempo ad libitum aka tempo rubato

> ⚠ Neem alvorens dit te implementeren een interview af bij Han.
[Claude 2026-05-10]: ⬇ LAGE PRIORITEIT — op verzoek van Han. Vereist uitgebreidere toelichting voor implementatie.

### Common time-symbool: Maestro SHIFT+T ipv 4/4

gebruik ipv de 4/4 dit Maestro-symbool: SHIFT+T | ~ | Turn, grupetto

> ⚠ Neem alvorens dit te implementeren een interview af bij Han.

### Sleutel & transponerend instrument

✅ clef in sheet music: cycle bij korte klik (of 2×), open lijst bij lange klik of 3× klikken. Noten en akkoorden klikbaar met visuele flash-feedback.

### Maatsoort & ritme

✅ bug: handmatige invoer van maatsoort (numeriek typen in het veld) had geen effect — handleTimeSignatureChange in App.jsx miste de 'setTop' case. Fix: parseInt(value) + clamp [1,32] toegevoegd. Aanname: alleen de teller (numerator) is via tekst invoerbaar; de noemer is via klik-cycle.

✅ bug: aantal maten veranderen tijdens playback wordt niet goed opgepakt door sequencer. Fix: useEffect op numMeasures in App.jsx roept randomizeAll aan wanneer isPlayingContinuously === true.
--> nog steeds niet goed: er komt een extra maat in de bladmuziek; maar bladmuziek zou enkel naar de melodie moeten kijken. numMeasures is een variabele die gebruikt wordt door de melody generator, niet door de bladmuziek. Los op!

[Claude 2026-04-10]: Opgelost — pagination-effect in SheetMusic.jsx gebruikte numMeasures (generator-instelling) in calculateAllOffsets en calculateMusicalBlocks. Vervangen door melodyMeasureCount (afgeleid uit feitelijke nootinhoud van de melodie). Dependency array bijgewerkt van numMeasures → melodyMeasureCount.

✅ increasing nummeasures during playback messes up the sheet music visualisation. -> nog altijd niet opgelost.

[Claude 2026-05-04]: Opgelost — de `useEffect` in App.jsx die bij numMeasures-wijziging tijdens playback `randomizeAll` aanriep, deed precies het verkeerde: die updatet React melody-state onmiddellijk, waardoor SheetMusic de nieuwe (langere) melodie toont terwijl de Sequencer nog de oude (kortere) melodie speelt → playhead loopt buiten beeld. De Sequencer leest `numMeasuresRef.current` al bij elke serie-grens en genereert dan vanzelf een nieuwe melodie op de juiste lengte. De `useEffect` was dus overbodig én schadelijk. Verwijderd uit App.jsx.

✅ bug: schermgrootte aanpassen tijdens paginatiemode zodat aantal maten geplitst wordt, is beetje lelijk

[Claude 2026-04-10]: Opgelost — debounce (350 ms) toegevoegd aan onMusicalBlocksChange in SheetMusic.jsx. Tijdens playback wacht de paginatie-herberekening 350 ms na de laatste resize-event; buiten playback update onmiddellijk. blockChangeTimerRef houdt de timer bij en wordt gecleard bij elke nieuwe render.

onderzoek: 5/4 (en andere onregelmatige maatsoorten) bas/treble-notatie ritmisch onjuist.
  Symptoom: baslijn in 5/4 toont overwegend 16de-noten met overdreven veel verbindingsbogen;
  eenvoudigere notenwaarden (8ste, gestippelde 8ste, kwartnoot) hadden volstaan.
  Vermoedelijke oorzaak: rhythmicDNA-generator houdt voor onregelmatige maatsoorten geen rekening
  met beat-structuur (bijv. 2+3 of 3+2 voor 5/4), waardoor noten te klein worden gekozen
  en de notator ze niet goed kan consolideren/vereenvoudigen.
  Bestanden om te onderzoeken: src/generation/melodyGenerator.js,
  src/utils/melodySlice.js, src/components/sheet-music/renderMelodyNotes.jsx.

[Claude 2026-04-09]: ONDERZOEK VOLTOOID. Primaire oorzaak was inderdaad rhythmicPriorities.js: de beat-groep downbeats (bijv. slot 6 = beat 4 in 5/4 bij 8th-resolutie) werden NIET hoger gerankt dan nearDivisors-artefacten. Dat is opgelost met decomposeNumeratorToBeatGroups in een eerdere sessie. Na de fix: met standaard settings (notesPerMeasure=2) geeft 5/4 dotted-half + half; met 4 noten: half+quarter+quarter+quarter — allemaal correcte notenwaarden.
RESTERENDE NOTATIE-KWESTIE (laag prioriteit): Noten die de 3|2-grensslijn overschrijden (bijv. halve noot van beat 3 t/m 5) worden NIET gesplitst op de groepsgrens (tick 36). Correct zou zijn: quarter(beat3) + quarter(beat4) gebonden. processMelodyAndCalculateSlots kent de beat-groepsstructuur niet. Zal de notatie soms onduidelijker maken maar veroorzaakt geen 16de-noten. Aparte fix nodig als dit storend is.
✅ [Claude 2026-05-10]: Opgelost — `decomposeNumeratorToBeatGroups` geëxporteerd uit `rhythmicPriorities.js` en geïmporteerd in `processMelodyAndCalculateSlots.js`. Beat-groepsgrens-ticks (bijv. tick 36 voor 5/4 3+2) worden vóór de `staysInSecondarySpan`-check als extra splitpunten behandeld. Alleen gesplitst wanneer het eerste stuk een toegestane notenwaarde is (allowedDurations). Bestanden: `rhythmicPriorities.js`, `processMelodyAndCalculateSlots.js`.

### Tuplets & polyritmiek

✅ triolen: triool vervangt een halve noot, kwartnoot of achtste noot (afhankelijk van de smallest note denom). Alle trioolnoten zijn ingevuld (dus geen rusten). Drop de laatste twee noten van de notes array, zodat notes per measure overall klopt.

[Claude 2026-04-10]: Geïmplementeerd — post-processing in MelodyGenerator.generateMelody() na fromFlattenedNotes. Triplet vervangt 1 noot met duration=2×slotTicks (bijv. 12 ticks voor 8th-grid = kwartnoot) door 3 noten van elk ⌊2×slotTicks/3⌋ ticks (bijv. 4 ticks). Eerste noot behouden, 2e en 3e willekeurig uit de schaal gekozen. Laatste 2 entries gedropped om maattelling stabiel te houden. UI: ⌇3-knop per instrument in Col 7 (variability) van InstrumentRow. Aanname: chord-sequenties uitgesloten; alleen van toepassing als een noot met exact de juiste duration bestaat.

✅ tuplet notatie & meerdere tuplet-typen

[Han]: notatie toevoegen: boven/onder verbindingsbalk boogje met "3" in het midden (notatie "3 : 2" waarbij ": 2" lowlighted). Tevens: 5-tolen (5 : 4) en 4-tolen (4 : 3) toevoegen met toenemende zeldzaamheid. Bracket alleen tonen wanneer er géén verbindingsbalk is (kwartnoten en langer). Referentie: [Wikipedia — Tuplet](https://en.wikipedia.org/wiki/Tuplet).

[Han]: de notatie klopte niet — trioolnoten werden als zestienden weergegeven in plaats van achtsten. Ook: bij weinig noten per maat logischer een triool van kwartnoten i.p.v. achtsten (replace een halve noot).

[Claude 2026-04-10]: Opgelost en uitgebreid:

- Bug fix: notehead/vlag/balken gebruiken nu visualDuration (=groupTicks/denominator) i.p.v. raw tick-count (4, 5, 8 ticks hadden geen entry in durationNoteMap).
- Multi-tuplet: triplet-klein (3:2, 2×slot), triplet-groot (3:2, 4×slot), kwadruplet (4:3, 3×slot), kwintuplet (5:4, 4×slot). Zeldzaamheid: var/500 → var/750 → var/1000 → var/2000.
- melody.triplets[i] = { id, noteCount, denominator, groupTicks, visualDuration } | null — doorgegeven via melodySlice.js.
- Notatie: "3 : 2" / "4 : 3" / "5 : 4" boven/onder de groep; ": x" gedimmed. Bracket (SVG path met haakjes) alleen bij ongebalkte noten (visualDuration ≥ 12). Bij gebalkte achtsten: enkel het getal.
- Bestanden: melodyGenerator.js, melodySlice.js, renderMelodyNotes.jsx.

✅ bug! Tuplets worden aan aangrenzende achtste/zestiende noten verbonden; tuplets mogen nooit verbonden worden aan andere noten, ook niet aantuplets van dezelfde lengte.

[Claude 2026-04-10 14:30]: Opgelost — `tupletId` (= `tripletInfo.id`) toegevoegd aan elke entry in de `measures` array. In de beam-subgroup loop: vóór het toevoegen van een noot aan de groep wordt gecontroleerd of `lastInGroup.tupletId !== e.tupletId`; zo ja wordt de groep geleegd (flush). Hierdoor beamen tuplet-noten alleen met noten van dezelfde tuplet-groep, nooit met aangrenzende normale noten of andere tuplets. Bestand: renderMelodyNotes.jsx.

Bug: nu zijn tuplets van achtsten niet meer verbonden met een beam!

bug! Ik zie precies geen verbindingsbalken meer sinds laatse oplossing..! Niet tussen triplets van achststen, niet tussen achtsten, zestienden... Je laatste wijziging heeft te aggresief beaming tegengehouden..

[Claude 2026-04-10 15:00]: Regression opgelost — de tuplet-isolatie check (`lastInGroup.tupletId !== e.tupletId`) vergeleek `undefined` (uit pushed item) met `null` (uit spanElement). `undefined !== null` is altijd `true`, waardoor ALLE beamgroepen direct werden geflushed en er geen balken meer waren. Fix: `tupletId: e.tupletId` toegevoegd aan `currentSubGroup.push(...)`. Zie renderMelodyNotes.jsx.

✅ add pentuplet 5 : 6,  sextuplets 6 : 4 and 6 : 5 and septuplets  7 : 6 , 7 : 8; (omit 7 : 4). These should be very rare.
triptles can occur as of variability 30%;
the rest only from variability > 50% with a probability of variability% / 100.

[Claude 2026-05-06]: Geïmplementeerd in `melodyGenerator.js`. Vijf nieuwe types toegevoegd aan `tupletCandidates`, allemaal met `minVar: 51` (alleen boven variability 50):
- 5:6 (var/8000), 6:4 (var/5000), 6:5 (var/8000), 7:6 (var/10000), 7:8 (var/10000).
De bestaande standaard types (3:2, 4:3, 5:4) kregen `minVar: 30`.
De bestaande `filter(t => t.groupTicks <= measureTicks)` zorgt al voor de maatsoort-beperking:
5:6 en 7:6 (groupTicks=6×slot) passen alleen in 6/8, 9/8, 12/8 e.d.; 7:8 (groupTicks=8×slot) vereist minstens 4/4 in 8th-grid.
`processMelodyAndCalculateSlots` slaat alle tuplet-noten over (fix eerder deze sessie), dus alle nieuwe types renderen direct correct.

Increase font size for triplet text. Use serif font, boldface, increase size by about 60%. Make the lowlighted second part more lowlighted. Maak afstand tussen alle tegekens gelijk (3 : 2) dus een spatie tussen alle tekens.
-> Er is momenteel geen ruimte tussen de x en de : y. Visueel is het nu "x: y", moet zijn "x : y".
-> ok resolved!

✅ Bug: triplets (3:2) van 3 achststen in plaats van 2 achststen, hebben dubbele bar (dus zestienten). Dat is niet correct. Ik zie ook triplets van halve noten genoteerd als paren van verbonden kwartnoten; voorkom dat en noteer als halve noten.
-> triplets van halve noten zijn nog altijd genoteerd als paren van kwartnoten.

[Claude 2026-04-10 14:00]: Dubbele balk bij triool-achtsten opgelost via `effectiveDur(n)`. Kwartnoot-triolen beamed als paren: fix was afhankelijk van `processMelodyAndCalculateSlots` die `triplets` doorgeeft (zie fix hierboven). Na die fix: `tupletVis=12` (kwart) → beaming-check `>= 12` sluit ze correct uit.

[Claude 2026-05-06]: Halve-noot-triolen volledig opgelost. Oorzaak: `processMelodyAndCalculateSlots` splitste 16-tick noten (halve-noot triool in kwartnoot-grid, 48/3=16) in meerdere stukken omdat 16 niet in `allowedDurations` staat. Elke splits kreeg via `melody.triplets` de `visualDuration=24` (halve noot), wat resulteerde in meerdere gebonden halve-nootkoppen op opeenvolgende posities. Fix: tuplet-noten bypassen nu alle splitlogica met een early-exit vóór stap 1 in `processMelodyAndCalculateSlots.js` — hun weergave verloopt volledig via `melody.triplets` in `renderMelodyNotes`. Geldt ook voor kleine triolen (4-tick achtste-triolen) en kwartnoot-triolen.

Ik zie geen tuplets bij percussie of bas, hoe komt dat? Is de bedoeling dat ze ook daar voorkomen. -> gezien bij perucssie! Opgelost.

### Klikzones & interactiviteit

✅ klikzone-audit accidentals: klikken op voortekens wisselt tonika naar enharmonische equivalent (bijv. F♯ ↔ G♭).

✅ klikzone-audit measure-nummers: maatlabels interactief — klikken springt naar die maat + stopt playback. Transparante hitbox + geel in settings-mode. onMeasureNumberClick prop op SheetMusic.

✅ accidentals klikken in bladmuziek wisselt naar enharmonische equivalent

[Claude 2026-04-09]: Geïmplementeerd — klik op ♯/♭ symbool vóór een noot wisselt de displayNote naar enharmonisch equivalent (F♯↔G♭ etc.) via ENHARMONIC_PAIRS. Speelt de noot NIET af (stopPropagation). Alleen displayNotes gewijzigd; audio-pitch (notes array) blijft ongewijzigd. Bestanden: renderMelodyNotes.jsx (onAccidentalClick param), SheetMusic.jsx (onNoteEnharmonicToggle prop + paginationOffset), App.jsx (handleNoteEnharmonicToggle). Aanname: alleen singlenoten (geen akkoorden); enharmonisch equivalent op basis van ENHARMONIC_PAIRS uit noteUtils.js.

✅ Noten en lyrics klikbaar (do-re-mi / takadimi spelen de noot/slag).

### Weergave & layout

✅ startX op fixed position, en sleutel, maatsoort, accidentals verdelen over ruimte links daarvan. Maatsoort gecentreerd tussen laatste header-element en startX.

- oplossing voor veranderen van instellingen (num measure, maatsoort) die zorgen voor (tijdelijk) lelijke sheet music

- meer regels bladmuziek op groter scherm; of op mobile horizontal wanneer de keys uitstaan
- optie om zowel bas als treble toetsen in beeld te hebben
- optie om geen bladmuziek in beeld te hebben

### Lyrics / Solfège

✅ Lyrics: pencil-off / music-2 / verwijder konnakol.

✅ tekst in bladmuziek: Konnakol verwijderd — KONNAKOL_TABLES, getKonnakolSyllable, groupNotesByMeasure verwijderd uit rhythmicSolfege.js; lyricsMode='konnakol' branch verwijderd uit SheetMusic.jsx.

✅ solfège voor akkoorden: alle noten gestapeld (laagste onderaan lyricsY, hogere gaan omhoog). Font 13px voor akkoorden vs 16px single. Klik speelt alle akkoordnoten tegelijk.

### Animatie

✅ ideal visible measures gebruikt in alle animatie-modi — hardcoded 3 vervangen door `idealVisibleMeasures` in App.jsx, berekend als `Math.max(2, Math.min(numMeasures, round((screenWidth - 70) / 120)))`. Aanname: ~120px per maat, 70px voor sleutel/voortekens. Minimum 2 maten (zodat altijd vorige+huidige zichtbaar is). Fallback in SheetMusic.jsx ook bijgewerkt van ?? 3 naar ?? 2.

- scroll mode: change bpm during animation...
✅ begin de animatie 0,5 maat later, en eindig ook 0,5 maat later (zodat de actieve noot op ongeveer 25% van startX - endX ligt.)

[Claude 2026-04-10]: Geïmplementeerd — scroll startTime/endTime verschoven met +0.5m op alle drie plaatsen in Sequencer.js: multi-measure last-rep (0.25→0.75), multi-measure non-last-rep (0.25→0.75), single-measure (start: -0.75→-0.25, end: +0.25→+0.75). Actieve noot staat nu langer stil op 25% gedurende de eerste maat voor de scroll begint te bewegen.

✅ animatiekleuren (geel en rood) enkel gebruiken in debugging mode.

[Claude 2026-04-09]: Geïmplementeerd — YCOL en RCOL in SheetMusic.jsx zijn nu `debugMode ? kleur : null`. In normale modus renderen de overlay-noten in standaard notenkleuren.

✅ fade out aan het einde van repeat block is niet goed. Check de specs / architectuurbeschrijving voor animaties en zorg dat er een mooie fade-out is; momenteel is de overgang tussen sequence blokken nog hakkelig.
[Claude 2026-05-10]: Oorzaak: `setTimeout(fn,0)` vuurt altijd vóór de volgende `requestAnimationFrame`. `setNextLayer(null)` triggerden `useLayoutEffect` terwijl de rAF-crossfade nog bezig was (bijv. old opacity 0.7). `useLayoutEffect` herstelde dan opacity naar 1 — zichtbare helderheidssprong. Fix: `iterStateMs` in Sequencer.js verhoogd met minimaal 25ms buffer, zodat de rAF de animatie kan afronden voordat `useLayoutEffect` de opacity wist. Bestand: `Sequencer.js`.

---

## UI / SETTINGS

### Settings overlay

Klikken op settings, opent settings overlay menu.
Dat menu blijft enkele seconden openstaan (as-is)
✅ aanpassingen: 1 buiten een knop drukken sluit settings, 2 klikken op een noot of akkoord in de bladmuziek speelt de noot — het settingsmenu opent niet.

✅ Wanneer settings overlay actief is: alles dat klikbaar is geel — clef, transpositielabel, tempoterm, BPM q=value, maatsoort, toonladder in header.

✅ debug-mode klikbare zones (Bug-icoon in header row): SVG-zones gekleurd (blauw=sleutel, rood=transpositie, oranje=BPM & maatsoort, groen=tempowoord, paars=noten, teal=akkoordlabels, magenta=herhalingsteller, geel=randomize); HTML-knoppen met cyaan outline (header, SubHeader, tabbalk).

✅ debug-klikzones uitgebreid: maatsoort, herhalingsteller, randomize-iconen, SubHeader, header, tabbalk allemaal gedekt.

✅ klikbare box rond de sleutel: altijd actief, klikzone vergroot (rechts uitgebreid).

✅ tempowoordselectie via gs-popup.

✅ maatsoort: tijdens settings overlay altijd numeriek (geen C/c symbool).

✅ Elke interactie met settings in settings overlay herstart de timer (BPM, maatsoort, repeats, clef tap).

✅ Wanneer een inputlijst / invoerveld geopend is, wacht 10s voor het te sluiten (tempo-, clef-, transpositie-pickers).

✅ bug: klikken op drum noten opent settings overlay (repeat-view group had geen pointerEvents:none bij notesVisible).

✅ bug: bij herhaaldelijk klikken op knopjes gaat de settings overlay uit — alle hitboxes missen onClick(e.stopPropagation()). mouseup stopPropagation stopt het click event niet. Fix: onClick stopPropagation toegevoegd aan clef, time-sig en BPM hitboxes.

✅ critical bug! wanneer je in bladmuziek op een responsive element klikt om instellingen te wijzigen (slteutel, maatsoort, tempo) moet ook de settings overlay activeren.

[Claude 2026-04-12 10:30]: Opgelost. Al deze elementen riepen `e.stopPropagation()` aan, waardoor de klik nooit `handleSheetMusicClick` bereikte en `onToggleSettings` dus nooit werd aangeroepen. Fix: helper `openSettingsIfClosed()` toegevoegd in SheetMusic.jsx die `onToggleSettings()` aanroept wanneer `!showSettings`, gevolgd door `onSettingsInteraction?.()`. Aangeroepen vanuit: `handleClefTap`, `wrapHandler` (maatsoort), `resetNumericTimer` (C/c klik), `handleBpmChangeWrapper`, `handleTap` (TAP-knop), tempo-term klik, en beide transpositielabels (treble + bas). Bestand: SheetMusic.jsx.

✅ maak het herhalingsicoontje 1 / continuous ongeveer 1,5x zo groot, zonder de breedte van de knop aan de passen. indien nodig, haal depadding / marge binnen de knop weg zodat de breedte p

[Claude 2026-04-09]: Geïmplementeerd — icoongrootte 11→17px (≈1,5×). Knopbreedte 26px ongewijzigd.ast.

### Header & knoppen

✅ Titel: Wanneer akkoorden aanstaan: zet de progressienaam voor de titel. Bijv. "Pop Song in D Minor", "Pachelbel in C Major".

✅ Verwijder de chord log download feature.

✅ Halveer de afstand tussen de playknop en de herhaal/eenmalig knop.
✅ Herhaal/eenmalig knop 20% kleiner: CSS .app-header-btn-sm 32px → 26px, icoon 14 → 11px.

✅ Vervang het oorsymbool door mic-off (Lucide:mic-off).

✅ Toonladder in header: altijd klikbaar (speelt toonladder af); geel wanneer settings actief, wit anders.

✅ Toonladder highlight: overlay actief → geel; afspeelt → witte drop-shadow glow; anders wit.

✅ Highlights: subtielere playback-highlight via note-glow-subtle filter (stdDeviation 1.5, 1 blur node). Klik-flash behoudt note-glow (volle glow).

✅ Letter / Roman: tekst-gebaseerd icoon: letters mode = "D-" + superscript "7"; roman = "ii" + superscript "7". Serif normal, size 26 (20% groter dan vorige 22). Aanname: "-" = minor conventie (jazz/lead sheet), superscript "7" voor de 7de graad.

✅ Ik wil nog een playback type:  herhalen. Die herhaalt eindeloos de gegeven melodie, zonder een nieuwe te genereren. In de header, gebuik iconen:
Play once (1) (as is)
Repeat : Lucide repeat-1
Continuous : Lucide shuffle
[Claude 2026-05-11]: Geïmplementeerd. Sequencer.start() heeft nu een `repeatForever` parameter (4e arg). Bij `true` wordt `isRepeatMode=true`; na elke `repsPerMelody` iteraties reset `iteration=0` maar `melodyCount` blijft 0 — geen regeneratie. `handlePlayRepeat` in `usePlayback.js` start met `repeatForever=true` en deelt `isPlayingMelody` state. AppHeader: toggle cyclet nu once→repeat→continuous (Repeat1 icoon). Bestanden: `Sequencer.js`, `usePlayback.js`, `App.jsx`, `AppHeader.jsx`.

✅ Haal de rechter marge uit de play-knop, en de linker marge uit de repeatknop, zodat deze dichter bij elkaar komen te liggen.

[Claude 2026-04-14 13:45]: Opgelost in [AppHeader.css:84](src/components/layout/AppHeader.css#L84). De Play-knop had geen eigen margins — de afstand kwam volledig van `gap: 8px` op `.app-header-right`. De repeat-knop had al `margin-left: -4px` (vorige halvering) wat 4px over liet. Nu `margin-left: -8px` zodat de flex-gap volledig geneutraliseerd wordt en beide knoppen flush tegen elkaar zitten.

✅ bug: na herhaaldelijk klikken op 'volgende' loopt de app vast. Oorzaak onbekend.

[Claude 2026-05-10 13:00]: Twee samenhangende oorzaken gevonden en opgelost:
1. **Stale closure in `navigateHistory`**: `historyIndex` en `history` werden gelezen uit een verouderde closure. Bij snel klikken gebruikte elke aanroep hetzelfde oude `historyIndex`, waardoor `randomizeAll` steeds opnieuw werd aangeroepen met dezelfde stale state. Fix: `historyIndexRef` en `historyRef` toegevoegd die altijd up-to-date zijn; `navigateHistory` en de `setHistory`-updater in `randomizeAll` gebruiken nu deze refs.
2. **Geen debounce**: `handleSkipForward`/`handleSkipBack` hadden geen guard tegen rapid-fire clicks. Elke klik kon een zware `randomizeAll` + `startSequencer` aanroepen. Fix: `isNavigatingRef` guard in `usePlaybackNavigation.js` — 300ms cooldown na elke navigatieactie.
Bestanden: `src/hooks/useMelodyState.js`, `src/hooks/usePlaybackNavigation.js`.

### Iconen & stijl (consistency check)

✅ Run an extensive consistency check: iconen, lettertypes, groottes over alle UI elementen. Stel harmonisaties voor MAAR CHECK OP VOORHAND!

[Claude 2026-04-08]: Bevindingen en voorstellen (nog niet geïmplementeerd, wacht op goedkeuring):
[Claude 2026-04-09]: Geïmplementeerd — SkipBack/Forward 20→22, Snowflake/Flame 18→20, Dices 12→10, 8.5pt→11.5px in InstrumentRow.

**Gevonden inconsistenties in icoonsizes:**

| Element | Huidig | Voorstel | Reden |
|---|---|---|---|
| AppHeader links (MicOff, Sliders, Bug) | `size={22}` | behouden | referentiegrootte |
| AppHeader SkipBack / SkipForward | `size={20}` | → `size={22}` | onsameenhangend met links (22) en Play (24) |
| AppHeader Play / Stop | `size={24}` | behouden | primaire actie mag iets groter |
| Snowflake/Flame in PlaybackSettings | `size={18}` | → `size={20}` | TrebleSettings gebruikt al 20 |
| Snowflake/Flame in TrebleSettings | `size={20}` | behouden | referentie |
| Status-iconen PlaybackSubComponents | Disc=10, Dices=12, Pin=10 | Dices → 10 | alle drie even groot |
| ChordGrid ChordNotationIcon | `size={22}` | behouden | past in control-rij |

**Gevonden inconsistenties in fonts:**

- `GenericStepper` gebruikt zowel `15.5px`, `11.5px` als `8.5pt` (mixed px/pt). Voorstel: alles in px (8.5pt ≈ 11.3px, afgerond 11px of 11.5px).
- `SmartToggle` toneert TONIC-label met `22px` (zelfde als header-title) — bewust ontwerp, geen probleem.

**Geen actie nodig:**

- InstrumentRow groot (22px) vs klein (14px) iconen: bewust onderscheid tussen status en decoratie.
- DrumPad clamp-font: responsive, OK.

### BPM controls

✅ BPM: -- / ++ knoppen (naar dichtstbijzijnd veelvoud van 5); - / + (naar dichtstbijzijnd geheel getal); min 12, max 360; ook via numerieke input.

✅ BPM TAP: TAP-knop in BPM-overlay (zichtbaar met showBpmControls of settings); gemiddelde van laatste 4 intervals (max 5 timestamps, stale na 3s); TAP-label flitst geel bij klikken.

---

## TOONLADDER / SCALE SELECTION

### Scale Selection Wheel

✅ Restored: 12-segment chromatic donut wheel with rotation, rounded outer edges, mode lookup via `findActiveIndex`, and CSS-variable colours. See architecture.md §14.

### Tonica & bereik

✅ adjust range (tonic + 8va) after changing tonic, should happen before melody generation (i.e., force sequential range adjustments)
randomize tonic seems to select an ever higher tonic. This is due to the range logic - now, when the range is set to tonic +  8va (and variants): let tonic be within the range C4-B5 (including enharmonic variants).

[Claude 2026-04-08]: ANALYSE — `randomTonic()` in scaleHandler.js picks from tonicOptions (C4-C5). The drift likely comes from `getBestEnharmonicTonic` doing octave bumps for B→C♭ or C→B♯. Fix: After randomTonic, clamp the result so octave is at most 5 (for relative mode) and pitch class is at most B.
VRAAG: Bedoel je dat tonic MAXIMAAL B5 mag zijn (dus 2 octaven: C4 t/m B5)? Of ALLEEN C4-B4 (1 octaaf, max B4)? De tekst zegt C4-B5 maar dat is hoger dan de huidige max C5. Graag bevestigen voor implementatie.
[Claude 2026-05-10]: Twee fixes geïmplementeerd:
1. `tonicOptions` in `scaleHandler.js`: C5 verwijderd. Bereik is nu C4–B4 (alle 12 toonsoorten, 1 octaaf). In relative-range mode (tonic+8va) geeft dit een speelbereik van max B4–B5. `getBestEnharmonicTonic` kan B4 → C♭5 omzetten (zelfde pitch) — dat is correct gedrag.
2. `Sequencer.js` `applyResultToSetters`: `setTonic(result.tonic, true)` — `isManualOverride=true` voorkomt dat `setTonic` `getBestEnharmonicTonic` nogmaals toepast met verouderde React `selectedMode`, wat kon leiden tot enharmonische flips.
Bereik-sync vóór melodiegeneratie: al correct — `useMelodyState` herberekent altijd via `calculateRelativeRange(voiceType, rangeMode, targetScale.tonic)` onafhankelijk van state-timing.

---

## AKKOORDEN / PROGRESSIE

### Progressie-strategieën

- intermodale progressie generator op basis van spanning maken en oplossen (light en dark?)
- custom chord progressions of zelfs hele liederen (e.g., jazz standards)
- chord progression 'puzzels' met weergave kwintencirkel (vaag idee)
- notatie voor romeinse cijfers in intermodaal: e.g. bII bVII.

- In notatie werkelijke unicode voortekens gebruiken ipv b en #. (bladmuziek én chord grid). Logica checken op consistentie met muziektheorie.

✅ Jazz Random toegevoegd: random ii–V–I cadences met wisselende resolutiepunten (I, ii, IV, vi). Strategie: 'jazz-random' in progressionDefinitions + chordGenerator.

✅ de labels in progression selector: ik wil graag de namen zoals ze in de lijst staan (dus bijvoorbeeld JAZZ SONG moet worden Jazz (...ii-V-I)).
Alle namen moeten zijn van de vorm: naam (nummers).
De titel 'JAZZ SONG' is wel belangrijk, deze wordt gebruikt in de header.

[Claude 2026-04-14 12:30]: Opgelost. Twee wijzigingen:

1. `TypeSelectorOverlay.css` — `text-transform: uppercase` verwijderd op `.tso-btn`. Oorzaak: Romeinse cijfers dragen semantiek in hun case (`ii` = mineur, `V` = majeur); uppercase vernietigde die informatie. Comment toegevoegd om regressie te voorkomen.
2. `progressionDefinitions.js` — alle `label`-velden genormaliseerd naar vorm "naam (numerals-met-hyphens)". `Jazz Song (... ii V I)` → `Jazz (...ii-V-I)` volgens voorbeeld; andere predetermined progressies kregen hyphens tussen graden (Pachelbel, Pop Song, Pop Ballad, Doo-Wop, Cadential, Andalusian Cadence, Classical Cadence, Jazz Random). De `shortLabel`-velden zijn ongewijzigd — `getProgressionLabel()` retourneert nog steeds `shortLabel` dus de header blijft "Jazz Song" / "JAZZ SONG" tonen.

### Passing chords

-> passing chords: notatie bV7/ii in Romeinse cijfers
-> harmoniseren settings passing chords in generator settings en in chord grid view
-> visualisatie van passing chords
-> betere visualisatie van akkoordenprogressie (bijv. pijlen wanneer de sequencer uitstaat)

Nieuwe logica voor passing chords (voor meer balans): Wanneer Passing chords aanstaan: probeer elke maat een akkoord uit de progressie te geven: kies de slot het meest dicht bij de eerste tel van een maat met afstandsregels: minimum van (slotrank + afstand tot maatstart *2) (net als bepalen van beat en backbeat --- zorg dat je zeker deze logica hergebruikt!!)
Alle andere akkoorden die zijn ingevuld worden ingevuld door passing chords.

[Claude 2026-04-08]: Geïmplementeerd — structuralCount = 1 (altijd 1 progressie-akkoord per maat, bij beat 1 via MelodyGenerator rank+2×distance proxy). insertPassingChords vult de resterende chordCount-1 slots met passing chords. Aanname: MelodyGenerator met notesPerMeasure=1 + rhythmVariability=0 plaatst altijd het akkoord op slot 0 (beat 1, hoogste rank). De proximityUtils.findBestSlot formule (rank + 2×afstand) is de bestaande logica die dit bewerkstelligt.

✅ bug! In de generator settinsg, chords / measure = 2,passing chords actief: bijna 4 akkoorden per maat! Fout in berekening.

[Claude 2026-04-14 13:15]: Opgelost. Drie gerelateerde fouten in het samenspel tussen `useMelodyState` en `Sequencer`:

1. **Dubbele passing-chord invoeging bij continuous playback.** `useMelodyState.randomizeAll()` produceert een Melody met N structurele + N passing = 2N chords. Bij latere Sequencer-ticks (continuous playback) werd deze Melody als `notePool` doorgegeven aan een nieuwe `MelodyGenerator`-ronde. Omdat de notePool al passing chords bevatte, werden die als "structureel" behandeld en daarna draaide `insertPassingChords` er een tweede keer bovenop → per maat 2× zoveel chords als verwacht (~4 i.p.v. 2). Fix in [Sequencer.js:1074](src/audio/Sequencer.js#L1074): notePool nu gefilterd op `!c.meta?.isPassing` wanneer gevallen terug wordt op `chordProgression.displayNotes` (Melody-pad). Het `chordProgression.chords`-pad (verse ChordProgression) blijft ongewijzigd.
2. **Inconsistente `structuralCount` tussen useMelodyState en Sequencer.** [useMelodyState.js:61](src/hooks/useMelodyState.js#L61) (generateChords, bepaalt lengte van abstracte progressie-pool) gebruikte `Math.max(1, Math.ceil(chordCount / 2))` terwijl [useMelodyState.js:158](src/hooks/useMelodyState.js#L158) (randomizeAll, bepaalt MelodyGenerator `notesPerMeasure`) al `1` gebruikte. Voor chordCount > 2 werd dus de helft van de abstracte progressie weggegooid. Beide plekken nu consequent `1`.
3. **Sequencer had dezelfde inconsistentie.** [Sequencer.js:981](src/audio/Sequencer.js#L981) en [Sequencer.js:1065](src/audio/Sequencer.js#L1065) gebruikten beide `Math.ceil(density / 2)`. Beide aangepast naar `1` zodat alle drie de sites overeenkomen.

Invariant: wanneer `passingChords !== 'none'`, altijd **precies 1 structurele chord per maat**, overal — in de progressie-pool-lengte, in MelodyGenerator's `notesPerMeasure`, én in de gefilterde notePool die Sequencer hergebruikt. Dit matcht de hardcoded `structuralCount = 1` in [passingChords.js:316](src/generation/passingChords.js#L316).

### Akkoord-taxonomie

- nakijken of taxonomie volledig is

### Muziektheorie (akkoorden)

Zorg dat notatie, en progressielogica, akkoorden strookt met muziektheorie. bijvoorbeeld:
<https://musictheory.pugetsound.edu/mt21c/MusicTheory.html>
<https://method-behind-the-music.com/theory/notation/>

---

## MELODIE / BASS

### Generatie

- muzikale random generation setting, die muzikaal logische lijnen maakt
- walking bass setting, die walking bass maakt
- verbetering van arpeggio mode voor chords/scales: start bij root/tonica; juiste afhandeling in range cut-off
- akkoord mode: kans op akkoorden (milde versie van 'full chord') -> genereer uniform willekeurig maar nu paren van noten uit de melody notes set die is ingesteld. Idee: pak één noot uit het 'akkoord' en één noot uit de notenset. beperkingen: maximum afstand is een octaaf. Bij 'mislukt' genereer gewoon één noot uit de notenset.
- akkoord mode: simpele akkoorden / omleggingen
Maak uniform + scale een stuk 'duurder' dan arp.
Voeg nog weighted chromatic toe als extreem moeilijk.

- het concept van zwaartetonen en leidnoten verder uitwerken, ook toepassen bij akkoorden (bijv: akoord - leidnoot)

### Bass range bug

✅ bass generator seems not to take the range into account
[Claude 2026-05-07]: Root cause: in `melodyGenerator.js`, the `effectiveScale` range-expansion loop compared `noteVal = oct * 12 + i` (chromatic MIDI from C0=0) against `getNoteIndex(range.min/max)` which returns indices from A0=0. This 9-semitone offset caused the effective scale to be shifted down by 9 semitones — notes below the intended minimum were included and notes near the top were excluded. Fixed by adding +9 to convert both bounds to the same chromatic origin. Files: `src/generation/melodyGenerator.js`.

### Quarter note span (melodische sprong-beperking)

✅ voeg een parameter toe aan treble en bass melodie: **quarter note span**
  - standaard: 1 octaaf (12 halve tonen)
  - instelbaar minimum: 2 hele noten (24 halve tonen) — ruimer, niet beperkter dan default
  - gedrag: als een willekeurig gegenereerde noot verder ligt van alle noten in het afgelopen kwartslag-venster dan de ingestelde span, dan opnieuw tekenen
  - fallback na 10 pogingen: vergroot de span stapsgewijs met 0,5 noot per poging totdat een noot past, of kies een richting (omhoog/omlaag) en pak de dichtstbijzijnde in-range noot
  - rand cases om rekening mee te houden: pentatonische toonladders (grote sprongen inherent), zeer beperkende instellingen (kleine range + kleine span)

[Claude 2026-05-10 12:00]: Geïmplementeerd als `maxLeap` (null = onbeperkt). Intersectie-aanpak i.p.v. retries: voor elke noot-slot wordt de kandidatenpool gefilterd op noten die binnen maxLeap vallen van ALLE noten in het vorige kwartslag-venster (window = smallestNoteDenom/4 slots). Fallback: dichtstbijzijnde noot in effectiveScale. Geldt ook voor akkoord-breedte (fullchord: max span tussen laagste en hoogste noot; pairedchord: max afstand tussen melodienoot en partner). UI: GenericStepper "SPAN" in Col 8 van InstrumentRow voor treble en bas, opties 3rd–15th + ∞. Bestanden: `InstrumentSettings.js`, `melodyGenerator.js`, `InstrumentRow.jsx`, `musicLayout.js`, `PlaybackInstrumentSection.jsx`, `PlaybackSettings.jsx`.

### Overig

- 'humanization' in afspelen van de muziek: volume en timing
- herbalanceren variability (misschien wortel nemen van percentage voor genuanceerder effect?)

---

## RITME & PERCUSSIE

### Ritme-generatie & beat-structuur

✅ bug: 5/8 maat akkoorden C///C → C//C/ (3+2 groepering).

[Claude 2026-04-08]: Fix — decomposeNumeratorToBeatGroups(n) in rhythmicPriorities.js: formule decomponeren n in 3+2 groepen (geen hardcoded lookup). Beat-group downbeats vóór nearDivisors gerankt. Generaliseert naar elke maatsoort incl. 15/8. Aanname: standaard 3+2 groepering (3en eerst) voor onregelmatige maatsoorten.

✅ Chord template-resolutie: globalResolution = ts[1] (noemer, niet hardcoded 16). Voor 5/8 → 5 slots (8ste-noot grid); 4/4 → 4 slots (kwartnoot). slotsPerBeat=1 → beat-groepsindices zijn direct slot-indices.

[Claude 2026-04-08]: Geïmplementeerd in useMelodyState.js — globalResolution = activeTS[1] (was hardcoded 16).

- betere ritmische planning en groepering van noten
  - bepalen van zwaartenoten
  - naar zwaartenoten toe spelen
  - specifieke afspeelstijlen/liedstijlen: akkoord, bossa nova, waltz/jazz waltz, pop pulse, …
  - metronoom aanpassen (flat, zwaartenoten)
  - shuffle feel
- betere percussie, e.g., backbeat, claves; revisie van rythmische slots
- parallele percussielijnen: RH LH // cymbalen, kick/snare
- triolen, polyritmiek en paradiddels
- voorkomen dat men 3 handen of 3 voeten nodig heeft
- meer drumstijlen: <https://rhythmnotes.net/drumming-styles/>
- onafhankelijkheidstraining (denk matrix - makkelijk: hh/s/k; hh/s/k/hp, en moeilijker: [r,rb,rt]/[s,sg,th,tm],[hp],[k])
- percussie rudiments / claves /
- polyrithmiek / subdivisies: triolen, maar ook pentolen etc.:

Matrix: <https://www.moderndrummer.com/2014/04/modern-drummer-education-team-weighs-developing-independence/>

✅ I would like a polyrhythm toggler somewhere in the advanced settings [none, low, medium, high. extreme], which drastically increases the chance for tuplets to occur; e.g., to variability%/20 or even varbility%/10, and variability%/1.
[Claude 2026-05-11]: Geïmplementeerd per instrument. Globale poly-control uit PlaybackSettings verwijderd. InstrumentRow col 9 (GRID_GENERATOR uitgebreid naar 9 kolommen): GenericStepper none(1×)/low(5×)/med(15×)/high(50×)/xtreme(200×) per instrument. Metronoom uitgesloten. Multipliers zijn dezelfde schaal als voorheen. Bestanden: `musicLayout.js`, `InstrumentRow.jsx`, `PlaybackSettings.jsx`, `PlaybackSettings.css`.
❓ Per-type tuplet filtering (welke tuplet-types aan/uit) is uitgesteld tot het profiel/kennisbank-systeem beschikbaar is.

### Takadimi / Rhythmisch solfège

sync rhythmicDNA en percussienotatie: de `smallestNoteDenom` uit percussie-instellingen
doorgeven aan `getEffectiveBeatDuration`, zodat de beat-level in Takadimi/Konnakol
automatisch klopt met de gegenereerde gridresolutie (i.p.v. afleiden uit melody.durations).
Ook: onregelmatige subdivisies (triolen, kwintolet) herkennen en annoteren.

[Claude 2026-04-08]: Geïmplementeerd — `melody.smallestNoteDenom` wordt nu doorgegeven aan `getEffectiveBeatDuration` als derde parameter. Hierdoor klopt de beat-level in Takadimi altijd met de grid-resolutie uit de percussie-instellingen. Aanname: 4 × subdivision = beat (simple meter); compound meter gebruikt altijd de nootwaarde van de noemer.
✅ Nog open: onregelmatige subdivisies (triolen, kwintolet) herkennen en annoteren in Takadimi.
[Claude 2026-05-10]: Opgelost — `getTupletSyllable(posInGroup, noteCount)` toegevoegd aan `rhythmicSolfege.js`. Geeft de correcte lettergreep op basis van positie binnen de tuplet-groep (niet op ticks): ÷2=ta/di, ÷3=ta/ki/da, ÷4=ta/ka/di/mi, ÷5=ta/ka/di/mi/ti, ÷6=ta/va/ki/di/da/ma, ÷7=ta/va/ki/di/da/ma/ti. In `SheetMusic.jsx` Takadimi-renderingloop: `melody.triplets[i]` geeft de tuplet-groep-info; positie binnen de groep wordt bijgehouden via `tupletPosMap`. Tuplet-noten gebruiken `getTupletSyllable`; reguliere noten blijven `getTakadimiSyllable` gebruiken. Tick-gebaseerde aanpak was onbetrouwbaar omdat `Math.round(groupTicks / noteCount)` niet altijd exact op B/N uitkomt. Bestanden: `rhythmicSolfege.js`, `SheetMusic.jsx`.

### Bugs percussie / playback

bug: "Scale must be a heptatonic collection." crash bij afspelen via Sequencer wanneer akkoorden aanstaan.
[Claude 2026-05-12]: Root cause: `generateChordOnDegree` (chordGenerator.js:146) gooit een fout wanneer `rawScale.length < 7` EN `heptaRefIntervals = null`. De bestaande fallback (regel 127) loopt alleen als `heptaRefIntervals?.length === 7`. Bij heptatonische toonladders met < 7 gegenereerde noten (bijv. bij degenerate Scale-object met `notes=[]`, of bij een toonladder waarvan de `heptaRefIntervals` niet is ingevuld) én heptaRef=null wordt de fallback overgeslagen, waarna de throw optreedt. Reproduceerbaar via Sequencer.start() → randomizeScaleAndGenerate → generateProgression met een benoemde progressiestrategie (niet 'modal-random'). Fix: secundaire fallback toegevoegd in chordGenerator.js die `scaleObj.intervals` gebruikt als die 7 noten heeft, anders Ionian Major [2,2,1,2,2,2,1] als last-resort — identiek aan de fallback in `modulateMelody` (musicUtils.js). Bestanden: `src/theory/chordGenerator.js`.

bug2: akkoorden in niet hepta - hiervoor was een oplossing, elke toonladder heeft een hepta equivalent: heptaRefIntervals; dus ik ben verbaasd over deze error.
[Claude 2026-05-12]: Zie "Scale must be a heptatonic collection" bug hierboven — zelfde issue, bevestigd door Han. Alle pentatonische/hexatonische toonladders hebben `heptaRefIntervals` in de definitie, maar via een onbekend code-pad kan heptaRef toch null zijn. Fix in chordGenerator.js als secundaire fallback, zie boven.
[Claude 2026-05-12 14:xx]: ✅ Fallback uitgebreid met volledige decision tree (Han, 2026-05-12): (1) hepta → direct (primaire pad); (2) heptaRefIntervals → gebruik die (primaire pad); (3) scaleObj.diatonic → opzoeken in DIATONIC_MODE_INTERVALS (Ionian/Dorian/Phrygian/Lydian/Mixolydian/Aeolian/Locrian); (3b) scaleObj.intervals met 7 stappen → eigen intervallen hepta toonladder; (4) Ionian als absolute last-resort. Bestanden: `src/theory/chordGenerator.js`.

bug: geen geluid bij indrukken pianotoets / "Play Melodies" — `gain`-property in playSound.js ongeldig voor smplr 0.20.0.
[Claude 2026-05-12]: In smplr 0.20.0 is het `NoteEvent`-type gedefinieerd als `{ note, velocity?, time?, duration?, detune?, ... }` — geen `gain`-veld. `playSound.js` stelde `startOpts.gain = _volume` in, wat door smplr stilzwijgend wordt genegeerd. Fix: `gain`-property verwijderd uit startOpts; alleen `velocity: Math.floor(_volume * 127)` blijft over. Bestanden: `src/audio/playSound.js`. NB: dit was waarschijnlijk NIET de oorzaak van de hoofdstilte (die wordt vermoedelijk veroorzaakt door de Scale-fout hierboven of door AudioContext suspend), maar het is wel een onjuiste API-aanroep.

✅ bug: stop playback for drum en metronoom onmiddelijk na het drukken van 'stop'

✅ highlight ook de akkoorden in de bladmuziek - soms blijft een gehighlight akkoord 'hangen'.

✅ bug: laatste akkoord / noot blijft soms in highlight hangen.

✅ bug: na een tijd loopt de app vast. In dit geval bij maat 69 tijdens continuous playback, en een tweede keer bij maat 93.

[Claude 2026-04-12 10:00]: Oorzaak gevonden en opgelost. In `processMelodyAndCalculateSlots.js` (regel 166) had de inner while-loop `while (!allowedDurations.includes(splitDuration))` geen exit-guard. Wanneer een triool-achtste noot (duration=4 ticks) het maateinde kruiste, werd de rest (bv. 2 ticks) kleiner dan de minimale splitsbare eenheid (3 ticks). Omdat 2 niet in `allowedDurations` staat én geen enkele `splittableDurations[j] ≤ 2`, verliet de for-loop zonder break, bleef `splitDuration=2`, en herhaalde de while eindeloos → complete app freeze. Fix: `found`-vlag toegevoegd; als de for-loop zonder match eindigt, wordt de rest genegeerd en de inner while verlaten. Bestand: `processMelodyAndCalculateSlots.js`.

---

## KLAVIER / INPUT

### Invoer

- inputcaptatie (keyboard of microfoon) met 'validatie'
- MIDI input
- MIDI output

### Gamification / Validatie

- timing-vrije mode (speel de juiste volgende noot)
- timing vaste mode (speel de juiste noot met een redelijke timingsbuffer)
- heating afspeelmode (graduele toename van moeilijkheidsgraad tijdens cont. playback)

---

## MUZIEKTHEORIE & PEDAGOGIE

---

## UX / UI — NAVIGATIE & STRUCTUUR

### Input achter een submenu

vind een manier om input achter een submenu te steken: treble, vocal (mic input), bass, percussion, guitar neck (nog niet geïmplementeerd)

> ⚠ Neem alvorens dit te implementeren een interview af bij Han.

### Scale en Chords achter een submenu

vind een manier om scale en chords achter een submenu te steken

> ⚠ Neem alvorens dit te implementeren een interview af bij Han.

### Generator opsplitsen in simpel / advanced / debug

vind een manier om generator te splitsen in simpel (difficulty, playback setting, presets), advanced en debug

> ⚠ Neem alvorens dit te implementeren een interview af bij Han.

### Profiel: interface, preferences, kennisbank

voeg een profiel toe met interface, preferences, en kennisbank.

> ⚠ Neem alvorens dit te implementeren een interview af bij Han.

### Generatorsettings en playback duidelijker splitsen

vind een manier om generatorsettings en playback duidelijker te splitsen (sheet music settings overlay)

> ⚠ Neem alvorens dit te implementeren een interview af bij Han.

### Kleuren harmoniseren

harmoniseer kleuren (2 accentkleuren blauw en geel → één kleur)

> ⚠ Neem alvorens dit te implementeren een interview af bij Han.

---

## UX / UI (algemeen)

- meer presets
  - Practice: hearing, sight-reading, scales, chords, improvisation mode
- polijsten van UX/UI
  - harmoniseren knoppen, velden, iconen, lettertypes, kleuren, beperken van thema's
  - polijsten van scale selection

---

## CODE & ARCHITECTUUR

- algemene code cleanup
  - verwijderen van verouderde bestanden (`playContinuously.js`, `usePlaybackState.js`)
    - [Claude 2026-04-30]: ✅ playContinuously.js was deleted in v2 reorg; stale comment references in App.jsx and melodyGenerator.js cleaned up.
  - DRY note-matching logica in `convertRankedArrayToMelody.js`
    - [Claude 2026-04-30]: ✅ Done. Replaced local `getNotePC` + `ALL_PCS_CALC` with `getNoteSemitone` from `noteUtils.js`. Same fix applied to `useInputTest.js` (replaced inline `canonicalMap` with `getCanonicalNote(normalizeNoteChars(n))`) and `RangeControls.jsx` (replaced inline enharmonics map). See commit `f69f80a`.
  - refactor `MelodyGenerator.generateMelody` om complexiteit te verminderen
    - [Claude 2026-04-30]: Investigated. The unified `generateAllMelodies()` extraction (planned to dedupe between `Sequencer.randomizeScaleAndGenerate` and `useMelodyState.randomizeAll`) was skipped: the two call sites have meaningfully diverged control flow (transpose-existing vs fixed-reference branches), and merging would need 8+ config flags with audio-scheduling risk per CLAUDE.md §6. Still open.
  - hooks extraheren uit `App.jsx` om bestandsgrootte te verminderen
    - [Claude 2026-04-30]: ✅ Done. App.jsx 2,204 → 1,625 lines (26% reduction). Extracted: `useSettingsOverlay`, `useNoteInteraction`, `usePlaybackNavigation`, `useScaleManagement` (partial — `setTonic`/`setSelectedMode` stayed due to coupling with refs & range setters); `SubHeader` and `SettingsPanel` components; three React Contexts (`PlaybackConfigContext`, `InstrumentSettingsContext`, `DisplaySettingsContext`).
  - Scroll-animatie in `useSheetMusicHighlight.js` (`runScrollAnimation`) herontwerpen als constant-speed playhead (huidig: css-transform, niet muzikaal gesynchroniseerd). Wacht tot pagination en wipe stabiel zijn.
    - [Claude 2026-05-06]: TODO overgebracht vanuit `useSheetMusicHighlight.js` lijn 289.
  - `PlaybackSettings.jsx` opsplitsen in subcomponenten
    - [Claude 2026-04-30]: ✅ Done. PlaybackSettings 602 → 504 lines. Extracted "Instruments" + "Visibility & Audibility" sections into `PlaybackInstrumentSection.jsx`. See commit `e60fef5`.
  - PRESET_RANGES geconsolideerd
    - [Claude 2026-04-30]: ✅ Done. Was triplicated in `Sequencer.js`, `RangeControls.jsx`, and `SheetMusic.jsx`. Now imported from `src/constants/ranges.js`.

---

## MONETISATIE

- paywall van features / ads

---

## SHIPPING

- APK (Android)
