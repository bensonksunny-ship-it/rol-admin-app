// "Display Name" — an optional short/preferred name (e.g. "Surya") set on the PCS
// profile. It is the primary label everywhere: PCS cards, profile headers and
// pickers (with the legal name shown beneath as "Legal: …"), and every other
// department's rosters, cards and attendance sheets.
//
// Display only: attendance and roster matching is keyed on the official `name`
// (Sunday attendance stores lowercased names, cell attendees by name), so code
// must keep writing/comparing `member.name` and only *render* this. Records here
// carry a single `name` (no first/last split); `fullName` is accepted as an alias.
export const getMemberDisplayName = (member) =>
  String(member?.displayName || '').trim() || member?.fullName || member?.name || ''
