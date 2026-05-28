# Backlog & Feature Requests

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

### ✅ Bestaande liedjes
bestaande liedjes (happy birthday, ...)
[Claude 2026-05-19]: Op verzoek van Han: samenvoegen met custom chord progressions (#25). Twee features: (1) bestaande liedjes afspelen (SHORTLIST); (2) eigen invoer (LONGLIST). Nieuwe feature samen met 'eigen invoer': akkoord / drum-sequencer → LONGLIST.
[Claude 2026-05-20]: ✅ Geïmplementeerd. Nieuwe bestanden: `src/songs/definitions/happyBirthday.js` (F groot, 3/4, 24 noten, per-lettergreep lyrics), `src/songs/loadSong.js` (transponeert naar huidig tonica), `src/songs/songIndex.js` (register). UI: `src/components/songs/SongsTab.jsx` — kaartgrid met Easy/Medium/Hard kiezer + "Originele toonaard"-toggler (toggling ON laadt het nummer opnieuw in geschreven toonaard én zet app-tonica op die toonaard). Tekstlyrics worden gerenderd onder de treble via `renderTextLyricsRow` in `SheetMusic.jsx`, onafhankelijk van solfège-modus.

[Han 2026-05-22]: Bugs op de huidige song-implementatie:
- ✅ **Songs > loading sets bottomview to sheet music** — onbedoeld; verwachting was dat de huidige bottomview behouden blijft (of in elk geval niet hard switchen naar sheet music) wanneer je een lied laadt.
  [Claude 2026-05-22]: De `setActiveTab('sheet-music')` regel in de `loadSongAndPlay` callback in `App.jsx` verwijderd. De gebruiker's huidige tab blijft nu behouden bij het laden van een lied.
- **Happy Birthday klinkt niet correct** — de melodie of het ritme klopt niet met het bekende kinderliedje. Vermoedelijk een tikfout in `src/songs/definitions/happyBirthday.js` of een transpositie-bug.

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
[Claude 2026-05-19]: ⬇ GEEN REPRODUCED EXAMPLES — op verzoek van Han. Parkeer tot er een reproduceerbaar geval is.

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
[Claude 2026-05-19]: Op verzoek van Han: rubato (~) als maatsoort wél gewenst — toevoegen als een kiesbare "maatsoort" (bijv. symbool ~ in de maatsoort-kiezer) naast normale maatsoorten. Interview nodig voor exacte afspeellogica en notatie.

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

### ✅ Splitsregels (note splitting)

bug: twee verbonden halve noten in plaats van een hele noot — splitsregels te streng.

Review splitsregels. Beschrijf logica en voorbeelden in documentatie. Kernprincipes:

**Simpele maatsoorten (2/4, 3/4, 4/4, 2/2)**
- 2/4: halve noot op tel 1 = goed. Gepunteerde kwart op tel 1 = goed. Gepunteerde kwart op tel 2 = slecht (maatgrens verbergen).
- 3/4: gepunteerde halve (hele maat) = goed. Halve tied naar kwart = slecht.
- 4/4: halve op tel 1 = goed. Halve op tel 2 = slecht (tel 3 verbergen). Gepunteerde halve op tel 1 = goed. Gepunteerde halve op tel 2 = slecht (tel 3 verbergen). Kwart tied naar achtste over tel 2 = goed (syncopering zichtbaar). 2/2: beat = halve noot.

**Samengestelde maatsoorten (6/8, 9/8)**
- 6/8: gepunteerde kwart = goed voor 1 beatgroep. Gepunteerde kwart tied naar achtste = goed voor 4 achtsten (beatgroep 2 zichtbaar). Kwart binnen 1 beatgroep = goed.
- 9/8: gepunteerde halve = 2 beats. Gepunteerde kwart tied naar kwart = 5 achtsten.

**Onregelmatige maatsoorten (5/8, 7/8, 11/8, ...)**
- Groepering (2+3 of 3+2) bepaalt splitsregels: groepsgrens MOET zichtbaar blijven.
- 7/8 voorbeeld: kwart | kwart | gepunteerde kwart (2+2+3).
- 11/8 voorbeeld: elk beatgroepje zichtbaar.

**Syncopen**
- achtste rust + kwart tied naar achtste = correct (accent buiten tel zichtbaar).
- Noot MAG tel verbergen als dat de syncopering is die gegenereerd werd.

Afhankelijkheid: rhythmicDNA-groepering (zie hieronder).

### RhythmicDNA — beat-groepering voor melodiegeneratie

Verdeel voor het genereren van de melodie de tel op in groepen. Er is al een methode om dit te doen; maar die kan ook anders. Bijv: 5 = 2+3 of 3+2. Waar zitten de beats, en back-beats.

- backbeat drum moet naar groepering luisteren
- verdeling van noten over notenbank moet naar groepering luisteren
- ranked array voor melodie moet naar groepering luisteren

Voorlopig: elke maat dezelfde onderverdeling.

[Claude 2026-05-12]: Opmerking: `decomposeNumeratorToBeatGroups` in `rhythmicPriorities.js` bestaat al en geeft beat-groepen terug (bijv. 5→[3,2]). De koppeling met splitsregels, backbeat-routing en notenpool-weging is nog niet gemaakt.
[Claude 2026-05-17]: ⬇ LAGE PRIORITEIT — op verzoek van Han. Backbeat drum ✅ (backbeat_2 implementeert groeperings-bewuste kick/snare-plaatsing). Melodische noot-gewichten naar groepering: uitgesteld. De ranked array (DNA) zelf bevat al de groeperings-hiërarchie; de melodiegenerator gebruikt die al voor prioriteit. Extra weging van notenpool naar groepsgrens is een verfijning, niet een blocker.
[Claude 2026-05-19]: ✅ Gedeelde groepering geïmplementeerd — `chooseGrouping()` wordt één keer per generatieblok aangeroepen in `useMelodyState.randomizeAll()` en doorgegeven aan alle generators (treble, bas, percussie, akkoorden, metronoom). `globalRhythmArray` gebruikt nu `generateRhythmicDNA(sharedGrouping)` in plaats van `generateDeterministicRhythm('default')`. Metronoom gebruikt `randomizationRule: 'metronome'` met `wh/wm/wl` woodblock-klikken op basis van groepsstart. Doorgegeven akkoorden (`insertPassingChords`) plaatst leidakkoorden op DNA-gerangschikte beats.

### ✅ Bug: 'g'-markeringen op verkeerde groepsgrensposities

Bug (2026-05-19): In 5/4 met gegenereerde groepering [2,3] verschenen de visuele groepsscheidingstekens ('g' in de allOffsets-array) op de positie van [3,2] (de fallback). Oorzaak: `processMelodyAndCalculateSlots` retourneerde `rhythmicGrouping` niet in zijn return-object. Daardoor las de `allOffsets`-aanroep in `SheetMusic.jsx` altijd `null` en viel terug op `decomposeNumeratorToBeatGroups` (altijd [3,2]-ordening). Fix: `rhythmicGrouping: melody.rhythmicGrouping ?? null` toegevoegd aan het return-object van `processMelodyAndCalculateSlots.js`. Bestand: `src/components/sheet-music/processMelodyAndCalculateSlots.js`.
[Claude 2026-05-20]: ✅ Bevestigd opgelost via code-inspectie.

### RhythmicGrouping — edge case bij maatsoortwijziging en geschiedenisnavigatie

⚠ Neem alvorens dit te implementeren een interview af bij Han.

Elk `Melody`-object draagt zijn eigen `rhythmicGrouping` (bijv. `[3,2]`). Twee randgevallen:

1. **Geschiedenisnavigatie**: wanneer je teruggaat naar een oudere melodie, kan de groepering van die melodie afwijken van de huidige. Visueel is dit correct (de renderer gebruikt `melody.rhythmicGrouping`), maar dit moet bevestigd worden voor afspeelscheduling.
2. **Maatsoortwijziging midden in de sessie**: de opgeslagen melodieën in de history hebben een groepering die bij de *oude* maatsoort hoort. Wat moet er gebeuren bij navigatie naar zo'n entry na een maatsoortwijziging?

[Claude 2026-05-19]: Geparkeerd op verzoek van Han. Interview vereist vóór implementatie. Han: "laat voorlopig staan".

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

✅ bug: pentuplet rendering fouten in 4/4 (bijv. kwart - kwart - 5:4 achtsten - zestiende rust):
1. De 4de noot van de pentuplet wordt niet gerenderd.
2. Het ritme van de pentuplet klopt niet (timing van de noten).
3. De som van de maat klopt niet: pentuplet heeft 5 achtsten i.p.v. 4 achtsten; de zestiende rust aan het einde is daardoor redundant.
[Claude 2026-05-16]: Opgelost in `melodyGenerator.js` tuplet-expansie loop. Drie bugs: (1) `notes.slice(idx + 1)` verving slechts 1 slot i.p.v. alle `denominator` slots (incl. continuation nulls) → gewijzigd naar `slice(idx + denominator)`; (2) `Math.round(groupTicks / noteCount)` veroorzaakte timing-drift → gewijzigd naar `Math.floor` + `lastNoteTicks = groupTicks - (noteCount-1) * noteTicks` voor exact totaal; (3) keepN-trimming aan het einde sneed de 5e noot weg → keepN-blok verwijderd, arrays zijn nu exact de juiste lengte na expansie.

✅ RhythmicDNA — tuplets mogen geen groepsgrenzen overschrijden

Tuplets die een groepsgrens (bijv. 3+2 boundary in 5/8) overschrijden zouden significant duurder moeten zijn in de randomisatie. Dit is een uitbreiding op de RhythmicDNA-feature: zodra de groepering beschikbaar is in `melodyGenerator.js`, kan de tuplet-kandidaten-loop een extra strafterm toepassen wanneer het tuplet-interval een groepsgrens bevat.

[Claude 2026-05-17]: Op de backlog gezet op verzoek van Han. Niet implementeren voordat RhythmicDNA basisimplementatie klaar is.
[Claude 2026-05-17]: Geïmplementeerd in `melodyGenerator.js`. Pre-computed `groupBoundaryTicks` (beat-groepsgrens-ticks binnen een maat, excl. 0 en einde). Per tuplet-kandidaat: als het tuplet-interval een groepsgrens overspant, wordt de kans vermenigvuldigd met `CROSS_BOUNDARY_FACTOR = 0.1` (10× zeldzamer). Werkt voor alle maatsoorten incl. irreguliere (5/8, 7/8, 11/4).

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

### Bug: Kwartnoot-tuplets — verkeerde maatindeling in weergave

soms klopt de plaatsing van noten niet op bladmuziek. Waarschijnlijke verkeerde attributie van de noten. voorbeeld:
4/4: [q q 3:2q | 3:2q,q q | q q q qr ]
wordt gerenderd als [q q 3:2q| 3:2q q | q q q q | qr ]
lijkt vooral te gebeuren met tuplets van kwartnoten.

[Han 2026-05-22 EXTRA VOORBEELD]: 4/4 [h 3:2q | (leeg) e q-dot | hr ] wordt gerenderd als [h 3:2q | e q-dot hr]. De bladmuziek is waarschijnlijk juist (audio komt overeen), maar de slot-toekenning klopt niet. Vermoeden: 3:2q (kwartnoot-triplet) wordt gerekend als 2 halve noten i.p.v. 2 kwarten in de slot-berekening. Alleszins gaat hier iets mis in de berekening van de ritmische slots.

> ⚠ Neem alvorens dit te implementeren een interview af bij Han.
[Claude 2026-05-21 ONDERZOEK]: Uitgebreid code-inspectie uitgevoerd. Tick-rekenkunde in `melodyGenerator.js` is correct (groupTicks = slotCount × timeScale; sub-noot-durations tellen altijd op tot groupTicks). `injectTuplets` genereert nooit maatgrens-overschrijdende tuplets. De `triplets`-bypass in `processMelodyAndCalculateSlots` (regel 158-165) herkent tuplet-noten correct.
**Twee kandidaat-oorzaken gevonden:**
1. **`totalDuration`-bug** (`processMelodyAndCalculateSlots.js` regels 119-123): `startRestDuration` wordt per-element opgeteld in de `reduce` i.p.v. eenmalig. Bij melodieën met een leidende rust → `totalDuration` te groot → trailing-rest-padding mist → maat-wisseling aan het einde. Reproductie: eerste noot niet op offset 0.
2. **Stapeling van meerdere tuplet-expansies** (`melodyGenerator.js` regels 507-582): twee opeenvolgende tuplets worden right-to-left verwerkt, dus indices blijven stabiel. Maar: bij `n - slotCount ≠ 0` (bijv. kwartnoottriplet in 8ste-resolutie: slotCount=4, n=3 → array krimpt met 1) verandert de lengte van `notes`/`offsets`/`triplets` na elke expansie. Als een tweede tuplet daarna `offsets.slice(idx + slotCount)` aanroept met een index die al verschoven is door de eerste expansie, kunnen de offsets van latere noten incorrect worden.
**Aanbevolen vervolgstap**: debug-logging toevoegen van `offsets` en `durations` vóór/ná elke tuplet-expansie in de `for (const tg of activeWinners)` loop om de cumulatieve telsom na meerdere expansies te verifiëren. Interview met Han nodig voor exacte reproduceer-stappen.

### Tuplets — visuele en notatie-bugs (Han 2026-05-22)

Verzameld in één blok, allemaal `⚠ Neem alvorens dit te implementeren een interview af bij Han.`:

- **Tuplet-cijfers overlappen met de notenbalk-lijnen** — forceer dat het cijfer (en ":m" als die wordt getoond) niet over de 5 lijnen van de balk valt. Plaatsing boven/onder afhankelijk van stem-richting.
- **Risico: tuplet-cijfers overlappen met lyrics-rij** (ta-ka-di-mi onder percussie). Bij tuplet boven percussie + Takadimi onder treble is dit minder relevant; bij tuplet onder treble + Takadimi op zelfde positie wel.
- ✅ **Maatnummers stijl-consistent met tuplet-cijfers** — beide gebruiken nu verschillende fonts/groottes. Han: graag in dezelfde stijl en kleur (zie volgend item).
  [Claude 2026-05-22]: Maatnummers nu Georgia/Times serif 15px (matcht tuplet). Bestand: `SheetMusic.jsx`.
- ✅ **Vermijd opacity in de bladmuziek** — de transitie-animatie maakt elementen donkerder (opacity verlaagt RGB-output op een donkere achtergrond). In plaats daarvan: een CSS-variabele `--text-lowlight` per theme (dark + light mode). Maatnummers en de ":m" van tuplets moeten dezelfde lowlight-kleur krijgen.
  [Claude 2026-05-22]: `--text-lowlight` toegevoegd voor default theme (`#8a8a8a`); bestond al voor nocturne/meridienne/light. Maatnummers (was `opacity:0.3`) en tuplet ":m" (was `color-mix transparent 55%`) gebruiken nu beide `var(--text-lowlight)` als fill. Geen opacity-stapeling meer tijdens crossfade. Debug-mode previewColor tinting blijft via color-mix met previewColor zoals voorheen. Bestanden: `App.css`, `SheetMusic.jsx`, `renderMelodyNotes.jsx`.
- ✅ **Tuplet-beugel iets breder** — nu loopt de beugel van het midden van de eerste tot het midden van de laatste tuplet-noot. Moet zijn: van de uiterste rand van de eerste tot de uiterste rand van de laatste noot.
  [Claude 2026-05-22]: Bracket-eindpunten verbreed met 6px aan elke kant (= half notehead-breedte bij fontSize=36). Bestand: `renderMelodyNotes.jsx`.
- **Edge case: parallel voicing in percussie + tuplets** — gedrag onduidelijk. ⚠ Interview met Han voor scope.
- **Tuplets > numMeasures × notes-per-measure verkeerd geteld** — vermoedelijk gerelateerd aan de slot-bug hierboven; bij tuplets is de totale noten-telling soms hoger dan verwacht.

### Percussie beams — schuine staan
[Han 2026-05-22]: De beams voor achtsten/zestienden zijn vaak schuin. Voor percussie is er geen melodie die omhoog/omlaag gaat, dus hoek heeft geen functie. Beperk de maximale hoek, of fixeer hem op horizontaal. Dit kan ook tuplets, dual-voice mode etc. leesbaarder maken.
> ⚠ Neem alvorens dit te implementeren een interview af bij Han.

### Rusten — beter balanceren
[Han 2026-05-22]: In gegenereerde melodieën zie ik veel herhaalde kwartrusten achter elkaar. Wil graag betere distributie / minder voorspelbaarheid. Mogelijk gerelateerd aan de variability-instelling.
> ⚠ Neem alvorens dit te implementeren een interview af bij Han.

### Feature: rusten binnen tuplets bij hogere variability
[Han 2026-05-22]: Op dit moment hebben tuplets altijd alle slots gevuld met noten. Bij hogere variability wil ik dat een deel van de tuplet-slots als rust gegenereerd kan worden. Hangt samen met tuplet-rendering in parallel-voices mode.
> ⚠ Neem alvorens dit te implementeren een interview af bij Han. Algoritme én notatie te bespreken.

### ✅ Bug: arp_group volgt variatie i.p.v. smallestNoteDenom
[Han 2026-05-22]: arp_group voldoet niet aan spec. Het algoritme volgt nu de variatie-instelling voor het vullen van groepen naar leidtonen, maar zou de `smallestNoteDenom` moeten volgen (= de gewenste rasterresolutie). Resultaat: groepen worden te dicht of te dun gevuld afhankelijk van variability i.p.v. de bedoelde rastergrootte.

[Claude 2026-05-26]: ✅ Geïmplementeerd in `src/generation/convertRankedArrayToMelody.js` (`arp_group` else-branch volledig herschreven). Stage 1: rank-walking met placeholder-rank voor inactieve slots, group-before fill, tie-break met longest-empty-stretch. Stage 2: per-line backwards-planning met random-span-containing-L. Bestaande `buildArpLine` uitgebreid met optionele `spanLow/spanHigh` overrides zodat arp_var ongewijzigd blijft. Test gerust met 4/4 + smallestNoteDenom=8 + variability=0 om te checken of de output nu eighth-noten-dichtheid heeft i.p.v. quarter-noten.

[Claude 2026-05-22]: Volledige spec uitgewerkt en gedocumenteerd in `docs/architecture.md` §27.5a (line-decomposition stage 1 met L/n algoritme), §27.5b (per-line backwards planning), §27.5c (edge cases — gelijkspel tie-break, alleen-root chord met enge span → kwint of herhaal vorige noot). Implementatie nog uit te voeren: `src/generation/convertRankedArrayToMelody.js` — vervang de variability-gestuurde grouping door de rank-walking algoritme (zie §27.5a worked example met [(1 7 5)(3 10)|(2 8 5)(4 9)]).

[Han 2026-05-25]: Voorbeelden vergeleken (arp_var boven, arp_group onder) — `4/4` `smallestNoteDenom=8` `variability=0`. arp_group genereert nu `(h)(q q)|(h)(q q)` maar zou `(h)(e e e e)|(w)()` moeten zijn. Drie deelvragen voor de fix:

**A) Worden de ranks correct samengevoegd voor het toekennen van L en n?**

