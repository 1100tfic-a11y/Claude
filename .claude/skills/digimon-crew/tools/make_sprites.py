#!/usr/bin/env python3
"""digimon-crew 用のオリジナルドット絵（子ども＋パートナー）を PNG で書き出す。

外部ライブラリ不要（標準ライブラリだけで PNG を書く）。
  python3 .claude/skills/digimon-crew/tools/make_sprites.py
で ../images/<id>.png を作り直す。ドット絵を直したいときは下の文字列を編集する。
"""
import os
import struct
import zlib

SCALE = 10
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "images")

# 共通の色
BASE = {
    ".": None,
    "K": (34, 34, 40),      # 輪郭
    "S": (250, 208, 170),   # 肌
    "W": (250, 250, 250),   # 白
    "E": (40, 150, 60),     # 目（デジモン）
    "M": (200, 90, 90),     # 口
}

# ---- 子ども（16x23）。髪（0〜4行目）は各自、顔と体は共通 ----
FACE = [
    "...HSSSSSSSSH...",
    "...HSKSSSSKSH...",
    "...HSKSSSSKSH...",
    "....SSSSSSSS....",
    "....SSSMMSSS....",
    ".....SSSSSS.....",
]
BODY = [
    "....CCCCCCCC....",
    "...CCCCCCCCCC...",
    "..SCCCCCCCCCCS..",
    "..SCCCCCCCCCCS..",
    "..S.CCCCCCCC.S..",
    "....CCCCCCCC....",
    "....PPPPPPPP....",
    "....PPP..PPP....",
    "....PPP..PPP....",
    "....PPP..PPP....",
    "....SSS..SSS....",
    "...FFFF..FFFF...",
]

KIDS = {
    "taichi": dict(
        hair=[
            "..H.H.HH.H.H....",
            ".HHHHHHHHHHHHH..",
            "HHHHHHHHHHHHHHH.",
            ".HGGGgGGGGgGGHH.",
            "..HHHHHHHHHHHH..",
        ],
        colors={"H": (110, 60, 30), "G": (90, 90, 100), "g": (120, 200, 240),
                "C": (40, 110, 210), "P": (200, 170, 110), "F": (60, 60, 60)},
    ),
    "yamato": dict(
        hair=[
            "....HHHHHHH.....",
            "...HHHHHHHHHH...",
            "..HHHHHHHHHHHH..",
            "..HHHHHHHHHHHH..",
            "..HHHSHHSHHHHH..",
        ],
        colors={"H": (240, 210, 90), "C": (70, 150, 80), "P": (70, 90, 140),
                "F": (90, 60, 40)},
    ),
    "sora": dict(
        hair=[
            "....BBBBBBB.....",
            "..BBBBBBBBBBB...",
            ".BBBBBBBBBBBBB..",
            ".BBBBBBBBBBBBBB.",
            "..HHHHHHHHHHHH..",
        ],
        colors={"H": (220, 110, 50), "B": (60, 120, 220), "C": (250, 220, 90),
                "P": (60, 110, 200), "F": (230, 230, 230)},
    ),
    "koushiro": dict(
        hair=[
            "...H.H.H.H......",
            "..HHHHHHHHHH....",
            ".HHHHHHHHHHHH...",
            "..HHHHHHHHHHH...",
            "..HHHSSHSSHHH...",
        ],
        colors={"H": (190, 60, 40), "C": (240, 140, 50), "P": (150, 160, 100),
                "F": (80, 80, 80)},
        extra={"L": (120, 120, 130), "l": (150, 220, 250)},
        body_override={14: "..SLLLLLLLLLLS..", 13: "..SLllllllllLS.."},
    ),
    "mimi": dict(
        hair=[
            ".....RRRRR......",
            "....RRRYRRR.....",
            "RRRRRRRRRRRRRRRR",
            "..HHHHHHHHHHHH..",
            "..HHHHHHHHHHHH..",
        ],
        colors={"H": (190, 120, 70), "R": (240, 110, 170), "Y": (250, 230, 80),
                "C": (230, 60, 60), "P": (240, 110, 170), "F": (250, 250, 250)},
        face_sides="H",
    ),
    "jou": dict(
        hair=[
            "....HHHHHHH.....",
            "...HHHHHHHHHH...",
            "..HHHHHHHHHHHH..",
            "..HHHHHHHHHHHH..",
            "..HHHHHHHHHHHH..",
        ],
        colors={"H": (40, 50, 90), "C": (190, 190, 200), "P": (150, 150, 160),
                "F": (60, 60, 60), "O": (40, 40, 40), "l": (205, 230, 250)},
        face_override={1: "...HOOOSSOOOH...", 2: "...HlKlOOlKlH...", 3: "....OOOSSOOO...."},
    ),
    "takeru": dict(
        hair=[
            "....GGGGGGG.....",
            "...GGGGGGGGG....",
            "..GGGGGGGGGGG...",
            ".GGGGGGGGGGGGG..",
            "..HHHHHHHHHHH...",
        ],
        colors={"H": (240, 210, 90), "G": (80, 160, 70), "C": (240, 240, 120),
                "P": (90, 150, 80), "F": (250, 250, 250)},
    ),
    "hikari": dict(
        hair=[
            "....HHHHHHH.....",
            "...HHHHHHHHH....",
            "..HHHHHHHHHHH...",
            "..HHHHHHHHHHH...",
            "..HHHSSSSHHHH...",
        ],
        colors={"H": (120, 70, 40), "C": (245, 160, 190), "P": (240, 120, 160),
                "F": (250, 250, 250), "Y": (250, 220, 60)},
        body_override={12: "..SCCCCYCCCCCS.."},
    ),
}

