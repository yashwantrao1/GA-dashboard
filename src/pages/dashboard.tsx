"use client"

import * as React from "react"

import DashboardHeader from "@/components/custom/dashboard-header"
import { HomeStats } from "@/components/custom/home-stats"
import { ReportsSnapshot } from "@/components/snapshot/reports-snapshot"
import type { ComparePairState } from "@/lib/compare-state"

export default function Dashboard() {
  const [comparePair, setComparePair] = React.useState<ComparePairState>(null)

  return (
    <>
      <DashboardHeader
        comparePair={comparePair}
        onComparePairChange={setComparePair}
      />
      <div className="mx-auto max-w-8xl space-y-10 p-6">
        <ReportsSnapshot />
        <div>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">
            Performance overview
          </h2>
          <div className="aspect-video w-full">
            <HomeStats comparePair={comparePair} />
          </div>
        </div>
      </div>
    </>
  )
}
