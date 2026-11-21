/*
 * Редактор дорог и участков — общий код для страницы редактора
 * (prototypes/road-editor/index.html) и приложения-игры (app/).
 * Работает с элементами страницы по id (см. index.html). Наружу — window.CityEditor.
 */
/*
 * Редактор дорог и участков.
 *
 * Дороги — граф: узлы и прямые звенья между ними, ширина дороги 2W.
 * - Звено тянется от точки до точки. Начало и конец цепляются к существующему
 *   узлу или к точке на звене (кратной клетке от его начала — звено делится,
 *   появляется перекрёсток). Свободный конец: длина кратна клетке, угол — 5°.
 * - Пересекаться дороги могут только в узлах: звено, которое пересекает
 *   другое посередине или подходит к нему ближе ширины дороги, невалидно.
 *   Угол между звеньями в узле — не меньше 20°.
 *
 * Сетка зонирования. У каждой стороны каждого звена одна непрерывная сетка
 * клеток s×s глубиной D, от одного конца стороны до другого. Концы стороны:
 * - если в узле со стороны есть соседнее звено под углом < 180°, это угол
 *   квартала: конец — вершина угла K (пересечение кромок дорог), клетки у
 *   угла обрезаются биссектрисой;
 * - иначе (тупик, прямое продолжение, внешняя сторона поворота) — проекция
 *   узла на кромку дороги.
 * Линии сетки отмеряются от узлов звена (проекций узлов на кромку), а не от
 * вершин углов. Длина звена кратна клетке (свободный конец и точка деления
 * привязаны к клетке), поэтому сетка целая по всей длине звена, совпадает на
 * обеих сторонах дороги и без сдвига продолжается через прямые узлы.
 * Неровность (неполная клетка) остаётся только внутри углов — там, где клетки
 * и так обрезает биссектриса и угловые участки забирают всё до вершины.
 * Длина звена всегда кратна клетке: к узлу можно подключиться, только если
 * расстояние до него целое, иначе конец съезжает вбок от узла — на одну из
 * его дорог (Т-перекрёсток). Если звено разрезано перекрёстком не по линии
 * сетки, обе половины наследуют сетку исходной дороги (фаза ph).
 *
 * Участки — как в прототипе перекрёстка (prototypes/crossroads):
 * прямоугольник от улицы по сетке одной стороны звена; острый угол — угловой
 * участок с изломом на биссектрисе; тупой угол — тянем за угол, столько же
 * клеток откладывается вдоль соседней улицы. Участок невалиден, если заходит
 * на дорогу или на другой участок.
 */
