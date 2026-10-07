#!/usr/bin/env python3
"""FD2 × 富士スピードウェイ本コース 推定モデル.

1. ギアごとの車速表（実測ギア比・タイヤ外径から計算）
2. ホームストレートの加速シミュレーション（最高速の推定）
3. 1分53秒台のセクター目標タイム
4. 速度・タイム感度

すべて標準ライブラリのみ。`python3 fd2_fuji_model.py` で data/ に CSV を書き出す。
仮定値（★）は README の「仮定」に一覧がある。実測ロガーデータで上書きすること。
"""
import csv
import math
from pathlib import Path

OUT = Path(__file__).parent / "data"

# ---- 車両諸元（ホンダ公表値） -----------------------------------------
GEARS = {1: 3.266, 2: 2.130, 3: 1.517, 4: 1.212, 5: 0.972, 6: 0.780}
FINAL = 4.764
REV_LIMIT = 8400  # rpm（K20A FD2 のレブリミット）
TIRE_W, TIRE_AR, RIM_IN = 225, 0.40, 18  # 225/40R18
CURB_KG = 1270

# K20A（FD2）全開トルク曲線 kgf·m ★ 公表値（21.9kgf·m/6100rpm、225PS/8000rpm）を通る近似
TORQUE_CURVE = [
    (3000, 17.5), (4000, 18.5), (5000, 19.5), (5800, 21.2), (6100, 21.9),
    (7000, 21.0), (8000, 20.14), (8400, 19.0),
]

# ---- 環境・走行条件 ★ -------------------------------------------------
DRIVER_FUEL_KG = 100        # ドライバー75kg＋燃料など
DRIVETRAIN_EFF = 0.85       # FF 6MT の駆動効率
CDA = 0.70                  # Cd 約0.34 × 前面投影面積 約2.05m²
CRR = 0.015                 # 転がり抵抗係数（Sタイヤ温間）
ALTITUDE_M = 550            # 富士SW 標高 約500〜600m
TEMP_C = 15
SHIFT_LOSS_S = 0.10         # 1回のシフトで駆動が抜ける時間
UPSHIFT_RPM = 8300
G = 9.81


def tire_circumference_m():
    dia_mm = 2 * TIRE_W * TIRE_AR + RIM_IN * 25.4
    return math.pi * dia_mm / 1000


def air_density(alt_m=ALTITUDE_M, temp_c=TEMP_C):
    p = 101325 * (1 - 2.25577e-5 * alt_m) ** 5.25588
    return p / (287.05 * (temp_c + 273.15))


def torque_kgm(rpm):
    pts = TORQUE_CURVE
    if rpm <= pts[0][0]:
        return pts[0][1]
    if rpm >= pts[-1][0]:
        return pts[-1][1] if rpm <= REV_LIMIT else 0.0
    for (r0, t0), (r1, t1) in zip(pts, pts[1:]):
        if r0 <= rpm <= r1:
            return t0 + (t1 - t0) * (rpm - r0) / (r1 - r0)
    return 0.0


def speed_kmh(rpm, gear):
    return rpm / 60 / (GEARS[gear] * FINAL) * tire_circumference_m() * 3.6


def rpm_at(v_kmh, gear):
    return v_kmh / 3.6 / tire_circumference_m() * GEARS[gear] * FINAL * 60


def gear_table():
    rows = []
    for g in GEARS:
        rows.append({
            "gear": g,
            "ratio": GEARS[g],
            "overall": round(GEARS[g] * FINAL, 3),
            "kmh_per_1000rpm": round(speed_kmh(1000, g), 2),
            "kmh_at_6100rpm(最大トルク)": round(speed_kmh(6100, g), 1),
            "kmh_at_8000rpm(最高出力)": round(speed_kmh(8000, g), 1),
            "kmh_at_8400rpm(レブ)": round(speed_kmh(REV_LIMIT, g), 1),
        })
    return rows


def simulate_straight(v0_kmh, distance_m, power_scale=1.0, mass_kg=None,
                      cda=CDA, grade_pct=0.0, dt=0.01):
    """全開加速。返り値は [(距離m, 時間s, 速度km/h, ギア, rpm), ...]."""
    mass = mass_kg or (CURB_KG + DRIVER_FUEL_KG)
    rho = air_density()
    # 標高による NA エンジンの出力低下（空気密度比）
    alt_factor = rho / air_density(0, TEMP_C)
    circ = tire_circumference_m()
    v = v0_kmh / 3.6
    gear = next(g for g in GEARS if rpm_at(v0_kmh, g) <= UPSHIFT_RPM)
    x = t = cut = 0.0
    log = [(0.0, 0.0, v0_kmh, gear, rpm_at(v0_kmh, gear))]
    next_mark = 50.0
    while x < distance_m:
        rpm = rpm_at(v * 3.6, gear)
        if rpm >= UPSHIFT_RPM and gear < 6:
            gear += 1
            cut = SHIFT_LOSS_S
            rpm = rpm_at(v * 3.6, gear)
        if cut > 0:
            f_drive = 0.0
            cut -= dt
        else:
            tq_nm = torque_kgm(rpm) * G * power_scale * alt_factor
            f_drive = tq_nm * GEARS[gear] * FINAL * DRIVETRAIN_EFF / (circ / (2 * math.pi))
        f_aero = 0.5 * rho * cda * v * v
        f_roll = CRR * mass * G
        f_grade = mass * G * grade_pct / 100
        a = (f_drive - f_aero - f_roll - f_grade) / (mass * 1.04)  # 回転慣性 4%
        v += a * dt
        x += v * dt
        t += dt
        if x >= next_mark:
            log.append((round(next_mark), round(t, 2), round(v * 3.6, 1), gear, round(rpm_at(v * 3.6, gear))))
            next_mark += 50.0
    return log


