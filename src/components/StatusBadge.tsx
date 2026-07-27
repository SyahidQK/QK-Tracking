import { cn } from '@/lib/utils'
import { STATUS_STYLES } from '@/lib/status'
import type { EquipmentStatus } from '@/lib/types'

export function StatusBadge({
  status,
  className,
}: {
  status: EquipmentStatus
  className?: string
}) {
  const style = STATUS_STYLES[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
        style.className,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', style.dot)} aria-hidden />
      {style.label}
    </span>
  )
}