Voor de groepering van de noten (de "0-variabiliteit baseline") verwacht Han dat eerst de prio's met `smallestNoteDenom` worden ingevuld:

```
ranks van rhythm-engine:     (1 5)(4 7) | (2 6)(3 8)
na invullen op smallestNoteDenom=8 (0-variability):
(1 9 5 9)(4 9 7 9) | (2 9 6 9)(3 9 8 9)
```

Daarna wordt L/n toegekend (stage 1, zie §27.5a). Test of arp_group de ranks al op de 8e-noten-grid ziet vóór toekenning.

**B) Worden L en n correct toegekend?**

Verwacht: één lijn per groep van 4 noten, eindigend in L. Voor het voorbeeld:

```
(L x x x)(n n n n) | (L x x x)(x x x x)
```

Han denkt dat er nu te veel L-noten zitten — de "toonladder" loopt niet door. Lijkt erop dat arp_group elke groep een eigen L geeft, terwijl het vul-algoritme (zie §27.5a) zou moeten resulteren in maar één L per cluster (en clusters lopen over groepen heen).

**C) Wordt de span correct bepaald?**

Concrete observatie: Han zag een potentiële span `[d5, e5]` terwijl range `[c4, e4]` en `maxLeap=octaaf`. Vermoeden: de span wordt berekend als `intersection(range, [L-12, L+12])` waardoor de werkelijke span veel smaller dan een octaaf wordt.

