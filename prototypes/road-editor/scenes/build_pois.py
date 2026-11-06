"""
Заведения района из данных OpenStreetMap: кафе, магазины, банки, офисы,
учреждения — для симуляции жизни.

  1. та же выгрузка, что для сцены (см. build_scene.py):
       curl -o dorcol.osm "https://www.openstreetmap.org/api/0.6/map?bbox=20.452,44.815,20.480,44.830"
  2. python3 build_pois.py dorcol.osm dorcol.pois.json
  3. встроить в index.html в блок <script type="application/json" id="pois-dorcol">.

Каждое заведение — точка (единицы редактора, 1 м = 4 ед.) с видом:
  food — продукты: здесь покупают еду домой;
  cafe — кафе, ресторан, бар, фастфуд: здесь едят;
  work — всё остальное (банк, аптека, другие магазины, офисы, школы,
         университет, гостиницы, музеи...): рабочие места.
У каждого — число работников, посетителей одновременно (food, cafe) и часы
работы (по виду; часы из OSM не разбираются). Числа — грубые средние по виду
заведения. «Целое здание» (whole) — учреждения, где не живут: школа,
университет, гостиница, музей, театр, клиника, госучреждение, посольство.
Уличная мебель (скамейки, урны, памятники, банкоматы, парковки) пропускается.

Данные © участники OpenStreetMap, лицензия ODbL.
"""
import sys, json, math, xml.etree.ElementTree as ET

root = ET.parse(sys.argv[1]).getroot()
lat0, lon0 = 44.8210, 20.4600
POLY = [(-334,-521),(477,130),(60,505),(20,468),(-145,285),(-449,2),(-412,-65),(-382,-122),(-363,-211),(-345,-400)]

def pip(x, y, poly):
    c = False
    for i in range(len(poly)):
        x1, y1 = poly[i]; x2, y2 = poly[(i+1) % len(poly)]
        if (y1 > y) != (y2 > y) and x < (x2-x1)*(y-y1)/(y2-y1)+x1: c = not c
    return c

# вид, подпись, работников, посетителей, часы, целое здание
FOOD = {'convenience':('магазин у дома',4,10,(7,23)),'supermarket':('супермаркет',20,40,(7,22)),'bakery':('пекарня',4,8,(6,21)),
        'kiosk':('киоск',1,2,(6,23)),'pastry':('кондитерская',3,6,(8,22)),'confectionery':('кондитерская',2,4,(8,21)),
        'wine':('винный магазин',2,4,(9,22)),'alcohol':('магазин напитков',2,4,(9,22)),'beverages':('магазин напитков',2,4,(9,22)),
        'greengrocer':('овощи и фрукты',2,6,(7,20)),'butcher':('мясная лавка',3,5,(7,20)),'deli':('деликатесы',2,5,(8,21)),
        'cheese':('сыры',2,4,(8,20)),'dairy':('молочная лавка',2,4,(7,20)),'health_food':('здоровое питание',2,4,(9,21))}
CAFE = {'restaurant':('ресторан',10,40,(11,24)),'cafe':('кафе',5,25,(8,24)),'bar':('бар',5,30,(10,24)),'pub':('паб',5,25,(12,24)),
        'fast_food':('фастфуд',6,15,(9,24)),'ice_cream':('мороженое',3,8,(10,23)),'food_court':('фуд-корт',10,40,(10,22)),'biergarten':('пивной сад',5,30,(12,24))}
WORK_AMENITY = {'bank':('банк',15,(9,17),0),'pharmacy':('аптека',4,(8,21),0),'bureau_de_change':('обмен валюты',2,(9,20),0),
        'clinic':('клиника',15,(8,20),1),'dentist':('стоматология',4,(9,19),0),'veterinary':('ветеринар',3,(9,19),0),
        'library':('библиотека',8,(9,19),1),'theatre':('театр',30,(12,23),1),'school':('школа',50,(8,15),1),
        'university':('университет',120,(8,20),1),'kindergarten':('детский сад',15,(7,17),1),'post_office':('почта',8,(8,19),0),
        'place_of_worship':('храм',3,(8,19),1),'cinema':('кинотеатр',10,(12,24),1),'arts_centre':('центр искусств',8,(10,20),1),
        'college':('колледж',40,(8,18),1),'police':('полиция',30,(0,24),1),'townhall':('администрация',60,(8,16),1),'courthouse':('суд',40,(8,16),1)}
