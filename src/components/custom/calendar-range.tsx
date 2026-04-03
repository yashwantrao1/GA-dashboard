"use client"

import * as React from "react"
import { type DateRange } from "react-day-picker"

import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type CalendarRangePickerProps = {
  value: DateRange | undefined
  onChange: (range: DateRange | undefined) => void
  /** Single month calendar in popovers; use 2 for a wide layout. */
  numberOfMonths?: number
  /** Wrap in Card; set false when used inside another panel. */
  showCard?: boolean
  className?: string
}

export function CalendarRangePicker({
  value,
  onChange,
  numberOfMonths = 1,
  showCard = true,
  className,
}: CalendarRangePickerProps) {
  const calendar = (
    <Calendar
      mode="range"
      defaultMonth={value?.from}
      selected={value}
      onSelect={onChange}
      numberOfMonths={numberOfMonths}
      disabled={(date) =>
        date > new Date() || date < new Date("1900-01-01")
      }
      className={cn("rounded-md", className)}
    />
  )

  if (!showCard) {
    return calendar
  }

  return (
    <Card className="mx-auto w-fit p-0">
      <CardContent className="p-0">{calendar}</CardContent>
    </Card>
  )
}
