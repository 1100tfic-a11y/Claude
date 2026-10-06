#!/usr/bin/env python3
"""digimon-crew 用の「作業中アニメーション」を、携帯育成ゲーム風の 16x16 ドット絵で書き出す。

外部ライブラリ不要（標準ライブラリだけで GIF / PNG を書く）。
  python3 .claude/skills/digimon-crew/tools/make_sprites.py
で ../images/<id>.gif（動く版）と ../images/<id>.png（止まった版）を作り直す。

絵柄：キャラは 16x16 ドット・左向き・1ドットの輪郭線、という携帯ゲームの液晶風の作り。
      絵はすべてこのリポジトリ用のオリジナル（公式のドット絵の写しではない）。カラーで描く。
場面：液晶（ドットの格子が見える）の中で、子どもがノートPCでタイピングし、
      上の段に作業アイコン・流れるコード・進捗バー、右でパートナーデジモンが歩きながら技のエフェクトを出す。
ドット絵を直したいときは、下の文字列（1文字＝1ドット）を編集する。
"""
import glob
import os
import struct
import sys
import zlib

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vpet_import  # noqa: E402

COLS, ROWS = 40, 26   # 液晶のドット数
DOT, GAP = 7, 1       # 1ドットの大きさと、ドットのすき間（液晶の格子）
PITCH = DOT + GAP
BEZEL = 14            # 液晶のまわりのふち
SHELL = 18            # 本体の外側
BTN_H = 30            # 本体下部（ボタン）の高さ
FRAMES = 8
DELAY = 25            # 1/100 秒単位
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "images")
CUSTOM_DIR = os.path.join(OUT_DIR, "custom")
SPRITE_DIR = os.path.join(CUSTOM_DIR, "sprites")  # ここに置いたドット絵は GitHub に上がらない

BASE = {
    ".": None,
    "K": (34, 32, 44),      # 輪郭
    "W": (255, 255, 255),
    "S": (252, 212, 178),   # 肌
    "M": (200, 70, 80),     # 口
}

# ============================================================
# 子ども（16x16、上半身。下の4行は机のノートPCに隠れる）
# ============================================================
FACE = [
    "..HSSSSSSSSSSH..",
    "..HSKSSSSSSKSH..",
    "..HSKSSSSSSKSH..",
    "...SSSSMMSSSS...",
    "....SSSSSSSS....",
]
FACE_BLINK = {1: "..HSSSSSSSSSSH..", 2: "..HSKKSSSSKKSH.."}
TORSO = [
    "...KCCCCCCCCK...",
    "..KCCCCCCCCCCK..",
    "..KCCCCCCCCCCK..",
    "..KCCCCCCCCCCK..",
    "..KCCCCCCCCCCK..",
]