def straight_scenarios():
    """最終コーナー立ち上がり速度・仕様別の 1コーナー手前の最高速."""
    # 最終コーナー（パナソニックオートモーティブコーナー）出口〜1コーナーブレーキングまで
    # ★ ストレート1475m＋最終コーナー立ち上がり区間 約100m − ブレーキング距離 約140m ≒ 1435m
    dist = 1435
    rows = []
    specs = [
        ("ノーマル（225PS相当）", 1.00, None, CDA),
        ("吸排気＋ECU（約+5%）", 1.05, None, CDA),
        ("吸排気＋ECU＋軽量化50kg", 1.05, CURB_KG + DRIVER_FUEL_KG - 50, CDA),
        ("同上＋GTウイング（CdA+0.06）", 1.05, CURB_KG + DRIVER_FUEL_KG - 50, CDA + 0.06),
    ]
    for name, ps, mass, cda in specs:
        for v0 in (95, 105, 115):
            log = simulate_straight(v0, dist, ps, mass, cda)
            end = log[-1]
            at_line = min(log, key=lambda r: abs(r[0] - 250))  # コントロールライン付近 ★
            rows.append({
                "仕様": name,
                "最終コーナー立ち上がり_kmh": v0,
                "コントロールライン付近_kmh": at_line[2],
                "1コーナー手前_最高速_kmh": end[2],
                "ギア": end[3],
                "rpm": end[4],
                "区間タイム_s": end[1],
            })
    return rows


# ---- セクター目標 ---------------------------------------------------------
# 区間比率は実測2例（下表）がほぼ一致: S1≈24.0%, S2≈32.7%, S3≈43.4%
REFERENCE_SPLITS = [
    ("Audi TT RS（一般走行）", 26.364, 35.978, 47.747),
    ("FD2（オーナーのベスト）", 28.659, 38.810, 51.985),
]


def sector_targets():
    shares = []
    for _, s1, s2, s3 in REFERENCE_SPLITS:
        tot = s1 + s2 + s3
        shares.append((s1 / tot, s2 / tot, s3 / tot))
    r1 = sum(s[0] for s in shares) / len(shares)
    r2 = sum(s[1] for s in shares) / len(shares)
    r3 = 1 - r1 - r2
    rows = []
    for label, lap in [("現状例 FD2 1:59.454", 119.454), ("中間 1:57.0", 117.0),
                       ("中間 1:55.5", 115.5), ("目標上限 1:53.999", 113.999),
                       ("目標 1:53.5", 113.5), ("目標下限 1:53.000", 113.0)]:
        rows.append({
            "目標": label,
            "ラップ": fmt(lap),
            "S1_目標": round(lap * r1, 3),
            "S2_目標": round(lap * r2, 3),
            "S3_目標": round(lap * r3, 3),
            "1:59.454比_S1": round(lap * r1 - 28.659, 2),
            "1:59.454比_S2": round(lap * r2 - 38.810, 2),
            "1:59.454比_S3": round(lap * r3 - 51.985, 2),
        })
    return rows, (r1, r2, r3)


def sensitivity():
    """ストレートでの速度差がラップに効く量（Δt ≈ L·Δv / v²）."""
    rows = []
    for v_avg in (170, 180, 190):
        for dv in (2, 5, 10):
            v = v_avg / 3.6
            dt = 1200 * (dv / 3.6) / (v * v)
            rows.append({"ストレート平均_kmh": v_avg, "速度差_kmh": dv,
                         "区間1200mでの差_s": round(dt, 3)})
    return rows


def fmt(sec):
    m = int(sec // 60)
    return f"{m}:{sec - 60 * m:06.3f}"


def write_csv(name, rows):
    OUT.mkdir(exist_ok=True)
    path = OUT / name
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    return path


def main():
    print(f"タイヤ外周 {tire_circumference_m():.3f} m / 空気密度 {air_density():.3f} kg/m³"
          f"（海面比 {air_density() / air_density(0):.3f}）")
    for r in gear_table():
        print(r)
    write_csv("gear_speed_table.csv", gear_table())

    sc = straight_scenarios()
    write_csv("straight_top_speed_sim.csv", sc)
    for r in sc:
        print(r)

    base = simulate_straight(105, 1435)
    write_csv("straight_trace_normal_v0_105.csv",
              [{"距離_m": d, "時間_s": t, "速度_kmh": v, "ギア": g, "rpm": rpm}
               for d, t, v, g, rpm in base])

    st, ratio = sector_targets()
    write_csv("sector_targets.csv", st)
    print("区間比率", [round(x, 4) for x in ratio])
    for r in st:
        print(r)

    write_csv("straight_sensitivity.csv", sensitivity())


if __name__ == "__main__":
    main()