# ---- パートナーデジモン（16x16、下ぞろえ）----
DIGIMON = {
    "agumon": dict(
        grid=[
            "....KKKKK.......",
            "...KOOOOOK......",
            "..KOOOOEOOK.....",
            "..KOOOOOOOOKK...",
            "..KOOOOOOOOOOK..",
            "..KOOOKKKKKKK...",
            "...KOOOOK.......",
            "...KOOOOOK......",
            "..KOOOOOOOK.....",
            ".KWOOOOOOOK.....",
            "..KOOOOOOOOK....",
            "..KOOOOOOOOOKK..",
            "..KOOKKOOK.KOOK.",
            "..KOOK.KOOK..KK.",
            ".KWWK..KWWK.....",
        ],
        colors={"O": (250, 170, 40)},
    ),
    "gabumon": dict(
        grid=[
            "......KK........",
            ".....KWK........",
            "...KKBBBKK......",
            "..KBBBBBBBK.....",
            "..KBYYYYYBK.....",
            "..KBYEYYEYK.....",
            "..KBYYYYYYK.....",
            "..KBBYYYYBK.....",
            ".KBWBBBBBWBK....",
            ".KBBWBBBWBBK....",
            "..KBBBBBBBK.....",
            "..KWBBBBBWBK....",
            "..KBBK.KBBK.KBK.",
            "..KBBK.KBBK..K..",
            ".KYYK..KYYK.....",
        ],
        colors={"Y": (245, 200, 80), "B": (90, 140, 220), "E": (200, 40, 40)},
    ),
    "piyomon": dict(
        grid=[
            ".....KBKBK......",
            "......KKK.......",
            ".....KPPPK......",
            "....KPPPPPK.....",
            "...KPPEPPPPK....",
            "...KPPPPPPYYK...",
            "...KPPPPPPYK....",
            "..KPPPPPPPPK....",
            ".KPPKPPPPPPPK...",
            "KPPK.KPPPPPPK...",
            "KPK..KPPPPPPK...",
            ".K...KPPPPPK....",
            "......KPPPK.....",
            ".....KYK.KYK....",
            "....KYYK.KYYK...",
        ],
        colors={"P": (245, 130, 170), "Y": (250, 200, 60), "B": (80, 170, 240),
                "E": (60, 140, 220)},
    ),
    "tentomon": dict(
        grid=[
            "...K......K.....",
            "....K....K......",
            "....KKKKKK......",
            "...KDDDDDDK.....",
            "..KDEEDDEEDK....",
            "..KDEEDDEEDK....",
            "..KDDDDDDDDK....",
            ".KRRRRRRRRRRK...",
            "KRRRRRRRRRRRRK..",
            "KRRKRRRRRRKRRK..",
            "KRRRRRRRRRRRRK..",
            ".KRRRRKKRRRRK...",
            "..KRRK..KRRK....",
            "..KDK....KDK....",
            ".KDDK....KDDK...",
        ],
        colors={"R": (210, 50, 50), "D": (110, 70, 50), "E": (90, 220, 90)},
    ),
    "palmon": dict(
        grid=[
            ".....KK.KK......",
            "....KPPKPPK.....",
            "...KPPPYPPPK....",
            "....KPPKPPK.....",
            ".....KGGK.......",
            "....KGGGGK......",
            "...KGEGGEGK.....",
            "...KGGGGGGK.....",
            "...KGGKKGGK.....",
            "..KGGGGGGGGK....",
            ".KGKGGGGGGKGK...",
            "KGK.KGGGGK.KGK..",
            "KK..KGGGGK..KK..",
            "....KGGGGK......",
            "...KGGKKGGK.....",
            "...KKK..KKK.....",
        ],
        colors={"G": (110, 200, 90), "P": (245, 120, 160), "Y": (250, 220, 60),
                "E": (40, 40, 40)},
    ),
    "gomamon": dict(
        grid=[
            "..KOOOK.........",
            ".KOOOOOK........",
            ".KWWWWWKK.......",
            "KWWEWWEWWK......",
            "KWWWWWWWWK......",
            "KWWWKKWWWWKKK...",
            ".KWWWWWWWWWWWK..",
            "..KWVWWWWWVWWWK.",
            ".KWWWWWWWWWWWWWK",
            "KWWKWWWWWWKWWKWK",
            "KKK.KKKKKKKKK.KK",
        ],
        colors={"O": (240, 120, 40), "V": (150, 90, 200), "E": (40, 40, 40)},
    ),
    "patamon": dict(
        grid=[
            "....KKKKKK......",
            "KK.KOOOOOOK.KK..",
            "KOKOOOOOOOOKOK..",
            "KOOOOEOOEOOOOK..",
            ".KOOOOOOOOOOK...",
            "..KOOOCCCOOK....",
            "..KOOCCCCCOK....",
            "..KOOCCCCCOK....",
            "...KOOOOOOK.....",
            "...KOK..KOK.....",
            "...KK....KK.....",
        ],
        colors={"O": (240, 160, 70), "C": (250, 230, 190), "E": (40, 40, 40)},
    ),
    "tailmon": dict(
        grid=[
            "..K.....K.......",
            ".KVK...KVK......",
            ".KWWKKKKWWK.....",
            ".KWWWWWWWWK.....",
            ".KWEWWWWEWK.....",
            ".KWWWWWWWWK.....",
            "..KWWKKWWK......",
            "...KWWWWK.......",
            "..KYKWWKYK......",
            "..KYKWWKYK......",
            "...KWWWWK..KVK..",
            "...KWWWWK.KWK...",
            "...KWKKWK.KVK...",
            "...KWK.KWKWK....",
            "..KKK..KKKK.....",
        ],
        colors={"V": (150, 90, 200), "Y": (250, 210, 60), "E": (60, 140, 220)},
    ),
}

