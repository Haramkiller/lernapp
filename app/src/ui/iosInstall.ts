/** iPhone/iPad (auch iPadOS mit Desktop-UA) im normalen Safari-Tab, also nicht als installierte Home-Bildschirm-App. */
export function isIosNotInstalled(ua: string, standalone: boolean, maxTouchPoints = 0): boolean {
  const classic = /iPhone|iPad|iPod/.test(ua)
  const ipadDesktopUa = /Macintosh/.test(ua) && maxTouchPoints > 1
  return (classic || ipadDesktopUa) && !standalone
}