(function(){
// приложение-игра (app/) задаёт window.CITY_APP — крючки: стоимость и запреты дорог,
// вода на карте, свои инструменты, вид домов; без него — обычный редактор
var H=window.CITY_APP||null,DUMMY=document.createElement('div');
function el(id){return document.getElementById(id)||DUMMY}
var SW=0;   // ширина тротуара (единицы); у деревень — 2 м
var s=16,W=16,W0=16,D=4,EPS=0.5,OVL=0.01,MINANG=20*Math.PI/180,VW=680,VH=460;
function vbox(){var b=el('sv').viewBox&&el('sv').viewBox.baseVal;if(b&&b.width){VW=b.width;VH=b.height}}
function add(a,b){return [a[0]+b[0],a[1]+b[1]]}
function sub(a,b){return [a[0]-b[0],a[1]-b[1]]}
function mul(a,k){return [a[0]*k,a[1]*k]}
function dot(a,b){return a[0]*b[0]+a[1]*b[1]}
function len(a){return Math.hypot(a[0],a[1])}
function nrm(a){var l=len(a);return [a[0]/l,a[1]/l]}
function cr(a,b){return a[0]*b[1]-a[1]*b[0]}
function area(p){var a=0;for(var i=0;i<p.length;i++){var q=p[(i+1)%p.length];a+=p[i][0]*q[1]-q[0]*p[i][1]}return Math.abs(a)/2}
function pts(p){return p.map(function(q){return q[0].toFixed(1)+','+q[1].toFixed(1)}).join(' ')}
function proj(poly,ax){var lo=Infinity,hi=-Infinity;poly.forEach(function(p){var v=dot(p,ax);if(v<lo)lo=v;if(v>hi)hi=v});return [lo,hi]}
// выпуклые многоугольники перекрываются; e > 0 — касание не считается, e < 0 — считается
function overlaps(P,Q,e){
var polys=[P,Q];
for(var t=0;t<2;t++){var R=polys[t];
for(var i=0;i<R.length;i++){var ed=sub(R[(i+1)%R.length],R[i]);if(len(ed)<1e-9)continue;var ax=nrm([-ed[1],ed[0]]);
var a=proj(P,ax),b=proj(Q,ax);
if(a[1]<=b[0]+e||b[1]<=a[0]+e)return false;}}
return true;
}
function inside(P,poly){
var sgn=0;
for(var i=0;i<poly.length;i++){var c=cr(sub(poly[(i+1)%poly.length],poly[i]),sub(P,poly[i]));
if(Math.abs(c)>1e-9){if(sgn===0)sgn=Math.sign(c);else if(Math.sign(c)!==sgn)return false;}}
return true;
}
// отсечение полуплоскостью по одну сторону биссектрисы (луч из K в направлении m)
function clip(poly,K,m,sg){
var out=[];
for(var i=0;i<poly.length;i++){
var a=poly[i],b=poly[(i+1)%poly.length];
var ga=sg*cr(m,sub(a,K)),gb=sg*cr(m,sub(b,K));
if(ga>=0)out.push(a);
if((ga>=0)!==(gb>=0)){var t=ga/(ga-gb);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
}
return out;
}
// отсечение полуплоскостью dot(p - P0, nv) <= 0
function clipHP(poly,P0,nv){
var out=[];
for(var i=0;i<poly.length;i++){
var a=poly[i],b=poly[(i+1)%poly.length],ga=-dot(sub(a,P0),nv),gb=-dot(sub(b,P0),nv);
if(ga>=0)out.push(a);
if((ga>=0)!==(gb>=0)){var t=ga/(ga-gb);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
}
return out;
}
function segDist(p,a,b){var ab=sub(b,a),l2=dot(ab,ab),t=l2?Math.max(0,Math.min(1,dot(sub(p,a),ab)/l2)):0;return len(sub(p,add(a,mul(ab,t))))}
function segsCross(a,b,c,d){
var d1=cr(sub(b,a),sub(c,a)),d2=cr(sub(b,a),sub(d,a)),d3=cr(sub(d,c),sub(a,c)),d4=cr(sub(d,c),sub(b,c));
return ((d1>0)!==(d2>0))&&((d3>0)!==(d4>0))&&d1!==0&&d2!==0&&d3!==0&&d4!==0;
}
function segSegDist(a,b,c,d){if(segsCross(a,b,c,d))return 0;return Math.min(segDist(a,c,d),segDist(b,c,d),segDist(c,a,b),segDist(d,a,b))}
function angBetween(u,v){return Math.acos(Math.max(-1,Math.min(1,dot(u,v))))}

// ---------- состояние ----------
var nodes={},segs={},nid=1,sid=1,lots=[],exits=[];
var view={k:1,tx:0,ty:0},mode='road',G=null,drag=null;

// сдвиг сетки: линия сетки, ближайшая к x снизу, в (-s, 0]
function offFor(x,w){w=w||s;var r=((x%w)+w)%w;return (r<1e-6||w-r<1e-6)?0:r-w}
// допуск «целой» длины в клетках и ширина клетки вдоль звена: длина звена
// почти целая (в пределах TOL), клетки вдоль него чуть растягиваются/сжимаются,
// чтобы их число было ровно целым и оба узла стояли на линиях сетки
// допуск: клетки могут растянуться/сжаться не больше чем на 3% каждая
// (и на 0.08 клетки в сумме для коротких звеньев)
var TOL=0.08,STRETCH=0.03;
function tolFor(x){var n=Math.round(x);return Math.max(TOL,STRETCH*n)}
function isWhole(x){var n=Math.round(x);return n>=1&&Math.abs(x-n)<=tolFor(x)+1e-9}
function cwOf(L){var n=Math.round(L/s);return isWhole(L/s)?L/n:s}
function segCw(g){if(g.cw)return g.cw;var E=segEnds(g);return cwOf(len(sub(E[1],E[0])))}
// габаритный прямоугольник и проверка пересечения габаритов (быстрый отсев)
function bbox(P){var b=[Infinity,Infinity,-Infinity,-Infinity];P.forEach(function(q){if(q[0]<b[0])b[0]=q[0];if(q[1]<b[1])b[1]=q[1];if(q[0]>b[2])b[2]=q[0];if(q[1]>b[3])b[3]=q[1]});return b}
function bbHit(a,b,m){m=m||0;return a[0]<=b[2]+m&&b[0]<=a[2]+m&&a[1]<=b[3]+m&&b[1]<=a[3]+m}
var GEO=0; // номер версии дорожной геометрии (растёт при каждом пересчёте)
function segEnds(g){return [[nodes[g.a].x,nodes[g.a].y],[nodes[g.b].x,nodes[g.b].y]]}

// ---------- производная геометрия: полосы дорог, углы, стороны звеньев ----------
function derive(){
var bands=[],bandOf={},inc={},hs={},corners=[];
Object.keys(segs).forEach(function(id){
var g=segs[id],E=segEnds(g),A=E[0],B=E[1],t=nrm(sub(B,A)),nl=[-t[1],t[0]],L=len(sub(B,A));
var poly=[add(A,mul(nl,W)),add(B,mul(nl,W)),add(B,mul(nl,-W)),add(A,mul(nl,-W))];
var b={seg:+id,poly:poly,A:A,B:B,t:t,nl:nl,L:L,bb:bbox(poly)};bands.push(b);bandOf[id]=b;
(inc[g.a]=inc[g.a]||[]).push({seg:+id,end:'a',r:t});
(inc[g.b]=inc[g.b]||[]).push({seg:+id,end:'b',r:mul(t,-1)});
});
// узлы-«пятачки»: вписанные восьмиугольники радиуса W
Object.keys(inc).forEach(function(n){var c=[nodes[n].x,nodes[n].y],p=[];
for(var i=0;i<8;i++){var a=i*Math.PI/4+Math.PI/8;p.push([c[0]+W*Math.cos(a),c[1]+W*Math.sin(a)])}
bands.push({node:+n,poly:p,bb:bbox(p)});});
// грани узла: plus — нормаль rot90(r), к следующему лучу; minus — к предыдущему
function faceSide(e,face){return (e.end==='a')===(face>0)?1:-1}
function key(seg,side,end){return seg+':'+side+':'+end}
var faces={};
Object.keys(inc).forEach(function(n){
var P=[nodes[n].x,nodes[n].y],list=inc[n];
list.forEach(function(e){e.ang=Math.atan2(e.r[1],e.r[0])});
list.sort(function(a,b){return a.ang-b.ang});
var deg=list.length;
list.forEach(function(e){
[1,-1].forEach(function(face){
var nv=face>0?[-e.r[1],e.r[0]]:[e.r[1],-e.r[0]];
faces[key(e.seg,faceSide(e,face),e.end)]={K:add(P,mul(nv,W)),d:e.r,n:nv,corner:null,other:null,dead:deg<2};
});
});
if(deg<2)return;
for(var i=0;i<deg;i++){
var e1=list[i],e2=list[(i+1)%deg],phi=e2.ang-e1.ang;if(phi<=1e-9)phi+=2*Math.PI;
if(phi>=Math.PI-1e-3){
// прямое продолжение: отметить грани, их концы сдвинем на линию сетки
if(Math.abs(phi-Math.PI)<1e-3){faces[key(e1.seg,faceSide(e1,1),e1.end)].straight=true;faces[key(e2.seg,faceSide(e2,-1),e2.end)].straight=true;}
continue;}
var m=nrm(add(e1.r,e2.r)),K=add(P,mul(m,W/Math.sin(phi/2)));
var k1=key(e1.seg,faceSide(e1,1),e1.end),k2=key(e2.seg,faceSide(e2,-1),e2.end);
var c={K:K,alpha:phi,m:m,node:+n,keys:[k1,k2]};corners.push(c);
faces[k1].K=K;faces[k1].corner=c;faces[k1].other=k2;
faces[k2].K=K;faces[k2].corner=c;faces[k2].other=k1;
}
});
// на прямом продолжении конец стороны — ближайшая к узлу линия сетки (у обоих
// звеньев сетка общая, поэтому это одна и та же точка): клетка, через которую
// проходит узел, целиком достаётся одному звену, а не режется пополам
Object.keys(segs).forEach(function(id){
var b=bandOf[id],ph=segs[id].ph||0;
[1,-1].forEach(function(side){
var fa=faces[key(id,side,'a')],fb=faces[key(id,side,'b')];
var cw=segCw(segs[id]);
if(fa.straight)fa.K=add(fa.K,mul(b.t,ph-cw*Math.round(ph/cw)));
if(fb.straight)fb.K=add(fb.K,mul(b.t,ph+cw*Math.round((b.L-ph)/cw)-b.L));
});
});
// стороны звеньев: одна непрерывная сетка на сторону, без шва посередине
Object.keys(segs).forEach(function(id){
var b=bandOf[id];
[1,-1].forEach(function(side){
var fa=faces[key(id,side,'a')],fb=faces[key(id,side,'b')];
var E=dot(sub(fb.K,b.A),b.t)-dot(sub(fa.K,b.A),b.t);
// линии сетки отмеряются от узлов звена (их проекций на кромку), а не от
// вершин углов: если длина звена кратна клетке, сетка целая по всей длине,
// совпадает на обеих сторонах дороги и продолжается через прямые узлы;
// неровность остаётся только в углах, где клетки и так режет биссектриса
// ph — фаза сетки звена: линии на расстоянии ph + k·s от узла a (при делении
// звена обе половины наследуют сетку исходной дороги)
var uA=dot(sub(add(b.A,mul(fa.n,W)),fa.K),b.t);
var cw=segCw(segs[id]),anchor='node',a0=offFor(uA+(segs[id].ph||0),cw);
var nC=E>1e-6?Math.max(0,Math.ceil((E-a0)/cw-1e-6)):0;
function end(f,dir){return {K:f.K,dir:dir,corner:f.corner,other:f.other,sg:f.corner?Math.sign(cr(f.corner.m,dir)):0}}
var k=id+':'+side;
hs[k]={key:k,seg:+id,side:side,d:b.t,n:fa.n,E:E,a0:a0,nC:nC,cw:cw,anchor:anchor,
ends:{a:end(fa,b.t),b:end(fb,mul(b.t,-1))}};
});
});
G={bands:bands,bandOf:bandOf,hs:hs,corners:corners};GEO++;
}

// ---------- сетка стороны ----------
// система отсчёта от конца e стороны: начало K, направление вдоль улицы d,
// линии сетки на u = off + i·s, клетки обрезаны отрезком [0, E]
function frame(k,e){
var S=G.hs[k];
if(e==='a')return {K:S.ends.a.K,d:S.d,n:S.n,off:S.a0,E:S.E,nC:S.nC,cw:S.cw};
return {K:S.ends.b.K,d:mul(S.d,-1),n:S.n,off:offFor(S.E-S.a0,S.cw),E:S.E,nC:S.nC,cw:S.cw};
}
function otherFrame(en){var p=en.other.split(':');return frame(p[0]+':'+p[1],p[2])}
function cellF(fr,i,j){
var u0=Math.max(0,fr.off+i*fr.cw),u1=Math.min(fr.E,fr.off+(i+1)*fr.cw);if(u1-u0<1e-6)return null;
var a=add(fr.K,add(mul(fr.d,u0),mul(fr.n,j*s))),b=add(fr.K,add(mul(fr.d,u1),mul(fr.n,j*s)));
return [a,b,add(b,mul(fr.n,s)),add(a,mul(fr.n,s))];
}
function isObtuse(c){return c&&c.alpha>Math.PI/2+1e-6}

// ---------- участки ----------
/*
 * Участок: {key: 'звено:сторона', k0..k1 — колонки сетки стороны (от конца a),
 * j1 — глубина, ext — {end, n}: в тупом углу на конце end выделение заехало
 * за угол на n клеток}. Правила формы — как в prototypes/crossroads, на каждом
 * из двух концов стороны:
 * - острый (и прямой) угол: если прямоугольник касается соседней улицы угла,
 *   участок доходит до вершины K, обрезается биссектрисой, и за биссектрисой
 *   добавляется треугольник K–F–T (из точки T на биссектрисе — перпендикуляр
 *   на соседнюю улицу);
 * - тупой угол: при ext участок доходит до K, и вдоль соседней улицы
 *   добавляется прямоугольник из n клеток её сетки.
 */
// форма участка кэшируется: пересчёт только при смене дорог или самого участка
var shapeMemo=new WeakMap();
function shape(l){
var mk=GEO+'|'+l.key+'|'+l.k0+'|'+l.k1+'|'+l.j1+'|'+(l.ext?l.ext.end+l.ext.n:'')+'|'+(l.fixed?1:0),m=shapeMemo.get(l);
if(m&&m.mk===mk)return m.res;
var res=shapeRaw(l);res.bb=res.parts.length?bbox([].concat.apply([],res.parts)):[0,0,-1,-1];
shapeMemo.set(l,{mk:mk,res:res});return res;
}
function shapeRaw(l){
if(l.fixed)return {corner:false,flags:{},parts:l.fixed.parts,cells:l.fixed.cells,w:l.fixed.w,h:l.fixed.h};
var S=G.hs[l.key];if(!S)return {bad:'gone',parts:[]};
if(l.k0<0||l.k1>S.nC-1)return {bad:'range',parts:[]};
var h=(l.j1+1)*s,u0=Math.max(0,S.a0+l.k0*S.cw),u1=Math.min(S.E,S.a0+(l.k1+1)*S.cw),flags={},bad=null,i,j,cc;
function P(u,v){return add(S.ends.a.K,add(mul(S.d,u),mul(S.n,v)))}
['a','b'].forEach(function(e){
var en=S.ends[e],c=en.corner;if(!c)return;
if(l.ext&&l.ext.end===e){if(!isObtuse(c)){bad='range';return}flags[e]='ext';if(e==='a')u0=0;else u1=S.E;return}
if(isObtuse(c))return;
var rect=[P(u0,0),P(u1,0),P(u1,h),P(u0,h)];
// касание соседней улицы — по линии её кромки через K (а не по прямоугольнику
// её звена: короткое звено может не доходить до вершины угла)
// касание — заход за кромку соседней улицы на луче от K вдоль неё
var of=otherFrame(en),beyond=clipHP(rect,add(en.K,mul(of.n,EPS)),of.n);
if(beyond.some(function(q){return dot(sub(q,en.K),of.d)>=-EPS})){flags[e]='acute';if(e==='a')u0=0;else u1=S.E;}
});
if(bad)return {bad:bad,parts:[]};
var R=[P(u0,0),P(u1,0),P(u1,h),P(u0,h)];
['a','b'].forEach(function(e){if(flags[e]==='acute'){var en=S.ends[e];R=clip(R,en.K,en.corner.m,en.sg)}});
if(R.length<3||area(R)<1)return {bad:'range',parts:[]};
var parts=[R],cells=[],fa=frame(l.key,'a');
var kk0=u0===0?0:l.k0,kk1=u1===S.E?S.nC-1:l.k1;
for(i=kk0;i<=kk1;i++)for(j=0;j<=l.j1;j++){cc=cellF(fa,i,j);if(!cc)continue;
['a','b'].forEach(function(e){if(cc&&flags[e]==='acute'){var en=S.ends[e];cc=clip(cc,en.K,en.corner.m,en.sg)}});
if(cc&&cc.length>=3&&area(cc)>0.5)cells.push(cc);}
var wl=String(kk1-kk0+1),nx=0;
['a','b'].forEach(function(e){
var en=S.ends[e],K=en.K;
if(flags[e]==='acute'){
var c=en.corner,o=otherFrame(en),T=null,best=-1;
R.forEach(function(p){var v=sub(p,K);if(Math.abs(cr(c.m,v))<1e-6&&len(v)>best){best=len(v);T=p}});
if(!T)return;
// кусок за биссектрисой доходит до ближайшей линии сетки соседней улицы G
// (не до основания перпендикуляра — иначе до соседнего участка остаётся щель):
// прямоугольник сетки соседней улицы [K..G] × [0..hB], обрезанный биссектрисой
var cB=dot(sub(T,K),en.dir),hB=dot(sub(T,K),o.n),osg=Math.sign(cr(c.m,o.d));
var G=Math.min(o.E,o.off+Math.ceil((cB-o.off)/o.cw-1e-6)*o.cw),FG=add(K,mul(o.d,G));
var PB=clip([K,FG,add(FG,mul(o.n,hB)),add(K,mul(o.n,hB))],K,c.m,osg);
if(PB.length>=3)parts.push(PB);
for(i=0;o.off+i*o.cw<G-1e-6;i++)for(j=0;j*s<hB-1e-6;j++){cc=cellF(o,i,j);if(!cc)continue;cc=clipHP(clip(cc,K,c.m,osg),add(K,mul(o.n,hB)),o.n);if(cc.length>=3&&area(cc)>0.5)cells.push(cc);}
}
if(flags[e]==='ext'){
// n целых клеток соседней улицы; неполная клетка у вершины угла (если сетка
// соседней улицы не начинается ровно в K) добавляется сверх них
var o2=otherFrame(en),n=l.ext.n,pt=o2.off<-1e-6?1:0;
if(n+pt>o2.nC){bad='range';return}
var F0=add(K,mul(o2.d,Math.min(o2.E,o2.off+(n+pt)*o2.cw)));
parts.push([K,F0,add(F0,mul(o2.n,h)),add(K,mul(o2.n,h))]);
for(i=0;i<n+pt;i++)for(j=0;j<=l.j1;j++){cc=cellF(o2,i,j);if(!cc)continue;cc=clipHP(cc,K,en.dir);if(cc.length>=3&&area(cc)>0.5)cells.push(cc);}
nx=n;
}
});
if(bad)return {bad:bad,parts:[]};
// без почти совпадающих вершин и вырожденных частей
parts=parts.map(function(pp){var o=[];pp.forEach(function(q){var z=o[o.length-1];if(!z||len(sub(q,z))>1e-6)o.push(q)});
while(o.length>1&&len(sub(o[0],o[o.length-1]))<=1e-6)o.pop();return o}).filter(function(pp){return pp.length>=3&&area(pp)>0.01});
return {corner:!!(flags.a||flags.b),flags:flags,parts:parts,cells:cells,w:nx?'('+wl+'+'+nx+')':wl,h:l.j1+1};
}
function check(l,skip){
var S=shape(l);if(S.bad)return S.bad;
// допуск при проверке пересечений — только на погрешность вычислений (OVL),
// иначе между не совсем параллельными краями проходят тонкие клинья
for(var r=0;r<G.bands.length;r++){if(!bbHit(S.bb,G.bands[r].bb))continue;for(var p=0;p<S.parts.length;p++)if(overlaps(S.parts[p],G.bands[r].poly,OVL))return 'road';}
for(var i=0;i<lots.length;i++){if(lots[i]===skip)continue;var O=shape(lots[i]);if(!bbHit(S.bb,O.bb))continue;
for(var a=0;a<S.parts.length;a++)for(var b=0;b<O.parts.length;b++)if(overlaps(S.parts[a],O.parts[b],OVL))return 'lot';}
if(H&&H.lotCheck)return H.lotCheck(l,S)||null;
return null;
}
function inLot(P,l){return shape(l).parts.some(function(pp){return inside(P,pp)})}
function onRoad(P){return G.bands.some(function(b){return inside(P,b.poly)})}
// сторона и клетка под точкой
function sideUV(P,k){var S=G.hs[k],v=sub(P,S.ends.a.K);return {u:dot(v,S.d),w:dot(v,S.n)}}
function colAt(S,u){return Math.max(0,Math.min(S.nC-1,Math.floor((u-S.a0)/S.cw)))}
// точка ближе к какой-то другой улице, чем к своей (own — расстояние до своей кромки)?
// так же, как биссектриса делит угол, это делит клетки в тесных кварталах
function closerElsewhere(P,seg,own){
return G.bands.some(function(b){if(b.seg===undefined||b.seg===seg)return false;if(!bbHit(b.bb,[P[0],P[1],P[0],P[1]],own+W+1))return false;var o=segDist(P,b.A,b.B)-W;
return o<own-0.5||(Math.abs(o-own)<=0.5&&b.seg<seg);}); // при равенстве — улице с меньшим номером
}
function hitCell(P){
if(onRoad(P))return null;
var best=null;
for(var k in G.hs){var S=G.hs[k];if(!S.nC)continue;
var q=sideUV(P,k);if(q.u<0||q.u>S.E||q.w<0||q.w>=D*s)continue;
var ok=['a','b'].every(function(e){var en=S.ends[e];return !en.corner||en.sg*cr(en.corner.m,sub(P,en.K))>=0});
if(!ok||closerElsewhere(P,S.seg,q.w))continue;
if(!best||q.w<best.w)best={key:k,k:colAt(S,q.u),j:Math.floor(q.w/s),w:q.w};}
return best;
}
// выделение: от начальной колонки до точки курсора; за вершину тупого угла — ext
function selFrom(d,P){
var S=G.hs[d.key],q=sideUV(P,d.key),kc=colAt(S,q.u),jc=Math.max(0,Math.min(D-1,Math.floor(q.w/s)));
var l={key:d.key,k0:Math.min(d.k,kc),k1:Math.max(d.k,kc),j1:Math.max(d.j,jc),ext:null};
if(q.u<0&&isObtuse(S.ends.a.corner)){var oa=otherFrame(S.ends.a);l.ext={end:'a',n:Math.min(oa.nC-(oa.off<-1e-6?1:0),Math.ceil(-q.u/s))};l.k0=0}
else if(q.u>S.E&&isObtuse(S.ends.b.corner)){var ob=otherFrame(S.ends.b);l.ext={end:'b',n:Math.min(ob.nC-(ob.off<-1e-6?1:0),Math.ceil((q.u-S.E)/s))};l.k1=S.nC-1}
if(l.ext&&l.ext.n<1)l.ext=null;
return l;
}

// ---------- дороги: привязка и проверка звена ----------
function segPh(g){return g.ph||0}
// начало звена: узел, линия сетки на существующей дороге или точка сетки поля
function snap(P,exclude){
var best=null,bd=W*1.3;
for(var n in nodes){if(+n===exclude)continue;var d=len(sub(P,[nodes[n].x,nodes[n].y]));if(d<bd){bd=d;best={type:'node',id:+n,P:[nodes[n].x,nodes[n].y]}}}
if(best)return best;
for(var id in segs){var E=segEnds(segs[id]),A=E[0],B=E[1],L=len(sub(B,A)),t=nrm(sub(B,A)),u=dot(sub(P,A),t);
if(u<0||u>L||Math.abs(cr(t,sub(P,A)))>W)continue;
var ph=segPh(segs[id]),cw=segCw(segs[id]),uu=ph+Math.round((u-ph)/cw)*cw;
if(uu>=2*s-1e-6&&L-uu>=2*s-1e-6)return {type:'split',seg:+id,u:uu,P:add(A,mul(t,uu))};
}
return {type:'free',P:[Math.round(P[0]/s)*s,Math.round(P[1]/s)*s]};
}
// точки звена id на линиях его сетки, до которых от C целое число клеток
// (с допуском TOL): только туда можно поставить конец новой дороги, чтобы
// новый узел стоял на сетке обеих дорог
function gridPointsOn(id,C){
var g=segs[id],E=segEnds(g),A=E[0],B=E[1],L=len(sub(B,A)),t=nrm(sub(B,A)),ph=segPh(g),cw=segCw(g),out=[];
for(var u=ph-Math.floor(ph/cw)*cw;u<=L-2*cw+1e-6;u+=cw){if(u<2*cw-1e-6)continue;
var P=add(A,mul(t,u)),d=len(sub(P,C))/s,n=Math.round(d);
if(n>=2&&isWhole(d))out.push({type:'split',seg:+id,u:u,P:P});}
return out;
}
/*
 * Конец звена. Каждый узел должен стоять на линии сетки всех своих дорог,
 * а длина звена — быть целой (в пределах TOL; клетки вдоль звена потом чуть
 * растягиваются до ровного счёта). Поэтому:
 * - узел: только если расстояние до него целое; иначе конец съезжает вбок от
 *   узла — на ближайшую подходящую точку одной из его дорог;
 * - дорога под курсором: ближайшая к курсору подходящая точка этой дороги
 *   (линия её сетки на целом расстоянии от начала);
 * - свободная точка: длина кратна клетке, направление — шаг 5°.
 */
function endFor(S,P){
var ex=S.type==='node'?S.id:null,nd=null,bd=W*1.3;
function okSeg(id){var g=segs[id];return !(S.type==='split'&&S.seg===+id)&&!(ex!==null&&(g.a===ex||g.b===ex))}
for(var n in nodes){if(+n===ex)continue;var d0=len(sub(P,[nodes[n].x,nodes[n].y]));if(d0<bd){bd=d0;nd=+n}}
if(nd!==null){
var NP=[nodes[nd].x,nodes[nd].y],d=len(sub(NP,S.P))/s;
if(isWhole(d))return {type:'node',id:nd,P:NP};
var cand=[];
Object.keys(segs).forEach(function(id){var g=segs[id];if((g.a===nd||g.b===nd)&&okSeg(id))cand=cand.concat(gridPointsOn(id,S.P))});
cand.sort(function(x,y){return len(sub(x.P,NP))-len(sub(y.P,NP))});
if(cand.length&&len(sub(cand[0].P,NP))<6*s)return cand[0];
return {type:'node',id:nd,P:NP};
}
for(var id in segs){if(!okSeg(id))continue;
var E2=segEnds(segs[id]);if(segDist(P,E2[0],E2[1])>W)continue;
var c2=gridPointsOn(id,S.P);
c2.sort(function(x,y){return len(sub(x.P,P))-len(sub(y.P,P))});
if(c2.length&&len(sub(c2[0].P,P))<4*s)return c2[0];
var tt=nrm(sub(E2[1],E2[0])),pp=add(E2[0],mul(tt,dot(sub(P,E2[0]),tt)));
return {type:'split',seg:+id,u:dot(sub(pp,E2[0]),tt),P:pp,bad:'nogrid'};
}
var v=sub(P,S.P),L=Math.max(s,Math.round(len(v)/s)*s),a=Math.atan2(v[1],v[0]),st=5*Math.PI/180;
a=Math.round(a/st)*st;return {type:'free',P:add(S.P,[L*Math.cos(a),L*Math.sin(a)])};
}
var WHY={short:'звено короче 2 клеток',dup:'такое звено уже есть',along:'звено идёт вдоль существующей дороги',
angle:'угол между дорогами меньше 20°',odd:'расстояние до узла не кратно клетке',nogrid:'на этой дороге рядом нет линии сетки на целом расстоянии',cross:'пересекает дорогу не в узле',near:'слишком близко к другой дороге'};
function validate(S,E){
var A=S.P,B=E.P,L=len(sub(B,A));
if(H&&H.roadWhy){var hw=H.roadWhy(A,B,S,E);if(hw)return hw}
if(L<2*s-1e-6)return 'short';
if(E.bad)return E.bad;
if(!isWhole(L/s))return 'odd';
var t=nrm(sub(B,A));
if(S.type==='node'&&E.type==='node'){for(var id in segs){var g=segs[id];if((g.a===S.id&&g.b===E.id)||(g.b===S.id&&g.a===E.id))return 'dup'}}
if(S.type==='split'&&E.type==='split'&&S.seg===E.seg)return 'along';
var ends=[[S,A,t],[E,B,mul(t,-1)]];
for(var id2 in segs){
var g2=segs[id2],GE=segEnds(g2),ga=GE[0],gb=GE[1],gt=nrm(sub(gb,ga)),shared=false;
for(var q=0;q<2;q++){var X=ends[q][0],ray=ends[q][2];
if(X.type==='node'&&(X.id===g2.a||X.id===g2.b)){shared=true;
var gr=X.id===g2.a?gt:mul(gt,-1);if(angBetween(ray,gr)<MINANG)return 'angle';}
if(X.type==='split'&&X.seg===+id2){shared=true;
if(angBetween(ray,gt)<MINANG||angBetween(ray,mul(gt,-1))<MINANG)return 'angle';}
}
if(shared)continue;
var dd=segSegDist(A,B,ga,gb);
if(dd<1e-6)return 'cross';
if(dd<2*W+EPS)return 'near';
}
return null;
}
function nodeAt(X){
if(X.type==='node')return X.id;
var n=nid++;nodes[n]={x:X.P[0],y:X.P[1]};
if(X.type==='split'){var g=segs[X.seg];delete segs[X.seg];
var ph=segPh(g),cw=segCw(g);segs[sid++]={a:g.a,b:n,ph:ph,cw:g.cw};segs[sid++]={a:n,b:g.b,ph:((ph-X.u)%cw+cw)%cw,cw:g.cw};
}
return n;
}
/*
 * Построенные дома не должны меняться от новых дорог. Перед любым изменением
 * дорог запоминаем, где лежит каждый участок (точки начала и конца на кромке
 * дороги — мировые координаты, сетка в мире не сдвигается) и его форму. После
 * изменения переносим участок на ту сторону звена, где он лежит, — на те же
 * клетки (номера колонок пересчитываются: вершина угла могла сдвинуться,
 * звено — разрезаться). Если форма всё же изменилась (угол стал другим,
 * участок лёг поперёк нового разреза), участок сохраняется «замороженным» —
 * с прежней формой. Если новая дорога прошла по участку, он остаётся и
 * становится невалидным (красным).
 */
var pendingLots=[];
function partsArea(ps){return ps.reduce(function(a,p){return a+area(p)},0)}
function partsCenter(ps){var x=0,y=0,n=0;ps.forEach(function(p){p.forEach(function(q){x+=q[0];y+=q[1];n++})});return [x/n,y/n]}
function captureLots(){
pendingLots=[];
lots.forEach(function(l){
if(l.fixed)return;
var S=G.hs[l.key],sh=shape(l);if(!S||sh.bad)return;
var u0=Math.max(0,S.a0+l.k0*S.cw),u1=Math.min(S.E,S.a0+(l.k1+1)*S.cw);
function P(u){return add(S.ends.a.K,mul(S.d,u))}
pendingLots.push({l:l,side:S.side,P0:P(u0),P1:P(u1),
extK:l.ext?S.ends[l.ext.end].K:null,fixed:{parts:sh.parts,cells:sh.cells,w:sh.w,h:sh.h}});
});
}
function remapLots(){
if(!pendingLots.length)return;
derive();
pendingLots.forEach(function(c){
var l=c.l,found=null;
for(var k in G.hs){var S=G.hs[k];if(S.side!==c.side||!S.nC)continue;
var q0=sideUV(c.P0,k),q1=sideUV(c.P1,k);
if(Math.abs(q0.w)>0.5||Math.abs(q1.w)>0.5)continue;
if(q0.u<-0.5||q1.u>S.E+0.5||q0.u>q1.u)continue;
found={k:k,S:S,u0:q0.u,u1:q1.u};break;}
if(found){
var S=found.S,ext=null;
if(l.ext){var e=len(sub(S.ends.a.K,c.extK))<0.5?'a':(len(sub(S.ends.b.K,c.extK))<0.5?'b':null);if(e)ext={end:e,n:l.ext.n};}
l.key=found.k;l.k0=colAt(S,found.u0+0.25*S.cw);l.k1=colAt(S,found.u1-0.25*S.cw);l.ext=ext;
// форма не должна измениться (например, стать угловой у новой улицы) — иначе заморозить
var sh=shape(l);if(sh.bad||Math.abs(partsArea(sh.parts)-partsArea(c.fixed.parts))>0.05||len(sub(partsCenter(sh.parts),partsCenter(c.fixed.parts)))>0.05){l.key='fixed';l.fixed=c.fixed;l.ext=null}
}else{l.key='fixed';l.fixed=c.fixed;}
});
pendingLots=[];
}
function addRoad(S,E){
captureLots();
var a=nodeAt(S);
if(E.type==='split'&&S.type==='split'&&E.seg===S.seg)return;
// если начало разделило звено, на котором лежит конец, — найти новую половину
if(E.type==='split'&&!segs[E.seg]){for(var id in segs){var GE=segEnds(segs[id]);if(segDist(E.P,GE[0],GE[1])<1e-3){E={type:'split',seg:+id,u:len(sub(E.P,GE[0])),P:E.P};break}}}
var b=nodeAt(E);
segs[sid++]={a:a,b:b};
remapLots();
}
function removeSeg(id){
lots=lots.filter(function(l){return l.key.split(':')[0]!==String(id)});
captureLots();
var g=segs[id];delete segs[id];
[g.a,g.b].forEach(function(n){var used=Object.keys(segs).some(function(k){return segs[k].a===n||segs[k].b===n});if(!used){delete nodes[n];exits=exits.filter(function(x){return x.node!==n})}});
remapLots();
}
function segUnder(P){
var best=null,bd=W;
for(var id in segs){var E=segEnds(segs[id]),d=segDist(P,E[0],E[1]);if(d<=bd){bd=d;best=+id}}
return best;
}

// ---------- отрисовка ----------
// цвета домов: спокойная палитра, соседние по порядку дома — разных цветов
// стили домов: цвета сняты с 3D-домов Яндекс Карт (Кремль, Дом РККА, высотка
// на Котельнической, театр Моссовета, Народный музей в Белграде и др.)
// стили домов и цвета карты — общие для всех прототипов (prototypes/shared/city3d.js)
var STYLES=City3D.STYLES;
var PALETTE=STYLES.map(function(x){return x.wall}),colorN=0;
/*
 * Типы домов, как в большинстве градостроительных игр: жилой, коммерческий,
 * рабочий (промышленный). Вместимость дома считается от площади участка в
 * клетках (клетка 4×4 м) и этажей: площадь × этажи × плотность, округлённо,
 * не меньше 1. Жилой дом вмещает жителей, коммерческий и рабочий — рабочие
 * места. Цвет в 2D — цвет типа (оттенок свой у каждого дома), стиль в 3D —
 * из стилей своего типа.
 */
var ZONES={
res:{name:'Жилой',short:'Ж',unit:'жит.',color:City3D.COLORS.zone.res,dens:0.5,styles:City3D.ZONE_STYLES.res},     // ~32 м² на жителя
com:{name:'Коммерческий',short:'К',unit:'раб.',color:City3D.COLORS.zone.com,dens:0.5,styles:City3D.ZONE_STYLES.com},  // магазины, кафе, услуги
work:{name:'Рабочий',short:'Р',unit:'раб.',color:City3D.COLORS.zone.work,dens:0.25,styles:City3D.ZONE_STYLES.work}}; // мастерские, склады, фермы — просторнее
var ZORDER=['res','com','work'];
function typeOf(l){return ZONES[l.type]?l.type:'res'}
function cellsOf(l){var S=shape(l);return S.bad?0:Math.round(partsArea(S.parts)/(s*s)*100)/100}
function capOf(l){if(l.cap!=null)return l.cap;if(l.pois)return lotCaps(l).res;var c=cellsOf(l);return c?Math.max(1,Math.round(c*(l.floors||1)*ZONES[typeOf(l)].dens)):0}
// дом со смешанным назначением (Дорчол): жители — на жилых этажах, рабочие места — у заведений
function lotCaps(l){var c=cellsOf(l),r={res:0,com:0,work:0};
  if(!l.pois){r[typeOf(l)==='res'?'res':typeOf(l)]=capOf(l);return r}
  r.res=c&&l.resFloors>0?Math.max(1,Math.round(c*l.resFloors*ZONES.res.dens)):0;
  l.pois.forEach(function(p){if(p.kind==='work')r.work+=p.jobs;else r.com+=p.jobs});return r}
function nextColor(type){var st=ZONES[type||'res'].styles;return PALETTE[st[(colorN++)%st.length]]}
// оттенок дома внутри цвета типа: соседние дома чуть различаются
function lotFill(l){if(!l.uid)l.uid=lotUid++;var h=0;String(l.color||'').split('').forEach(function(c){h=(h*31+c.charCodeAt(0))>>>0});h=(h+(l.uid||0)*7)%5;return shade(ZONES[typeOf(l)].color,(h-2)*0.06)}
var lotUid=1;
function styleOf(l){if(l.style!=null)return l.style;var i=PALETTE.indexOf(l.color);if(i>=0)return i;var h=0;String(l.color).split('').forEach(function(c){h=(h*31+c.charCodeAt(0))>>>0});return h%STYLES.length}
var shade=City3D.shade;
function lotSvg(l,fill,stroke,op,sw){
var S=shape(l);if(!S.parts.length)return '';
var out='<g opacity="'+op+'">';
S.parts.forEach(function(P){out+='<polygon class="ns" points="'+pts(P)+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="'+(2*sw)+'" stroke-linejoin="round"/>'});
S.parts.forEach(function(P){out+='<polygon points="'+pts(P)+'" fill="'+fill+'" stroke="none"/>'});
S.cells.forEach(function(c){out+='<polygon class="ns" points="'+pts(c)+'" fill="none" stroke="'+stroke+'" stroke-width="0.5" stroke-opacity="0.6"/>'});
var P0=S.parts[0],cx=0,cy=0;P0.forEach(function(p){cx+=p[0];cy+=p[1]});cx/=P0.length;cy/=P0.length;
// подпись — только если помещается в дом на экране (иначе при отдалении каша)
var z=ZONES[typeOf(l)],cap=capOf(l),bw=S.bb?Math.max(S.bb[2]-S.bb[0],S.bb[3]-S.bb[1])*view.k:0;
var lab=S.w+'×'+S.h+(l.floors?' · '+l.floors+' эт.':'')+(cap?' · '+cap+' '+z.unit:'');if(H&&H.lotLabel)lab=H.lotLabel(l,lab);if(!lab)return out+'</g>';
if(bw<lab.length*6.2)lab=z.short+(cap?' '+cap:''); // не помещается — коротко: тип и вместимость
if(S.bb&&Math.min(S.bb[2]-S.bb[0],S.bb[3]-S.bb[1])*view.k<14||bw<lab.length*6.2)return out+'</g>';
out+='<text x="'+cx.toFixed(1)+'" y="'+cy.toFixed(1)+'" font-size="'+(11/view.k).toFixed(1)+'" text-anchor="middle" dominant-baseline="central" fill="#fff" style="pointer-events:none;font-weight:600;paint-order:stroke;stroke:rgba(0,0,0,.55);stroke-width:2.5px">'+lab+'</text>';
return out+'</g>';
}
function drawStatic(){
derive();
var cells='',roads='',dash='',nd='',walks='';G.drawn=[];
Object.keys(G.hs).forEach(function(k){var S=G.hs[k],fa=frame(k,'a');
for(var i=0;i<S.nC;i++)for(var j=0;j<D;j++){
var c=cellF(fa,i,j),kind='full';if(!c)continue;
['a','b'].forEach(function(e){var en=S.ends[e];if(c&&en.corner)c=clip(c,en.K,en.corner.m,en.sg)});
if(c.length<3)continue;var ar=area(c);if(ar<1)continue;if(ar<S.cw*s-0.5)kind='corner';
var cbb=bbox(c);if(G.bands.some(function(b){return bbHit(cbb,b.bb)&&overlaps(c,b.poly,EPS)}))continue;
var ce=[0,0];c.forEach(function(p){ce[0]+=p[0]/c.length;ce[1]+=p[1]/c.length});
if(closerElsewhere(ce,S.seg,dot(sub(ce,S.ends.a.K),S.n)))continue;
if(H&&H.cellSkip&&H.cellSkip(c,ce))continue;
var cd={key:k,i:i,j:j,ce:ce,poly:c,kind:kind};G.drawn.push(cd);
var cs=H&&H.cellStyle?H.cellStyle(cd):null;if(cs===false)continue;
if(cs)cells+='<polygon class="ns" points="'+pts(c)+'" fill="'+cs.fill+'" stroke="'+cs.stroke+'" stroke-width="0.6"'+(cs.op!=null?' fill-opacity="'+cs.op+'"':'')+'/>';
else cells+='<polygon class="ns" points="'+pts(c)+'" fill="'+(kind==='full'?'#9ED38F':'#F2B866')+'" stroke="'+(kind==='full'?'#6FA862':'#B27A24')+'" stroke-width="0.6"/>';
}});
Object.keys(segs).forEach(function(id){var E=segEnds(segs[id]);
if(SW>0)walks+='<line x1="'+E[0][0]+'" y1="'+E[0][1]+'" x2="'+E[1][0].toFixed(1)+'" y2="'+E[1][1].toFixed(1)+'" stroke="'+City3D.COLORS.sidewalk+'" stroke-width="'+(2*W)+'" stroke-linecap="round"/>';
roads+='<line x1="'+E[0][0]+'" y1="'+E[0][1]+'" x2="'+E[1][0].toFixed(1)+'" y2="'+E[1][1].toFixed(1)+'" stroke="'+City3D.COLORS.road+'" stroke-width="'+(2*(W-SW))+'" stroke-linecap="round"/>';
dash+='<line class="ns" x1="'+E[0][0]+'" y1="'+E[0][1]+'" x2="'+E[1][0].toFixed(1)+'" y2="'+E[1][1].toFixed(1)+'" stroke="#F2F2F2" stroke-width="1.5" stroke-dasharray="8 7"/>';
});
if(mode==='road')Object.keys(nodes).forEach(function(n){nd+='<circle class="ns" cx="'+nodes[n].x+'" cy="'+nodes[n].y+'" r="'+(W*0.45)+'" fill="#fff" stroke="#2f6f8f" stroke-width="1.5"/>'});
el('cells').innerHTML=cells;
// зебры — общий расчёт с 3D (City3D.crosswalkPolys)
var zebra=SW>0?City3D.crosswalkPolys(streetDesc()).map(function(p){return '<polygon points="'+pts(p)+'" fill="'+City3D.COLORS.crosswalk+'"/>'}).join(''):'';
el('roads').innerHTML=walks+roads+zebra+dash;
el('nodes').innerHTML=nd;
el('ghost').innerHTML=ghost.map(function(g){return '<polygon class="ns" points="'+pts(g.p)+'" fill="#000" fill-opacity="0.06" stroke="#5c4a3a" stroke-opacity="0.45" stroke-width="0.6"/>'}).join('');
drawLots();
}
function drawLots(){
var out='';
var cut=exitLinks().unlinkedLots; // без связи с внешним миром — бледные
lots.forEach(function(l){var lk=H&&H.lotLook?H.lotLook(l):null;if(lk){out+=lotSvg(l,lk.fill,lk.stroke,lk.op,1)+(lk.extra||'');return}var c=lotFill(l);out+=check(l,l)?lotSvg(l,'#D9363E','#8E1B21',0.75,1):lotSvg(l,c,shade(c,-0.45),cut.indexOf(l)>=0?0.4:1,1)});
el('lots').innerHTML=out;if(H&&H.afterDraw)H.afterDraw();
drawExits();
}
function applyView(){el('world').setAttribute('transform','translate('+view.tx.toFixed(1)+' '+view.ty.toFixed(1)+') scale('+view.k.toFixed(3)+')');}

var stEl=el('st'),hintEl=el('hint');
var HINT={road:'Тяните от точки до точки — получится звено дороги. Начинайте и заканчивайте на узлах или на дороге, чтобы соединить. Тап по дороге удаляет звено.',
lot:'Зажмите клетку у дороги и тяните — выделится участок, затем укажите число этажей. В тупом углу тяните за угол, на перекрёсток. Тап по дому — изменить этажи или удалить.',
exit:'Нажмите на конец дороги (тупик) — там появится выезд во внешний мир: дорога, по которой жители ездят за пределы города. Нажмите на выезд, чтобы переименовать или удалить его.',
pan:'Тяните поле, чтобы сдвинуть вид. Колесо мыши или кнопки −/+ меняют масштаб.'};
var LWHY={road:'нельзя — задевает дорогу',lot:'нельзя — пересекается с другим участком',range:'нельзя — выходит за свою часть улицы',gone:'улица удалена'};
function idle(){
if(H&&H.idle){H.idle();return}
var bad=lots.filter(function(l){return check(l,l)}).length;
stEl.textContent='Звеньев: '+Object.keys(segs).length+', узлов: '+Object.keys(nodes).length+', участков: '+lots.length+(bad?', из них невалидных: '+bad:'')+'.';
drawStats();
}
// итоги по городу: жилые места и рабочие места по типам (невалидные дома не считаются)
function totals(){var t={res:0,com:0,work:0,n:{res:0,com:0,work:0}};lots.forEach(function(l){if(check(l,l))return;var k=typeOf(l);
  if(l.pois){var c=lotCaps(l);t.res+=c.res;t.com+=c.com;t.work+=c.work}else t[k]+=capOf(l);t.n[k]++});return t}
function drawStats(){var t=totals(),nx=exits.filter(exitValid).length,u=exitLinks().unlinked,hs=lots.length;
var ext=!nx?' · Выездов во внешний мир нет — город отрезан':' · Выездов во внешний мир: '+nx+(u.n?' — без связи с ними домов: '+u.n+' (жителей '+u.res+', рабочих мест '+u.jobs+')':(hs?' — все дома связаны':''));
el('stats').textContent='Жителей: '+t.res+' (домов '+t.n.res+') · Рабочих мест: '+(t.com+t.work)+' — коммерческих '+t.com+' (домов '+t.n.com+'), рабочих '+t.work+' (домов '+t.n.work+')'+ext;}
function setMode(m){mode=m;['road','lot','exit','pan'].forEach(function(x){el('m-'+x).setAttribute('aria-pressed',x===m?'true':'false')});
hintEl.textContent=HINT[m]||(H&&H.hint?H.hint(m):'');clearPrev();drawStatic();idle();}

// ---------- ввод ----------
var sv=el('sv');
function svgPt(e){var pt=sv.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;var p=pt.matrixTransform(sv.getScreenCTM().inverse());return [p.x,p.y]}
function worldPt(e){if(e&&e.__P)return e.__P;var p=svgPt(e);return [(p[0]-view.tx)/view.k,(p[1]-view.ty)/view.k]}
function selLot(){return drag.sel}
// превью и для 3D: игра получает плоские многоугольники (H.preview3D)
function clearPrev(){el('prev').innerHTML='';if(H&&H.preview3D)H.preview3D([])}
function octa(c,r){var p=[];for(var i=0;i<8;i++){var a=i*Math.PI/4+Math.PI/8;p.push([c[0]+r*Math.cos(a),c[1]+r*Math.sin(a)])}return p}
function previewRoad(){
var S=drag.S,E=drag.E,why=validate(S,E),col=why?'#D9363E':'#3E9B5B';
var out='<line x1="'+S.P[0]+'" y1="'+S.P[1]+'" x2="'+E.P[0].toFixed(1)+'" y2="'+E.P[1].toFixed(1)+'" stroke="'+col+'" stroke-opacity="0.6" stroke-width="'+(2*W)+'" stroke-linecap="round"/>';
[S,E].forEach(function(X){out+='<circle class="ns" cx="'+X.P[0].toFixed(1)+'" cy="'+X.P[1].toFixed(1)+'" r="'+(W*0.5)+'" fill="'+(X.type==='free'?'#fff':'#2f6f8f')+'" stroke="#1d1d1b" stroke-width="1.5"/>'});
el('prev').innerHTML=out;
if(H&&H.preview3D){var tt=len(sub(E.P,S.P))>1e-6?nrm(sub(E.P,S.P)):[1,0],nn=[-tt[1],tt[0]];
  H.preview3D([{polys:[[add(S.P,mul(nn,W)),add(E.P,mul(nn,W)),add(E.P,mul(nn,-W)),add(S.P,mul(nn,-W))],octa(S.P,W),octa(E.P,W)],color:col,opacity:0.55},
    {polys:[octa(S.P,W*0.45),octa(E.P,W*0.45)],color:'#ffffff',opacity:0.95,y:2.6}])}
var L=len(sub(E.P,S.P))/s;
var odd=Math.abs(L-Math.round(L))>0.02;
stEl.textContent='Звено '+(odd?L.toFixed(1):Math.round(L))+' кл.: '+(why?'нельзя — '+(WHY[why]||why):'можно построить'+(H&&H.roadInfo?H.roadInfo(S,E):''))+(E.type==='split'||S.type==='split'?' (появится перекрёсток)':'');
}
function previewLot(){
var l=selLot(),why=check(l,null),S=shape(l);
el('prev').innerHTML=why?lotSvg(l,'#D9363E','#8E1B21',0.55,1.6):lotSvg(l,'#3E9B5B','#1F6B38',0.55,1.6);
if(H&&H.preview3D)H.preview3D([{polys:S.parts,color:why?'#D9363E':'#3E9B5B',opacity:0.55}]);
stEl.textContent=(S.corner?'Угловой участок ':'Участок ')+(S.w||'')+(S.h?'×'+S.h:'')+': '+(why?LWHY[why]:'можно построить');
}
function onDown(e){
var P=worldPt(e);
try{sv.setPointerCapture(e.pointerId)}catch(_){}
e.preventDefault();
if(mode==='pan'||(H&&(e.button===2||e.button===1))){var p=svgPt(e);drag={pan:true,x:p[0],y:p[1],tx:view.tx,ty:view.ty};return}
if(H&&H.modes&&H.modes[mode]){drag={app:true};if(H.modes[mode].down(P,e)===false)drag=null;return}
if(mode==='exit'){drag=null;exitTap(P);return}
if(mode==='road'){var S=snap(P,null);drag={road:true,S:S,E:S,P0:P,moved:false};return}
var onLot=-1;for(var i=lots.length-1;i>=0;i--)if(inLot(P,lots[i])){onLot=i;break}
var h=hitCell(P);
if(!h&&onLot<0){drag=null;return}
drag=h?{lot:true,key:h.key,k:h.k,j:h.j,moved:false,onLot:onLot,sel:{key:h.key,k0:h.k,k1:h.k,j1:h.j,ext:null}}:{lot:true,none:true,onLot:onLot,moved:false};
if(!drag.none)previewLot();
}
sv.addEventListener('pointerdown',onDown);
function onMove(e){
if(!drag){if(H&&H.modes&&H.modes[mode]&&H.modes[mode].hover)H.modes[mode].hover(worldPt(e),e);else if(H&&H.hover)H.hover(worldPt(e),e,mode);return}
if(drag.pan){var p=svgPt(e);view.tx=drag.tx+p[0]-drag.x;view.ty=drag.ty+p[1]-drag.y;applyView();return}
var P=worldPt(e);
if(drag.app){H.modes[mode].move&&H.modes[mode].move(P,e);return}
if(drag.road){if(len(sub(P,drag.P0))>s*0.6)drag.moved=true;if(!drag.moved)return;drag.E=endFor(drag.S,P);previewRoad();return}
if(drag.none)return;
var nl=selFrom(drag,P);
if(JSON.stringify(nl)!==JSON.stringify(drag.sel)){drag.sel=nl;drag.moved=true;previewLot();}
}
sv.addEventListener('pointermove',onMove);
// ввод из 3D-вида: точка на земле вместо координат SVG
function fakeEv(P,e){return {__P:P,button:0,pointerId:-1,shiftKey:e&&e.shiftKey,clientX:e?e.clientX:0,clientY:e?e.clientY:0,preventDefault:function(){}}}
var input={down:function(P,e){onDown(fakeEv(P,e))},move:function(P,e){onMove(fakeEv(P,e))},up:function(P,e){finish(fakeEv(P,e))},cancel:function(){drag=null;clearPrev();idle()},busy:function(){return !!drag}};
function finish(e){
if(!drag)return;
var d=drag;drag=null;clearPrev();
if(d.app){H.modes[mode].up&&H.modes[mode].up(e?worldPt(e):null,e);idle();return}
if(d.road){
if(!d.moved){var g=segUnder(d.P0);if(g!==null&&(!H||!H.beforeRemoveSeg||H.beforeRemoveSeg(g))){removeSeg(g);drawStatic();if(H&&H.afterRoad)H.afterRoad()}}
else if(!validate(d.S,d.E)&&(!H||!H.beforeRoad||H.beforeRoad(d.S,d.E))){addRoad(d.S,d.E);drawStatic();if(H&&H.afterRoad)H.afterRoad()}
}else if(d.lot){
if(!d.moved&&d.onLot>=0)openDlg(lots[d.onLot],false);
else if(!d.none){drag=d;var l=selLot();drag=null;if(!check(l,null)){l.type=lastType;l.color=nextColor(lastType);openDlg(l,true);}}
drawLots();
}
idle();
}
sv.addEventListener('pointerup',finish);
sv.addEventListener('pointercancel',function(){drag=null;clearPrev();idle()});
function zoomAt(f,cx,cy){var k=Math.max(0.06,Math.min(4,view.k*f));f=k/view.k;view.tx=cx-(cx-view.tx)*f;view.ty=cy-(cy-view.ty)*f;view.k=k;applyView();drawLots();}
sv.addEventListener('wheel',function(e){e.preventDefault();var p=svgPt(e);zoomAt(e.deltaY<0?1.15:1/1.15,p[0],p[1])},{passive:false});
el('z-in').addEventListener('click',function(){if(V3.on){if(V3.view)V3.view.zoom(1.25);return}vbox();zoomAt(1.25,VW/2,VH/2)});
el('z-out').addEventListener('click',function(){if(V3.on){if(V3.view)V3.view.zoom(0.8);return}vbox();zoomAt(0.8,VW/2,VH/2)});
['road','lot','exit','pan'].forEach(function(m){el('m-'+m).addEventListener('click',function(){setMode(m)})});
el('b-clr').addEventListener('click',function(){nodes={};segs={};lots=[];exits=[];W=W0;SW=0;ghost=[];drawStatic();idle();if(V3.on){fit3();build3D()}});
el('b-demo').addEventListener('click',function(){
nodes={};segs={};lots=[];exits=[];nid=1;sid=1;W=W0;SW=0;ghost=[];
function nd(x,y){var n=nid++;nodes[n]={x:x,y:y};return n}
function sg(a,b){segs[sid++]={a:a,b:b}}
var c=nd(336,224),th=60*Math.PI/180;
var w0=nd(336-14*s,224);sg(c,w0);sg(c,nd(336+18*s,224));addExit(w0);
sg(c,nd(336+12*s*Math.cos(th),224-12*s*Math.sin(th)));sg(c,nd(336-12*s*Math.cos(th),224+12*s*Math.sin(th)));
var e=nd(336+18*s,224-12*s);sg(+Object.keys(nodes).find(function(n){return nodes[n].x===336+18*s&&nodes[n].y===224}),e);
drawStatic();idle();if(V3.on){fit3();build3D()}
});

// ---------- сцены из реальных карт ----------
/*
 * Сцена — улицы и дома реального района из OpenStreetMap (подготовлены
 * скриптом prototypes/road-editor/scenes/build_scene.py). Улицы становятся
 * звеньями (узлы — реальные перекрёстки, клетка вдоль звена — его длина,
 * делённая на целое число клеток). Каждый дом, стоящий фасадом на улице,
 * превращается в участок сетки этой улицы: колонки по ширине фасада,
 * глубина по реальной (до 4 клеток), этажность из OSM. Дом, заходящий за
 * тупой угол, становится угловым участком с добавкой вдоль соседней улицы,
 * у острого угла участок становится угловым сам. Дворовые постройки (без
 * фасада на улицу) пропускаются. Реальные контуры видны бледным фоном.
 */
var ghost=[];
function fitView(){
var xs=[],ys=[];Object.keys(nodes).forEach(function(n){xs.push(nodes[n].x);ys.push(nodes[n].y)});if(!xs.length)return;
exits.forEach(function(x){if(!nodes[x.node])return;var q=add([nodes[x.node].x,nodes[x.node].y],mul(exitDir(x),W*6));xs.push(q[0]);ys.push(q[1])}); // место под знак и подпись выезда
var x0=Math.min.apply(null,xs),x1=Math.max.apply(null,xs),y0=Math.min.apply(null,ys),y1=Math.max.apply(null,ys);
vbox();view.k=Math.min(VW/(x1-x0+160),VH/(y1-y0+160));view.tx=VW/2-(x0+x1)/2*view.k;view.ty=VH/2-(y0+y1)/2*view.k;applyView();
}
function importBuildings(list){
var placed=0,skipped=0,courtyard=0;
list=list.slice().sort(function(a,b){return area(b.p)-area(a.p)});
list.forEach(function(b){
var bb=bbox(b.p),best=null;
for(var k in G.hs){var S=G.hs[k];if(!S.nC)continue;
var K=S.ends.a.K,uv=b.p.map(function(q){var v=sub(q,K);return [dot(v,S.d),dot(v,S.n)]});
var vmin=Math.min.apply(null,uv.map(function(x){return x[1]}));
if(vmin<-16||vmin>16)continue; // фасад — у кромки улицы (±4 м)
var front=0;
for(var i=0;i<uv.length;i++){var a=uv[i],c=uv[(i+1)%uv.length];
if(Math.max(a[1],c[1])>vmin+8)continue;var du=Math.abs(c[0]-a[0]),dv=Math.abs(c[1]-a[1]);if(du<3*dv)continue;
front+=Math.max(0,Math.min(S.E,Math.max(a[0],c[0]))-Math.max(0,Math.min(a[0],c[0])));}
if(front<8)continue;
if(!best||front>best.front)best={k:k,S:S,uv:uv,front:front,vmin:vmin};}
if(!best){courtyard++;return}
var S=best.S,us=best.uv.map(function(x){return x[0]}),vs=best.uv.map(function(x){return x[1]});
var u0=Math.max(0,Math.min.apply(null,us)),u1=Math.min(S.E,Math.max.apply(null,us));
var depth=Math.max.apply(null,vs)-Math.max(0,best.vmin);
var j1=Math.max(0,Math.min(D-1,Math.round(depth/s)-1));
var k0=Math.max(0,Math.min(S.nC-1,Math.round((u0-S.a0)/S.cw))),k1=Math.max(k0,Math.min(S.nC-1,Math.round((u1-S.a0)/S.cw)-1));
var ext=null;
['a','b'].forEach(function(e){var en=S.ends[e];if(ext||!isObtuse(en.corner))return;
if(e==='a'?u0>2*S.cw:u1<S.E-2*S.cw)return;
var o=otherFrame(en),ou=b.p.map(function(q){return dot(sub(q,en.K),o.d)}),ov=b.p.map(function(q){return dot(sub(q,en.K),o.n)});
var mu=Math.max.apply(null,ou),pt=o.off<-1e-6?o.off+o.cw:0;
if(Math.min.apply(null,ov)<16&&mu>pt+o.cw*0.7){var n=Math.max(1,Math.round((mu-pt)/o.cw));
n=Math.min(n,o.nC-(o.off<-1e-6?1:0));if(n>=1){ext={end:e,n:n};if(e==='a')k0=0;else k1=S.nC-1;}}});
var base={key:best.k,k0:k0,k1:k1,j1:j1,ext:ext,floors:b.lv||4};
// варианты: как есть, без добавки за угол, мельче, уже — первый допустимый
var vars=[base];
if(ext)vars.push(Object.assign({},base,{ext:null,k0:ext.end==='a'?Math.max(0,Math.round((u0-S.a0)/S.cw)):k0,k1:ext.end==='b'?Math.min(S.nC-1,Math.round((u1-S.a0)/S.cw)-1):k1}));
vars.slice().forEach(function(v){for(var jj=v.j1-1;jj>=0;jj--)vars.push(Object.assign({},v,{j1:jj}))});
vars.slice().forEach(function(v){if(v.k1>v.k0){vars.push(Object.assign({},v,{k0:v.k0+1}));vars.push(Object.assign({},v,{k1:v.k1-1}))}});
for(var vi=0;vi<vars.length;vi++){var l=vars[vi];if(l.k1<l.k0)continue;if(!check(l,null)){l.color=nextColor();l.ghost=b;lots.push(l);placed++;return}}
skipped++;
});
return {placed:placed,skipped:skipped,courtyard:courtyard};
}
function loadScene(sc){
nodes={};segs={};lots=[];exits=[];nid=1;sid=1;colorN=0;W=sc.roadHalfWidth||W0;SW=0;
var map=sc.nodes.map(function(q){var n=nid++;nodes[n]={x:q[0],y:q[1]};return n});
sc.segs.forEach(function(e){var A=sc.nodes[e[0]],B=sc.nodes[e[1]],L=len(sub(B,A));
segs[sid++]={a:map[e[0]],b:map[e[1]],ph:0,cw:L/Math.max(1,Math.round(L/s))};});
ghost=sc.buildings.map(function(b){var p=[];for(var i=0;i<b[0].length;i+=2)p.push([b[0][i],b[0][i+1]]);return {p:p,lv:b[1]}});
derive();
var st=importBuildings(ghost);
if(sc.segNames)setupDistrict(sc);
fitView();drawStatic();drawStats();
stEl.textContent=sc.name+'. Домов OSM: '+ghost.length+', поставлено участков: '+st.placed+', дворовых (без фасада на улицу): '+st.courtyard+', не вписалось: '+st.skipped+'. Данные '+sc.attribution+'.';
if(V3.on){fit3();build3D()}
return st;
}
/*
 * Дорчол для симуляции жизни: типы домов по улицам и выезды во внешний мир.
 *   - магазины, кафе (коммерческие) — на площадях и торговых улицах (Студентски
 *     трг, Трг републике, Васе Чарапића, Узун Миркова, Краља Петра, Кнегиње
 *     Љубице) и в каждом втором угловом доме остальных улиц;
 *   - рабочие места (офисы, учреждения) — вдоль больших улиц Цара Душана и
 *     Француска (два дома из трёх) и самые большие дома района;
 *   - остальное — жильё.
 * Выезды — в четырёх углах района, где большие улицы уходят в город: короткая
 * дорога наружу от угла (по биссектрисе от центра района) и выезд на её конце.
 * Тротуары — 2.5 м (улица 16 м: 11 м проезжая часть).
 */
var DISTRICT={sidewalk:10,
  shop:['Студентски трг','Трг републике','Васе Чарапића','Узун Миркова','Краља Петра','Кнегиње Љубице'],
  work:['Цара Душана','Француска'],
  exits:[{at:[-349,-522],name:'Дунав (север)'},{at:[-465,5],name:'Центр, Кнез Михаилова (запад)'},
    {at:[53,522],name:'Трг Републике (юг)'},{at:[465,132],name:'Палилула (восток)'}]};
function setupDistrict(sc){
SW=DISTRICT.sidewalk;
var names={};sc.segNames.forEach(function(nm,i){names[i+1]=nm});
// выезды: от угла наружу — 4 клетки, как продолжение города
var cx=0,cy=0,nn=Object.keys(nodes);nn.forEach(function(n){cx+=nodes[n].x/nn.length;cy+=nodes[n].y/nn.length});
captureLots();
DISTRICT.exits.forEach(function(x){
  var best=null,bd=Infinity;nn.forEach(function(n){var d=Math.hypot(nodes[n].x-x.at[0]*4,nodes[n].y-x.at[1]*4);if(d<bd){bd=d;best=+n}});
  var P=[nodes[best].x,nodes[best].y],d=nrm(sub(P,[cx,cy])),Q=add(P,mul(d,4*s));
  var m=nid++;nodes[m]={x:Q[0],y:Q[1]};segs[sid++]={a:best,b:m};x.node=m;});
remapLots();derive();
DISTRICT.exits.forEach(function(x){addExit(x.node,x.name)});
// заведения из OpenStreetMap (кафе, магазины, банки, офисы...): каждое — в здание, где оно
// стоит; здание без фасада на улицу (во дворе) — ближайший дом с фасадом (до 25 м)
var P=JSON.parse(el('pois-dorcol').textContent).pois,k={res:0,com:0,work:0,pois:0,lost:0};
lots.forEach(function(l){l.pois=[]});
var inP=function(q,poly){var c=false;for(var i=0,j=poly.length-1;i<poly.length;j=i++){var a=poly[i],b=poly[j];if((a[1]>q[1])!==(b[1]>q[1])&&q[0]<(b[0]-a[0])*(q[1]-a[1])/(b[1]-a[1])+a[0])c=!c}return c};
P.forEach(function(p){var q=[p.x,p.y],host=null;
  lots.forEach(function(l){if(!host&&l.ghost&&inP(q,l.ghost.p))host=l});
  if(!host){var bd=100;lots.forEach(function(l){shape(l).parts.forEach(function(pp){var c=partsCenter([pp]),d=len(sub(c,q));if(d<bd){bd=d;host=l}})})}
  if(!host){k.lost++;return}host.pois.push(p);k.pois++;});
// жильё: этажи над первым, если внизу заведения; в учреждениях (школа, гостиница...) не живут
lots.forEach(function(l){var fl=l.floors||1,whole=l.pois.some(function(p){return p.whole});
  l.resFloors=whole?0:Math.max(0,fl-(l.pois.length?1:0));
  var eat=l.pois.some(function(p){return p.kind!=='work'});
  var ty=l.resFloors>0?'res':(eat?'com':'work');l.type=ty;l.color=nextColor(ty);k[ty]++;});
drawStatic();drawStats();
return k;
}
el('b-bg').addEventListener('click',function(){loadScene(JSON.parse(el('scene-dorcol').textContent))});

// ---------- деревня ----------
/*
 * Базовая деревня на 100 жителей: перекрёсток главной улицы и поперечной,
 * все дома в один этаж. У перекрёстка — коммерческие дома (лавки), на
 * восточном конце главной улицы — рабочие (мастерские, склады), остальное —
 * жилые дома с промежутками-огородами. Жилые дома ставятся от центра наружу,
 * пока жителей не станет ровно VILLAGE.residents: последний дом уменьшается до
 * нужной вместимости, лишние не строятся. Раскладка детерминирована (seed).
 */
var VILLAGE={residents:100,seed:11,main:30,cross:20,comR:5,workX:18};
function buildVillage(){
var V=VILLAGE;
nodes={};segs={};lots=[];exits=[];nid=1;sid=1;colorN=0;W=VILLAGE_W;SW=VILLAGE_SW;ghost=[];
function nd(x,y){var n=nid++;nodes[n]={x:x,y:y};return n}
function sg(a,b){segs[sid++]={a:a,b:b}}
var c=nd(0,0),east=nd(V.main*s,0);
sg(nd(-V.main*s,0),c);sg(c,east);addExit(east,'Шоссе');sg(nd(0,-V.cross*s),c);sg(c,nd(0,V.cross*s));
derive();
var rnd=seeded(V.seed),res=[];
// зона по месту на улице: у перекрёстка — коммерция, на востоке — работа
function zoneAt(P){if(len(P)<V.comR*s)return 'com';if(P[0]>V.workX*s&&Math.abs(P[1])<6*s)return 'work';return 'res'}
Object.keys(G.hs).sort().forEach(function(k){
var S=G.hs[k];
for(var i=0;i<S.nC;){
var mid=add(S.ends.a.K,mul(S.d,S.a0+(i+1)*S.cw)),z=zoneAt(mid),w,d,gap;
if(z==='com'){w=3;d=3;gap=1}
else if(z==='work'){w=5;d=4;gap=1}
else{w=3+(rnd()<0.35?1:0);d=rnd()<0.6?3:2;gap=1+(rnd()<0.4?1:0)}
var l={key:k,k0:i,k1:i+w-1,j1:d-1,ext:null,floors:1,type:z};
if(l.k1>S.nC-1)break;
if(check(l,null)){i++;continue}
l.color=nextColor(z);lots.push(l);if(z==='res')res.push(l);
i=l.k1+1+gap;
}
});
// жилые — от центра наружу, ровно V.residents жителей
res.sort(function(a,b){return len(partsCenter(shape(a).parts))-len(partsCenter(shape(b).parts))});
var left=V.residents,keep={};
res.forEach(function(l){
if(left<=0)return;
var cap=capOf(l);
if(cap>left){
// уменьшить до нужной вместимости: уже или мельче, от той же клетки у улицы
var best=null;
for(var w=l.k1-l.k0+1;w>=1;w--)for(var j=l.j1;j>=0;j--){var v=Object.assign({},l,{k1:l.k0+w-1,j1:j});
var cv=capOf(v);if(cv<=left&&!check(v,l)&&(!best||cv>best.c))best={v:v,c:cv};}
if(!best)return;
l.k1=best.v.k1;l.j1=best.v.j1;cap=best.c;
}
left-=cap;keep[lots.indexOf(l)]=1;
});
lots=lots.filter(function(l,i){return l.type!=='res'||keep[i]});
fitView();drawStatic();idle();
stEl.textContent='Деревня: '+lots.length+' домов в один этаж, жителей '+totals().res+'.';
if(V3.on){fit3();build3D()}
}
el('b-vil').addEventListener('click',buildVillage);

/*
 * Маленькая деревня на 10 жителей для симуляции жизни: у каждого свой домик
 * (1×2 клетки — ровно 1 житель), главная улица с двумя перекрёстками,
 * переулок на севере замыкает квартал. Работы и магазинов в деревне меньше,
 * чем нужно: одна лавка (2 работника) и одна мастерская (2 работника) — за
 * остальным жители ездят во внешний мир через ворота на востоке.
 * Раскладка ручная: дом ставится в клетку у улицы по мировой точке (в клетках).
 */
// улицы деревень — 14 м: тротуар 2 м, парковка, две полосы, парковка, тротуар 2 м
var VILLAGE_W=28,VILLAGE_SW=8;
function buildHamlet(){
nodes={};segs={};lots=[];exits=[];nid=1;sid=1;colorN=0;W=VILLAGE_W;SW=VILLAGE_SW;ghost=[];
function nd(x,y){var n=nid++;nodes[n]={x:x*s,y:y*s};return n}
function sg(a,b){segs[sid++]={a:a,b:b}}
var w=nd(-24,0),c1=nd(-8,0),c2=nd(8,0),e=nd(24,0),n1=nd(-8,-10),s1=nd(-8,10),n2=nd(8,-10),s2=nd(8,10);
sg(w,c1);sg(c1,c2);sg(c2,e);sg(n1,c1);sg(c1,s1);sg(n2,c2);sg(c2,s2);sg(n1,n2);
addExit(e,'Город');
derive();
// дом: клетка у улицы в точке (x, y) в клетках, ширина w колонок, глубина d
// координаты даны для улицы в 2 клетки шириной (W = 16): от оси отодвигаем на столько, на сколько улица шире
function put(x,y,w,d,type){var P=[x*s,y*s],bs=null,bd=Infinity;
Object.keys(segs).forEach(function(id){var E=segEnds(segs[id]),dd=segDist(P,E[0],E[1]);if(dd<bd){bd=dd;bs=E}});
var tt=nrm(sub(bs[1],bs[0])),nn=[-tt[1],tt[0]],sd=dot(sub(P,bs[0]),nn)>0?1:-1;P=add(P,mul(nn,sd*(W-16)));
var h=hitCell(P);if(!h)throw new Error('нет клетки в '+x+','+y);
var l={key:h.key,k0:h.k,k1:h.k+w-1,j1:d-1,ext:null,floors:1,type:type};
if(check(l,null)){l.k0=h.k-w+1;l.k1=h.k}           // колонки идут в другую сторону
var why=check(l,null);if(why)throw new Error('дом в '+x+','+y+': '+why);
l.color=nextColor(type);lots.push(l);}
// 10 домиков
[[-20.5,-1.5],[-16.5,-1.5],[-12.5,-1.5],[-20.5,1.5],[-16.5,1.5],[-12.5,1.5]].forEach(function(p){put(p[0],p[1],1,2,'res')});
put(-9.5,4.5,1,2,'res');put(-9.5,7.5,1,2,'res');put(9.5,5.5,1,2,'res');put(0.5,-11.5,1,2,'res');
put(-0.5,-1.5,2,2,'com');   // лавка: 2 работника, 4 покупателя одновременно
put(15.5,1.5,2,4,'work');   // мастерская у выезда: 2 работника
fitView();drawStatic();idle();
stEl.textContent='Деревня 10: '+lots.length+' домов, жителей '+totals().res+', рабочих мест '+(totals().com+totals().work)+'.';
if(V3.on){fit3();build3D()}
}
el('b-vil10').addEventListener('click',buildHamlet);

// ---------- выезды во внешний мир ----------
/*
 * Выезд — мета-объект на конце дороги (в тупике): точка, где дорога уходит
 * во внешний мир. Это не дом и не участок: у выезда есть название и
 * производные свойства — какие дома связаны с ним по дорогам (жители,
 * рабочие места). Через выезд жители смогут ездить наружу, а снаружи —
 * приезжать работать и за покупками (когда появится симуляция).
 * Хранится как {id, node, name}. Выезд стоит только в тупике (у узла одна
 * дорога); если к узлу пристроили дорогу — выезд невалиден (красный), если
 * узел удалён — выезд удаляется вместе с ним.
 */
var exitId=1;
function degree(n){var d=0;for(var id in segs)if(segs[id].a===n||segs[id].b===n)d++;return d}
function exitValid(x){return !!nodes[x.node]&&degree(x.node)===1}
// направление наружу: от соседнего узла через тупик
function exitDir(x){for(var id in segs){var g=segs[id];if(g.a===x.node||g.b===x.node){var o=g.a===x.node?g.b:g.a;return nrm([nodes[x.node].x-nodes[o].x,nodes[x.node].y-nodes[o].y])}}return [1,0]}
function addExit(n,name){var x={id:exitId++,node:n,name:name||'Внешний мир'};exits.push(x);return x}
// связность: компоненты дорожного графа; дом связан с внешним миром, если его
// улица в одной компоненте с каким-то валидным выездом
function components(){var par={};function f(a){while(par[a]!==a){par[a]=par[par[a]];a=par[a]}return a}
Object.keys(nodes).forEach(function(n){par[n]=n});
for(var id in segs){var a=f(String(segs[id].a)),b=f(String(segs[id].b));if(a!==b)par[a]=b}
return function(n){return par[String(n)]===undefined?null:f(String(n))}}
function lotSeg(l){
if(l.key!=='fixed'){var id=+l.key.split(':')[0];if(segs[id])return id}
var c=partsCenter(shape(l).parts),best=null,bd=Infinity;
for(var sid2 in segs){var E=segEnds(segs[sid2]),d=segDist(c,E[0],E[1]);if(d<bd){bd=d;best=+sid2}}return best}
// для каждого дома — номер компоненты; для каждого выезда — что с ним связано
function exitLinks(){
var comp=components(),ok={},res={byExit:{},unlinked:{n:0,res:0,jobs:0},unlinkedLots:[]};
exits.forEach(function(x){if(exitValid(x)){var c=comp(x.node);ok[c]=true;res.byExit[x.id]={c:c,n:0,res:0,jobs:0}}});
lots.forEach(function(l){if(check(l,l))return;var g=lotSeg(l);if(g===null)return;var c=comp(segs[g].a),cap=capOf(l),isRes=typeOf(l)==='res';
if(!ok[c]){res.unlinked.n++;res.unlinkedLots.push(l);if(isRes)res.unlinked.res+=cap;else res.unlinked.jobs+=cap;return}
exits.forEach(function(x){var b=res.byExit[x.id];if(b&&b.c===c){b.n++;if(isRes)b.res+=cap;else b.jobs+=cap}})});
return res;
}
function exitAt(P){for(var i=0;i<exits.length;i++){var x=exits[i];if(!nodes[x.node])continue;var C=[nodes[x.node].x,nodes[x.node].y],d=exitDir(x);
if(len(sub(P,C))<W*1.5||len(sub(P,add(C,mul(d,W*1.6))))<W*1.3)return x}return null}
function drawExits(){
var out='',many=exits.length>6;
exits.forEach(function(x){if(!nodes[x.node])return;
var C=[nodes[x.node].x,nodes[x.node].y],d=exitDir(x),n=[-d[1],d[0]],ok=exitValid(x),col=ok?'#2f6f8f':'#D9363E',r=W*0.95,M=add(C,mul(d,W*1.6));
// знак: круг за концом дороги со стрелкой наружу
var tip=add(M,mul(d,r*0.6)),b1=add(add(M,mul(d,-r*0.45)),mul(n,r*0.45)),b2=add(add(M,mul(d,-r*0.45)),mul(n,-r*0.45));
out+='<g style="pointer-events:none"><line x1="'+C[0].toFixed(1)+'" y1="'+C[1].toFixed(1)+'" x2="'+M[0].toFixed(1)+'" y2="'+M[1].toFixed(1)+'" stroke="'+col+'" stroke-width="'+(W*0.5)+'" stroke-dasharray="'+(W*0.35)+' '+(W*0.25)+'"/>';
out+='<circle class="ns" cx="'+M[0].toFixed(1)+'" cy="'+M[1].toFixed(1)+'" r="'+r+'" fill="'+col+'" stroke="#fff" stroke-width="2"/>';
out+='<polygon points="'+pts([tip,b1,b2])+'" fill="#fff"/>';
if(!many||view.k>0.9){var L=add(M,mul(d,r+4/view.k)),anc=Math.abs(d[0])>0.5?(d[0]>0?'start':'end'):'middle',dy=Math.abs(d[0])>0.5?0:(d[1]>0?0.9:-0.3);
out+='<text x="'+L[0].toFixed(1)+'" y="'+L[1].toFixed(1)+'" dy="'+dy+'em" font-size="'+(12/view.k).toFixed(1)+'" text-anchor="'+anc+'" dominant-baseline="central" fill="'+col+'" style="font-weight:600;paint-order:stroke;stroke:#fff;stroke-width:3px">'+x.name.replace(/[<&]/g,'')+'</text>';}
out+='</g>';});
el('exits').innerHTML=out;
}
var xdlg=el('xdlg'),xdlgN=el('xdlg-n'),xdlgX=null;
function openXdlg(x){
xdlgX=x;xdlgN.value=x.name;
var L=exitLinks().byExit[x.id],info=!exitValid(x)?'Выезд должен стоять в тупике — к этому узлу подходит больше одной дороги.':
(L&&L.n?'Связано по дорогам: домов '+L.n+', жителей '+L.res+', рабочих мест '+L.jobs+'.':'С этим выездом не связан ни один дом.');
el('xdlg-info').textContent=info;
xdlg.hidden=false;setTimeout(function(){xdlgN.focus();xdlgN.select()},0);
}
function closeXdlg(){xdlg.hidden=true;xdlgX=null;drawExits();idle();if(V3.on)build3D();}
el('xdlg-ok').addEventListener('click',function(){xdlgX.name=xdlgN.value.trim()||'Внешний мир';closeXdlg()});
el('xdlg-no').addEventListener('click',closeXdlg);
el('xdlg-del').addEventListener('click',function(){exits=exits.filter(function(x){return x!==xdlgX});closeXdlg()});
xdlgN.addEventListener('keydown',function(e){if(e.key==='Enter')el('xdlg-ok').click();if(e.key==='Escape')closeXdlg();});
xdlg.addEventListener('pointerdown',function(e){if(e.target===xdlg)closeXdlg();});
// тап в режиме «Выезд»: по выезду — открыть, по тупику — поставить новый
function exitTap(P){
var x=exitAt(P);if(x){openXdlg(x);return}
var best=null,bd=W*1.5;for(var n in nodes){var dd=len(sub(P,[nodes[n].x,nodes[n].y]));if(dd<bd){bd=dd;best=+n}}
if(best===null){stEl.textContent='Нажмите на конец дороги (тупик) — там появится выезд во внешний мир.';return}
if(degree(best)!==1){stEl.textContent='Нельзя — выезд ставится только в тупике, на конце дороги.';return}
openXdlg(addExit(best));drawExits();
}

// ---------- экспорт для симуляции ----------
/*
 * Снимок мира для симуляции жизни (prototypes/life-sim): только то, что ей
 * нужно, без геометрии участков. Координаты и длины — в метрах (клетка 4 м).
 *   nodes     — [x, y] узлов дорог;
 *   edges     — {a, b, length} звенья (индексы узлов);
 *   buildings — дом: тип, этажи, площадь в клетках, вместимость и точка
 *               примыкания к дороге: звено edge и доля t от его узла a
 *               (проекция середины фасада на ось звена); контур outline и
 *               стиль style — только для отрисовки;
 *   gates     — выезды во внешний мир: узел и название;
 *   render    — только для отрисовки: клетка, полуширина дороги, клетки зон.
 * Невалидные дома и дома без улицы не попадают.
 */
function exportSim(){
var M=4/s,ni={},nl=[],ei={},el=[];
function r2(v){return Math.round(v*100)/100}
Object.keys(nodes).forEach(function(n,i){ni[n]=i;nl.push([r2(nodes[n].x*M),r2(nodes[n].y*M)])});
Object.keys(segs).forEach(function(id,i){ei[id]=i;var g=segs[id],E=segEnds(g);el.push({a:ni[g.a],b:ni[g.b],length:r2(len(sub(E[1],E[0]))*M)})});
var bl=[];
lots.forEach(function(l){
if(check(l,l))return;var g=lotSeg(l);if(g===null)return;
var E=segEnds(segs[g]),A=E[0],B=E[1],AB=sub(B,A),F;
if(l.key!=='fixed'&&G.hs[l.key]){var S=G.hs[l.key],u0=Math.max(0,S.a0+l.k0*S.cw),u1=Math.min(S.E,S.a0+(l.k1+1)*S.cw);F=add(S.ends.a.K,mul(S.d,(u0+u1)/2))}
else F=partsCenter(shape(l).parts);
var tt=Math.max(0,Math.min(1,dot(sub(F,A),AB)/dot(AB,AB))),C=partsCenter(shape(l).parts);
var uo=unionOutline(shape(l).parts),ol=(uo.loop&&uo.loop.length>=3?uo.loop:shape(l).parts[0]).map(function(q){return [r2(q[0]*M),r2(q[1]*M)]});
var rec={id:bl.length,uid:l.uid,type:typeOf(l),floors:l.floors||1,cells:cellsOf(l),capacity:capOf(l),edge:ei[g],t:Math.round(tt*1000)/1000,center:[r2(C[0]*M),r2(C[1]*M)],outline:ol,style:styleOf(l)};
// смешанное назначение: жильё + заведения (вид, подпись, название, работники, посетители, часы)
if(H&&H.exportLot&&H.exportLot(l,rec)===false)return;
if(l.pois)rec.uses={beds:lotCaps(l).res,places:l.pois.map(function(p){return {kind:p.kind,cat:p.cat,name:p.name,jobs:p.jobs,visitors:p.visitors,hours:p.hours}})};
bl.push(rec);
});
var gl=exits.filter(exitValid).map(function(x,i){return {id:i,node:ni[x.node],name:x.name}});
// render — только для отрисовки (тот же вид, что в редакторе), симуляция его не читает
var zc=G.drawn.map(function(c){return c.poly.map(function(q){return [r2(q[0]*M),r2(q[1]*M)]})});
return {format:'city-builder/world@1',units:'m',nodes:nl,edges:el,buildings:bl,gates:gl,render:{cell:4,roadHalfWidth:r2(W*M),sidewalk:r2(SW*M),zoneCells:zc}};
}
el('b-exp').addEventListener('click',function(){
var a=document.createElement('a'),bl=new Blob([JSON.stringify(exportSim(),null,1)],{type:'application/json'});
a.href=URL.createObjectURL(bl);a.download='world.snapshot.json';document.body.appendChild(a);a.click();a.remove();
stEl.textContent='Снимок мира для симуляции сохранён: world.snapshot.json.';
});

// ---------- окно этажей ----------
var dlg=el('dlg'),dlgF=el('dlg-f'),dlgLot=null,dlgNew=false,lastFloors=1,lastType='res',dlgType='res';
// тип и вместимость в окне: вместимость пересчитывается при смене типа и этажей
function dlgFloors(){return Math.max(1,Math.min(99,Math.round(+dlgF.value||1)))}
function dlgShow(){
ZORDER.forEach(function(k){el('ty-'+k).setAttribute('aria-pressed',k===dlgType?'true':'false')});
var tmp=Object.assign({},dlgLot,{type:dlgType,floors:dlgFloors()}),c=capOf(tmp),z=ZONES[dlgType];
el('dlg-sw').style.background=z.color;
el('dlg-cap').textContent='Площадь '+cellsOf(tmp)+' кл. → '+(dlgType==='res'?'жителей: ':'рабочих мест: ')+c;
}
ZORDER.forEach(function(k){el('ty-'+k).addEventListener('click',function(){dlgType=k;dlgShow()})});
dlgF.addEventListener('input',dlgShow);
function openDlg(l,isNew){
dlgLot=l;dlgNew=isNew;dlgType=isNew?lastType:typeOf(l);
el('dlg-tt').textContent=isNew?'Новый дом':'Дом';
el('dlg-ok').textContent=isNew?'Построить':'Сохранить';
el('dlg-del').hidden=isNew;
dlgF.value=isNew?lastFloors:(l.floors||1);
dlgShow();dlg.hidden=false;setTimeout(function(){dlgF.focus();dlgF.select()},0);
}
function closeDlg(){dlg.hidden=true;dlgLot=null;drawLots();idle();if(V3.on)build3D();}
el('dlg-ok').addEventListener('click',function(){
var f=dlgFloors();lastFloors=f;lastType=dlgType;
if(typeOf(dlgLot)!==dlgType||!dlgLot.type){dlgLot.type=dlgType;dlgLot.color=nextColor(dlgType)}
dlgLot.floors=f;if(dlgNew&&lots.indexOf(dlgLot)<0&&!check(dlgLot,null))lots.push(dlgLot);closeDlg();});
el('dlg-no').addEventListener('click',closeDlg);
el('dlg-del').addEventListener('click',function(){var i=lots.indexOf(dlgLot);if(i>=0)lots.splice(i,1);closeDlg();});
dlgF.addEventListener('keydown',function(e){if(e.key==='Enter')el('dlg-ok').click();if(e.key==='Escape')closeDlg();});
dlg.addEventListener('pointerdown',function(e){if(e.target===dlg)closeDlg();});

// ---------- 3D-вид ----------
/*
 * Вид под углом, как в картах. Рисует общий модуль City3D
 * (prototypes/shared/city3d.js) — тот же, что в просмотрщике симуляции
 * жизни: здесь только описание сцены из состояния редактора. Наклон 60° или
 * 30°, карту можно двигать, приближать и вращать. Строить можно только в 2D.
 * three.js подгружается при первом входе в 3D.
 */
var V3={on:false,view:null};
var v3el=el('v3d');
function seeded(seed){var x=seed*9301+49297;return function(){x=(x*9301+49297)%233280;return x/233280}}
// улица для общего модуля: оси, узлы, ширина, тротуар, зебры (кроме выездов)
function streetDesc(){return {roadHalfWidth:W,sidewalk:SW,segments:Object.keys(segs).map(function(id){var E=segEnds(segs[id]);return {a:E[0],b:E[1]}}),
crosswalks:{unit:s/4,skip:exits.filter(function(x){return nodes[x.node]}).map(function(x){return [nodes[x.node].x,nodes[x.node].y]})}}}
function sceneDesc(){
var bl=lots.map(function(l){var S=shape(l),o=S.parts.length?unionOutline(S.parts):{};
var b={outline:o.loop&&o.loop.length>=3?o.loop:null,parts:S.parts,floors:l.floors||1,style:styleOf(l),type:typeOf(l),bad:!!check(l,l),color:l.color};if(H&&H.building3D)H.building3D(l,b);return b});
var sd=streetDesc();
return {cell:s,roadHalfWidth:W,sidewalk:SW,crosswalks:sd.crosswalks,
segments:Object.keys(segs).map(function(id){var E=segEnds(segs[id]);return {a:E[0],b:E[1]}}),
nodes:Object.keys(nodes).filter(function(n){return degree(+n)>0}).map(function(n){return [nodes[n].x,nodes[n].y]}),
zoneCells:H&&H.zoneCells3D?H.zoneCells3D():G.drawn.map(function(c){return c.poly}),buildings:bl,trees:H&&H.trees3D?H.trees3D():[],lines:H&&H.lines3D?H.lines3D():[],areas:H&&H.areas3D?H.areas3D():[],
gates:exits.filter(function(x){return nodes[x.node]}).map(function(x){return {at:[nodes[x.node].x,nodes[x.node].y],dir:exitDir(x),ok:exitValid(x)}})};
}
function build3D(){if(!V3.view)return;V3.view.setScene(sceneDesc());V3.view.render()}
function render3(){if(V3.view&&V3.on)V3.view.render()}
function fit3(){if(!V3.view)return;var xs=[],ys=[];Object.keys(nodes).forEach(function(n){xs.push(nodes[n].x);ys.push(nodes[n].y)});
V3.view.fit(xs.length?[Math.min.apply(null,xs),Math.min.apply(null,ys),Math.max.apply(null,xs),Math.max.apply(null,ys)]:null)}
/*
 * Контур объединения выпуклых частей участка: от каждого ребра части
 * отрезаются куски, лежащие внутри другой части или на общем с ней ребре
 * (шов между частями). Остаток — граница дома. Углы — точки границы, где
 * она поворачивает (там рисуются вертикальные рёбра).
 */
function unionOutline(parts){
function orient(P){var a=0;for(var i=0;i<P.length;i++){var q=P[(i+1)%P.length];a+=P[i][0]*q[1]-q[0]*P[i][1]}return a>=0?1:-1}
parts=parts.map(function(P){return orient(P)>0?P:P.slice().reverse()}); // все части в одном обходе
var ors=parts.map(orient),res=[];
// интервал параметра t отрезка a→b, лежащий в замкнутой выпуклой Q (или null)
function inside(a,b,Q,sQ,sP,dupOK){
var d=sub(b,a),t0=0,t1=1;
for(var i=0;i<Q.length;i++){var q0=Q[i],e=sub(Q[(i+1)%Q.length],q0),le=len(e);if(le<1e-9)continue;
var c0=sQ*cr(e,sub(a,q0))/le,c1=sQ*cr(e,d)/le;
if(Math.abs(c1)<1e-9){
if(c0< -1e-4)return null;
if(c0<1e-4){ // отрезок лежит на прямой ребра Q: шов, только если P и Q по разные стороны
// по одну сторону — общий внешний край: оставляем его только у одной части
var m=add(mul(add(a,b),0.5),mul([-d[1],d[0]],sP*1e-3/len(d)));if(sQ*cr(e,sub(m,q0))>0&&!dupOK)return null;}
continue;}
var tt=-(c0+1e-4)/c1;if(c1>0)t0=Math.max(t0,tt);else t1=Math.min(t1,tt);
}
return t1-t0>1e-9?[t0,t1]:null;
}
parts.forEach(function(P,pi){
for(var i=0;i<P.length;i++){var a=P[i],b=P[(i+1)%P.length];if(len(sub(b,a))<1e-6)continue;
var iv=[[0,1]];
parts.forEach(function(Q,qi){if(qi===pi)return;var rr=inside(a,b,Q,ors[qi],ors[pi],qi<pi);if(!rr)return;
var nv=[];iv.forEach(function(x){if(Math.min(x[1],rr[0])-x[0]>1e-6)nv.push([x[0],Math.min(x[1],rr[0])]);if(x[1]-Math.max(x[0],rr[1])>1e-6)nv.push([Math.max(x[0],rr[1]),x[1]])});iv=nv;});
iv.forEach(function(x){if(x[1]-x[0]>1e-4)res.push([add(a,mul(sub(b,a),x[0])),add(a,mul(sub(b,a),x[1]))])});
}});
// углы: в точке сходятся куски не на одной прямой
var pts={},corners=[];
res.forEach(function(sg){[[sg[0],sg[1]],[sg[1],sg[0]]].forEach(function(pr){var k=Math.round(pr[0][0]*100)+':'+Math.round(pr[0][1]*100);(pts[k]=pts[k]||{p:pr[0],dirs:[]}).dirs.push(nrm(sub(pr[1],pr[0])))})});
Object.keys(pts).forEach(function(k){var o=pts[k];if(o.dirs.length===2&&dot(o.dirs[0],o.dirs[1])<-0.9999)return;corners.push(o.p)});
// замкнутый контур: куски одинаково ориентированы, сцепляем конец к началу;
// крошечные обрезки (меньше 0.05) выбрасываем, а концы соседей склеиваем по
// ближайшей точке, а не по точному совпадению
res=res.filter(function(sg){return len(sub(sg[1],sg[0]))>0.05});
var key=function(q){return Math.round(q[0]*10)+':'+Math.round(q[1]*10)},byStart={};
res.forEach(function(sg,i){(byStart[key(sg[0])]=byStart[key(sg[0])]||[]).push(i)});
var loop=null;
if(res.length){var used={},cur=0,lp=[];
for(var n=0;n<res.length;n++){used[cur]=1;lp.push(res[cur][0]);var e1=res[cur][1],nx=res.map(function(sg,j){return j}).filter(function(j){return !used[j]&&len(sub(res[j][0],e1))<0.1});
if(!nx.length){if(n===res.length-1&&len(sub(res[cur][1],res[0][0]))<0.1)loop=lp;break}
nx.sort(function(x,y){return len(sub(res[x][0],e1))-len(sub(res[y][0],e1))});cur=nx[0];}
}
if(loop){ // по замкнутому контуру: убрать точки на прямой, углы — оставшиеся вершины
var L=[];loop.forEach(function(q,i){var pr=loop[(i+loop.length-1)%loop.length],nx=loop[(i+1)%loop.length];
var u=sub(q,pr),v=sub(nx,q);if(len(u)<1e-6||len(v)<1e-6)return;if(Math.abs(cr(nrm(u),nrm(v)))<1e-3&&dot(u,v)>0)return;L.push(q)});
loop=L;corners=L.slice();res=L.map(function(q,i){return [q,L[(i+1)%L.length]]});}
return {segs:res,corners:corners,loop:loop};
}
function set3D(on){
V3.on=on;
el('b-3d').setAttribute('aria-pressed',on?'true':'false');
el('g3d').hidden=!on;
sv.style.display=on?'none':'';v3el.hidden=!on;
['m-road','m-lot','m-exit','m-pan'].forEach(function(id){el(id).disabled=on});
if(!on){setMode(mode);if(H&&H.on3D)H.on3D(false);return}
if(!H)hintEl.textContent='3D-вид: тяните, чтобы двигать карту; двумя пальцами, правой кнопкой или с Shift — вращать; колесо и −/+ — масштаб. Строить — в 2D.';
City3D.loadThree(function(){var fresh=!V3.view;if(fresh)V3.view=City3D.createView(v3el,H&&H.view3DOpts?H.view3DOpts():undefined);if(fresh||!H)fit3();build3D();if(H&&H.on3D)H.on3D(true,fresh)},
function(){stEl.textContent='Не удалось загрузить 3D-библиотеку (three.js).';set3D(false);if(H&&H.on3D)H.on3D(false,false,true)});
}
el('b-3d').addEventListener('click',function(){set3D(!V3.on)});
el('r-l').addEventListener('click',function(){if(V3.view)V3.view.rotate(Math.PI/12)});
el('r-r').addEventListener('click',function(){if(V3.view)V3.view.rotate(-Math.PI/12)});
el('t-tilt').addEventListener('click',function(){if(V3.view)this.textContent='Наклон '+V3.view.toggleTilt()+'°'});

// отладка для тестов
window.__dbg={
toScreen:function(P){var pt=sv.createSVGPoint();pt.x=P[0]*view.k+view.tx;pt.y=P[1]*view.k+view.ty;var r=pt.matrixTransform(sv.getScreenCTM());return [r.x,r.y]},
clearLots:function(){lots=[];drawLots()},
lotsRaw:function(){return lots},
// внутренние функции для стресс-тестов
api:{loadScene:loadScene,loadDorcol:function(){return loadScene(JSON.parse(el('scene-dorcol').textContent))},G:function(){return G},overlaps:overlaps,unionOutline:unionOutline,otherFrame:otherFrame,hitCell:hitCell,selFrom:selFrom,check:check,shape:shape,sideUV:sideUV,frame:frame,cellF:cellF,
snap:snap,endFor:endFor,capOf:capOf,totals:totals,exportSim:exportSim,exitLinks:exitLinks,exits:function(){return exits},buildVillage:buildVillage,buildHamlet:buildHamlet,validate:validate,addRoad:addRoad,redraw:function(){drawStatic()},
reset:function(){nodes={};segs={};lots=[];exits=[];nid=1;sid=1;W=W0;SW=0;drawStatic()},setWidth:function(w,sw){W=w;SW=sw||0;drawStatic()},addLot:function(l){l.floors=l.floors||1+Math.floor(Math.random()*8);l.color=l.color||nextColor();lots.push(l)}},
// инвариант: каждый узел стоит на линии сетки каждой своей дороги
gridCheck:function(){var bad=[];Object.keys(segs).forEach(function(id){var g=segs[id],E=segEnds(g),L=len(sub(E[1],E[0])),cw=segCw(g),ph=segPh(g);
function on(u){var r=((u-ph)%cw+cw)%cw;return Math.min(r,cw-r)<0.05}
if(!on(0)||!on(L))bad.push([+id,+(L/s).toFixed(3),+cw.toFixed(3),+ph.toFixed(3)])});return bad},
uvToWorld:function(key,u,v){var S=G.hs[key];return add(S.ends.a.K,add(mul(S.d,u),mul(S.n,v)))},
state:function(){return {nodes:nodes,segs:segs,lots:lots.map(function(l){var S=shape(l);return Object.assign({bad:check(l,l),corner:!!S.corner},l)}),sides:Object.keys(G.hs).map(function(k){var h=G.hs[k];function ca(e){var c=h.ends[e].corner;return c?Math.round(c.alpha*180/Math.PI):(h.ends[e].corner===null?'-':'-')}return {key:k,E:+h.E.toFixed(1),a0:+h.a0.toFixed(1),nC:h.nC,anchor:h.anchor,a:ca('a'),b:ca('b')}})}}
};
// API для приложения-игры
window.CityEditor={
get nodes(){return nodes},get segs(){return segs},get lots(){return lots},set lots(v){lots=v},get exits(){return exits},get G(){return G},get mode(){return mode},
get W(){return W},get SW(){return SW},s:s,D:D,view:view,V3:V3,WHY:WHY,LWHY:LWHY,
geom:{add:add,sub:sub,mul:mul,dot:dot,len:len,nrm:nrm,cr:cr,area:area,pts:pts,bbox:bbox,bbHit:bbHit,overlaps:overlaps,inside:inside,segDist:segDist,partsArea:partsArea,partsCenter:partsCenter},
derive:derive,shape:shape,check:check,hitCell:hitCell,inLot:inLot,frame:frame,cellsOf:cellsOf,capOf:capOf,typeOf:typeOf,lotSvg:lotSvg,lotFill:lotFill,nextColor:nextColor,
segUnder:segUnder,removeSeg:removeSeg,addRoad:addRoad,validate:validate,snap:snap,endFor:endFor,segEnds:segEnds,lotSeg:lotSeg,components:components,degree:degree,
addExit:addExit,exitValid:exitValid,exitLinks:exitLinks,exportSim:exportSim,unionOutline:unionOutline,
input:input,drawStatic:drawStatic,drawLots:drawLots,idle:idle,setMode:setMode,applyView:applyView,zoomAt:zoomAt,set3D:set3D,build3D:build3D,fit3:fit3,worldPt:worldPt,svgPt:svgPt,
setWidth:function(w,sw){W=w;SW=sw||0},
newNode:function(x,y){var n=nid++;nodes[n]={x:x,y:y};return n},newSeg:function(a,b){segs[sid++]={a:a,b:b}},
reset:function(){nodes={};segs={};lots=[];exits=[];nid=1;sid=1;W=W0;SW=0},
load:function(st){nodes=st.nodes;segs=st.segs;lots=st.lots;exits=st.exits;nid=st.nid;sid=st.sid;exitId=st.exitId||1;lotUid=st.lotUid||1},
dump:function(){return {nodes:nodes,segs:segs,lots:lots.map(function(l){var o={};for(var k in l)if(k!=='fixed'||l.key==='fixed')o[k]=l[k];return o}),exits:exits,nid:nid,sid:sid,exitId:exitId,lotUid:lotUid}}
};
if(H&&H.init)H.init(window.CityEditor);
else{setMode('road');buildHamlet();}
})();
