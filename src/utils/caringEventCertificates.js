import {
  caringEventType, serialLabel, CARING_EVENT_CHURCH_NAME, CARING_EVENT_CHURCH_PLACE,
} from '../constants/caringEvents'

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const longDate = (iso) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return ''
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Certificate body per event type — one sentence naming the participant(s).
function certificateBody(event, p) {
  const date = esc(longDate(event.date))
  const venue = esc(event.venue || `${CARING_EVENT_CHURCH_NAME}, ${CARING_EVENT_CHURCH_PLACE}`)
  const name = (n) => `<span class="name">${esc(n)}</span>`
  const legal = (person) => person?.legalName || person?.name || ''
  switch (event.type) {
    case 'marriage':
      return `This is to certify that ${name(legal(p))} and ${name(legal(p.spouse))} were united in Holy Matrimony on ${date} at ${venue}, in the presence of God and these witnesses.`
    case 'dedication': {
      const parents = (p.parents || []).map(legal).filter(Boolean).join(' and ')
      return `This is to certify that ${name(p.childName)}${parents ? `, child of ${esc(parents)},` : ''} was dedicated to the Lord on ${date} at ${venue}.`
    }
    case 'burial':
      return `This records that ${name(legal(p))} was Promoted to Glory and laid to rest with a Christian burial service held on ${date} at ${venue}.`
    default:
      return `This is to certify that ${name(legal(p))}, having confessed faith in the Lord Jesus Christ, was baptised by immersion in the name of the Father, the Son and the Holy Spirit on ${date} at ${venue}.`
  }
}

/** Open one A4-landscape certificate per participant, ready to print / save as PDF. */
export function openCaringEventCertificates(event, participants = event.participants || []) {
  const t = caringEventType(event.type)
  const pages = participants.map((p) => `
    <section class="page">
      <div class="frame">
        <div class="church">${esc(CARING_EVENT_CHURCH_NAME)}</div>
        <div class="place">${esc(CARING_EVENT_CHURCH_PLACE)}</div>
        <div class="title">${esc(t.certTitle)}</div>
        <p class="body">${certificateBody(event, p)}</p>
        <div class="meta">
          ${event.batchCode ? `<span>Batch: <b>${esc(event.batchCode)}</b></span>` : ''}
          <span>Serial: <b>${esc(serialLabel(p.serialNo))}</b></span>
          ${event.time ? `<span>Time: <b>${esc(event.time)}</b></span>` : ''}
        </div>
        <div class="foot">
          <div class="sign"><div class="line"></div>${esc(event.officiant || 'Officiating Minister')}<br><small>Officiating Minister</small></div>
          <div class="seal"><div>${esc(CARING_EVENT_CHURCH_NAME.toUpperCase())}</div><b>SEAL</b><div>${esc(CARING_EVENT_CHURCH_PLACE.toUpperCase())}</div></div>
          <div class="sign"><div class="line"></div>Senior Pastor<br><small>${esc(CARING_EVENT_CHURCH_NAME)}</small></div>
        </div>
      </div>
    </section>`).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(t.certTitle)} — ${esc(event.batchCode || '')}</title>
  <style>
    * { box-sizing:border-box; margin:0; padding:0; }
    @page { size:A4 landscape; margin:0; }
    body { font-family: Georgia, 'Times New Roman', serif; color:#1f2937; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .page { width:297mm; height:210mm; padding:12mm; page-break-after:always; }
    .page:last-child { page-break-after:auto; }
    .frame { height:100%; border:3px double #92400e; outline:1px solid #d6b98c; outline-offset:-8px; padding:14mm 20mm; display:flex; flex-direction:column; align-items:center; text-align:center; }
    .church { font-size:24px; font-weight:700; letter-spacing:.06em; color:#1e3a5f; text-transform:uppercase; }
    .place { font-size:13px; letter-spacing:.3em; color:#64748b; text-transform:uppercase; margin-top:2px; }
    .title { font-size:34px; font-style:italic; color:#92400e; margin-top:10mm; }
    .body { font-size:16px; line-height:1.8; max-width:210mm; margin-top:8mm; }
    .name { font-size:20px; font-weight:700; font-style:italic; color:#0f172a; border-bottom:1px solid #94a3b8; padding:0 4px; }
    .meta { display:flex; gap:22px; font-size:12px; color:#475569; margin-top:7mm; font-family:'Segoe UI', Arial, sans-serif; }
    .foot { margin-top:auto; width:100%; display:flex; justify-content:space-between; align-items:flex-end; }
    .sign { width:62mm; font-size:12px; font-family:'Segoe UI', Arial, sans-serif; }
    .sign .line { border-bottom:1px solid #334155; height:14mm; margin-bottom:3px; }
    .sign small { color:#64748b; }
    .seal { width:34mm; height:34mm; border:2px solid #92400e; border-radius:50%; outline:1px dashed #b45309; outline-offset:-5px; display:flex; flex-direction:column; align-items:center; justify-content:center; font-size:6.5px; letter-spacing:.08em; color:#92400e; font-family:'Segoe UI', Arial, sans-serif; padding:4mm; gap:2px; }
    .seal b { font-size:11px; letter-spacing:.2em; }
  </style></head><body>${pages}
  <script>window.onload=function(){window.print()}</script>
  </body></html>`

  const win = window.open('', '_blank', 'width=1100,height=800')
  if (win) { win.document.write(html); win.document.close() }
}
