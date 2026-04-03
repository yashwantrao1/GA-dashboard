"use client"

import * as React from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  type GaMetricCategory,
  GA_METRIC_CATEGORIES,
} from "@/lib/ga-metric-catalog"

type MetricPickerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (apiName: string) => void
  title?: string
}

export function MetricPickerDialog({
  open,
  onOpenChange,
  onSelect,
  title = "Choose metric",
}: MetricPickerDialogProps) {
  const [activeId, setActiveId] = React.useState<string>(
    GA_METRIC_CATEGORIES[0]?.id ?? "suggested",
  )

  React.useEffect(() => {
    if (open && GA_METRIC_CATEGORIES[0]) {
      setActiveId(GA_METRIC_CATEGORIES[0].id)
    }
  }, [open])

  const activeCategory: GaMetricCategory | undefined =
    GA_METRIC_CATEGORIES.find((c) => c.id === activeId) ??
    GA_METRIC_CATEGORIES[0]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,560px)] overflow-hidden p-0">
        <div className="border-b px-5 py-4 pr-12">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="mt-1">
            Pick a category, then select a metric. Names match the GA4 Data API.
          </DialogDescription>
        </div>
        <div className="grid max-h-[min(70vh,440px)] grid-cols-1 gap-0 sm:grid-cols-[min(11rem,40%)_1fr]">
          <nav
            className="flex max-h-48 flex-col gap-0.5 overflow-y-auto border-b p-2 sm:max-h-none sm:border-r sm:border-b-0"
            aria-label="Metric categories"
          >
            {GA_METRIC_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveId(cat.id)}
                className={cn(
                  "rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
                  activeId === cat.id
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {cat.label}
              </button>
            ))}
          </nav>
          <div className="min-h-0 overflow-y-auto p-2 sm:p-3">
            {activeCategory ? (
              <ul className="space-y-0.5" role="listbox" aria-label="Metrics">
                {activeCategory.metrics.map((m) => (
                  <li key={m.apiName}>
                    <button
                      type="button"
                      role="option"
                      className="w-full rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted"
                      onClick={() => {
                        onSelect(m.apiName)
                        onOpenChange(false)
                      }}
                    >
                      <span className="font-medium text-foreground">
                        {m.label}
                      </span>
                      <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                        {m.apiName}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
