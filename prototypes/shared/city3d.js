/*
 * City3D — общий 3D-вид города для всех прототипов (редактор дорог,
 * просмотрщик симуляции жизни). Один и тот же код рисует землю, дороги,
 * процедурные дома, выезды и жителей, и одинаково управляет камерой.
 *
 * Обычный скрипт без модулей: задаёт глобальный объект City3D. Нужен
 * three.js r128 (глобальный THREE) — City3D.loadThree() подгружает его с
 * cdnjs. Единицы — как в редакторе: клетка = 16 единиц (4 м), этаж = клетка.
 *
 * Описание сцены (setScene):
 *   roadHalfWidth  — полуширина дороги;
 *   segments       — [{a:[x,y], b:[x,y]}] оси звеньев; полосы дорог и
 *                    «пятачки» узлов строятся здесь же;
 *   nodes          — [[x,y]] узлы (пятачки);
 *   zoneCells      — [многоугольник] клетки зонирования (необязательно);
 *   buildings      — [{outline, parts?, floors, style, type, bad?, color?}]:
 *                    outline — контур дома (если нет — простые призмы по parts);
 *                    style — индекс в City3D.STYLES; type — res / com / work;
 *   gates          — [{at:[x,y], dir:[dx,dy], ok}] выезды во внешний мир;
 *   areas          — [{poly, color, label}] плоские площадки (например, «Город»).
 * Жители — setMarkers([{x, y, z, color, label, car, heading, selected}]).
 */
