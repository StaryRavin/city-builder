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
 *   buildings      — [{outline, parts?, floors, style, type, bad?, plain?, color?}]:
 *                    plain — простая призма цвета color (стройка, заброшенный дом);
 *                    model — модель станции или услуги (wind, tower, pump, outlet, coal, park, clinic,
 *                    police, fire, school); pipeTo — точка в воде для трубы водозабора и сброса;
 *                    outline — контур дома (если нет — простые призмы по parts);
 *                    style — индекс в City3D.STYLES; type — res / com / work;
 *   sidewalk       — ширина тротуара (0 — нет): проезжая часть — roadHalfWidth − sidewalk;
 *   crosswalks     — {unit, skip:[[x,y]]}: рисовать зебры у концов звеньев (кроме skip);
 *   gates          — [{at:[x,y], dir:[dx,dy], ok}] выезды во внешний мир;
 *   areas          — [{poly | polys, color, label, y}] плоские площадки (например, «Город», река, зоны).
 * Жители — setMarkers([{x, y, z, color, label, selected, car, person}]): кружок с номером
 * (если label задан), машина {x, y, heading, color}, пешеход {x, y, heading, color};
 * машины и пешеходы рисуются пачками (InstancedMesh) — тысячи сразу.
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
{name:'бежевый кирпич',wall:'#C7A07C',trim:'#EADDC9',plinth:'#8A6C56',roof:'#4E4846',roofType:'mansard',arch:false},
// современные, панельные, стеклянные, склады, коттеджи, лавки: facade — вид фасада (по умолчанию classic)
{name:'модерн белый',facade:'modern',wall:'#EEEDE9',trim:'#3B4047',plinth:'#3B4047',roof:'#7A8088',roofType:'flat',accent:'#B58A5E'},
{name:'модерн графит',facade:'modern',wall:'#5B626D',trim:'#ECE9E2',plinth:'#2F343B',roof:'#454A52',roofType:'flat',accent:'#D2AC80'},
{name:'модерн терракота',facade:'modern',wall:'#CF9277',trim:'#F4EFE8',plinth:'#5A4A42',roof:'#6E5D55',roofType:'flat',accent:'#2F343B'},
{name:'панель бежевая',facade:'panel',wall:'#E8DECB',trim:'#FFFFFF',plinth:'#BCB19D',roof:'#9A958E',roofType:'flat',accent:'#D08562'},
{name:'панель голубая',facade:'panel',wall:'#D3E0E8',trim:'#FFFFFF',plinth:'#A6B7C3',roof:'#8995A0',roofType:'flat',accent:'#E2A85E'},
{name:'стекло синее',facade:'glass',wall:'#6F97B0',trim:'#DCE2E7',plinth:'#46525E',roof:'#7C8792',roofType:'flatbox'},
{name:'стекло бирюзовое',facade:'glass',wall:'#7EAFA6',trim:'#E4E8E6',plinth:'#3E4F4B',roof:'#7B8884',roofType:'flatbox'},
{name:'склад серый',facade:'warehouse',wall:'#C8CDD1',trim:'#959CA3',plinth:'#9AA1A7',roof:'#AEB5BB',roofType:'flat',accent:'#E0B13A'},
{name:'склад синий',facade:'warehouse',wall:'#86A4BE',trim:'#5E7A94',plinth:'#5E7A94',roof:'#B3BDC6',roofType:'flat',accent:'#F2F2F2'},
{name:'коттедж персиковый',facade:'cottage',wall:'#F3D8BF',trim:'#FFFFFF',plinth:'#BDA28B',roof:'#C0644B',roofType:'hip',accent:'#7C9A77'},
{name:'коттедж мятный',facade:'cottage',wall:'#D6E8D8',trim:'#FFFFFF',plinth:'#A3B7A6',roof:'#66737F',roofType:'hip',accent:'#C9785A'},
{name:'коттедж жёлтый',facade:'cottage',wall:'#F5E5AE',trim:'#FFFFFF',plinth:'#C0AE80',roof:'#94513F',roofType:'hip',accent:'#557796'},
{name:'лавка красная',facade:'shop',wall:'#EDE2D3',trim:'#FFFFFF',plinth:'#3B4047',roof:'#7A8088',roofType:'flat',accent:'#D95B4F'},
{name:'лавка зелёная',facade:'shop',wall:'#E1EAD8',trim:'#FFFFFF',plinth:'#2F4A3A',roof:'#66766B',roofType:'flat',accent:'#3E9B66'}];
// наборы стилей по виду застройки — для игры
var STYLE_SETS={classic:[0,1,2,3,4,5,6,7],modern:[8,9,10],panel:[11,12],glass:[13,14],warehouse:[15,16],cottage:[17,18,19],shop:[20,21]};
// цвета карты — общие для 2D и 3D во всех прототипах
// светлая карта в духе Яндекс Карт: почти белая земля, голубовато-серые дороги, белые тротуары
var COLORS={ground:'#F1F0EB',sky:'#E4ECF2',road:'#B4BECD',roadLine:'#FFFFFF',zoneCell:'#9ED38F',zoneCell3D:'#D8EECB',water:'#A9D4F0',grass:'#D3EDC5',
  zone:{res:'#3F8F4E',com:'#3D7DC8',work:'#D49A22'},gate:'#2F6F8F',bad:'#D9363E',area:'#D6DAE0',areaEdge:'#8A93A0',
  sidewalk:'#FDFDFB',crosswalk:'#FFFFFF',tree:['#B7E2A3','#A8DA94','#C6EBB3','#9FD39A','#B4E0B8'],trunk:'#D5C2A2'};
// улица: зебра — поперёк проезжей части, центр в crossAt м от узла (граница перекрёстка 5 м + 1.5),
// шириной crossLen м вдоль улицы; полосы по 0.5 м через 0.5 м (как в симуляции движения)
var STREET={crossAt:6.5,crossLen:3,stripe:0.5};
/*
 * Зебры для описания сцены: у каждого конца каждого звена, кроме ворот (skip — точки узлов,
 * где зебр нет). u — единиц в метре (редактор — 4, просмотрщик переводит метры в те же единицы).
 * Возвращает плоские многоугольники полос.
 */