WORK_TOURISM = {'hotel':('гостиница',25,(0,24),1),'hostel':('хостел',5,(0,24),0),'guest_house':('гостевой дом',3,(0,24),0),
        'museum':('музей',15,(10,18),1),'gallery':('галерея',3,(11,19),0)}
WORK_LEISURE = {'fitness_centre':('фитнес',6,(7,22),0),'escape_game':('квест',3,(12,23),0),'sports_centre':('спорткомплекс',10,(8,22),1)}
WORK_OFFICE = {'government':('госучреждение',80,(8,16),1),'diplomatic':('посольство',30,(9,17),1)}

nodes = {n.get('id'): (float(n.get('lat')), float(n.get('lon'))) for n in root.iter('node')}
out = []
for el in list(root.iter('node')) + list(root.iter('way')):
    tags = {t.get('k'): t.get('v') for t in el.findall('tag')}
    if el.tag == 'node': la, lo = float(el.get('lat')), float(el.get('lon'))
    else:
        refs = [nd.get('ref') for nd in el.findall('nd') if nd.get('ref') in nodes]
        if not refs or not any(k in tags for k in ('shop','amenity','office','tourism','craft','healthcare','leisure')): continue
        la = sum(nodes[r][0] for r in refs)/len(refs); lo = sum(nodes[r][1] for r in refs)/len(refs)
    x = (lo-lon0)*math.cos(math.radians(lat0))*111320; y = -(la-lat0)*110540
    if not pip(x, y, POLY): continue
    p = None
    if tags.get('shop') in FOOD:
        lab, jobs, vis, hrs = FOOD[tags['shop']]; p = dict(kind='food', cat=lab, jobs=jobs, visitors=vis, hours=hrs, whole=0)
    elif tags.get('amenity') in CAFE:
        lab, jobs, vis, hrs = CAFE[tags['amenity']]; p = dict(kind='cafe', cat=lab, jobs=jobs, visitors=vis, hours=hrs, whole=0)
    elif tags.get('amenity') in WORK_AMENITY:
        lab, jobs, hrs, whole = WORK_AMENITY[tags['amenity']]; p = dict(kind='work', cat=lab, jobs=jobs, visitors=0, hours=hrs, whole=whole)
    elif tags.get('tourism') in WORK_TOURISM:
        lab, jobs, hrs, whole = WORK_TOURISM[tags['tourism']]; p = dict(kind='work', cat=lab, jobs=jobs, visitors=0, hours=hrs, whole=whole)
    elif tags.get('leisure') in WORK_LEISURE:
        lab, jobs, hrs, whole = WORK_LEISURE[tags['leisure']]; p = dict(kind='work', cat=lab, jobs=jobs, visitors=0, hours=hrs, whole=whole)
    elif 'office' in tags:
        lab, jobs, hrs, whole = WORK_OFFICE.get(tags['office'], ('офис', 15, (9, 17), 0)); p = dict(kind='work', cat=lab, jobs=jobs, visitors=0, hours=hrs, whole=whole)
    elif 'shop' in tags and tags['shop'] not in ('vacant', 'yes'):
        p = dict(kind='work', cat='магазин', jobs=3, visitors=0, hours=(10, 20), whole=0)
    elif 'craft' in tags:
        p = dict(kind='work', cat='мастерская', jobs=2, visitors=0, hours=(9, 18), whole=0)
    elif 'healthcare' in tags:
        p = dict(kind='work', cat='медицина', jobs=5, visitors=0, hours=(8, 20), whole=0)
    if not p: continue
    p['name'] = tags.get('name:sr-Latn') or tags.get('name') or ''
    p['x'] = round(x*4, 1); p['y'] = round(y*4, 1); p['hours'] = list(p['hours'])
    out.append(p)

out.sort(key=lambda p: (p['kind'], p['cat'], p['x'], p['y']))
json.dump({'attribution': '© участники OpenStreetMap, ODbL', 'pois': out}, open(sys.argv[2], 'w'), ensure_ascii=False, separators=(',', ':'))
from collections import Counter
print(len(out), 'заведений:', dict(Counter(p['kind'] for p in out)), 'работников', sum(p['jobs'] for p in out))