(function(){
'use strict';
var STYLES=[
{name:'охра',wall:'#D6B36A',trim:'#F1EADB',plinth:'#B89A6A',roof:'#2F4B3F',roofType:'mansard',arch:true},
{name:'кремовый сталинский',wall:'#E2D2BA',trim:'#F5EFE4',plinth:'#8F6A5A',roof:'#3A4048',roofType:'mansard',arch:false},
{name:'оливковый',wall:'#C6CB9C',trim:'#ECEADB',plinth:'#A2A682',roof:'#4D535A',roofType:'mansard',arch:false},
{name:'серо-сиреневый',wall:'#A7AAC2',trim:'#CDCFDD',plinth:'#8A8DA6',roof:'#6C6F84',roofType:'flat',arch:false},
{name:'красно-белый',wall:'#B5533F',trim:'#EEE6D8',plinth:'#E2D8C8',roof:'#3D6A56',roofType:'mansard',arch:true},
{name:'терракотовый',wall:'#D58B7B',trim:'#F2E8DE',plinth:'#C4AC93',roof:'#7A3D35',roofType:'mansard',arch:true},
{name:'светло-серый',wall:'#CEC8BE',trim:'#E8E3DA',plinth:'#9B948A',roof:'#5D6066',roofType:'flat',arch:false},
{name:'бежевый кирпич',wall:'#C7A07C',trim:'#EADDC9',plinth:'#8A6C56',roof:'#4E4846',roofType:'mansard',arch:false}];
// цвета карты — общие для 2D и 3D во всех прототипах
var COLORS={ground:'#E6E0CC',sky:'#DFE7EA',road:'#5A5F66',roadLine:'#F2F2F2',zoneCell:'#9ED38F',zoneCell3D:'#B5D8A4',
  zone:{res:'#3F8F4E',com:'#3D7DC8',work:'#D49A22'},gate:'#2F6F8F',bad:'#D9363E',area:'#D6DAE0',areaEdge:'#8A93A0'};
// стили домов по типу: из них выбирает редактор, по ним же красит симуляция
var ZONE_STYLES={res:[0,5,7,1,2,4],com:[6],work:[3]};
function shade(hex,f){var n=parseInt(hex.slice(1),16),c=[n>>16,(n>>8)&255,n&255].map(function(v){return Math.round(f<0?v*(1+f):v+(255-v)*f)});return '#'+c.map(function(v){return ('0'+v.toString(16)).slice(-2)}).join('')}
// цвет дома в 2D: цвет типа, оттенок свой у каждого дома (k — любое целое)
function lotFill(type,k){return shade(COLORS.zone[type]||COLORS.zone.res,(((k%5)+5)%5-2)*0.06)}

function add(a,b){return [a[0]+b[0],a[1]+b[1]]}function sub(a,b){return [a[0]-b[0],a[1]-b[1]]}function mul(a,k){return [a[0]*k,a[1]*k]}
function dot(a,b){return a[0]*b[0]+a[1]*b[1]}function len(a){return Math.hypot(a[0],a[1])}function nrm(a){var l=len(a);return [a[0]/l,a[1]/l]}
function cr(a,b){return a[0]*b[1]-a[1]*b[0]}
function segDist(p,a,b){var ab=sub(b,a),l2=dot(ab,ab),t=l2?Math.max(0,Math.min(1,dot(sub(p,a),ab)/l2)):0;return len(sub(p,add(a,mul(ab,t))))}
function bbox(P){var b=[Infinity,Infinity,-Infinity,-Infinity];P.forEach(function(q){if(q[0]<b[0])b[0]=q[0];if(q[1]<b[1])b[1]=q[1];if(q[0]>b[2])b[2]=q[0];if(q[1]>b[3])b[3]=q[1]});return b}
function bbHit(a,b,m){m=m||0;return a[0]<=b[2]+m&&b[0]<=a[2]+m&&a[1]<=b[3]+m&&b[1]<=a[3]+m}
function signedArea(P){var a=0;for(var i=0;i<P.length;i++){var q=P[(i+1)%P.length];a+=P[i][0]*q[1]-q[0]*P[i][1]}return a/2}
// сдвиг контура наружу (d>0) или внутрь (d<0) со скосом углов
function offsetPoly(P,d){
var sg=signedArea(P)>0?1:-1,out=[];
for(var i=0;i<P.length;i++){var pr=P[(i+P.length-1)%P.length],cu=P[i],nx=P[(i+1)%P.length];
var e1=nrm(sub(cu,pr)),e2=nrm(sub(nx,cu)),n1=mul([e1[1],-e1[0]],sg),n2=mul([e2[1],-e2[0]],sg),m=add(n1,n2),lm=len(m);
m=lm<1e-6?n1:mul(m,1/lm);var k=Math.max(0.35,dot(m,n1));out.push(add(cu,mul(m,d/k)));}
return out;
}
function seeded(seed){var x=seed*9301+49297;return function(){x=(x*9301+49297)%233280;return x/233280}}

function loadThree(cb,onError){
if(window.THREE)return cb();
var sc=document.createElement('script');sc.src='https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
sc.onload=cb;sc.onerror=function(){if(onError)onError()};document.head.appendChild(sc);
}

// ---------- окна: процедурные текстуры фасада по стилю ----------
var GLASS='#3F4D66',GLASS2='#5C6E8C',LIT='#F3E2A6',texCache={};
function facadeTex(si,kind,R){
var key=si+kind;if(texCache[key])return texCache[key];
var st=STYLES[si],B=64,F=64,rows=kind==='up'?4:1,cv=document.createElement('canvas');cv.width=B*4;cv.height=F*rows;
var g=cv.getContext('2d'),rnd=seeded(si*7+(kind==='up'?1:2));
g.fillStyle=kind==='up'?st.wall:st.plinth;g.fillRect(0,0,cv.width,cv.height);
function win(x,y,w,h,lit,arch){
g.fillStyle=st.trim;g.beginPath();
if(arch){g.moveTo(x-3,y+h+2);g.lineTo(x-3,y+w/2);g.arc(x+w/2,y+w/2,w/2+3,Math.PI,0);g.lineTo(x+w+3,y+h+2);}else g.rect(x-3,y-3,w+6,h+5);
g.fill();
var gr=g.createLinearGradient(0,y,0,y+h);gr.addColorStop(0,lit?LIT:GLASS2);gr.addColorStop(1,lit?'#E8C979':GLASS);g.fillStyle=gr;g.beginPath();
if(arch){g.moveTo(x,y+h);g.lineTo(x,y+w/2);g.arc(x+w/2,y+w/2,w/2,Math.PI,0);g.lineTo(x+w,y+h);}else g.rect(x,y,w,h);
g.fill();
g.fillStyle=st.trim;g.fillRect(x+w/2-1,y+(arch?w/2:0),2,h-(arch?w/2:0)); // переплёт
g.fillRect(x-5,y+h+1,w+10,3); // подоконник
}
for(var f=0;f<rows;f++)for(var b=0;b<4;b++){var x0=b*B,y0=f*F;
if(kind==='up'){
g.fillStyle='rgba(0,0,0,0.06)';g.fillRect(x0,y0,B,2); // межэтажная тяга
win(x0+B*0.3,y0+F*0.22,B*0.4,F*0.56,rnd()<0.12,st.arch);
}else{
g.fillStyle='rgba(0,0,0,0.12)';for(var k=1;k<4;k++)g.fillRect(x0,y0+F*k/4,B,1); // руст
if(b===1){g.fillStyle=st.trim;g.fillRect(x0+B*0.3,y0+F*0.22,B*0.4,F*0.78);g.fillStyle='#5A4636';g.fillRect(x0+B*0.34,y0+F*0.28,B*0.32,F*0.72);} // дверь
else win(x0+B*0.16,y0+F*0.24,B*0.68,F*0.56,rnd()<0.3,false); // витрина
}}
var tx=new THREE.CanvasTexture(cv);tx.wrapS=tx.wrapT=THREE.RepeatWrapping;tx.encoding=THREE.sRGBEncoding;
tx.anisotropy=R?R.capabilities.getMaxAnisotropy():1;texCache[key]=tx;return tx;
}
function flatGeo(polys,yy){ // плоские выпуклые многоугольники в одну геометрию (веером)
var T=THREE,pos=[];
polys.forEach(function(p){for(var i=1;i<p.length-1;i++)[p[0],p[i],p[i+1]].forEach(function(q){pos.push(q[0],yy,q[1])})});
var g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.computeVertexNormals();return g;
}
// полосы дорог: прямоугольник вдоль каждого звена и восьмиугольник в каждом узле
function roadBands(desc){
var W=desc.roadHalfWidth,bands=[];
(desc.segments||[]).forEach(function(sg){var A=sg.a,B=sg.b,t=nrm(sub(B,A)),nl=[-t[1],t[0]];
var poly=[add(A,mul(nl,W)),add(B,mul(nl,W)),add(B,mul(nl,-W)),add(A,mul(nl,-W))];bands.push({poly:poly,A:A,B:B,t:t,bb:bbox(poly)})});
(desc.nodes||[]).forEach(function(c){var p=[];for(var i=0;i<8;i++){var a=i*Math.PI/4+Math.PI/8;p.push([c[0]+W*Math.cos(a),c[1]+W*Math.sin(a)])}bands.push({poly:p,node:true,bb:bbox(p)})});
return bands;
}

// ---------- дома: процедурные фасады и крыши ----------
/*
 * Дом строится по своему контуру, а не из готовой модели. Каждая сторона
 * контура классифицируется:
 *   уличный фасад — лежит на кромке улицы (у углового дома — на обеих);
 *   брандмауэр    — глухая стена вплотную к соседнему дому (без окон);
 *   задний/боковой фасад — остальное.
 * Уличный фасад: цоколь (первый этаж другого цвета, витрины и двери) и этажи
 * с окнами — одно окно на клетку по горизонтали и на этаж по вертикали; у
 * одноэтажного жилого дома на улицу смотрят окна, а не витрины. Сверху —
 * выступающий карниз; крыша плоская или «мансардная». Стены одного стиля и
 * вида склеены в общие сетки: это дёшево и для телефона.
 */
function buildHouses(sc,C,desc,bands,R){
var T=THREE,FH=desc.cell||16,W=desc.roadHalfWidth,buckets={},outs=[],HS=window.__houseStats={street:0,party:0,back:0};
function bucket(k){return buckets[k]||(buckets[k]={pos:[],nor:[],uv:[]})}
// четырёхугольная грань: a,b — низ (x,z) на высоте y0, верх — y1; нормаль n (в плане)
function wall(k,a,b,y0,y1,n,u1,v1){var B=bucket(k),P=[[a[0],y0,a[1]],[b[0],y0,b[1]],[b[0],y1,b[1]],[a[0],y1,a[1]]],U=[[0,0],[u1,0],[u1,v1],[0,v1]];
var e1=[P[1][0]-P[0][0],0,P[1][2]-P[0][2]],cx=-e1[2]*(y1-y0),cz=e1[0]*(y1-y0); // (e1 × вверх) в плане
var ord=(cx*n[0]+cz*n[1])>0?[0,1,2,0,2,3]:[0,2,1,0,3,2];
ord.forEach(function(i){B.pos.push(P[i][0],P[i][1],P[i][2]);B.nor.push(n[0],0,n[1]);B.uv.push(U[i][0],U[i][1])});}
function slope(k,a,b,a2,b2,y0,y1){var B=bucket(k),P=[[a[0],y0,a[1]],[b[0],y0,b[1]],[b2[0],y1,b2[1]],[a2[0],y1,a2[1]]];
var u=[P[1][0]-P[0][0],P[1][1]-P[0][1],P[1][2]-P[0][2]],v=[P[3][0]-P[0][0],P[3][1]-P[0][1],P[3][2]-P[0][2]];
var nn=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];if(nn[1]<0)nn=nn.map(function(x){return -x});
var l=Math.hypot(nn[0],nn[1],nn[2])||1;nn=nn.map(function(x){return x/l});
var ord=[0,1,2,0,2,3],tri=(P[1][0]-P[0][0])*(P[2][2]-P[0][2])-(P[1][2]-P[0][2])*(P[2][0]-P[0][0]);if(tri>0)ord=[0,2,1,0,3,2];
ord.forEach(function(i){B.pos.push(P[i][0],P[i][1],P[i][2]);B.nor.push(nn[0],nn[1],nn[2]);B.uv.push(0,0)});}
function cap(k,P,y){var B=bucket(k),v2=P.map(function(q){return new T.Vector2(q[0],q[1])}),f=T.ShapeUtils.triangulateShape(v2,[]);
f.forEach(function(tr){var a=P[tr[0]],b=P[tr[1]],c=P[tr[2]],z=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]),o=z>0?[a,c,b]:[a,b,c];
o.forEach(function(q){B.pos.push(q[0],y,q[1]);B.nor.push(0,1,0);B.uv.push(0,0)});});}
(desc.buildings||[]).forEach(function(b){var ok=b.outline&&b.outline.length>=3;outs.push({b:b,loop:ok?b.outline:null,parts:b.parts,bb:ok?bbox(b.outline):null})});
var streets=bands.filter(function(x){return !x.node});
function isStreet(m,d){return streets.some(function(x){if(!bbHit(x.bb,[m[0],m[1],m[0],m[1]],2))return false;
return Math.abs(segDist(m,x.A,x.B)-W)<1.6&&Math.abs(dot(d,x.t))>0.95})}
function isParty(me,a,b,d){var m=mul(add(a,b),0.5),L=len(sub(b,a));
return outs.some(function(o){if(o===me||!o.loop||!bbHit(o.bb,[m[0],m[1],m[0],m[1]],1))return false;
for(var i=0;i<o.loop.length;i++){var p=o.loop[i],q=o.loop[(i+1)%o.loop.length],e=sub(q,p),le=len(e);if(le<0.5)continue;
if(Math.abs(cr(d,mul(e,1/le)))>0.03||Math.abs(cr(mul(e,1/le),sub(m,p)))>0.7)continue;
var t0=dot(sub(a,p),e)/le,t1=dot(sub(b,p),e)/le,ov=Math.min(Math.max(t0,t1),le)-Math.max(Math.min(t0,t1),0);if(ov>L*0.5)return true;}
return false})}
var simple=[];
outs.forEach(function(o){
var b=o.b,N=b.floors||1,H=N*FH;
if(b.bad||!o.loop){simple.push(o);return}
var P=o.loop,si=b.style||0,st=STYLES[si],sg=signedArea(P)>0?1:-1;
for(var i=0;i<P.length;i++){var a=P[i],c=P[(i+1)%P.length],L=len(sub(c,a));if(L<0.3)continue;
var d=mul(sub(c,a),1/L),n=mul([d[1],-d[0]],sg),m=mul(add(a,c),0.5),bays=Math.max(1,Math.round(L/FH));
if(isParty(o,a,c,d)){wall('party'+si,a,c,0,H,n,1,1);HS.party++;continue}
if(isStreet(m,d)&&!(N===1&&b.type==='res')){HS.street++;wall('base'+si,a,c,0,FH,n,bays/4,1);if(N>1)wall('up'+si,a,c,FH,H,n,bays/4,(N-1)/4);}
else{wall('up'+si,a,c,0,H,n,bays/4,N/4);HS.back++;}
}
// карниз: контур, выдвинутый наружу, от верха стены
var Oc=offsetPoly(P,1.0),y0=H-0.3,y1=H+1.3;
for(var j=0;j<Oc.length;j++){var a2=Oc[j],b2=Oc[(j+1)%Oc.length],L2=len(sub(b2,a2));if(L2<0.1)continue;var d2=mul(sub(b2,a2),1/L2);wall('trim'+si,a2,b2,y0,y1,mul([d2[1],-d2[0]],sg),1,1);}
var ar=Math.abs(signedArea(P)),per=P.reduce(function(acc,q,ii){return acc+len(sub(P[(ii+1)%P.length],q))},0),inr=2*ar/per;
if(st.roofType==='mansard'&&inr>3){
var rd=Math.min(5,inr*0.55),In=offsetPoly(P,-rd),rh=rd*0.9;
for(var k=0;k<Oc.length;k++)slope('roof'+si,Oc[k],Oc[(k+1)%Oc.length],In[k],In[(k+1)%In.length],y1,y1+rh);
cap('roof'+si,In,y1+rh);
}else{cap('roof'+si,Oc,y1);
// плоская крыша: невысокий бортик по краю
var Ip=offsetPoly(P,-0.2);for(var q=0;q<Ip.length;q++){var a3=Ip[q],b3=Ip[(q+1)%Ip.length],L3=len(sub(b3,a3));if(L3<0.1)continue;var d3=mul(sub(b3,a3),1/L3);wall('trim'+si,a3,b3,y1,y1+1.2,mul([d3[1],-d3[0]],-sg),1,1);}}
});
Object.keys(buckets).forEach(function(k){var B=buckets[k];if(!B.pos.length)return;
var g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(B.pos,3));g.setAttribute('normal',new T.Float32BufferAttribute(B.nor,3));g.setAttribute('uv',new T.Float32BufferAttribute(B.uv,2));
var kind=k.replace(/[0-9]+$/,''),si=+k.match(/[0-9]+$/)[0],st=STYLES[si],m;
if(kind==='up'||kind==='base')m=new T.MeshLambertMaterial({map:facadeTex(si,kind,R)});
else if(kind==='party')m=new T.MeshLambertMaterial({color:C(shade(st.wall,-0.08))});
else if(kind==='trim')m=new T.MeshLambertMaterial({color:C(st.trim),side:T.DoubleSide});
else m=new T.MeshLambertMaterial({color:C(st.roof),side:T.DoubleSide});
sc.add(new T.Mesh(g,m));});
// невалидные и без собранного контура — простые призмы
simple.forEach(function(o){var b=o.b,h=(b.floors||1)*FH,bad=!!b.bad,mat=new T.MeshLambertMaterial({color:C(bad?COLORS.bad:(b.color||STYLES[b.style||0].wall)),transparent:bad,opacity:bad?0.7:1});
(o.loop?[o.loop]:(o.parts||[])).forEach(function(P){var g=new T.ExtrudeGeometry(new T.Shape(P.map(function(q){return new T.Vector2(q[0],-q[1])})),{depth:h,bevelEnabled:false});g.rotateX(-Math.PI/2);sc.add(new T.Mesh(g,mat))});});
}

