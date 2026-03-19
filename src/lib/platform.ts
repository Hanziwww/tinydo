const _isMobile =
  typeof navigator !== "undefined" &&
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export function isMobile(): boolean {
  return _isMobile;
}

export function isDesktop(): boolean {
  return !_isMobile;
}
