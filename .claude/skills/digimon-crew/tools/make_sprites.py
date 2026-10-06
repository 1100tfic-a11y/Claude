#!/usr/bin/env python3
"""digimon-crew 用の「作業中のデジモン」アニメーション（GIF）を書き出す。

外部ライブラリ不要（標準ライブラリだけで GIF / PNG を書く）。
  python3 .claude/skills/digimon-crew/tools/make_sprites.py
で ../images/<デジモン名>.gif（動く版）と .png（止まった版）を作り直す。

場面：デジモンが机のノートPCに向かってタイピングしている。画面にはコードが流れ、
      進捗バーが伸びて、最後にチェックが付く。頭の上には技のエフェクトが立ちのぼる。
デジモンの絵は digimon_art.py（32x32・図形の組み合わせ）。すべてオリジナル。
images/custom/sprites/<デジモン名>.png|gif に携帯ゲームのドット絵を置くと、
それを使った版を images/custom/<デジモン名>.gif に作る（GitHub には上がらない）。
"""
import glob
import os
import struct
import sys
import zlib

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import digimon_art  # noqa: E402
import vpet_import  # noqa: E402

W, H = 80, 48         # 場面のドット数
SCALE = 5
FRAMES = 8
DELAY = 18            # 1/100 秒単位
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "images")
CUSTOM_DIR = os.path.join(OUT_DIR, "custom")
SPRITE_DIR = os.path.join(CUSTOM_DIR, "sprites")  # ここに置いたドット絵は GitHub に上がらない

INK = (34, 30, 42)

# デジモン名, 紋章の色, 技のエフェクト, 体の色（取り込んだドット絵を塗る色）
CREW = [
    ("agumon", (250, 150, 50), "flame", (250, 168, 40)),     # 勇気
    ("gabumon", (70, 130, 230), "frost", (214, 232, 252)),   # 友情
    ("piyomon", (230, 70, 80), "heart", (246, 128, 168)),    # 愛情
    ("tentomon", (150, 90, 210), "spark", (214, 48, 48)),    # 知識
    ("palmon", (90, 190, 90), "petal", (110, 196, 88)),      # 純真
    ("gomamon", (130, 130, 150), "bubble", (240, 242, 250)),  # 誠実
    ("patamon", (235, 190, 40), "star", (238, 156, 66)),     # 希望
    ("tailmon", (240, 120, 180), "ray", (250, 250, 252)),    # 光
]

# 床から持ち上げる高さ（ゴマモンは木箱の上、パタモンは飛んでいる）
LIFT = {"gomamon": 6, "patamon": 4}

# 技のエフェクト（3x3）
FX = {
    "flame": ([".R.", "RYR", ".R."], {"R": (240, 80, 30), "Y": (255, 220, 80)}),
    "frost": (["B.B", ".W.", "B.B"], {"B": (110, 180, 255), "W": (220, 240, 255)}),
    "heart": (["R.R", "RRR", ".R."], {"R": (240, 70, 110)}),
    "spark": (["Y..", ".Y.", "..Y"], {"Y": (240, 200, 30)}),
    "petal": ([".P.", "PYP", ".P."], {"P": (246, 130, 186), "Y": (250, 210, 60)}),
    "bubble": ([".B.", "B.B", ".B."], {"B": (90, 170, 240)}),
    "star": ([".Y.", "YYY", ".Y."], {"Y": (240, 196, 30)}),
    "ray": (["Y.Y", ".W.", "Y.Y"], {"Y": (240, 200, 60), "W": (255, 236, 140)}),
}


def tint(c, t):
    return tuple(int(v + (255 - v) * t) for v in c)


def shade(c, t):
    return tuple(int(v * (1 - t)) for v in c)