KIDS = {
    "taichi": dict(
        hair=[
            "..H.H.H.H.H.H...",
            ".HHHHHHHHHHHHH..",
            "HHHHHHHHHHHHHHH.",
            "HHGLLGGGGGLLGHH.",
            ".HHHHHHHHHHHHH..",
            "..HHSHHSHHSHHH..",
        ],
        colors={"H": (124, 68, 34), "G": (110, 110, 124), "L": (120, 210, 250),
                "C": (40, 110, 220)},
    ),
    "yamato": dict(
        hair=[
            "....HHHHHHH.....",
            "...HHHHHHHHH....",
            "..HHHHHHHHHHH...",
            "..HHHHHHHHHHHH..",
            "..HHHHHHHHHHHH..",
            "..HHHSHHSSHHHH..",
        ],
        colors={"H": (240, 206, 80), "C": (64, 150, 76)},
    ),
    "sora": dict(
        hair=[
            "....BBBBBBB.....",
            "...BBBBBBBBB....",
            "..BBBbbbbbBBB...",
            ".BBBBBBBBBBBBBB.",
            "..HHHHHHHHHHHH..",
            "..HHSHHHHSHHHH..",
        ],
        colors={"H": (226, 110, 44), "B": (60, 120, 230), "b": (40, 80, 170),
                "C": (250, 214, 70)},
    ),
    "koushiro": dict(
        hair=[
            "...H.H.H.H......",
            "..HHHHHHHHHH....",
            "..HHHHHHHHHHH...",
            "..HHHHHHHHHHHH..",
            "..HHHHHHHHHHHH..",
            "..HHSSHSSHSHHH..",
        ],
        colors={"H": (200, 62, 40), "C": (244, 140, 50)},
    ),
    "mimi": dict(
        hair=[
            ".....RRRRR......",
            "....RRRYRRR.....",
            "....RRRRRRR.....",
            "RRRRRRRRRRRRRRR.",
            "..HHHHHHHHHHHH..",
            ".HHHSHHHHHHSHHH.",
        ],
        colors={"H": (204, 146, 92), "R": (246, 112, 176), "Y": (255, 230, 80),
                "C": (228, 60, 70)},
        face={0: ".HHSSSSSSSSSSHH.", 3: ".H.SSSSMMSSSS.H."},
    ),
    "jou": dict(
        hair=[
            "....HHHHHHH.....",
            "...HHHHHHHHH....",
            "..HHHHHHHHHHH...",
            "..HHHHHHHHHHHH..",
            "..HHHHHHHHHHHH..",
            "..HHSSSSSSSSHH..",
        ],
        colors={"H": (44, 56, 112), "C": (176, 178, 190), "O": (40, 40, 52),
                "l": (206, 234, 252)},
        face={1: "..HOOOOSSOOOOH..", 2: "..HOlKOSSOlKOH.."},
        torso={0: "...KCWCCCCWCK..."},
    ),
    "takeru": dict(
        hair=[
            "....GGGGGGG.....",
            "...GGGGGGGGG....",
            "..GGGGGGGGGGG...",
            ".ggggggggggggg..",
            "..HHHHHHHHHHHH..",
            "..HHSHHHHSHHHH..",
        ],
        colors={"H": (240, 206, 80), "G": (90, 176, 70), "g": (56, 130, 46),
                "C": (232, 232, 120)},
    ),
    "hikari": dict(
        hair=[
            "....HHHHHHH.....",
            "...HHHHHHHHH....",
            "..HHHHHHHHHHH...",
            "..HHHHHHHHHHPP..",
            "..HHHHHHHHHHPP..",
            "..HHSSSSSSSSHH..",
        ],
        colors={"H": (130, 74, 40), "P": (246, 120, 170), "C": (248, 166, 196),
                "Y": (252, 214, 60)},
        torso={1: "..KCCCCYCCCCCK.."},
    ),
}

