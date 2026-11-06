/*
 * Готовые сцены: снимок мира + настройки симуляции под него.
 *   village — деревня 10: у всех машины, в Город только на машине;
 *   dorcol  — Белград, Дорчол: ~17 800 жителей в домах из OpenStreetMap, кафе,
 *             магазины, банки, офисы — из реальных данных OSM. Машина у 8%:
 *             больше просто негде поставить (мест на улицах ~1 700). Город
 *             вокруг: за выезд можно и пешком (дальше — транспорт), рабочих мест
 *             за каждым из 4 выездов — по 4 000.
 */
export const PRESETS={
  village:{file:'village.snapshot.json',title:'Деревня 10',cfg:{}},
  village100:{file:'village100.snapshot.json',title:'Деревня 100',cfg:{cars:20}},
  dorcol:{file:'dorcol.snapshot.json',title:'Белград, Дорчол',cfg:{carShare:0.08,outside:{carOnly:false,jobs:4000}}},
};
