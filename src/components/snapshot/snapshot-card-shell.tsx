import * as React from "react"

import { Check, ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

type SnapshotCardShellProps = {
  title: string
  /** Omit title row (chevron / quality tick) — use when the card body is self-explanatory. */
  hideHeader?: boolean
  /** Optional right-side controls (e.g. dropdown affordance) */
  actions?: React.ReactNode
  children: React.ReactNode
  footerLabel?: string
  footerHref?: string
  className?: string
}

/**
 * GA-style report card: white panel, subtle border, title row, optional footer link.
 */
export function SnapshotCardShell({
  title,
  hideHeader = false,
  actions,
  children,
  footerLabel = "View report",
  footerHref = "#",
  className,
}: SnapshotCardShellProps) {
  return (
    <div
      className={cn(
        "flex h-full min-h-[140px] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm",
        className,
      )}
    >
      {!hideHeader ? (
        <div className="flex items-start justify-between gap-2 border-b border-gray-100 px-3 py-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <h3 className="truncate text-xs font-medium text-gray-800">{title}</h3>
            <ChevronDown className="size-3.5 shrink-0 text-gray-400" aria-hidden />
            <span className="inline-flex text-emerald-600" title="Data quality">
              <Check className="size-3.5 shrink-0" aria-hidden />
            </span>
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
      <div className="border-t border-gray-100 px-3 py-2 text-right">
        <a
          href={footerHref}
          className="text-xs font-medium text-blue-600 hover:underline"
        >
          {footerLabel} →
        </a>
      </div>
    </div>
  )
}
