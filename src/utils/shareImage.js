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

// Copies an image data URL (e.g. a QR code PNG) to the clipboard so it can be
// pasted straight into WhatsApp / Telegram / email. The blob is handed to
// ClipboardItem as a promise, which Safari requires (the write must start inside
// the click). Where image copy isn't supported (most phones), falls back to the
// share sheet with the image attached.
// Resolves to 'copied' | 'shared' | 'cancelled' | 'unsupported'.
export async function copyImageDataUrlToClipboard(dataUrl, filename = 'image.png') {
  if (!dataUrl) return 'unsupported'
  const blobPromise = fetch(dataUrl).then((r) => r.blob()).then((b) => (b.type === 'image/png' ? b : new Blob([b], { type: 'image/png' })))
  try {
    if (typeof window.ClipboardItem === 'function' && navigator.clipboard?.write) {
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blobPromise })])
      return 'copied'
    }
  } catch { /* image clipboard blocked here — try the share sheet */ }
  try {
    const file = new File([await blobPromise], filename, { type: 'image/png' })
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] })
      return 'shared'
    }
  } catch (e) {
    if (e?.name === 'AbortError') return 'cancelled'
  }
  return 'unsupported'
}
