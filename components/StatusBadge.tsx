import type { ListingStatus } from '@/types'

const statusConfig: Record<ListingStatus, { label: string; dotClass: string; textClass: string }> = {
  saved:          { label: 'Saved',          dotClass: 'bg-zinc-400',    textClass: 'text-zinc-500' },
  inquiry_sent:   { label: 'Inquiry Sent',   dotClass: 'bg-amber-400',   textClass: 'text-amber-700' },
  price_received: { label: 'Price Received', dotClass: 'bg-emerald-400', textClass: 'text-emerald-700' },
  liked:          { label: 'Liked',          dotClass: 'bg-blue-400',    textClass: 'text-blue-700' },
  passed:         { label: 'Passed',         dotClass: 'bg-red-400',     textClass: 'text-red-600' },
}

export function StatusBadge({ status }: { status: ListingStatus }) {
  const config = statusConfig[status] ?? statusConfig.saved
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${config.textClass}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${config.dotClass}`} />
      {config.label}
    </span>
  )
}
