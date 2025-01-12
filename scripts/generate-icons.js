import { readFileSync, mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const sizes = [16, 48, 128]
const svgPath = join(__dirname, '../public/icon.svg')
const iconDir = join(__dirname, '../public/icons')

// Create icons directory if it doesn't exist
try {
  mkdirSync(iconDir, { recursive: true })
} catch (err) {
  if (err.code !== 'EEXIST') throw err
}

// Read SVG file
const svgBuffer = readFileSync(svgPath)

// Generate icons for each size
for (const size of sizes) {
  sharp(svgBuffer)
    .resize(size, size)
    .toFile(join(iconDir, `icon${size}.png`))
    .catch(console.error)
} 