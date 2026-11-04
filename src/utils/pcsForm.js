// Records saved before the "first church?" question existed: any previous-church
// data already on file means the answer is effectively "No" — don't hide it.
export const deriveIsFirstChurch = (p) =>
  p?.isFirstChurch || ((p?.previousChurchName || p?.previousChurchPlace) ? 'no' : '')

// "Is this the first church…?" change for both PCS forms. "Yes" clears the
// previous-church fields so stale values aren't saved behind a hidden input.
export const withIsFirstChurch = (prev, isFirstChurch) => (
  isFirstChurch === 'yes'
    ? { ...prev, isFirstChurch, previousChurchName: '', previousChurchPlace: '' }
    : { ...prev, isFirstChurch }
)

// Marital Status change for both PCS forms (main edit + fill invitation). "Do they
// have kids?" is hidden for Single, so switching to Single also clears hasKids and
// children — otherwise a stale "yes" + children list would still be saved.
export const withMaritalStatus = (prev, maritalStatus) => (
  maritalStatus === 'Single'
    ? { ...prev, maritalStatus, hasKids: '', children: [] }
    : { ...prev, maritalStatus }
)
