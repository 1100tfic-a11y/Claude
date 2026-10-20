/* =========================================================================
 * 育成キャラクター（10種類 × 6段階）を SVG で描く
 *   PETS.list          … キャラクターの一覧
 *   PETS.get(id)       … 1体の情報
 *   PETS.svg(id, st)   … 段階 st（0=タマゴ 〜 5=究極体）の絵（SVG文字列）
 *   PETS.STAGES        … 段階の名前
 * 画像ファイルは使わず、すべて図形で描いています。
 * ========================================================================= */
var PETS = (function(){
  var STAGES = ['タマゴ', '幼年期', '成長期', '成熟期', '完全体', '究極体'];

  // type: cute（ピンクのタマゴ）/ cool（青のタマゴ）
  // egg: タマゴの色 [こい色, うすい色]　c1: からだ　c2: おなか・明るい色　c3: アクセント　ink: 線
  var LIST = [
    { id:'usa',  type:'cute', motif:'bunny',   pattern:'hearts',  egg:['#ff8fb1','#ffe3ec'],
      c1:'#ffc4d6', c2:'#fff4f8', c3:'#ff6f9c', ink:'#6b2f45',
      names:['ハートのタマゴ','ぴょこ','ぴょんりん','ラビリィ','ラビエンジェ','ムーンラビエル'] },
    { id:'neko', type:'cute', motif:'cat',     pattern:'dots',    egg:['#ff9eb5','#fff0f3'],
      c1:'#ffd0b8', c2:'#fff6ef', c3:'#ff7f8f', ink:'#6b3a2f',
      names:['みずたまのタマゴ','にゃこ','にゃもん','ミャルル','ニャンティーヌ','ステラキャット'] },
    { id:'hana', type:'cute', motif:'flower',  pattern:'flowers', egg:['#f78fb3','#ffe6f0'],
      c1:'#ffd6e4', c2:'#fff7fa', c3:'#ff5c93', ink:'#6b2a4a',
      names:['おはなのタマゴ','つぼみん','はなっこ','フルール','ローズフェアリ','フローラクイーン'] },
    { id:'moko', type:'cute', motif:'sheep',   pattern:'clouds',  egg:['#f6a6d0','#fdeef7'],
      c1:'#f3d9ff', c2:'#ffffff', c3:'#d58cff', ink:'#55346b',
      names:['くものタマゴ','もこ','もこもこ','メリーぬ','ドリームメリー','ゆめくもヒツジ'] },
    { id:'yuni', type:'cute', motif:'unicorn', pattern:'stars',   egg:['#ee8fd0','#fde8f6'],
      c1:'#fff0fb', c2:'#ffffff', c3:'#c77dff', ink:'#5b2f6b',
      names:['ほしのタマゴ','ユニぽん','ユニコロ','ユニリィ','ペガユニ','スターユニコーン'] },

    { id:'dora', type:'cool', motif:'dragon',  pattern:'scales',  egg:['#3d7bf2','#d9e8ff'],
      c1:'#5b9dff', c2:'#d8ecff', c3:'#1f4fbf', ink:'#132a5c',
      names:['うろこのタマゴ','ドラピ','ドラグル','ドラグナー','アズールドラゴン','蒼龍ラグナロク'] },
    { id:'garu', type:'cool', motif:'wolf',    pattern:'zigzag',  egg:['#2f5fbf','#dbe6fb'],
      c1:'#7f95c9', c2:'#e8eefb', c3:'#2c3f7a', ink:'#1a2447',
      names:['ギザギザのタマゴ','ガルコ','ガルフ','ウルフガー','シルバーウルフ','天狼フェンリル'] },
    { id:'meka', type:'cool', motif:'robot',   pattern:'gears',   egg:['#4a86c8','#dfeaf6'],
      c1:'#9fb8d6', c2:'#e6eef7', c3:'#2f6db5', ink:'#1d2f45',
      names:['ギアのタマゴ','メカピ','メカボ','ロボガード','メタルナイト','ギガメカオー'] },
    { id:'raiga', type:'cool', motif:'thunder', pattern:'bolts',  egg:['#2a8be0','#dcefff'],
      c1:'#4cc3ff', c2:'#e3f6ff', c3:'#ffd23f', ink:'#0f3352',
      names:['いなずまのタマゴ','ピリコ','ライコ','ライガー','ボルトタイガ','雷神ライジン'] },
    { id:'aqua', type:'cool', motif:'shark',   pattern:'waves',   egg:['#1f8fb8','#d8f1f8'],
      c1:'#48b7d6', c2:'#e6f8fc', c3:'#16708f', ink:'#0d3442',
      names:['なみのタマゴ','アクピ','シャクル','アクアシャーク','タイダルシャーク','海王リヴァイア'] }
  ];
  var BY = {};
  LIST.forEach(function(p){ BY[p.id] = p; });

  // ------------------------------------------------------------ 小さな道具
  function at(o){ var s = ''; for (var k in o) if (o[k] != null) s += ' ' + k + '="' + o[k] + '"'; return s; }
  function ln(ch, w){ return 'stroke="' + ch.ink + '" stroke-width="' + (w || 3) + '" stroke-linejoin="round" stroke-linecap="round"'; }
  function circle(x, y, r, fill, extra){ return '<circle' + at({ cx:x, cy:y, r:r, fill:fill }) + ' ' + (extra || '') + '/>'; }
  function ell(x, y, rx, ry, fill, extra, rot){
    return '<ellipse' + at({ cx:x, cy:y, rx:rx, ry:ry, fill:fill, transform: rot ? 'rotate(' + rot + ' ' + x + ' ' + y + ')' : null }) + ' ' + (extra || '') + '/>';
  }
  // 中心 (cx, cy) のまわりに角度 deg だけ回した花びら
  function petal(cx, cy, dist, rx, ry, deg, fill, extra){
    return '<ellipse' + at({ cx:cx, cy:cy - dist, rx:rx, ry:ry, fill:fill, transform:'rotate(' + deg + ' ' + cx + ' ' + cy + ')' }) + ' ' + (extra || '') + '/>';
  }
  function path(d, fill, extra){ return '<path d="' + d + '" fill="' + fill + '" ' + (extra || '') + '/>'; }
  function starPts(x, y, r, n, inner){
    n = n || 5; inner = inner || 0.45; var p = [];
    for (var i = 0; i < n * 2; i++) {
      var a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? r * inner : r;
      p.push((x + Math.cos(a) * rr).toFixed(1) + ',' + (y + Math.sin(a) * rr).toFixed(1));
    }
    return p.join(' ');
  }
  function star(x, y, r, fill, extra){ return '<polygon points="' + starPts(x, y, r) + '" fill="' + fill + '" ' + (extra || '') + '/>'; }
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
  var uid = 0;

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
      case 'clouds':
        [[78,84],[124,112],[74,150]].forEach(function(q){
          s += '<g fill="' + c + '">' + circle(q[0] - 12, q[1] + 3, 9, c) + circle(q[0], q[1] - 3, 12, c) + circle(q[0] + 13, q[1] + 3, 9, c) +
            '<rect x="' + (q[0] - 21) + '" y="' + (q[1] + 2) + '" width="42" height="10" rx="5"/></g>';
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
      case 'gears':
        [[78,86,16],[124,122,20],[80,152,12]].forEach(function(g){
          s += circle(g[0], g[1], g[2], 'none', 'stroke="' + c + '" stroke-width="7" stroke-dasharray="6 5"') + circle(g[0], g[1], g[2] * 0.45, c);
        });
        break;
      case 'bolts':
        [[76,80,1.3],[126,96,1.1],[92,136,1.6],[136,154,1]].forEach(function(b){ s += bolt(b[0], b[1], b[2], c); });
        s += bolt(64, 160, 0.9, '#ffd23f');
        break;
      case 'waves':
        [72, 104, 136, 166].forEach(function(y, k){
          var d = 'M30 ' + y; for (var x = 30; x < 175; x += 24) d += 'q6 -9 12 0t12 0';
          s += '<path d="' + d + '" fill="none" stroke="' + (k % 2 ? w : c) + '" stroke-width="6" stroke-linecap="round"/>';
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

  // ------------------------------------------------------------ 顔
  function face(ch, P){
    var x = P.hx, y = P.hy + P.hr * 0.12, sp = P.hr * 0.42, k = P.hr / 40, s = '';
    if (ch.motif === 'robot') {
      s += '<rect' + at({ x: x - P.hr * 0.72, y: y - 12 * k, width: P.hr * 1.44, height: 22 * k, rx: 11 * k, fill:'#183049' }) + ' ' + ln(ch, 2.5) + '/>';
      s += ell(x - sp * 0.8, y - 1 * k, 7 * k, 5 * k, '#5ff2ff') + ell(x + sp * 0.8, y - 1 * k, 7 * k, 5 * k, '#5ff2ff');
      s += path('M' + (x - 7 * k) + ' ' + (y + 20 * k) + 'H' + (x + 7 * k), 'none', ln(ch, 2.5));
      return s;
    }
    if (ch.type === 'cute') {
      [-1, 1].forEach(function(d){
        var ex = x + d * sp;
        s += ell(ex, y, 7.5 * k, 9.5 * k, ch.ink);
        s += circle(ex - 2.4 * k, y - 3.5 * k, 3 * k, '#fff') + circle(ex + 2.6 * k, y + 3.5 * k, 1.5 * k, '#fff');
        s += ell(x + d * (sp + 9 * k), y + 13 * k, 7 * k, 4 * k, '#ff8fab', 'opacity=".55"');
      });
      s += path('M' + (x - 6 * k) + ' ' + (y + 11 * k) + 'q3 4 6 0q3 4 6 0', 'none', ln(ch, 2.4));
    } else {
      [-1, 1].forEach(function(d){
        var ex = x + d * sp;
        s += path('M' + (ex - 9 * k * d) + ' ' + (y - 3 * k) + 'Q' + ex + ' ' + (y - 9 * k) + ' ' + (ex + 8 * k * d) + ' ' + (y - 4 * k) +
          'Q' + (ex + 6 * k * d) + ' ' + (y + 8 * k) + ' ' + ex + ' ' + (y + 8 * k) + 'Q' + (ex - 8 * k * d) + ' ' + (y + 7 * k) + ' ' + (ex - 9 * k * d) + ' ' + (y - 3 * k) + 'Z', '#fff', ln(ch, 2.2));
        s += circle(ex + 1.5 * k * d, y + 1.5 * k, 4.2 * k, ch.ink) + circle(ex + 0.2 * k * d, y - 0.2 * k, 1.4 * k, '#fff');
        s += path('M' + (ex - 10 * k * d) + ' ' + (y - 13 * k) + 'L' + (ex + 8 * k * d) + ' ' + (y - 9 * k), 'none', ln(ch, 3));
      });
      s += path('M' + (x - 7 * k) + ' ' + (y + 14 * k) + 'Q' + x + ' ' + (y + 19 * k) + ' ' + (x + 8 * k) + ' ' + (y + 12 * k), 'none', ln(ch, 2.6));
      s += path('M' + (x + 3 * k) + ' ' + (y + 16 * k) + 'l2 4 2-4.5', '#fff', ln(ch, 1.5));
    }
    return s;
  }

  // ------------------------------------------------------------ 特徴（キャラごと）
  // 返り値 { back:体の後ろ, behind:頭の後ろ, deco:体の上, front:頭の上 }
  function motif(ch, st, P){
    var o = { back:'', behind:'', deco:'', front:'' }, x = P.hx, y = P.hy, r = P.hr, L = ln(ch), g = Math.max(1, st);
    var bx = P.bx, by = P.by, brx = P.brx, bry = P.bry;
    switch (ch.motif) {
      case 'bunny':
        var eh = r * (0.55 + 0.13 * g);
        [-1, 1].forEach(function(d){
          var ex = x + d * r * 0.42, ey = y - r * 0.75 - eh * 0.75, rot = d * (8 + g * 2);
          o.behind += ell(ex, ey, r * 0.26, eh, ch.c1, L, rot) + ell(ex, ey + eh * 0.1, r * 0.13, eh * 0.75, ch.c3, 'opacity=".55"', rot);
        });
        if (st >= 3) o.back += circle(bx + brx * 0.95, by + bry * 0.35, 13 + st * 2, ch.c2, L);
        if (st >= 4) o.deco += bow(ch, bx, by - bry * 0.42, 1 + (st - 4) * 0.2);
        if (st >= 5) o.back += wings(ch, bx, by - bry * 0.3, 1.25, 'feather');
        break;
      case 'cat':
        [-1, 1].forEach(function(d){
          var ex = x + d * r * 0.62;
          o.behind += path('M' + (ex - d * r * 0.42) + ' ' + (y - r * 0.55) + 'L' + (ex + d * r * 0.12) + ' ' + (y - r * (1.05 + 0.05 * g)) + 'L' + (ex + d * r * 0.4) + ' ' + (y - r * 0.4) + 'Z', ch.c1, L);
          o.behind += path('M' + (ex - d * r * 0.22) + ' ' + (y - r * 0.6) + 'L' + (ex + d * r * 0.1) + ' ' + (y - r * (0.9 + 0.05 * g)) + 'L' + (ex + d * r * 0.25) + ' ' + (y - r * 0.5) + 'Z', ch.c3, 'opacity=".55"');
          for (var i = -1; i <= 1; i++) o.front += path('M' + (x + d * r * 0.62) + ' ' + (y + r * 0.32 + i * 5) + 'l' + (d * r * 0.42) + ' ' + (i * 5), 'none', ln(ch, 2));
        });
        if (st >= 2) o.back += path('M' + (bx + brx * 0.8) + ' ' + (by + bry * 0.6) + 'C' + (bx + brx * 1.8) + ' ' + (by + bry * 0.6) + ' ' + (bx + brx * 1.2) + ' ' + (by - bry * 1.2) + ' ' + (bx + brx * 1.7) + ' ' + (by - bry * 1.3), 'none', 'stroke="' + ch.ink + '" stroke-width="' + (13 + st) + '" stroke-linecap="round"') +
          path('M' + (bx + brx * 0.8) + ' ' + (by + bry * 0.6) + 'C' + (bx + brx * 1.8) + ' ' + (by + bry * 0.6) + ' ' + (bx + brx * 1.2) + ' ' + (by - bry * 1.2) + ' ' + (bx + brx * 1.7) + ' ' + (by - bry * 1.3), 'none', 'stroke="' + ch.c1 + '" stroke-width="' + (8 + st) + '" stroke-linecap="round"');
        if (st >= 4) o.deco += path('M' + (bx - brx * 0.7) + ' ' + (by - bry * 0.8) + 'Q' + bx + ' ' + (by - bry * 0.55) + ' ' + (bx + brx * 0.7) + ' ' + (by - bry * 0.8), 'none', 'stroke="' + ch.c3 + '" stroke-width="7" stroke-linecap="round"') + circle(bx, by - bry * 0.62, 7, '#ffd84a', ln(ch, 2));
        if (st >= 5) o.back += wings(ch, bx, by - bry * 0.3, 1.2, 'feather');
        break;
      case 'flower':
        var n = 5 + g, pr = r * (0.3 + 0.03 * g);
        for (var i = 0; i < n; i++) {
          var a = -Math.PI / 2 + (i - (n - 1) / 2) * (Math.PI * 1.25 / n);
          var px = x + Math.cos(a) * r * 0.95, py = y + Math.sin(a) * r * 0.95;
          o.behind += ell(px, py, pr * 0.7, pr * 1.15, i % 2 ? ch.c3 : '#ff9cc0', L, (a * 180 / Math.PI + 90).toFixed(0));
        }
        if (st <= 2) o.front += path('M' + x + ' ' + (y - r) + 'q-2 -10 4 -16', 'none', 'stroke="#4caf50" stroke-width="3"') + ell(x + 9, y - r - 14, 7, 4, '#7bd389', ln(ch, 2), -30);
        if (st >= 3) o.back += wings(ch, bx, by - bry * 0.4, 0.75 + st * 0.12, 'butterfly');
        if (st >= 4) o.deco += flowerMark(bx, by - bry * 0.1, 11, ch);
        break;
      case 'sheep':
        var m = 6 + g * 2;
        for (var i = 0; i < m; i++) {
          var a = Math.PI + (i / (m - 1)) * Math.PI;
          o.behind += circle(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.8, r * 0.3, ch.c2, L);
        }
        if (st >= 3) [-1, 1].forEach(function(d){
          o.front += path('M' + (x + d * r * 0.75) + ' ' + (y - r * 0.35) + 'c' + (d * 14) + ' -6 ' + (d * 18) + ' 12 ' + (d * 6) + ' 14c' + (d * -6) + ' 1 ' + (d * -6) + ' -6 ' + (d * -1) + ' -6', 'none', 'stroke="#f2c14e" stroke-width="5" stroke-linecap="round"');
        });
        if (st >= 3) for (var i = 0; i < 7; i++) {
          var a = (i / 6) * Math.PI;
          o.deco += circle(bx + Math.cos(a) * brx * 0.85, by + bry * 0.15 + Math.sin(a) * bry * 0.6, brx * 0.22, ch.c2, L);
        }
        if (st >= 4) o.back += cloudWings(ch, bx, by - bry * 0.5, 0.8 + (st - 4) * 0.35);
        break;
      case 'unicorn':
        var hh = r * (0.35 + 0.1 * g);
        o.front += path('M' + (x - r * 0.13) + ' ' + (y - r * 0.82) + 'L' + x + ' ' + (y - r * 0.82 - hh) + 'L' + (x + r * 0.13) + ' ' + (y - r * 0.82) + 'Z', '#ffe27a', L) +
          path('M' + (x - r * 0.08) + ' ' + (y - r * 0.82 - hh * 0.3) + 'l' + (r * 0.16) + ' -5M' + (x - r * 0.05) + ' ' + (y - r * 0.82 - hh * 0.6) + 'l' + (r * 0.1) + ' -4', 'none', ln(ch, 2));
        [-1, 1].forEach(function(d){
          o.behind += path('M' + (x + d * r * 0.35) + ' ' + (y - r * 0.7) + 'L' + (x + d * r * 0.6) + ' ' + (y - r * 1.12) + 'L' + (x + d * r * 0.72) + ' ' + (y - r * 0.55) + 'Z', ch.c1, L);
        });
        if (st >= 2) {
          // たてがみ：頭の右上から後ろへ、虹色の巻き毛
          var mc = ['#ff9cc0', '#c99cff', '#8fd3ff', '#ffd27f', '#ff9cc0'], mn = 2 + st;
          for (var i = 0; i < mn; i++) {
            var a = -Math.PI * 0.45 + i * (Math.PI * 0.75 / (mn - 1));
            o.behind += circle(x + Math.cos(a) * r * 1.0, y + Math.sin(a) * r * 1.0, r * 0.28, mc[i % mc.length], L);
          }
        }
        if (st >= 3) o.back += path('M' + (bx + brx * 0.85) + ' ' + (by + bry * 0.2) + 'q' + (30 + st * 4) + ' -10 ' + (24 + st * 4) + ' 30q-4 -18 -22 -12', '#c99cff', L);
        if (st >= 4) o.back += wings(ch, bx, by - bry * 0.4, 0.95 + (st - 4) * 0.3, 'feather');
        break;
      case 'dragon':
        [-1, 1].forEach(function(d){
          var hx = x + d * r * 0.5;
          o.front += path('M' + (hx - d * 5) + ' ' + (y - r * 0.78) + 'Q' + (hx + d * r * 0.1) + ' ' + (y - r * (1.15 + 0.08 * g)) + ' ' + (hx + d * r * (0.35 + 0.05 * g)) + ' ' + (y - r * (1.25 + 0.1 * g)) + 'Q' + (hx + d * 4) + ' ' + (y - r * 0.95) + ' ' + (hx + d * 9) + ' ' + (y - r * 0.65) + 'Z', '#fff3c4', L);
        });
        if (st >= 2) o.back += tail(ch, bx, by, brx, bry, st, true);
        if (st >= 3) o.back += wings(ch, bx, by - bry * 0.5, 0.7 + st * 0.13, 'bat');
        o.deco += belly(ch, bx, by, brx, bry, true);
        break;
      case 'wolf':
        [-1, 1].forEach(function(d){
          var ex = x + d * r * 0.55;
          o.behind += path('M' + (ex - d * r * 0.3) + ' ' + (y - r * 0.6) + 'L' + (ex + d * r * 0.08) + ' ' + (y - r * (1.2 + 0.07 * g)) + 'L' + (ex + d * r * 0.42) + ' ' + (y - r * 0.38) + 'Z', ch.c1, L) +
            path('M' + (ex - d * r * 0.12) + ' ' + (y - r * 0.6) + 'L' + (ex + d * r * 0.06) + ' ' + (y - r * (1.0 + 0.06 * g)) + 'L' + (ex + d * r * 0.22) + ' ' + (y - r * 0.5) + 'Z', ch.c3, 'opacity=".6"');
        });
        if (st >= 2) o.back += path('M' + (bx + brx * 0.7) + ' ' + (by + bry * 0.5) + 'Q' + (bx + brx * 2) + ' ' + (by + bry * 0.4) + ' ' + (bx + brx * 1.6) + ' ' + (by - bry * (0.6 + st * 0.15)) + 'Q' + (bx + brx * 1.3) + ' ' + (by - bry * 0.1) + ' ' + (bx + brx * 0.7) + ' ' + (by + bry * 0.1) + 'Z', ch.c1, L);
        if (st >= 3) {
          var sp = '';
          for (var i = 0; i < 9; i++) {
            var a = Math.PI * 0.15 + i * Math.PI * 0.7 / 8;
            var mx = x + Math.cos(a) * r * 0.95, my = y + Math.sin(a) * r * 0.85;
            sp += 'L' + (x + Math.cos(a) * r * (1.25 + st * 0.04)).toFixed(1) + ' ' + (y + Math.sin(a) * r * 1.15).toFixed(1) + 'L' + mx.toFixed(1) + ' ' + my.toFixed(1);
          }
          o.behind += path('M' + (x + r * 0.9) + ' ' + (y + r * 0.2) + sp + 'Z', ch.c2, L);
        }
        if (st >= 4) o.deco += path('M' + (bx - brx * 0.8) + ' ' + (by - bry * 0.75) + 'Q' + bx + ' ' + (by - bry * 0.45) + ' ' + (bx + brx * 0.8) + ' ' + (by - bry * 0.75) + 'L' + (bx + brx * 0.55) + ' ' + (by - bry * 0.2) + 'L' + (bx + brx * 0.35) + ' ' + (by - bry * 0.6) + 'Z', '#e94e5b', L);
        o.deco += belly(ch, bx, by, brx, bry, false);
        if (st >= 5) o.back += wings(ch, bx, by - bry * 0.4, 1.2, 'bat');
        break;
      case 'robot':
        var ah = 14 + g * 5;
        o.front += path('M' + x + ' ' + (y - r * 0.85) + 'V' + (y - r * 0.85 - ah), 'none', ln(ch, 3)) + circle(x, y - r * 0.85 - ah, 6 + st * 0.6, st >= 4 ? '#ff5c5c' : '#5ff2ff', ln(ch, 2.5));
        [-1, 1].forEach(function(d){ o.behind += circle(x + d * r * 0.98, y, r * 0.24, ch.c3, L) + circle(x + d * r * 0.98, y, r * 0.09, '#fff'); });
        o.deco += '<rect' + at({ x: bx - brx * 0.45, y: by - bry * 0.4, width: brx * 0.9, height: bry * 0.7, rx: 6, fill: ch.c2 }) + ' ' + L + '/>' +
          circle(bx - brx * 0.18, by - bry * 0.05, 4, '#ff5c5c') + circle(bx + brx * 0.18, by - bry * 0.05, 4, '#5ff2ff');
        if (st >= 4) [-1, 1].forEach(function(d){
          o.back += path('M' + (bx + d * brx * 0.6) + ' ' + (by - bry * 0.6) + 'L' + (bx + d * brx * (1.7 + (st - 4) * 0.4)) + ' ' + (by - bry * (1.3 + (st - 4) * 0.3)) + 'L' + (bx + d * brx * (1.5 + (st - 4) * 0.4)) + ' ' + (by + bry * 0.1) + 'Z', ch.c3, L) +
            path('M' + (bx + d * brx * 0.9) + ' ' + (by - bry * 0.45) + 'L' + (bx + d * brx * 1.4) + ' ' + (by - bry * 0.75), 'none', 'stroke="#5ff2ff" stroke-width="3" stroke-linecap="round"');
        });
        break;
      case 'thunder':
        [-1, 1].forEach(function(d){
          var ex = x + d * r * 0.55, k2 = 0.8 + g * 0.12;
          o.behind += '<path transform="translate(' + ex + ' ' + (y - r * 0.95) + ') scale(' + (d * 1.4 * k2) + ' ' + (1.6 * k2) + ')" d="M2-12L-7 2H0L-3 13L8-3H1Z" fill="' + ch.c3 + '" ' + ln(ch, 2) + '/>';
        });
        if (st >= 2) {
          var d2 = 'M' + (bx + brx * 0.8) + ' ' + (by + bry * 0.4), tx = bx + brx * 0.8, ty = by + bry * 0.4;
          for (var i = 0; i < 2 + st; i++) { tx += 9; ty -= (i % 2 ? -10 : 18); d2 += 'L' + tx + ' ' + ty; }
          o.back += path(d2, 'none', 'stroke="' + ch.ink + '" stroke-width="12" stroke-linejoin="round" stroke-linecap="round"') + path(d2, 'none', 'stroke="' + ch.c3 + '" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"');
        }
        for (var i = -1; i <= 1; i++) o.deco += path('M' + (bx + i * brx * 0.45 - 6) + ' ' + (by - bry * 0.3) + 'l6 10-6 10', 'none', 'stroke="' + ch.ink + '" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity=".55"');
        if (st >= 4) [-1, 1].forEach(function(d){ o.back += bolt(bx + d * brx * 1.55, by - bry * 0.7, 1.5 + (st - 4) * 0.4, ch.c3, ln(ch, 2)); });
        break;
      case 'shark':
        o.front += path('M' + (x - r * 0.25) + ' ' + (y - r * 0.85) + 'Q' + (x + r * 0.05) + ' ' + (y - r * (1.25 + 0.08 * g)) + ' ' + (x + r * (0.35 + 0.04 * g)) + ' ' + (y - r * (1.35 + 0.08 * g)) + 'Q' + (x + r * 0.2) + ' ' + (y - r * 1.05) + ' ' + (x + r * 0.3) + ' ' + (y - r * 0.8) + 'Z', ch.c3, L);
        [-1, 1].forEach(function(d){
          o.behind += path('M' + (x + d * r * 0.85) + ' ' + (y + r * 0.1) + 'q' + (d * r * 0.5) + ' -' + (r * 0.1) + ' ' + (d * r * 0.55) + ' -' + (r * 0.45) + 'q-' + (d * r * 0.1) + ' ' + (r * 0.35) + ' -' + (d * r * 0.45) + ' ' + (r * 0.6) + 'Z', ch.c3, L);
          o.front += path('M' + (x + d * r * 0.6) + ' ' + (y + r * 0.45) + 'l' + (d * 3) + ' 6M' + (x + d * r * 0.68) + ' ' + (y + r * 0.38) + 'l' + (d * 3) + ' 6', 'none', ln(ch, 2));
        });
        if (st >= 2) o.back += path('M' + (bx + brx * 0.75) + ' ' + (by + bry * 0.3) + 'L' + (bx + brx * (1.55 + st * 0.08)) + ' ' + (by - bry * 0.4) + 'L' + (bx + brx * (1.3 + st * 0.05)) + ' ' + (by + bry * 0.3) + 'L' + (bx + brx * (1.55 + st * 0.08)) + ' ' + (by + bry * 0.9) + 'Z', ch.c3, L);
        o.deco += belly(ch, bx, by, brx, bry, false);
        if (st >= 4) [-1, 1].forEach(function(d){
          o.back += path('M' + (bx + d * brx * 1.1) + ' ' + (by + bry * 0.8) + 'q' + (d * 18) + ' -20 0 -40q' + (d * -16) + ' -16 ' + (d * 4) + ' -34', 'none', 'stroke="#7fdcf2" stroke-width="' + (6 + (st - 4) * 3) + '" stroke-linecap="round" opacity=".8"');
        });
        break;
    }
    return o;
  }

  function bow(ch, x, y, k){
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + k + ')">' +
      path('M0 0L-16-9V9Z', ch.c3, ln(ch, 2.5)) + path('M0 0L16-9V9Z', ch.c3, ln(ch, 2.5)) + circle(0, 0, 5, '#ff9cc0', ln(ch, 2.5)) + '</g>';
  }
  function flowerMark(x, y, r, ch){
    var s = '';
    for (var i = 0; i < 5; i++) s += petal(x, y, r * 0.6, r * 0.42, r * 0.65, i * 72, '#ff9cc0', ln(ch, 2));
    return s + circle(x, y, r * 0.35, '#ffe680', ln(ch, 2));
  }
  function belly(ch, bx, by, brx, bry, lines){
    var s = ell(bx, by + bry * 0.12, brx * 0.6, bry * 0.66, ch.c2);
    if (lines) for (var i = 0; i < 3; i++) s += path('M' + (bx - brx * 0.4) + ' ' + (by - bry * 0.15 + i * bry * 0.3) + 'Q' + bx + ' ' + (by - bry * 0.02 + i * bry * 0.3) + ' ' + (bx + brx * 0.4) + ' ' + (by - bry * 0.15 + i * bry * 0.3), 'none', ln(ch, 2) + ' opacity=".4"');
    return s;
  }
  function tail(ch, bx, by, brx, bry, st, spikes){
    var tx = bx + brx * (1.4 + st * 0.12), ty = by - bry * 0.1;
    var s = path('M' + (bx + brx * 0.6) + ' ' + (by + bry * 0.75) + 'Q' + (bx + brx * 1.5) + ' ' + (by + bry * 0.9) + ' ' + tx + ' ' + ty + 'Q' + (bx + brx * 1.2) + ' ' + (by + bry * 0.4) + ' ' + (bx + brx * 0.6) + ' ' + (by + bry * 0.2) + 'Z', ch.c1, ln(ch));
    if (spikes) s += path('M' + (tx - 4) + ' ' + (ty + 6) + 'l6 -14 4 12Z', '#fff3c4', ln(ch, 2));
    return s;
  }
  function wings(ch, x, y, k, kind){
    var s = '';
    [-1, 1].forEach(function(d){
      var t = 'translate(' + x + ' ' + y + ') scale(' + (d * k) + ' ' + k + ')';
      if (kind === 'bat') {
        s += '<path transform="' + t + '" d="M20 0C40-30 70-40 92-30C84-18 84-6 88 4C76 0 66 2 62 12C54 6 42 8 38 18C32 10 26 8 20 12Z" fill="' + ch.c3 + '" ' + ln(ch, 3 / k) + '/>';
      } else if (kind === 'butterfly') {
        s += '<g transform="' + t + '" opacity=".92"><path d="M14-4C30-44 78-46 70-10C66 6 40 6 14 2Z" fill="#ffd6ec" ' + ln(ch, 2.5 / k) + '/>' +
          '<path d="M14 4C40 8 62 18 52 36C40 50 20 30 12 10Z" fill="#ffb3d6" ' + ln(ch, 2.5 / k) + '/>' + circle(48, -16, 7, '#fff', '') + '</g>';
      } else {
        s += '<path transform="' + t + '" d="M18 0C30-30 64-44 90-38C80-28 86-22 78-16C86-10 78-4 72 0C76 6 66 10 60 10C60 18 46 18 40 16C32 18 24 12 18 8Z" fill="#ffffff" ' + ln(ch, 3 / k) + '/>';
      }
    });
    return s;
  }
  function cloudWings(ch, x, y, k){
    var s = '';
    [-1, 1].forEach(function(d){
      s += '<g transform="translate(' + x + ' ' + y + ') scale(' + (d * k) + ' ' + k + ')">' + circle(44, -6, 16, '#fff', ln(ch, 2.5)) + circle(64, -16, 14, '#fff', ln(ch, 2.5)) + circle(70, 4, 12, '#fff', ln(ch, 2.5)) + circle(50, 10, 12, '#fff', ln(ch, 2.5)) + '</g>';
    });
    return s;
  }
  function crown(ch, x, y, k){
    var gem = ch.type === 'cute' ? '#ff5c93' : '#3d7bf2';
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + k + ')">' +
      path('M-22 0L-26-24L-12-12L0-30L12-12L26-24L22 0Z', '#ffd84a', ln(ch, 2.5 / k)) +
      circle(0, -10, 4.5, gem, ln(ch, 1.5)) + circle(-26, -24, 3.5, gem) + circle(26, -24, 3.5, gem) + circle(0, -30, 3.5, gem) + '</g>';
  }

  // ------------------------------------------------------------ からだ
  function creature(ch, st){
    // 段階ごとの大きさ（頭 hx,hy,hr と からだ bx,by,brx,bry）
    var P = [null,
      { hx:100, hy:132, hr:38 },
      { hx:100, hy:114, hr:44, bx:100, by:150, brx:40, bry:28 },
      { hx:100, hy:84,  hr:40, bx:100, by:146, brx:36, bry:34 },
      { hx:100, hy:80,  hr:39, bx:100, by:142, brx:42, bry:38 },
      { hx:100, hy:78,  hr:40, bx:100, by:140, brx:45, bry:40 }][st];
    var robot = ch.motif === 'robot', L = ln(ch), s = '';
    if (st === 1) { P.bx = 100; P.by = 160; P.brx = 30; P.bry = 20; }
    var M = motif(ch, st, P), gid = 'p' + (++uid);

    s += '<defs><radialGradient id="' + gid + 'a"><stop offset="0" stop-color="' + (ch.type === 'cute' ? '#ffe3f1' : '#d9ecff') + '"/><stop offset=".6" stop-color="' + (ch.type === 'cute' ? '#ffd0e6' : '#bfe0ff') + '" stop-opacity=".7"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>';
    if (st === 5) {
      s += circle(100, 105, 98, 'url(#' + gid + 'a)');
      for (var i = 0; i < 12; i++) {
        var a = i * Math.PI / 6;
        s += path('M' + (100 + Math.cos(a) * 60).toFixed(1) + ' ' + (105 + Math.sin(a) * 60).toFixed(1) + 'L' + (100 + Math.cos(a) * 95).toFixed(1) + ' ' + (105 + Math.sin(a) * 95).toFixed(1), 'none', 'stroke="' + (ch.type === 'cute' ? '#ffb3d1' : '#9cc9ff') + '" stroke-width="4" stroke-linecap="round" opacity=".55"');
      }
    }
    s += ell(100, 188, 46 + st * 4, 7, 'rgba(0,0,0,.13)');
    s += '<g class="pet-bounce">';
    s += M.back;

    if (st === 1) {
      // タマゴのからに入った赤ちゃん
      s += M.behind;
      s += robot ? '<rect' + at({ x: P.hx - P.hr, y: P.hy - P.hr * 0.9, width: P.hr * 2, height: P.hr * 1.9, rx: P.hr * 0.6, fill: ch.c1 }) + ' ' + L + '/>' : circle(P.hx, P.hy, P.hr, ch.c1, L);
      s += face(ch, P) + M.front;
      s += path('M50 150L62 140L72 152L84 138L96 150L108 138L120 152L132 140L146 150C150 172 130 186 100 186C70 186 48 172 50 150Z', ch.egg[1], 'stroke="' + ch.egg[0] + '" stroke-width="3.5" stroke-linejoin="round"');
      s += '<g opacity=".7">' + (ch.type === 'cute' ? heart(80, 160, 0.7, ch.egg[0]) + heart(122, 164, 0.6, ch.egg[0]) : star(80, 166, 6, ch.egg[0]) + star(122, 168, 5, ch.egg[0])) + '</g>';
      return s + '</g>';
    }

    // 足
    [-1, 1].forEach(function(d){ s += ell(P.bx + d * P.brx * 0.5, P.by + P.bry * 0.9, 12 + st, 8 + st * 0.6, ch.c1, L); });
    // からだ
    s += robot ? '<rect' + at({ x: P.bx - P.brx, y: P.by - P.bry, width: P.brx * 2, height: P.bry * 2, rx: P.brx * 0.35, fill: ch.c1 }) + ' ' + L + '/>' : ell(P.bx, P.by, P.brx, P.bry, ch.c1, L);
    s += M.deco;
    // うで
    if (st >= 3) [-1, 1].forEach(function(d){ s += ell(P.bx + d * P.brx * 0.95, P.by - P.bry * 0.05, 9 + st, 15 + st * 1.5, ch.c1, L, d * -25); });
    else [-1, 1].forEach(function(d){ s += ell(P.bx + d * P.brx * 0.92, P.by, 7, 10, ch.c1, L, d * -30); });
    // 頭
    s += M.behind;
    s += robot ? '<rect' + at({ x: P.hx - P.hr, y: P.hy - P.hr * 0.85, width: P.hr * 2, height: P.hr * 1.75, rx: P.hr * 0.45, fill: ch.c1 }) + ' ' + L + '/>' : circle(P.hx, P.hy, P.hr, ch.c1, L);
    s += face(ch, P) + M.front;
    if (st === 5) {
      s += crown(ch, P.hx, P.hy - P.hr * (ch.motif === 'unicorn' || ch.motif === 'robot' || ch.motif === 'shark' ? 0.92 : 0.9), 0.9);
      [[32,52,10],[168,60,8],[40,150,7],[166,146,9],[150,28,6]].forEach(function(q){ s += sparkle(q[0], q[1], q[2], ch.type === 'cute' ? '#ff8fc0' : '#6fb6ff'); });
    } else if (st === 4) {
      [[40,60,7],[162,70,6]].forEach(function(q){ s += sparkle(q[0], q[1], q[2], ch.type === 'cute' ? '#ffb3d1' : '#9cc9ff'); });
    }
    return s + '</g>';
  }

  function svg(id, st, size){
    var ch = BY[id];
    if (!ch) return '';
    st = Math.max(0, Math.min(5, Number(st) || 0));
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
    css: '.pet-svg{overflow:visible}.pet-wobble{transform-origin:100px 184px;animation:petWob 2.4s ease-in-out infinite}' +
      '.pet-bounce{transform-origin:100px 186px;animation:petBob 2s ease-in-out infinite}' +
      '@keyframes petWob{0%,100%{transform:rotate(0)}20%{transform:rotate(-6deg)}40%{transform:rotate(5deg)}60%{transform:rotate(-2deg)}}' +
      '@keyframes petBob{0%,100%{transform:translateY(0) scale(1,1)}50%{transform:translateY(-4px) scale(1.02,.98)}}' +
      '@media (prefers-reduced-motion:reduce){.pet-wobble,.pet-bounce{animation:none}}'
  };
})();
