/* =========================================================================
 * 育成キャラクター（10種類 × 6段階）を SVG で描く
 *   PETS.list          … キャラクターの一覧
 *   PETS.get(id)       … 1体の情報
 *   PETS.svg(id, st)   … 段階 st（0=タマゴ 〜 5=究極体）の絵（SVG文字列）
 *   PETS.STAGES        … 段階の名前
 * 画像ファイルは使わず、すべて図形で描いています。
 * タマゴの色だけ「かわいい系＝ピンク」「かっこいい系＝青」で、生まれた後の色は自由です。
 * ========================================================================= */
var PETS = (function(){
  var STAGES = ['タマゴ', '幼年期', '成長期', '成熟期', '完全体', '究極体'];

  // type: cute（ピンクのタマゴ）/ cool（青のタマゴ）　egg: タマゴの色 [こい色, うすい色]　aura: 究極体の光の色
  var LIST = [
    { id:'inu',     type:'cute', pattern:'paws',     egg:['#ff8fb1','#ffe3ec'], ink:'#4a2a10', aura:'#ffb347',
      names:['にくきゅうのタマゴ','こしば','しばまる','ワンダフル','ヒーローわんこ','聖獣こまいぬ'] },
    { id:'neko',    type:'cute', pattern:'stars',    egg:['#ee8fd0','#fde8f6'], ink:'#16141f', aura:'#b388ff',
      names:['ほしのタマゴ','くろにゃん','ノワール','まほうねこ','ムーンウィッチ','星の大魔女ルナ'] },
    { id:'usagi',   type:'cute', pattern:'hearts',   egg:['#ff9eb5','#fff0f3'], ink:'#5a3442', aura:'#ffd6f0',
      names:['ハートのタマゴ','ちびうさ','ぴょんた','はなうさぎ','フラワープリンセス','月のうさぎ姫'] },
    { id:'panda',   type:'cute', pattern:'dots',     egg:['#f78fb3','#ffe6f0'], ink:'#1c1c1c', aura:'#9be15d',
      names:['みずたまのタマゴ','ころぱん','パンパン','ささパンダ','カンフーパンダ','パンダ大王'] },
    { id:'hamu',    type:'cute', pattern:'flowers',  egg:['#f6a6d0','#fdeef7'], ink:'#5c3a1a', aura:'#ffd23f',
      names:['ひまわりのタマゴ','ちびハム','ほっぺハム','もぐもぐハム','どんぐり探検家','ひまわり女王ハム'] },

    { id:'dragon',  type:'cool', pattern:'scales',   egg:['#3d7bf2','#d9e8ff'], ink:'#3d0f06', aura:'#ff7a29',
      names:['りゅうのタマゴ','チビドラ','ボルカドラ','フレアドラゴン','インフェルノドラゴン','紅蓮竜王バハムーン'] },
    { id:'samurai', type:'cool', pattern:'zigzag',   egg:['#2f5fbf','#dbe6fb'], ink:'#1d1b2e', aura:'#f06595',
      names:['かたなのタマゴ','わかまる','けんたろう','サムライ剣士','鎧武者','天下無双の将軍'] },
    { id:'knight',  type:'cool', pattern:'shields',  egg:['#4a86c8','#dfeaf6'], ink:'#232836', aura:'#fff3a8',
      names:['たてのタマゴ','ヒナドラ','ボルカドラ','フレアドラゴン','インフェルノドラゴン','超躍竜王バルーン'] },
    { id:'ninja',   type:'cool', pattern:'shuriken', egg:['#2a6fd0','#dcebff'], ink:'#120f1c', aura:'#b46bff',
      names:['しゅりけんのタマゴ','ちびにん','にんまる','シノビ','影丸','忍頭ハンゾウ'] },
    { id:'robo',    type:'cool', pattern:'gears',    egg:['#1f8fb8','#d8f1f8'], ink:'#1b1f24', aura:'#5ff2ff',
      names:['ギアのタマゴ','ギアトル','ギアキッド','ギアブレード','ギア・アルティメット','真・ギア・アルティメット'] }
  ];
  var BY = {};
  LIST.forEach(function(p){ BY[p.id] = p; });

  // ------------------------------------------------------------ 小さな道具
  var K = 1; // いま描いている縮尺（線の太さをそろえるため）
  var INK = '#222';
  function at(o){ var s = ''; for (var k in o) if (o[k] != null) s += ' ' + k + '="' + o[k] + '"'; return s; }
  function L(w){ return 'stroke="' + INK + '" stroke-width="' + ((w || 3) / K).toFixed(2) + '" stroke-linejoin="round" stroke-linecap="round"'; }
  function S(color, w){ return 'fill="none" stroke="' + color + '" stroke-width="' + (w / K).toFixed(2) + '" stroke-linecap="round" stroke-linejoin="round"'; }
  function circle(x, y, r, fill, extra){ return '<circle' + at({ cx:x, cy:y, r:r, fill:fill }) + ' ' + (extra || '') + '/>'; }
  function ell(x, y, rx, ry, fill, extra, rot){
    return '<ellipse' + at({ cx:x, cy:y, rx:rx, ry:ry, fill:fill, transform: rot ? 'rotate(' + rot + ' ' + x + ' ' + y + ')' : null }) + ' ' + (extra || '') + '/>';
  }
  function rect(x, y, w, h, r, fill, extra, rot){
    return '<rect' + at({ x:x, y:y, width:w, height:h, rx:r, fill:fill, transform: rot ? 'rotate(' + rot + ')' : null }) + ' ' + (extra || '') + '/>';
  }
  function path(d, fill, extra){ return '<path d="' + d + '" fill="' + fill + '" ' + (extra || '') + '/>'; }
  function g(tf, inner){ return '<g transform="' + tf + '">' + inner + '</g>'; }
  function both(fn){ return fn(-1) + fn(1); }
  function petal(cx, cy, dist, rx, ry, deg, fill, extra){
    return '<ellipse' + at({ cx:cx, cy:cy - dist, rx:rx, ry:ry, fill:fill, transform:'rotate(' + deg + ' ' + cx + ' ' + cy + ')' }) + ' ' + (extra || '') + '/>';
  }
  function starPts(x, y, r, n, inner){
    n = n || 5; inner = inner || 0.45; var p = [];
    for (var i = 0; i < n * 2; i++) {
      var a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? r * inner : r;
      p.push((x + Math.cos(a) * rr).toFixed(1) + ',' + (y + Math.sin(a) * rr).toFixed(1));
    }
    return p.join(' ');
  }
  function star(x, y, r, fill, extra, n, inner){ return '<polygon points="' + starPts(x, y, r, n, inner) + '" fill="' + fill + '" ' + (extra || '') + '/>'; }
  function heart(x, y, s, fill, extra){
    return '<path transform="translate(' + x + ' ' + y + ') scale(' + s + ')" d="M0 4C0-2-9-2-9 4C-9 9-3 12 0 15C3 12 9 9 9 4C9-2 0-2 0 4Z" fill="' + fill + '" ' + (extra || '') + '/>';
  }
  function bolt(x, y, s, fill, extra){
    return '<path transform="translate(' + x + ' ' + y + ') scale(' + s + ')" d="M2-12L-7 2H0L-3 13L8-3H1Z" fill="' + fill + '" ' + (extra || '') + '/>';
  }
  function sparkle(x, y, r, fill){
    return '<path d="M' + x + ' ' + (y - r) + 'Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + 'Q' + x + ' ' + y + ' ' + x + ' ' + (y + r) +
      'Q' + x + ' ' + y + ' ' + (x - r) + ' ' + y + 'Q' + x + ' ' + y + ' ' + x + ' ' + (y - r) + 'Z" fill="' + fill + '"/>';
  }
  function flower(x, y, r, petalColor, center){
    var s = '';
    for (var i = 0; i < 5; i++) s += petal(x, y, r * 0.62, r * 0.42, r * 0.6, i * 72, petalColor, L(1.6));
    return s + circle(x, y, r * 0.38, center || '#ffd23f', L(1.6));
  }
  function flame(x, y, s, outer, inner){
    return g('translate(' + x + ' ' + y + ') scale(' + s + ')',
      path('M0 0C-14 0-20-12-14-24C-12-16-6-16-6-16C-10-28-2-38 6-44C4-34 14-30 16-20C18-24 18-28 16-32C26-22 24 0 0 0Z', outer || '#ff7a29', L(2.2)) +
      path('M0-4C-7-4-9-12-5-18C-4-12 0-12 0-12C-1-20 4-24 8-28C8-20 13-16 10-8C9-5 6-4 0-4Z', inner || '#ffd23f'));
  }
  var uid = 0;

  // ------------------------------------------------------------ 顔のパーツ
  // 動物の目：色のついた虹彩・瞳孔・光の反射・上まぶた
  // かわいい系の目：大きくてキラキラした瞳（上が濃く下が明るい虹彩・大小の光・まつげ）
  function eyesCute(cx, cy, gap, s, col){
    col = col || '#5a3418';
    s *= 1.25;
    return both(function(d){
      var x = cx + d * gap;
      return ell(x, cy, 6.8 * s, 8.8 * s, col) +
        path('M' + (x - 6.6 * s) + ' ' + (cy - 2 * s) + 'A' + (6.8 * s) + ' ' + (8.8 * s) + ' 0 0 1 ' + (x + 6.6 * s) + ' ' + (cy - 2 * s) + 'Z', '#1a0f0a', 'opacity=".38"') +
        ell(x, cy + 4.6 * s, 4.4 * s, 3 * s, shade(col, 0.55), 'opacity=".9"') +
        ell(x, cy + 0.6 * s, 2.8 * s, 3.8 * s, '#120a06') +
        ell(x + 2.2 * s, cy - 3.4 * s, 2.8 * s, 3.3 * s, '#fff') + circle(x - 2.8 * s, cy + 3 * s, 1.3 * s, '#fff') + circle(x - 3.4 * s, cy - 4 * s, 0.8 * s, '#fff') +
        path('M' + (x - 6.6 * s) + ' ' + (cy - 3 * s) + 'A' + (6.8 * s) + ' ' + (8.8 * s) + ' 0 0 1 ' + (x + 6.6 * s) + ' ' + (cy - 3 * s), 'none', L(1.6));
    });
  }
  // ほっぺ：うすいピンクに斜線
  function blush(cx, cy, gap, s){
    return both(function(d){
      var x = cx + d * gap;
      return ell(x, cy, 6.5 * s, 3.6 * s, '#ff8fab', 'opacity=".35"') +
        path('M' + (x - 3.5 * s) + ' ' + (cy + 1.5 * s) + 'l' + (2 * s) + ' ' + (-3 * s) + 'M' + (x - 0.5 * s) + ' ' + (cy + 1.5 * s) + 'l' + (2 * s) + ' ' + (-3 * s) + 'M' + (x + 2.5 * s) + ' ' + (cy + 1.5 * s) + 'l' + (2 * s) + ' ' + (-3 * s), 'none', 'stroke="#ff6f91" stroke-width="' + (0.9 / K).toFixed(2) + '" stroke-linecap="round" opacity=".8"');
    });
  }
  function catMouth(cx, cy, s){ return path('M' + (cx - 6 * s) + ' ' + cy + 'q' + (3 * s) + ' ' + (4 * s) + ' ' + (6 * s) + ' 0q' + (3 * s) + ' ' + (4 * s) + ' ' + (6 * s) + ' 0', 'none', L(2.2)); }
  // かっこいい系の目（白目＋色のついた瞳＋きりっとした眉）
  function eyesHero(cx, cy, gap, s, iris, noBrow){
    return both(function(d){
      var x = cx + d * gap;
      // 目頭(内)は低く、目じり(外)は上がった切れ長の形
      var xi = x - d * 8 * s, xo = x + d * 9 * s;
      return path('M' + xi + ' ' + (cy + 1 * s) + 'L' + (x - d * 2 * s) + ' ' + (cy - 4.5 * s) + 'L' + xo + ' ' + (cy - 5 * s) + 'L' + (x + d * 5 * s) + ' ' + (cy + 3.5 * s) + 'Q' + x + ' ' + (cy + 4.5 * s) + ' ' + xi + ' ' + (cy + 1 * s) + 'Z', '#f6f3ee') +
        ell(x + d * 1.2 * s, cy - 0.5 * s, 3.4 * s, 4.2 * s, iris) + path('M' + (x + d * 1.2 * s - 3.4 * s) + ' ' + (cy - 0.5 * s) + 'A' + (3.4 * s) + ' ' + (4.2 * s) + ' 0 0 1 ' + (x + d * 1.2 * s + 3.4 * s) + ' ' + (cy - 0.5 * s) + 'Z', '#000', 'opacity=".45"') +
        ell(x + d * 1.2 * s, cy - 0.3 * s, 1.3 * s, 2.8 * s, '#0b0705') + circle(x + d * 0.2 * s, cy - 2.3 * s, 1 * s, '#fff') +
        path('M' + (xi - d * 0.5 * s) + ' ' + (cy + 1.5 * s) + 'L' + (x - d * 2 * s) + ' ' + (cy - 4.8 * s) + 'L' + (xo + d * 1.5 * s) + ' ' + (cy - 6 * s), 'none', L(2.8)) +
        (noBrow ? '' : path('M' + (x - d * 9 * s) + ' ' + (cy - 7 * s) + 'L' + (x + d * 11 * s) + ' ' + (cy - 13 * s) + 'L' + (x + d * 8 * s) + ' ' + (cy - 10 * s) + 'Z', INK, L(1.6)));
    });
  }
  function grin(cx, cy, s){
    return path('M' + (cx - 7 * s) + ' ' + cy + 'Q' + cx + ' ' + (cy + 10 * s) + ' ' + (cx + 7 * s) + ' ' + cy + 'Z', '#7a1f1f', L(2)) +
      path('M' + (cx - 4 * s) + ' ' + (cy + 4.5 * s) + 'Q' + cx + ' ' + (cy + 2 * s) + ' ' + (cx + 4 * s) + ' ' + (cy + 4.5 * s), '#ff8a8a');
  }

  // ------------------------------------------------------------ タマゴ
  var EGG = 'M100 30C140 30 162 92 162 124C162 160 134 184 100 184C66 184 38 160 38 124C38 92 60 30 100 30Z';

  function eggPattern(ch){
    var c = ch.egg[0], w = '#ffffff', s = '';
    switch (ch.pattern) {
      case 'hearts':
        [[70,80,1.1],[122,70,0.9],[96,118,1.3],[60,140,0.9],[134,128,1.1],[100,165,0.8]].forEach(function(h){ s += heart(h[0], h[1] - 8, h[2], c); });
        break;
      case 'dots':
        [[72,78,9],[118,64,7],[100,104,11],[62,128,8],[138,112,9],[88,150,9],[128,158,7]].forEach(function(d){ s += circle(d[0], d[1], d[2], c); });
        break;
      case 'flowers':
        [[74,82,1],[124,78,0.8],[100,124,1.2],[64,150,0.8],[136,146,0.9]].forEach(function(f){
          for (var i = 0; i < 5; i++) s += petal(f[0], f[1], 8 * f[2], 5 * f[2], 8 * f[2], i * 72, c);
          s += circle(f[0], f[1], 4 * f[2], '#ffe680');
        });
        break;
      case 'paws':
        [[76,82,1],[124,100,1.2],[82,142,1.1],[130,156,0.8]].forEach(function(f){
          s += ell(f[0], f[1] + 4 * f[2], 8 * f[2], 6.5 * f[2], c);
          [[-8,-6],[-3,-10],[3,-10],[8,-6]].forEach(function(t){ s += circle(f[0] + t[0] * f[2], f[1] + t[1] * f[2], 2.8 * f[2], c); });
        });
        break;
      case 'stars':
        [[74,76,9],[124,66,7],[100,110,13],[62,136,8],[136,124,10],[96,160,8]].forEach(function(t){ s += star(t[0], t[1], t[2], c); });
        break;
      case 'scales':
        for (var r = 0; r < 7; r++) for (var i = -1; i < 8; i++) {
          var x = 40 + i * 20 + (r % 2) * 10, y = 60 + r * 18;
          s += '<path d="M' + (x - 10) + ' ' + y + 'Q' + x + ' ' + (y + 16) + ' ' + (x + 10) + ' ' + y + '" fill="none" stroke="' + c + '" stroke-width="3"/>';
        }
        break;
      case 'zigzag':
        [70, 112, 152].forEach(function(y){
          var d = 'M30 ' + y; for (var x = 30; x < 175; x += 14) d += 'L' + (x + 7) + ' ' + (y - 10) + 'L' + (x + 14) + ' ' + y;
          s += '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="7" stroke-linejoin="round"/>';
        });
        break;
      case 'shields':
        [[76,84,1],[126,108,1.1],[84,146,0.9]].forEach(function(f){
          s += g('translate(' + f[0] + ' ' + f[1] + ') scale(' + f[2] + ')', path('M-11-12H11V0C11 8 4 13 0 15C-4 13-11 8-11 0Z', c) + path('M0-9V11M-7-2H7', 'none', 'stroke="#fff" stroke-width="2.5"'));
        });
        break;
      case 'shuriken':
        [[74,80,10],[124,72,8],[100,116,13],[64,148,9],[134,140,10]].forEach(function(t){ s += star(t[0], t[1], t[2], c, '', 4, 0.32) + circle(t[0], t[1], t[2] * 0.2, w); });
        break;
      case 'gears':
        [[78,86,16],[124,122,20],[80,152,12]].forEach(function(q){
          s += circle(q[0], q[1], q[2], 'none', 'stroke="' + c + '" stroke-width="7" stroke-dasharray="6 5"') + circle(q[0], q[1], q[2] * 0.45, c);
        });
        break;
    }
    return s;
  }

  function eggSvg(ch){
    var id = 'e' + (++uid);
    return '<defs><clipPath id="' + id + 'c"><path d="' + EGG + '"/></clipPath>' +
      '<radialGradient id="' + id + 'g" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="' + ch.egg[1] + '"/><stop offset="1" stop-color="' + ch.egg[0] + '" stop-opacity=".55"/></radialGradient></defs>' +
      ell(100, 188, 52, 7, 'rgba(0,0,0,.12)') +
      '<g class="pet-wobble">' +
      path(EGG, 'url(#' + id + 'g)') +
      '<g clip-path="url(#' + id + 'c)" opacity=".85">' + eggPattern(ch) + '</g>' +
      path(EGG, 'none', 'stroke="' + ch.egg[0] + '" stroke-width="4"') +
      ell(76, 72, 9, 16, 'rgba(255,255,255,.75)', '', 25) +
      '</g>';
  }

  // ==================================================================
  //  キャラクターごとの絵（足もとを (0,0) として上向きに描く。高さはおよそ 150）
  // ==================================================================

  // ---------------------------------------------- 柴犬
  function drawInu(st){
    var holy = st === 5;
    var fur = holy ? '#fff4dc' : '#f0a04b', white = '#fffaf2', s = '';
    // しっぽ（くるん）
    s += circle(30, -46, 15, 'none', S(INK, 15)) + circle(30, -46, 15, 'none', S(holy ? '#ffd27a' : fur, 9)) + circle(30, -46, 6, white, L(2));
    if (holy) {
      // 翼
      s += both(function(d){ return g('scale(' + d + ' 1)', path('M18-60C40-92 76-100 92-88C80-82 88-74 80-68C88-62 78-56 70-56C72-48 58-48 52-50C44-44 30-48 22-52Z', '#fff', L(2.5))); });
    }
    if (st >= 4) s += path('M-26-66Q0-74 26-66L40-6Q0 4-40-6Z', holy ? '#ffcf4d' : '#e03131', L(2.5)); // マント
    // うしろ足
    s += both(function(d){ return ell(d * 25, -12, 15, 12, fur, L()); });
    // からだ
    s += ell(0, -40, 29, 34, fur, L()) + ell(0, -40, 16, 24, white);
    // まえ足
    s += both(function(d){ return rect(d * 11 - 7, -32, 14, 32, 7, fur, L()) + ell(d * 11, -3, 8, 5, white, L(2)); });
    if (st >= 2 && st < 4) s += path('M-20-68Q0-58 20-68', 'none', S(INK, 9)) + path('M-20-68Q0-58 20-68', 'none', S('#e64980', 6)) + circle(0, -61, 5.5, '#ffd23f', L(2));
    if (st >= 3 && st < 5) s += path('M-24-70Q0-58 24-70L4-44Z', '#2f80ed', L(2.5)) + circle(-8, -62, 2, '#fff') + circle(8, -64, 2, '#fff'); // バンダナ
    if (st === 4) s += star(0, -46, 8, '#ffd23f', L(2));
    // 頭
    var hy = -88;
    s += both(function(d){ return path('M' + (d * 12) + ' ' + (hy - 24) + 'L' + (d * 30) + ' ' + (hy - 44) + 'L' + (d * 34) + ' ' + (hy - 12) + 'Z', fur, L()) + path('M' + (d * 18) + ' ' + (hy - 24) + 'L' + (d * 28) + ' ' + (hy - 36) + 'L' + (d * 29) + ' ' + (hy - 18) + 'Z', '#ffc2a8'); });
    s += ell(0, hy, 36, 30, fur, L());
    s += path('M-28 ' + (hy + 6) + 'Q-26 ' + (hy - 8) + ' -12 ' + (hy - 6) + 'Q0 ' + (hy - 2) + ' 12 ' + (hy - 6) + 'Q26 ' + (hy - 8) + ' 28 ' + (hy + 6) + 'Q20 ' + (hy + 28) + ' 0 ' + (hy + 28) + 'Q-20 ' + (hy + 28) + ' -28 ' + (hy + 6) + 'Z', white);
    s += both(function(d){ return ell(d * 13, hy - 15, 5, 3, white); }); // まろまゆ
    if (holy) s += path('M-10 ' + (hy - 22) + 'Q0 ' + (hy - 32) + ' 10 ' + (hy - 22), 'none', S('#ff7a29', 3)) + circle(0, hy - 24, 3, '#ff7a29');
    s += eyesCute(0, hy - 4, 13, 1.05);
    s += ell(0, hy + 6, 5, 3.6, INK) + catMouth(-6 + 6, hy + 11, 1);
    if (st >= 2) s += path('M-3 ' + (hy + 15) + 'q3 7 6 0', '#ff6b81', L(1.6));
    s += blush(0, hy + 6, 22, 1);
    if (holy) s += ell(0, hy - 40, 26, 7, 'none', S('#ffd23f', 4));
    return s;
  }

  // ---------------------------------------------- 黒ねこ
  function drawNeko(st){
    var fur = '#3a3850', s = '', hy = -84;
    // しっぽ
    s += path('M22-14C52-16 58-50 42-70C36-78 44-90 52-84', 'none', S(INK, 15)) + path('M22-14C52-16 58-50 42-70C36-78 44-90 52-84', 'none', S(fur, 10));
    if (st >= 4) s += path('M-28-66Q0-76 28-66L46-2Q0 8-46-2Z', st === 5 ? '#24206b' : '#7b3fbf', L(2.5)) +
      (st === 5 ? [[-34,-20],[30,-30],[-20,-44],[38,-10],[-40,-6]].map(function(p){ return star(p[0], p[1], 3.5, '#ffe066'); }).join('') : '');
    s += ell(0, -36, 27, 34, fur, L()) + ell(0, -40, 11, 16, '#5a5876');
    s += both(function(d){ return ell(d * 12, -5, 10, 7, fur, L()); });
    if (st >= 2) s += path('M-18-62Q0-54 18-62', 'none', S(INK, 8)) + path('M-18-62Q0-54 18-62', 'none', S('#e8364e', 5)) + circle(0, -56, 5, '#ffd23f', L(1.8));
    // 魔法のつえ
    if (st === 3) s += path('M-30-30L-40-74', 'none', S('#8a5a2b', 5)) + star(-41, -78, 10, '#ffe066', L(2));
    if (st === 5) s += path('M-34-6L-46-110', 'none', S('#c9a2ff', 5)) + path('M-50-122A14 14 0 1 0-36-104A10 10 0 1 1-50-122Z', '#ffe066', L(2)) + sparkle(-28, -122, 6, '#fff');
    // 頭
    s += both(function(d){ return path('M' + (d * 8) + ' ' + (hy - 22) + 'L' + (d * 26) + ' ' + (hy - 46) + 'L' + (d * 32) + ' ' + (hy - 6) + 'Z', fur, L()) + path('M' + (d * 15) + ' ' + (hy - 20) + 'L' + (d * 24) + ' ' + (hy - 36) + 'L' + (d * 27) + ' ' + (hy - 12) + 'Z', '#ff9fc0'); });
    s += ell(0, hy, 34, 29, fur, L());
    s += both(function(d){
      var x = d * 13, y = hy - 2;
      return ell(x, y, 8, 9.5, '#c6f36b', L(2)) + ell(x, y + 1, 2.6, 7.5, '#16141f') + circle(x - 2.5, y - 4, 2.2, '#fff');
    });
    s += path('M-4 ' + (hy + 9) + 'H4L0 ' + (hy + 13) + 'Z', '#ff8fb1') + catMouth(0, hy + 14, 0.8);
    s += both(function(d){ return path('M' + (d * 20) + ' ' + (hy + 8) + 'l' + (d * 18) + ' -3M' + (d * 20) + ' ' + (hy + 13) + 'l' + (d * 18) + ' 2', 'none', S('#e9e6ff', 2)); });
    s += blush(0, hy + 10, 21, 1);
    // ぼうし
    if (st >= 4) {
      var tall = st === 5 ? 1.35 : 1;
      s += ell(0, hy - 22, 42, 9, st === 5 ? '#2c2680' : '#5b2a9e', L()) +
        path('M-24 ' + (hy - 24) + 'Q-10 ' + (hy - 50 * tall) + ' 8 ' + (hy - 76 * tall) + 'Q16 ' + (hy - 70 * tall) + ' 24 ' + (hy - 64 * tall) + 'Q16 ' + (hy - 50) + ' 24 ' + (hy - 24) + 'Z', st === 5 ? '#2c2680' : '#5b2a9e', L()) +
        rect(-24, hy - 34, 48, 9, 3, st === 5 ? '#ffd23f' : '#e8364e', L(2)) +
        (st === 5 ? star(4, hy - 48, 6, '#ffe066', L(1.5)) + path('M14 ' + (hy - 62) + 'A6 6 0 1 0 20 ' + (hy - 54) + 'A4 4 0 1 1 14 ' + (hy - 62) + 'Z', '#ffe066') : star(0, hy - 29, 4, '#ffe066'));
    }
    return s;
  }

  // ---------------------------------------------- うさぎ
  function drawUsagi(st){
    var fur = '#ffffff', s = '', hy = -86;
    if (st === 5) s += path('M-40-150A62 62 0 1 0 40-40A48 48 0 1 1-40-150Z', '#ffe9a8', L(2)); // 三日月
    s += circle(26, -26, 10, fur, L()); // しっぽ
    if (st >= 4) {
      var dress = st === 5 ? '#c7a6ff' : '#ffe680';
      s += path('M-18-56H18L36-10Q0 0-36-10Z', dress, L()) + path('M-30-16Q0-8 30-16', 'none', S('#fff', 3));
      if (st === 5) s += path('M-36-10Q0 0 36-10L30 0H-30Z', '#9b7bff', L(2));
    } else s += ell(0, -36, 25, 30, fur, L());
    s += both(function(d){ return ell(d * 14, -4, 15, 7, fur, L()); });
    s += both(function(d){ return ell(d * 22, -44, 7, 11, fur, L(), d * -20); });
    if (st >= 2 && st <= 3) s += g('translate(-22 -40) rotate(-30)', path('M0-14C5-14 7-8 6 0L0 18L-6 0C-7-8-5-14 0-14Z', '#ff8c2b', L(2)) + path('M0-14L-6-24M0-14L0-26M0-14L6-24', 'none', S('#3fae49', 3)));
    if (st === 5) s += path('M24-30L40-104', 'none', S('#fff', 4)) + star(41, -110, 9, '#ffe066', L(2));
    // 耳
    s += both(function(d){
      var tilt = st >= 3 && d === 1 ? 35 : d * 8;
      return g('rotate(' + tilt + ' ' + (d * 12) + ' ' + (hy - 20) + ')', ell(d * 12, hy - 52, 10, 30, fur, L()) + ell(d * 12, hy - 50, 5, 22, '#ffb3c8'));
    });
    s += circle(0, hy, 30, fur, L());
    s += eyesCute(0, hy - 2, 12, 1, '#a23b5c');
    s += path('M-3 ' + (hy + 7) + 'H3L0 ' + (hy + 10) + 'Z', '#ff8fb1') + catMouth(0, hy + 11, 0.7) + rect(-3, hy + 12, 6, 5, 1, '#fff', L(1.4));
    s += blush(0, hy + 8, 19, 1);
    if (st >= 3) s += flower(-18, hy - 26, 7, '#ff9cc0') + flower(0, hy - 30, 8, '#ffe066', '#ff8c2b') + flower(18, hy - 26, 7, '#b6e3ff');
    if (st === 5) s += path('M-14 ' + (hy - 34) + 'L-10 ' + (hy - 48) + 'L-4 ' + (hy - 38) + 'L0 ' + (hy - 52) + 'L4 ' + (hy - 38) + 'L10 ' + (hy - 48) + 'L14 ' + (hy - 34) + 'Z', '#ffd23f', L(2));
    return s;
  }

  // ---------------------------------------------- パンダ
  function drawPanda(st){
    var K2 = '#1c1c1c', W = '#ffffff', s = '', hy = -92;
    if (st === 5) s += path('M-44-70Q0-82 44-70L52-2Q0 8-52-2Z', '#d62828', L()) + path('M-44-70Q0-82 44-70', 'none', S('#ffd23f', 4));
    s += both(function(d){ return ell(d * 22, -10, 15, 12, K2, L()) + ell(d * 22, -8, 7, 5, '#555'); });
    s += ell(0, -40, 35, 36, W, L());
    if (st === 4) s += path('M-30-60Q0-44 30-60L26-14Q0-6-26-14Z', '#ff8c2b', L()) + rect(-30, -34, 60, 9, 3, '#1c1c1c');
    s += path('M-30-62Q0-48 30-62', 'none', S(K2, 12));
    // 竹
    if (st === 2 || st === 3) s += g('translate(30 -40) rotate(15)', rect(-5, -46, 10, 64, 4, '#6abf4b', L(2)) + path('M-5-20H5M-5 2H5', 'none', S(INK, 2)) +
      (st === 3 ? ell(10, -44, 12, 4, '#8fd36b', L(1.6), -30) + ell(12, -34, 10, 3.5, '#8fd36b', L(1.6), -10) : ''));
    if (st === 5) s += g('translate(34 -30) rotate(12)', rect(-5, -70, 10, 90, 4, '#ffd23f', L(2)) + path('M-5-40H5M-5-10H5', 'none', S(INK, 2)) + circle(0, -74, 8, '#d62828', L(2)));
    s += both(function(d){ return ell(d * 30, -46, 12, 17, K2, L(), d * (st === 4 ? 40 : -25)); });
    if (st === 4) s += both(function(d){ return circle(d * 40, -58, 9, K2, L()); });
    // 頭
    s += both(function(d){ return circle(d * 24, hy - 24, 11, K2, L()); });
    s += ell(0, hy, 36, 31, W, L());
    s += both(function(d){ return ell(d * 13, hy, 9, 12, K2, '', d * 25) + circle(d * 13, hy - 1, 4.2, '#fff') + circle(d * 13 - 1, hy - 2.5, 1.4, K2); });
    s += ell(0, hy + 11, 5, 3.4, K2) + catMouth(0, hy + 15, 0.8);
    s += blush(0, hy + 10, 22, 1);
    if (st === 3) s += ell(-6, hy - 30, 14, 5, '#8fd36b', L(1.6), -20);
    if (st === 4) s += path('M-34 ' + (hy - 10) + 'Q0 ' + (hy - 22) + ' 34 ' + (hy - 10), 'none', S(INK, 9)) + path('M-34 ' + (hy - 10) + 'Q0 ' + (hy - 22) + ' 34 ' + (hy - 10), 'none', S('#e03131', 6)) +
      path('M32 ' + (hy - 10) + 'q14 2 20 14M32 ' + (hy - 10) + 'q16-4 24 4', 'none', S('#e03131', 4));
    if (st === 5) s += g('translate(0 ' + (hy - 28) + ')', path('M-22 6L-26-18L-12-6L0-24L12-6L26-18L22 6Z', '#ffd23f', L(2)) + circle(0, -8, 4, '#d62828'));
    return s;
  }

  // ---------------------------------------------- ハムスター
  function drawHamu(st){
    var fur = '#f4b860', W = '#fff8ec', s = '';
    var cheek = st >= 3 ? 1.45 : st === 2 ? 1.2 : 1;
    if (st === 5) {
      for (var i = 0; i < 16; i++) s += petal(0, -58, 62, 10, 22, i * 22.5, '#ffd23f', L(2));
      s += circle(0, -58, 52, '#8a5a2b', L());
      s += path('M-44-80Q0-90 44-80L54-4Q0 6-54-4Z', '#e03131', L());
    }
    s += both(function(d){ return ell(d * 18, -4, 11, 6, '#ffb3a8', L(2)); });
    s += path('M0-104C40-104 50-70 50-48C50-18 30 0 0 0C-30 0-50-18-50-48C-50-70-40-104 0-104Z', fur, L());
    s += path('M-36-54C-36-36-24-6 0-6C24-6 36-36 36-54C26-46 14-44 0-44C-14-44-26-46-36-54Z', W);
    s += both(function(d){ return circle(d * 30, -96, 12, fur, L()) + circle(d * 30, -96, 6, '#ffb3a8'); });
    s += both(function(d){ return ell(d * 30, -54, 13 * cheek, 11 * cheek, W, L(2)); });
    s += eyesCute(0, -72, 15, 1.05);
    s += ell(0, -60, 3.5, 2.6, '#c25b4b') + catMouth(0, -56, 0.7);
    s += blush(0, -62, 28, 1);
    // ひまわりのたね
    if (st >= 2 && st <= 4) s += g('translate(0 -36)', ell(0, 0, 8, 12, '#333', L(2)) + path('M-3-8V8M3-8V8', 'none', S('#ddd', 1.6))) + both(function(d){ return ell(d * 9, -36, 6, 5, fur, L(2)); });
    if (st === 4) {
      s += g('translate(0 -104)', ell(0, 0, 26, 9, '#9a6a3a', L()) + path('M-22-2Q0-28 22-2Z', '#9a6a3a', L()) + path('M-18-6L18-6M-14-12L14-12', 'none', S('#7a4f25', 2)) + path('M0-16V-24', 'none', S('#5c3a1a', 3)));
      s += path('M-34-46Q0-34 34-46L30-36Q0-26-30-36Z', '#3fae49', L(2));
    }
    if (st === 5) s += g('translate(0 -104)', path('M-20 4L-24-18L-10-6L0-24L10-6L24-18L20 4Z', '#ffd23f', L(2)) + circle(0, -6, 4, '#e03131'));
    return s;
  }

  // ---------------------------------------------- ドラゴン
  function drawDragon(st){
    var gold = st === 5, body = '#e8432b', belly = '#ffd36b', mem = gold ? '#ffb02e' : '#ff8a3d', horn = gold ? '#ffd23f' : '#fff1c9', s = '', hy = -98;
    var wk = [0, 0.35, 0.55, 0.8, 1.0, 1.15][st];
    // つばさ
    s += both(function(d){
      return g('translate(' + (d * 14) + ' -70) scale(' + (d * wk) + ' ' + wk + ')',
        path('M0 0C16-44 58-62 92-52C84-38 86-26 92-14C78-18 70-12 68 0C60-8 48-6 44 6C36-2 24-2 18 10C12 4 6 4 0 8Z', mem, L(3 * wk)) +
        path('M4 2L60-46M20 6L78-30M38 6L88-18', 'none', S(INK, 2 * wk)));
    });
    // しっぽ
    s += path('M14-24C44-14 64-4 86-34C80-14 60 6 10-8Z', body, L());
    if (st >= 3) [[40,-18],[56,-16],[70,-22]].forEach(function(p){ s += path('M' + p[0] + ' ' + p[1] + 'l5-12 5 11Z', horn, L(1.8)); });
    if (st >= 4) s += flame(88, -34, 0.7, '#ff7a29', '#ffd23f');
    // 足
    s += both(function(d){ return ell(d * 18, -10, 14, 14, body, L()) + [-6, 0, 6].map(function(t){ return path('M' + (d * 18 + t - 2) + ' 1L' + (d * 18 + t) + ' 6L' + (d * 18 + t + 2) + ' 1Z', '#fff', L(1.4)); }).join(''); });
    // からだ
    s += ell(0, -46, 33, 36, body, L());
    s += ell(0, -42, 21, 28, belly, L(2)) + [-56, -46, -36, -26].map(function(y){ return path('M-17 ' + y + 'Q0 ' + (y + 4) + ' 17 ' + y, 'none', S(INK, 1.6)); }).join('');
    if (gold) s += path('M-24-70L0-60L24-70L22-28Q0-16-22-28Z', '#ffd23f', L()) + path('M0-60V-20', 'none', S('#c98a00', 2)) + circle(0, -48, 6, '#e8432b', L(2));
    s += both(function(d){ return ell(d * 31, -52, 8, 13, body, L(), d * -30); });
    // 頭
    s += both(function(d){
      var len = [0, 10, 16, 22, 28, 36][st];
      return path('M' + (d * 14) + ' ' + (hy - 22) + 'Q' + (d * (22 + len * 0.3)) + ' ' + (hy - 36 - len * 0.6) + ' ' + (d * (26 + len * 0.7)) + ' ' + (hy - 40 - len) + 'Q' + (d * 26) + ' ' + (hy - 30) + ' ' + (d * 26) + ' ' + (hy - 16) + 'Z', horn, L(2.5));
    });
    if (st >= 3) [[-8, -32], [0, -36], [8, -32]].forEach(function(p){ s += path('M' + (p[0] - 5) + ' ' + (hy - 26) + 'L' + p[0] + ' ' + (hy + p[1] - 2) + 'L' + (p[0] + 5) + ' ' + (hy - 26) + 'Z', mem, L(2)); });
    s += ell(0, hy, 36, 30, body, L());
    s += ell(0, hy + 14, 22, 13, '#f2664f', L(2)) + both(function(d){ return ell(d * 7, hy + 10, 2.4, 3, INK); });
    if (st <= 1) s += eyesCute(0, hy - 6, 14, 1.15, '#3d0f06');
    else s += both(function(d){
      var x = d * 15, y = hy - 6;
      return ell(x, y, 8, 8.5, '#fff', L(2)) + ell(x, y, 6, 7, '#ffcf3f') + ell(x, y, 1.8, 6, '#111') + circle(x - 2, y - 3, 1.5, '#fff') +
        path('M' + (x - d * 9) + ' ' + (y - 9) + 'L' + (x + d * 10) + ' ' + (y - 13), 'none', L(3.2));
    });
    s += path('M-12 ' + (hy + 22) + 'Q0 ' + (hy + 27) + ' 12 ' + (hy + 22), 'none', L(2.2)) + (st >= 2 ? path('M7 ' + (hy + 23) + 'l2 5 2-5.5', '#fff', L(1.4)) : '');
    if (st >= 4) s += flame(-48, hy + 30, 0.9, '#ff7a29', '#ffd23f') + flame(-66, hy + 24, 0.6, '#ff7a29', '#ffd23f');
    if (gold) s += g('translate(0 ' + (hy - 26) + ')', path('M-18 4L-20-14L-8-4L0-20L8-4L20-14L18 4Z', '#ffd23f', L(2)) + circle(0, -4, 3.5, '#3d7bf2'));
    return s;
  }

  // ---------------------------------------------- 人型（侍・騎士・忍者）の共通の体
  // o = { skin, top, bottom, shoes, back, body, arms, head, headBack, front, weapon, face, hair }
  // 衣装・頭のパーツは「頭の大きい2頭身」の座標で描き、ここで約3.5頭身の体に合わせて変形する
  var BODY_TF = 'translate(0 -92) scale(1 1.143) translate(0 64)'; // 胴（-64〜-22 → -92〜-44）
  var HEAD_TF = 'translate(0 -118) scale(.68) translate(0 96)';   // 頭を小さく、高い位置へ
  function humanoid(o){
    var s = '', hy = -96;
    if (o.back) s += g('scale(1 1.3)', o.back);
    // 足
    s += both(function(d){ return rect(d * 10 - 8, -48, 16, 46, 7, o.bottom, L()) + ell(d * 10, -2, 11, 5.5, o.shoes, L(2)); });
    // 首と胴
    s += rect(-6, -102, 12, 14, 3, o.skin, L(2));
    s += path('M-19-92H19L23-44H-23Z', o.top, L());
    if (o.body) s += g(BODY_TF, o.body);
    // 腕（左手は前、右手は武器を持つ）
    s += rect(-33, -90, 12, 46, 6, o.sleeve || o.top, L()) + circle(-27, -44, 6.5, o.skin, L(2));
    s += rect(21, -90, 12, 44, 6, o.sleeve || o.top, L()) + circle(27, -46, 6.5, o.skin, L(2));
    if (o.arms) s += g(BODY_TF, o.arms);
    // 頭
    var face = o.face != null ? o.face : eyesHero(0, hy + 2, 12, 1, o.iris || '#3b2a1a') +
      path('M0 ' + (hy + 4) + 'L-3 ' + (hy + 12) + 'H2', 'none', L(1.8)) + path('M-7 ' + (hy + 18) + 'Q0 ' + (hy + 22) + ' 7 ' + (hy + 18), 'none', L(2.2));
    s += g(HEAD_TF, (o.headBack || '') + both(function(d){ return ell(d * 31, hy + 4, 6, 9, o.skin, L(2)); }) + circle(0, hy, 32, o.skin, L()) + (o.hair || '') + face + (o.head || ''));
    if (o.weapon) s += g('translate(-1 -14)', o.weapon);
    if (o.front) s += g('translate(0 -20)', o.front);
    return s;
  }
  function katana(x, y, rot, len, gold){
    return g('translate(' + x + ' ' + y + ') rotate(' + rot + ')',
      rect(-3, -len, 6, len, 2, '#e6edf5', L(2)) + path('M-1.5-' + (len - 4) + 'V-6', 'none', S('#ffffff', 1.5)) +
      ell(0, 0, 8, 3, gold ? '#ffd23f' : '#333', L(1.6)) + rect(-3, 1, 6, 18, 2, '#2a1f3d', L(1.6)) + path('M-3 6L3 10M-3 12L3 16', 'none', S('#e8e1ff', 1.4)));
  }

  // ---------------------------------------------- 侍
  function drawSamurai(st){
    var o = { skin:'#ffdcb8', top:'#3a4fa8', bottom:'#2c2c44', shoes:'#8a5a2b', iris:'#2b1d14' }, hy = -96;
    var hairTop = path('M-31 ' + (hy - 4) + 'Q-30 ' + (hy - 34) + ' 0 ' + (hy - 34) + 'Q30 ' + (hy - 34) + ' 31 ' + (hy - 4) + 'Q22 ' + (hy - 20) + ' 6 ' + (hy - 18) + 'L0 ' + (hy - 10) + 'L-6 ' + (hy - 18) + 'Q-22 ' + (hy - 20) + ' -31 ' + (hy - 4) + 'Z', '#2b2b3a', L());
    o.hair = st <= 3 ? hairTop + ell(0, hy - 38, 7, 9, '#2b2b3a', L(2)) + rect(-6, hy - 34, 12, 4, 1, '#e03131') : '';
    o.body = path('M-10-64L0-46L10-64', 'none', S('#ffffff', 4));
    if (st === 1) o.weapon = g('translate(28 -32) rotate(20)', rect(-3, -52, 6, 52, 3, '#c8925a', L(2)) + ell(0, -2, 6, 2.5, '#6d4523'));
    if (st === 2) {
      o.weapon = g('translate(28 -32) rotate(-15)', rect(-3, -56, 6, 56, 3, '#c8925a', L(2)) + ell(0, -2, 6, 2.5, '#6d4523'));
      o.head = path('M-32 ' + (hy - 10) + 'Q0 ' + (hy - 20) + ' 32 ' + (hy - 10), 'none', S(INK, 9)) + path('M-32 ' + (hy - 10) + 'Q0 ' + (hy - 20) + ' 32 ' + (hy - 10), 'none', S('#fff', 6)) +
        circle(0, hy - 15, 4, '#e03131') + path('M-30 ' + (hy - 8) + 'q-14 4-18 16M-30 ' + (hy - 8) + 'q-16-2-22 6', 'none', S('#fff', 4));
    }
    if (st >= 3) {
      o.sleeve = st >= 4 ? '#3a4fa8' : '#7fb3ff';
      o.weapon = katana(28, -32, st === 5 ? -35 : -20, st === 5 ? 70 : 58, st === 5);
      o.front = katana(-16, -26, 60, 40, st === 5).replace('#e6edf5', '#2a1f3d');
    }
    if (st === 3) o.body += path('M-24-22L-20-64H-8L-6-22Z', '#7fb3ff', L(2)) + path('M24-22L20-64H8L6-22Z', '#7fb3ff', L(2)) + path('M-22-30L-12-36L-8-28M22-30L12-36L8-28', 'none', S('#fff', 2));
    if (st >= 4) {
      var red = '#c0392b';
      o.body += path('M-22-64H22L25-30H-25Z', red, L()) + [-56, -48, -40].map(function(y){ return path('M-21 ' + y + 'H21', 'none', S('#ffd23f', 2)); }).join('') +
        path('M-26-30H26L30-16H-30Z', red, L(2)) + path('M-26-24H26', 'none', S('#ffd23f', 2));
      o.arms = both(function(d){ return path('M' + (d * 18) + ' -66L' + (d * 40) + ' -60L' + (d * 38) + ' -44L' + (d * 22) + ' -48Z', red, L(2)) + path('M' + (d * 22) + ' -58L' + (d * 38) + ' -53', 'none', S('#ffd23f', 2)); });
      var crest = st === 5 ? path('M-6 ' + (hy - 32) + 'C-20 ' + (hy - 50) + ' -34 ' + (hy - 70) + ' -30 ' + (hy - 86) + 'C-22 ' + (hy - 66) + ' -10 ' + (hy - 54) + ' 0 ' + (hy - 40) + 'C10 ' + (hy - 54) + ' 22 ' + (hy - 66) + ' 30 ' + (hy - 86) + 'C34 ' + (hy - 70) + ' 20 ' + (hy - 50) + ' 6 ' + (hy - 32) + 'Z', '#ffd23f', L(2.4)) + circle(0, hy - 34, 6, '#e03131', L(2))
        : path('M-4 ' + (hy - 32) + 'L-14 ' + (hy - 48) + 'L0 ' + (hy - 38) + 'L14 ' + (hy - 48) + 'L4 ' + (hy - 32) + 'Z', '#ffd23f', L(2));
      o.headBack = path('M-40 ' + (hy + 10) + 'L-34 ' + (hy - 6) + 'H34L40 ' + (hy + 10) + 'L30 ' + (hy + 6) + 'H-30Z', '#2c2c44', L(2));
      o.head = path('M-34 ' + (hy - 4) + 'Q-32 ' + (hy - 36) + ' 0 ' + (hy - 36) + 'Q32 ' + (hy - 36) + ' 34 ' + (hy - 4) + 'Z', '#2c2c44', L()) + path('M-34 ' + (hy - 6) + 'H34', 'none', S('#ffd23f', 3)) + crest;
    }
    if (st === 5) o.back = path('M-26-66L-46-4Q0 10 46-4L26-66Z', '#8e1b1b', L()) + path('M-30-50Q0-44 30-50', 'none', S('#ffd23f', 3)) +
      [[-60,-120],[56,-130],[-70,-60],[66,-70],[48,-24]].map(function(p){ return flower(p[0], p[1], 6, '#ffc9de', '#ff8fb1'); }).join('');
    return humanoid(o);
  }

  // ---------------------------------------------- 騎士
  function drawKnight(st){
    var gold = st === 5, metal = gold ? '#ffd86b' : '#cfd8e3', dark = gold ? '#c98a00' : '#8a98ab', hy = -96;
    var o = { skin:'#ffe0c4', top: st >= 3 ? metal : '#3f7be0', bottom: st >= 3 ? metal : '#7a5230', shoes: st >= 3 ? dark : '#5a3b20', iris:'#1f6feb' };
    o.hair = path('M-30 ' + (hy - 2) + 'Q-28 ' + (hy - 30) + ' 0 ' + (hy - 30) + 'Q28 ' + (hy - 30) + ' 30 ' + (hy - 2) + 'Q14 ' + (hy - 14) + ' 0 ' + (hy - 12) + 'Q-14 ' + (hy - 14) + ' -30 ' + (hy - 2) + 'Z', '#f2c14e', L());
    // かぶと
    var helm = path('M-34 ' + (hy - 2) + 'Q-34 ' + (hy - 40) + ' 0 ' + (hy - 40) + 'Q34 ' + (hy - 40) + ' 34 ' + (hy - 2) + 'L28 ' + (hy + 2) + 'Q0 ' + (hy - 12) + ' -28 ' + (hy + 2) + 'Z', metal, L()) +
      path('M0 ' + (hy - 40) + 'V' + (hy - 8), 'none', S(dark, 3));
    if (st === 1) o.head = path('M-32 ' + (hy - 6) + 'Q-32 ' + (hy - 40) + ' 0 ' + (hy - 40) + 'Q32 ' + (hy - 40) + ' 32 ' + (hy - 6) + 'Z', '#b8c2cc', L()) + rect(-34, hy - 10, 68, 7, 3, '#8a98ab', L(2));
    if (st >= 2) o.head = helm + (st >= 3 ? rect(-3, hy - 12, 6, 16, 2, metal, L(2)) : '');
    if (st >= 4) o.head += path('M0 ' + (hy - 40) + 'C10 ' + (hy - 66) + ' 30 ' + (hy - 66) + ' 40 ' + (hy - 50) + 'C26 ' + (hy - 54) + ' 16 ' + (hy - 48) + ' 6 ' + (hy - 38) + 'Z', gold ? '#ffffff' : '#e03131', L(2));
    if (gold) o.head += ell(0, hy - 54, 24, 6, 'none', S('#ffe066', 4));
    // 胴よろい
    if (st >= 3) o.body = path('M-20-64H20L22-34Q0-26-22-34Z', metal, L()) + path('M-12-58Q0-52 12-58M-14-46Q0-40 14-46', 'none', S(dark, 2)) + rect(-24, -34, 48, 7, 2, '#7a5230', L(2)) + circle(0, -30, 4, '#ffd23f', L(1.4));
    else o.body = rect(-24, -32, 48, 6, 2, '#7a5230', L(2));
    if (st >= 3) o.arms = both(function(d){ return circle(d * 26, -60, 12, metal, L()); });
    // 剣
    if (st === 1) o.weapon = g('translate(28 -32) rotate(-10)', rect(-3, -40, 6, 40, 2, '#c8925a', L(2)) + rect(-10, -4, 20, 5, 2, '#8a5a2b', L(1.6)));
    else {
      var len = [0, 0, 46, 60, 70, 82][st];
      o.weapon = g('translate(28 -32) rotate(-12)',
        (gold ? path('M0-' + (len + 8) + 'L-9-10H9Z', '#bff4ff', 'opacity=".55"') : '') +
        path('M-4-4V-' + (len - 6) + 'L0-' + len + 'L4-' + (len - 6) + 'V-4Z', gold ? '#e8fbff' : '#e6edf5', L(2)) + path('M0-' + (len - 8) + 'V-8', 'none', S(gold ? '#7fe0ff' : '#aab6c4', 1.6)) +
        rect(-14, -6, 28, 6, 3, '#ffd23f', L(1.8)) + rect(-3, 0, 6, 14, 2, '#5a3b20', L(1.6)) + circle(0, 16, 4, '#ffd23f', L(1.4)));
    }
    // 盾
    if (st === 2) o.front = circle(-30, -40, 16, '#a0703f', L()) + circle(-30, -40, 16, 'none', S('#b8c2cc', 4)) + circle(-30, -40, 4, '#b8c2cc', L(1.4));
    if (st >= 3) {
      var sc = gold ? '#ffffff' : '#2f6fd0';
      o.front = g('translate(-32 -42) scale(' + (st >= 4 ? 1.2 : 1) + ')',
        path('M-17-20H17V0C17 13 6 21 0 24C-6 21-17 13-17 0Z', sc, L()) + path('M-17-20H17V0C17 13 6 21 0 24C-6 21-17 13-17 0Z', 'none', S(gold ? '#ffd23f' : '#cfd8e3', 3)) +
        (st >= 4 ? path('M-8-2L-8-12L-3-6L0-14L3-6L8-12L8-2Z', '#ffd23f', L(1.4)) : path('M0-14V16M-10-3H10', 'none', S('#ffd23f', 4))));
    }
    if (st >= 4) o.back = path('M-22-66L-40-2Q0 8 40-2L22-66Z', gold ? '#ffffff' : '#c92a2a', L());
    if (gold) o.back = both(function(d){ return g('scale(' + d + ' 1)', path('M16-64C30-110 78-130 98-110C86-106 92-98 84-92C94-86 82-78 74-78C80-70 66-66 58-68C56-58 40-58 34-62C28-56 18-58 14-62Z', '#ffffff', L(2.5)) +
      path('M30-86Q60-100 84-104M34-74Q60-84 76-86', 'none', S('#d7e3f0', 2))); }) + o.back;
    return humanoid(o);
  }

  // ---------------------------------------------- 忍者
  function drawNinja(st){
    var suit = st === 5 ? '#1a1530' : '#2d2a4a', scarf = '#e03131', hy = -96;
    var o = { skin:'#ffdcb8', top:suit, bottom:suit, shoes:'#15131f', iris:'#8b5cf6' };
    if (st === 5) o.back = flame(-38, -10, 1.6, '#7b2ff7', '#c9a2ff') + flame(40, -6, 1.4, '#7b2ff7', '#c9a2ff') + flame(0, -110, 1.1, '#7b2ff7', '#c9a2ff');
    if (st >= 4) o.back = (o.back || '') + katana(18, -30, -40, 66, st === 5).replace(/#e6edf5/g, '#2a1f3d');
    if (st === 5) o.back += g('translate(-6 -70) rotate(20)', star(0, 0, 44, '#b8c2cc', L(), 4, 0.3) + circle(0, 0, 8, suit, L(2)));
    // 頭巾と口あて
    o.hair = '';
    o.face = path('M-32 ' + (hy + 2) + 'Q-34 ' + (hy - 34) + ' 0 ' + (hy - 34) + 'Q34 ' + (hy - 34) + ' 32 ' + (hy + 2) + 'Z', suit, L()) +
      path('M-32 ' + (hy + 6) + 'H32Q30 ' + (hy + 32) + ' 0 ' + (hy + 32) + 'Q-30 ' + (hy + 32) + ' -32 ' + (hy + 6) + 'Z', suit, L()) +
      eyesHero(0, hy - 2, 12, 1, '#8b5cf6', st <= 1);
    if (st >= 2) o.face += rect(-24, hy - 24, 48, 10, 3, '#b8c2cc', L(2)) + path('M-8 ' + (hy - 19) + 'H8', 'none', S('#556', 2));
    if (st === 5) o.face += rect(-24, hy - 24, 48, 10, 3, '#ffd23f', L(2)) + star(0, hy - 19, 4, '#7b2ff7');
    o.body = path('M-24-30H24', 'none', S(scarf === '#e03131' && st >= 3 ? '#b8c2cc' : '#4a4570', 6));
    // マフラー
    var sl = [0, 0, 26, 40, 58, 72][st];
    if (st >= 2) o.headBack = path('M18 ' + (hy + 28) + 'C' + (40 + sl * 0.3) + ' ' + (hy + 20) + ' ' + (50 + sl * 0.6) + ' ' + (hy + 40) + ' ' + (60 + sl * 0.5) + ' ' + (hy + 30) + 'L' + (56 + sl * 0.5) + ' ' + (hy + 44) + 'C' + (44 + sl * 0.4) + ' ' + (hy + 50) + ' ' + 34 + ' ' + (hy + 40) + ' 16 ' + (hy + 38) + 'Z', scarf, L(2));
    if (st >= 2) o.body += path('M-22-64Q0-56 22-64L20-56Q0-48-20-56Z', scarf, L(2));
    if (st === 3 || st === 4) o.weapon = g('translate(30 -34) rotate(15)', star(0, 0, 13, '#b8c2cc', L(2), 4, 0.32) + circle(0, 0, 3, suit));
    if (st >= 4) o.front = [[-58,-30],[-46,-12],[56,-14]].map(function(p){ return circle(p[0], p[1], 9, '#e9e6ff', 'opacity=".75"') + circle(p[0] + 8, p[1] + 2, 7, '#e9e6ff', 'opacity=".75"'); }).join('');
    return humanoid(o);
  }

  // ---------------------------------------------- ロボット
  function drawRobo(st){
    var W = '#f1f3f5', B = '#1c7ed6', R = '#e03131', Y = '#fcc419', D = '#495057', s = '';
    if (st === 1) {
      s += both(function(d){ return circle(d * 20, -8, 9, D, L()); });
      s += circle(0, -42, 34, W, L()) + path('M-34-42H34', 'none', S(B, 8)) + ell(0, -48, 14, 13, '#183049', L(2)) + circle(0, -48, 7, '#5ff2ff') + circle(-3, -51, 2.5, '#fff');
      s += path('M0-76V-90', 'none', L(3)) + circle(0, -92, 5, R, L(2));
      return s;
    }
    if (st === 2) {
      s += rect(-34, -16, 68, 16, 8, D, L()) + [-22, -8, 6, 20].map(function(x){ return circle(x, -8, 4, '#868e96'); }).join('');
      s += rect(-28, -62, 56, 48, 8, W, L()) + rect(-16, -52, 32, 22, 4, B, L(2)) + circle(-6, -41, 3, Y) + circle(6, -41, 3, R);
      s += both(function(d){ return rect(d * 30 - (d < 0 ? 10 : 0), -56, 10, 26, 5, '#adb5bd', L(2)); });
      s += rect(-24, -104, 48, 40, 10, W, L()) + rect(-18, -94, 36, 16, 8, '#183049', L(2)) + circle(-8, -86, 4, '#5ff2ff') + circle(8, -86, 4, '#5ff2ff');
      s += path('M-14-104L-20-120M14-104L20-120', 'none', L(3)) + circle(-20, -122, 4, Y, L(2)) + circle(20, -122, 4, Y, L(2));
      return s;
    }
    // 人型メカ（成熟期〜）
    var big = st >= 4, k = st === 5 ? 1 : 1, hy = -110;
    if (st === 5) s += both(function(d){ return g('scale(' + d + ' 1)',
      path('M18-90L84-128L96-108L60-84L92-78L88-60L40-64Z', W, L()) + path('M30-84L84-120M36-72L86-72', 'none', S(B, 5)) + flame(70, -52, 0.5, '#5ff2ff', '#ffffff')); });
    if (big) s += both(function(d){ return rect(d * 30 - 9, -96, 18, 30, 4, D, L(2)) + flame(d * 30, -62, 0.45, '#ff7a29', Y); });
    // 足
    s += both(function(d){ return rect(d * 13 - 10, -40, 20, 36, 5, W, L()) + rect(d * 13 - 13, -8, 26, 10, 3, B, L(2)) + rect(d * 13 - 6, -32, 12, 8, 2, '#adb5bd'); });
    s += rect(-24, -48, 48, 12, 4, R, L()) + rect(-6, -48, 12, 12, 2, Y, L(1.6));
    // 胴
    s += path('M-28-92H28L24-48H-24Z', B, L()) + rect(-20, -86, 14, 10, 2, Y, L(1.6)) + rect(6, -86, 14, 10, 2, Y, L(1.6)) +
      path('M-20-82H-6M6-82H20', 'none', S(D, 1.6)) + circle(0, -66, 7, '#5ff2ff', L(2));
    // 肩と腕
    s += both(function(d){ return rect(d * 36 - 13, -100, 26, 20, 6, W, L()) + rect(d * 36 - 8, -80, 16, 30, 5, '#dee2e6', L()) + circle(d * 36, -48, 8, '#adb5bd', L(2)); });
    // 武器：ビームの剣
    if (big) s += g('translate(40 -48) rotate(-25)', rect(-4, -4, 8, 16, 2, D, L(1.6)) + rect(-5, -70, 10, 66, 5, '#ff6bd6', 'opacity=".55"') + rect(-2.5, -68, 5, 64, 2.5, '#fff'));
    // 頭
    s += rect(-20, hy - 22, 40, 34, 9, W, L()) + rect(-15, hy - 12, 30, 12, 4, '#183049', L(2)) + both(function(d){ return circle(d * 7, hy - 6, 3.2, st === 5 ? '#ffe066' : '#5ff2ff'); });
    s += path('M-6 ' + (hy + 6) + 'H6', 'none', S(R, 3));
    var fin = st === 3 ? 10 : st === 4 ? 22 : 34;
    s += path('M0 ' + (hy - 20) + 'L' + (-fin) + ' ' + (hy - 20 - fin) + 'L-4 ' + (hy - 24) + 'L0 ' + (hy - 30) + 'L4 ' + (hy - 24) + 'L' + fin + ' ' + (hy - 20 - fin) + 'Z', Y, L(2)) + circle(0, hy - 22, 3.5, R, L(1.4));
    return s;
  }

  // ------------------------------------------------------------ リアルな仕上げ
  function rgb(h){
    h = h.replace('#', '');
    if (h.length === 3) h = h.replace(/./g, function(c){ return c + c; });
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function shade(h, a){ // a>0 で明るく、a<0 で暗く
    var c = rgb(h), t = a > 0 ? 255 : 0, k = Math.abs(a);
    return '#' + c.map(function(v){ return ('0' + Math.round(v + (t - v) * k).toString(16)).slice(-2); }).join('');
  }
  // 輪郭線のある部品を「光の当たる側が明るく、反対側が暗い」グラデーションで塗り、
  // 輪郭線をその部品の色の暗い色・細い線にする
  // 影の色：暗くするだけでなく、少し青むらさきに寄せるとイラストらしくなる
  function shadowOf(h){
    var c = rgb(shade(h, -0.28)), t = [70, 50, 120];
    return '#' + c.map(function(v, i){ return ('0' + Math.round(v + (t[i] - v) * 0.22).toString(16)).slice(-2); }).join('');
  }
  // アニメ塗り：輪郭線のある部品を「ハイライト・ふつうの色・影」の3色で、境目をくっきり塗り分ける
  function celShade(markup, pfx){
    var grads = {}, n = 0, defs = '';
    var out = markup.replace(/<(ellipse|circle|rect|path|polygon)\b([^>]*?)\/>/g, function(all, tag, attrs){
      var f = /fill="(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})"/.exec(attrs);
      if (!f || attrs.indexOf('stroke="' + INK + '"') < 0) return all;
      var base = f[1].toLowerCase();
      if (!grads[base]) {
        grads[base] = pfx + 'g' + (n++);
        var hi = shade(base, 0.38), sh = shadowOf(base);
        defs += '<radialGradient id="' + grads[base] + '" cx=".34" cy=".26" r=".9">' +
          '<stop offset="0" stop-color="' + hi + '"/><stop offset=".16" stop-color="' + hi + '"/>' +
          '<stop offset=".16" stop-color="' + base + '"/><stop offset=".66" stop-color="' + base + '"/>' +
          '<stop offset=".66" stop-color="' + sh + '"/><stop offset="1" stop-color="' + sh + '"/></radialGradient>';
      }
      attrs = attrs.replace(f[0], 'fill="url(#' + grads[base] + ')"')
        .replace('stroke="' + INK + '"', 'stroke="' + shade(base, -0.68) + '"')
        .replace(/stroke-width="([0-9.]+)"/, function(m, w){ return 'stroke-width="' + (parseFloat(w) * 0.85).toFixed(2) + '"'; });
      return '<' + tag + attrs + '/>';
    });
    return { defs: defs, body: out };
  }

  var FX = {
    cool: function(st, ch){
      if (st < 3) return '';
      var s = '', c = ch.aura;
      [[18, 70, 46], [10, 104, 60], [22, 140, 40], [150, 60, 36], [140, 150, 50]].slice(0, st + 0).forEach(function(l){
        s += path('M' + l[0] + ' ' + l[1] + 'h' + l[2], 'none', 'stroke="' + c + '" stroke-width="3" stroke-linecap="round" opacity=".55"');
      });
      return s;
    },
    cute: function(st, ch){
      if (st < 2) return '';
      var s = '';
      [[30, 70, 0.7], [168, 86, 0.6], [24, 128, 0.5], [172, 140, 0.55]].slice(0, st).forEach(function(h, i){
        s += i % 2 ? sparkle(h[0], h[1], 7, '#ffd6e8') : heart(h[0], h[1], h[2], '#ffb3d1');
      });
      return s;
    }
  };

  var DRAW = { inu:drawInu, neko:drawNeko, usagi:drawUsagi, panda:drawPanda, hamu:drawHamu,
    dragon:drawDragon, samurai:drawSamurai, knight:drawKnight, ninja:drawNinja, robo:drawRobo };
  var SCALE = [1, 0.58, 0.72, 0.85, 0.94, 1.0];
  // 幼年期（からの中）で顔がかくれないよう、背の低いキャラは少し持ち上げる
  var LIFT = { hamu:30, robo:44 };

  function creature(ch, st){
    var s = '', gid = 'p' + (++uid), k = SCALE[st];
    if (st === 5) {
      s += '<defs><radialGradient id="' + gid + 'a"><stop offset="0" stop-color="' + ch.aura + '" stop-opacity=".55"/><stop offset=".65" stop-color="' + ch.aura + '" stop-opacity=".25"/><stop offset="1" stop-color="' + ch.aura + '" stop-opacity="0"/></radialGradient></defs>';
      s += circle(100, 100, 99, 'url(#' + gid + 'a)');
      for (var i = 0; i < 12; i++) {
        var a = i * Math.PI / 6;
        s += path('M' + (100 + Math.cos(a) * 66).toFixed(1) + ' ' + (100 + Math.sin(a) * 66).toFixed(1) + 'L' + (100 + Math.cos(a) * 96).toFixed(1) + ' ' + (100 + Math.sin(a) * 96).toFixed(1), 'none', 'stroke="' + ch.aura + '" stroke-width="4" stroke-linecap="round" opacity=".5"');
      }
    }
    INK = ch.ink; K = k;
    var R = celShade(DRAW[ch.id](st), gid);
    K = 1;
    s += '<defs>' + R.defs + '</defs>';
    s += ell(100, 187, 30 + st * 8, 6, 'rgba(40,30,80,.16)');
    s += FX[ch.type](st, ch);
    s += '<g class="pet-bounce"><g transform="translate(100 ' + (184 - (st === 1 ? LIFT[ch.id] || 0 : 0)) + ') scale(' + k + ')">' + R.body + '</g>';
    if (st === 1) {
      // 生まれたて：タマゴのからに入っている
      s += path('M50 150L62 140L72 152L84 138L96 150L108 138L120 152L132 140L146 150C150 172 130 186 100 186C70 186 48 172 50 150Z', ch.egg[1], 'stroke="' + ch.egg[0] + '" stroke-width="3.5" stroke-linejoin="round"');
      s += '<g opacity=".7">' + (ch.type === 'cute' ? heart(80, 160, 0.7, ch.egg[0]) + heart(122, 164, 0.6, ch.egg[0]) : star(80, 166, 6, ch.egg[0]) + star(122, 168, 5, ch.egg[0])) + '</g>';
    }
    if (st >= 4) [[30,46,st === 5 ? 9 : 6],[172,58,st === 5 ? 8 : 5],[26,150,7],[174,140,8],[150,22,6]].slice(0, st === 5 ? 5 : 2).forEach(function(q){ s += sparkle(q[0], q[1], q[2], ch.aura); });
    return s + '</g>';
  }

  // 絵の画像（pet-images.js）があればそれを使い、無いキャラは図形で描いた絵を使う
  function picture(ch, st, size){
    var imgs = typeof PET_IMAGES !== 'undefined' && PET_IMAGES[ch.id];
    if (!imgs || !imgs[st]) return '';
    var h = size || 160, w = Math.round(h * 0.75);
    return '<span class="pet-svg pet-pic' + (st === 5 ? ' pet-ult' : '') + '" style="width:' + w + 'px;height:' + h + 'px" role="img" aria-label="' + ch.names[st] + '">' +
      '<img src="' + imgs[st] + '" alt="" class="' + (st === 0 ? 'pet-wobble' : 'pet-bounce') + '" draggable="false"></span>';
  }

  function svg(id, st, size){
    var ch = BY[id];
    if (!ch) return '';
    st = Math.max(0, Math.min(5, Number(st) || 0));
    var pic = picture(ch, st, size);
    if (pic) return pic;
    var inner = st === 0 ? eggSvg(ch) : creature(ch, st);
    return '<svg class="pet-svg" viewBox="0 0 200 200" width="' + (size || 160) + '" height="' + (size || 160) + '" role="img" aria-label="' + ch.names[st] + '">' + inner + '</svg>';
  }

  return {
    STAGES: STAGES,
    list: LIST,
    get: function(id){ return BY[id]; },
    name: function(id, st){ var p = BY[id]; return p ? p.names[Math.max(0, Math.min(5, st))] : ''; },
    svg: svg,
    // アニメーション用のCSS（ページに1回だけ入れる）
    css: '.pet-pic{display:inline-block;position:relative;overflow:hidden;border-radius:14px;vertical-align:middle;box-shadow:0 3px 10px rgba(30,30,60,.25);background:#eee}' +
      '.pet-pic img{width:100%;height:100%;object-fit:cover;display:block;animation:none}' +
      '.pet-pic.pet-ult{box-shadow:0 0 0 3px #ffd23f,0 0 16px 4px rgba(255,200,40,.7)}' +
      '.pet-svg{overflow:visible}.pet-wobble{transform-origin:100px 184px;animation:petWob 2.4s ease-in-out infinite}' +
      '.pet-bounce{transform-origin:100px 186px;animation:petBob 2s ease-in-out infinite}' +
      '@keyframes petWob{0%,100%{transform:rotate(0)}20%{transform:rotate(-6deg)}40%{transform:rotate(5deg)}60%{transform:rotate(-2deg)}}' +
      '@keyframes petBob{0%,100%{transform:translateY(0) scale(1,1)}50%{transform:translateY(-4px) scale(1.02,.98)}}' +
      '@media (prefers-reduced-motion:reduce){.pet-wobble,.pet-bounce{animation:none}}'
  };
})();
