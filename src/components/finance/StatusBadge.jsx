const STATUS_STYLES = {
  pending:     'bg-amber-50 text-amber-700 border-amber-200',
  approved:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  disapproved: 'bg-red-50 text-red-600 border-red-200',
}

export default function StatusBadge({ status }) {
  const key = status || 'pending'
  return (
    <span className={`shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full border capitalize ${STATUS_STYLES[key] || STATUS_STYLES.pending}`}>
      {key}
    </span>
  )
}
