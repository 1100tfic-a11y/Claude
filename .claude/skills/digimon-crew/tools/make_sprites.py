#!/usr/bin/env python3
"""digimon-crew 用の「作業中アニメーション」（子ども＋パートナー）を GIF で書き出す。

外部ライブラリ不要（標準ライブラリだけで GIF / PNG を書く）。
  python3 .claude/skills/digimon-crew/tools/make_sprites.py
で ../images/<id>.gif（動く版）と ../images/<id>.png（止まった版）を作り直す。

場面：子どもが机のノートPCでタイピングし、壁の画面にコードが流れて進捗バーが伸び、
パートナーデジモンが体を揺らしながら技のエフェクトを出す。
ドット絵を直したいときは、下の文字列（1文字＝1ドット）を編集する。
"""
import os
import struct
import zlib

SCALE = 6
W, H = 64, 48
FRAMES = 8
DELAY = 15  # 1/100 秒単位
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "images")

BASE = {
    ".": None,
    "K": (30, 28, 38),      # 輪郭
    "W": (255, 255, 255),
    "S": (252, 214, 180),   # 肌
    "s": (232, 176, 140),   # 肌の影
    "M": (190, 70, 80),     # 口
}

# ============================================================
# 子ども（20 x 26、上半身。机より下は描かない）
#   髪・帽子の行（各自） + 顔（共通） + 胴（共通）
#   顔の H は髪の色（横髪）。C=服 c=服の影 A=服の飾り
# ============================================================
FACE = [
    "...HSSSSSSSSSSSSH...",
    "...HSSSSSSSSSSSSH...",
    "...HSKKSSSSSSKKSH...",
    "...HSKWSSSSSSKWSH...",
    "...HSKKSSSSSSKKSH...",
    "...sSSSSSSSSSSSSs...",
    "....SSSSSMMSSSSS....",
    ".....sSSSSSSSSs.....",
    ".......sSSSSs.......",
]
FACE_BLINK = {2: "...HSSSSSSSSSSSSH...", 3: "...HSKKSSSSSSKKSH...", 4: "...HSSSSSSSSSSSSH..."}
TORSO = [
    ".....cCCCCCCCCc.....",
    "...cCCCCCCCCCCCCc...",
    "..cCCCCCCCCCCCCCCc..",
    "..cCCCCCCCCCCCCCCc..",
    "..cCCCCCCCCCCCCCCc..",
    "..cCCCCCCCCCCCCCCc..",
]

