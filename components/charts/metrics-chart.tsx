'use client'

import { useState, useEffect } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

interface HistoryData {
  date: string
  scans: number
  overall: number
  visibility: number
  sentiment: number | null  // null when no visibility (n/a)
  ranking: number
}

interface MetricsChartProps {
  projectId: string
  days?: number
}

const METRIC_COLORS = {
  overall: '#10b981',      // Emerald-500
  visibility: '#3b82f6',   // Blue-500
  sentiment: '#f59e0b',    // Amber-500
  ranking: '#ec4899',      // Pink-500
}

const METRIC_LABELS = {
  overall: 'Overall Score',
  visibility: 'Visibility',
  sentiment: 'Sentiment',
  ranking: 'Ranking',
}

export function MetricsChart({ projectId, days = 30 }: MetricsChartProps) {
  const [data, setData] = useState<HistoryData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [visibleMetrics, setVisibleMetrics] = useState({
    overall: true,
    visibility: true,
    sentiment: true,
    ranking: true,
  })

  useEffect(() => {
    async function fetchHistory() {
      try {
        setLoading(true)
        console.log('Fetching history for project:', projectId)
        const response = await fetch(`/api/projects/${projectId}/history?days=${days}`)
        
        if (!response.ok) {
          console.error('History fetch failed:', response.status, response.statusText)
          throw new Error('Failed to fetch history')
        }
        
        const result = await response.json()
        console.log('History data received:', result)
        setData(result.history || [])
      } catch (err) {
        console.error('Error fetching history:', err)
        setError(err instanceof Error ? err.message : 'Failed to load history')
      } finally {
        setLoading(false)
      }
    }

    fetchHistory()
  }, [projectId, days])

  const toggleMetric = (metric: keyof typeof visibleMetrics) => {
    setVisibleMetrics(prev => ({ ...prev, [metric]: !prev[metric] }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-400">
        Loading chart data...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-red-400">
        {error}
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-500">
        No scan history available. Run some scans to see metrics over time.
      </div>
    )
  }

  // Format date for display (using UTC to avoid timezone shifts)
  const formattedData = data.map(d => {
    const date = new Date(d.date + 'T12:00:00Z') // Add noon UTC to avoid date shifts
    return {
      ...d,
      displayDate: date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC', // Force UTC interpretation
      }),
    }
  })

  return (
    <div className="space-y-6">
      {/* Legend / Metric toggles - Minimalist */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(METRIC_LABELS) as (keyof typeof METRIC_LABELS)[]).map(metric => (
          <button
            key={metric}
            onClick={() => toggleMetric(metric)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-all ${
              visibleMetrics[metric]
                ? 'text-zinc-100'
                : 'text-zinc-600'
            }`}
          >
            <span
              className="w-2 h-2 rounded-full transition-opacity"
              style={{ 
                backgroundColor: METRIC_COLORS[metric],
                opacity: visibleMetrics[metric] ? 1 : 0.3
              }}
            />
            {METRIC_LABELS[metric]}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div style={{ width: '100%', height: '280px' }}>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart
            data={formattedData}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" strokeOpacity={0.2} vertical={false} />
            <XAxis
              dataKey="displayDate"
              stroke="transparent"
              tick={{ fill: '#52525b', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              stroke="transparent"
              tick={{ fill: '#52525b', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              ticks={[0, 50, 100]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#09090b',
                border: '1px solid #27272a',
                borderRadius: '6px',
                color: '#fafafa',
                fontSize: '12px',
                padding: '8px 12px',
              }}
              labelStyle={{ color: '#71717a', fontSize: '11px', marginBottom: '4px' }}
              formatter={(value, name) => [
                value !== null && value !== undefined ? `${value}%` : 'n/a',
                METRIC_LABELS[name as keyof typeof METRIC_LABELS] || name,
              ]}
            />
            {visibleMetrics.overall && (
              <Line
                type="monotone"
                dataKey="overall"
                stroke={METRIC_COLORS.overall}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
              />
            )}
            {visibleMetrics.visibility && (
              <Line
                type="monotone"
                dataKey="visibility"
                stroke={METRIC_COLORS.visibility}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
              />
            )}
            {visibleMetrics.sentiment && (
              <Line
                type="monotone"
                dataKey="sentiment"
                stroke={METRIC_COLORS.sentiment}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
                connectNulls={false}
              />
            )}
            {visibleMetrics.ranking && (
              <Line
                type="monotone"
                dataKey="ranking"
                stroke={METRIC_COLORS.ranking}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Summary */}
      <div className="text-xs text-zinc-600 text-right">
        {data.reduce((sum, d) => sum + d.scans, 0)} scans over {data.length} {data.length === 1 ? 'day' : 'days'}
      </div>
    </div>
  )
}
