export const INTRO_SESSION_KEY = "botanica.coastal-intro.v1";
export function videoIntroFinished(mapReady: boolean, ended: boolean, reduced: boolean): boolean {
  return mapReady && (ended || reduced);
}
// Decide before the first paint, including when hydration is slow.
export const introBootstrap = `(function(){try{var q=new URLSearchParams(location.search).get('intro');document.documentElement.dataset.coastalIntro=q==='skip'||(q!=='force'&&sessionStorage.getItem('${INTRO_SESSION_KEY}'))?'skip':'show';document.addEventListener('DOMContentLoaded',function(){if(document.documentElement.dataset.coastalIntro==='skip'){var c=document.querySelector('[data-intro-content]');if(c)c.removeAttribute('inert')}},{once:true})}catch(e){}})()`;
export function introMode(search: string, seen: boolean): boolean {
  const mode = new URLSearchParams(search).get("intro");
  return mode === "force" || (mode !== "skip" && !seen);
}
export function revealProgress(time: number, movie = false): number {
  return Math.max(0, Math.min(1, (time - (movie ? 600 : 350)) / (movie ? 4000 : 1750)));
}
export function introFinished(time: number, readyAt: number | null, reduced: boolean): boolean {
  return readyAt !== null && (reduced || time >= Math.max(2100, readyAt) + 400);
}
