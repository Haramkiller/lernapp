"""Bereitet PixelLab-Exporte für public/game vor (nur zur Bauzeit, braucht Pillow).

  python slice_assets.py fx <sheet.json> <sheet.png> <ziel-ordner> <name>
      Schneidet ein Effekt-Spritesheet (Aseprite-JSON) in <name>_<i>.png;
      jedes Bild wird so erweitert, dass der Ankerpunkt in der Bildmitte liegt.

  python slice_assets.py boss <character.zip> <ziel-ordner> idle=<anim> attack=<anim> hit=<anim>
      Holt die Süd-Bilder der genannten Animationen aus dem Charakter-ZIP und legt alle
      mittig auf eine gemeinsame Leinwand (sonst springt der Boss beim Wechsel der Animation).

  python slice_assets.py foot <größe> <ziel.png> <quelle.png>
      Pflanzen/Bäume: auf quadratische Leinwand <größe>, Fuß (unterste Pixel) unten mittig.

  python slice_assets.py flap <größe> <ziel-ordner> <name> <quelle.png>
      Insekten: 4 Bilder Flügelschlag durch waagerechtes Stauchen (100/70/35/70 %).
"""
import io
import json
import re
import sys
import zipfile
from pathlib import Path

from PIL import Image


def fx(json_path: str, png_path: str, out: str, name: str) -> None:
    meta = json.loads(Path(json_path).read_text(encoding="utf-8"))
    sheet = Image.open(png_path).convert("RGBA")
    frames = meta["frames"] if isinstance(meta["frames"], list) else list(meta["frames"].values())
    crops, pivots = [], []
    for f in frames:
        r = f["frame"]
        crops.append(sheet.crop((r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"])))
        p = f.get("pivot", {"x": 0.5, "y": 0.5})
        pivots.append((p["x"] * r["w"], p["y"] * r["h"]))
    half_w = max(max(px, c.width - px) for c, (px, _) in zip(crops, pivots))
    half_h = max(max(py, c.height - py) for c, (_, py) in zip(crops, pivots))
    w, h = int(round(half_w * 2)), int(round(half_h * 2))
    Path(out).mkdir(parents=True, exist_ok=True)
    for i, (c, (px, py)) in enumerate(zip(crops, pivots)):
        canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        canvas.paste(c, (int(round(w / 2 - px)), int(round(h / 2 - py))))
        canvas.save(Path(out) / f"{name}_{i}.png", optimize=True)
    print(f"{name}: {len(crops)} Bilder, {w}x{h}")


def boss(zip_path: str, out: str, mapping: dict[str, str]) -> None:
    z = zipfile.ZipFile(zip_path)
    names = z.namelist()
    anims: dict[str, list[Image.Image]] = {}
    for target, anim in mapping.items():
        pat = re.compile(rf"(^|/)animations/{re.escape(anim)}/south/frame_(\d+)\.png$")
        files = sorted((n for n in names if pat.search(n)), key=lambda n: int(pat.search(n).group(2)))
        if not files:
            sys.exit(f"Animation '{anim}' (south) nicht im ZIP. Vorhanden: " + ", ".join(sorted({n.split('/animations/')[1].split('/')[0] for n in names if '/animations/' in n})))
        anims[target] = [Image.open(io.BytesIO(z.read(n))).convert("RGBA") for n in files]
    w = max(im.width for ims in anims.values() for im in ims)
    h = max(im.height for ims in anims.values() for im in ims)
    Path(out).mkdir(parents=True, exist_ok=True)
    for target, ims in anims.items():
        for i, im in enumerate(ims):
            canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
            canvas.paste(im, ((w - im.width) // 2, (h - im.height) // 2))
            canvas.save(Path(out) / f"{target}_{i}.png", optimize=True)
        print(f"{target}: {len(ims)} Bilder")
    print(f"Leinwand {w}x{h}")


def foot(size: str, out: str, src: str) -> None:
    n = int(size)
    im = Image.open(src).convert("RGBA")
    im = im.crop(im.getbbox())
    if im.width > n or im.height > n:
        im.thumbnail((n, n), Image.NEAREST)
    canvas = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    canvas.paste(im, ((n - im.width) // 2, n - im.height))
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out, optimize=True)


def flap(size: str, out: str, name: str, src: str) -> None:
    n = int(size)
    im = Image.open(src).convert("RGBA")
    im = im.crop(im.getbbox())
    Path(out).mkdir(parents=True, exist_ok=True)
    for i, f in enumerate((1.0, 0.7, 0.35, 0.7)):
        w = max(2, round(im.width * f))
        frame = im.resize((w, im.height), Image.NEAREST)
        canvas = Image.new("RGBA", (n, n), (0, 0, 0, 0))
        canvas.paste(frame, ((n - w) // 2, (n - im.height) // 2))
        canvas.save(Path(out) / f"{name}_{i}.png", optimize=True)
    print(f"{name}: 4 Bilder, {n}x{n}")


if __name__ == "__main__":
    cmd, *args = sys.argv[1:]
    if cmd == "fx":
        fx(*args)
    elif cmd == "boss":
        zip_path, out, *pairs = args
        boss(zip_path, out, dict(p.split("=", 1) for p in pairs))
    elif cmd == "foot":
        foot(*args)
    elif cmd == "flap":
        flap(*args)
    else:
        sys.exit(__doc__)