// ---------- метки жителей: кружок с номером (как в 2D) и машина в пути ----------
var markTex={};
function markerTexture(color,label,selected){
var key=color+'|'+label+'|'+(selected?1:0);if(markTex[key])return markTex[key];
var S=96,cv=document.createElement('canvas');cv.width=cv.height=S;var g=cv.getContext('2d');
g.beginPath();g.arc(S/2,S/2,S/2-6,0,Math.PI*2);g.fillStyle=color;g.fill();
g.lineWidth=selected?10:6;g.strokeStyle=selected?'#1C2420':'#FFFFFF';g.stroke();
g.fillStyle='#fff';g.font='600 '+(label.length>1?40:46)+'px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(label,S/2,S/2+2);
var tx=new THREE.CanvasTexture(cv);tx.encoding=THREE.sRGBEncoding;markTex[key]=tx;return tx;
}
var labelTex={};
function textSprite(text){
if(!labelTex[text]){var cv=document.createElement('canvas'),g=cv.getContext('2d');g.font='600 44px system-ui,sans-serif';var w=Math.ceil(g.measureText(text).width)+28;cv.width=w;cv.height=64;
g=cv.getContext('2d');g.fillStyle='rgba(255,255,255,0.88)';g.beginPath();if(g.roundRect)g.roundRect(0,4,w,56,14);else g.rect(0,4,w,56);g.fill();
g.fillStyle='#1C2420';g.font='600 44px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(text,w/2,34);
var tx=new THREE.CanvasTexture(cv);tx.encoding=THREE.sRGBEncoding;labelTex[text]={tx:tx,aspect:w/64};}
var L=labelTex[text],sp=new THREE.Sprite(new THREE.SpriteMaterial({map:L.tx,depthTest:false}));sp.scale.set(20*L.aspect,20,1);sp.renderOrder=5;return sp;
}

