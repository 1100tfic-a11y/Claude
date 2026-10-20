# art/characters.png（キャラクター一覧の画像）から、各キャラの各段階を切り抜いて
# src/pet-images.js を作る。　使い方： python3 tools/crop_pets.py
# （Pillow が必要です。座標は画像の各パネル内の座標）
import os, json, base64, io
from PIL import Image, ImageOps
HERE = os.path.dirname(os.path.abspath(__file__))
im = Image.open(os.path.join(HERE, '..', 'art', 'characters.png')).convert('RGB')
PANEL = {  # パネルの左上（元画像の座標）
  1:(0,0), 2:(769,0), 3:(0,217), 4:(769,217), 5:(0,448), 6:(769,448), 7:(0,673), 8:(769,673), 9:(0,861)}
# キャラ: (パネル番号, 地面のy, いちばん上のy, タマゴ箱, [各段階の中心x])
CH = {
  'inu':   (1, 171, 14,  (22,78,152,212),  [273, 401, 501, 607, 695]),
  'neko':  (2, 171, 18,  (25,92,138,212),  [252, 397, 515, None, 678]),
  'usagi': (3, 170, 8,   (20,92,145,226),  [276, 380, 468, 578, 690]),
  'panda': (4, 187, 22,  (20,92,145,226),  [236, 342, 441, 552, 680]),
  'hamu':  (5, 177, 8,   (22,82,148,222),  [215, 323, 440, 548, 676]),
  'dragon':(6, 173, 8,   (25,88,145,222),  [200, 316, 442, 562, 683]),
  'knight':(7, 150, 2,   (32,90,142,185),  [218, 310, 405, 516, 638]),
  'ninja': (8, 150, 12,  (35,85,142,185),  [219, 335, 462, 575, 683]),
  'robo':  (9, 119, 0,   (32,78,142,163),  [210, 302, 403, 515, 645]),
}
RATIO = 0.75
out = {}
for cid, (pn, ground, top, egg, cxs) in CH.items():
  px, py = PANEL[pn]
  H = ground - top + 4
  W = round(H * RATIO)
  imgs = []
  # タマゴ
  ex0, ey0, ex1, ey1 = egg
  eh = ey1 - ey0; ew = round(eh * RATIO); ecx = (ex0 + ex1) / 2
  box = (px + round(ecx - ew / 2), py + ey0, px + round(ecx + ew / 2), py + ey1)
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
js = ('// tools/crop_pets.py で自動作成（art/characters.png から切り抜いた絵）。手で書きかえないでください。\n'
      '// PET_IMAGES[キャラ] = [タマゴ, 幼年期, 成長期, 成熟期, 完全体, 究極体]\n'
      'var PET_IMAGES = ' + json.dumps(out, indent=0) + ';\n')
open(os.path.join(HERE, '..', 'src', 'pet-images.js'), 'w').write(js)
print('src/pet-images.js', len(js) // 1024, 'KB')
