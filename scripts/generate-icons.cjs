const sharp = require('sharp')
const path = require('path')
const fs = require('fs')

const outDir = path.join(__dirname, '..', 'public', 'icons')
fs.mkdirSync(outDir, { recursive: true })

const standardSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e3a8a"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <text x="256" y="360" font-family="Georgia, 'Times New Roman', serif" font-weight="900" font-size="320" fill="white" text-anchor="middle">R</text>
</svg>`

const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e3a8a"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <text x="256" y="320" font-family="Georgia, 'Times New Roman', serif" font-weight="900" font-size="240" fill="white" text-anchor="middle">R</text>
</svg>`

async function generate() {
  await sharp(Buffer.from(standardSvg)).resize(192, 192).png().toFile(path.join(outDir, 'pwa-192.png'))
  console.log('✓ pwa-192.png')
  await sharp(Buffer.from(standardSvg)).resize(512, 512).png().toFile(path.join(outDir, 'pwa-512.png'))
  console.log('✓ pwa-512.png')
  await sharp(Buffer.from(maskableSvg)).resize(512, 512).png().toFile(path.join(outDir, 'pwa-512-maskable.png'))
  console.log('✓ pwa-512-maskable.png')
  await sharp(Buffer.from(standardSvg)).resize(180, 180).png().toFile(path.join(outDir, 'apple-touch-icon.png'))
  console.log('✓ apple-touch-icon.png')
  console.log('\nAll icons generated.')
}

generate().catch(e => { console.error(e); process.exit(1) })