# ============================================================
# パートナーデジモン（16x16、左向き）
# ============================================================
DIGIMON = {
    "agumon": dict(
        grid=[
            "....KKKKK.......",
            "...KOOOOOK......",
            "..KOOEEOOOK.....",
            ".KOOOEKOOOOK....",
            "KOOOOOOOOOOK....",
            "KWKWKWKOOOOK....",
            ".KKKKKKOOOK.....",
            "...KOOOOOOK.....",
            "..KWKYYYOOOK....",
            "..KKKYYYOOOOK...",
            "....KYYYOOOOOK..",
            "....KOOOOKKOOOK.",
            "....KOOK.KOK.KK.",
            "...KOOK..KOOK...",
            "...KWWK..KWWK...",
            "...KKKK..KKKK...",
        ],
        colors={"O": (250, 166, 36), "Y": (252, 214, 120), "E": (40, 160, 70)},
        fx="flame",
        body=(250, 166, 36),
    ),
    "gabumon": dict(
        grid=[
            "........KK......",
            ".......KYK......",
            ".....KKBBBKK....",
            "....KBBWBBWBK...",
            "...KBBBBBBBBBK..",
            "..KBBYYYYYBBBK..",
            ".KYYYYEYYYBBBK..",
            "KYYYYYYYYYBBBK..",
            "KYYYYYYYYYBBK...",
            ".KKKKYYYYBBBBK..",
            "...KBBKKBBWBBBK.",
            "..KYYKBWBBBBBBBK",
            "...KKBBBBWBBBBK.",
            "....KBBKKKBBK...",
            "...KYYK.KYYK....",
            "...KKKK.KKKK....",
        ],
        colors={"B": (110, 160, 232), "W": (236, 246, 255), "Y": (250, 204, 86),
                "E": (210, 40, 40)},
        fx="frost",
        body=(110, 160, 232),
    ),
    "piyomon": dict(
        grid=[
            "....K.K.........",
            "...KBKYK........",
            "....KPPKK.......",
            "...KPPPPPK......",
            "..KPEPPPPPK.....",
            "GGKPPPPPPPK.....",
            ".GGKPPPPPPK.....",
            "..KKPPPPPPPK....",
            "...KPKPPPPPPK...",
            "..KPPPKPPPPPK...",
            ".KPPPPKPPPPPK...",
            ".KWKPKKPPPPK....",
            "..K.K.KPPPK.....",
            ".......KKK......",
            "......KGKGK.....",
            ".....KGGKGGK....",
        ],
        colors={"P": (246, 128, 170), "G": (200, 220, 90), "B": (80, 170, 240),
                "Y": (250, 210, 60), "E": (50, 140, 230)},
        fx="heart",
        body=(246, 128, 170),
    ),
    "tentomon": dict(
        grid=[
            "..K........K....",
            "...K......K.....",
            "...KKKKKKKK.....",
            "..KDEEDDEEDK....",
            "..KDEWDDEWDK....",
            "..KDDDKKDDDK....",
            ".KRRRRRRRRRRK...",
            "KRRrRRRRRRRRRK..",
            "KRrRRRRRKKRRRK..",
            "KRRRKKRRKKRRRK..",
            "KRRRKKRRRRRRRK..",
            ".KRRRRRRRKKRK...",
            "..KRRRRRRRRK....",
            "...KKRRKRRKK....",
            "...KDK..KDK.....",
            "..KKDK..KDKK....",
        ],
        colors={"R": (214, 48, 48), "r": (255, 150, 150), "D": (110, 72, 54),
                "E": (90, 220, 100)},
        fx="spark",
        body=(214, 48, 48),
    ),
    "palmon": dict(
        grid=[
            "...KK..KK.......",
            "..KPPKKPPK......",
            "..KPPPYPPK......",
            "...KKPPPKK......",
            "....KGGGK.......",
            "...KGGGGGK......",
            "..KGEGGGEGK.....",
            "..KGGGGGGGK.....",
            "...KGGKGGK......",
            "..KKGGGGGKK.....",
            ".KGKGGGGGKGK....",
            "KGK.KGGGK.KGK...",
            "KK..KGGGK..KK...",
            "...KGGKGGK......",
            "...KGK.KGK......",
            "..KKKK.KKKK.....",
        ],
        colors={"P": (246, 120, 170), "Y": (255, 224, 80), "G": (110, 200, 90),
                "E": (34, 32, 44)},
        fx="petal",
        body=(110, 200, 90),
    ),
    "gomamon": dict(
        grid=[
            "................",
            "................",
            "................",
            "..KKK...........",
            ".KOOOK..........",
            "KKWWWKK.........",
            "KWEWWEWK........",
            "KWWWWWWWKKKKK...",
            "KWWKKWWWWWWWWKK.",
            ".KWWWWWVWWWVWWWK",
            "..KWWWWWWWWWWWWK",
            ".KWWKWWWWVWWWKWK",
            "KWWWKWWWWWWWKWWK",
            "KKKKKKWWWWWKK.KK",
            ".....KKKKKK.....",
            "................",
        ],
        colors={"W": (244, 246, 252), "O": (246, 120, 40), "V": (150, 90, 210),
                "E": (34, 32, 44)},
        fx="bubble",
        body=(236, 240, 250),
    ),
    "patamon": dict(
        grid=[
            "................",
            "................",
            "KK............KK",
            "KOK..KKKKKK..KOK",
            ".KOKKOOOOOOKKOK.",
            "..KOOOOOOOOOOK..",
            "...KOOOOOOOOK...",
            "...KOEOOOOEOK...",
            "...KOEOOOOEOK...",
            "...KOOOKKOOOK...",
            "....KOCCCCOK....",
            "...KOCCCCCCOK...",
            "...KOCCCCCCOK...",
            "....KOOOOOOK....",
            "....KOK..KOK....",
            "....KKK..KKK....",
        ],
        colors={"O": (240, 158, 70), "C": (252, 232, 196), "E": (60, 120, 220)},
        fx="star",
        body=(240, 158, 70),
    ),
    "tailmon": dict(
        grid=[
            ".K.....K........",
            "KVK...KVK.......",
            "KWVKKKVWK.......",
            "KWWWWWWWK.......",
            "KWEWWWEWK.......",
            "KWWWKWWWK.......",
            ".KWWWWWK........",
            "..KKWKK.........",
            ".KYKWKYK.....K..",
            ".KRKWKRK....KVK.",
            "..KKWKK....KWK..",
            "...KWWK...KVK...",
            "...KWWK..KGK....",
            "...KWKWK.KWK....",
            "..KWK.KWKVK.....",
            "..KKK.KKKK......",
        ],
        colors={"W": (250, 250, 252), "V": (150, 90, 210), "Y": (252, 214, 60),
                "R": (220, 60, 60), "G": (240, 200, 60), "E": (60, 140, 230)},
        fx="ray",
        body=(250, 250, 252),
    ),
}

