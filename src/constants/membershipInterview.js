// Deacon Membership Interview (pipeline Stage 6) — the 3-part form a Deacon fills
// in after accepting an interview request on their My Workspace. Edit wording here.

export const INTERVIEW_HEADER = 'Deacon Membership Interview • River of Life Christian Church'

// Part 1 — friendly conversation; each answered "Yes / Positive" or "Needs Guidance".
export const INTERVIEW_QUESTIONS = [
  { key: 'churchFamily',   title: 'Church Family',        text: 'How are you feeling about being part of our River of Life family? ❤️' },
  { key: 'leadership',     title: 'Pastor & Leadership',  text: 'Do you feel connected to our pastor and church leadership, and comfortable approaching them whenever you need guidance?' },
  { key: 'involvement',    title: 'Getting Involved',     text: 'Would you like to get more involved in our cell group, church activities, and fellowship?' },
  { key: 'futurePlans',    title: 'Future Plans',         text: 'Do you see yourself growing with us at River of Life in the coming years?' },
  { key: 'expectations',   title: 'Your Expectations',    text: 'Is there anything you’re hoping for or looking forward to as part of our church family?' },
  { key: 'support',        title: 'We’re Here for You',   text: 'If you ever need prayer, support, or guidance, would you feel comfortable reaching out to your cell leader or pastor?' },
]
export const INTERVIEW_ANSWERS = [
  { value: 'positive', label: 'Yes / Positive' },
  { value: 'guidance', label: 'Needs Guidance' },
]

// Part 2 — reference card for the Deacon.
export const INTERVIEW_BENEFITS = [
  ['A Church Family', 'Spiritual family, meaningful relationships, growing together in Christ.'],
  ['Cell Fellowship', 'Regular opportunities for prayer, Bible study, and encouragement.'],
  ['Spiritual Growth', "Gathering in God's Word, teaching, and prayer meetings."],
  ['Pastoral Care & Guidance', 'Direct access to pastoral counseling and prayer.'],
  ['Prayer & Support', 'Fellowship support during difficult seasons.'],
  ['Opportunities to Serve', 'Discovering spiritual gifts and ministry involvement.'],
  ['Growing Together', 'Walking together through different seasons of life.'],
]

// Part 3 — final check.
export const INTERVIEW_STATUSES = ['Completed', 'Follow-up Required']
export const INTERVIEW_CONNECTION_LEVELS = ['Feels Connected', 'Needs More Fellowship', 'Needs Follow-up']
export const INTERVIEW_RECOMMENDATIONS = ['Recommend Membership', 'Follow-up Required']

/** Stage 6 completes (→ Stage 7 Pastoral Approval) only for a completed interview that recommends membership. */
export const interviewAdvancesPipeline = (rec) => rec?.status === 'Completed' && rec?.recommendation === 'Recommend Membership'
