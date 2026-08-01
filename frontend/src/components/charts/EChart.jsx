/**
 * Minimal ECharts host.
 *
 * Registers only the modules the Advanced Dashboard actually uses — importing the
 * `echarts` barrel instead would pull ~330KB gzipped for charts we never draw.
 * There is no PieChart here on purpose: the outcomes card is HTML.
 */
import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import {
  AxisPointerComponent, GridComponent, MarkAreaComponent,
  MarkLineComponent, TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  LineChart, BarChart,
  GridComponent, TooltipComponent, AxisPointerComponent,
  MarkLineComponent, MarkAreaComponent,
  CanvasRenderer,
])

export default function EChart({ option, height = 260, className = '', ariaLabel }) {
  const hostRef = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    // getInstanceByDom guards StrictMode's double-mount, which would otherwise
    // leave a second orphaned instance drawing over the first.
    const chart = echarts.getInstanceByDom(host) || echarts.init(host, null, { renderer: 'canvas' })
    chartRef.current = chart

    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(host)

    return () => {
      observer.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!chartRef.current || !option) return
    // notMerge: replacing a series array (e.g. fewer categories after a range
    // change) would otherwise leave the old series rendered underneath.
    chartRef.current.setOption(option, { notMerge: true })
  }, [option])

  return (
    <div
      ref={hostRef}
      className={`sf-echart ${className}`}
      style={{ width: '100%', height }}
      role="img"
      aria-label={ariaLabel}
    />
  )
}
