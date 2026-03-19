import fs from 'node:fs'
import { SourceMapConsumer } from 'source-map'

const mapPath = new URL('../dist/assets/index-CVSJpT73.js.map', import.meta.url)
const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'))

const LINE = 85
const COLUMN = 52177

const consumer = await new SourceMapConsumer(map)
const pos = consumer.originalPositionFor({ line: LINE, column: COLUMN })
console.log({ generated: { line: LINE, column: COLUMN }, original: pos })
consumer.destroy()

