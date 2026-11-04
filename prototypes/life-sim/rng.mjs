// Детерминированный генератор случайных чисел (mulberry32): одна и та же
// последовательность при одном seed на любой машине. Math.random в симуляции
// не используется нигде.
export function makeRng(seed){
  let a=seed>>>0;
  const next=()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
  return {
    next,                                   // [0, 1)
    int:(n)=>Math.floor(next()*n),          // 0..n-1
    shuffle(arr){for(let i=arr.length-1;i>0;i--){const j=Math.floor(next()*(i+1));const x=arr[i];arr[i]=arr[j];arr[j]=x}return arr;},
  };
}