function crosswalkPolys(desc){
  var cw=desc.crosswalks;if(!cw||!desc.sidewalk)return [];
  var u=cw.unit||4,C=desc.roadHalfWidth-desc.sidewalk,at=STREET.crossAt*u,hl=STREET.crossLen*u/2,sw=STREET.stripe*u,out=[];
  var skip=(cw.skip||[]),isSkip=function(p){return skip.some(function(q){return Math.hypot(q[0]-p[0],q[1]-p[1])<1e-3})};
  (desc.segments||[]).forEach(function(sg){[[sg.a,sg.b],[sg.b,sg.a]].forEach(function(pr){var P=pr[0],Q=pr[1];if(isSkip(P))return;
    var d=nrm(sub(Q,P)),n=[-d[1],d[0]],M=add(P,mul(d,at));
    for(var k=-C+sw/2;k<=C-sw/2+1e-6;k+=2*sw){var c=add(M,mul(n,k));
      out.push([add(add(c,mul(d,-hl)),mul(n,-sw/2)),add(add(c,mul(d,hl)),mul(n,-sw/2)),add(add(c,mul(d,hl)),mul(n,sw/2)),add(add(c,mul(d,-hl)),mul(n,sw/2))])}})});
  return out;
}
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
if(st.facade&&st.facade!=='classic'){drawFacade(g,st,kind,B,F,rows,rnd);return texFinish(cv,key,R)}
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
return texFinish(cv,key,R);
}
function texFinish(cv,key,R){var tx=new THREE.CanvasTexture(cv);tx.wrapS=tx.wrapT=THREE.RepeatWrapping;tx.encoding=THREE.sRGBEncoding;
tx.anisotropy=R?R.capabilities.getMaxAnisotropy():1;texCache[key]=tx;return tx}
/*
 * Остальные виды фасада. Текстура — 4 пролёта по ширине (B) и 4 этажа по высоте (F);
 * kind 'base' — первый этаж уличного фасада (витрины, двери, ворота), 'up' — этажи.
 *   modern    — большие окна в тёмных рамах, часть пролётов — деревянные панели;
 *   panel     — панели со швами, окна с белыми рамами, балконы;
 *   glass     — сплошное остекление с импостами и перекрытиями;
 *   warehouse — профлист, ленточные окна под крышей, ворота;
 *   cottage   — небольшие окна со ставнями, дверь с козырьком;
 *   shop      — этажи как у простого дома, внизу витрины под маркизой.
 */
