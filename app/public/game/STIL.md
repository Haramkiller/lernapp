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
