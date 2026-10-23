# art/01.png〜10.png（タマゴごとの進化の画像）から、各キャラの各段階を切り抜いて
# src/pet-images.js を作る。　使い方： python3 tools/crop_pets.py （Pillow が必要）
#
# 画像の作り：左上の丸にタマゴ、その下に4枚のカード（第1〜4段階）が横に並ぶ
# アプリの段階：0 タマゴ / 1 成長期 / 2 成熟期 / 3 完全体 / 4 究極体
import os, json, base64, io
from PIL import Image, ImageFilter, ImageEnhance, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
RATIO = 0.75                      # 表示の枠（横:縦 = 3:4）
OUT_H = 200                       # 保存する高さ
CARDS = [(24, 344), (390, 704), (760, 1068), (1132, 1518)]  # 各カードの絵の左右
ICON = (18, 4, 112, 98)           # 左上のタマゴの丸

# 画像の番号 → キャラ。egg: 'icon'（左上の丸）または 'card'（1枚目のカードがタマゴ）
# stages: 成長期・成熟期・完全体・究極体に使うカードの番号（0〜3）。
#   'flip:2' は「3枚目のカードを左右反転して仮に使う」（絵が足りないキャラ）
CHARS = [
  ('01', 'inu',     'icon', [0, 1, 2, 3]),
  ('02', 'neko',    'icon', [0, 1, 2, 3]),
  ('03', 'usagi',   'icon', [0, 1, 2, 3]),
  ('04', 'panda',   'icon', [0, 1, 2, 3]),
  ('05', 'hamu',    'icon', [0, 1, 2, 3]),
  ('06', 'dragon',  'icon', [0, 1, 2, 3]),
  ('07', 'samurai', 'icon', [0, 1, 2, 3]),
  ('08', 'ninja',   'icon', [0, 1, 2, 3]),
  ('09', 'robo',    'icon', [0, 1, 2, 3]),   # 1枚目（タマゴの形をしたキャラ）が成長期
  ('10', 'knight',  'icon', [0, 1, 2, 3]),
]

def card(im, k):
  x0, x1 = CARDS[k]
  w = x1 - x0; h = round(w / RATIO)
  y0 = max(215, 500 - h // 2); y1 = min(805, y0 + h)
  if y1 - y0 < h:  # 縦が足りないときは横をせまくする
    w2 = round((y1 - y0) * RATIO); cx = (x0 + x1) // 2; x0, x1 = cx - w2 // 2, cx - w2 // 2 + w2
  return im.crop((x0, y0, x1, y1))

def egg_icon(im):
  c = im.crop(ICON)
  W, H = round(OUT_H * RATIO), OUT_H
  bg = ImageEnhance.Brightness(c.resize((W, H)).filter(ImageFilter.GaussianBlur(8))).enhance(0.75)
  big = c.resize((W, W), Image.LANCZOS)
  bg.paste(big, (0, (H - W) // 2))
  return bg

def uri(img):
  img = img.resize((round(OUT_H * RATIO), OUT_H), Image.LANCZOS)
  b = io.BytesIO(); img.save(b, 'WEBP', quality=65, method=6)
  return 'data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode()

out = {}
for num, cid, egg, stages in CHARS:
  im = Image.open(os.path.join(HERE, '..', 'art', num + '.png')).convert('RGB')
  imgs = [egg_icon(im) if egg == 'icon' else card(im, 0)]
  for s in stages:
    if isinstance(s, str) and s.startswith('flip:'):
      imgs.append(ImageOps.mirror(card(im, int(s[5:]))))
    else:
      imgs.append(card(im, s))
  out[cid] = [uri(i) for i in imgs]

# ---- 超究極体（理解度Aを10回以上つけた生徒だけが進める）：art/super_*.png のカードの絵の部分だけ
SUPER = {'dragon': (200, 190, 980, 1230), 'samurai': (340, 114, 1020, 1020)}
for cid, box in SUPER.items():
  im = Image.open(os.path.join(HERE, '..', 'art', 'super_' + cid + '.png')).convert('RGB')
  out[cid].append(uri(im.crop(box)))

js = ('// tools/crop_pets.py で自動作成（art/01〜10.png から切り抜いた絵）。手で書きかえないでください。\n'
      '// PET_IMAGES[キャラ] = [タマゴ, 成長期, 成熟期, 完全体, 究極体(, 超究極体)]\n'
      'var PET_IMAGES = ' + json.dumps(out, indent=0) + ';\n')
open(os.path.join(HERE, '..', 'src', 'pet-images.js'), 'w').write(js)
print('src/pet-images.js', len(js) // 1024, 'KB')
