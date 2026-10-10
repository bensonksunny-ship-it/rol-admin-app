// Stage 4 (Document & Information Verification) checklist, and what each item asks
// the applicant to fix when the office returns the application for revisions.
// `code` is what's stored in revisionRequest.flaggedItems (e.g. ['ITEM_2', 'ITEM_5']).

export const VERIFICATION_CHECKLIST = [
  { key: 'infoVerified', code: 'ITEM_1', label: 'All information given checked and verified',
    flagLabel: 'Information incorrect / incomplete',
    applicantTitle: 'Review and correct your application',
    applicantText: 'Some details on your application were incorrect or incomplete. Please check every field below and correct it.' },
  { key: 'idCopy', code: 'ITEM_2', label: 'Submitted ID card copy',
    flagLabel: 'ID card missing / invalid',
    applicantTitle: 'Upload your ID card',
    applicantText: 'Please upload a clear photo of your Aadhaar, Passport or Voter ID. All the text must be readable.' },
  { key: 'baptismProof', code: 'ITEM_3', label: 'Submitted baptism certificate / self-declaration form',
    flagLabel: 'Baptism certificate / self-declaration missing',
    applicantTitle: 'Baptism certificate or self-declaration',
    applicantText: 'Please upload your water baptism certificate. If you do not have one, confirm the self-declaration instead.' },
  { key: 'securityDeposit', code: 'ITEM_4', label: 'Payment of security deposit is done',
    flagLabel: 'Security deposit unpaid',
    applicantTitle: 'Security Deposit Payment Pending',
    applicantText: 'Please complete payment or contact the church office.' },
  { key: 'photo', code: 'ITEM_5', label: 'Physical photo is provided',
    flagLabel: 'Photo missing / invalid',
    applicantTitle: 'Upload your passport-size photo',
    applicantText: 'Please upload a recent passport-size photo: your face clearly visible, plain background.' },
]

export const revisionItem = (code) => VERIFICATION_CHECKLIST.find((c) => c.code === code) || null

/** "2. ID card, 5. Photo"-style list of flagged items for staff lines. */
export const flaggedItemsText = (codes = []) => codes
  .map((code) => { const c = revisionItem(code); return c ? `${code.replace('ITEM_', '')}. ${c.flagLabel}` : code })
  .join(' · ')

// Security deposit payment shown to the applicant when ITEM_4 is flagged. Fill in
// upiId to show a "Pay by UPI" button and QR code, and bank.accountNumber to show
// bank transfer details; the office (cash) note always shows.
export const MEMBERSHIP_DEPOSIT_PAYMENT = {
  upiId: '',
  bank: { accountName: '', accountNumber: '', ifsc: '', bankName: '' },
  payeeName: 'River of Life Christian Church',
  officeNote: 'You can also pay in cash at the church office. Please mention your name and that it is for the membership security deposit.',
}

/** Revisions use the applicant's primary application link — the page switches to
 *  revision mode by itself while the application is 'revision_requested'. */
export const membershipRevisionLink = (token) => `${window.location.origin}/membership-apply?token=${token}`
