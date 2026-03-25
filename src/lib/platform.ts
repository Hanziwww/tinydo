const _userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
const _isMobile = /Android|iPhone|iPad|iPod/i.test(_userAgent);
const _isWindowsDesktop = !_isMobile && /Windows/i.test(_userAgent);

export function isMobile(): boolean {
  return _isMobile;
}

export function isDesktop(): boolean {
  return !_isMobile;
}

export function isWindowsDesktop(): boolean {
  return _isWindowsDesktop;
}
