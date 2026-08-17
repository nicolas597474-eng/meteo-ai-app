export const MAIN_PAGE_PATHS = ["/", "/laboratoire", "/ranking", "/history", "/ai-lab"] as const;
export const PAGE_SWIPE_IGNORE_SELECTOR = "a, button, input, textarea, select, [role='button'], [role='slider'], [data-swipe-ignore], [data-horizontal-scroll], .overflow-x-auto, .overflow-x-scroll, canvas, svg";

export function getSwipeNavigationTarget(location: string, deltaX: number) {
  const currentIndex = MAIN_PAGE_PATHS.indexOf(location as (typeof MAIN_PAGE_PATHS)[number]);
  if (currentIndex < 0) return null;
  const nextIndex = currentIndex + (deltaX < 0 ? 1 : -1);
  return MAIN_PAGE_PATHS[nextIndex] ?? null;
}

export function isQualifiedPageSwipe(deltaX: number, deltaY: number, elapsedMs: number) {
  return Math.abs(deltaX) >= 72 && Math.abs(deltaX) > Math.abs(deltaY) * 1.35 && elapsedMs <= 900;
}