Spec-fix: zorg dat de span (waar mogelijk) altijd `maxLeap` breed is. Voor L=d5 met range `[c4, e4]` en maxLeap=octaaf: kies ofwel `[d4, d5]` of `[e4, e5]`, maar NIET `[f4, e5]` (of erger). Met andere woorden: schuif de span binnen de range zodat L erin past, en als de range groot genoeg is hou je de volle maxLeap-breedte.

### ✅ Bug & Verbetering: Tuplet-kansen en dichtheid

tuplet chance high zorgt voor ongeveer 100% tuplets. Balanceer de kansen.

het valt me op dat notes/measure 3 moet zijn voordat ik ooit een triplet zie - is het criterium om triplets te plaatsen misschien notes/measure, moet zijn: nummeasures*notes/measure.

het lijkt erop dat tuplets hun lengte/2 'kosten' in termen van aantal noten per maat. Dat is een goed criterium om ze te plaatsen, maar na plaatsing moet wel het correcte aantal noten van de beschikbare noten worden afgetrokken.

> ⚠ Neem alvorens dit te implementeren een interview af bij Han.
[Claude 2026-05-20]: ✅ Opgelost. Drie aanpassingen:
1. **Globale budget** (i.p.v. per-maat): `remainingBudget = notesPerMeasure × numMeasures` buiten de per-maat loop gedeclareerd; na elke geplaatste tuplet met `winner.n` verlaagd. Hierdoor worden de reeds gecommitteerde noten van latere tuplets afgetrokken — cross-maat densiteitscontrole.
2. **Power-law kansformule**: `tripletProb = min(0.85, (rhythmVariability/100) × 0.20 × (polyMultiplier/50)^1.3)`. Geeft: low(5)≈1%, med(15)≈5%, high(50)=20%, xtreme(200)≈66%. Was voorheen `min(1, variability/100 × 0.15 × polyMultiplier)` = 37.5% bij low(5) + variability=50 — veel te hoog.
3. **`tg.d` opgeslagen in TupletGroup**: entry.denominator gebruikte eerder `slotCount` wat voor k>1 (bijv. 3:2 triplet op 4 achtste-slots) het verkeerde label gaf ("3:4" i.p.v. "3:2"). Nu `tg.d` doorgegeven vanuit TUPLET_DEFS.
Bestanden: `src/generation/injectTuplets.js`, `src/generation/generateRankedRhythm.js`, `src/generation/melodyGenerator.js`.

### ✅ Verbetering: Tuplet-label uiterlijk

het label is lelijk. Er wordt nu een blokhaak gemaakt (perfect!) en een verhouding genoteerd (super!). zorg ervoor: de verhouding tus

de nummers: kun je een goed alternatief of zelfs hetzelfde font als maestro gebruiken? De getallen uit maestro zijn allemaal bold face, ik heb liever geen bold face hier (ook voor maatnummers)

de alignment: zorg dat het midden van de lijn (verticaal en horizontaal) mooi door het midden van de nummers gaat

de clipping: er zit een clipping achtergrond achter de nummer, om de lijn de onderbreken. Deze box is smaller dan de cijfers, waardoor de lijn en de cijfers overlappen.

da afstand, zorg dat de lijn en nummers iets verder van de noten af staan.

> ⚠ Neem alvorens dit te implementeren een interview af bij Han.
[Claude 2026-05-20]: ✅ Opgelost. Vier verbeteringen in `renderMelodyNotes.jsx` (tupletBracketElements):
1. **Afstand van noten**: ±5 → ±8 pixels (stemTipY offset).
2. **bracketGap** (ruimte in de lijn voor het getal): 15 → 20 pixels (40px totaal; genoeg voor "3 : 2" in 15px serif zonder overlap).
3. **Vetgedrukt**: `fontWeight="bold"` → `fontWeight="normal"`.
4. **Uitlijning**: `dominantBaseline="central"` toegevoegd + `y={bracketY}` (was aparte numY met ±2/±13 offset die tekst boven/onder de lijn plaatste i.p.v. erdoor).
Bestand: `src/components/sheet-music/renderMelodyNotes.jsx`.

### Klikzones & interactiviteit

✅ klikzone-audit accidentals: klikken op voortekens wisselt tonika naar enharmonische equivalent (bijv. F♯ ↔ G♭).

✅ klikzone-audit measure-nummers: maatlabels interactief — klikken springt naar die maat + stopt playback. Transparante hitbox + geel in settings-mode. onMeasureNumberClick prop op SheetMusic.

✅ accidentals klikken in bladmuziek wisselt naar enharmonische equivalent

[Claude 2026-04-09]: Geïmplementeerd — klik op ♯/♭ symbool vóór een noot wisselt de displayNote naar enharmonisch equivalent (F♯↔G♭ etc.) via ENHARMONIC_PAIRS. Speelt de noot NIET af (stopPropagation). Alleen displayNotes gewijzigd; audio-pitch (notes array) blijft ongewijzigd. Bestanden: renderMelodyNotes.jsx (onAccidentalClick param), SheetMusic.jsx (onNoteEnharmonicToggle prop + paginationOffset), App.jsx (handleNoteEnharmonicToggle). Aanname: alleen singlenoten (geen akkoorden); enharmonisch equivalent op basis van ENHARMONIC_PAIRS uit noteUtils.js.

✅ ### Bug: klikken op accidentaal vóór noot wisselt enharmonisch — moet alleen noot spelen

bug (backlog): clicking the accidental of a note in the sheet music changes the note to its enharmonic equivalent — this should only happen when clicking the accidental all the way at the beginning of the bar (key signature), not accidentals directly before notes. Clicking the accidental should just play the note (as if the note itself was clicked).

Dus: klik op ♯/♭ direct vóór een noot → speelt de noot af (zelfde gedrag als klikken op de noot zelf). Klik op voortekens in de sleutel / aan het begin van de maat → wisselt enharmonisch equivalent.

> ⚠ Neem alvorens dit te implementeren een interview af bij Han.
[Claude 2026-05-18]: Opgelost. Inline accidentalen (direct voor een noot) roepen niet langer `onAccidentalClick` aan — de click-handler en `stopPropagation` zijn verwijderd, zodat klikken op het voorteken omhoog borrelt naar de parent `<g data-notes>` en de noot afspeelt (identiek aan klikken op de nootkop zelf). De glow-highlight (`note-active` filter) is automatisch van toepassing op het voorteken omdat het een kind is van de `<g data-notes>`. Extra brede transparante `<rect>` (20×30px) toegevoegd als klikzone rond het voorteken. Sleutelvoortekens (begin van de maat, via `renderAccidentals()`) hebben een eigen handler en gedragen zich ongewijzigd. `onAccidentalClick`-prop verwijderd uit `renderMelodyNotes`; `trebleAccidentalClick`/`bassAccidentalClick` verwijderd uit `SheetMusic.jsx`. Bestanden: `renderMelodyNotes.jsx`, `SheetMusic.jsx`. Extra vereiste (Han 2026-05-18): bij herhaalde accidentalen feature — highlight het eerder-in-de-maat-getoonde accidentaal wanneer de noot actief is.

✅ ### Feature: Correcte accidentaal-weergave — herhaalde accidentalen en herstellingstekens

feature request (backlog): correct behaviour of accidentals: repeated accidentals and natural accidentals. The maestro letter for natural accidental is 'n'.

Vereist:
- Wanneer een noot in dezelfde maat al een voorteken had, maar de volgende versie van dezelfde noot geen voorteken heeft, toon dan een herstellingsteken (♮, Maestro letter 'n').
- Wanneer dezelfde geaccidenteerde noot herhaald wordt in dezelfde maat, hoeft het accidentaal niet herhaald te worden (tenzij er een noot zonder accidentaal tussenzit).
- Logica hoort in renderMelodyNotes.jsx, bijgehouden per maat via een accidentalState map.

> ⚠ Neem alvorens dit te implementeren een interview af bij Han.
[Claude 2026-05-18 v2]: Herzien na Han's correcties. Drie bugfixes t.o.v. v1: (1) Revert toont altijd het juiste symbool via `noteOwnAccidental()` — terug naar ♭ toont `b`, terug naar ♮ toont `n`, terug naar 𝄪/𝄫 toont `Ü`/`º`. (2) Cross-maat courtesy: als een noot in de vorige maat chromatisch gewijzigd was (CHROMATIC set), krijgt de eerste verschijning in de nieuwe maat een small-courtesy versie van het juiste symbool. (3) Revert sentinel `REVERTED` (Symbol) voorkomt dubbele 'b'-reminder voor opeenvolgende in-key noten. `SMALL_COURTESY` bevat nu ook `'º': 'Î'` (kleine courtesy double-flat) en `'Ü': ']'`.

### ✅ Bug: Overmatig gebruik van 8vb in de treblesleutel

bug (backlog): excessive use of 8vb in treble clef. Only use 8va and 8vb when MANY notes fall outside the standard range (not just single notes). A single note that falls outside C4–G5 should not trigger an 8va/8vb marking; only use it when a significant portion of the passage lies outside the staff range.

