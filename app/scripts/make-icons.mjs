// Erzeugt Platzhalter-Icons (Vollfarbe + gelbes "L") ohne Abhängigkeiten. Aufruf: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const BG = [0x14, 0x12, 0x1f]
const FG = [0xff, 0xd1, 0x66]

function crc32(buf) {
  let c,
    crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

/** letterScale: Anteil der Kantenlänge, den der Buchstabe einnimmt (Maskable: kleiner, innerhalb der Safe Zone). */
function png(size, letterScale) {
  const h = Math.round(size * letterScale)
  const w = Math.round(h * 0.6)
  const stroke = Math.round(h * 0.22)
  const x0 = Math.round((size - w) / 2)
  const y0 = Math.round((size - h) / 2)
  const raw = Buffer.alloc(size * (size * 3 + 1))
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1)
    raw[row] = 0
    for (let x = 0; x < size; x++) {
      const inL = x >= x0 && x < x0 + w && y >= y0 && y < y0 + h && (x < x0 + stroke || y >= y0 + h - stroke)
      const [r, g, b] = inL ? FG : BG
      raw[row + 1 + x * 3] = r
      raw[row + 2 + x * 3] = g
      raw[row + 3 + x * 3] = b
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

const out = new URL('../public/', import.meta.url)
writeFileSync(new URL('icon-192.png', out), png(192, 0.6))
writeFileSync(new URL('icon-512.png', out), png(512, 0.6))
writeFileSync(new URL('icon-512-maskable.png', out), png(512, 0.4))
writeFileSync(new URL('apple-touch-icon.png', out), png(180, 0.6))
