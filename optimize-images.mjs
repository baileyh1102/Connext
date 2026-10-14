import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const dir = 'src/assets'
const backup = 'assets-original'
fs.mkdirSync(backup, { recursive: true })

for (const file of fs.readdirSync(dir)) {
  if (!file.toLowerCase().endsWith('.png')) continue
  if (file.startsWith('apple-icon') || file.startsWith('pwa-')) continue

  const target = path.join(dir, file)
  const original = path.join(backup, file)
  if (!fs.existsSync(original)) fs.copyFileSync(target, original) // keep the untouched original

  const before = fs.statSync(original).size
  const out = await sharp(original)
    .resize({ width: 1600, withoutEnlargement: true })
    .png({ palette: true, quality: 80, effort: 10, compressionLevel: 9 })
    .toBuffer()

  if (out.length < before) fs.writeFileSync(target, out)
  console.log(`${file}: ${(before / 1024).toFixed(0)} kB -> ${(Math.min(out.length, before) / 1024).toFixed(0)} kB`)
}