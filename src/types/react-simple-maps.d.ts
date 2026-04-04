declare module "react-simple-maps" {
  import type { CSSProperties, ReactNode, SVGProps } from "react"

  export interface GeographyProps extends SVGProps<SVGPathElement> {
    geography: {
      rsmKey: string
      id?: string | number
      properties?: { name?: string }
    }
    style?: {
      default?: CSSProperties
      hover?: CSSProperties
      pressed?: CSSProperties
    }
  }
  export const Geography: React.FC<GeographyProps>

  export interface ComposableMapProps {
    width?: number
    height?: number
    projection?: string
    projectionConfig?: Record<string, unknown>
    className?: string
    children?: ReactNode
  }
  export const ComposableMap: React.FC<ComposableMapProps>

  export interface ZoomableGroupProps {
    center?: [number, number]
    zoom?: number
    minZoom?: number
    maxZoom?: number
    translateExtent?: [[number, number], [number, number]]
    filterZoomEvent?: (event: WheelEvent | MouseEvent | TouchEvent) => boolean
    onMoveStart?: (...args: unknown[]) => void
    onMove?: (...args: unknown[]) => void
    onMoveEnd?: (...args: unknown[]) => void
    className?: string
    children?: ReactNode
  }
  export const ZoomableGroup: React.FC<ZoomableGroupProps>

  export interface GeographiesRenderProps {
    geographies: GeographyProps["geography"][]
  }
  export interface GeographiesProps {
    geography: string | Record<string, unknown>
    children?: (props: GeographiesRenderProps) => ReactNode
  }
  export const Geographies: React.FC<GeographiesProps>
}
