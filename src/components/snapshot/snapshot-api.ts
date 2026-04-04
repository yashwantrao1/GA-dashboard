/** Client helper: call a Reports snapshot endpoint on `ga_api`. */

export async function fetchSnapshot<T = unknown>(
  type: string,
  propertyId: string,
  dateRange?: { start: string; end: string },
): Promise<T> {
  const params = new URLSearchParams({
    type,
    propertyId,
  })
  if (dateRange?.start && dateRange?.end) {
    params.set("start", dateRange.start)
    params.set("end", dateRange.end)
  }
  const url = `/api/ga_api?${params.toString()}`
  const res = await fetch(url)
  const data = (await res.json()) as T & { error?: string }
  if (!res.ok) {
    throw new Error(data?.error ?? `Snapshot ${type} failed`)
  }
  return data as T
}