# エフェクト（3x3）。デジモンのまわりから立ちのぼる
FX = {
    "flame": ([".R.", "RYR", ".R."], {"R": (240, 80, 30), "Y": (255, 220, 80)}),
    "frost": (["B.B", ".W.", "B.B"], {"B": (110, 180, 255), "W": (200, 236, 255)}),
    "heart": (["R.R", "RRR", ".R."], {"R": (240, 70, 110)}),
    "spark": (["Y..", ".Y.", "..Y"], {"Y": (240, 200, 30)}),
    "petal": ([".P.", "PYP", ".P."], {"P": (246, 130, 186), "Y": (250, 210, 60)}),
    "bubble": ([".B.", "B.B", ".B."], {"B": (90, 170, 240)}),
    "star": ([".Y.", "YYY", ".Y."], {"Y": (240, 196, 30)}),
    "ray": (["Y.Y", ".W.", "Y.Y"], {"Y": (240, 200, 60), "W": (255, 236, 140)}),
}

# 上の段に出す、担当の作業アイコン（5x5）
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
    ("taichi-agumon", "taichi", "agumon", (250, 150, 50), "plan"),            # 勇気
    ("yamato-gabumon", "yamato", "gabumon", (70, 130, 230), "build"),         # 友情
    ("sora-piyomon", "sora", "piyomon", (230, 70, 80), "review"),             # 愛情
    ("koushiro-tentomon", "koushiro", "tentomon", (150, 90, 210), "search"),  # 知識
    ("mimi-palmon", "mimi", "palmon", (90, 190, 90), "design"),               # 純真
    ("jou-gomamon", "jou", "gomamon", (130, 130, 150), "test"),               # 誠実
    ("takeru-patamon", "takeru", "patamon", (235, 190, 40), "fix"),           # 希望
    ("hikari-tailmon", "hikari", "tailmon", (240, 120, 180), "report"),       # 光
]


def tint(c, t):
    return tuple(int(v + (255 - v) * t) for v in c)


def shade(c, t):
    return tuple(int(v * (1 - t)) for v in c)


def kid_rows(spec, blink):
    face = list(FACE)
    if blink and "face" not in spec:
        for i, row in FACE_BLINK.items():
            face[i] = row
    for i, row in spec.get("face", {}).items():
        face[i] = row
    torso = list(TORSO)
    for i, row in spec.get("torso", {}).items():
        torso[i] = row
    return spec["hair"] + face + torso


