"use client"

import * as React from "react"

import DashboardHeader from "@/components/custom/dashboard-header"
import { HomeStats } from "@/components/custom/home-stats"
import type { ComparePairState } from "@/lib/compare-state"

export default function Dashboard() {
  const [comparePair, setComparePair] = React.useState<ComparePairState>(null)

  return (
    <>
      <DashboardHeader
        comparePair={comparePair}
        onComparePairChange={setComparePair}
      />
      <div className="mx-auto max-w-6xl p-6">
        <div className="aspect-video w-full">
          <HomeStats comparePair={comparePair} />
        </div>
      </div>
    </>
  )
}