// ---------- машина по умолчанию ----------
// простая модель легковушки (4.5 × 1.9 м): кузов цвета машины, кабина со
// стёклами, колёса, фары. Ось x — вдоль машины, вперёд — +x.
var carGeo=null;
function makeCar(C){
var T=THREE;
if(!carGeo)carGeo={body:new T.BoxGeometry(18,3.4,7.6),cabin:new T.BoxGeometry(9,3,6.8),glass:new T.BoxGeometry(9.2,2.2,6.9),
  wheel:new T.CylinderGeometry(1.7,1.7,1.4,14),lamp:new T.BoxGeometry(0.4,0.9,1.6)};
var g=new T.Group(),body=new T.MeshLambertMaterial({color:0xffffff}),glass=new T.MeshLambertMaterial({color:C('#2C3A4A')}),tyre=new T.MeshLambertMaterial({color:C('#1E1F22')}),
  head=new T.MeshBasicMaterial({color:C('#FFF4D0')}),tail=new T.MeshBasicMaterial({color:C('#B5281E')});
var b=new T.Mesh(carGeo.body,body);b.position.y=3.1;g.add(b);
var c=new T.Mesh(carGeo.cabin,body);c.position.set(-1.2,6.3,0);g.add(c);
var w=new T.Mesh(carGeo.glass,glass);w.position.set(-1.2,6.2,0);g.add(w);
[[5.6,3.9],[5.6,-3.9],[-5.6,3.9],[-5.6,-3.9]].forEach(function(q){var t=new T.Mesh(carGeo.wheel,tyre);t.rotation.x=Math.PI/2;t.position.set(q[0],1.7,q[1]);g.add(t)});
[2.6,-2.6].forEach(function(z){var h=new T.Mesh(carGeo.lamp,head);h.position.set(9.05,3.6,z);g.add(h);var r=new T.Mesh(carGeo.lamp,tail);r.position.set(-9.05,3.6,z);g.add(r)});
g.userData={body:body,color:null};return g;
}

