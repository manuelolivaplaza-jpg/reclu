import re,html,sys,json
def parse(f):
    t=open(f,encoding='latin-1').read()
    fecha=re.search(r'Al (\d\d-\d\d-\d{4})',t).group(1)
    rows=[]
    for tr in re.findall(r'<tr[^>]*>(.*?)</tr>',t,re.S|re.I):
        c=[html.unescape(re.sub(r'<[^>]+>','',x)).replace('\xa0',' ').strip() for x in re.findall(r'<td[^>]*>(.*?)</td>',tr,re.S|re.I)]
        if len(c)>=12 and c[0] and not c[0].startswith('TOTAL') and c[1]:
            try: rows.append(dict(nemo=c[0],emisor=c[1],tipo=c[2],total_mmusd=float(c[9].replace('.','').replace(',','.')),pct_fondo=float(c[10].replace(',','.')),pct_emisor=float(c[11].replace(',','.'))))
            except: pass
    return fecha,rows
for f in sys.argv[1:]:
    fe,r=parse(f); r.sort(key=lambda x:-x['total_mmusd'])
    tot=sum(x['total_mmusd'] for x in r)
    print(f,fe,len(r),round(tot,1))
    for x in r[:12]: print(' ',x['nemo'],x['emisor'][:30],x['total_mmusd'],x['pct_fondo'])
    json.dump(dict(fecha=fe,fuente='https://www.spensiones.cl/apps/carteras/genera_desagregada_xsl.php?fecpro=%s&idu=50&listado=14'%f.split('_')[-1][:6],filas=r),open(f.replace('.html','.json'),'w'),ensure_ascii=False,indent=1)