KIDS = {
    "taichi": dict(
        hair=[
            "...H...H...H...H....",
            "..HH..HHH.HHH.HHH...",
            ".HHHHHHHHHHHHHHHHH..",
            "HHHHHHHHHHHHHHHHHHH.",
            "HHHGGGGGGGGGGGGGGHHH",
            "HHGLLLGGGGGGGGLLLGHH",
            "HHHGGGHHHHHHHHGGGHHH",
            ".HHHHSHHHSSHHHSHHHH.",
        ],
        colors={"H": (120, 66, 32), "G": (110, 110, 120), "L": (130, 210, 250),
                "C": (40, 110, 220), "c": (24, 76, 170), "A": (250, 220, 60)},
        torso={1: "...cCCCCCAACCCCCCc..", 2: "..cCCCCCAAAACCCCCCc."},
    ),
    "yamato": dict(
        hair=[
            "......HHHHHHH.......",
            "....HHHHHHHHHHH.....",
            "...HHHHHHHHHHHHHH...",
            "..HHHHHHHHHHHHHHHH..",
            "..HHHHHHHHHHHHHHHH..",
            "..HHHHHHHHHHHhHHHH..",
            "..HHHHHHHHhHHHhHHH..",
            "..HHHHSHHSSHHSSHHH..",
        ],
        colors={"H": (246, 214, 96), "h": (210, 170, 60),
                "C": (70, 150, 80), "c": (44, 108, 56)},
        torso={0: ".....cCCCCCCCCc.....", 1: "...cCCCCCCCCCCCCc..."},
        face_sides="H",
    ),
    "sora": dict(
        hair=[
            "......BBBBBBB.......",
            "....BBBBBBBBBBB.....",
            "...BBBBBBBBBBBBBB...",
            "..BBBBBbbbbbbBBBBB..",
            "..BBBBBBBBBBBBBBBBB.",
            ".BBBBBBBBBBBBBBBBBBB",
            "..HHHHHHHHHHHHHHHH..",
            "..HHHHSHHHHSHHHSHH..",
        ],
        colors={"H": (224, 110, 46), "B": (60, 120, 230), "b": (40, 80, 170),
                "C": (252, 222, 90), "c": (220, 180, 50)},
    ),
    "koushiro": dict(
        hair=[
            "....H.H.H.H.H.......",
            "...HHHHHHHHHHHH.....",
            "..HHHHHHHHHHHHHH....",
            "..HHHHHHHHHHHHHHH...",
            "..HHHHHHHHHHHHHHH...",
            "..HHHhHHHHhHHHHHH...",
            "..HHHSSHHSSHHSHHH...",
            "...HSSSSSSSSSSSSH...",
        ],
        colors={"H": (196, 62, 40), "h": (150, 40, 30),
                "C": (244, 140, 50), "c": (200, 100, 30)},
    ),
    "mimi": dict(
        hair=[
            ".......RRRRRR.......",
            "......RRRRRRRR......",
            ".....RRRRYYRRRR.....",
            ".....RRRRRRRRRR.....",
            "rrrrRRRRRRRRRRRRrrrr",
            ".rrrrrrrrrrrrrrrrrr.",
            "..HHHHHHHHHHHHHHHH..",
            ".HHHHSHHHHHHHHSHHHH.",
        ],
        colors={"H": (200, 140, 90), "R": (246, 120, 180), "r": (210, 80, 140),
                "Y": (255, 230, 80), "C": (230, 60, 70), "c": (180, 40, 50)},
        face_sides="H",
        torso={0: "..H..cCCCCCCCCc..H..", 1: "..HcCCCCCCCCCCCCcH..", 2: "..HCCCCCCCCCCCCCCH.."},
    ),
    "jou": dict(
        hair=[
            "......HHHHHHH.......",
            "....HHHHHHHHHHH.....",
            "...HHHHHHHHHHHHH....",
            "..HHHHHHHHHHHHHHH...",
            "..HHHHHHHHHHHHHHHH..",
            "..HHHHHHHHHHHHHHHH..",
            "..HHHHhHHHHHHhHHHH..",
            "..HHHSSSSSSSSSSHHH..",
        ],
        colors={"H": (44, 56, 110), "h": (30, 36, 80), "C": (190, 192, 200),
                "c": (140, 142, 156), "O": (40, 40, 50), "l": (210, 236, 252)},
        face={2: "...HOOOOOSSOOOOOH...", 3: "...HOlKlOOOOlKlOH...", 4: "...HOOOOOSSOOOOOH..."},
        torso={0: ".....cWWCCCCWWc.....", 1: "...cCCWWCCCCWWCCc..."},
    ),
    "takeru": dict(
        hair=[
            "......GGGGGGG.......",
            "....GGGGGGGGGGG.....",
            "...GGGGGGGGGGGGG....",
            "...GGGGGGGGGGGGG....",
            "..gGGGGGGGGGGGGGg...",
            ".gggggggggggggggggg.",
            "..HHHHHHHHHHHHHHH...",
            "..HHHSHHHHSHHHSHH...",
        ],
        colors={"H": (246, 214, 96), "G": (90, 176, 70), "g": (56, 130, 46),
                "C": (240, 240, 130), "c": (200, 200, 90)},
    ),
    "hikari": dict(
        hair=[
            "......HHHHHHH.......",
            "....HHHHHHHHHHH.....",
            "...HHHHHHHHHHHHH....",
            "..HHHHHHHHHHHHHHH...",
            "..HHHHHHHHHHHHHHH...",
            "..HHHHHHHHHHHHPPH...",
            "..HHHHhHHHHHHhPPH...",
            "..HHHSSSSSSSSSSHH...",
        ],
        colors={"H": (130, 74, 40), "h": (96, 52, 28), "P": (246, 120, 170),
                "C": (250, 170, 196), "c": (220, 120, 160), "Y": (252, 220, 60),
                "y": (150, 150, 160)},
        torso={1: "...cCCCCCyyCCCCCc...", 2: "..cCCCCCCYYCCCCCCc..", 3: "..cCCCCCCYYCCCCCCc.."},
    ),
}

