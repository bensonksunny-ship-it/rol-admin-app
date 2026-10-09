import {
  BAPTISM_CHURCH_NAME, BAPTISM_FORM_TITLE, BAPTISM_DECLARATION_POINTS, BAPTISM_DECLARATION_TEXT,
  BAPTISM_PASTOR_SIGNOFF, baptismFieldValue, visibleBaptismFields, hasValue,
} from '../constants/baptismForm'

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const fmtDate = (d) => {
  if (!d) return ''
  const dt = d instanceof Date ? d : new Date(d)
  return isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function applicantFullName(app) {
  return [baptismFieldValue(app, 'firstName'), baptismFieldValue(app, 'lastName')].filter(hasValue).join(' ')
}

/** A4 print sheet for one application — opened in a new window and printed / saved as PDF. */
export function openBaptismFormPrint(app) {
  const fields = visibleBaptismFields(app)
  const val = (f) => {
    const v = baptismFieldValue(app, f.key)
    return f.type === 'date' ? fmtDate(v) : v
  }
  const name = applicantFullName(app) || '____________________'
  const fieldRows = fields.map((f) => `
    <div style="padding:6px 0;border-bottom:1px solid #e2e8f0;${f.wide ? 'grid-column:1 / -1;' : ''}">
      <div style="font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#64748b">${esc(f.label)}</div>
      <div style="font-size:11px;color:#0f172a;min-height:14px">${esc(val(f)) || '&nbsp;'}</div>
    </div>`).join('')

  const place = app.place || baptismFieldValue(app, 'baptismPlace')
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Baptism Application — ${esc(app.formId || applicantFullName(app) || '')}</title>
  <style>
    * { box-sizing:border-box; margin:0; padding:0; }
    @page { size:A4 portrait; margin:0; }
    html,body { width:210mm; font-family:'Segoe UI',Arial,sans-serif; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  </style></head><body>
  <div style="width:210mm;min-height:297mm;padding:16mm 16mm 12mm;display:flex;flex-direction:column">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px">
      <div style="flex:1">
        <div style="font-size:15px;font-weight:900;letter-spacing:.04em;color:#1e3a5f">${esc(BAPTISM_CHURCH_NAME)}</div>
        <div style="font-size:13px;font-weight:700;color:#334155;margin-top:4px">${esc(BAPTISM_FORM_TITLE)}</div>
        <div style="display:flex;gap:18px;margin-top:10px;font-size:10px;color:#334155">
          <span><b>Place:</b> ${esc(place || '')}</span>
          <span><b>Date:</b> ${esc(fmtDate(app.submittedAt || new Date()))}</span>
          <span style="font-weight:800;color:#1e3a5f;border:1.5px solid #1e3a5f;border-radius:6px;padding:1px 8px">${esc(app.formId || 'B- ____ / ____')}</span>
        </div>
      </div>
      <div style="width:30mm;height:36mm;border:1.5px dashed #94a3b8;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">
        ${app.photoDataUrl ? `<img src="${app.photoDataUrl}" style="width:100%;height:100%;object-fit:cover">` : '<span style="font-size:8px;color:#94a3b8">Photo</span>'}
      </div>
    </div>

    <ul style="margin:14px 0 0 16px;font-size:10px;color:#334155;line-height:1.55">
      ${BAPTISM_DECLARATION_POINTS.map((p) => `<li>${esc(p)}</li>`).join('')}
    </ul>

    <div style="margin-top:16px;font-size:8.5px;font-weight:800;text-transform:uppercase;letter-spacing:.15em;color:#1d4ed8;border-bottom:1.5px solid #1d4ed8;padding-bottom:3px">Candidate Information</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 18px">${fieldRows}</div>

    <div style="margin-top:16px;font-size:8.5px;font-weight:800;text-transform:uppercase;letter-spacing:.15em;color:#065f46;border-bottom:1.5px solid #065f46;padding-bottom:3px">Applicant Declaration</div>
    <p style="font-size:10.5px;color:#1f2937;line-height:1.6;margin-top:6px">${esc(BAPTISM_DECLARATION_TEXT.replace('{name}', name))}</p>
    <div style="display:flex;justify-content:flex-end;margin-top:8px">
      <div style="text-align:center;width:60mm">
        <div style="height:18mm;display:flex;align-items:flex-end;justify-content:center;border-bottom:1px solid #334155">
          ${app.signatureDataUrl ? `<img src="${app.signatureDataUrl}" style="max-height:18mm;max-width:100%">` : ''}
        </div>
        <div style="font-size:8.5px;color:#64748b;margin-top:2px">Signature of Applicant</div>
      </div>
    </div>

    <div style="margin-top:auto;padding-top:14px">
      <div style="font-size:8.5px;font-weight:800;text-transform:uppercase;letter-spacing:.15em;color:#475569;border-bottom:1.5px solid #475569;padding-bottom:3px">For Office Use</div>
      <div style="display:flex;justify-content:space-between;gap:20px;margin-top:6px">
        <div style="flex:1">
          <div style="font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#64748b">Notes</div>
          <div style="font-size:10.5px;color:#1f2937;white-space:pre-wrap;min-height:22mm;border:1px solid #e2e8f0;border-radius:4px;padding:4px 6px;margin-top:2px">${esc(app.officeNotes || '')}</div>
        </div>
        <div style="width:55mm;text-align:center;align-self:flex-end">
          <div style="border-bottom:1px solid #334155;height:14mm"></div>
          ${BAPTISM_PASTOR_SIGNOFF.map((l, i) => `<div style="font-size:${i === 0 ? '10px;font-weight:700' : '9px'};color:#1f2937;margin-top:2px">${esc(l)}</div>`).join('')}
        </div>
      </div>
    </div>
  </div>
  <script>window.onload=function(){window.print()}</script>
  </body></html>`

  const win = window.open('', '_blank', 'width=900,height=900')
  if (win) { win.document.write(html); win.document.close() }
}
