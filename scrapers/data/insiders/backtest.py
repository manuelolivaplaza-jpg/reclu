"""Backtest 'Compras de ejecutivos': Form 4, código P (compra en mercado abierto), officer/director,
>= US$1M por emisor y fecha de presentación, filings ene-jun 2026 (datasets oficiales SEC 2026q1+q2).
Compra US$1.000 al cierre del día hábil SIGUIENTE a la presentación; mantiene al 16-10-2026; vs SPY."""
import pandas as pd, yfinance as yf, json
frames=[]
for q in ["q1","q2"]:
    s=pd.read_csv(f"{q}/SUBMISSION.tsv",sep="\t",dtype=str); t=pd.read_csv(f"{q}/NONDERIV_TRANS.tsv",sep="\t",dtype=str,low_memory=False)
    o=pd.read_csv(f"{q}/REPORTINGOWNER.tsv",sep="\t",dtype=str)
    o=o.groupby("ACCESSION_NUMBER").agg(rel=("RPTOWNER_RELATIONSHIP",lambda x:",".join(x.fillna(""))),
        owner=("RPTOWNERNAME","first"),title=("RPTOWNER_TITLE","first")).reset_index()
    t=t[(t.TRANS_CODE=="P")&(t.TRANS_ACQUIRED_DISP_CD=="A")]
    t["val"]=pd.to_numeric(t.TRANS_SHARES,errors="coerce")*pd.to_numeric(t.TRANS_PRICEPERSHARE,errors="coerce")
    m=t.merge(s[s.DOCUMENT_TYPE=="4"],on="ACCESSION_NUMBER").merge(o,on="ACCESSION_NUMBER")
    frames.append(m)
d=pd.concat(frames)
d=d[d.rel.str.contains("Officer|Director")]
d=d[~d.owner.str.contains(r"\b(INC|LLC|L\.?P\.?|LTD|FUND|CORP|TRUST|HOLDINGS|PARTNERS|CAPITAL|GROUP|MANAGEMENT|N\.V\.|PLC|S\.A\.)\b",case=False,na=False,regex=True)]
d["px_tx"]=pd.to_numeric(d.TRANS_PRICEPERSHARE,errors="coerce")
d["FILING_DATE"]=pd.to_datetime(d.FILING_DATE,format="%d-%b-%Y")
d["tk"]=d.ISSUERTRADINGSYMBOL.str.upper().str.strip().str.replace(".","-",regex=False)
d=d[d.tk.str.fullmatch(r"[A-Z\-]{1,6}",na=False)]
g=d.groupby(["tk","FILING_DATE"]).agg(valor=("val","sum"),emisor=("ISSUERNAME","first"),comprador=("owner","first"),
   cargo=("title","first"),accession=("ACCESSION_NUMBER","first"),cik=("ISSUERCIK","first"),px_tx=("px_tx","median")).reset_index()
g=g[g.valor>=1_000_000].sort_values("FILING_DATE")
print("eventos >= 1M:",len(g),"tickers:",g.tk.nunique())
import sys
px=yf.download(sorted(set(g.tk))+["SPY"],start="2026-01-01",end="2026-10-19",auto_adjust=True,progress=False,threads=True)["Close"]
cal=px["SPY"].dropna().index; last=cal[-1]
rows=[]
for r in g.itertuples():
    nxt=cal[cal>r.FILING_DATE]
    if len(nxt)==0 or r.tk not in px: continue
    e=nxt[0]; s=px[r.tk]
    if pd.isna(s.get(e)) : continue
    first=s.dropna().index[0]
    if (e-first).days<45: continue  # excluye compras en IPO/recién listadas
    if not (0.5 <= r.px_tx/s[e] <= 2.0): continue  # precio de la transacción coherente con el mercado
    p_last=s.dropna().iloc[-1]; d_last=s.dropna().index[-1]
    i=cal.get_loc(e)
    def h(k):
        if i+k>=len(cal) or pd.isna(s.get(cal[i+k])): return None
        return round((s[cal[i+k]]/s[e]-1)*100,2)
    rows.append(dict(ticker=r.tk,emisor=r.emisor,comprador=r.comprador,cargo=r.cargo,fecha_presentacion=str(r.FILING_DATE.date()),
      fecha_entrada=str(e.date()),valor_compra_usd=round(r.valor),precio_entrada=round(s[e],2),precio_ultimo=round(p_last,2),ultimo_dato=str(d_last.date()),
      ret_1s_pct=h(5),ret_1m_pct=h(21),ret_total_pct=round((p_last/s[e]-1)*100,2),spy_total_pct=round((px.SPY[last]/px.SPY[e]-1)*100,2),
      fuente=f"https://www.sec.gov/Archives/edgar/data/{int(r.cik)}/{r.accession.replace('-','')}/"))
df=pd.DataFrame(rows); df.to_csv("insiders_compras_1M_2026H1.csv",index=False)
res=dict(eventos=len(df),excluidos=len(g)-len(df),ret_prom_pct=round(df.ret_total_pct.mean(),2),ret_mediana_pct=round(df.ret_total_pct.median(),2),
 spy_prom_pct=round(df.spy_total_pct.mean(),2),le_gana_a_spy=int((df.ret_total_pct>df.spy_total_pct).sum()),
 ret_1m_prom=round(df.ret_1m_pct.mean(),2),ret_1s_prom=round(df.ret_1s_pct.mean(),2),valor_total_eq_ponderado_usd=round((1000*(1+df.ret_total_pct/100)).sum()),valor_spy_usd=round((1000*(1+df.spy_total_pct/100)).sum()),
 delistados_o_sin_dato_reciente=int((df.ultimo_dato!=str(last.date())).sum()))
json.dump(res,open("insiders_resumen.json","w"),indent=1); print(res)
print(df.sort_values("valor_compra_usd",ascending=False).head(12)[["ticker","emisor","comprador","fecha_presentacion","valor_compra_usd","ret_total_pct","spy_total_pct"]].to_string(index=False))