[Claude 2026-05-18]: Eerste poging fout — gebruikte `MIN_OTTAVA_NOTE_COUNT=3` als drempelwaarde. Oorzaak van het probleem was in feite dat alle RANGES in `calculateOptimalClef` 9 eenheden te hoog stonden (fout: C4=48, correct: C4=39 via `getNoteIndex`). Tweede fix: correcte rangewaarden + per-blok clef-selectie (gebruikt `currentTreble.notes` ipv volledige melodie) + vocale sleutels worden nooit 8va/8vb gegeven. `MIN_OTTAVA_NOTE_COUNT`-blok verwijderd uit `renderMelodyNotes.jsx`. Bestanden: `SheetMusic.jsx`, `renderMelodyNotes.jsx`.

✅ Noten en lyrics klikbaar (do-re-mi / takadimi spelen de noot/slag).

### Nootgroepering: geen splitsing over groepsgrenzen

note grouping - if a note spans multiple full note groups do not split across groups. (e.g., group (12)(34) with a full note at 1, can use a whole note, rather than two half notes).
this can be generalised: if the end of a note fits into a group, no splitting is needed: e.g., groups (12)(34), with a 3/4 note on 2 -> dotted half note.
however, if the note needs to be split anyway; prefer splitting on group lines. e.g.,
5/4 note with groups (12)(345) -> half + half-dot
but groups (123)(45) -> half-dot + half.

> ⚠ Neem alvorens dit te implementeren een interview af bij Han.
[Claude 2026-05-18]: Op de backlog gezet op verzoek van Han. Betreft de nootgroeperingslogica in `renderMelodyNotes.jsx` / `processMelodyAndCalculateSlots.js` — noten die over groepslijnen heen lopen worden gesplitst, maar dat is onnodig als de noot binnen één groep past of als de eindtick precies op een groepsgrens valt.
[Claude 2026-05-19]: Op verzoek van Han: "zou af moeten zijn" (Rule 1 in `processMelodyAndCalculateSlots.js` behandelt al het geval dat een noot exact op een groepsgrens eindigt). Controleren of dit volledig correct werkt voor alle maatsoorten.
[Claude 2026-05-20]: ✅ Geverifieerd via code-inspectie voor 3/4, 4/4, 6/8, 9/8, 5/4 [2,3] en [3,2]. Rule 1 (`endInMeasure === lastGroupEnd && allowedDurations.includes(remainingDuration)`) werkt correct in alle gevallen: halve noot op tel 1 in 4/4 (eindigt op maat-helft grens → heel blijven), gepunteerde halve in 3/4 (vult hele maat → heel), noot die groepsgrens in 5/4 nadert maar er niet op uitkomt (→ gesplitst via Rule 2). Geen verdere actie nodig.

### ✅ Bug: Beams renderen niet juist in parallel voices mode

bug (backlog) beams connecting stems for 8th notes and smaller renderen niet juist in parallel voices mode.

> ⚠ Neem alvorens dit te implementeren een interview af bij Han.
[Claude 2026-05-20]: ✅ Opgelost. Oorzaak: de beam sub-group loop in `renderMelodyNotes.jsx` had geen controle op stemrichting in parallel-voices mode. RH-noten (hi-hat, cymbals, woodblock — stem omhoog) en LH-noten (kick, snare, toms — stem omlaag) konden in dezelfde beam-groep belanden. Fix: `percussionVoiceSplit`-check toegevoegd in de beam-vorming loop; wanneer de stemrichting (`percussionStemUp`) verschilt tussen de laatste noot in de huidige groep en de nieuwe noot, wordt de groep geflushed (nieuwe beam-groep gestart). Bestand: `src/components/sheet-music/renderMelodyNotes.jsx`.

### ✅ Bug: Beams gaan over groepsgrenzen in 5/4

bug (backlog) beams connecting stems for 8th notes in 5/4, gaan over groepsgrenzen, resulterend in 10 achtsten aan elkaar - dat is niet leesbaar. Splits op groepsgrens.

> ⚠ Neem alvorens dit te implementeren een interview af bij Han.
[Claude 2026-05-20]: ✅ Opgelost. Oorzaak: `processMelodyAndCalculateSlots.js` retourneerde `rhythmicGrouping` niet in het return-object. Daardoor las `getAllowedSpans` in `renderMelodyNotes.jsx` altijd `null` en viel terug op de even-split fallback (bijv. [5] i.p.v. [2,3] of [3,2]). Fix: `rhythmicGrouping: melody.rhythmicGrouping ?? null` toegevoegd aan het return-object. Nu ontvangt `getAllowedSpans` de echte groepering en beperkt beam-spans tot de beat-groepsgrens. Bestand: `src/components/sheet-music/processMelodyAndCalculateSlots.js`.

### Bug: Span onjuist berekend voor tuplets

bug (backlog): span not calculated correctly for tuplets: e.g., 8va span but 3:2 eighths tuplet a5 f4 a6 - but a6 and f4 are further apart than 8 semitones.

> ⚠ Neem alvorens dit te implementeren een interview af bij Han.
[Claude 2026-05-18]: Op de backlog gezet op verzoek van Han. De span (afstand in halve tonen tussen de hoogste en laagste noot in een passus) lijkt niet correct te worden meegenomen bij de selectie van ottava-markering voor passages die tuplets bevatten.
[Claude 2026-05-19]: ⬇ GEEN REPRODUCED EXAMPLES — op verzoek van Han. Parkeer tot er een reproduceerbaar geval is.

### Weergave & layout

✅ startX op fixed position, en sleutel, maatsoort, accidentals verdelen over ruimte links daarvan. Maatsoort gecentreerd tussen laatste header-element en startX.

- oplossing voor veranderen van instellingen (num measure, maatsoort) die zorgen voor (tijdelijk) lelijke sheet music
[Claude 2026-05-19]: ⬆ NOG NIET OPGELOST — op verzoek van Han. Hoge prioriteit. Symptoom: bij het wijzigen van maatsoort of aantal maten verschijnt er tijdelijk misvormde bladmuziek. Oorzaak nog niet vastgesteld.

- meer regels bladmuziek op groter scherm; of op mobile horizontal wanneer de keys uitstaan
- optie om zowel bas als treble toetsen in beeld te hebben
- optie om geen bladmuziek in beeld te hebben
[Claude 2026-05-19]: ⬇ LAGE PRIORITEIT — op verzoek van Han. Samenvoegen met toekomstige UX/UI rehaul.

### Lyrics / Solfège

✅ Lyrics: pencil-off / music-2 / verwijder konnakol.

✅ tekst in bladmuziek: Konnakol verwijderd — KONNAKOL_TABLES, getKonnakolSyllable, groupNotesByMeasure verwijderd uit rhythmicSolfege.js; lyricsMode='konnakol' branch verwijderd uit SheetMusic.jsx.

✅ solfège voor akkoorden: alle noten gestapeld (laagste onderaan lyricsY, hogere gaan omhoog). Font 13px voor akkoorden vs 16px single. Klik speelt alle akkoordnoten tegelijk.

### Animatie

✅ ideal visible measures gebruikt in alle animatie-modi — hardcoded 3 vervangen door `idealVisibleMeasures` in App.jsx, berekend als `Math.max(2, Math.min(numMeasures, round((screenWidth - 70) / 120)))`. Aanname: ~120px per maat, 70px voor sleutel/voortekens. Minimum 2 maten (zodat altijd vorige+huidige zichtbaar is). Fallback in SheetMusic.jsx ook bijgewerkt van ?? 3 naar ?? 2.

- scroll mode: change bpm during animation...
[Claude 2026-05-19]: ⬆ NOG NIET OPGELOST — op verzoek van Han: "werkt nog niet goed". Scroll-animatie (constante-snelheid playhead) heeft nog problemen. Onderzoek nodig; interview voor reproduceerbare stappen.
✅ begin de animatie 0,5 maat later, en eindig ook 0,5 maat later (zodat de actieve noot op ongeveer 25% van startX - endX ligt.)

[Claude 2026-04-10]: Geïmplementeerd — scroll startTime/endTime verschoven met +0.5m op alle drie plaatsen in Sequencer.js: multi-measure last-rep (0.25→0.75), multi-measure non-last-rep (0.25→0.75), single-measure (start: -0.75→-0.25, end: +0.25→+0.75). Actieve noot staat nu langer stil op 25% gedurende de eerste maat voor de scroll begint te bewegen.

✅ animatiekleuren (geel en rood) enkel gebruiken in debugging mode.

[Claude 2026-04-09]: Geïmplementeerd — YCOL en RCOL in SheetMusic.jsx zijn nu `debugMode ? kleur : null`. In normale modus renderen de overlay-noten in standaard notenkleuren.

✅ fade out aan het einde van repeat block is niet goed. Check de specs / architectuurbeschrijving voor animaties en zorg dat er een mooie fade-out is; momenteel is de overgang tussen sequence blokken nog hakkelig.
[Claude 2026-05-10]: Oorzaak: `setTimeout(fn,0)` vuurt altijd vóór de volgende `requestAnimationFrame`. `setNextLayer(null)` triggerden `useLayoutEffect` terwijl de rAF-crossfade nog bezig was (bijv. old opacity 0.7). `useLayoutEffect` herstelde dan opacity naar 1 — zichtbare helderheidssprong. Fix: `iterStateMs` in Sequencer.js verhoogd met minimaal 25ms buffer, zodat de rAF de animatie kan afronden voordat `useLayoutEffect` de opacity wist. Bestand: `Sequencer.js`.

### Robuust animatie-systeem — post-PR-#27 stabilisatie (Han 2026-05-28)

[Claude 2026-05-28]: Han rapporteert na PR #27 drie regressies: (1) wipe lege notenbalken, (2) lang pagination 2× hard cut na 1×, (3) 1-frame flashes bij fade-overgangen. Han's verzoek: *"Maak een robuust plan voor de animaties; failsafe. Leg uit hoe je de blokken van de scroll animatie plant."*