# ============================================================
# パートナーデジモン（最大 24 x 24、下ぞろえ、子どものほう＝左向き）
#   E=目 e=目の光 その他は各自の色
# ============================================================
DIGIMON = {
    "agumon": dict(
        grid=[
            "........KKKKKK..........",
            "......KKOOOOOOKK........",
            ".....KOOOOOOOOOOK.......",
            "....KOOEEOOOOOOOOK......",
            "...KOOOEeOOOOOOOOOK.....",
            "..KOOOOOOOOOOOOOOOK.....",
            ".KOOOOOOOOOOOOOOOOK.....",
            ".KKKKKKKKKOOOOOOOK......",
            ".KWKWKWKWKOOOOOOK.......",
            "..KOOOOOOOOOOOOK........",
            "...KKKKKOOOOOOOK........",
            "......KOOYYYYOOOK.......",
            "....KKOOYYYYYYOOOK......",
            "...KWOOKYYYYYYOOOOK.....",
            "...KWWKKYYYYYYOOOOOK....",
            "....KK.KYYYYYYOOOOOOK...",
            "......KOOYYYYOOOOOOOOK..",
            "......KOOOOOOOOKKOOOOOK.",
            "......KOOOOK.KOOOK.KKKK.",
            ".....KOOOOOK.KOOOOK.....",
            "....KWOWOWOK.KWOWOWK....",
            "....KKKKKKKK.KKKKKKK....",
        ],
        colors={"O": (250, 168, 36), "Y": (252, 214, 120), "E": (40, 150, 60),
                "e": (180, 250, 160)},
        blink={3: "....KOOOOOOOOOOOOK......", 4: "...KOOKKKOOOOOOOOOK....."},
        fx="flame",
    ),
    "gabumon": dict(
        grid=[
            "..........KK............",
            ".........KYK............",
            "........KYYK............",
            "......KKBBBBKK..........",
            ".....KBBWBBWBBK.........",
            "....KBBBBBBBBBBK........",
            "...KBBYYYYYYYBBK........",
            "...KBYYEeYYYYYBK........",
            "...KBYYEEYYYYYBK........",
            "..KYYYYYYYYYYYBK........",
            "..KKKYYYYYYYYBBK........",
            "....KBBYYYYYBBBBK.......",
            "...KBWBBBBBBBBWBBK......",
            "..KYYBBWBBBBBWBBBBK.....",
            "..KYYKBBBBBBBBBBBBK.....",
            "...KKBBWBBBBBBWBBBK.....",
            "....KBBBBBBBBBBBBBBK....",
            "....KBBBBKKKKBBBBBBBK...",
            "....KBBBK....KBBBK.KBK..",
            "...KYYYK....KYYYK..KBK..",
            "...KKKKK....KKKKK...K...",
        ],
        colors={"B": (110, 160, 230), "W": (235, 245, 255), "Y": (250, 206, 90),
                "E": (210, 40, 40), "e": (255, 180, 180)},
        blink={7: "...KBYYYYYYYYYBK........", 8: "...KBYYKKYYYYYBK........"},
        fx="frost",
    ),
    "piyomon": dict(
        grid=[
            "......K.K.K.............",
            ".....KBKYKBK............",
            "......KPPPK.............",
            ".....KPPPPPKK...........",
            "....KPPPPPPPPK..........",
            "...KPPEePPPPPK..........",
            "..KGGPEEPPPPPPK.........",
            ".KGGGGPPPPPPPPK.........",
            "..KKKPPPPPPPPPK.........",
            "....KPPPPPPPPPPK........",
            "...KPPKPPPPPPPPPK.......",
            "..KPPPPKPPPPPPPPK.......",
            ".KPPPPPKPPPPPPPPPK......",
            ".KWKPPKKPPPPPPPPPK......",
            "..K.KK.KPPPPPPPPK.......",
            ".......KPPPPPPPK........",
            "........KKPPPKK.........",
            ".........KGKKGK.........",
            "........KGGKKGGK........",
            ".......KKKK.KKKK........",
        ],
        colors={"P": (246, 130, 170), "G": (200, 220, 90), "B": (80, 170, 240),
                "Y": (250, 210, 60), "E": (60, 150, 230), "e": (200, 240, 255)},
        blink={5: "...KPPPPPPPPPK..........", 6: "..KGGPKKPPPPPPK........."},
        fx="heart",
    ),
    "tentomon": dict(
        grid=[
            "...K.........K..........",
            "....K.......K...........",
            ".....KKKKKKK............",
            "....KDDDDDDDK...........",
            "...KDEEEDEEEDK..........",
            "...KDEeEDEeEDK..........",
            "...KDEEEDEEEDK..........",
            "...KDDDKKKDDDK..........",
            "..KRRRRRRRRRRRK.........",
            ".KRRRrrRRRRRRRRK........",
            "KRRRrrRRRRRRKKRRK.......",
            "KRRRRRRRRRRRKKRRK.......",
            "KRRKKRRRRRRRRRRRK.......",
            "KRRKKRRRRRKKRRRRK.......",
            ".KRRRRRRRRKKRRRK........",
            "..KRRRRRRRRRRRK.........",
            "...KKRRRKKRRRKK.........",
            "...KDDK...KDDK..........",
            "..KDDDK...KDDDK.........",
            "..KKKK.....KKKK.........",
        ],
        colors={"R": (214, 48, 48), "r": (255, 140, 140), "D": (108, 70, 52),
                "E": (90, 220, 100), "e": (220, 255, 220)},
        blink={5: "...KDKKKDKKKDK..........", 4: "...KDDDDDDDDDK..........", 6: "...KDDDDDDDDDK.........."},
        fx="spark",
    ),
    "palmon": dict(
        grid=[
            ".....KK..KK.............",
            "....KPPK.KPPK...........",
            "...KPPPPKPPPPK..........",
            "..KPPPPPYPPPPPK.........",
            "...KPPPYYYPPPK..........",
            "....KPPPKPPPK...........",
            ".....KKGGGKK............",
            "....KGGGGGGGK...........",
            "...KGGEGGGEGGK..........",
            "...KGGEGGGEGGK..........",
            "...KGGGGGGGGGK..........",
            "....KGGgggGGK...........",
            "...KKGGGGGGGKK..........",
            "..KGKKGGGGGKKGK.........",
            ".KGK.KGGGGGK.KGK........",
            "KGK..KGGGGGK..KGK.......",
            "KK...KGGgGGK...KK.......",
            ".....KGGGGGK............",
            "....KGGGKGGGK...........",
            "...KGGGK.KGGGK..........",
            "...KKKK...KKKK..........",
        ],
        colors={"P": (246, 120, 170), "Y": (255, 224, 80), "G": (110, 200, 90),
                "g": (70, 150, 60), "E": (30, 30, 40)},
        blink={8: "...KGGGGGGGGGK..........", 9: "...KGGKGGGKGGK.........."},
        fx="petal",
    ),
    "gomamon": dict(
        grid=[
            "....KKKK................",
            "...KOOOOKK..............",
            "..KOOOOOOOK.............",
            "..KKWWWWWKK.............",
            ".KWWWWWWWWWK............",
            "KWWEWWWWEWWWK...........",
            "KWWEWWWWEWWWK...........",
            "KWWWWWKKWWWWK...........",
            "KWWVWWWWWWVWWK..........",
            ".KWWWWWWWWWWWWK.........",
            "..KWWWWWWWWWWWWKK.......",
            ".KWWVVWWWWWWWWWWWK......",
            "KWWKVWWWWWWWWVWWWWK.....",
            "KWKKWWWWWWWWWWWWWWWK..KK",
            ".K.KWWWWWWWWWWWWWWWWKKWK",
            "...KWWKKWWWWWKKWWWWWWWK.",
            "..KWWK.KWWWWK.KWWKKKKK..",
            "..KKKK.KKKKKK.KKKK......",
        ],
        colors={"W": (244, 246, 252), "O": (246, 120, 40), "V": (150, 90, 210),
                "E": (30, 30, 40)},
        blink={5: "KWWWWWWWWWWWK...........", 6: "KWWKWWWWKWWWK..........."},
        fx="bubble",
    ),
    "patamon": dict(
        grid=[
            "KKK..............KKK....",
            "KOOKK..KKKKKK..KKOOK....",
            ".KOOOKKOOOOOOKKOOOK.....",
            "..KOOOOOOOOOOOOOOK......",
            "...KOOOOOOOOOOOOK.......",
            "...KOOEeOOOOEeOOK.......",
            "...KOOEEOOOOEEOOK.......",
            "...KOOOOOKKOOOOOK.......",
            "....KOOOCCCCOOOK........",
            "...KOOCCCCCCCCOOK.......",
            "...KOOCCCCCCCCOOK.......",
            "....KOOCCCCCCOOK........",
            ".....KOOOOOOOOK.........",
            ".....KOK....KOK.........",
            ".....KKK....KKK.........",
        ],
        colors={"O": (240, 160, 72), "C": (252, 232, 196), "E": (60, 120, 220),
                "e": (200, 230, 255)},
        blink={5: "...KOOOOOOOOOOOOK.......", 6: "...KOOKKOOOOKKOOK......."},
        fx="star",
    ),
    "tailmon": dict(
        grid=[
            "..K.......K.............",
            ".KVK.....KVK............",
            ".KWVK...KVWK............",
            ".KWWKKKKKWWK............",
            ".KWWWWWWWWWK............",
            ".KWEEWWWEEWK............",
            ".KWEeWWWEeWK............",
            ".KWWWWKWWWWK............",
            "..KWWWWWWWK.............",
            "...KKWWWKK..............",
            "...KWWWWWK..............",
            "..KYRKWWKYRK............",
            "..KYYKWWKYYK.........K..",
            "...KKWWWWKK.........KVK.",
            "....KWWWWK.........KWK..",
            "....KWWWWK........KVK...",
            "....KWWWWK.......KGGK...",
            "....KWKKWK......KWK.....",
            "....KWK.KWK...KKVK......",
            "...KWWK.KWWKKKWWK.......",
            "...KKKK.KKKKKKKK........",
        ],
        colors={"W": (250, 250, 252), "V": (150, 90, 210), "Y": (252, 214, 60),
                "R": (220, 60, 60), "G": (240, 200, 60), "E": (60, 140, 230),
                "e": (210, 236, 255)},
        blink={5: ".KWWWWWWWWWK............", 6: ".KWKKWWWKKWK............"},
        fx="ray",
    ),
}

