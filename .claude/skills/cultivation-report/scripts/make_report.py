#!/usr/bin/env python3
"""技術科「生物育成」栽培観察レポート（Word / A4・1日1枚）を作成する。

構成:
  1枚目      表紙（作物名入りタイトル・年組番名前・観察・栽培期間）
  2枚目〜    月〜金の観察日記（1日1枚。写真・背丈・葉の枚数・手入れ・考察）
  最後の1枚  収穫後のまとめ

例:
  python3 make_report.py --crop ミニトマト --start 2026-05-11 --end 2026-07-17 -o report.docx
  python3 make_report.py --crop ダイコン --start 2026-10-05 --end 2026-12-18 \
      --grade 2 --klass 3 --number 15 --name "山田 太郎" \
      --skip 2026-11-03,2026-11-23 --photos ./photos --pdf -o daikon.docx
"""
import argparse
import datetime as dt
import os
import re
import subprocess
import sys

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_ROW_HEIGHT_RULE, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Mm, Pt, RGBColor

FONT = "BIZ UDPGothic"          # Windows 10 以降に標準搭載。無い環境では代替フォントで表示される
WEEKDAY = "月火水木金土日"
PAGE_W, PAGE_H = 210, 297       # A4 (mm)
MARGIN_X, MARGIN_TOP, MARGIN_BOTTOM = 15, 17, 14
BODY_W = PAGE_W - MARGIN_X * 2  # 180mm
GRAY = RGBColor(0x8A, 0x94, 0xA3)
ACCENT = "2F7D4F"               # 見出しの帯（緑）
PALE = "EAF4EC"
CARE_ITEMS = ["水やり", "追肥", "間引き", "除草", "土寄せ", "支柱・誘引", "芽かき・摘心"]
PHOTO_EXT = (".jpg", ".jpeg", ".png", ".gif", ".bmp")


# ---------- 低レベルの書式ヘルパー ----------

def set_cell_borders(cell, **edges):
    """edges: top/bottom/left/right = (val, size_eighths_pt, color) or None（線なし）"""
    tcPr = cell._tc.get_or_add_tcPr()
    borders = tcPr.find(qn("w:tcBorders"))
    if borders is None:
        borders = OxmlElement("w:tcBorders")
        tcPr.append(borders)
    for edge, spec in edges.items():
        el = OxmlElement(f"w:{edge}")
        if spec is None:
            el.set(qn("w:val"), "nil")
        else:
            val, sz, color = spec
            el.set(qn("w:val"), val)
            el.set(qn("w:sz"), str(sz))
            el.set(qn("w:space"), "0")
            el.set(qn("w:color"), color)
        borders.append(el)


def shade(cell, fill):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), fill)
    tcPr.append(shd)


def set_cell_margins(table, top=0.8, bottom=0.8, left=1.8, right=1.8):
    tblPr = table._tbl.tblPr
    mar = OxmlElement("w:tblCellMar")
    for edge, mm in (("top", top), ("left", left), ("bottom", bottom), ("right", right)):
        el = OxmlElement(f"w:{edge}")
        el.set(qn("w:w"), str(int(mm * 56.7)))
        el.set(qn("w:type"), "dxa")
        mar.append(el)
    tblPr.append(mar)


def fix_layout(table, widths_mm):
    """列幅を固定（Word が自動調整で崩さないように）"""
    tblPr = table._tbl.tblPr
    layout = OxmlElement("w:tblLayout")
    layout.set(qn("w:type"), "fixed")
    tblPr.append(layout)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    for col, w in zip(table._tbl.tblGrid.findall(qn("w:gridCol")), widths_mm):
        col.set(qn("w:w"), str(int(w * 56.7)))
    for row in table.rows:
        for cell, w in zip(row.cells, widths_mm):
            cell.width = Mm(w)


def row_height(row, mm):
    row.height = Mm(mm)
    row.height_rule = WD_ROW_HEIGHT_RULE.EXACTLY


def no_split(row):
    trPr = row._tr.get_or_add_trPr()
    el = OxmlElement("w:cantSplit")
    trPr.append(el)