// ---------- вид: сцена, камера, управление ----------
function createView(el,opts){
opts=opts||{};
var T=THREE,V={bearing:-0.5,elev:60,tgt:[0,0],dist:700,ptrs:{},last:null,rot:false,scene:null,marks:null,markers:[],cars:[]};
var R=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,logarithmicDepthBuffer:true});R.outputEncoding=T.sRGBEncoding;R.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
el.appendChild(R.domElement);
var cam=new T.PerspectiveCamera(40,680/460,1,30000),cv=R.domElement;
function C(h){return new T.Color(h).convertSRGBToLinear()}
function camUpdate(){var e=V.elev*Math.PI/180,b=V.bearing;
cam.position.set(V.tgt[0]+V.dist*Math.cos(e)*Math.sin(b),V.dist*Math.sin(e),V.tgt[1]+V.dist*Math.cos(e)*Math.cos(b));cam.lookAt(V.tgt[0],0,V.tgt[1]);}
function size(){var w=el.clientWidth||680,h=el.clientHeight||Math.round(w*460/680);R.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix();}
function render(){if(!V.scene||!el.offsetParent&&el.offsetWidth===0)return;size();camUpdate();R.render(V.scene,cam);if(opts.onRender)opts.onRender()}
var api={
setScene:function(desc){
var sc=new T.Scene();sc.background=C(COLORS.sky);
// плоское (земля, клетки, дороги) — без освещения, цвета как в 2D; дома — со светом
sc.add(new T.HemisphereLight(0xffffff,0x8d8573,0.6));
var sun=new T.DirectionalLight(0xffffff,0.6);sun.position.set(-400,700,-250);sc.add(sun);
var ground=new T.Mesh(new T.PlaneGeometry(20000,20000),new T.MeshBasicMaterial({color:C(COLORS.ground)}));ground.rotation.x=-Math.PI/2;sc.add(ground);
var side=T.DoubleSide,bands=roadBands(desc),W=desc.roadHalfWidth,H=2.2*(desc.cell||16);
if(desc.zoneCells&&desc.zoneCells.length)sc.add(new T.Mesh(flatGeo(desc.zoneCells,0.8),new T.MeshBasicMaterial({color:C(COLORS.zoneCell3D),side:side})));
(desc.areas||[]).forEach(function(a){sc.add(new T.Mesh(flatGeo([a.poly],1.2),new T.MeshBasicMaterial({color:C(a.color||COLORS.area),side:side})));
if(a.label){var sp=textSprite(a.label),c=a.poly.reduce(function(s,q){return [s[0]+q[0]/a.poly.length,s[1]+q[1]/a.poly.length]},[0,0]),top=Math.min.apply(null,a.poly.map(function(q){return q[1]}));sp.position.set(c[0],24,top-8);sc.add(sp)}});
if(bands.length)sc.add(new T.Mesh(flatGeo(bands.map(function(b){return b.poly}),1.6),new T.MeshBasicMaterial({color:C(COLORS.road),side:side})));
buildHouses(sc,C,desc,bands,R);
// выезды: арка-портал над концом дороги
(desc.gates||[]).forEach(function(x){var d=x.dir,n=[-d[1],d[0]],P=add(x.at,mul(d,W*0.6)),ang=-Math.atan2(n[1],n[0]);
var post=new T.MeshLambertMaterial({color:C('#ECEDEA')}),beam=new T.MeshLambertMaterial({color:C(x.ok===false?COLORS.bad:COLORS.gate)});
[-1,1].forEach(function(sd){var m=new T.Mesh(new T.BoxGeometry(4,H,4),post),q=add(P,mul(n,sd*(W+3)));m.position.set(q[0],H/2,q[1]);sc.add(m)});
var bm=new T.Mesh(new T.BoxGeometry(2*W+10,9,3),beam);bm.position.set(P[0],H-4.5,P[1]);bm.rotation.y=ang;sc.add(bm);
if(x.label){var sp=textSprite(x.label);sp.position.set(P[0],H+12,P[1]);sc.add(sp)}});
V.marks=new T.Group();sc.add(V.marks);V.markers=[];V.cars=[];
V.scene=sc;
},
// метки жителей: m = {x, y, z, color, label, selected, car}; кружок с номером
// висит в (x, z, y); car = {x, y, heading, color} — машина жителя (стоит или
// едет; heading — угол направления в плане), null — без машины
setMarkers:function(list){
if(!V.marks)return;
while(V.markers.length<list.length){var sp=new T.Sprite(new T.SpriteMaterial({depthTest:true}));sp.renderOrder=4;V.marks.add(sp);
var car=makeCar(C);V.marks.add(car);V.markers.push(sp);V.cars.push(car);}
for(var i=0;i<V.markers.length;i++){var sp2=V.markers[i],car2=V.cars[i],m=list[i];
if(!m){sp2.visible=false;car2.visible=false;continue}
sp2.visible=true;sp2.material.map=markerTexture(m.color,m.label,m.selected);sp2.material.needsUpdate=true;
var sz=m.selected?22:17;sp2.scale.set(sz,sz,1);sp2.position.set(m.x,(m.z||0)+8,m.y);
car2.visible=!!m.car;
if(m.car){car2.position.set(m.car.x,0,m.car.y);car2.rotation.y=-(m.car.heading||0);if(car2.userData.color!==m.car.color){car2.userData.body.color.copy(C(m.car.color));car2.userData.color=m.car.color}}}
},
// навести камеру на охват b = [x0, y0, x1, y1]; o.k — множитель расстояния (1.25 — с запасом), o.bearing — поворот
fit:function(b,o){o=o||{};if(o.bearing!=null)V.bearing=o.bearing;if(!b){V.tgt=[340,230];V.dist=700;return}V.tgt=[(b[0]+b[2])/2,(b[1]+b[3])/2];V.dist=Math.max(300,Math.max(b[2]-b[0],b[3]-b[1])*(o.k||1.25)+120)},
render:render,
rotate:function(d){V.bearing+=d;render()},
zoom:function(f){V.dist=Math.max(80,Math.min(6000,V.dist/f));render()},
toggleTilt:function(){V.elev=V.elev===60?30:60;render();return V.elev},
get elev(){return V.elev},
dom:cv
};
cv.addEventListener('contextmenu',function(e){e.preventDefault()});
cv.addEventListener('pointerdown',function(e){try{cv.setPointerCapture(e.pointerId)}catch(_){}
V.ptrs[e.pointerId]={x:e.clientX,y:e.clientY};V.rot=e.button===2||e.shiftKey;V.last=null;});
cv.addEventListener('pointermove',function(e){
if(!V.ptrs[e.pointerId])return;
var prev=V.ptrs[e.pointerId];V.ptrs[e.pointerId]={x:e.clientX,y:e.clientY};
var ids=Object.keys(V.ptrs),kpx=2*V.dist*Math.tan(20*Math.PI/180)/(cv.clientHeight||460);
if(ids.length===1){
var dx=e.clientX-prev.x,dy=e.clientY-prev.y;
if(V.rot){V.bearing-=dx*0.006}
else{var b=V.bearing,rx=Math.cos(b),rz=-Math.sin(b),fx=-Math.sin(b),fz=-Math.cos(b),sy=1/Math.sin(V.elev*Math.PI/180);
V.tgt[0]-=(rx*dx-fx*dy*sy)*kpx;V.tgt[1]-=(rz*dx-fz*dy*sy)*kpx;}
}else if(ids.length>=2){
// два пальца: поворот и масштаб
var a=V.ptrs[ids[0]],c=V.ptrs[ids[1]],ang=Math.atan2(c.y-a.y,c.x-a.x),d=Math.hypot(c.x-a.x,c.y-a.y);
if(V.last){V.bearing+=ang-V.last.ang;V.dist=Math.max(80,Math.min(6000,V.dist*V.last.d/d));}
V.last={ang:ang,d:d};
}
render();});
function up(e){delete V.ptrs[e.pointerId];V.last=null;}
cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
cv.addEventListener('wheel',function(e){e.preventDefault();V.dist=Math.max(80,Math.min(6000,V.dist*(e.deltaY>0?1.12:1/1.12)));render()},{passive:false});
window.addEventListener('resize',render);
return api;
}

window.City3D={STYLES:STYLES,COLORS:COLORS,ZONE_STYLES:ZONE_STYLES,shade:shade,lotFill:lotFill,loadThree:loadThree,createView:createView,offsetPoly:offsetPoly};
})();
