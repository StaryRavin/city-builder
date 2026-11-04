"""
Сцена для редактора дорог из данных OpenStreetMap.

Белград, Дорчол: квартал между улицами Француска, Цара Душана,
Пјарона де Мондезира и Васе Чарапића.

  1. скачать данные района через API OpenStreetMap:
       curl -o dorcol.osm "https://www.openstreetmap.org/api/0.6/map?bbox=20.452,44.815,20.480,44.830"
  2. собрать сцену:
       python3 build_scene.py dorcol.osm dorcol.scene.json
  3. встроить её в index.html в блок <script type="application/json" id="scene-dorcol">.

Что делает:
  - улицы внутри контура района → граф: узлы — перекрёстки, изломы упрощены
    (Дуглас—Пекер, 2 м), двойные проезжие части и узлы ближе 9 м склеены,
    звенья короче 10 м стянуты, тупики короче 30 м убраны, тупики у соседней
    улицы (до 25 м) дотянуты до неё;
  - дома с центром внутри контура: контур и этажность (building:levels);
  - перевод в единицы редактора: 1 м = 4 единицы (клетка 16 ед. = 4 м),
    полуширина улицы 8 м (медиана расстояния от оси улицы до фасада).

Данные © участники OpenStreetMap, лицензия ODbL.
"""
import sys, json, math, xml.etree.ElementTree as ET, collections
root=ET.parse(sys.argv[1]).getroot()
nodes={n.get('id'):(float(n.get('lat')),float(n.get('lon'))) for n in root.iter('node')}
lat0,lon0=44.8210,20.4600
def P(nid):
    la,lo=nodes[nid];return ((lo-lon0)*math.cos(math.radians(lat0))*111320,-(la-lat0)*110540)
# контур района (метры, y вниз): Цара Душана, Француска, Васе Чарапића, замыкание у Студентского парка, Пјарона де Мондезира
POLY=[(-334,-521),(477,130),(60,505),(20,468),(-145,285),(-449,2),(-412,-65),(-382,-122),(-363,-211),(-345,-400)]
def pip(x,y,poly):
    c=False
    for i in range(len(poly)):
        x1,y1=poly[i];x2,y2=poly[(i+1)%len(poly)]
        if (y1>y)!=(y2>y) and x<(x2-x1)*(y-y1)/(y2-y1)+x1: c=not c
    return c
def dseg(p,a,b):
    ax,ay=a;bx,by=b;px,py=p;dx,dy=bx-ax,by-ay;l2=dx*dx+dy*dy
    t=0 if l2==0 else max(0,min(1,((px-ax)*dx+(py-ay)*dy)/l2));return math.hypot(px-ax-dx*t,py-ay-dy*t)
def inside(p,buf=8):
    return pip(p[0],p[1],POLY) or min(dseg(p,POLY[i],POLY[(i+1)%len(POLY)]) for i in range(len(POLY)))<buf
BOUND={'Француска','Цара Душана','Пјарона де Мондезира','Васе Чарапића'}
HW={'primary','secondary','tertiary','residential','unclassified','living_street','pedestrian'}
ways=[]
for w in root.iter('way'):
    tags={t.get('k'):t.get('v') for t in w.iter('tag')}
    if tags.get('highway') in HW and tags.get('area')!='yes':
        ways.append(([nd.get('ref') for nd in w.iter('nd')],tags.get('name','')))
use=collections.Counter()
for refs,_ in ways:
    for r in set(refs): use[r]+=1
# узлы граничных улиц (в пределах запаса) входят в район всегда
bnodes=set()
for refs,name in ways:
    if name in BOUND:
        for r in refs:
            if r in nodes and inside(P(r),45): bnodes.add(r)
# куски путей внутри района
pieces=[]
for refs,name in ways:
    cur=[];buf=45 if name in BOUND else 8
    for r in refs:
        if r in nodes and (r in bnodes or inside(P(r),buf)): cur.append(r)
        else:
            if len(cur)>=2: pieces.append((cur,name))
            cur=[]
    if len(cur)>=2: pieces.append((cur,name))
key=set()
for refs,_ in pieces:
    key.add(refs[0]);key.add(refs[-1])
    for r in refs:
        if use[r]>=2: key.add(r)