function drawFacade(g,st,kind,B,F,rows,rnd){
var f=st.facade,up=kind==='up',W4=B*4;
function rect(c,x,y,w,h){g.fillStyle=c;g.fillRect(x,y,w,h)}
function glass(x,y,w,h,lit){var gr=g.createLinearGradient(x,y,x+w*0.6,y+h);gr.addColorStop(0,lit?LIT:'#9DB4CC');gr.addColorStop(0.45,lit?'#EFD48F':'#6F87A6');gr.addColorStop(1,lit?'#E2C070':'#465672');g.fillStyle=gr;g.fillRect(x,y,w,h)}
rect(up?st.wall:(f==='shop'||f==='modern'?st.plinth:st.wall),0,0,W4,F*rows);
for(var r=0;r<rows;r++)for(var b=0;b<4;b++){var x=b*B,y=r*F,lit=rnd()<0.14;
 if(f==='modern'){
  if(up){if(rnd()<0.22){rect(st.accent,x+B*0.1,y+F*0.12,B*0.8,F*0.76);for(var k=0;k<6;k++)rect('rgba(0,0,0,0.08)',x+B*0.1+k*B*0.13,y+F*0.12,1.5,F*0.76)}
    else{rect(st.trim,x+B*0.08,y+F*0.1,B*0.84,F*0.8);glass(x+B*0.12,y+F*0.14,B*0.76,F*0.72,lit);rect(st.trim,x+B*0.5-1,y+F*0.14,2,F*0.72)}
    rect('rgba(0,0,0,0.10)',x,y+F-3,B,3)}
  else{if(b===1){rect('#2A2E33',x+B*0.2,y+F*0.15,B*0.6,F*0.85);glass(x+B*0.26,y+F*0.2,B*0.48,F*0.8,true)}else{glass(x+B*0.05,y+F*0.12,B*0.9,F*0.8,rnd()<0.4);rect(st.plinth,x+B*0.5-1,y+F*0.12,2,F*0.8)}}}
 else if(f==='panel'){
  rect('rgba(0,0,0,0.07)',x,y,1.5,F);rect('rgba(0,0,0,0.07)',x,y+F-1.5,B,1.5);
  if(up){var bal=(b%2===0)&&rnd()<0.6;rect(st.trim,x+B*0.24,y+F*0.18,B*0.52,F*0.5);glass(x+B*0.28,y+F*0.22,B*0.44,F*0.42,lit);rect(st.trim,x+B*0.5-1,y+F*0.22,2,F*0.42);
    if(bal){rect(st.plinth,x+B*0.1,y+F*0.62,B*0.8,F*0.3);for(var k2=0;k2<7;k2++)rect('rgba(255,255,255,0.6)',x+B*0.12+k2*B*0.11,y+F*0.64,1.5,F*0.26)}}
  else{if(b===1){rect(st.accent,x+B*0.2,y+F*0.12,B*0.6,F*0.1);rect('#6B5848',x+B*0.3,y+F*0.25,B*0.4,F*0.75)}else{rect(st.trim,x+B*0.24,y+F*0.25,B*0.52,F*0.45);glass(x+B*0.28,y+F*0.29,B*0.44,F*0.37,false)}}}
 else if(f==='glass'){
  glass(x,y,B,F,lit&&up);rect(st.trim,x,y,2.5,F);rect(st.trim,x+B/2-1,y,1.5,F);
  rect(st.trim,x,y+F-5,B,5);rect('rgba(255,255,255,0.18)',x+B*0.08,y+F*0.08,B*0.12,F*0.6);
  if(!up&&b===1){rect('#2E3540',x+B*0.25,y+F*0.25,B*0.5,F*0.75)}}
 else if(f==='warehouse'){
  for(var k3=0;k3<B;k3+=6)rect(k3%12?'rgba(0,0,0,0.06)':'rgba(255,255,255,0.10)',x+k3,y,3,F);
  if(up&&r===0){rect(st.trim,x,y+F*0.12,B,F*0.2);glass(x+2,y+F*0.14,B-4,F*0.16,false)}
  if(!up&&b===2){rect(st.trim,x+B*0.08,y+F*0.18,B*0.84,F*0.82);for(var k4=0;k4<10;k4++)rect('rgba(0,0,0,0.12)',x+B*0.1,y+F*0.22+k4*F*0.075,B*0.8,1.5)}
  if(!up&&b===0){rect(st.accent,x+B*0.3,y+F*0.3,B*0.4,F*0.7)}}
 else if(f==='cottage'){
  if(up||b!==1){rect(st.trim,x+B*0.3,y+F*0.24,B*0.4,F*0.48);glass(x+B*0.34,y+F*0.28,B*0.32,F*0.4,lit);rect(st.trim,x+B*0.5-1,y+F*0.28,2,F*0.4);rect(st.trim,x+B*0.34,y+F*0.47,B*0.32,2);
    rect(st.accent,x+B*0.18,y+F*0.24,B*0.1,F*0.48);rect(st.accent,x+B*0.72,y+F*0.24,B*0.1,F*0.48);rect(st.trim,x+B*0.26,y+F*0.73,B*0.48,3)}
  else{rect(st.trim,x+B*0.24,y+F*0.12,B*0.52,F*0.08);rect(st.accent,x+B*0.32,y+F*0.24,B*0.36,F*0.76);rect('rgba(255,255,255,0.5)',x+B*0.36,y+F*0.3,B*0.28,F*0.16)}
  if(up)rect('rgba(0,0,0,0.05)',x,y+F-2,B,2)}
 else if(f==='shop'){
  if(up){rect(st.trim,x+B*0.27,y+F*0.2,B*0.46,F*0.56);glass(x+B*0.31,y+F*0.24,B*0.38,F*0.48,lit);rect(st.trim,x+B*0.5-1,y+F*0.24,2,F*0.48);rect('rgba(0,0,0,0.06)',x,y+F-2,B,2)}
  else{rect(st.accent,x,y+F*0.06,B,F*0.16);for(var k5=0;k5<8;k5+=2)rect('rgba(255,255,255,0.85)',x+k5*B/8,y+F*0.06,B/8,F*0.16);
    rect('rgba(0,0,0,0.18)',x,y+F*0.22,B,3);
    if(b===1){rect('#2A2E33',x+B*0.25,y+F*0.3,B*0.5,F*0.7);glass(x+B*0.3,y+F*0.34,B*0.4,F*0.66,true)}else glass(x+B*0.06,y+F*0.3,B*0.88,F*0.6,rnd()<0.6)}}
}
}
function flatGeo(polys,yy){ // плоские выпуклые многоугольники в одну геометрию (веером)
var T=THREE,pos=[];
polys.forEach(function(p){for(var i=1;i<p.length-1;i++)[p[0],p[i],p[i+1]].forEach(function(q){pos.push(q[0],yy,q[1])})});
var g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.computeVertexNormals();return g;
}
// полосы дорог: прямоугольник вдоль каждого звена и восьмиугольник в каждом узле
// halfWidth — ширина полосы от оси (проезжая часть или вся улица с тротуарами)
function roadBands(desc,halfWidth){
var W=halfWidth||desc.roadHalfWidth,bands=[];
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
var simple=[],models=[];
outs.forEach(function(o){
var b=o.b,N=b.floors||1,H=N*FH;
if(b.model&&!b.bad&&o.loop){models.push(o);return}
if(b.bad||b.plain||!o.loop){simple.push(o);return}
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
var hip=st.roofType==='hip'&&inr>2;
if(hip){var rd2=inr*0.9,In2=offsetPoly(P,-rd2);if(Math.sign(signedArea(In2))!==Math.sign(signedArea(P))||Math.abs(signedArea(In2))>Math.abs(signedArea(P)))hip=false;
  else{var rh2=Math.min(rd2*0.85,FH*1.4);for(var k2=0;k2<Oc.length;k2++)slope('roof'+si,Oc[k2],Oc[(k2+1)%Oc.length],In2[k2],In2[(k2+1)%In2.length],y1,y1+rh2);cap('roof'+si,In2,y1+rh2)}}
if(hip){}
else if((st.roofType==='mansard'||st.roofType==='hip')&&inr>3){
var rd=Math.min(5,inr*0.55),In=offsetPoly(P,-rd),rh=rd*0.9;
for(var k=0;k<Oc.length;k++)slope('roof'+si,Oc[k],Oc[(k+1)%Oc.length],In[k],In[(k+1)%In.length],y1,y1+rh);
cap('roof'+si,In,y1+rh);
}else{cap('roof'+si,Oc,y1);
// крыша с надстройкой (стеклянные башни): технический этаж посередине
if(st.roofType==='flatbox'&&inr>4){var Bx=offsetPoly(P,-inr*0.5),bh=FH*0.7;if(Math.sign(signedArea(Bx))===Math.sign(signedArea(P))){
  for(var q2=0;q2<Bx.length;q2++){var a4=Bx[q2],b4=Bx[(q2+1)%Bx.length],L4=len(sub(b4,a4));if(L4<0.1)continue;var d4=mul(sub(b4,a4),1/L4);wall('party'+si,a4,b4,y1,y1+bh,mul([d4[1],-d4[0]],sg),1,1)}cap('trim'+si,Bx,y1+bh)}}
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
models.forEach(function(o){buildModel(sc,C,o.b,o.loop,FH)});
// невалидные и без собранного контура — простые призмы
simple.forEach(function(o){var b=o.b,h=(b.floors||1)*FH,bad=!!b.bad,mat=new T.MeshLambertMaterial({color:C(bad?COLORS.bad:(b.color||STYLES[b.style||0].wall)),transparent:bad,opacity:bad?0.7:1});
(o.loop?[o.loop]:(o.parts||[])).forEach(function(P){var g=new T.ExtrudeGeometry(new T.Shape(P.map(function(q){return new T.Vector2(q[0],-q[1])})),{depth:h,bevelEnabled:false});g.rotateX(-Math.PI/2);sc.add(new T.Mesh(g,mat))});});
}

// ---------- деревья: мягкие «облака» на коротких стволах, как в Яндекс Картах ----------
// trees — [{x, y, s, k, c}]: s — размер (1 ≈ крона 6 м), k — вид (0 — круглая, 1 — высокая, 2 — ель), c — оттенок
var crownGeo=null;
function treeGeos(){if(crownGeo)return crownGeo;var T=THREE;
  function blob(seed,sy){var g=new T.SphereGeometry(1,14,10),p=g.attributes.position,r=seeded(seed),map={};
    for(var i=0;i<p.count;i++){var x=p.getX(i),y=p.getY(i),z=p.getZ(i),k=Math.round(x*100)+':'+Math.round(y*100)+':'+Math.round(z*100);
      if(map[k]==null)map[k]=0.93+r()*0.13;var f=map[k];p.setXYZ(i,x*f,y*f*sy,z*f)}
    g.computeVertexNormals();return g}
  crownGeo={round:blob(3,0.9),tall:blob(7,1.35),cone:new T.ConeGeometry(1,2.6,9),trunk:new T.CylinderGeometry(0.12,0.17,1,6)};return crownGeo}
function buildTrees(sc,C,trees,FH){if(!trees||!trees.length)return;var T=THREE,G=treeGeos(),m=FH/4,M4=new T.Matrix4(),Q=new T.Quaternion(),S3=new T.Vector3(),P3=new T.Vector3(),col=new T.Color();
  var kinds=[[],[],[]];trees.forEach(function(t){kinds[t.k||0].push(t)});
  var trunk=new T.InstancedMesh(G.trunk,new T.MeshLambertMaterial({color:C(COLORS.trunk)}),trees.length),ti=0;
  [G.round,G.tall,G.cone].forEach(function(geo,k){var L=kinds[k];if(!L.length)return;
    var mesh=new T.InstancedMesh(geo,new T.MeshLambertMaterial({color:0xffffff}),L.length);
    L.forEach(function(t,i){var s=(t.s||1)*m,r=3*s,th=(k===2?2.2:2.6)*s,cy=k===2?th+r*1.3:th+r*(k===1?1.15:0.8);
      Q.setFromAxisAngle(new T.Vector3(0,1,0),(t.x*0.37+t.y*0.11)%6.28);
      S3.set(r,k===2?r*1.0:r,r);P3.set(t.x,cy,t.y);M4.compose(P3,Q,S3);mesh.setMatrixAt(i,M4);
      var pal=k===2?['#8CC79A','#7FBE8F','#97CFA3']:COLORS.tree;col.copy(C(pal[(t.c||0)%pal.length]));mesh.setColorAt(i,col);
      S3.set(s*1.6,th+r*0.3,s*1.6);P3.set(t.x,(th+r*0.3)/2,t.y);M4.compose(P3,Q,S3);trunk.setMatrixAt(ti++,M4)});
    mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;sc.add(mesh)});
  trunk.count=ti;sc.add(trunk)}

// ---------- модели зданий города (b.model): станции и услуги ----------
// Единицы: клетка FH = 4 м, значит 1 м = FH/4. Контур P — в плане (x, y), в 3D это (x, высота, y).
// b.pipeTo — точка в воде, куда тянется труба водозабора или сброса.
// Ротор ветряка помечен userData.spin — вид крутит его при каждой отрисовке.
function buildModel(sc,C,b,P,FH){
var T=THREE,m=FH/4,c=[0,0];P.forEach(function(q){c[0]+=q[0]/P.length;c[1]+=q[1]/P.length});
var best=0,ang=0;for(var i=0;i<P.length;i++){var q=P[(i+1)%P.length],d=sub(q,P[i]),L=len(d);if(L>best){best=L;ang=Math.atan2(d[1],d[0])}}
var bb=bbox(P),wx=bb[2]-bb[0],wy=bb[3]-bb[1],R=Math.min(wx,wy)/2;
var g=new T.Group();g.position.set(c[0],0,c[1]);sc.add(g);
var mats={};function mat(col){return mats[col]||(mats[col]=new T.MeshLambertMaterial({color:C(col)}))}
function add(geo,col,x,y,z,parent){var me=new T.Mesh(geo,mat(col));me.position.set(x||0,y||0,z||0);(parent||g).add(me);return me}
// площадка: контур дома плоско над землёй
function pad(col,h){var gg=new T.ExtrudeGeometry(new T.Shape(P.map(function(q){return new T.Vector2(q[0]-c[0],-(q[1]-c[1]))})),{depth:h||0.6,bevelEnabled:false});gg.rotateX(-Math.PI/2);add(gg,col)}
function pipe(col,y,r){if(!b.pipeTo)return;var d=[b.pipeTo[0]-c[0],b.pipeTo[1]-c[1]],L=len(d);if(L<1)return;
  var cy=new T.CylinderGeometry(r,r,L,10);cy.rotateZ(Math.PI/2);var me=add(cy,col,d[0]/2,y,d[1]/2);me.rotation.y=-Math.atan2(d[1],d[0]);return d}
var k=b.model;
if(k==='wind'){pad('#BDB8AC',0.8);
  var H=34*m,tw=add(new T.CylinderGeometry(1.1*m,2.1*m,H,16),'#F2F3F1',0,H/2,0);
  var head=new T.Group();head.position.set(0,H,0);head.rotation.y=-ang;g.add(head);
  add(new T.BoxGeometry(6*m,2.4*m,2.4*m),'#E9EBE8',-1*m,0,0,head);
  var rot=new T.Group();rot.position.set(2.6*m,0,0);rot.userData.spin=0.9;head.add(rot);
  add(new T.SphereGeometry(1.2*m,12,10),'#DADDDA',0,0,0,rot);
  for(var j=0;j<3;j++){var bl=new T.Group();bl.rotation.x=j*2*Math.PI/3;rot.add(bl);add(new T.BoxGeometry(0.5*m,15*m,1.1*m),'#F7F7F5',0,7.8*m,0,bl)}
  sc.userData.spin=(sc.userData.spin||[]).concat([rot]);return}
if(k==='tower'){pad('#C9C4B8',0.6);var H2=17*m;
  add(new T.CylinderGeometry(1.4*m,2*m,H2,14),'#B9C3C9',0,H2/2,0);
  var tr=Math.min(R*0.95,5*m);add(new T.CylinderGeometry(tr,tr*0.75,5*m,20),'#8FB4CC',0,H2+2.5*m,0);
  add(new T.ConeGeometry(tr*1.02,2.2*m,20),'#6F8EA3',0,H2+6.1*m,0);return}
if(k==='pump'||k==='outlet'){var pump=k==='pump';pad('#C9C4B8',0.6);
  var bw=Math.min(wx,wy)*0.7,hh=(pump?4.5:3.2)*m,hb=new T.Mesh(new T.BoxGeometry(bw,hh,bw),mat(pump?'#5E93BE':'#8C7A5B'));hb.position.set(0,hh/2,0);hb.rotation.y=-ang;g.add(hb);
  add(new T.BoxGeometry(bw*1.08,0.6*m,bw*1.08),pump?'#3F6F96':'#5F5240',0,hh+0.3*m,0).rotation.y=-ang;
  var d=pipe('#7D8790',1.2*m,0.7*m);
  if(d){add(new T.CylinderGeometry(1.4*m,1.4*m,2.6*m,12),'#6B747C',d[0],1.3*m,d[1]);
    if(!pump){var pl=new T.Mesh(new T.CircleGeometry(7*m,24),new T.MeshBasicMaterial({color:C('#8A7A55'),transparent:true,opacity:0.75}));pl.rotation.x=-Math.PI/2;pl.position.set(d[0],0.9,d[1]);g.add(pl)}}
  return}
if(k==='coal'){pad('#9C968C',0.6);
  var hall=new T.Mesh(new T.BoxGeometry(wx*0.55,10*m,wy*0.75),mat('#6B6461'));hall.position.set(-wx*0.18,5*m,0);g.add(hall);
  [[-0.05,-0.25],[0.12,-0.25]].forEach(function(f){add(new T.CylinderGeometry(0.9*m,1.4*m,38*m,12),'#8A817B',wx*f[0],19*m,wy*f[1]);add(new T.CylinderGeometry(1*m,1*m,2*m,12),'#B8423A',wx*f[0],36*m,wy*f[1])});
  var pts=[];for(var t=0;t<=10;t++){var y=t/10;pts.push(new T.Vector2((Math.min(wx*0.2,wy*0.38))*(0.62+0.38*Math.pow(2*y-1.2,2)),y*22*m))}
  var ct=new T.Mesh(new T.LatheGeometry(pts,24),new T.MeshLambertMaterial({color:C('#C9C4BC'),side:T.DoubleSide}));ct.position.set(wx*0.28,0,wy*0.12);g.add(ct);return}
if(k==='park'){pad(COLORS.grass,0.9);
  // дорожки крестом и деревья по четвертям (сами деревья — в общем списке trees, их ставит игра)
  var pw=1.6*m,dd=new T.Mesh(new T.BoxGeometry(wx*0.95,0.3,pw),mat('#FBF8F0'));dd.position.set(0,1.0,0);dd.rotation.y=-ang;g.add(dd);
  var d2=new T.Mesh(new T.BoxGeometry(pw,0.3,wy*0.95),mat('#FBF8F0'));d2.position.set(0,1.0,0);d2.rotation.y=-ang;g.add(d2);
  add(new T.CylinderGeometry(1.6*m,1.6*m,0.5,16),'#F4EEDF',0,1.2,0);return}
// услуги: дом цвета службы и знак на крыше
var hS=(b.floors||2)*FH,body=new T.Mesh(new T.BoxGeometry(wx*0.82,hS,wy*0.82),mat(b.color||'#EEE'));body.position.set(0,hS/2,0);g.add(body);
add(new T.BoxGeometry(wx*0.86,0.8*m,wy*0.86),'#5C6066',0,hS+0.4*m,0);
if(k==='clinic'){add(new T.BoxGeometry(6*m,0.6*m,1.8*m),'#D7353B',0,hS+1.1*m,0);add(new T.BoxGeometry(1.8*m,0.6*m,6*m),'#D7353B',0,hS+1.1*m,0)}
if(k==='police'||k==='fire'){add(new T.BoxGeometry(wx*0.84,1.2*m,wy*0.84),k==='police'?'#F2F2F2':'#F2C230',0,hS*0.55,0)}
if(k==='school'){add(new T.CylinderGeometry(0.15*m,0.15*m,8*m,6),'#DDD',wx*0.3,hS+4*m,wy*0.3);add(new T.BoxGeometry(2.6*m,1.6*m,0.1*m),'#3D7DC8',wx*0.3+1.3*m,hS+7.2*m,wy*0.3)}
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

// ---------- машины и пешеходы: общие модели, рисуются «пачками» (InstancedMesh) ----------
// Машина по умолчанию (4.5 × 1.9 м): кузов и кабина цвета машины, стёкла, колёса.
// Пешеход (~1.75 м): ноги, туловище цвета одежды, голова. Ось x — вперёд.
// Тысячи машин и людей — несколько вызовов отрисовки, а не тысячи объектов.
function partsOf(){var T=THREE;
  return {car:[{g:new T.BoxGeometry(18,3.4,7.6),at:[0,3.1,0],tint:1},{g:new T.BoxGeometry(9,3,6.8),at:[-1.2,6.3,0],tint:1},
      {g:new T.BoxGeometry(9.2,2.2,6.9),at:[-1.2,6.2,0],color:'#2C3A4A'},
      {g:new T.CylinderGeometry(1.7,1.7,1.4,12),rx:Math.PI/2,at:[[5.6,1.7,3.9],[5.6,1.7,-3.9],[-5.6,1.7,3.9],[-5.6,1.7,-3.9]],color:'#1E1F22'}],
    person:[{g:new T.CylinderGeometry(0.75,0.6,3.4,8),at:[0,1.7,0],color:'#3A3F4A'},{g:new T.CylinderGeometry(1.0,0.85,2.8,10),at:[0,4.8,0],tint:1},
      {g:new T.SphereGeometry(0.75,10,8),at:[0,6.75,0],color:'#E2B999'}]}}
function makePool(parts,cap,C,group){
  var T=THREE,meshes=parts.map(function(p){var reps=Array.isArray(p.at[0])?p.at:[p.at];
    var m=new T.InstancedMesh(p.g,new T.MeshLambertMaterial({color:p.tint?0xffffff:C(p.color)}),cap*reps.length);m.instanceMatrix.setUsage(T.DynamicDrawUsage);
    // цвета — до count=0: three.js r128 заводит буфер цветов по текущему count
    if(p.tint){var w=new T.Color(1,1,1);for(var i=0;i<cap;i++)m.setColorAt(i,w)}
    m.count=0;m.frustumCulled=false;var local=reps.map(function(a){var M=new T.Matrix4().makeTranslation(a[0],a[1],a[2]);if(p.rx)M.multiply(new T.Matrix4().makeRotationX(p.rx));return M});
    group.add(m);return {m:m,local:local,tint:!!p.tint}});
  return {cap:cap,meshes:meshes};
}
var tmpM=null,tmpB=null,colCache={};

// ---------- вид: сцена, камера, управление ----------
// освободить видеопамять старой сцены (текстуры фасадов — общие, их не трогаем)
function disposeScene(sc){sc.traverse(function(o){if(o.geometry&&o.geometry!==crownGeo&&!isShared(o.geometry))o.geometry.dispose();
  if(o.material){(Array.isArray(o.material)?o.material:[o.material]).forEach(function(m){m.dispose()})}})}
function isShared(g){if(!crownGeo)return false;for(var k in crownGeo)if(crownGeo[k]===g)return true;return false}
function createView(el,opts){
opts=opts||{};
var T=THREE,V={bearing:-0.5,elev:60,tgt:[0,0],dist:700,ptrs:{},last:null,rot:false,scene:null,marks:null,markers:[],cars:[],people:[]};
var R=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,logarithmicDepthBuffer:true});R.outputEncoding=T.sRGBEncoding;R.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
el.appendChild(R.domElement);
var cam=new T.PerspectiveCamera(40,680/460,1,30000),cv=R.domElement;
function C(h){return new T.Color(h).convertSRGBToLinear()}
function camUpdate(){var e=V.elev*Math.PI/180,b=V.bearing;
cam.position.set(V.tgt[0]+V.dist*Math.cos(e)*Math.sin(b),V.dist*Math.sin(e),V.tgt[1]+V.dist*Math.cos(e)*Math.cos(b));cam.lookAt(V.tgt[0],0,V.tgt[1]);}
function size(){var w=el.clientWidth||680,h=el.clientHeight||Math.round(w*460/680);R.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix();}
function render(){if(!V.scene||!el.offsetParent&&el.offsetWidth===0)return;size();camUpdate();
var sp=V.scene.userData.spin;if(sp){var tt=performance.now()/1000;sp.forEach(function(r){r.rotation.x=tt*r.userData.spin})}
R.render(V.scene,cam);if(opts.onRender)opts.onRender()}
var api={
setScene:function(desc){
if(V.scene)disposeScene(V.scene);
var sc=new T.Scene();sc.background=C(COLORS.sky);
// плоское (земля, клетки, дороги) — без освещения, цвета как в 2D; дома и деревья — с мягким светом
sc.add(new T.HemisphereLight(0xffffff,0xcfc8b8,0.78));
var sun=new T.DirectionalLight(0xffffff,0.42);sun.position.set(-400,700,-250);sc.add(sun);
var ground=new T.Mesh(new T.PlaneGeometry(20000,20000),new T.MeshBasicMaterial({color:C(COLORS.ground)}));ground.rotation.x=-Math.PI/2;sc.add(ground);
var side=T.DoubleSide,SW=desc.sidewalk||0,bands=roadBands(desc,desc.roadHalfWidth-SW),W=desc.roadHalfWidth,H=2.2*(desc.cell||16);
// тротуары — светлая полоса под проезжей частью, до домов; зебры — поверх асфальта
if(SW>0){var wb=roadBands(desc,desc.roadHalfWidth);sc.add(new T.Mesh(flatGeo(wb.map(function(b){return b.poly}),1.45),new T.MeshBasicMaterial({color:C(COLORS.sidewalk),side:side})));}
var zp=crosswalkPolys(desc);if(zp.length)sc.add(new T.Mesh(flatGeo(zp,1.7),new T.MeshBasicMaterial({color:C(COLORS.crosswalk),side:side})));
if(desc.zoneCells&&desc.zoneCells.length)sc.add(new T.Mesh(flatGeo(desc.zoneCells,0.8),new T.MeshBasicMaterial({color:C(COLORS.zoneCell3D),side:side})));
(desc.areas||[]).forEach(function(a){sc.add(new T.Mesh(flatGeo(a.polys||[a.poly],a.y||1.2),new T.MeshBasicMaterial({color:C(a.color||COLORS.area),side:side})));
if(a.label){var sp=textSprite(a.label),c=a.poly.reduce(function(s,q){return [s[0]+q[0]/a.poly.length,s[1]+q[1]/a.poly.length]},[0,0]),top=Math.min.apply(null,a.poly.map(function(q){return q[1]}));sp.position.set(c[0],24,top-8);sc.add(sp)}});
if(bands.length)sc.add(new T.Mesh(flatGeo(bands.map(function(b){return b.poly}),1.6),new T.MeshBasicMaterial({color:C(COLORS.road),side:side})));
buildHouses(sc,C,desc,SW>0?roadBands(desc,desc.roadHalfWidth):bands,R);
buildTrees(sc,C,desc.trees,desc.cell||16);
(desc.lines||[]).forEach(function(L){var pos=[];L.segs.forEach(function(sg){pos.push(sg[0][0],L.y||1.1,sg[0][1],sg[1][0],L.y||1.1,sg[1][1])});
  var gg=new T.BufferGeometry();gg.setAttribute('position',new T.Float32BufferAttribute(pos,3));sc.add(new T.LineSegments(gg,new T.LineBasicMaterial({color:C(L.color),transparent:true,opacity:L.opacity==null?1:L.opacity})))});
// выезды: арка-портал над концом дороги
(desc.gates||[]).forEach(function(x){var d=x.dir,n=[-d[1],d[0]],P=add(x.at,mul(d,W*0.6)),ang=-Math.atan2(n[1],n[0]);
var post=new T.MeshLambertMaterial({color:C('#ECEDEA')}),beam=new T.MeshLambertMaterial({color:C(x.ok===false?COLORS.bad:COLORS.gate)});
[-1,1].forEach(function(sd){var m=new T.Mesh(new T.BoxGeometry(4,H,4),post),q=add(P,mul(n,sd*(W+3)));m.position.set(q[0],H/2,q[1]);sc.add(m)});
var bm=new T.Mesh(new T.BoxGeometry(2*W+10,9,3),beam);bm.position.set(P[0],H-4.5,P[1]);bm.rotation.y=ang;sc.add(bm);
if(x.label){var sp=textSprite(x.label);sp.position.set(P[0],H+12,P[1]);sc.add(sp)}});
V.marks=new T.Group();sc.add(V.marks);V.markers=[];V.pools={};
V.over=new T.Group();sc.add(V.over);
V.scene=sc;
},
// подсветка поверх сцены (превью дороги, участка, кисти зон, выбранный дом):
// [{polys, color, opacity, y, h}] — h > 0: призма высотой h (дом), иначе плоско
setOverlay:function(items){if(!V.over)return;
  while(V.over.children.length){var o=V.over.children.pop();o.geometry.dispose();o.material.dispose()}
  (items||[]).forEach(function(it){if(!it.polys||!it.polys.length)return;var mt=new T.MeshBasicMaterial({color:C(it.color),transparent:true,opacity:it.opacity==null?0.5:it.opacity,depthWrite:false,side:T.DoubleSide});
    if(it.h>0)it.polys.forEach(function(P){var gg=new T.ExtrudeGeometry(new T.Shape(P.map(function(q){return new T.Vector2(q[0],-q[1])})),{depth:it.h,bevelEnabled:false});gg.rotateX(-Math.PI/2);var me=new T.Mesh(gg,mt);me.renderOrder=3;V.over.add(me)});
    else{var me2=new T.Mesh(flatGeo(it.polys,it.y||2.2),mt);me2.renderOrder=3;V.over.add(me2)}});
  render()},
// точка земли (y = 0) под экранной точкой: [x, y] в единицах плана или null
pick:function(clientX,clientY){var r=cv.getBoundingClientRect(),v=new T.Vector2((clientX-r.left)/r.width*2-1,-((clientY-r.top)/r.height)*2+1);
  camUpdate();cam.updateMatrixWorld();var rc=new T.Raycaster();rc.setFromCamera(v,cam);var o=rc.ray.origin,d=rc.ray.direction;if(d.y>=-1e-6)return null;var t=-o.y/d.y;return [o.x+d.x*t,o.z+d.z*t]},
// точка на доме под курсором (стена или крыша; чуть внутрь по лучу) или null —
// чтобы щелчок по высокому дому выбирал его, а не землю за ним
pickSolid:function(clientX,clientY){if(!V.scene)return null;var r=cv.getBoundingClientRect(),v=new T.Vector2((clientX-r.left)/r.width*2-1,-((clientY-r.top)/r.height)*2+1);
  camUpdate();cam.updateMatrixWorld();var rc=new T.Raycaster();rc.setFromCamera(v,cam);
  var objs=V.scene.children.filter(function(o){return o!==V.marks&&o!==V.over&&!o.isInstancedMesh&&!o.isLine&&!o.isLineSegments&&!o.isLight});
  var hits=rc.intersectObjects(objs,true);for(var i=0;i<hits.length;i++){var h=hits[i];if(h.object.isInstancedMesh||h.point.y<2.5)continue;
    var d=rc.ray.direction,q=h.point;return [q.x+d.x*1.5,q.z+d.z*1.5]}return null},
// сдвинуть камеру на (dx, dy) пикселей экрана; повернуть
pan:function(dx,dy){var b=V.bearing,rx=Math.cos(b),rz=-Math.sin(b),fx=-Math.sin(b),fz=-Math.cos(b),kpx=2*V.dist*Math.tan(20*Math.PI/180)/(cv.clientHeight||460),sy=1/Math.sin(V.elev*Math.PI/180);
  V.tgt[0]-=(rx*dx-fx*dy*sy)*kpx;V.tgt[1]-=(rz*dx-fz*dy*sy)*kpx;render()},
look:function(x,y,dist){V.tgt=[x,y];if(dist)V.dist=dist;render()},
// точка мира (x, y в плане, z — высота) на экране: [clientX, clientY] или null за камерой
project:function(x,y,z){camUpdate();cam.updateMatrixWorld();var v=new T.Vector3(x,z||0,y).project(cam);if(v.z>1)return null;var r=cv.getBoundingClientRect();return [r.left+(v.x+1)/2*r.width,r.top+(1-v.y)/2*r.height]},
setElev:function(e){V.elev=Math.max(18,Math.min(85,e));render();return V.elev},
// метки жителей: m = {x, y, z, color, label, selected, car}; кружок с номером
// висит в (x, z, y); car = {x, y, heading, color} — машина жителя (стоит или
// едет; heading — угол направления в плане), null — без машины
setMarkers:function(list){
if(!V.marks)return;
var labelled=list.filter(function(m){return m&&m.label!=null});
while(V.markers.length<labelled.length){var sp=new T.Sprite(new T.SpriteMaterial({depthTest:true}));sp.renderOrder=4;V.marks.add(sp);V.markers.push(sp)}
for(var i=0;i<V.markers.length;i++){var sp2=V.markers[i],m=labelled[i];if(!m){sp2.visible=false;continue}
  sp2.visible=true;sp2.material.map=markerTexture(m.color,m.label,m.selected);sp2.material.needsUpdate=true;
  var sz=m.selected?22:17;sp2.scale.set(sz,sz,1);sp2.position.set(m.x,(m.z||0)+8,m.y)}
// машины и люди — пачками
var cars=[],people=[];list.forEach(function(m){if(!m)return;if(m.car)cars.push(m.car);if(m.person)people.push(m.person)});
function fill(kind,items){
  var pool=V.pools[kind];
  if(!pool||pool.cap<items.length){if(pool)pool.meshes.forEach(function(x){V.marks.remove(x.m);x.m.dispose&&x.m.dispose()});
    var cap=64;while(cap<items.length)cap*=2;pool=V.pools[kind]=makePool(partsOf()[kind],cap,C,V.marks)}
  if(!tmpM){tmpM=new T.Matrix4();tmpB=new T.Matrix4()}
  pool.meshes.forEach(function(x){var k=0;
    items.forEach(function(it,ii){tmpB.makeRotationY(-(it.heading||0));tmpB.setPosition(it.x,0,it.y);
      x.local.forEach(function(L0){tmpM.multiplyMatrices(tmpB,L0);x.m.setMatrixAt(k++,tmpM)});
      if(x.tint){var c=colCache[it.color]||(colCache[it.color]=C(it.color));x.m.setColorAt(ii,c)}});
    x.m.count=k;x.m.instanceMatrix.needsUpdate=true;if(x.tint&&x.m.instanceColor)x.m.instanceColor.needsUpdate=true});
}
fill('car',cars);fill('person',people);
},
// навести камеру на охват b = [x0, y0, x1, y1]; o.k — множитель расстояния (1.25 — с запасом), o.bearing — поворот
fit:function(b,o){o=o||{};if(o.bearing!=null)V.bearing=o.bearing;if(!b){V.tgt=[340,230];V.dist=700;return}V.tgt=[(b[0]+b[2])/2,(b[1]+b[3])/2];V.dist=Math.max(300,Math.max(b[2]-b[0],b[3]-b[1])*(o.k||1.25)+120)},
render:render,
rotate:function(d){V.bearing+=d;render()},
zoom:function(f){V.dist=Math.max(80,Math.min(6000,V.dist/f));render()},
toggleTilt:function(){V.elev=V.elev===60?30:60;render();return V.elev},
get elev(){return V.elev},
dom:cv,_v:V
};
cv.addEventListener('contextmenu',function(e){e.preventDefault()});
// инструменты (opts.tools): левая кнопка или один палец — инструменту, если он хочет;
// иначе — камера; щелчок без сдвига — tools.click; движение без нажатия — tools.hover
var TL=opts.tools||null,tool=null;
function pt(e){return api.pick(e.clientX,e.clientY)}
cv.addEventListener('pointerdown',function(e){try{cv.setPointerCapture(e.pointerId)}catch(_){}
if(TL&&e.button===0&&!e.shiftKey&&!Object.keys(V.ptrs).length&&TL.wants&&TL.wants()){var P=pt(e);if(P){tool={id:e.pointerId};TL.down(P,e);return}}
if(tool&&e.pointerType==='touch'){if(TL.cancel)TL.cancel();tool=null}
V.ptrs[e.pointerId]={x:e.clientX,y:e.clientY,x0:e.clientX,y0:e.clientY};V.rot=e.button===2||e.shiftKey;V.last=null;});
cv.addEventListener('pointermove',function(e){if(tool&&tool.id===e.pointerId){var P=pt(e);if(P)TL.move(P,e);return}
  if(TL&&!Object.keys(V.ptrs).length&&TL.hover){var Q=pt(e);if(Q)TL.hover(Q,e,TL.solid&&TL.solid()?api.pickSolid(e.clientX,e.clientY):null)}});
cv.addEventListener('pointerup',function(e){if(tool&&tool.id===e.pointerId){var P=pt(e);tool=null;TL.up(P,e);return}
  var p=V.ptrs[e.pointerId];if(p&&TL&&TL.click&&Math.hypot(e.clientX-p.x0,e.clientY-p.y0)<5&&e.button===0){var Q=pt(e);if(Q)TL.click(Q,e,TL.solid&&TL.solid()?api.pickSolid(e.clientX,e.clientY):null)}});
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

window.City3D={STREET:STREET,STYLE_SETS:STYLE_SETS,crosswalkPolys:crosswalkPolys,STYLES:STYLES,COLORS:COLORS,ZONE_STYLES:ZONE_STYLES,shade:shade,lotFill:lotFill,loadThree:loadThree,createView:createView,offsetPoly:offsetPoly};
})();
