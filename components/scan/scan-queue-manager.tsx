'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, X, CheckCircle, XCircle, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface ScanJob {
  projectId: string
  projectName: string
  scanId?: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: {
    completed: number
    total: number
  }
  error?: string
}

interface ScanQueueManagerProps {
  onScanComplete?: (projectId: string) => void
  onScanError?: (projectId: string, error: string) => void
}

export function ScanQueueManager({ onScanComplete, onScanError }: ScanQueueManagerProps) {
  const [queue, setQueue] = useState<ScanJob[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const processingRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Load queue from localStorage on mount
  useEffect(() => {
    const savedQueue = localStorage.getItem('scan_queue')
    if (savedQueue) {
      try {
        const parsed = JSON.parse(savedQueue)
        setQueue(parsed)
        console.log('[Queue] Restored from localStorage:', parsed)
      } catch (e) {
        console.error('[Queue] Failed to parse saved queue:', e)
      }
    }
  }, [])

  // Save queue to localStorage whenever it changes
  useEffect(() => {
    if (queue.length > 0) {
      localStorage.setItem('scan_queue', JSON.stringify(queue))
      console.log('[Queue] Saved to localStorage:', queue.length, 'jobs')
    } else {
      localStorage.removeItem('scan_queue')
    }
  }, [queue])

  // Add scan to queue
  const addToQueue = useCallback((projectId: string, projectName: string) => {
    setQueue(prev => {
      // Check if already in queue
      if (prev.some(job => job.projectId === projectId && job.status !== 'completed' && job.status !== 'failed')) {
        console.log(`[Queue] Project ${projectId} already in queue`)
        return prev
      }

      return [...prev, {
        projectId,
        projectName,
        status: 'pending',
        progress: { completed: 0, total: 0 },
      }]
    })
  }, [])

  // Remove completed/failed scans from queue
  const clearCompleted = useCallback(() => {
    setQueue(prev => prev.filter(job => job.status === 'pending' || job.status === 'running'))
  }, [])

  // Cancel running scan
  const cancelScan = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    
    setQueue(prev => prev.map(job => 
      job.status === 'running' 
        ? { ...job, status: 'failed' as const, error: 'Cancelled by user' }
        : job
    ))
    
    setIsProcessing(false)
    processingRef.current = false
  }, [])

  // Helper: Analyze response using regex
  const analyzeResponse = useCallback((response: string, brandVariations: string[], domain: string) => {
    const lowerResponse = response.toLowerCase()
    
    const brandMentioned = brandVariations.some(brand => 
      lowerResponse.includes(brand.toLowerCase())
    )
    
    const domainMentioned = lowerResponse.includes(domain.toLowerCase())
    
    const positiveWords = ['recommend', 'best', 'excellent', 'great', 'top', 'leading', 'premier']
    const negativeWords = ['avoid', 'worst', 'poor', 'bad', 'disappointing']
    
    const positiveCount = positiveWords.filter(word => lowerResponse.includes(word)).length
    const negativeCount = negativeWords.filter(word => lowerResponse.includes(word)).length
    
    const sentimentScore = positiveCount > 0 ? 
      (negativeCount > 0 ? 50 : 75) : 
      (negativeCount > 0 ? 25 : 50)
    
    return {
      visibility_score: brandMentioned ? 100 : 0,
      sentiment_score: brandMentioned ? sentimentScore : 0,
      citation_score: domainMentioned ? 100 : 0,
      ranking_score: brandMentioned ? (positiveCount > 0 ? 90 : 50) : 0,
      recommendation_score: brandMentioned ? sentimentScore : 0,
    }
  }, [])

  // Process queue (frontend-driven)
  const processQueue = useCallback(async () => {
    if (processingRef.current) return
    
    const nextJob = queue.find(job => job.status === 'pending')
    if (!nextJob) {
      setIsProcessing(false)
      return
    }

    processingRef.current = true
    setIsProcessing(true)
    abortControllerRef.current = new AbortController()

    try {
      // Start scan
      console.log(`[Queue] Starting scan for project ${nextJob.projectId}`)
      
      setQueue(prev => prev.map(job =>
        job.projectId === nextJob.projectId
          ? { ...job, status: 'running' as const }
          : job
      ))

      const startRes = await fetch(`/api/projects/${nextJob.projectId}/scan/start`, {
        method: 'POST',
        signal: abortControllerRef.current.signal,
      })

      if (!startRes.ok) {
        throw new Error('Failed to start scan')
      }

      const { scanId, queries, models, totalOperations, evaluationMethod, brandVariations, domain } = await startRes.json()

      setQueue(prev => prev.map(job =>
        job.projectId === nextJob.projectId
          ? { ...job, scanId, progress: { completed: 0, total: totalOperations } }
          : job
      ))

      // Process each query × model (frontend orchestration)
      let completed = 0

      for (let qIdx = 0; qIdx < queries.length; qIdx++) {
        const query = queries[qIdx]
        
        for (let mIdx = 0; mIdx < models.length; mIdx++) {
          const model = models[mIdx]
          
          console.log(`[Queue] Processing: query ${qIdx+1}/${queries.length}, model ${mIdx+1}/${models.length} (${model})`)

          try {
            // 1. Call LLM via thin proxy (can take 10-60s, but frontend waits)
            const llmRes = await fetch('/api/llm/call', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: model,
                query: query.query_text,
              }),
              signal: abortControllerRef.current.signal,
            })

            if (!llmRes.ok) {
              const errorData = await llmRes.json()
              console.warn(`[Queue] LLM call failed for ${model}: ${errorData.error}`)
              continue // Skip this model, continue with others
            }

            const llmResult = await llmRes.json()

            // 2. Analyze response (frontend)
            const metrics = analyzeResponse(llmResult.content, brandVariations, domain)

            // 3. Save result (fast endpoint < 1s)
            const saveRes = await fetch('/api/scan/save-result', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                scanId,
                model: model,
                query: query.query_text,
                response: llmResult.content,
                inputTokens: llmResult.inputTokens,
                outputTokens: llmResult.outputTokens,
                metrics,
              }),
              signal: abortControllerRef.current.signal,
            })

            if (!saveRes.ok) {
              console.warn(`[Queue] Failed to save result for ${model}`)
              continue
            }

            completed++

            // Update progress
            setQueue(prev => prev.map(job =>
              job.projectId === nextJob.projectId
                ? { ...job, progress: { completed, total: totalOperations } }
                : job
            ))

          } catch (err: any) {
            if (err.name === 'AbortError') throw err
            console.warn(`[Queue] Error processing ${model}:`, err.message)
            // Continue with next model
          }

          // Small delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }

      // Mark scan as completed
      await fetch(`/api/projects/${nextJob.projectId}/scan/${scanId}/complete`, {
        method: 'POST',
        signal: abortControllerRef.current.signal,
      })

      // Mark as completed in UI
      setQueue(prev => prev.map(job =>
        job.projectId === nextJob.projectId
          ? { ...job, status: 'completed' as const }
          : job
      ))

      onScanComplete?.(nextJob.projectId)
      
      console.log(`[Queue] Scan completed for project ${nextJob.projectId}: ${completed}/${totalOperations} successful`)

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[Queue] Scan cancelled')
        return
      }

      console.error('[Queue] Scan error:', error)
      
      setQueue(prev => prev.map(job =>
        job.projectId === nextJob.projectId
          ? { ...job, status: 'failed' as const, error: error.message }
          : job
      ))

      onScanError?.(nextJob.projectId, error.message)
    } finally {
      processingRef.current = false
      abortControllerRef.current = null
      
      // Process next in queue after short delay
      setTimeout(() => {
        if (queue.some(j => j.status === 'pending')) {
          processQueue()
        } else {
          setIsProcessing(false)
        }
      }, 1000)
    }
  }, [queue, onScanComplete, onScanError, analyzeResponse])

  // Auto-process queue when new jobs added
  useEffect(() => {
    if (queue.some(job => job.status === 'pending') && !processingRef.current) {
      processQueue()
    }
  }, [queue, processQueue])

  // Expose API to parent components
  useEffect(() => {
    (window as any).__addScanToQueue = addToQueue
  }, [addToQueue])

  if (queue.length === 0) return null

  return (
    <Card className="bg-zinc-900/90 border-zinc-800 mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Scan Queue</CardTitle>
          <div className="flex items-center gap-2">
            {isProcessing && (
              <Button
                size="sm"
                variant="ghost"
                onClick={cancelScan}
                className="h-7 text-xs text-red-400 hover:text-red-300"
              >
                <X className="w-3 h-3 mr-1" />
                Cancel
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={clearCompleted}
              className="h-7 text-xs"
            >
              Clear Completed
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {queue.map((job, idx) => (
          <div
            key={`${job.projectId}-${idx}`}
            className="p-3 bg-zinc-800/50 rounded-lg"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {job.status === 'running' && <Loader2 className="w-4 h-4 animate-spin text-blue-400" />}
                {job.status === 'pending' && <Clock className="w-4 h-4 text-zinc-400" />}
                {job.status === 'completed' && <CheckCircle className="w-4 h-4 text-emerald-400" />}
                {job.status === 'failed' && <XCircle className="w-4 h-4 text-red-400" />}
                <span className="font-medium text-sm">{job.projectName}</span>
              </div>
              <Badge
                className={
                  job.status === 'running' ? 'bg-blue-500/10 text-blue-400' :
                  job.status === 'pending' ? 'bg-zinc-500/10 text-zinc-400' :
                  job.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                  'bg-red-500/10 text-red-400'
                }
              >
                {job.status}
              </Badge>
            </div>

            {job.progress.total > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>{job.progress.completed} / {job.progress.total}</span>
                  <span>{Math.round((job.progress.completed / job.progress.total) * 100)}%</span>
                </div>
                <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${(job.progress.completed / job.progress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {job.error && (
              <div className="mt-2 text-xs text-red-400">{job.error}</div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
