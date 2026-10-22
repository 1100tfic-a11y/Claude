/* =========================================================================
 * ガチャから出るキャラクターの一覧
 *   GACHA.list          … キャラクターの一覧（この順で図鑑に並びます）
 *   GACHA.get(id)       … 1体の情報
 *   GACHA.rarity(r)     … レア度の情報（名前・色・★の数）
 *   GACHA.pic(id, size) … キャラの絵（HTML文字列）
 *
 * 絵は char-images.js（tools/add_chars.py で art/ の画像から自動作成）に入っています。
 * 絵がまだ無いキャラは、レア度の色のカードに emoji を描いて代わりにします。
 *
 * ★ キャラを足す・変えるときは、下の LIST を書きかえます。
 *   id     … 半角英数字（art/ に置く画像のファイル名と同じにする。例：c01 → art/c01.png）
 *   name   … 表示する名前
 *   rarity … 'N'（ノーマル）/ 'R'（レア）/ 'SR'（スーパーレア）/ 'SSR'（ウルトラレア）
 *   emoji  … 絵が無いときの代わりの絵（なくてもよい）
 *   sample … true のキャラは仮のキャラです（本物の絵がそろったら消します）
 * ========================================================================= */
var GACHA = (function(){
  // weight の初期値は Apps Script 側の CONFIG.RATES で上書きされます
  var RARITIES = [
    { id:'N',   name:'ノーマル',       stars:1, color:'#8a96a8', light:'#eef1f5' },
    { id:'R',   name:'レア',           stars:2, color:'#2f8fd0', light:'#e3f2fc' },
    { id:'SR',  name:'スーパーレア',   stars:3, color:'#b05ce0', light:'#f4e8fc' },
    { id:'SSR', name:'ウルトラレア',   stars:4, color:'#e0a800', light:'#fff6d6' }
  ];

  var LIST = [
    { id:'c01', name:'サンプル1',  rarity:'N',   emoji:'🐣', sample:true },
    { id:'c02', name:'サンプル2',  rarity:'N',   emoji:'🐸', sample:true },
    { id:'c03', name:'サンプル3',  rarity:'N',   emoji:'🐟', sample:true },
    { id:'c04', name:'サンプル4',  rarity:'N',   emoji:'🐌', sample:true },
    { id:'c05', name:'サンプル5',  rarity:'N',   emoji:'🐝', sample:true },
    { id:'c06', name:'サンプル6',  rarity:'N',   emoji:'🐢', sample:true },
    { id:'c07', name:'サンプル7',  rarity:'R',   emoji:'🦊', sample:true },
    { id:'c08', name:'サンプル8',  rarity:'R',   emoji:'🐧', sample:true },
    { id:'c09', name:'サンプル9',  rarity:'R',   emoji:'🦉', sample:true },
    { id:'c10', name:'サンプル10', rarity:'SR',  emoji:'🦁', sample:true },
    { id:'c11', name:'サンプル11', rarity:'SR',  emoji:'🦄', sample:true },
    { id:'c12', name:'サンプル12', rarity:'SSR', emoji:'🐉', sample:true }
  ];

  var BY = {}, RBY = {};
  LIST.forEach(function(c){ BY[c.id] = c; });
  RARITIES.forEach(function(r){ RBY[r.id] = r; });

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  /** キャラの絵。hidden=true なら影（まだ持っていないキャラ） */
  function pic(id, size, hidden){
    var c = BY[id], r = RBY[c ? c.rarity : 'N'];
    size = size || 120;
    var img = typeof CHAR_IMAGES !== 'undefined' && CHAR_IMAGES[id];
    var cls = 'gc-pic' + (hidden ? ' gc-hidden' : '');
    var box = 'width:' + size + 'px;height:' + size + 'px';
    if (img) {
      return '<span class="' + cls + '" style="' + box + '"><img src="' + img + '" alt="' + esc(hidden ? '？' : c.name) + '"></span>';
    }
    // 絵が無いキャラ：レア度の色のカード
    return '<span class="' + cls + ' gc-card" style="' + box + ';--rc:' + r.color + ';--rl:' + r.light + ';font-size:' + Math.round(size * 0.5) + 'px">' +
      (hidden ? '？' : esc((c && c.emoji) || '★')) + '</span>';
  }

  function stars(r){
    var n = (RBY[r] || RBY.N).stars, s = '';
    for (var i = 0; i < n; i++) s += '★';
    return s;
  }

  var css = [
    '.gc-pic{display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;line-height:1;border-radius:14px;overflow:hidden;flex:0 0 auto}',
    '.gc-pic img{width:100%;height:100%;object-fit:contain;display:block}',
    '.gc-card{background:radial-gradient(circle at 50% 40%,#fff 0,var(--rl) 70%);border:3px solid var(--rc);box-sizing:border-box}',
    '.gc-hidden img{filter:brightness(0);opacity:.18}',
    '.gc-hidden.gc-card{background:#eef1f5;border-color:#d7dee9;color:#b6c0cf;font-weight:900}'
  ].join('\n');

  return {
    list: LIST,
    RARITIES: RARITIES,
    get: function(id){ return BY[id] || null; },
    rarity: function(r){ return RBY[r] || RBY.N; },
    stars: stars,
    pic: pic,
    css: css
  };
})();