def write(cell_or_par, text, size=10.5, bold=False, color=None, align=None, new_par=False):
    """セル（または段落）に文字を書く。戻り値は段落。"""
    if hasattr(cell_or_par, "paragraphs"):
        par = cell_or_par.add_paragraph() if new_par else cell_or_par.paragraphs[0]
    else:
        par = cell_or_par
    tight(par)
    if align is not None:
        par.alignment = align
    run = par.add_run(text)
    run.font.size = Pt(size)
    run.bold = bold
    if color is not None:
        run.font.color.rgb = color
    return par


def tight(par, before=0, after=0):
    pf = par.paragraph_format
    pf.space_before = Pt(before)
    pf.space_after = Pt(after)
    pf.line_spacing = 1.0


def spacer(doc, pt=4):
    p = doc.add_paragraph()
    tight(p)
    p.paragraph_format.line_spacing = Pt(pt)
    r = p.add_run("")
    r.font.size = Pt(1)
    return p


def add_page_field(par):
    run = par.add_run()
    for tag, attr in (("w:fldChar", "begin"), ("w:instrText", None), ("w:fldChar", "end")):
        el = OxmlElement(tag)
        if attr:
            el.set(qn("w:fldCharType"), attr)
        else:
            el.set(qn("xml:space"), "preserve")
            el.text = "PAGE"
        run._r.append(el)
    run.font.size = Pt(8)
    run.font.color.rgb = GRAY


# ---------- 部品 ----------

def heading_bar(doc, text, sub=None, page_break=False, size=13):
    """緑の帯の見出し（1行テーブル）。page_break=True でこの見出しから新しいページ。"""
    if page_break:
        p = doc.add_paragraph()
        tight(p)
        p.paragraph_format.page_break_before = True
        p.paragraph_format.line_spacing = Pt(1)
    t = doc.add_table(rows=1, cols=1)
    fix_layout(t, [BODY_W])
    set_cell_margins(t, 1.2, 1.2, 2.5, 2.5)
    c = t.cell(0, 0)
    shade(c, ACCENT)
    c.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    par = write(c, text, size=size, bold=True, color=RGBColor(0xFF, 0xFF, 0xFF))
    if sub:
        par.paragraph_format.tab_stops.add_tab_stop(Mm(BODY_W - 5), WD_TAB_ALIGNMENT.RIGHT)
        r = par.add_run("\t" + sub)
        r.font.size = Pt(9.5)
        r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
    return t


def label(doc, text, hint=None):
    p = doc.add_paragraph()
    tight(p, before=3, after=1)
    r = p.add_run("■ " + text)
    r.bold = True
    r.font.size = Pt(10.5)
    r.font.color.rgb = RGBColor(0x2F, 0x7D, 0x4F)
    if hint:
        h = p.add_run("　" + hint)
        h.font.size = Pt(8)
        h.font.color.rgb = GRAY
    return p


def ruled_lines(doc, n, h=7.6):
    """点線の罫線（各行がセルなので Word で直接入力できる）"""
    t = doc.add_table(rows=n, cols=1)
    fix_layout(t, [BODY_W])
    set_cell_margins(t, 0, 0, 1.5, 1.5)
    dotted = ("dotted", 6, "9AA5B1")
    for i, row in enumerate(t.rows):
        row_height(row, h)
        c = row.cells[0]
        c.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.BOTTOM
        set_cell_borders(c, top=dotted if i == 0 else None, bottom=dotted, left=None, right=None)
        write(c, "", size=10.5)
    return t


def photo_box(doc, height_mm, image=None, caption="ここに写真を貼る"):
    t = doc.add_table(rows=1, cols=1)
    fix_layout(t, [BODY_W])
    set_cell_margins(t, 1, 1, 1, 1)
    row = t.rows[0]
    row_height(row, height_mm)
    c = row.cells[0]
    c.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    set_cell_borders(c, **{e: ("single", 8, "8A94A3") for e in ("top", "bottom", "left", "right")})
    par = c.paragraphs[0]
    tight(par)
    par.alignment = WD_ALIGN_PARAGRAPH.CENTER
    if image:
        w, h = fit_image(image, BODY_W - 4, height_mm - 4)
        par.add_run().add_picture(image, width=Mm(w), height=Mm(h))
    else:
        shade(c, "F6F8FA")
        write(par, caption, size=12, color=GRAY)
        write(c, "（Word：［挿入］→［画像］／ 印刷したときは写真をのりで貼る）",
              size=8.5, color=GRAY, align=WD_ALIGN_PARAGRAPH.CENTER, new_par=True)
    return t


