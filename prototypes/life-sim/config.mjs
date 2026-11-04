// Параметры симуляции по умолчанию. Всё, что не пришло из снимка мира.
export const DEFAULTS={
  seed:1,
  population:null,          // null — столько жителей, сколько мест в жилых домах
  cars:20,                  // у скольких жителей есть машина
  speed:{walk:1.3,car:8.3}, // м/с: пешком ~4.7 км/ч, на машине ~30 км/ч по деревне
  shopVisitorsPerCell:1,    // покупателей одновременно на клетку·этаж магазина
  outside:{                 // внешний мир за каждыми воротами — запись с числами, не агенты
    jobs:40,                // рабочих мест снаружи, доступных жителям
    minutesBeyondGate:20,   // от ворот до места снаружи (на машине)
    carOnly:true,           // без машины наружу не уехать (автобусов нет)
  },
};
export function withDefaults(cfg={}){
  return {...DEFAULTS,...cfg,speed:{...DEFAULTS.speed,...cfg.speed},outside:{...DEFAULTS.outside,...cfg.outside}};
}