# ---- 組み合わせと紋章カラー（背景）----
PAIRS = [
    ("taichi-agumon", "taichi", "agumon", (250, 160, 60)),       # 勇気
    ("yamato-gabumon", "yamato", "gabumon", (80, 140, 230)),     # 友情
    ("sora-piyomon", "sora", "piyomon", (230, 70, 70)),          # 愛情
    ("koushiro-tentomon", "koushiro", "tentomon", (150, 90, 200)),  # 知識
    ("mimi-palmon", "mimi", "palmon", (90, 190, 90)),            # 純真
    ("jou-gomamon", "jou", "gomamon", (140, 140, 150)),          # 誠実
    ("takeru-patamon", "takeru", "patamon", (240, 200, 50)),     # 希望
    ("hikari-tailmon", "hikari", "tailmon", (240, 130, 180)),    # 光
]


def kid_grid(spec):
    face = list(FACE)
    for i, row in spec.get("face_override", {}).items():
        face[i] = row
    body = list(BODY)
    for i, row in spec.get("body_override", {}).items():
        body[i - 11] = row
    return spec["hair"] + face + body


def pad(grid, w, h):
    rows = [r.ljust(w, ".")[:w] for r in grid]
    return ["." * w] * (h - len(rows)) + rows


def blend(c, t):
    return tuple(int(v + (255 - v) * t) for v in c)


def render(kid_name, digi_name, crest):
    kid = KIDS[kid_name]
    digi = DIGIMON[digi_name]
    kpal = {**BASE, **kid["colors"], **kid.get("extra", {})}
    dpal = {**BASE, **digi["colors"]}
    kg = pad(kid_grid(kid), 16, 23)
    dg = pad(digi["grid"], 16, 16)

    W, H = 37, 27
    bg, border, ground = blend(crest, 0.82), crest, blend(crest, 0.55)
    px = [[bg] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            if x in (0, W - 1) or y in (0, H - 1):
                px[y][x] = border
            elif y >= H - 3:
                px[y][x] = ground

    def stamp(grid, pal, ox, oy):
        for y, row in enumerate(grid):
            for x, ch in enumerate(row):
                c = pal.get(ch)
                if c is not None:
                    px[oy + y][ox + x] = c

    stamp(kg, kpal, 2, H - 2 - 23)
    stamp(dg, dpal, 19, H - 2 - 16)

    out = []
    for row in px:
        line = b"".join(bytes(c) * SCALE for c in row)
        out.extend([line] * SCALE)
    return W * SCALE, H * SCALE, out


def write_png(path, w, h, rows):
    raw = b"".join(b"\x00" + r for r in rows)

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)))
        f.write(chunk(b"IDAT", zlib.compress(raw, 9)))
        f.write(chunk(b"IEND", b""))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for pid, kid, digi, crest in PAIRS:
        w, h, rows = render(kid, digi, crest)
        path = os.path.join(OUT_DIR, pid + ".png")
        write_png(path, w, h, rows)
        print(os.path.relpath(path))


if __name__ == "__main__":
    main()
