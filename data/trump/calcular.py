"""Portafolio simulado 'Trump dice'. Precios: Yahoo Finance (cierres ajustados por dividendos/splits).
US Steel (X) deslistada: cierres de exa.ai (fuente pública) y efectivo US$55 desde 2025-06-18 (compra de Nippon)."""
import json, pandas as pd, yfinance as yf
M = json.load(open("menciones.json"))
ments = M["menciones"]
AMOUNT = 1000.0
tickers = sorted({m["ticker"] for m in ments if m["ticker"] != "X"} | {"SPY", "DJT"})
px = yf.download(tickers, start="2025-03-01", end="2026-10-19", auto_adjust=True, progress=False)["Close"]
px.index = pd.to_datetime(px.index).tz_localize(None)
cal = px["SPY"].dropna().index  # calendario de días hábiles NYSE
# Serie manual de X
xs = pd.Series({"2025-05-23": 52.01, "2025-05-27": 53.04, "2025-05-30": 53.82, "2025-06-17": 54.84})
xs.index = pd.to_datetime(xs.index)
xfull = pd.Series(index=cal[cal >= "2025-05-23"], dtype=float)
for d in xfull.index:
    if d >= pd.Timestamp("2025-06-18"): xfull[d] = 55.0
    elif d in xs.index: xfull[d] = xs[d]
xfull = xfull.ffill()  # días sin dato intermedio: último cierre conocido (solo afecta curva diaria, no horizontes)
px["X"] = xfull
last = cal[-1]
def at(t, d): return float(px[t].loc[d])
rows = []
for m in ments:
    t = m["ticker"]; e = pd.Timestamp(m["entrada"]); assert e in cal, (m["id"], e)
    i = cal.get_loc(e)
    p0, s0 = at(t, e), at("SPY", e)
    r = {"id": m["id"], "fecha_mencion": m["fecha"], "fecha_entrada": m["entrada"], "ticker": t, "empresa": m["empresa"], "tipo": m["tipo"],
         "precio_entrada": round(p0, 2), "precio_actual": round(at(t, last), 2)}
    for lab, k in [("1d", 1), ("1s", 5), ("1m", 21)]:
        if i + k < len(cal):
            d = cal[i + k]
            if t == "X" and k in (1, 5): d = {1: pd.Timestamp("2025-05-27"), 5: pd.Timestamp("2025-05-30")}[k]
            r[f"ret_{lab}_pct"] = round((at(t, d) / p0 - 1) * 100, 2)
            r[f"spy_{lab}_pct"] = round((at("SPY", d) / s0 - 1) * 100, 2)
        else:
            r[f"ret_{lab}_pct"] = None; r[f"spy_{lab}_pct"] = None
    r["ret_total_pct"] = round((at(t, last) / p0 - 1) * 100, 2)
    r["spy_total_pct"] = round((at("SPY", last) / s0 - 1) * 100, 2)
    r["exceso_vs_spy_pp"] = round(r["ret_total_pct"] - r["spy_total_pct"], 2)
    r["valor_actual_usd"] = round(AMOUNT * at(t, last) / p0, 2)
    r["valor_spy_usd"] = round(AMOUNT * at("SPY", last) / s0, 2)
    r["fuente"] = m["fuentes"][0]
    rows.append(r)
df = pd.DataFrame(rows)
df.to_csv("trump_dice_posiciones.csv", index=False)
inv = AMOUNT * len(df)
tot = {"fecha_corte": str(last.date()), "posiciones": len(df), "invertido_usd": inv,
       "valor_trump_dice_usd": round(df.valor_actual_usd.sum(), 2), "valor_spy_mismas_fechas_usd": round(df.valor_spy_usd.sum(), 2)}
tot["ret_trump_dice_pct"] = round((tot["valor_trump_dice_usd"] / inv - 1) * 100, 2)
tot["ret_spy_pct"] = round((tot["valor_spy_mismas_fechas_usd"] / inv - 1) * 100, 2)
for lab in ["1d", "1s", "1m"]:
    sub = df.dropna(subset=[f"ret_{lab}_pct"])
    tot[f"efecto_{lab}"] = {"n": len(sub), "promedio_pct": round(sub[f"ret_{lab}_pct"].mean(), 2), "mediana_pct": round(sub[f"ret_{lab}_pct"].median(), 2),
        "spy_promedio_pct": round(sub[f"spy_{lab}_pct"].mean(), 2), "le_gana_a_spy": int((sub[f"ret_{lab}_pct"] > sub[f"spy_{lab}_pct"]).sum())}
# Variante: solo llamados de compra directa
dd = df[df.tipo.str.startswith("compra_directa")]
tot["solo_compra_directa"] = {"n": len(dd), "ret_pct": round((dd.valor_actual_usd.sum() / (AMOUNT*len(dd)) - 1) * 100, 2), "spy_pct": round((dd.valor_spy_usd.sum() / (AMOUNT*len(dd)) - 1) * 100, 2)}
# Sensibilidad DJT en M02
e = pd.Timestamp("2025-04-09"); d0 = at("DJT", e)
tot["sensibilidad_M02_DJT"] = {"precio_entrada": round(d0, 2), "ret_total_pct": round((at("DJT", last)/d0-1)*100, 2),
    "ret_1d_pct": round((at("DJT", cal[cal.get_loc(e)+1])/d0-1)*100, 2)}
alt = df.copy(); alt.loc[alt.id == "M02", "valor_actual_usd"] = AMOUNT * at("DJT", last) / d0
tot["sensibilidad_M02_DJT"]["ret_portafolio_pct"] = round((alt.valor_actual_usd.sum()/inv-1)*100, 2)
# Curva diaria del portafolio (aportes en cada fecha de entrada) vs SPY
curve = []
for d in cal[cal >= pd.Timestamp(df.fecha_entrada.min())]:
    act = df[pd.to_datetime(df.fecha_entrada) <= d]
    v = sum(AMOUNT * at(r.ticker, d) / r.precio_entrada if r.ticker != "X" else AMOUNT * at("X", d) / 52.01 for r in act.itertuples())
    s = sum(AMOUNT * at("SPY", d) / at("SPY", pd.Timestamp(r.fecha_entrada)) for r in act.itertuples())
    curve.append({"fecha": str(d.date()), "invertido_usd": AMOUNT * len(act), "valor_trump_dice_usd": round(v, 2), "valor_spy_usd": round(s, 2)})
pd.DataFrame(curve).to_csv("trump_dice_curva_diaria.csv", index=False)
out = {"metodologia": "ver METODOLOGIA.md", "resumen": tot, "posiciones": rows, "menciones": ments, "excluidas": M["excluidas"],
       "fuentes_precios": ["Yahoo Finance vía yfinance (auto_adjust=True)", "exa.ai/library/markets/stock/X (cierres X)", "https://www.ussteel.com/prereleases/-/blogs/nippon-steel-corporation-and-u-s-steel-finalize-historic-partnership (US$55 efectivo, 2025-06-18)"]}
json.dump(out, open("trump_dice.json", "w"), ensure_ascii=False, indent=2)
pd.set_option("display.width", 250); pd.set_option("display.max_columns", 30)
print(df[["id","fecha_mencion","fecha_entrada","ticker","precio_entrada","precio_actual","ret_1d_pct","spy_1d_pct","ret_1s_pct","ret_1m_pct","ret_total_pct","spy_total_pct","exceso_vs_spy_pp"]].to_string(index=False))
print(json.dumps(tot, indent=1, ensure_ascii=False))