# упрощение Дугласа—Пекера между ключевыми узлами (допуск 2 м)
def dp(pts,tol=2.0):
    if len(pts)<=2: return [0,len(pts)-1]
    a,b=pts[0],pts[-1];best,bi=-1,-1
    for i in range(1,len(pts)-1):
        d=dseg(pts[i],a,b)
        if d>best: best,bi=d,i
    if best<=tol: return [0,len(pts)-1]
    L=dp(pts[:bi+1],tol);R=dp(pts[bi:],tol)
    return L[:-1]+[bi+x for x in R]
edges=[]
for refs,name in pieces:
    idx=[i for i,r in enumerate(refs) if r in key]
    for a,b in zip(idx,idx[1:]):
        sub=refs[a:b+1];keep=dp([P(r) for r in sub])
        ks=[sub[i] for i in keep]
        for u,v in zip(ks,ks[1:]): edges.append((u,v,name))
# склейка близких узлов (двойные проезжие части, мелкие разрывы)
ids=sorted({u for e in edges for u in e[:2]});pos={i:P(i) for i in ids}
par={i:i for i in ids}
def f(i):
    while par[i]!=i: par[i]=par[par[i]];i=par[i]
    return i
MERGE=9.0
for i in range(len(ids)):
    for j in range(i+1,len(ids)):
        a,b=ids[i],ids[j]
        if math.dist(pos[a],pos[b])<MERGE: par[f(a)]=f(b)
def rebuild(edges):
    cl=collections.defaultdict(list)
    for i in ids: cl[f(i)].append(pos[i])
    cpos={k:(sum(p[0] for p in v)/len(v),sum(p[1] for p in v)/len(v)) for k,v in cl.items()}
    E={}
    for u,v,n in edges:
        a,b=f(u),f(v)
        if a!=b: E[tuple(sorted((a,b)))]=n
    return cpos,E
cpos,E=rebuild(edges)
# слишком короткие звенья (< 10 м) — стягиваем
changed=True
while changed:
    changed=False
    for (a,b),n in list(E.items()):
        if math.dist(cpos[a],cpos[b])<10:
            for i in ids:
                if f(i)==f(a): par[f(i)]=f(b)
            cpos,E=rebuild(edges);changed=True;break
# узлы степени 2 почти на прямой — убрать (кроме излома > 4°)
def deg(E):
    d=collections.defaultdict(list)
    for (a,b) in E: d[a].append(b);d[b].append(a)
    return d
changed=True
while changed:
    changed=False;d=deg(E)
    for nd,nb in d.items():
        if len(nb)==2:
            a,b=nb;pa,pn,pb=cpos[a],cpos[nd],cpos[b]
            u=(pn[0]-pa[0],pn[1]-pa[1]);v=(pb[0]-pn[0],pb[1]-pn[1])
            ang=math.degrees(abs(math.atan2(u[0]*v[1]-u[1]*v[0],u[0]*v[0]+u[1]*v[1])))
            if ang<4 and tuple(sorted((a,b))) not in E:
                n=E.pop(tuple(sorted((a,nd))));E.pop(tuple(sorted((nd,b))));E[tuple(sorted((a,b)))]=n;changed=True;break
# короткие тупики (< 30 м) — убрать
changed=True
while changed:
    changed=False;d=deg(E)
    for nd,nb in d.items():
        if len(nb)==1 and math.dist(cpos[nd],cpos[nb[0]])<30:
            E.pop(tuple(sorted((nd,nb[0]))));changed=True;break
# узлы степени 2 почти на прямой — ещё раз после чистки
changed=True
while changed:
    changed=False;d=deg(E)
    for nd,nb in d.items():
        if len(nb)==2:
            a,b=nb;pa,pn,pb=cpos[a],cpos[nd],cpos[b]
            u=(pn[0]-pa[0],pn[1]-pa[1]);v=(pb[0]-pn[0],pb[1]-pn[1])
            ang=math.degrees(abs(math.atan2(u[0]*v[1]-u[1]*v[0],u[0]*v[0]+u[1]*v[1])))
            if ang<4 and tuple(sorted((a,b))) not in E:
                n=E.pop(tuple(sorted((a,nd))));E.pop(tuple(sorted((nd,b))));E[tuple(sorted((a,b)))]=n;changed=True;break
