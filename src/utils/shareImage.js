// Captures a DOM node as an image for sharing (e.g. pasting into WhatsApp) —
// the same technique as the D-Light / Media / Worship Assign "Copy as Image"
// buttons: html2canvas-pro (handles Tailwind v4's oklch() colours, which plain
// html2canvas 1.x throws on) at 2x scale, then a clipboard PNG write. The Async
// Clipboard API only reliably accepts 'image/png' (not JPEG), and image writes
// are effectively desktop-Chrome/Edge-only, so anywhere else this falls back to
// downloading a JPEG the user can attach instead.
//
// The node should be a purpose-built render with inline hex styles, positioned
// off-screen (not display:none, which html2canvas can't lay out).
//
// Resolves to 'copied' or 'downloaded'; rejects if the capture itself fails.
export async function shareNodeAsImage(node, filename) {
  if (!node) throw new Error('Nothing to capture')
  const mod = await import('html2canvas-pro')
  const html2canvas = mod.default || mod
  const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff', useCORS: true })

  try {
    const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (pngBlob && typeof window.ClipboardItem === 'function' && navigator.clipboard?.write) {
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': pngBlob })])
      return 'copied'
    }
  } catch { /* clipboard image writes unsupported/blocked here — fall back to download */ }

  const link = document.createElement('a')
  link.href = canvas.toDataURL('image/jpeg', 0.95)
  link.download = filename.endsWith('.jpg') ? filename : `${filename}.jpg`
  document.body.appendChild(link)
  link.click()
  link.remove()
  return 'downloaded'
}
