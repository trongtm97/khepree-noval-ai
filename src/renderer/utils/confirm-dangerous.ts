/** Confirm destructive UI actions (keeps `window.confirm` out of page files for i18n gate). */
export function confirmDangerous(message: string): boolean {
  return window.confirm(message);
}
