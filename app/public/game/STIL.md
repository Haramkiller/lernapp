# Grafikstil (freigegeben am 2026-11-20)

Vom Nutzer freigegebener Stil-Entwurf: Moosgolem auf einer Waldlichtung, Treffer- und Combo-Effekt.

## Bosse
- PixelLab `create_character`, Modus v3, `size: 128`, `view: low top-down`, `detail: high detail`, `outline: selective outline`; verwendet wird nur die Süd-Ansicht (Blick zum Betrachter).
- Beschreibung: „fantasy boss: …“ mit Gesicht und Persönlichkeit, Rüstungs-/Schmuckteilen, gedeckte natürliche Palette mit einem leuchtenden Akzent (Augen/Runen).
- Animationen alle im Modus v3 (Vorlagen zeichnen kleiner und sind teils fehlerhaft):
  - `idle`: 4 Bilder, schweres ruhiges Atmen
  - `attack`: 6 Bilder, holt aus und schlägt nach vorn auf den Betrachter zu
  - `hit`: 4 Bilder, wird getroffen, taumelt zurück, fängt sich
  - Leinwand 172×172; mit `app/scripts/slice_assets.py boss` auf gemeinsame Leinwand gebracht.
- In der App: Angriff zusätzlich mit kleinem Ausfallschritt nach vorn (CSS-Skalierung).

## Kulissen
- `create_image_pro`, 192×256, `no_background: false`: Ort des Bosses auf Augenhöhe, freie Fläche in der Mitte, Rahmen aus Elementen links/rechts, Dämmerungslicht, gedeckte Palette, keine Figuren.

## Effekte
- `vfx_workbench`, 12–16 fps, Einzelbilder mit `slice_assets.py fx` (Ankerpunkt mittig).
- `hit`: blaue Klinge (slash_trail) + oranger Funkenstern (hit_star)
- `combo3`: drei feurige Hiebe (combo_slash, fire) + Lichtblitz (flash_burst) + Funken (cooling_sparks)

## Szenen (Teil 2, freigegeben am 2026-11-21)
- `create_image_pro`, 192×256, `no_background: false`, Dämmerung (lila Himmel, oranger Sonnenuntergang), Glühwürmchen, gedeckte Palette, keine Figuren, keine Schrift.
- **Titelbild** (`title.png`): Glashaus mit Glaskuppel und weißem Eisenrahmen am Waldrand, warm von innen beleuchtet, kleines Lagerfeuer im Vordergrund, freier Himmel oben für den Namen (kommt als Text darüber).
- **Waldplatz** (`camp/backdrop.png`): derselbe Ort wie die Feuerstelle im Titelbild (Titelbild als Referenzbild): Steinring ohne Flammen auf zertrampeltem Boden, **keine Baumstämme oder Sitzgelegenheiten**, Kiefern links/rechts, Blick über ein Tal mit Bergen. Szenen müssen zueinander passen (Nutzerwunsch).
- **Lagerfeuer** (`camp/fire_<i>.png`): `vfx_workbench`, Vorlage `flame` (Breite 30, Höhe 40, 9 Glutfunken), 8 Bilder, 10 fps, Schleife; mit `slice_assets.py fx` zerlegt, Bildmitte = Fuß der Flammen.

## Karte (Teil 2)
- **Karte** (`map/map.png`): `create_image_pro` 192×256, gemalte Fantasy-Karte auf Pergament, Wald oben links, Sumpf oben rechts, Kristallberge Mitte links, Küste Mitte rechts, Arena unten links, Vulkan unten rechts, Kompassrose, keine Schrift.
- **Regions-Symbole** (`map/<region>.png`) und **Nebel** (`map/fog_0.png`, `fog_1.png`): `create_1_direction_object`, 64 px, 16 Kandidaten in einem Aufruf (gleicher Stil). Auf der Karte stehen nur Fähnchen und Nebel; die Symbole erscheinen im Region-Detail.
