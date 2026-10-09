// Church applications (baptism / membership / baby dedication) require an active
// cell group. Staff can only create one for a person in a cell, and each records
// that cell in prefill.cellGroupId / cellName; the public QR pages lock an
// application that has neither (e.g. one created before this rule).
export const applicationHasCell = (app) =>
  !!String(app?.prefill?.cellGroupId || '').trim() || !!String(app?.prefill?.cellName || '').trim()

export const APPLICATION_LOCKED_TITLE = 'Application Locked'
export const APPLICATION_LOCKED_TEXT =
  'Please connect with your Cell Group Leader or Pastoral Team to assign your Cell Group before completing this application.'
