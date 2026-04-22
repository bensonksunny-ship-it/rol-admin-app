import CellHistory from '../CellHistory'

/**
 * Reports tab on the Cell page.
 * Shows only the read-only history of past submitted reports.
 * Active entry (attendance, timer, program) lives in Leader Entry.
 */
export default function CellReportsTab() {
  return <CellHistory embedded />
}
