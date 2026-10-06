"""パートナーデジモンのドット絵（32x32・左向き）を、図形の組み合わせで描く。

各デジモンは draw_<名前>(c, f) で、コマ番号 f に応じて腕・羽・まばたきを動かす。
図形（だ円・多角形・線）で体を作り、最後に陰影と輪郭線を自動で付ける。
絵はすべてこのリポジトリ用のオリジナル。
"""

N = 32
OUTLINE = (34, 30, 42)


def tint(c, t):
    return tuple(int(v + (255 - v) * t) for v in c)


def shade(c, t):
    return tuple(int(v * (1 - t)) for v in c)


class Sprite:
    def __init__(self):
        self.px = [[None] * N for _ in range(N)]
        self.flat = set()  # 陰影を付けない細部

    def put(self, x, y, c, flat=False):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < N and 0 <= y < N:
            self.px[y][x] = c
            if flat:
                self.flat.add((x, y))
            else:
                self.flat.discard((x, y))

    def ell(self, cx, cy, rx, ry, c, flat=False):
        for y in range(N):
            for x in range(N):
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0:
                    self.put(x, y, c, flat)

    def rect(self, x0, y0, x1, y1, c, flat=False):
        for y in range(int(y0), int(y1) + 1):
            for x in range(int(x0), int(x1) + 1):
                self.put(x, y, c, flat)

    def poly(self, pts, c, flat=False):
        for y in range(N):
            for x in range(N):
                px, py = x, y
                inside = False
                j = len(pts) - 1
                for i in range(len(pts)):
                    xi, yi = pts[i]
                    xj, yj = pts[j]
                    if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
                        inside = not inside
                    j = i
                if inside:
                    self.put(x, y, c, flat)

    def line(self, x0, y0, x1, y1, c=OUTLINE):
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for i in range(n + 1):
            t = i / n
            self.put(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, c, True)

    def finish(self):
        """陰影（下と右の縁を暗く、上の縁を明るく）と、外側の輪郭線を付ける。"""
        src = [row[:] for row in self.px]

        def empty(x, y):
            return not (0 <= x < N and 0 <= y < N) or src[y][x] is None

        for y in range(N):
            for x in range(N):
                c = src[y][x]
                if c is None or c == OUTLINE or (x, y) in self.flat:
                    continue
                if empty(x + 1, y) or empty(x, y + 1) or (src[y + 1][x] != c if y + 1 < N else False):
                    self.px[y][x] = shade(c, 0.18)
                elif empty(x, y - 1):
                    self.px[y][x] = tint(c, 0.3)
        for y in range(N):
            for x in range(N):
                if src[y][x] is None and any(
                        not empty(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    self.px[y][x] = OUTLINE
        return self.px


def eye(s, x, y, iris, closed, big=False):
    if closed:
        s.line(x - 1, y + 1, x + (2 if big else 1), y + 1)
        return
    w = 3 if big else 2
    s.rect(x - 1, y - 1, x + w - 1, y + 2, OUTLINE, True)
    s.rect(x, y, x + w - 2, y + 1, iris, True)
    s.put(x, y, (255, 255, 255), True)


# ------------------------------------------------------------
# 各デジモン。arm = 0/1（タイピングの手の上下）、blink = まばたき
# ------------------------------------------------------------
def draw_agumon(f):
    s = Sprite()
    O, Y, W = (250, 168, 40), (252, 206, 110), (250, 250, 250)
    arm = f % 2
    s.poly([(20, 22), (31, 29), (30, 31), (19, 29)], O)            # しっぽ
    s.ell(19, 23, 7, 7, O)                                          # 胴
    s.ell(17, 25, 4, 4, Y)                                          # おなか
    s.rect(13, 27, 17, 30, O)                                       # 足
    s.rect(20, 27, 24, 30, O)
    s.ell(16, 10, 9, 7, O)                                          # 頭
    s.ell(8, 13, 7, 4, O)                                           # 口先
    s.ell(15, 17, 4, 3, O)                                          # 首
    s.poly([(14, 19), (6, 21 + arm), (6, 24 + arm), (14, 23)], O)   # 腕（キーボードへ）
    px = s
    eye(px, 12, 7, (60, 170, 70), f == 5, big=True)
    px.line(2, 15, 15, 15)                                          # 口
    for x in (4, 7, 10):                                            # 歯
        px.put(x, 16, W, True)
    px.put(5, 11, OUTLINE, True)                                    # 鼻の穴
    for x in (5, 7):                                                # 手のつめ
        px.put(x, 24 + arm, W, True)
    for x in (13, 15, 20, 22):                                      # 足のつめ
        px.put(x, 30, W, True)
    return s.finish()


def draw_gabumon(f):
    s = Sprite()
    P, B, Y, H = (214, 232, 252), (70, 110, 210), (246, 190, 86), (250, 214, 60)
    arm = f % 2
    s.poly([(22, 22), (31, 25), (30, 28), (21, 27)], P)             # しっぽ（毛皮）
    s.ell(19, 22, 7, 8, P)                                          # 胴（毛皮）
    s.rect(13, 27, 17, 30, Y)                                       # 足
    s.rect(20, 27, 24, 30, Y)
    s.ell(16, 11, 9, 8, P)                                          # 頭（毛皮のフード）
    s.poly([(18, 4), (20, 0), (22, 5)], H)                          # つの
    s.ell(10, 13, 6, 5, Y)                                          # 顔
    s.ell(6, 15, 5, 3, Y)                                           # 口先
    s.poly([(14, 19), (6, 21 + arm), (6, 24 + arm), (14, 23)], Y)   # 腕
    for (x0, y0, x1, y1) in ((14, 5, 17, 9), (19, 5, 22, 10), (19, 16, 25, 19), (17, 22, 24, 25),
                             (22, 27, 26, 27), (25, 23, 29, 26)):
        s.line(x0, y0, x1, y1, B)                                   # しま模様（ななめ）
        s.line(x0 + 1, y0, x1 + 1, y1, B)
    eye(s, 9, 11, (200, 40, 40), f == 5)
    s.line(2, 16, 9, 17)                                            # 口
    s.put(3, 13, OUTLINE, True)                                     # 鼻
    s.put(6, 23 + arm, (250, 250, 250), True)
    return s.finish()


def draw_piyomon(f):
    s = Sprite()
    P, Y, G, B = (246, 128, 168), (246, 214, 70), (150, 210, 90), (80, 170, 240)
    wing = f % 2
    s.ell(19, 22, 7, 7, P)                                          # 胴
    s.rect(15, 28, 16, 31, G)                                       # 足
    s.rect(20, 28, 21, 31, G)
    s.ell(15, 11, 8, 7, P)                                          # 頭
    s.poly([(14, 4), (12, 0), (16, 3), (18, 0), (19, 4)], P)        # 頭の羽
    s.put(12, 0, B, True)
    s.put(18, 0, B, True)
    s.poly([(8, 11), (1, 14), (8, 16)], G)                          # くちばし
    s.poly([(17, 17), (8, 20 + wing), (5, 23 + wing), (17, 25)], P)  # 羽（キーボードへ）
    s.poly([(23, 18), (30, 15 - 2 * wing), (29, 22), (23, 24)], P)  # うしろの羽
    eye(s, 11, 9, B, f == 5, big=True)
    for x in (5, 7):
        s.put(x, 23 + wing, Y, True)                                # 羽のつめ
    s.rect(15, 27, 16, 27, Y, True)
    return s.finish()


def draw_tentomon(f):
    s = Sprite()
    R, D, G = (214, 48, 48), (96, 70, 54), (90, 220, 100)
    arm, buzz = f % 2, f % 2
    if buzz:                                                        # 羽（ブーン）
        s.ell(25, 9, 6, 4, (220, 230, 250), True)
    else:
        s.ell(26, 13, 5, 3, (220, 230, 250), True)
    s.ell(20, 19, 9, 9, R)                                          # 甲ら
    s.ell(12, 13, 6, 6, D)                                          # 頭
    s.line(10, 7, 7, 1)                                             # しょっかく
    s.line(13, 7, 14, 1)
    s.ell(14, 26, 5, 3, D)                                          # おなか
    s.rect(12, 28, 13, 31, D)                                       # 足
    s.rect(18, 28, 19, 31, D)
    s.poly([(13, 19), (5, 21 + arm), (5, 23 + arm), (13, 22)], D)   # 腕
    s.poly([(13, 23), (7, 26 - arm), (7, 27 - arm), (13, 25)], D)
    for (x, y) in ((19, 15), (24, 20), (18, 23), (25, 14)):
        s.ell(x, y, 1.6, 1.6, OUTLINE, True)                        # 甲らの点
    s.line(20, 11, 20, 27)                                          # 甲らの合わせ目
    if f == 5:
        s.line(7, 12, 10, 12, G)
        s.line(13, 12, 16, 12, G)
    else:
        s.ell(9, 12, 2.2, 2.2, G, True)                             # 大きな複眼
        s.ell(14, 12, 2.2, 2.2, G, True)
        s.put(8, 11, (230, 255, 230), True)
        s.put(13, 11, (230, 255, 230), True)
    s.line(9, 17, 13, 17)                                           # 口
    return s.finish()


def draw_palmon(f):
    s = Sprite()
    G, P, Y, V = (110, 196, 88), (246, 120, 170), (252, 222, 80), (150, 90, 200)
    arm = f % 2
    s.ell(18, 23, 5, 6, G)                                          # 胴
    s.rect(14, 28, 16, 31, G)                                       # 足
    s.rect(19, 28, 21, 31, G)
    s.ell(16, 13, 6, 6, G)                                          # 頭
    for (x, y) in ((11, 4), (16, 2), (21, 4), (13, 8), (19, 8)):
        s.ell(x, y, 3.2, 2.6, P)                                    # 花びら
    s.ell(16, 5, 2.2, 2, Y)                                         # 花のまん中
    s.poly([(14, 19), (4, 21 + arm), (3, 23 + arm), (14, 23)], G)   # つる（キーボードへ）
    s.poly([(22, 20), (29, 24 - arm), (29, 26 - arm), (22, 24)], G)
    eye(s, 13, 12, Y, f == 5)
    eye(s, 17, 12, Y, f == 5)
    s.line(14, 16, 16, 16)                                          # 口
    for x in (3, 5):
        s.put(x, 22 + arm, V, True)                                 # つるの先（つめ）
    return s.finish()


def draw_gomamon(f):
    s = Sprite()
    W, O, V = (240, 242, 250), (246, 120, 40), (150, 90, 210)
    arm = f % 2
    s.poly([(16, 19), (28, 21), (31, 27), (29, 30), (14, 30)], W)   # 胴（ねそべり）
    s.ell(14, 18, 8, 6, W)                                          # 頭
    s.ell(6, 21, 5, 3.5, W)                                         # 鼻先
    s.poly([(11, 13), (12, 8), (14, 12), (16, 7), (18, 12), (20, 9), (21, 14)], O)  # たてがみ
    s.poly([(12, 24), (4, 26 + arm), (4, 29 + arm), (14, 28)], W)   # 前ひれ（キーボードへ）
    s.rect(23, 29, 27, 30, W)                                       # うしろ足
    for (x0, y0, x1, y1) in ((22, 22, 24, 23), (26, 25, 27, 27), (18, 26, 20, 27), (17, 15, 18, 16)):
        s.rect(x0, y0, x1, y1, V, True)                             # むらさきの模様
    eye(s, 9, 17, OUTLINE, f == 5)
    eye(s, 14, 17, OUTLINE, f == 5)
    s.ell(2.5, 20.5, 1.2, 1, OUTLINE, True)                         # 鼻
    s.line(4, 23, 8, 23)                                            # 口
    for x in (4, 6):
        s.put(x, 29 + arm, OUTLINE, True)                           # つめ
    return s.finish()


def draw_patamon(f):
    s = Sprite()
    O, C, B = (238, 156, 66), (252, 232, 196), (60, 120, 220)
    flap = f % 2
    s.ell(17, 18, 9, 8, O)                                          # 体（頭と一体）
    s.ell(16, 22, 5, 4, C)                                          # おなか
    if flap:                                                        # 羽（耳）
        s.poly([(10, 12), (1, 4), (6, 13)], O)
        s.poly([(24, 12), (31, 4), (28, 13)], O)
    else:
        s.poly([(10, 13), (0, 14), (7, 17)], O)
        s.poly([(24, 13), (31, 14), (27, 17)], O)
    s.rect(13, 25, 15, 28, O)                                       # 足
    s.rect(19, 25, 21, 28, O)
    s.poly([(12, 20), (5, 22 + flap), (5, 24 + flap), (12, 23)], O)  # 手（キーボードへ）
    eye(s, 13, 15, B, f == 5, big=True)
    eye(s, 19, 15, B, f == 5, big=True)
    s.line(15, 20, 17, 20)                                          # 口
    return s.finish()


def draw_tailmon(f):
    s = Sprite()
    W, V, Y, R, G, B = ((250, 250, 252), (150, 90, 210), (250, 214, 60), (220, 60, 60),
                        (240, 200, 60), (60, 140, 230))
    arm = f % 2
    s.poly([(20, 25), (28, 22), (31, 14 + arm), (29, 13 + arm), (27, 20), (20, 22)], W)  # しっぽ
    s.ell(17, 22, 4, 5, W)                                          # 胴
    s.rect(14, 26, 15, 31, W)                                       # 足
    s.rect(19, 26, 20, 31, W)
    s.ell(16, 12, 7, 6, W)                                          # 頭
    s.poly([(9, 9), (7, 1), (13, 7)], W)                            # 耳
    s.poly([(19, 7), (25, 1), (23, 9)], W)
    s.poly([(14, 18), (6, 20 + arm), (6, 23 + arm), (14, 22)], W)   # 腕
    s.rect(5, 20 + arm, 8, 23 + arm, Y, True)                       # 手ぶくろ
    s.line(5, 21 + arm, 5, 23 + arm, R)                             # つめ
    s.line(8, 2, 9, 6, V)                                           # 耳のしま
    s.line(24, 2, 22, 6, V)
    for y in (16, 18):
        s.put(29, y - 2 + arm, V, True)                             # しっぽのしま
    s.put(25, 21, G, True)                                          # しっぽの輪
    s.put(26, 21, G, True)
    eye(s, 12, 11, B, f == 5, big=True)
    eye(s, 17, 11, B, f == 5, big=True)
    s.line(13, 15, 15, 15)                                          # 口
    s.put(14, 14, (240, 130, 160), True)                            # 鼻
    return s.finish()


DRAW = {
    "agumon": draw_agumon, "gabumon": draw_gabumon, "piyomon": draw_piyomon,
    "tentomon": draw_tentomon, "palmon": draw_palmon, "gomamon": draw_gomamon,
    "patamon": draw_patamon, "tailmon": draw_tailmon,
}
