import { createRoot } from 'react-dom/client'
import MembershipIdCardPreview from '../components/caring/MembershipIdCardPreview'

/**
 * Opens the double-sided Membership ID card preview (print bar on top) over the
 * current page. Mounted on its own root under #rol-idcard-host — the print CSS
 * hides everything else on the page — and unmounts itself on close.
 * data: { name, membershipNumber, memberSince, congregation, emergencyContact }
 */
export function openMembershipIdCard(data) {
  document.getElementById('rol-idcard-host')?.remove()
  const host = document.createElement('div')
  host.id = 'rol-idcard-host'
  document.body.appendChild(host)
  const root = createRoot(host)
  const close = () => { root.unmount(); host.remove() }
  root.render(<MembershipIdCardPreview data={data} onClose={close} />)
}