# エフェクト（3〜5ドット）。デジモンの頭上から立ちのぼる
FX = {
    "flame": ([".R.", "RYR", ".R."], {"R": (240, 80, 30), "Y": (255, 220, 80)}),
    "frost": (["B.B", ".W.", "B.B"], {"B": (120, 190, 255), "W": (240, 250, 255)}),
    "heart": (["R.R", "RRR", ".R."], {"R": (240, 70, 110)}),
    "spark": (["Y..", ".Y.", "..Y"], {"Y": (255, 240, 90)}),
    "petal": ([".P.", "PYP", ".P."], {"P": (246, 140, 190), "Y": (255, 230, 90)}),
    "bubble": ([".B.", "B.B", ".B."], {"B": (140, 210, 255)}),
    "star": ([".Y.", "YYY", ".Y."], {"Y": (255, 230, 70)}),
    "ray": (["Y.Y", ".W.", "Y.Y"], {"Y": (255, 236, 120), "W": (255, 255, 255)}),
}

# 壁の画面に出す、担当の作業アイコン（5x5）
ICONS = {
    "plan": ["..F..", ".FFF.", "FFFFF", "..F..", "..F.."],   # 旗＝作戦
    "build": ["FFF..", "FFF..", ".F...", ".FF..", "..FF."],  # ハンマー
    "review": [".F.F.", "FFFFF", "FFFFF", ".FFF.", "..F.."],  # ハート
    "search": [".FFF.", "F...F", "F...F", ".FFF.", "....F"],  # 虫めがね
    "design": ["F...F", ".F.F.", "..F..", ".F.F.", "F...F"],  # きらめき
    "test": ["....F", "...F.", "F.F..", ".F...", "....."],    # チェック
    "fix": [".F...", "FFF..", ".FFF.", "..FFF", "...F."],     # ばんそうこう
    "report": ["FFFFF", "FF.FF", "F.F.F", "F...F", "FFFFF"],  # 封筒
}

