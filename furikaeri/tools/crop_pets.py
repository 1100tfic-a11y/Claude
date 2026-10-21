# art/characters.png（キャラクター一覧の画像）から、各キャラの各段階を切り抜いて
# src/pet-images.js を作る。　使い方： python3 tools/crop_pets.py
# （Pillow が必要です。座標は画像の各パネル内の座標）
import os, json, base64, io
from PIL import Image, ImageOps
HERE = os.path.dirname(os.path.abspath(__file__))
im = Image.open(os.path.join(HERE, '..', 'art', 'characters.png')).convert('RGB')
PANEL = {  # パネルの左上（元画像の座標）
  1:(0,0), 2:(769,0), 3:(0,218), 4:(769,218), 5:(0,432), 6:(769,432), 7:(0,637), 8:(769,637), 9:(0,825), 10:(769,825)}
# キャラ: (パネル番号, 地面のy, いちばん上のy, タマゴ箱, [各段階の中心x], タマゴのパネル番号)
# ※ この画像には侍のパネルが無いので、侍は下の art/samurai.jpg から切り抜きます。黒ねこの完全体も無いので、成熟期を反転して仮に使います
CH = {
  'inu':   (1, 172, 8,   (30,82,152,212),  [235, 342, 462, 565, 680]),
  'neko':  (2, 173, 4,   (15,82,140,212),  [245, 370, 517, None, 670]),
  'usagi': (3, 168, 0,   (25,80,150,206),  [248, 345, 440, 563, 680]),
  'panda': (4, 172, 22,  (15,85,135,210),  [205, 320, 432, 540, 675]),
  'hamu':  (5, 160, 0,   (15,82,140,198),  [224, 325, 433, 545, 665], 10),  # タマゴはピンクの10番を使う
  'dragon':(6, 162, 8,   (15,85,135,200),  [205, 320, 440, 565, 690]),
  'knight':(7, 145, 4,   (35,80,140,185),  [200, 292, 382, 512, 662]),
  'ninja': (8, 142, 28,  (18,88,125,185),  [202, 318, 452, 588, 682]),
  'robo':  (9, 148, 6,   (35,82,140,198),  [210, 302, 400, 515, 650]),
}
RATIO = 0.75
out = {}
for cid, spec in CH.items():
  pn, ground, top, egg, cxs = spec[:5]
  epx, epy = PANEL[spec[5] if len(spec) > 5 else pn]
  px, py = PANEL[pn]
  H = ground - top + 4
  W = round(H * RATIO)
  imgs = []
  # タマゴ
  ex0, ey0, ex1, ey1 = egg
  eh = ey1 - ey0; ew = round(eh * RATIO); ecx = (ex0 + ex1) / 2
  box = (epx + round(ecx - ew / 2), epy + ey0, epx + round(ecx + ew / 2), epy + ey1)
  e = im.crop(box)
  if cid == 'panda':  # 青いタマゴを、かわいい系のピンクに
    hsv = e.convert('HSV'); h, s_, v = hsv.split()
    h = h.point(lambda x: (x + 85) % 256)
    e = Image.merge('HSV', (h, s_, v)).convert('RGB')
  imgs.append(e)
  for i, cx in enumerate(cxs):
    if cx is None:
      imgs.append(None); continue
    # 幼年期は小さいので、まわりを狭く切り抜いて大きく見せる（題字が入らないように）
    hh, ww = (round(H * 0.62), round(H * 0.62 * RATIO)) if i == 0 else (H, W)
    x0 = max(px, px + round(cx - ww / 2)); x1 = x0 + ww
    if x1 > px + 767 and pn % 2 == 0 or x1 > im.size[0]: x1 = min(im.size[0], px + 767); x0 = x1 - ww
    imgs.append(im.crop((x0, py + ground - hh + 2, x1, py + ground + 2)))
  if cid == 'panda':  # パンダの幼年期のから（青）もピンクに。青い部分だけ色を変える
    hsv = imgs[1].convert('HSV'); h, s_, v = hsv.split()
    hp, sp = h.load(), s_.load()
    for yy in range(h.size[1]):
      for xx in range(h.size[0]):
        if 125 <= hp[xx, yy] <= 185 and sp[xx, yy] > 50: hp[xx, yy] = (hp[xx, yy] + 85) % 256
    imgs[1] = Image.merge('HSV', (h, s_, v)).convert('RGB')
  # 黒ねこの完全体は元の絵が無いので、成熟期を左右反転して仮に使う
  if cid == 'neko': imgs[4] = ImageOps.mirror(imgs[3])
  uris = []
  for i, p in enumerate(imgs):
    b = io.BytesIO(); p.save(b, 'WEBP', quality=80, method=6)
    uris.append('data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode())
  out[cid] = uris
# ---- 侍（かたなのタマゴ）：別の画像 art/samurai.jpg から
# キャラどうしが近いので、本人だけをくっきり切り抜き、まわりはぼかした背景で埋める
from PIL import ImageFilter, ImageEnhance, ImageDraw
sam = Image.open(os.path.join(HERE, '..', 'art', 'samurai.jpg')).convert('RGB')
SAM = [  # (左, 上, 右, 下)：本人の範囲
  (20, 600, 210, 830), (215, 500, 445, 830), (480, 385, 690, 836),
  (700, 150, 985, 842), (955, 100, 1315, 842), (1265, 40, 1776, 846)]
uris = []
for i, (x0, y0, x1, y1) in enumerate(SAM):
  H = y1 - y0; W = round(H * RATIO); cx = (x0 + x1) / 2
  bx0 = max(0, min(sam.width - W, round(cx - W / 2)))
  wide = sam.crop((bx0, y0, bx0 + W, y1))
  if x1 - x0 < W:
    bg = ImageEnhance.Brightness(wide.filter(ImageFilter.GaussianBlur(H / 40))).enhance(0.85)
    tight = sam.crop((x0, y0, x1, y1))
    m = Image.new('L', tight.size, 255); d = ImageDraw.Draw(m); f = max(6, (x1 - x0) // 12)
    for k in range(f):
      a_ = round(255 * k / f); d.line([(k, 0), (k, H)], fill=a_); d.line([(tight.width - 1 - k, 0), (tight.width - 1 - k, H)], fill=a_)
    bg.paste(tight, (x0 - bx0, 0), m)
    wide = bg
  wide = wide.resize((round(220 * RATIO), 220), Image.LANCZOS)
  b = io.BytesIO(); wide.save(b, 'WEBP', quality=80, method=6)
  uris.append('data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode())
out['samurai'] = uris

# ---- ロボット（ギアのタマゴ）：別の画像 art/gear.png から
# カードが縦長なので、3:4 の枠に合わせて、左右のあまりはぼかした同じ絵で埋める
gear = Image.open(os.path.join(HERE, '..', 'art', 'gear.png')).convert('RGB')
GEAR = [(28, 212, 226, 545), (252, 212, 440, 545), (464, 212, 654, 545),
        (680, 212, 873, 545), (897, 212, 1108, 545), (1171, 198, 1505, 640)]
uris = []
for x0, y0, x1, y1 in GEAR:
  c = gear.crop((x0, y0, x1, y1)); H = c.height; W = round(H * RATIO)
  if c.width < W:
    bg = ImageEnhance.Brightness(c.resize((W, H)).filter(ImageFilter.GaussianBlur(10))).enhance(0.7)
    bg.paste(c, ((W - c.width) // 2, 0)); c = bg
  c = c.resize((round(220 * RATIO), 220), Image.LANCZOS)
  b = io.BytesIO(); c.save(b, 'WEBP', quality=80, method=6)
  uris.append('data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode())
# 完全体は、顔のアップの代わりに全身像（art/gear_complete.jpg）を使う
gc = Image.open(os.path.join(HERE, '..', 'art', 'gear_complete.jpg')).convert('RGB')
H = gc.height; W = round(H * RATIO); x0 = (gc.width - W) // 2
gc = gc.crop((x0, 0, x0 + W, H)).resize((round(220 * RATIO), 220), Image.LANCZOS)
b = io.BytesIO(); gc.save(b, 'WEBP', quality=80, method=6)
uris[4] = 'data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode()
out['robo'] = uris

# ---- 騎士（たてのタマゴ）：別の画像 art/tate.png から（カードの絵の部分）
tate = Image.open(os.path.join(HERE, '..', 'art', 'tate.png')).convert('RGB')
TATE = [(4, 150, 244, 478), (260, 145, 496, 478), (508, 140, 726, 478),
        (738, 138, 964, 478), (984, 138, 1220, 478), (1244, 140, 1528, 478)]
uris = []
for x0, y0, x1, y1 in TATE:
  c = tate.crop((x0, y0, x1, y1)); H = c.height; W = round(H * RATIO)
  if c.width < W:
    bg = ImageEnhance.Brightness(c.resize((W, H)).filter(ImageFilter.GaussianBlur(10))).enhance(0.7)
    bg.paste(c, ((W - c.width) // 2, 0)); c = bg
  elif c.width > W:
    k = (c.width - W) // 2; c = c.crop((k, 0, k + W, H))
  c = c.resize((round(220 * RATIO), 220), Image.LANCZOS)
  b = io.BytesIO(); c.save(b, 'WEBP', quality=80, method=6)
  uris.append('data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode())
out['knight'] = uris

js = ('// tools/crop_pets.py で自動作成（art/characters.png から切り抜いた絵）。手で書きかえないでください。\n'
      '// PET_IMAGES[キャラ] = [タマゴ, 幼年期, 成長期, 成熟期, 完全体, 究極体]\n'
      'var PET_IMAGES = ' + json.dumps(out, indent=0) + ';\n')
open(os.path.join(HERE, '..', 'src', 'pet-images.js'), 'w').write(js)
print('src/pet-images.js', len(js) // 1024, 'KB')