# тупики рядом с другой улицей (< 25 м) — дотянуть до неё (новый перекрёсток)
for it in range(20):
    d=deg(E);done=False
    for nd,nb in d.items():
        if len(nb)!=1: continue
        p=cpos[nd];best=None
        for (a,b),n in E.items():
            if nd in (a,b) or nb[0] in (a,b): continue
            pa,pb=cpos[a],cpos[b];dd=dseg(p,pa,pb)
            if dd<25 and (best is None or dd<best[0]): best=(dd,a,b,n)
        if not best: continue
        dd,a,b,n=best;pa,pb=cpos[a],cpos[b]
        dx,dy=pb[0]-pa[0],pb[1]-pa[1];tt=max(0,min(1,((p[0]-pa[0])*dx+(p[1]-pa[1])*dy)/(dx*dx+dy*dy)))
        q=(pa[0]+dx*tt,pa[1]+dy*tt)
        # к концу звена ближе 10 м — подключаем к узлу, иначе делим звено
        if math.dist(q,pa)<10: tgt=a
        elif math.dist(q,pb)<10: tgt=b
        else:
            tgt='x%d'%it;cpos[tgt]=q;E.pop(tuple(sorted((a,b))));E[tuple(sorted((a,tgt)))]=n;E[tuple(sorted((tgt,b)))]=n
        # тупик заменяем: соседний узел тупика соединяем с tgt
        o=nb[0];nm=E.pop(tuple(sorted((nd,o))))
        if o!=tgt and tuple(sorted((o,tgt))) not in E: E[tuple(sorted((o,tgt)))]=nm
        done=True;break
    if not done: break
d=deg(E)
# острые углы между звеньями в узлах
sharp=0
for nd,nb in d.items():
    angs=sorted(math.atan2(cpos[x][1]-cpos[nd][1],cpos[x][0]-cpos[nd][0]) for x in nb)
    for i in range(len(angs)):
        g=(angs[(i+1)%len(angs)]-angs[i])%(2*math.pi) if len(angs)>1 else 7
        if g<math.radians(25): sharp+=1
L=[math.dist(cpos[a],cpos[b]) for a,b in E]
print('nodes',len(d),'segs',len(E),'min len %.1f'%min(L),'sharp angles',sharp,'deg hist',collections.Counter(len(v) for v in d.values()))
GRAPH={'nodes':{k:cpos[k] for k in d},'segs':[[a,b,n] for (a,b),n in E.items()],'poly':POLY}

# ---------- дома ----------
g=GRAPH
def pip(x,y,poly):
    c=False
    for i in range(len(poly)):
        x1,y1=poly[i];x2,y2=poly[(i+1)%len(poly)]
        if (y1>y)!=(y2>y) and x<(x2-x1)*(y-y1)/(y2-y1)+x1: c=not c
    return c
blds=[]
for w in root.iter('way'):
    tags={t.get('k'):t.get('v') for t in w.iter('tag')}
    if 'building' not in tags: continue
    ps=[P(nd.get('ref')) for nd in w.iter('nd') if nd.get('ref') in nodes]
    if len(ps)<4: continue
    if ps[0]==ps[-1]: ps=ps[:-1]
    cx=sum(p[0] for p in ps)/len(ps);cy=sum(p[1] for p in ps)/len(ps)
    if not pip(cx,cy,POLY): continue
    lv=tags.get('building:levels')
    try: lv=max(1,round(float(lv)))
    except: lv=None
    blds.append({'p':[[round(x,2),round(y,2)] for x,y in ps],'lv':lv,'t':tags['building'],'name':tags.get('name','')})

# ---------- упаковка в единицы редактора ----------
d={'nodes':g['nodes'],'segs':g['segs'],'buildings':blds};K=4.0  # единиц на метр (клетка 16 ед. = 4 м)
ids=list(d['nodes'].keys());ix={k:i for i,k in enumerate(ids)}
xs=[d['nodes'][k][0] for k in ids];ys=[d['nodes'][k][1] for k in ids]
cx=(min(xs)+max(xs))/2;cy=(min(ys)+max(ys))/2
T=lambda p:[round((p[0]-cx)*K,1),round((p[1]-cy)*K,1)]
out={'name':'Белград, Дорчол: Француска — Цара Душана — Пјарона де Мондезира — Васе Чарапића',
'attribution':'© участники OpenStreetMap, ODbL','metersPerCell':4,'roadHalfWidth':32,
'nodes':[T(d['nodes'][k]) for k in ids],
'segs':[[ix[a],ix[b]] for a,b,n in d['segs']],
'segNames':[n for a,b,n in d['segs']],
'buildings':[[sum((T(p) for p in b['p']),[]),b['lv']] for b in d['buildings']]}
s=json.dumps(out,ensure_ascii=False,separators=(',',':'))
open(sys.argv[2],'w').write(s);print(len(s),'bytes,',len(out['nodes']),'nodes,',len(out['segs']),'segs,',len(out['buildings']),'buildings')