# id, 子ども, デジモン, 紋章の色, 作業アイコン
PAIRS = [
    ("taichi-agumon", "taichi", "agumon", (250, 150, 50), "plan"),          # 勇気
    ("yamato-gabumon", "yamato", "gabumon", (70, 130, 230), "build"),       # 友情
    ("sora-piyomon", "sora", "piyomon", (230, 70, 80), "review"),           # 愛情
    ("koushiro-tentomon", "koushiro", "tentomon", (150, 90, 210), "search"),  # 知識
    ("mimi-palmon", "mimi", "palmon", (90, 190, 90), "design"),             # 純真
    ("jou-gomamon", "jou", "gomamon", (130, 130, 150), "test"),             # 誠実
    ("takeru-patamon", "takeru", "patamon", (235, 190, 40), "fix"),         # 希望
    ("hikari-tailmon", "hikari", "tailmon", (240, 120, 180), "report"),     # 光
]


def tint(c, t):
    return tuple(int(v + (255 - v) * t) for v in c)


def shade(c, t):
    return tuple(int(v * (1 - t)) for v in c)


def kid_rows(spec, blink):
    face = list(FACE)
    for i, row in spec.get("face", {}).items():
        face[i] = row
    if blink and "face" not in spec:
        for i, row in FACE_BLINK.items():
            face[i] = row
    torso = list(TORSO)
    for i, row in spec.get("torso", {}).items():
        torso[i] = row
    return spec["hair"] + face + torso


