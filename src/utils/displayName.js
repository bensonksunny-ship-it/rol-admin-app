// "Display Name" — an optional short/preferred name (e.g. "Sam") set on the PCS
// profile. PCS keeps showing the official full name; every other department's
// rosters, cards and attendance sheets label people with the display name.
//
// Display only: attendance and roster matching is keyed on the official `name`
// (Sunday attendance stores lowercased names, cell attendees by name), so code
// must keep writing/comparing `member.name` and only *render* this.
export const getMemberDisplayName = (member) =>
  String(member?.displayName || '').trim() || member?.fullName || member?.name || ''