def fit_image(path, max_w, max_h):
    try:
        from PIL import Image, ImageOps
        with Image.open(path) as im:
            im = ImageOps.exif_transpose(im)
            iw, ih = im.size
    except Exception:
        iw, ih = 4, 3
    scale = min(max_w / iw, max_h / ih)
    return iw * scale, ih * scale


def form_table(doc, cells, widths, h=11):
    """cells: [(text, is_label), ...] を1行に並べる記入欄"""
    t = doc.add_table(rows=1, cols=len(cells))
    fix_layout(t, widths)
    set_cell_margins(t)
    row = t.rows[0]
    row_height(row, h)
    line = ("single", 8, "8A94A3")
    for c, (text, is_label) in zip(row.cells, cells):
        c.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        set_cell_borders(c, top=line, bottom=line, left=line, right=line)
        if is_label:
            shade(c, PALE)
            write(c, text, size=9.5, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
        else:
            write(c, text, size=11, align=WD_ALIGN_PARAGRAPH.RIGHT)
    return t


# ---------- ページ ----------

def setup(doc, crop, who):
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Mm(PAGE_W), Mm(PAGE_H)
    sec.left_margin = sec.right_margin = Mm(MARGIN_X)
    sec.top_margin, sec.bottom_margin = Mm(MARGIN_TOP), Mm(MARGIN_BOTTOM)
    sec.header_distance, sec.footer_distance = Mm(7), Mm(6)

    normal = doc.styles["Normal"]
    normal.font.name = FONT
    normal.font.size = Pt(10.5)
    rpr = normal.element.get_or_add_rPr()
    fonts = rpr.find(qn("w:rFonts"))
    if fonts is None:
        fonts = OxmlElement("w:rFonts")
        rpr.append(fonts)
    for k in ("w:ascii", "w:hAnsi", "w:eastAsia", "w:cs"):
        fonts.set(qn(k), FONT)
    tight(normal)  # style-level spacing

    # ヘッダー：全ページ共通。名前をヘッダーに1回書けば全ページに入る
    sec.different_first_page_header_footer = True  # 表紙には出さない
    hp = sec.header.paragraphs[0]
    tight(hp)
    ts = hp.paragraph_format.tab_stops
    for tw in (4680, 9360):  # Header スタイル既定のタブ（中央・右）を打ち消す
        ts.add_tab_stop(Pt(tw / 20), WD_TAB_ALIGNMENT.CLEAR)
    ts.add_tab_stop(Mm(BODY_W), WD_TAB_ALIGNMENT.RIGHT)
    r = hp.add_run(f"{crop}の栽培観察レポート")
    r.font.size, r.font.color.rgb = Pt(8.5), GRAY
    r = hp.add_run("\t" + who)
    r.font.size, r.font.color.rgb = Pt(8.5), GRAY

    fp = sec.footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    add_page_field(fp)


def fmt_date(d, year=True):
    s = f"{d.month}月{d.day}日（{WEEKDAY[d.weekday()]}）"
    return f"{d.year}年{s}" if year else s


def cover(doc, a, days):
    spacer(doc, 60)
    p = doc.add_paragraph()
    tight(p)
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("技術・家庭科（技術分野）　生物育成の技術")
    r.font.size, r.font.color.rgb = Pt(12), GRAY
    spacer(doc, 14)
    p = doc.add_paragraph()
    tight(p)
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(f"{a.crop}の")
    r.font.size, r.bold = Pt(30), True
    r.font.color.rgb = RGBColor(0x2F, 0x7D, 0x4F)
    r = p.add_run("栽培観察レポート")
    r.font.size, r.bold = Pt(30), True
    spacer(doc, 50)

    w = [38, BODY_W - 38]
    t = doc.add_table(rows=4, cols=2)
    fix_layout(t, w)
    set_cell_margins(t, 1, 1, 3, 3)
    line = ("single", 10, "5B6573")
    who = f"{a.grade or '　　'} 年　{a.klass or '　　'} 組　{a.number or '　　'} 番"
    period = f"{fmt_date(days[0])}　〜　{fmt_date(days[-1])}" if days else ""
    rows = [
        ("年・組・番", who, 20),
        ("名　前", a.name or "", 20),
        ("観察・栽培期間", period, 20),
        ("観察日数", f"{len(days)} 日（土日{'・休日' if a.skip else ''}をのぞく）", 14),
    ]
    for row, (lab, val, h) in zip(t.rows, rows):
        row_height(row, h)
        for c in row.cells:
            c.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            set_cell_borders(c, top=line, bottom=line, left=line, right=line)
        shade(row.cells[0], PALE)
        write(row.cells[0], lab, size=11, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
        write(row.cells[1], val, size=15 if lab != "観察日数" else 12,
              align=WD_ALIGN_PARAGRAPH.CENTER)


def day_page(doc, a, n, d, total, image):
    heading_bar(doc, f"第 {n} 日目　　{fmt_date(d, year=False)}",
                sub=f"{d.year}年　（{n} / {total}）", page_break=True, size=14)
    spacer(doc, 3)
    form_table(doc, [("天気", True), ("晴れ・くもり・雨", False), ("気温", True), ("℃", False),
                     ("観察時刻", True), ("時　　分", False)],
               [16, 58, 16, 30, 20, 40], h=9)
    for c in doc.tables[-1].rows[0].cells[1::2]:
        c.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
        for r in c.paragraphs[0].runs:
            r.font.size = Pt(9.5)
    spacer(doc, 3)

    photo_box(doc, 92, image, caption="今日の写真を貼る（全体がわかるように）")
    spacer(doc, 3)

    form_table(doc, [("一番大きい株の\n背丈", True), ("cm", False),
                     ("葉の枚数", True), ("枚", False),
                     ("前回からの変化", True), ("cm ／　　 枚", False)],
               [27, 33, 22, 30, 28, 40], h=13)
    for c in doc.tables[-1].rows[0].cells[0::2]:
        for r in c.paragraphs[0].runs:
            r.font.size = Pt(9)

    label(doc, "今日した手入れ", "（したものに✓）")
    p = doc.add_paragraph()
    tight(p)
    p.paragraph_format.left_indent = Mm(2)
    r = p.add_run("　".join("□ " + x for x in CARE_ITEMS) + "　□ その他（　　　　　　）")
    r.font.size = Pt(9.5)

    label(doc, "観察・手入れの記録と考察",
          "様子の変化／何をなぜしたか／変化の理由として考えられること／次にすること")
    ruled_lines(doc, 15)


def summary_page(doc, a, days, image):
    heading_bar(doc, "収穫後のまとめ", sub=f"{a.crop}", page_break=True, size=14)
    spacer(doc, 3)
    form_table(doc, [("収穫日", True), ("月　　日", False), ("収穫量", True),
                     ("個 ／　　　 g", False)], [24, 52, 24, 80], h=11)
    form_table(doc, [("最後の背丈", True), ("cm", False), ("葉の枚数", True), ("枚", False),
                     ("栽培日数", True), (f"{(days[-1] - days[0]).days + 1 if days else ''} 日", False)],
               [24, 36, 22, 30, 24, 44], h=11)
    spacer(doc, 3)
    photo_box(doc, 70, image, caption="収穫したものの写真を貼る")

    for title, hint, n in [
        ("育ててわかったこと・成長の様子", "背丈・葉の数の記録から読み取れる変化など", 5),
        ("工夫したこと・うまくいったこと", "手入れの工夫とその結果", 4),
        ("うまくいかなかったこと・次に育てるときの改善点", "原因と改善の方法", 4),
        ("生物育成の技術と、生活や社会とのつながり", "農家の工夫・食料・環境などと比べて", 4),
    ]:
        label(doc, title, hint)
        ruled_lines(doc, n, h=7.4)


# ---------- 日付・写真 ----------

def parse_date(s):
    return dt.date.fromisoformat(s.strip())


def weekdays(start, end, skip):
    out, d = [], start
    while d <= end:
        if d.weekday() < 5 and d not in skip:
            out.append(d)
        d += dt.timedelta(days=1)
    return out


def find_photos(folder):
    """YYYY-MM-DD / YYYYMMDD / MMDD を含むファイル名を日付に対応させる。harvest / 収穫 はまとめ用。"""
    by_date, harvest = {}, None
    if not folder:
        return by_date, harvest
    for name in sorted(os.listdir(folder)):
        if not name.lower().endswith(PHOTO_EXT):
            continue
        path = os.path.join(folder, name)
        stem = os.path.splitext(name)[0]
        if re.search(r"harvest|収穫|まとめ", stem, re.I):
            harvest = path
            continue
        m = re.search(r"(20\d\d)[-_.]?(\d\d)[-_.]?(\d\d)", stem)
        if m:
            key = (int(m[2]), int(m[3]))
        else:
            m = re.search(r"(?<!\d)(\d\d)[-_.]?(\d\d)(?!\d)", stem)
            if not m:
                continue
            key = (int(m[1]), int(m[2]))
        by_date.setdefault(key, path)
    return by_date, harvest


def main():
    ap = argparse.ArgumentParser(description="栽培観察レポート（A4・1日1枚）を作成")
    ap.add_argument("--crop", required=True, help="作物名（例：ミニトマト）")
    ap.add_argument("--start", required=True, help="観察・栽培の開始日 YYYY-MM-DD")
    ap.add_argument("--end", required=True, help="観察・栽培の終了日 YYYY-MM-DD")
    ap.add_argument("--grade", default="", help="学年")
    ap.add_argument("--klass", default="", help="組")
    ap.add_argument("--number", default="", help="出席番号")
    ap.add_argument("--name", default="", help="名前")
    ap.add_argument("--skip", default="", help="除外する平日（祝日・行事など）カンマ区切り YYYY-MM-DD")
    ap.add_argument("--photos", default="", help="写真フォルダ（ファイル名に日付を含める）")
    ap.add_argument("--pdf", action="store_true", help="LibreOffice で PDF も作る")
    ap.add_argument("-o", "--out", default="", help="出力 .docx（省略時：<作物名>_栽培観察レポート.docx）")
    a = ap.parse_args()

    start, end = parse_date(a.start), parse_date(a.end)
    if end < start:
        sys.exit("終了日が開始日より前です")
    skip = {parse_date(s) for s in a.skip.split(",") if s.strip()}
    a.skip = skip
    days = weekdays(start, end, skip)
    if not days:
        sys.exit("期間内に平日（月〜金）がありません")
    photos, harvest = find_photos(a.photos)

    who = f"{a.grade or '　'}年 {a.klass or '　'}組 {a.number or '　'}番　名前 {a.name or '＿＿＿＿＿＿＿＿'}"
    doc = Document()
    setup(doc, a.crop, who)
    cover(doc, a, days)
    for i, d in enumerate(days, 1):
        day_page(doc, a, i, d, len(days), photos.get((d.month, d.day)))
    summary_page(doc, a, days, harvest)

    out = a.out or f"{a.crop}_栽培観察レポート.docx"
    doc.save(out)
    pages = len(days) + 2
    print(f"作成：{out}（表紙1＋観察{len(days)}日＋まとめ1＝{pages}ページ）")
    print(f"期間：{fmt_date(days[0])} 〜 {fmt_date(days[-1])}")
    if photos:
        used = sum(1 for d in days if (d.month, d.day) in photos)
        print(f"写真：{used}枚を日付に対応して貼り付け" + ("、収穫写真あり" if harvest else ""))

    if a.pdf:
        outdir = os.path.dirname(os.path.abspath(out))
        subprocess.run(["soffice", "--headless", "--convert-to", "pdf", "--outdir", outdir, out],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print(f"作成：{os.path.splitext(out)[0]}.pdf")


if __name__ == "__main__":
    main()