Volledig plan opgeslagen in `/root/.claude/plans/animaties-in-de-bladmuziek-pure-ocean.md`. Han heeft alle 3 tiers in één PR goedgekeurd ("alles samen"). Geschat 7–10 dagen werk.

**Tier 1 — directe regressies (1 dag)**:
- 1.1: Bundel `setNextLayer` + `setIterInCurrentSeries` in één setTimeout-callback (Sequencer.js ~500/508) → fixt bug 3 (1-frame flash).
- 1.2: Bundel scroll-mode `setStartMeasureIndex` + `setIsOddRound` + `wipeRoundBatched` in één callback → reduceer wipe race-window.
- 1.3: Force-cleanup van `transitionRef`/`paginationFadeRef` bij elke nieuwe arm-call → fixt bug 2 (2e hard cut).
- 1.4: Expliciete `pregenResult` lifecycle: nieuwe `pregenStateRef` met `{melody, validForBoundary, generatedAt}`; bij arm verificatie van `validForBoundary === expectedBoundary` voordat verbruikt wordt.
- 1.5: TransitionOverlayContext: split `iterInCurrentSeries` uit value-useMemo (eigen context of ref) → fixt bug 1 (wipe lege staves).

**Tier 2 — robustness zonder rewrite (1–2 dagen)**:
- 2.1: Single `useSheetMusicTransitions`-source-of-truth voor opacity setting (alleen rAF; nooit JSX).
- 2.2: applyResultToSetters → één React batch via `unstable_batchedUpdates` waar nodig.
- 2.3: Sanity-watchdog: rAF-tick logt warn als opacity mismatch met expected stage > 100ms.
- 2.4: Memory/MEMORY.md update: documenteer "Two setTimeouts at same delay are NOT batched".

**Tier 3 — fundamentele AnimationPlan-redesign (5–7 dagen)**:
- 3a: `src/audio/AnimationPlan.js` — pure datastructure `{events: [{type, atSec, payload}]}` voor één hele transitie (visual-flip / repeat-flip / series-flip).
- 3b: `src/audio/PlanRunner.js` — rAF-driven runner, single source of truth voor opacity + DOM-attrs.
- 3c–3e: Wipe → scroll → pagination omschakelen naar plan-driven rendering.
- 3f: Cleanup van oude refs (`transitionRef`, `paginationFadeRef`, `scrollTransitionRef`, `wipeTransitionRef`).
- 3g: `docs/architecture.md` §11 + backlog-entry sluiten.

**Afhankelijke files** (raken expliciet de "WORK IN PROGRESS" lijst bovenaan deze BACKLOG.md): `src/audio/Sequencer.js`, `src/App.jsx`, nieuwe `src/audio/AnimationScheduler.js`. Daarom heeft de cloud-agent vandaag **NIET geïmplementeerd** maar enkel het plan vastgelegd. Run werd schoon afgebroken — geen branch-push, geen PR. Wacht tot het in-progress notice opgeheven is, of tot Han expliciet groen licht geeft om door de WORK-IN-PROGRESS-gate heen te gaan.

**Separaat openstaand bug-onderzoek** (niet onderdeel van bovenstaande PR):
- Critical: sheet-music regressie na song-load. Symptoom moet eerst gereproduceerd worden (Han: "tweede sheet-music regression komt vaker voor na het laden van een song"). Diagnose-fase eerst, fix daarna in eigen branch + PR.

---

### Pagination redesign — vervolgwerk (na PR #26)

[Claude 2026-05-22]: Pagination animatie is herontworpen rond `src/audio/transitionPlanner.js` (pure planner) + `Sequencer._armPaginationSequence` (event-driven scheduler). 3 variants (snel/mid/lang) togglebaar in subheader cycle. Visual-flip, repeat-flip en series-flip gebruiken nu hetzelfde crossfade-mechanisme. Lang variant overshoot 0.25m voorbij block-einde (speler ziet oude noten nog kort terwijl nieuwe verschijnen). JIT generatie loopt mee met variant-deadline.

[Han 2026-05-22]: Bedoeling van de zichtbaarheidsregels tijdens de fade — **per laag, niet samengevoegd**:
- Oude laag: huidig blok met huidig-blok's zichtbaarheidsregels (oddRounds/evenRounds van de huidige iter).
- Nieuwe laag (overlay): nieuw blok met nieuw-blok's zichtbaarheidsregels.
- Tijdens de fade smelten deze visueel samen — een onzichtbare ronde dissoolveert dus zacht in een zichtbare ronde, niet via een harde flip.

[Claude 2026-05-22]: Geïmplementeerd via `previewMelody._roundKey` die scheduler bij arm-time vastlegt op basis van boundary-type:
- `visual-flip`: zelfde iter → zelfde round
- `repeat-flip`: volgende iter → tegenovergestelde round
- `series-flip`: nieuwe sequence block iter 0 → altijd `oddRounds`

SheetMusic gebruikt `previewMelody._roundKey` zodat de overlay's visibility niet meebeweegt met React's `isOddRound`-state (die op atTick flipt en anders de overlay tijdens de lang-variant overshoot van zichtbaarheid zou laten omschakelen).

Open items uit de redesign:

- **Stream-mode** (vervangt huidige scroll): continue scroll R→L met dynamisch `visibleMeasures = clamp(2, idealVisible, repeatBlockSize)`. 1-maats sequence block: meerdere vooruit-generaties. Nog niet geïmplementeerd.
- **Rubato-mode** (audio + visueel volgen speler): basisimplementatie via `useInputTest.onNoteCorrect`. Nog niet geïmplementeerd.
- **Rubato fallback: blind-play modus** — wanneer noten onzichtbaar zijn (gehoortraining), tijdsbescherming tegen oneindig wachten. Auto-stretch naar normale BPM na N misses, of "geef hint" mode. Han: "zet maar op de backlog en doe eerst het basisontwerp." (2026-05-21)
- **Pagination variant per preset** — variant-keuze (snel/mid/lang) zou onderdeel van preset-systeem moeten zijn.
- **Wipe-animatie als alternatief voor pagination-mid** — iter 2 (Han: "in een tweede iteratie wil ik de crossfade van tweede type vervangen voor een animatie die de noten opveegt, van links naar rechts"). Wipe blijft voorlopig een aparte mode op het legacy pad.
- **Chord progression preview bij visual-flip / repeat-flip** — toont nu de eerste N akkoorden van de huidige melodie i.p.v. die van de nieuwe pagina. Noten zelf renderen wel correct (pre-sliced). Geen audio-impact.
- **Pagination scheduler: BPM-change tijdens fade** — iter 2 edge case (Han 2026-05-22). De huidige scheduler ticks→seconds conversie gebruikt de BPM op het moment van armen. BPM-wijziging mid-fade laat de planner-events op de oude conversie staan tot de volgende sequence block.
- **Pagination scheduler: long-press voor variant-keuze** — op dit moment cycle door snel/mid/lang/wipe/scroll. Iter 2: long-press op de PAG-knop opent een gs-popup met 3 expliciete variant-keuzes (en daarnaast separate WIPE/SCROLL knoppen).
- **Pagination scheduler: preview vs applied melody mismatch** (Han 2026-05-25). Verklaring nog niet rond — de scheduler-log toont `previewBms` consequent +2 per blok (kloppend) maar Han ziet soms een melodie in de overlay die NIET overeenkomt met wat daarna afgespeeld wordt. Verdacht: misschien geeft een user-interactie tussen JIT en outer-loop-apply een nieuwe generatie, of er is een race waar pregenResult tussen arm en outer wordt overschreven. Vraagt reproduceerbaar voorbeeld om dieper te debuggen — bij gelegenheid `localStorage.LOG_LEVEL='debug'` en de pagArm-logs delen.

### Performance — frame drops bij continuous playback (Han 2026-05-25)

Han: "Als continuous playback loopt duurt alles te lang." DevTools Lighthouse-meting tijdens playback:

- **LCP** = 3.34 s (poor; target < 2.5 s)
- **CLS** = 0.00 (good)
- **INP** = 696 ms (poor; target < 200 ms) — gebruiker-interacties hebben bijna 700ms latency