class Canvas:
    def __init__(self, bg):
        self.px = [[bg] * W for _ in range(H)]

    def rect(self, x0, y0, x1, y1, c):
        for y in range(max(0, y0), min(H, y1 + 1)):
            for x in range(max(0, x0), min(W, x1 + 1)):
                self.px[y][x] = c

    def stamp(self, rows, pal, ox, oy):
        for y, row in enumerate(rows):
            for x, ch in enumerate(row):
                c = pal.get(ch)
                if c is not None and 0 <= ox + x < W and 0 <= oy + y < H:
                    self.px[oy + y][ox + x] = c


def frame(pair, f):
    pid, kid_name, digi_name, crest, icon = pair
    kid, digi = KIDS[kid_name], DIGIMON[digi_name]
    wall, floor = tint(crest, 0.86), tint(crest, 0.6)
    cv = Canvas(wall)
    cv.rect(0, 40, W - 1, H - 1, floor)
    cv.rect(0, 40, W - 1, 40, shade(floor, 0.12))
    for x in range(0, W, 8):  # 床の目地
        cv.rect(x, 41, x, H - 1, shade(floor, 0.06))

    # --- 壁の画面：コードが流れ、進捗バーが伸びる ---
    sx0, sy0, sx1, sy1 = 34, 2, 61, 14
    cv.rect(sx0 - 1, sy0 - 1, sx1 + 1, sy1 + 1, (30, 28, 38))
    cv.rect(sx0, sy0, sx1, sy1, (22, 30, 52))
    cv.rect(sx0, sy0, sx1, sy0 + 1, crest)
    cv.stamp(ICONS[icon], {"F": tint(crest, 0.3)}, sx0 + 2, sy0 + 4)
    code_cols = [(120, 200, 255), (250, 210, 90), (150, 230, 140), (240, 130, 200), (200, 200, 220)]
    lens = [12, 18, 8, 15, 19, 10, 16, 6, 14, 17, 9, 13]
    for i in range(4):
        k = (i + f) % len(lens)
        x0 = sx0 + 9 + (k % 3) * 2
        x1 = min(sx1 - 2, x0 + lens[k] - (k % 3) * 2)
        cv.rect(x0, sy0 + 3 + i * 2, x1, sy0 + 3 + i * 2, code_cols[k % len(code_cols)])
    if f % 2 == 0:  # カーソルの点滅
        cv.rect(x1 + 2, sy0 + 9, x1 + 2, sy0 + 9, (255, 255, 255))
    cv.rect(sx0 + 1, sy1 - 1, sx1 - 1, sy1 - 1, (60, 70, 100))
    done = int((sx1 - sx0 - 2) * (f + 1) / FRAMES)
    cv.rect(sx0 + 1, sy1 - 1, sx0 + done, sy1 - 1, (120, 240, 140))

    # --- 子ども：タイピング（手が交互に上下）、ときどきまばたき ---
    kc = kid["colors"]["C"]
    cv.stamp(kid_rows(kid, blink=(f == 5)), {**BASE, **kid["colors"]}, 6, 8)

    # 机とノートPC（ふたの背面に紋章の色の印）
    cv.rect(2, 31, 33, 32, (150, 100, 60))
    cv.rect(2, 33, 33, 39, (120, 78, 46))
    cv.rect(4, 33, 4, 39, (96, 60, 34))
    cv.rect(31, 33, 31, 39, (96, 60, 34))
    cv.rect(9, 24, 22, 30, (60, 60, 72))
    cv.rect(10, 25, 21, 30, (176, 180, 196))
    cv.rect(14, 26, 17, 28, crest)
    cv.rect(9, 24, 22, 24, (200, 240, 255) if f % 2 else (150, 210, 250))  # 画面の光
    for hx, up in ((5, f % 2 == 0), (24, f % 2 == 1)):
        hy = 28 if up else 29
        cv.rect(hx, 26, hx + 2, hy - 1, kc)
        cv.rect(hx, hy, hx + 2, hy + 1, BASE["S"])
        cv.rect(hx, hy + 1, hx + 2, hy + 1, BASE["s"])
        if up:  # キーを打った火花
            cv.rect(hx + 1, hy - 2, hx + 1, hy - 2, (255, 255, 255))

    # --- デジモン：はずむ・まばたき・エフェクト ---
    grid = list(digi["grid"])
    if f == 5:
        for i, row in digi.get("blink", {}).items():
            grid[i] = row
    hop = 1 if f in (1, 2, 5, 6) else 0
    dx, dy = 37, 40 - len(grid) - hop
    cv.rect(dx + 3, 40, dx + 17, 40, shade(floor, 0.25))  # 影
    cv.stamp(grid, {**BASE, **digi["colors"]}, dx, dy)
    fx_rows, fx_pal = FX[digi["fx"]]
    for n, col in enumerate((33, 59, 33, 59)):
        t = (f + n * 2) % FRAMES
        wob = 1 if t % 4 in (1, 2) else 0
        cv.stamp(fx_rows, fx_pal, col - 1 + wob, 36 - t * 3)
    return cv.px


