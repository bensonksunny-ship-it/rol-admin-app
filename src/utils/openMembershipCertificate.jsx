import { createRoot } from 'react-dom/client'
import MembershipCertificatePreview from '../components/caring/MembershipCertificatePreview'

/**
 * Opens the Certificate of Membership preview (print / download bar on top) over
 * the current page. Mounted on its own root so any button can call it without
 * holding modal state; it unmounts itself on close.
 */
export function openMembershipCertificate(data) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const close = () => { root.unmount(); host.remove() }
  root.render(<MembershipCertificatePreview data={data} onClose={close} />)
}
