import {
  MEMBERSHIP_CHURCH_NAME, MEMBERSHIP_FORM_TITLE, MEMBERSHIP_FOOTER_NOTE,
  MEMBERSHIP_PREFILL_FIELDS, MEMBERSHIP_APPLICANT_FIELDS, MEMBERSHIP_DOCUMENTS, MEMBERSHIP_DECISIONS,
  membershipFieldValue, membershipFullName, hasValue,
} from '../constants/membershipForm'

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
// DD/MM/YYYY, as printed on the paper form.
const dmy = (v) => {
  if (!v) return ''
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  const d = v instanceof Date ? v : new Date(v)
  return isNaN(d.getTime()) ? String(v) : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

/**
 * A4 print sheet for one membership application in the paper form's ruled
 * table layout — opened in a new window, then printed / saved as PDF. Before the
 * applicant submits it prints with only the PCS pre-fill, for a paper fallback.
 */
export function openMembershipFormPrint(app) {
  const val = (f) => {
    const v = membershipFieldValue(app, f.key)
    return f.type === 'date' ? dmy(v) : v
  }
  const cell = (label, value, { span = 1 } = {}) => `
    <td style="border:1px solid #334155;padding:5px 7px;vertical-align:top;width:${span === 2 ? '100%' : '50%'}" ${span === 2 ? 'colspan="2"' : ''}>
      <div style="font-size:8px;font-weight:700;color:#475569">${esc(label)}</div>
      <div style="font-size:11px;color:#0f172a;min-height:15px;white-space:pre-wrap">${esc(value) || '&nbsp;'}</div>
    </td>`

  // Lay fields out two per row, wide ones on their own row.
  const rows = []
  let pending = null
  for (const f of [...MEMBERSHIP_PREFILL_FIELDS, ...MEMBERSHIP_APPLICANT_FIELDS]) {
    if (f.wide) {
      if (pending) { rows.push(`<tr>${cell(pending.label, val(pending), { span: 2 })}</tr>`); pending = null }
      rows.push(`<tr>${cell(f.label, val(f), { span: 2 })}</tr>`)
    } else if (pending) {
      rows.push(`<tr>${cell(pending.label, val(pending))}${cell(f.label, val(f))}</tr>`)
      pending = null
    } else {
      pending = f
    }
  }
  if (pending) rows.push(`<tr>${cell(pending.label, val(pending), { span: 2 })}</tr>`)

  const talents = [...(app.applicant?.talents || []), app.applicant?.talentsOther].filter(hasValue).join(', ')
  const docs = MEMBERSHIP_DOCUMENTS.map((d) =>
    `<span style="margin-right:16px">${app.documents?.[d.key] ? '☑' : '☐'} ${esc(d.label)}</span>`).join('')
  const decision = MEMBERSHIP_DECISIONS[app.status] || 'Awaiting applicant'

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Membership Form — ${esc(membershipFullName(app) || '')}</title>
  <style>
    * { box-sizing:border-box; margin:0; padding:0; }
    @page { size:A4 portrait; margin:0; }
    html,body { width:210mm; font-family:'Segoe UI',Arial,sans-serif; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    table { border-collapse:collapse; width:100%; }
  </style></head><body>
  <div style="width:210mm;min-height:297mm;padding:14mm 14mm 10mm;display:flex;flex-direction:column">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px">
      <div style="flex:1;text-align:center;padding-top:6mm">
        <div style="font-size:16px;font-weight:900;color:#1e3a5f">${esc(MEMBERSHIP_CHURCH_NAME)}</div>
        <div style="font-size:13px;font-weight:700;color:#334155;margin-top:4px;text-decoration:underline">${esc(MEMBERSHIP_FORM_TITLE)}</div>
      </div>
      <div style="width:32mm;height:38mm;border:1.5px solid #334155;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">
        ${app.photoDataUrl ? `<img src="${app.photoDataUrl}" style="width:100%;height:100%;object-fit:cover">` : '<span style="font-size:8px;color:#64748b;text-align:center;padding:4px">Stick recent Photograph</span>'}
      </div>
    </div>

    <table style="margin-top:10px">${rows.join('')}
      <tr>${cell('Talents / Gifts', talents, { span: 2 })}</tr>
      <tr><td colspan="2" style="border:1px solid #334155;padding:5px 7px">
        <div style="font-size:8px;font-weight:700;color:#475569">Documents to be presented with the form</div>
        <div style="font-size:10.5px;color:#0f172a;margin-top:2px">${docs}</div>
      </td></tr>
    </table>

    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:12px">
      <div style="font-size:10px;color:#334155">Date: ${esc(dmy(app.submittedAt) || '')}</div>
      <div style="text-align:center;width:62mm">
        <div style="height:17mm;display:flex;align-items:flex-end;justify-content:center;border-bottom:1px solid #334155">
          ${app.signatureDataUrl ? `<img src="${app.signatureDataUrl}" style="max-height:17mm;max-width:100%">` : ''}
        </div>
        <div style="font-size:8.5px;color:#475569;margin-top:2px">Signature of Applicant</div>
      </div>
    </div>

    <div style="margin-top:auto;padding-top:12px">
      <p style="font-size:10px;font-weight:700;color:#7c2d12;border:1px dashed #c2410c;padding:5px 8px">${esc(MEMBERSHIP_FOOTER_NOTE)}</p>
      <table style="margin-top:8px">
        <tr>
          <td style="border:1px solid #334155;padding:6px 8px;width:50%;vertical-align:bottom">
            <div style="height:14mm"></div>
            <div style="font-size:8.5px;color:#475569;border-top:1px solid #334155;padding-top:2px;text-align:center">Signature of Cell Co-ordinator</div>
          </td>
          <td style="border:1px solid #334155;padding:6px 8px;width:50%;vertical-align:top">
            <div style="font-size:8px;font-weight:700;color:#475569">Pastoral Approval</div>
            <div style="font-size:11px;font-weight:700;color:#0f172a;margin-top:2px">${esc(decision)}${app.decidedBy ? ` · ${esc(app.decidedBy)}` : ''}</div>
            ${app.officeNotes ? `<div style="font-size:9.5px;color:#334155;margin-top:3px;white-space:pre-wrap">${esc(app.officeNotes)}</div>` : ''}
          </td>
        </tr>
      </table>
    </div>
  </div>
  <script>window.onload=function(){window.print()}</script>
  </body></html>`

  const win = window.open('', '_blank', 'width=900,height=900')
  if (win) { win.document.write(html); win.document.close() }
}