DevTools-trace analyse (~16 sec sample tijdens playback):
- **React renders (`performWorkUntilDeadline`) = 250–411 ms** per cycle, meerdere keren per seconde.
- **`useSheetMusicHighlight` rAF tick = 263 ms** in één frame — 16 frames gemist op 60fps.
- **AdBlock extensie** (`webext-ad-filtering-solution`) ~135ms × 10 calls = 1.35s background CPU (Han's eigen Chrome-omgeving; niet onze code).
- Top hotspot: react-dom_client.js reconciliation = 5s totaal over de sample.

Hypotheses voor de animatie-haperingen (vermoedelijk dezelfde root cause):
1. **`SheetMusic.jsx` is een monoliet**: ~2500 regels, re-rendert bij ELKE state change (currentMeasureIndex, isOddRound, nextLayer, previewMelody, melodies, …). Bij elke render worden `processMelodyAndCalculateSlots`, `calculateAllOffsets`, `getChordsWithSlashes`, en de preview-overlay's eigen layout opnieuw berekend.
2. **Geen `useMemo`-bescherming** op de duurste delen (note rendering, accidental maps, offset arrays).
3. **Preview overlay rendert per frame opnieuw** — pmAllOffsets, previewTreble/bass/perc, etc. worden per render herberekend.
4. **rAF-loop iteert per frame over `scheduledMeasures` / `scheduledNotes` / `scheduledChords`** voor highlighting — die arrays groeien tijdens playback.

Acties voor backlog (vraagt interview voor scope/prioriteit):
- **Memoize `SheetMusic.jsx`-children** via `React.memo` + selectieve props.
- **Splits SheetMusic op** in OLD-layer (vrij stabiel) en NEW-overlay (vrij stabiel) sub-componenten met eigen memoization.
- **`useMemo` op `processMelodyAndCalculateSlots` / `calculateAllOffsets`** — heronderzoek dependencies (waarschijnlijk meeste re-renders krijgen identieke inputs).
- **rAF-loop**: prune `scheduledMeasures` / `scheduledNotes` agressiever (nu 2s window), of gebruik binary search / sorted insertion.
- **Inspecteer of er onnodige Context providers** zijn die ALLE consumers laten re-renderen bij minor state changes (bv. PlaybackStateContext bij elk currentMeasureIndex tick).

> ⚠ Performance-werk vraagt interview met Han om de prioritering, scope en acceptatiecriteria af te stemmen. Han noemde: na animatie eerste prio.

### Bug: click anywhere should close settings overlay (Han 2026-05-25)
Eenderwaar klikken (behalve op responsieve knoppen / settings-elementen zelf) moet de settings overlay sluiten. Op dit moment moet je specifiek buiten een knop maar binnen de "klik-vrije" zone klikken — soms niet intuïtief.

### Header — split play button

[Han 2026-05-22]: Ik wil de play-knop in de header opsplitsen in twee acties:
- **Play (huidig)** — speelt de laatst gegenereerde melodie nog eens af.
- **Start genereren** — genereert direct een nieuwe melodie.

⚠ Neem alvorens dit te implementeren een interview af bij Han. Vragen die nog open zijn: wat is precies "de laatste melodie" in continuous play vs. once mode, hoe verhoudt dit zich tot de Next/Prev navigatie, en moet het visueel één knop met twee zones of twee aparte iconen worden?

### Startup screen & tooltips

[Han 2026-05-22]: Twee losse items op de longlist:
- **Startup screen** — een eerste-keer-gebruik intro die de belangrijkste UI-zones uitlegt (eerst nog scope te bepalen via interview).
- **Tooltips** — hover/long-press tooltips op alle iconen in header en subheader, met korte uitleg van wat ze doen.

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

### Actief instrument highlight

Visueel aangeven welk instrument momenteel 'actief' is — d.w.z. het instrument dat momenteel afspeelt of het meest recent door de gebruiker geselecteerd is. Gedacht aan een subtiele glow, randhighlight of achtergrondkleur op de InstrumentRow of het bijbehorende blok in de generator settings.

### Unieke look & feel: tweekleurige achtergrond + Thronefall-achtige nootshadow

Tweekleurige achtergrond: bijv. een split bovenaan/onderaan of een diagonale overgang tussen twee compacte kleuren (vergelijkbaar met Thronefall's aardse palet). Thronefall-esque schaduw: noten in de bladmuziek krijgen een harde, enigszins verschoven drop-shadow (2D perspectief-effect), in contrast met de huidige glow/blur-gebaseerde highlight. Dit kan de bladmuziek een heel eigen stijl geven.
[Claude 2026-05-21]: Twee losse sub-features: (1) achtergrond-kleurovergang — CSS-variabelen aanpassen of een gradient-laag achter de SheetMusic SVG; (2) harde noot-shadow — SVG `<filter>` met `feDropShadow` met nul blur en een vaste offset (bijv. 2px rechts, 3px onder) voor de notenkoppen. Sub-feature (2) past goed bij de bestaande `note-glow` filterinfrastructuur in `SheetMusic.jsx`. Interview nodig vóór implementatie (kleurkeuze, schaduwrichting/-kleur, welke elementen de schaduw krijgen).

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
[Claude 2026-05-19]: → LONGLIST. Op verzoek van Han.

- custom chord progressions of zelfs hele liederen (e.g., jazz standards)
[Claude 2026-05-19]: ⬆ SHORTLIST — op verzoek van Han. Interview nodig. Toevoegen: verschillende moeilijkheidsgraden / stijlen. Samenvoegen met item #32 (bestaande liedjes). Twee aparte features: (1) bestaande liedjes, (2) eigen invoer. Eigen invoer op LONGLIST. Nieuwe aparte feature: akkoord/drum-sequencer → samen met eigen invoer (LONGLIST).

- chord progression 'puzzels' met weergave kwintencirkel (vaag idee)
[Claude 2026-05-19]: → LONGLIST.

✅ - notatie voor romeinse cijfers in intermodaal: e.g. bII bVII.
[Claude 2026-05-19]: ⬆ SHORTLIST — op verzoek van Han.
[Claude 2026-05-20]: VOORSTEL (zie sessie-antwoord). Samenvatting: gebruik ♭/♯ als prefix op de Romein op basis van semitoonpositie t.o.v. de majeur-toonladder. ♭II = Napolitaans (diatonisch in Frygisch, geleend in mineur) — NIET specifiek Lydisch. Lydisch-kenmerk is ♯IV. ♭VII = subtonica (diatonisch in Mixolydisch/Dorisch/Aeolisch). Implementatie: in `chordGenerator.js` een `CHROMATIC_ROMAN_PREFIX`-lookup (semitonen 0–11) toevoegen die ♭/♯ berekent t.o.v. majeur. `normalizeNoteChars` al beschikbaar voor display-conversie. Interview nodig vóór implementatie.
[Claude 2026-05-21]: ✅ Geïmplementeerd. `getChromaticRomanDegree(semitone)` toegevoegd aan `noteUtils.js` — mapt semitoonafstand van tonica op Romein met Unicode ♭/♯ prefix (0→I, 1→♭II, 3→♭III, 6→♯IV, 8→♭VI, 10→♭VII, 11→VII). `generateChordOnDegree` in `chordGenerator.js` gebruikt dit nu voor `romanBaseRaw` zodat alle modale akkoorden (Frygisch ♭II, Mixolydisch ♭VII, enz.) correct worden gelabeld in chord grid én bladmuziek. `FUNCTION_CATEGORY` bijgewerkt voor alle 12 chromatische graden. ASCII `bII` in ChordGrid.jsx vervangen door `♭II`. Progressieselector-labels omgezet naar `^n`-Arabisch (bijv. "Pop Song (^1-^5-^6-^4)").

- In notatie werkelijke unicode voortekens gebruiken ipv b en #. (bladmuziek én chord grid). Logica checken op consistentie met muziektheorie.

✅ Jazz Random toegevoegd: random ii–V–I cadences met wisselende resolutiepunten (I, ii, IV, vi). Strategie: 'jazz-random' in progressionDefinitions + chordGenerator.

✅ de labels in progression selector: ik wil graag de namen zoals ze in de lijst staan (dus bijvoorbeeld JAZZ SONG moet worden Jazz (...ii-V-I)).
Alle namen moeten zijn van de vorm: naam (nummers).
De titel 'JAZZ SONG' is wel belangrijk, deze wordt gebruikt in de header.

[Claude 2026-04-14 12:30]: Opgelost. Twee wijzigingen:

1. `TypeSelectorOverlay.css` — `text-transform: uppercase` verwijderd op `.tso-btn`. Oorzaak: Romeinse cijfers dragen semantiek in hun case (`ii` = mineur, `V` = majeur); uppercase vernietigde die informatie. Comment toegevoegd om regressie te voorkomen.
2. `progressionDefinitions.js` — alle `label`-velden genormaliseerd naar vorm "naam (numerals-met-hyphens)". `Jazz Song (... ii V I)` → `Jazz (...ii-V-I)` volgens voorbeeld; andere predetermined progressies kregen hyphens tussen graden (Pachelbel, Pop Song, Pop Ballad, Doo-Wop, Cadential, Andalusian Cadence, Classical Cadence, Jazz Random). De `shortLabel`-velden zijn ongewijzigd — `getProgressionLabel()` retourneert nog steeds `shortLabel` dus de header blijft "Jazz Song" / "JAZZ SONG" tonen.

### Passing chords

-> passing chords: notatie bV7/ii in Römeinse cijfers
[Claude 2026-05-19]: Staat open — interview nodig. Op verzoek van Han.

-> harmoniseren settings passing chords in generator settings en in chord grid view

-> visualisatie van passing chords
[Claude 2026-05-19]: ⬇ LAGE PRIORITEIT — op verzoek van Han.

-> betere visualisatie van akkoordenprogressie (bijv. pijlen wanneer de sequencer uitstaat)
[Claude 2026-05-19]: ⬇ LAGE PRIORITEIT — op verzoek van Han.

Nieuwe logica voor passing chords (voor meer balans): Wanneer Passing chords aanstaan: probeer elke maat een akkoord uit de progressie te geven: kies de slot het meest dicht bij de eerste tel van een maat met afstandsregels: minimum van (slotrank + afstand tot maatstart *2) (net als bepalen van beat en backbeat --- zorg dat je zeker deze logica hergebruikt!!)
Alle andere akkoorden die zijn ingevuld worden ingevuld door passing chords.

[Claude 2026-04-08]: Geïmplementeerd — structuralCount = 1 (altijd 1 progressie-akkoord per maat, bij beat 1 via MelodyGenerator rank+2×distance proxy). insertPassingChords vult de resterende chordCount-1 slots met passing chords. Aanname: MelodyGenerator met notesPerMeasure=1 + rhythmVariability=0 plaatst altijd het akkoord op slot 0 (beat 1, hoogste rank). De proximityUtils.findBestSlot formule (rank + 2×afstand) is de bestaande logica die dit bewerkstelligt.

✅ bug! In de generator settinsg, chords / measure = 2,passing chords actief: bijna 4 akkoorden per maat! Fout in berekening.

[Claude 2026-04-14 13:15]: Opgelost. Drie gerelateerde fouten in het samenspel tussen `useMelodyState` en `Sequencer`:

1. **Dubbele passing-chord invoeging bij continuous playback.** `useMelodyState.randomizeAll()` produceert een Melody met N structurele + N passing = 2N chords. Bij latere Sequencer-ticks (continuous playback) werd deze Melody als `notePool` doorgegeven aan een nieuwe `MelodyGenerator`-ronde. Omdat de notePool al passing chords bevatte, werden die als "structureel" behandeld en daarna draaide `insertPassingChords` er een tweede keer bovenop → per maat 2× zoveel chords als verwacht (~4 i.p.v. 2). Fix in [Sequencer.js:1074](src/audio/Sequencer.js#L1074): notePool nu gefilterd op `!c.meta?.isPassing` wanneer gevallen terug wordt op `chordProgression.displayNotes` (Melody-pad). Het `chordProgression.chords`-pad (verse ChordProgression) blijft ongewijzigd.
2. **Inconsistente `structuralCount` tussen useMelodyState en Sequencer.** [useMelodyState.js:61](src/hooks/useMelodyState.js#L61) (generateChords, bepaalt lengte van abstracte progressie-pool) gebruikte `Math.max(1, Math.ceil(chordCount / 2))` terwijl [useMelodyState.js:158](src/hooks/useMelodyState.js#L158) (randomizeAll, bepaalt MelodyGenerator `notesPerMeasure`) al `1` gebruikte. Voor chordCount > 2 werd dus de helft van de abstracte progressie weggegooid. Beide plekken nu consequent `1`.
3. **Sequencer had dezelfde inconsistentie.** [Sequencer.js:981](src/audio/Sequencer.js#L981) en [Sequencer.js:1065](src/audio/Sequencer.js#L1065) gebruikten beide `Math.ceil(density / 2)`. Beide aangepast naar `1` zodat alle drie de sites overeenkomen.

Invariant: wanneer `passingChords !== 'none'`, altijd **precies 1 structurele chord per maat**, overal — in de progressie-pool-lengte, in MelodyGenerator's `notesPerMeasure`, én in de gefilterde notePool die Sequencer hergebruikt. Dit matcht de hardcoded `structuralCount = 1` in [passingChords.js:316](src/generation/passingChords.js#L316).

### Bug: Verkeerde noot gegenereerd bij passing chords (geparkeerd — wacht op reproduceerbaar voorbeeld)

bug: progression with passing chords accidental/note mistake:
|| G | F#7 || Bdim | D7 || (|| = maatgrens, | = groepsgrens)
notes: || xxx | f# xx || f(#) x x | x f# ||
probleem: de f# voor Bdim heeft een courtesy sharp (#). Zou een courtesy neutral (n) moeten zijn. Bij afspelen klinkt inderdaad f#; moet f zijn.

[Claude 2026-05-19 16:00]: Onderzocht. Bevindingen:

**Hypothese 1 (wrongful courtesy accidental) — gefalsifieerd.**
Een courtesy `#` op een noot kan enkel verschijnen als de noot-string letterlijk `F♯` bevat. `computeAccidental('F4', scaleAccidentals)` in C groot retourneert altijd `'n'` (herstellingsteken), nooit `'#'`. De courtesy `#` bewijst dus dat de opgeslagen noot wél F♯ is — de weergave is correct voor de verkeerde noot.

**Hypothese 2 (verkeerde chord in opzoeklogica) — waarschijnlijk oorzaak, niet bevestigd.**
In C groot zit F♯ niet in de toonladder; de `'scale'`-pool kan F♯ dan ook niet leveren. F♯ moet dus komen uit een `'chord'`-pool die de verkeerde chord retourneert. Vermoedelijke oorzaak: `getActiveChord` retourneert F#7 i.p.v. Bdim voor dat slot via de offset-gebaseerde lookup in `convertRankedArrayToMelody.js`. Exacte trigger (floating point, off-by-one bij passing chord boundary, of misalignment in `chordOffsetEvents`) kon niet worden vastgesteld zonder reproduceerbaar voorbeeld.

**Wat te onderzoeken zodra er een reproduceerbaar geval is:**
- Welk instrument / notePool toonde de fout (treble = 'scale', bas = 'chord')?
- Log `chordOffsetEvents` en `slotOffset` voor het betreffende slot om te zien welke chord werd teruggegeven.
- Controleer of de Bdim event-offset in de Melody exact overeenkomt met `slotIndex * ticksPerSlot`.

[Claude 2026-05-19]: ⬇ GEPARKEERD — wacht op reproduceerbaar voorbeeld met screenshot/settings.

### Akkoord-taxonomie

✅ - nakijken of taxonomie volledig is
[Claude 2026-05-19]: ⬆ SHORTLIST — op verzoek van Han. Toevoegen: extra passing chord types. Interview nodig voor gewenste uitbreiding.
[Claude 2026-05-20]: VOORSTEL (zie sessie-antwoord). Huidige typen: secondary-dominant (V7/x), secondary-dim (vii°7/x), tritone-sub (♭II7/x), diatonic. Ontbrekende categorieën op basis van muziektheorie:
1. **Subdominant approach (IV/x)** — zachte voorbereiding via kwart-stap omhoog; veel gebruikt in pop/gospel. Makkelijk toe te voegen als 4e type.
2. **Borrowed minor chords** — ♭VI, ♭III uit parallelle mineurtoonladder als passing kleur; al deels gedekt via diatonic-chain maar niet geëxpliciteerd.
3. **Augmented sixth (It+6, Ger+6)** — klassieke chromatische passing chords; zeldzaam, hoge moeilijkheidsgraad. Complexer om te implementeren.
Prioriteit: (1) eerst implementeren, (2) daarna bekijken, (3) longlist.
[Claude 2026-05-21]: ✅ Geïmplementeerd. Twee nieuwe typen toegevoegd aan `chordGenerator.js` → `generatePassingChord()`:
- **`subdominant-approach` (IV/x)**: wortel een reine kwart boven doel-akkoord. Diatonische kwaliteit wanneer de wortel in de huidige ladder zit, anders majeur drieklank. Label: `IV/x`.
- **`borrowed-parallel`**: willekeurig akkoord gebouwd op een graad die WEL in `heptaRefIntervals` zit maar NIET in de huidige ladder (modal mixture). Werkt automatisch voor exotische ladders (bijv. dubbel harmonisch majeur). Label: chromatisch Romein van de geleende graad + `/x`.
UI: stepper (none/secondary-dominant/all) vervangen door 7 afzonderlijk schakelbare chips in InstrumentRow col 6. Setting opgeslagen als `passingChordTypes: string[]` (was: `passingChords: string`). Augmented sixth (It+6, Ger+6) → LONGLIST (vereist apart interview).

### Muziektheorie (akkoorden)

Zorg dat notatie, en progressielogica, akkoorden strookt met muziektheorie. bijvoorbeeld:
<https://musictheory.pugetsound.edu/mt21c/MusicTheory.html>
<https://method-behind-the-music.com/theory/notation/>

✅ ### Bug: 'Next' knop genereert geen nieuwe akkoorden

bug (backlog): when clicking 'next' in the header, no new chords are being generated.

> ⚠ Neem alvorens dit te implementeren een interview af bij Han.
[Claude 2026-05-19]: ✅ Resolved — op verzoek van Han. chordProgression verplaatst naar useMelodyState history.

✅ ### Issue: Akkoorden respecteren beats en backbeats niet

issue (backlog): chords should also respect the beats and backbeats. both with normal and passing chord settings.

De chord-plaatsing via MelodyGenerator gebruikt rank+2×afstand (proximityUtils.findBestSlot). Beats en backbeats hebben hogere ranks vanwege rhythmicDNA-prioritering. Toch lijkt de chord-positie soms niet overeen te komen met de beat/backbeat-logica van het drum-patroon. Kan ook samenhangen met backbeat_2: het is onduidelijk of chord-generatie dezelfde grouping gebruikt als de percussie.

> ⚠ Neem alvorens dit te implementeren een interview af bij Han.
[Claude 2026-05-19]: ✅ Resolved — op verzoek van Han. insertPassingChords gebruikt nu sharedGrouping (zelfde als percussie en treble/bas).

---

## MELODIE / BASS

### Generatie

- muzikale random generation setting, die muzikaal logische lijnen maakt
[Claude 2026-05-19]: → LONGLIST (generation overhaul). Op verzoek van Han.

✅ - walking bass setting, die walking bass maakt
[Claude 2026-05-19]: → LONGLIST (generation overhaul). Op verzoek van Han.
[Claude 2026-05-21]: ✅ Geïmplementeerd als `randomizationRule = 'walking_bass'` in `src/generation/convertRankedArrayToMelody.js` (sectie 2.6). Eerste actieve slot = root (gepint), laatste slot = approach-noot richting volgende chord-root, middelste slots via backwards planning (`buildArpLine`). Approach-karakter via bestaande `randomizationNotes` pool: 'chord' = power/close approach, 'scale' = diatonische leidtoon, 'chromatic' = ±1 halve toon (jazz). Ritmedichtheid via `rhythmVariability`. Respects passing chords via `chordOffsetEvents`. `buildArpLine` gehost naar module-scope (gedeeld met arp_var/arp_group). UI: 'walk'-familie toegevoegd aan `RULE_FAMILIES`, Footprints-icoon in `InstrumentRow`, toggle-cycle uitgebreid. Label 'Walking Bass' in `labelUtils.js`.

✅ - verbetering van arpeggio mode voor chords/scales: start bij root/tonica; juiste afhandeling in range cut-off
[Claude 2026-05-19]: ⬆ SHORTLIST — hoge prioriteit op verzoek van Han. Interview nodig voor exacte vereisten.
[Claude 2026-05-20]: Ontwerp volledig uitgewerkt in overleg met Han (mei 2026). Twee subtypes gespecificeerd: `arp_var` (rhythm-variability-aware) en `arp_group` (beat-group-aware met backwards planning, landing notes, kaats/spring boundary modes). Volledige specificatie inclusief voorbeelden: docs/architecture.md §27. Implementatie nog niet gestart — interview per §4b CLAUDE.md vereist voor aanvang.
[Claude 2026-05-20]: ✅ Bevestigd door Han: "ik denk dat dit af is!" `arp_var` en `arp_group` zijn geïmplementeerd in `src/generation/convertRankedArrayToMelody.js` (regels 263–390) met backwards planning, landing notes en kaats/spring boundary modes.

✅ - akkoord mode: kans op akkoorden (milde versie van 'full chord') -> genereer uniform willekeurig maar nu paren van noten uit de melody notes set die is ingesteld. Idee: pak één noot uit het 'akkoord' en één noot uit de notenset. beperkingen: maximum afstand is een octaaf. Bij 'mislukt' genereer gewoon één noot uit de notenset.
[Claude 2026-05-19]: ⬆ SHORTLIST — op verzoek van Han. Interview nodig voor exacte vereisten.
[Claude 2026-05-20]: ✅ Bevestigd door Han: "paren van noten is geïmplementeerd." Geïmplementeerd als `pairedchord`-modus. TODO (backlog): (a) controleer of chord modes `maxLeap`-beperking respecteren; (b) bepaal logica voor omleggingen (inversions).

- akkoord mode: simpele akkoorden / omleggingen
Maak uniform + scale een stuk 'duurder' dan arp.
Voeg nog weighted chromatic toe als extreem moeilijk.
[Claude 2026-05-19]: → LONGLIST (generation overhaul).

- het concept van zwaartetonen en leidnoten verder uitwerken, ook toepassen bij akkoorden (bijv: akoord - leidnoot)
[Claude 2026-05-19]: ⬆ SHORTLIST — op verzoek van Han.

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
[Claude 2026-05-16]: Standaard voor treble en bas ingesteld op 12 (octaaf) i.p.v. `null` (onbeperkt). `InstrumentSettings.defaultTrebleInstrumentSettings()` en `defaultBassInstrumentSettings()` — constructor-aanroep uitgebreid met `transpositionKey='C'` en `maxLeap=12`.

### UI overhaul generator settings (PlaybackSettings)

De generator-instellingen zijn rommelig geworden naarmate er meer kolommen zijn bijgekomen (SPAN, TUPLETS). Een volledige UI-revisie is nodig: betere kolom-breedte verdeling, labels die kloppen, mogelijkheid voor per-instrument uitklappen, consistent lettertype/spacing. Niet implementeren totdat de feature-set stabiel is.

[Claude 2026-05-16]: Toegevoegd op verzoek van Han — NIET implementeren, alleen op de backlog bewaren.

### Overig

- 'humanization' in afspelen van de muziek: volume en timing
[Claude 2026-05-19]: → LONGLIST (generation overhaul + difficulty settings). Op verzoek van Han.

- herbalanceren variability (misschien wortel nemen van percentage voor genuanceerder effect?)
[Claude 2026-05-19]: → LONGLIST (generation overhaul). Op verzoek van Han.

### Rusten en staccato in treble en bass melody

rusten en staccato in treble en bass melody

[Claude 2026-05-19]: Op de backlog gezet op verzoek van Han. Betreft het toevoegen van rusten en staccato-articulatie als gegenereerde notenwaarden in de treble- en basmelodie. Niet implementeren totdat Han dit activeert.

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
[Claude 2026-05-19]: → LONGLIST — op verzoek van Han.

- betere percussie, e.g., backbeat, claves; revisie van rythmische slots

✅ - parallele percussielijnen: RH LH // cymbalen, kick/snare
[Claude 2026-05-19]: ⬆ SHORTLIST — op verzoek van Han.
[Claude 2026-05-20]: ✅ Bevestigd door Han: "gedaan, maar nog bugs. markeer voltooid, bugs staan gelogd." Bekende bugs zijn al gelogd in de backlog onder "Bugs percussie / playback" en "Bug: Beams renderen niet juist in parallel voices mode".

- triolen, polyritmiek en paradiddels

- voorkomen dat men 3 handen of 3 voeten nodig heeft

- meer drumstijlen: <https://rhythmnotes.net/drumming-styles/>
[Claude 2026-05-19]: → LONGLIST (generation overhaul) — op verzoek van Han.

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
[Claude 2026-05-19]: ⬆ SHORTLIST — op verzoek van Han: "Kodaly aanpassen aan groepen". Doel: lettergrepen afgestemd op beat-groepen (bijv. 3+2 in 5/4 → juiste lettergreepsyllaben per groep).
[Claude 2026-05-21]: Scope bijgesteld o.b.v. Hoffman, Pelto & White (1996). Kodaly (do-re-mi toonhoogte-solfège) voorlopig laten vallen. Uitsluitend Takadimi (ritmisch solfège) afmaken voor asymmetrische maatsoorten.

**Scope: Takadimi beat-group awareness (asymmetrische maatsoorten)**

De artikelregel die ontbreekt: "Switching from one division type to another requires a change from 'Ta-ki-da' to 'Ta-di' or vice versa" — d.w.z. elke beat-groep bepaalt of de subdivisies *simple* of *compound* zijn.

Wat de app nu doet (fout voor asymmetrisch):
- `getTakadimiSyllable` gebruikt één vaste `beatDuration` voor de hele maat.
- In 5/8 [2+3] behandelt het alle achtsten hetzelfde → verkeerde syllaben voor de 3-groep.

Wat correct is (artikel §Application 1, Fig. 10):
- Groep van 2 eenheden = **simple beat**: ta | di  (subdivisie: ta ka di mi)
- Groep van 3 eenheden = **compound beat**: ta | ki | da  (subdivisie: ta va ki di da ma)

Voor 5/8 [2, 3], eenheid = achtste:
- Offset 0 → **ta** (groep 1 start)
- Offset 1 → **di** (positie 1 van 2 = simple mid-beat)
- Offset 2 → **ta** (groep 2 start)
- Offset 3 → **ki** (positie 1 van 3 = compound div 1)
- Offset 4 → **da** (positie 2 van 3 = compound div 2)

"di" = altijd het midden van de beat (syncs simple ÷2 en compound ÷3 — artikel Fig. 7).

**Implementatieplan (nog niet uitvoeren — interview vereist):**
1. Nieuwe functie `getTakadimiSyllableGrouped(measureOffset, rhythmicGrouping, unitTicks)` in `rhythmicSolfege.js`:
   - Bepaal voor `measureOffset` welke groep (index, grootte, positie-binnen-groep).
   - Groepgrootte 2 → simple syllaben; groepgrootte 3 → compound syllaben.
   - Subdivisies (halvering van de eenheid) volgen hetzelfde patroon.
2. In `SheetMusic.jsx` Takadimi-renderingloop: gebruik `getTakadimiSyllableGrouped` wanneer `rhythmicGrouping` aanwezig is én maatsoort asymmetrisch is (niet 4/4, 3/4, 6/8, etc.).
3. Symmetrische maatsoorten vallen terug op de bestaande `getTakadimiSyllable` (ongewijzigd).

**Betrokken bestanden:** `src/theory/rhythmicSolfege.js`, `src/components/sheet-music/SheetMusic.jsx`.
**Scope:** Alleen rhythmische solfège. Melodische solfège (do-re-mi) is losgekoppeld en valt buiten deze taak.

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

## GAMIFICATION & FEEDBACK

### Session progress bar, XP, levels & badges

session progress bar, xp bar, levels, badges

[Claude 2026-05-19]: Op de backlog gezet op verzoek van Han. Betreft een gamificatielaag: sessie-voortgangsbalk, XP-punten per goed gespeelde noot/maat, levels op basis van opgebouwde XP, en badges voor mijlpalen (bijv. "eerste 100 noten", "5 sessies voltooid"). Niet implementeren totdat Han dit activeert.

### Auditieve feedback

auditive feedback (dream: 'sparkles/chimes'; vocal feedback: "nice!" "beautiful!" - with temperaments. (e.g., SCREAMING!).

[Claude 2026-05-19]: Op de backlog gezet op verzoek van Han. Betreft auditieve beloning bij goede input: korte chime/sparkle-effecten én stemgeluid-feedback met instelbaar temperament (rustig enthousiast t/m uitbundig schreeuwerig). Niet implementeren totdat Han dit activeert.

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

---

## PRESETS / OEFENINGEN

Verzameling van voorgestelde presets (combinaties van instellingen). Nog niet geïmplementeerd — dienen als inspiratie voor het preset-systeem.

### Schaalloopjes (Scale Runs)
- notePool: `scale`, randomizationType: `arp_group`
- akkoordenprogressie: klassieke cadens (I–IV–V–I of ii–V–I)
- smallestNoteDenom: 8 (achtsten) of 16 (zestienden)
- notesPerMeasure: hoog (bijv. 6–8 per maat)
- variability: laag (voorspelbare loopjes)
- maxLeap: klein (octaaf of minder)
- Doel: toonladders oefenen, aanvalstechniek, vingervlugheid

### Gebroken Akkoorden (Broken Chords)
- notePool: `chord`, randomizationType: `arp_group`
- akkoordenprogressie: vrij te kiezen
- smallestNoteDenom: 8
- notesPerMeasure: middel (4–6 per maat)
- variability: laag–middel
- Doel: akkoordbewust spelen, greepposities verkennen

### Vingervlugheid (Dexterity)
- notePool: `scale` of `chromatic`, randomizationType: `arp_var`
- smallestNoteDenom: 16
- notesPerMeasure: maximaal
- variability: middel–hoog
- maxLeap: klein (secunde of terts)
- Doel: snelheid, techniek

### Syncope / Polyritme
- notePool: `chord` of `scale`, randomizationType: `arp_var`
- smallestNoteDenom: 16
- variability: hoog
- timeSignature: 5/4, 7/8 of 3/4
- Doel: ritmisch gevoel, syncope, off-beat-accenten

### Gehoortraining (Ear Training)
- notePool: `chord`, randomizationType: `uniform`
- playbackSettings: Round 1 = alleen muziek, Round 2 = muziek + noten
- variability: laag
- Doel: noten en akkoorden herkennen op gehoor

### Bladmuziek (Sight-reading)
- notePool: `scale`, randomizationType: `weighted`
- playbackSettings: Round 1 = noten zichtbaar, geen audio; Round 2 = audio
- variability: middel
- Doel: van blad spelen oefenen

[Claude 2026-05-20]: Presets toegevoegd op basis van ontwerpgesprek over arp_var / arp_group (mei 2026). Specificaties voor arp_var en arp_group staan in docs/architecture.md §27. Implementatie vereist eerst afronding van arp_var/arp_group algoritmen + preset-selectie UI.
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
