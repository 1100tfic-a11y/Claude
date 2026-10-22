#!/usr/bin/env python3
"""art/ にあるキャラの画像を小さくして、src/char-images.js に埋めこむ

使い方：
  1. キャラの画像を art/ に置く（ファイル名 = src/chars.js の id。例：art/c01.png）
  2. python3 tools/add_chars.py
  3. node src/build.js   → gacha.gs ができる

画像は 1辺 MAX_SIZE ピクセル以内に縮め、WebP（透明はそのまま）にします。
"""
import base64
import io
import pathlib
import re
import sys

from PIL import Image

MAX_SIZE = 320
QUALITY = 85
ROOT = pathlib.Path(__file__).resolve().parent.parent
ART = ROOT / 'art'
OUT = ROOT / 'src' / 'char-images.js'
EXTS = {'.png', '.jpg', '.jpeg', '.webp', '.gif'}


def main():
    ids = re.findall(r"\{\s*id:\s*'([A-Za-z0-9_-]+)'", (ROOT / 'src' / 'chars.js').read_text(encoding='utf8').split('var LIST', 1)[1])
    files = {p.stem: p for p in sorted(ART.iterdir()) if p.suffix.lower() in EXTS} if ART.exists() else {}
    lines, total = [], 0
    for cid in ids:
        p = files.get(cid)
        if not p:
            continue
        im = Image.open(p)
        im = im.convert('RGBA') if im.mode in ('RGBA', 'LA', 'P') else im.convert('RGB')
        im.thumbnail((MAX_SIZE, MAX_SIZE), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, 'WEBP', quality=QUALITY, method=6)
        data = base64.b64encode(buf.getvalue()).decode('ascii')
        total += len(data)
        lines.append("  '%s': 'data:image/webp;base64,%s'" % (cid, data))
        print('  %-8s %s → %dx%d %dKB' % (cid, p.name, im.width, im.height, len(data) // 1024))
    missing = [c for c in ids if c not in files]
    extra = [s for s in files if s not in ids]
    OUT.write_text(
        '// キャラの画像（tools/add_chars.py で art/ から自動で作っています。手で書きかえないでください）\n'
        'var CHAR_IMAGES = {\n' + ',\n'.join(lines) + '\n};\n', encoding='utf8')
    print('%s を作成しました：%d体・約%dKB' % (OUT.relative_to(ROOT), len(lines), total // 1024))
    if missing:
        print('画像がまだ無いキャラ（仮の絵で表示）：' + ', '.join(missing))
    if extra:
        print('chars.js に無いので使わなかった画像：' + ', '.join(extra), file=sys.stderr)


if __name__ == '__main__':
    main()
