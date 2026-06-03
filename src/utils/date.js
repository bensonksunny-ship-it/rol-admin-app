import { format, parseISO, isValid } from 'date-fns'

function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return isValid(value) ? value : null
  if (typeof value === 'string') {
    const s = value.trim()
    // Date-only YYYY-MM-DD: construct with local parts to avoid UTC shift
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) {
      const d = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]))
      return isValid(d) ? d : null
    }
    const d = parseISO(s)
    return isValid(d) ? d : null
  }
  return null
}

/**
 * Parse a value from Excel/CSV (number = Excel serial, Date, or string) to YYYY-MM-DD.
 * Used for Since/Birthday/Anniversary on member import. Returns '' if unparseable.
 */
export function parseDateToYYYYMMDD(value) {
  if (value == null || value === '') return ''

  // JS Date object — use local parts to avoid UTC shift
  if (value instanceof Date) {
    if (!isValid(value)) return ''
    const yyyy = value.getFullYear()
    const mm = String(value.getMonth() + 1).padStart(2, '0')
    const dd = String(value.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  // Excel serial number — days since 1900-01-01; read in UTC to preserve the day
  if (typeof value === 'number') {
    const d = new Date(Math.round((value - 25569) * 86400 * 1000))
    if (!isValid(d)) return ''
    const yyyy = d.getUTCFullYear()
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(d.getUTCDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  const s = String(value).trim()
  if (!s || /^na$/i.test(s)) return ''
  // Normalise spaces around separators: "27/ 05/ 1989" → "27/05/1989"
  const norm = s.replace(/\s*([\/\-])\s*/g, '$1')

  // Already YYYY-MM-DD — return as-is, no Date object needed
  if (/^\d{4}-\d{2}-\d{2}$/.test(norm)) return norm

  // DD/MM/YYYY or DD-MM-YYYY — rearrange digits, no Date object → no timezone shift
  const dmy = norm.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (dmy) {
    const dd = dmy[1].padStart(2, '0')
    const mm = dmy[2].padStart(2, '0')
    const yyyy = dmy[3]
    if (parseInt(mm) >= 1 && parseInt(mm) <= 12 && parseInt(dd) >= 1 && parseInt(dd) <= 31)
      return `${yyyy}-${mm}-${dd}`
  }

  // Last resort: Date constructor with local parts
  const d = new Date(norm)
  if (!isValid(d)) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function formatDMY(value) {
  const d = toDate(value)
  return d ? format(d, 'dd-MM-yyyy') : '—'
}

export function formatDMYTime(value) {
  const d = toDate(value)
  return d ? format(d, 'dd-MM-yyyy HH:mm') : '—'
}

export function formatDisplayDate(value) {
  if (!value) return '—'
  const d = toDate(value)
  return d ? format(d, 'dd/MMM/yyyy') : '—'
}