def squash(grid):
    """2コマ目：足の行を1行つぶして、体を1ドット沈める（携帯ゲームの足ぶみ風）。"""
    return ["." * 16] + grid[:12] + grid[13:]


class Lcd:
    def __init__(self):
        self.dots = [[None] * COLS for _ in range(ROWS)]

    def put(self, x, y, c):
        if 0 <= x < COLS and 0 <= y < ROWS:
            self.dots[y][x] = c

    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.put(x, y, c)

    def stamp(self, rows, pal, ox, oy):
        for y, row in enumerate(rows):
            for x, ch in enumerate(row):
                c = pal.get(ch)
                if c is not None:
                    self.put(ox + x, oy + y, c)


def scene(pair, f, sprite=None):
    """液晶のドット（COLS x ROWS、None は消灯）を返す。"""
    pid, kid_name, digi_name, crest, icon = pair
    kid, digi = KIDS[kid_name], DIGIMON[digi_name]
    lcd = Lcd()
    ink = (34, 32, 44)

    # --- 上の段：作業アイコン・流れるコード・進捗バー ---
    lcd.stamp(ICONS[icon], {"F": shade(crest, 0.15)}, 1, 1)
    code = [(70, 150, 230), (230, 170, 40), (80, 170, 80), (220, 90, 160)]
    lens = [9, 14, 6, 12, 16, 8, 11, 5]
    for i in range(2):
        k = (f + i * 3) % len(lens)
        lcd.rect(8 + (k % 2) * 2, 1 + i * 2, 8 + lens[k], 1 + i * 2, code[(f + i) % 4])
    if f % 2 == 0:  # カーソルの点滅
        lcd.put(10 + lens[(f + 3) % len(lens)], 3, ink)
    for x in range(8, COLS - 1):
        lcd.put(x, 5, (120, 200, 120) if x - 8 < (COLS - 9) * (f + 1) // FRAMES else (200, 204, 196))
    for x in range(0, COLS, 2):  # 区切りの点線
        lcd.put(x, 7, shade(crest, 0.1))

    # --- 子ども：ノートPCでタイピング ---
    kid_y = 9
    lcd.stamp(kid_rows(kid, blink=(f == 5)), {**BASE, **kid["colors"]}, 1, kid_y)
    lid, mark = (176, 180, 196), crest
    lcd.rect(4, kid_y + 11, 13, kid_y + 15, ink)
    lcd.rect(5, kid_y + 12, 12, kid_y + 15, lid)
    lcd.rect(8, kid_y + 13, 9, kid_y + 14, mark)
    lcd.rect(4, kid_y + 11, 13, kid_y + 11, (150, 220, 250) if f % 2 else (90, 180, 240))  # 画面の光
    for hx, up in ((2, f % 2 == 0), (14, f % 2 == 1)):
        hy = kid_y + (13 if up else 14)
        lcd.put(hx, hy, BASE["S"])
        lcd.put(hx, hy + 1, kid["colors"]["C"])
        if up:  # キーを打った火花
            lcd.put(hx + (1 if hx < 8 else -1), hy - 1, (255, 230, 90))
    lcd.rect(0, kid_y + 16, 17, kid_y + 16, (150, 100, 60))  # 机

    # --- デジモン：足ぶみしながら左右に歩く・技のエフェクト ---
    if sprite and len(sprite) > 1:  # 取り込んだドット絵（コマあり）
        grid = sprite[f % len(sprite)]
    else:
        g = sprite[0] if sprite else digi["grid"]
        grid = g if f % 2 == 0 else squash(g)
    step = [0, 0, 1, 1, 2, 2, 1, 1][f]
    dx, dy = 21 + step, 9
    lcd.stamp(grid, {**BASE, **digi["colors"], "Z": digi["body"]}, dx, dy)
    fx_rows, fx_pal = FX[digi["fx"]]
    for n, col in enumerate((19, 36)):
        t = (f + n * 4) % FRAMES
        lcd.stamp(fx_rows, fx_pal, col + (t % 2), 21 - t * 2)
    for x in range(COLS):  # 地面
        if x >= 18:
            lcd.put(x, ROWS - 1, shade(crest, 0.05) if x % 2 else None)
    return lcd.dots


# ------------------------------------------------------------
# 液晶と本体を描いてピクセルにする
# ------------------------------------------------------------
def render(pair, f, sprite=None):
    crest = pair[3]
    lcd_w, lcd_h = COLS * PITCH + GAP, ROWS * PITCH + GAP
    w = lcd_w + 2 * (BEZEL + SHELL)
    h = lcd_h + 2 * (BEZEL + SHELL) + BTN_H
    body, edge = tint(crest, 0.15), shade(crest, 0.35)
    bezel = (52, 52, 64)
    screen_bg = tint(crest, 0.82)
    unlit = shade(screen_bg, 0.06)
    px = [[(255, 255, 255)] * w for _ in range(h)]

    def fill(x0, y0, x1, y1, c, r=0):
        for y in range(max(0, y0), min(h, y1)):
            for x in range(max(0, x0), min(w, x1)):
                dx = max(x0 + r - x - 1, 0, x - (x1 - r))
                dy = max(y0 + r - y - 1, 0, y - (y1 - r))
                if r and dx * dx + dy * dy > r * r:
                    continue
                px[y][x] = c

    fill(0, 0, w, h, edge, 22)                       # 本体のふち
    fill(3, 3, w - 3, h - 3, body, 19)               # 本体
    fill(6, 6, w - 6, 12, tint(crest, 0.45), 4)      # 光の反射
    sx, sy = SHELL, SHELL
    fill(sx, sy, sx + lcd_w + 2 * BEZEL, sy + lcd_h + 2 * BEZEL, bezel, 10)
    lx, ly = sx + BEZEL, sy + BEZEL
    fill(lx, ly, lx + lcd_w, ly + lcd_h, screen_bg)
    dots = scene(pair, f, sprite)
    for r in range(ROWS):
        for c in range(COLS):
            col = dots[r][c] or unlit
            x0, y0 = lx + GAP + c * PITCH, ly + GAP + r * PITCH
            fill(x0, y0, x0 + DOT, y0 + DOT, col)
    # ボタン（3つ）
    by = sy + lcd_h + 2 * BEZEL + BTN_H // 2 + 2
    for i, bx in enumerate((w // 2 - 46, w // 2, w // 2 + 46)):
        fill(bx - 13, by - 9, bx + 13, by + 9, shade(crest, 0.5), 9)
        fill(bx - 11, by - 8, bx + 11, by + 6, (70, 120, 220) if i != 1 else (230, 230, 236), 8)
    return w, h, px


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


def find_sprite(digi_name):
    for path in sorted(glob.glob(os.path.join(SPRITE_DIR, digi_name + ".*"))):
        if not path.endswith(".md"):
            return path
    return None


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for pair in PAIRS:
        # オリジナルのドット絵（リポジトリに入る）
        frames = [render(pair, f)[2] for f in range(FRAMES)]
        gif = os.path.join(OUT_DIR, pair[0] + ".gif")
        write_gif(gif, frames)
        write_png(os.path.join(OUT_DIR, pair[0] + ".png"), frames[0])
        print(os.path.relpath(gif))
        # 自分で用意したドット絵があれば、それで custom/ に作る（GitHub には上がらない）
        src = find_sprite(pair[2])
        if src:
            sprite = vpet_import.load_sprite(src, body="Z")
            frames = [render(pair, f, sprite)[2] for f in range(FRAMES)]
            gif = os.path.join(CUSTOM_DIR, pair[0] + ".gif")
            write_gif(gif, frames)
            print(f"{os.path.relpath(gif)}  <- {os.path.relpath(src)}（{len(sprite)}コマ）")


if __name__ == "__main__":
    main()