class Canvas:
    def __init__(self, bg):
        self.px = [[bg] * W for _ in range(H)]

    def rect(self, x0, y0, x1, y1, c):
        for y in range(max(0, y0), min(H, y1 + 1)):
            for x in range(max(0, x0), min(W, x1 + 1)):
                self.px[y][x] = c

    def sprite(self, px, ox, oy):
        for y, row in enumerate(px):
            for x, c in enumerate(row):
                if c is not None and 0 <= ox + x < W and 0 <= oy + y < H:
                    self.px[oy + y][ox + x] = c

    def stamp(self, rows, pal, ox, oy):
        self.sprite([[pal.get(ch) for ch in row] for row in rows], ox, oy)


def custom_frames(path, body):
    """携帯ゲームのドット絵（16x16）を読み、2倍にして 32x32 のコマにする。"""
    pal = {"K": INK, "Z": body, ".": None}
    out = []
    for rows in vpet_import.load_sprite(path, body="Z"):
        big = []
        for row in rows:
            line = [pal[ch] for ch in row for _ in range(2)]
            big += [line, line[:]]
        out.append(big)
    return out


def frame(member, f, custom=None):
    name, crest, fx, _ = member
    wall, floor = tint(crest, 0.85), tint(crest, 0.55)
    cv = Canvas(wall)
    for y in range(0, 42, 6):  # 壁のもよう
        for x in range((y // 6 % 2) * 3, W, 6):
            cv.rect(x, y, x, y, tint(crest, 0.75))
    cv.rect(0, 43, W - 1, H - 1, floor)
    cv.rect(0, 43, W - 1, 43, shade(floor, 0.15))

    # 机とノートPC
    cv.rect(1, 35, 31, 36, (160, 108, 64))
    cv.rect(1, 37, 31, 37, (120, 78, 46))
    cv.rect(3, 38, 4, 42, (120, 78, 46))
    cv.rect(28, 38, 29, 42, (120, 78, 46))
    cv.rect(3, 15, 24, 32, INK)                 # 画面のふち
    cv.rect(4, 16, 23, 31, (22, 30, 52))        # 画面
    cv.rect(3, 33, 28, 34, (176, 180, 196))     # キーボード
    cv.rect(3, 34, 28, 34, (130, 134, 150))
    code = [(120, 200, 255), (250, 210, 90), (150, 230, 140), (240, 130, 200), (200, 200, 220)]
    lens = [12, 15, 7, 13, 16, 9, 11, 5]
    for i in range(5):
        k = (i + f) % len(lens)
        ind = (k % 3) * 2
        cv.rect(6 + ind, 18 + i * 2, min(21, 6 + ind + lens[k]), 18 + i * 2, code[k % len(code)])
    if f % 2 == 0:
        cv.rect(6, 28, 7, 28, (255, 255, 255))  # カーソル
    done = 17 * (f + 1) // FRAMES
    cv.rect(5, 30, 22, 30, (60, 70, 100))
    cv.rect(5, 30, 5 + done, 30, (120, 240, 140))
    if f == FRAMES - 1:                         # できた！
        cv.stamp(["....G", "...G.", "G.G..", ".G..."], {"G": (120, 240, 140)}, 17, 23)

    # デジモン（はずみながらタイピング）
    bob = 1 if f in (2, 3, 6, 7) else 0
    if custom:
        px = custom[f % len(custom)] if len(custom) > 1 else custom[0]
        if len(custom) == 1 and f % 2:
            bob += 1
    else:
        px = digimon_art.DRAW[name](f)
    lift = LIFT.get(name, 0)
    if name == "gomamon" and not custom:        # ゴマモンは木箱の上でねそべる
        cv.rect(30, 37, 54, 42, (176, 120, 70))
        cv.rect(30, 37, 54, 37, (200, 146, 92))
        cv.rect(30, 42, 54, 42, (120, 78, 46))
        for x in (30, 42, 54):
            cv.rect(x, 37, x, 42, (120, 78, 46))
    cv.rect(30, 43, 52, 43, shade(floor, 0.25))  # 影
    cv.sprite(px, 23, 12 + bob - (0 if custom else lift))
    # キーを打った光
    cv.rect(26 if f % 2 else 23, 32, 26 if f % 2 else 23, 32, (255, 240, 150))

    # 技のエフェクト（頭の上から立ちのぼる）
    rows, pal = FX[fx]
    for n, col in enumerate((58, 66, 73)):
        t = (f + n * 3) % FRAMES
        cv.stamp(rows, pal, col + (t % 2), 34 - t * 4)
    return cv.px


def scaled(px):
    out = []
    for row in px:
        line = [c for c in row for _ in range(SCALE)]
        out += [line] * SCALE
    return out


def lzw(indices, min_size=8):
    clear, eoi = 1 << min_size, (1 << min_size) + 1
    out, buf, nbits = bytearray(), 0, 0

    def emit(code, size):
        nonlocal buf, nbits
        buf |= code << nbits
        nbits += size
        while nbits >= 8:
            out.append(buf & 0xFF)
            buf >>= 8
            nbits -= 8

    def reset():
        return {bytes([i]): i for i in range(clear)}, eoi + 1, min_size + 1

    table, nxt, size = reset()
    emit(clear, size)
    w = b""
    for b in indices:
        wc = w + bytes([b])
        if wc in table:
            w = wc
            continue
        emit(table[w], size)
        if nxt < 4095:
            table[wc] = nxt
            nxt += 1
            if nxt > (1 << size) and size < 12:
                size += 1
        else:
            emit(clear, size)
            table, nxt, size = reset()
        w = bytes([b])
    if w:
        emit(table[w], size)
    emit(eoi, size)
    if nbits:
        out.append(buf & 0xFF)
    return bytes(out)


def write_gif(path, frames):
    w, h = len(frames[0][0]), len(frames[0])
    palette = {}
    for px in frames:
        for row in px:
            for c in row:
                palette.setdefault(c, len(palette))
    assert len(palette) <= 256, len(palette)
    cols = list(palette) + [(0, 0, 0)] * (256 - len(palette))
    data = bytearray(b"GIF89a")
    data += struct.pack("<HHBBB", w, h, 0xF7, 0, 0)
    data += b"".join(bytes(c) for c in cols)
    data += b"!\xff\x0bNETSCAPE2.0\x03\x01\x00\x00\x00"  # くり返し再生
    for px in frames:
        data += b"!\xf9\x04\x04" + struct.pack("<H", DELAY) + b"\x00\x00"
        data += b"," + struct.pack("<HHHHB", 0, 0, w, h, 0)
        comp = lzw(bytes(palette[c] for row in px for c in row))
        data += b"\x08"
        for i in range(0, len(comp), 255):
            blk = comp[i:i + 255]
            data += bytes([len(blk)]) + blk
        data += b"\x00"
    data += b";"
    with open(path, "wb") as fp:
        fp.write(data)


def write_png(path, px):
    w, h = len(px[0]), len(px)
    raw = b"".join(b"\x00" + b"".join(bytes(c) for c in row) for row in px)

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    with open(path, "wb") as fp:
        fp.write(b"\x89PNG\r\n\x1a\n")
        fp.write(chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)))
        fp.write(chunk(b"IDAT", zlib.compress(raw, 9)))
        fp.write(chunk(b"IEND", b""))




def find_sprite(name):
    for path in sorted(glob.glob(os.path.join(SPRITE_DIR, name + ".*"))):
        if not path.endswith(".md"):
            return path
    return None


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for member in CREW:
        name = member[0]
        frames = [scaled(frame(member, f)) for f in range(FRAMES)]
        write_gif(os.path.join(OUT_DIR, name + ".gif"), frames)
        write_png(os.path.join(OUT_DIR, name + ".png"), frames[0])
        print(os.path.relpath(os.path.join(OUT_DIR, name + ".gif")))
        src = find_sprite(name)
        if src:  # 自分で用意したドット絵で custom/ に作る（GitHub には上がらない）
            custom = custom_frames(src, member[3])
            frames = [scaled(frame(member, f, custom)) for f in range(FRAMES)]
            write_gif(os.path.join(CUSTOM_DIR, name + ".gif"), frames)
            print(f"{os.path.relpath(os.path.join(CUSTOM_DIR, name + '.gif'))}  <- {os.path.relpath(src)}")


if __name__ == "__main__":
    main()
