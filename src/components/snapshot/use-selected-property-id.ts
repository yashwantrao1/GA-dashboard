"use client"

import * as React from "react"

/** Numeric GA4 property id for `/api/ga_api` (no `properties/` prefix). */
export function useSelectedPropertyId(): string | null {
  const [id, setId] = React.useState<string | null>(null)

  React.useEffect(() => {
    function read() {
      const raw = window.localStorage.getItem("ga:selectedProperty")
      if (!raw) {
        setId(null)
        return
      }
      setId(
        raw.startsWith("properties/")
          ? raw.replace("properties/", "")
          : raw,
      )
    }
    read()
    window.addEventListener("ga:selectedPropertyChanged", read)
    return () => window.removeEventListener("ga:selectedPropertyChanged", read)
  }, [])

  return id
}
