import { useEffect } from 'react'

// While a full-screen modal / bottom sheet is open: hide the mobile department
// dock (the floating bottom-centre button, [data-dock]) so it can't sit over the
// sheet's content whatever the stacking order, and stop the page behind from
// scrolling. Counted, so overlapping modals restore correctly when the last closes.
let openCount = 0

export default function useModalOpenGuard(open) {
  useEffect(() => {
    if (!open) return
    openCount += 1
    document.body.classList.add('modal-open')
    return () => {
      openCount = Math.max(0, openCount - 1)
      if (openCount === 0) document.body.classList.remove('modal-open')
    }
  }, [open])
}
