"""携帯ゲームのドット絵の画像（PNG / GIF）を読み、16x16 のドット（文字列）に変換して色を塗る。

外部ライブラリ不要。Pillow が入っていれば JPG など他の形式も読める。
  - 拡大された画像でも、1ドットの大きさを自動で見つけて元のドットに戻す
  - 暗いドット＝輪郭として残し、輪郭に囲まれた明るいドットを体の色で塗る
  - アニメーション GIF なら、各コマをそのまま使う
"""
import os
import struct
import zlib


# ------------------------------------------------------------
# 画像の読み込み（RGBA のピクセル配列のリストを返す。1枚＝1コマ）
# ------------------------------------------------------------
def read_png(path):
    with open(path, "rb") as fp:
        data = fp.read()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("PNG ではありません")
    pos, idat, plte, trns = 8, b"", None, None
    while pos < len(data):
        n, t = struct.unpack(">I4s", data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + n]
        pos += 12 + n
        if t == b"IHDR":
            w, h, depth, ctype, _, _, inter = struct.unpack(">IIBBBBB", body)
        elif t == b"PLTE":
            plte = [tuple(body[i:i + 3]) for i in range(0, len(body), 3)]
        elif t == b"tRNS":
            trns = body
        elif t == b"IDAT":
            idat += body
    if inter:
        raise ValueError("インターレースの PNG には対応していません")
    ch = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ctype]
    bits = ch * depth
    bpp = max(1, bits // 8)
    stride = (w * bits + 7) // 8
    raw = zlib.decompress(idat)
    rows, prev, p = [], bytearray(stride), 0
    for _ in range(h):
        ft, line = raw[p], bytearray(raw[p + 1:p + 1 + stride])
        p += 1 + stride
        for i in range(stride):
            a = line[i - bpp] if i >= bpp else 0
            b = prev[i]
            c = prev[i - bpp] if i >= bpp else 0
            if ft == 1:
                line[i] = (line[i] + a) & 255
            elif ft == 2:
                line[i] = (line[i] + b) & 255
            elif ft == 3:
                line[i] = (line[i] + (a + b) // 2) & 255
            elif ft == 4:
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                line[i] = (line[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append(line)
        prev = line

    def samples(line):
        if depth >= 8:
            step = depth // 8
            return [line[i] for i in range(0, len(line), step)]
        out = []
        for byte in line:
            for k in range(8 // depth):
                out.append((byte >> (8 - depth * (k + 1))) & ((1 << depth) - 1))
        return out

    px = []
    for line in rows:
        s = samples(line)
        row = []
        for x in range(w):
            if ctype == 3:
                i = s[x]
                r, g, b = plte[i]
                a = trns[i] if trns and i < len(trns) else 255
            elif ctype == 0:
                v = s[x] * 255 // ((1 << depth) - 1)
                r = g = b = v
                a = 255
            elif ctype == 4:
                r = g = b = s[2 * x]
                a = s[2 * x + 1]
            else:
                r, g, b = s[ch * x:ch * x + 3]
                a = s[ch * x + 3] if ch == 4 else 255
            row.append((r, g, b, a))
        px.append(row)
    return [px]


def _lzw_decode(data, min_size):
    clear, eoi = 1 << min_size, (1 << min_size) + 1
    size, table = min_size + 1, [bytes([i]) for i in range(clear)] + [b"", b""]
    out, prev, buf, nbits, pos = bytearray(), None, 0, 0, 0
    while True:
        while nbits < size and pos < len(data):
            buf |= data[pos] << nbits
            nbits += 8
            pos += 1
        if nbits < size:
            break
        code = buf & ((1 << size) - 1)
        buf >>= size
        nbits -= size
        if code == clear:
            size, table, prev = min_size + 1, table[:clear + 2], None
            continue
        if code == eoi:
            break
        if prev is None:
            entry = table[code]
        elif code < len(table):
            entry = table[code]
            table.append(prev + entry[:1])
        else:
            entry = prev + prev[:1]
            table.append(entry)
        out += entry
        prev = entry
        if len(table) == (1 << size) and size < 12:
            size += 1
    return bytes(out)


def read_gif(path):
    with open(path, "rb") as fp:
        data = fp.read()
    if data[:3] != b"GIF":
        raise ValueError("GIF ではありません")
    w, h, flags = struct.unpack("<HHB", data[6:11])
    pos, gct = 13, None
    if flags & 0x80:
        n = 3 * (2 << (flags & 7))
        gct = [tuple(data[pos + i:pos + i + 3]) for i in range(0, n, 3)]
        pos += n
    canvas = [[(255, 255, 255, 0)] * w for _ in range(h)]
    frames, trans, disposal = [], None, 0
    while pos < len(data):
        b = data[pos]
        if b == 0x3B:
            break
        if b == 0x21:
            label = data[pos + 1]
            pos += 2
            if label == 0xF9:
                pf = data[pos + 1]
                disposal = (pf >> 2) & 7
                trans = data[pos + 4] if pf & 1 else None
            while data[pos]:
                pos += data[pos] + 1
            pos += 1
            continue
        if b != 0x2C:
            break
        x0, y0, fw, fh, ff = struct.unpack("<HHHHB", data[pos + 1:pos + 10])
        pos += 10
        ct = gct
        if ff & 0x80:
            n = 3 * (2 << (ff & 7))
            ct = [tuple(data[pos + i:pos + i + 3]) for i in range(0, n, 3)]
            pos += n
        min_size = data[pos]
        pos += 1
        blob = bytearray()
        while data[pos]:
            blob += data[pos + 1:pos + 1 + data[pos]]
            pos += data[pos] + 1
        pos += 1
        idx = _lzw_decode(bytes(blob), min_size)
        order = list(range(fh))
        if ff & 0x40:  # インターレース
            order = list(range(0, fh, 8)) + list(range(4, fh, 8)) + list(range(2, fh, 4)) + list(range(1, fh, 2))
        before = [row[:] for row in canvas]
        for r, y in enumerate(order):
            for x in range(fw):
                i = r * fw + x
                if i < len(idx) and idx[i] != trans and 0 <= y0 + y < h and 0 <= x0 + x < w:
                    canvas[y0 + y][x0 + x] = ct[idx[i]] + (255,)
        frames.append([row[:] for row in canvas])
        if disposal == 2:
            for y in range(y0, min(h, y0 + fh)):
                for x in range(x0, min(w, x0 + fw)):
                    canvas[y][x] = (255, 255, 255, 0)
        elif disposal == 3:
            canvas = before
        trans, disposal = None, 0
    return frames


def read_image(path):
    ext = os.path.splitext(path)[1].lower()
    try:
        if ext == ".png":
            return read_png(path)
        if ext == ".gif":
            return read_gif(path)
    except ValueError:
        pass
    try:
        from PIL import Image, ImageSequence
    except ImportError:
        raise SystemExit(f"{path}: PNG か GIF にしてください（他の形式は Pillow が必要です）")
    im = Image.open(path)
    out = []
    for fr in ImageSequence.Iterator(im):
        fr = fr.convert("RGBA")
        out.append([[fr.getpixel((x, y)) for x in range(fr.width)] for y in range(fr.height)])
    return out


# ------------------------------------------------------------
# ピクセル → ドット
# ------------------------------------------------------------
def _dark_mask(px):
    lum = [[(0.3 * r + 0.59 * g + 0.11 * b) if a > 127 else None for r, g, b, a in row] for row in px]
    vals = [v for row in lum for v in row if v is not None]
    if not vals:
        return [[False] * len(px[0]) for _ in px]
    lo, hi = min(vals), max(vals)
    cut = (lo + hi) / 2
    return [[v is not None and v < cut for v in row] for row in lum]


def _sample(mask, rows, cols):
    h, w = len(mask), len(mask[0])
    dots = []
    for r in range(rows):
        y0, y1 = r * h // rows, max((r + 1) * h // rows, r * h // rows + 1)
        line = []
        for c in range(cols):
            x0, x1 = c * w // cols, max((c + 1) * w // cols, c * w // cols + 1)
            cell = [mask[y][x] for y in range(y0, y1) for x in range(x0, x1)]
            line.append(sum(cell) * 2 > len(cell))
        dots.append(line)
    return dots


def _error(mask, dots):
    h, w, rows, cols = len(mask), len(mask[0]), len(dots), len(dots[0])
    return sum(mask[y][x] != dots[y * rows // h][x * cols // w] for y in range(h) for x in range(w))


def to_dots(px, size=16):
    """画像を、暗い=True のドット配列（size x size、下ぞろえ・中央寄せ）にする。

    1ドットの大きさは、ドット数を 1〜size で試して、元の画像をいちばん忠実に再現できるものを選ぶ。
    """
    mask = _dark_mask(px)
    ys = [y for y, row in enumerate(mask) if any(row)]
    xs = [x for x in range(len(mask[0])) if any(row[x] for row in mask)]
    if not ys:
        raise SystemExit("暗いドットが見つかりません")
    mask = [row[xs[0]:xs[-1] + 1] for row in mask[ys[0]:ys[-1] + 1]]
    h, w = len(mask), len(mask[0])
    best = None
    for n in range(1, size + 1):  # 長いほうの辺のドット数
        pitch = max(h, w) / n
        rows, cols = max(1, round(h / pitch)), max(1, round(w / pitch))
        if rows > size or cols > size:
            continue
        dots = _sample(mask, rows, cols)
        err = _error(mask, dots)
        if best is None or err < best[0]:
            best = (err, dots)
    dots = best[1]
    rows, cols = len(dots), len(dots[0])
    left = (size - cols) // 2
    return [[False] * size for _ in range(size - rows)] + \
           [[False] * left + line + [False] * (size - cols - left) for line in dots]


def colorize(grid, body="O", outline="K", glint="W"):
    """輪郭に囲まれた明るいドットを body で塗り、文字列の行にする（外側は '.'）。

    上下左右を輪郭に囲まれた1ドットだけの明るい点（目の光など）は glint（白）にする。
    """
    n = len(grid)
    outside = [[False] * n for _ in range(n)]
    stack = [(y, x) for y in range(n) for x in (0, n - 1)] + [(y, x) for x in range(n) for y in (0, n - 1)]
    while stack:
        y, x = stack.pop()
        if 0 <= y < n and 0 <= x < n and not outside[y][x] and not grid[y][x]:
            outside[y][x] = True
            stack += [(y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)]
    def is_glint(y, x):
        return all(0 <= y + dy < n and 0 <= x + dx < n and grid[y + dy][x + dx]
                   for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)))

    return ["".join(outline if grid[y][x] else "." if outside[y][x] else glint if is_glint(y, x) else body
                    for x in range(n)) for y in range(n)]


def load_sprite(path, body="O", size=32):
    """画像ファイルから、色付きドット絵（size x size の文字列の行）のコマのリストを返す。"""
    frames = read_image(path)
    out = []
    for px in frames:
        rows = colorize(to_dots(px, size), body)
        if rows not in out:
            out.append(rows)
    return out
