"use client"

import * as React from "react"
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from "react-simple-maps"
import iso from "i18n-iso-countries"
import enLocale from "i18n-iso-countries/langs/en.json"

import type { LocaleData } from "i18n-iso-countries"

iso.registerLocale(enLocale as LocaleData)

const GEO_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"

/** Matches snapshot `RowCountry` without importing the large reports file. */
export type CountryRow = { country: string; activeUsers: number }

const MAP_BASE = "hsl(220 14% 93%)"
const MAP_HIGH = "hsl(221 83% 53%)"
const MAP_STROKE = "#ffffff"

function buildUsersByTopoId(rows: CountryRow[] | undefined): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows ?? []) {
    if (!r.country || r.country === "(not set)") {
      continue
    }
    const a2 =
      iso.getAlpha2Code(r.country, "en") ??
      iso.getSimpleAlpha2Code(r.country, "en")
    if (!a2) {
      continue
    }
    const num = iso.alpha2ToNumeric(a2)
    if (num == null) {
      continue
    }
    m.set(String(num), (m.get(String(num)) ?? 0) + r.activeUsers)
  }
  return m
}

function heatFill(value: number, max: number): string {
  if (max <= 0 || value <= 0) {
    return MAP_BASE
  }
  const t = Math.min(1, Math.pow(value / max, 0.55))
  return `color-mix(in srgb, ${MAP_HIGH} ${Math.round(t * 100)}%, ${MAP_BASE})`
}

/** d3-zoom default filter rejects wheel (WheelEvent.button === 0); allow wheel + primary-button drag. */
function mapZoomFilter(event: WheelEvent | MouseEvent | TouchEvent): boolean {
  if (event.type === "wheel") {
    return true
  }
  if (event.type === "mousedown") {
    return (event as MouseEvent).button === 0
  }
  if (event.type === "touchstart") {
    return true
  }
  return false
}

export function UsersByCountryMap({ rows }: { rows: CountryRow[] | undefined }) {
  const usersById = React.useMemo(() => buildUsersByTopoId(rows), [rows])
  const maxUsers = React.useMemo(
    () => Math.max(1, ...usersById.values()),
    [usersById],
  )

  const [hover, setHover] = React.useState<{
    name: string
    users: number
  } | null>(null)

  return (
    <div className="relative flex min-h-[200px] w-full flex-1 flex-col items-stretch justify-center rounded-lg border border-gray-100 bg-gray-50/80 p-2">
      <div
        className="relative w-full flex-1 touch-none [&_svg]:max-h-[260px] [&_svg]:w-full [&_svg]:max-w-full"
        title="Scroll to zoom, drag to pan"
      >
        <ComposableMap
          projection="geoEqualEarth"
          width={800}
          height={380}
          projectionConfig={{ scale: 165, center: [0, 12] }}
          className="mx-auto block h-auto w-full cursor-grab active:cursor-grabbing"
        >
          <ZoomableGroup
            zoom={1}
            minZoom={0.5}
            maxZoom={12}
            filterZoomEvent={mapZoomFilter}
          >
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const id = String(geo.id ?? "")
                  const users = usersById.get(id) ?? 0
                  const name =
                    (geo.properties as { name?: string } | undefined)?.name ??
                    "Unknown"
                  const fill = heatFill(users, maxUsers)
                  const hasData = users > 0
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={fill}
                      stroke={MAP_STROKE}
                      strokeWidth={0.35}
                      style={{
                        default: {
                          outline: "none",
                          pointerEvents: hasData ? "auto" : "none",
                        },
                        hover: {
                          outline: "none",
                          fill: hasData ? heatFill(users * 1.08, maxUsers) : fill,
                          cursor: hasData ? "default" : "inherit",
                        },
                        pressed: { outline: "none" },
                      }}
                      onMouseEnter={() => {
                        if (hasData) {
                          setHover({ name, users })
                        }
                      }}
                      onMouseLeave={() => setHover(null)}
                    />
                  )
                })
              }
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>
      </div>
      {hover && hover.users > 0 ? (
        <div className="pointer-events-none absolute bottom-2 left-2 right-2 rounded-md bg-white/95 px-2 py-1.5 text-center text-[11px] shadow-sm ring-1 ring-gray-200/80">
          <span className="font-medium text-gray-800">{hover.name}</span>
          <span className="ml-1.5 tabular-nums text-gray-600">
            {hover.users.toLocaleString()} active users
          </span>
        </div>
      ) : null}
    </div>
  )
}
