import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Read the manifest
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'))

// Update the content script path
manifest.content_scripts[0].js = ['contentScript.js']

// Create dist directory if it doesn't exist
if (!existsSync('dist')) {
  mkdirSync('dist')
}

// Write the modified manifest to dist
writeFileSync(
  join('dist', 'manifest.json'),
  JSON.stringify(manifest, null, 2)
) 