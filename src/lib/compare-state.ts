/** Two-property compare: primary is pinned first; secondary is chosen after (must differ). */
export type ComparePairState = {
  primary: string
  secondary: string | null
} | null