# ------------------------------------------------------------
# 書き出し（GIF / PNG）
# ------------------------------------------------------------
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


def scaled(px):
    for row in px:
        line = [c for c in row for _ in range(SCALE)]
        for _ in range(SCALE):
            yield line


def write_gif(path, frames):
    palette = {}
    for px in frames:
        for row in px:
            for c in row:
                palette.setdefault(c, len(palette))
    assert len(palette) <= 256, len(palette)
    cols = list(palette) + [(0, 0, 0)] * (256 - len(palette))
    w, h = W * SCALE, H * SCALE
    data = bytearray(b"GIF89a")
    data += struct.pack("<HHBBB", w, h, 0xF7, 0, 0)
    data += b"".join(bytes(c) for c in cols)
    data += b"!\xff\x0bNETSCAPE2.0\x03\x01\x00\x00\x00"  # くり返し再生
    for px in frames:
        data += b"!\xf9\x04\x04" + struct.pack("<H", DELAY) + b"\x00\x00"
        data += b"," + struct.pack("<HHHHB", 0, 0, w, h, 0)
        idx = bytes(palette[c] for line in scaled(px) for c in line)
        comp = lzw(idx)
        data += b"\x08"
        for i in range(0, len(comp), 255):
            blk = comp[i:i + 255]
            data += bytes([len(blk)]) + blk
        data += b"\x00"
    data += b";"
    with open(path, "wb") as fp:
        fp.write(data)


def write_png(path, px):
    raw = b"".join(b"\x00" + b"".join(bytes(c) for c in line) for line in scaled(px))

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    with open(path, "wb") as fp:
        fp.write(b"\x89PNG\r\n\x1a\n")
        fp.write(chunk(b"IHDR", struct.pack(">IIBBBBB", W * SCALE, H * SCALE, 8, 2, 0, 0, 0)))
        fp.write(chunk(b"IDAT", zlib.compress(raw, 9)))
        fp.write(chunk(b"IEND", b""))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for pair in PAIRS:
        frames = [frame(pair, f) for f in range(FRAMES)]
        gif = os.path.join(OUT_DIR, pair[0] + ".gif")
        write_gif(gif, frames)
        write_png(os.path.join(OUT_DIR, pair[0] + ".png"), frames[0])
        print(os.path.relpath(gif))


if __name__ == "__main__":
    main()
