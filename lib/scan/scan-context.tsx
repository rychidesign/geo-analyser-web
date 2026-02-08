'use client'

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'

// ============================================
// Types
// ============================================

export interface ScanJob {
  id: string          // Scan ID (from /scan/start)
  projectId: string
  projectName: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress: {
    current: number   // Completed queries count
    total: number     // Total queries count
    message?: string
  }
  error?: string
  errorCode?: string  // For specific error handling (SCAN_LIMIT_REACHED, INSUFFICIENT_CREDITS, etc.)
  scanId?: string     // Same as id for browser-based scans
  startedAt?: Date
}

interface ScanContextType {
  // State
  jobs: ScanJob[]
  isProcessing: boolean
  
  // Actions
  startScan: (projectId: string, projectName: string) => Promise<void>
  cancelScan: (projectId: string) => void
  clearJob: (projectId: string) => void
  clearCompleted: () => void
  
  // Helpers
  getJobForProject: (projectId: string) => ScanJob | undefined
  hasActiveJob: (projectId: string) => boolean
}

const ScanContext = createContext<ScanContextType | null>(null)

export function useScan() {
  const context = useContext(ScanContext)
  if (!context) {
    throw new Error('useScan must be used within a ScanProvider')
  }
  return context
}

interface ScanProviderProps {
  children: React.ReactNode
}

// ============================================
// Constants
// ============================================

/** Maximum queries per chunk — keeps edge runtime under 25s timeout */
const MAX_QUERIES_PER_CHUNK = 2

/** Maximum retry attempts for a failed chunk */
const MAX_CHUNK_RETRIES = 1

// ============================================
// Helper: Calculate optimal chunk size
// ============================================

/**
 * Calculate how many queries to include per chunk based on model count.
 * Each query×model takes ~3-8s (LLM call + evaluation), so we need to fit
 * within the 25s edge timeout.
 * 
 * @param modelCount - Number of models selected
 * @returns Number of queries per chunk
 */
function calculateChunkSize(modelCount: number): number {
  // Rough estimate: ~5s per query×model (LLM call + evaluation)
  // Edge timeout: 25s, with safety margin: 20s usable
  // So: Math.floor(20 / (modelCount * 5))
  const estimated = Math.max(1, Math.floor(20 / (modelCount * 5)))
  return Math.min(estimated, MAX_QUERIES_PER_CHUNK)
}

// ============================================
// Provider
// ============================================

export function ScanProvider({ children }: ScanProviderProps) {
  const [jobs, setJobs] = useState<ScanJob[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  
  // Track AbortControllers for active scans (keyed by projectId)
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map())
  
  // Use a ref to always have access to the latest jobs state
  const jobsRef = useRef<ScanJob[]>(jobs)
  useEffect(() => {
    jobsRef.current = jobs
    setIsProcessing(jobs.some(j => ['queued', 'running'].includes(j.status)))
  }, [jobs])
  
  // Prevent accidental window close during active scan
  useEffect(() => {
    const hasRunningScan = jobs.some(j => j.status === 'running')
    
    if (!hasRunningScan) {
      // No active scan — no need for listener
      return
    }
    
    // Add beforeunload listener to warn user before closing
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // Standard way to trigger browser's "Are you sure?" dialog
      event.preventDefault()
      // Chrome requires returnValue to be set
      event.returnValue = ''
      return ''
    }
    
    window.addEventListener('beforeunload', handleBeforeUnload)
    
    // Cleanup: remove listener when scan finishes or component unmounts
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [jobs])
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllersRef.current.forEach(controller => controller.abort())
      abortControllersRef.current.clear()
    }
  }, [])

  // Restore active scans on initial load — mark any "running" scans as stopped
  // (since browser-based scans can't survive a page refresh)
  useEffect(() => {
    const cleanupStuckScans = async () => {
      try {
        const res = await fetch('/api/scan/active')
        if (!res.ok) return
        
        const data = await res.json()
        const { stuckScansFixed } = data
        
        if (stuckScansFixed && stuckScansFixed > 0) {
          console.log(`[Scan] Auto-cleaned ${stuckScansFixed} stuck scan(s)`)
          window.dispatchEvent(new CustomEvent('stuck-scans-cleaned', { 
            detail: { count: stuckScansFixed } 
          }))
        }
      } catch (error) {
        console.warn('[Scan] Failed to cleanup stuck scans:', error)
      }
    }
    
    cleanupStuckScans()
  }, [])
  
  // ============================================
  // Update job helper
  // ============================================
  
  const updateJob = useCallback((projectId: string, updates: Partial<ScanJob>) => {
    setJobs(prev => prev.map(j => 
      j.projectId === projectId ? { ...j, ...updates } : j
    ))
  }, [])

  // ============================================
  // Process chunks in browser
  // ============================================

  /**
   * Process a single chunk of queries via the /scan/chunk API endpoint.
   * Retries once on failure before giving up.
   * 
   * @returns Object with completedQueries count and totalCostCents
   */
  const processChunk = useCallback(async (
    projectId: string,
    scanId: string,
    queryIds: string[],
    modelIds: string[],
    signal: AbortSignal
  ): Promise<{ completedQueries: number; totalCostCents: number; success: boolean }> => {
    let lastError: Error | null = null
    
    for (let attempt = 0; attempt <= MAX_CHUNK_RETRIES; attempt++) {
      try {
        if (signal.aborted) {
          return { completedQueries: 0, totalCostCents: 0, success: false }
        }
        
        const res = await fetch(`/api/projects/${projectId}/scan/chunk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scanId, queryIds, modelIds }),
          signal,
        })
        
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
          throw new Error(errorData.error || `Chunk failed (${res.status})`)
        }
        
        const data = await res.json()
        return {
          completedQueries: data.completedQueries || queryIds.length,
          totalCostCents: data.totalCostCents || 0,
          success: true,
        }
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return { completedQueries: 0, totalCostCents: 0, success: false }
        }
        
        lastError = error instanceof Error ? error : new Error(String(error))
        
        if (attempt < MAX_CHUNK_RETRIES) {
          console.warn(`[Scan] Chunk retry ${attempt + 1}/${MAX_CHUNK_RETRIES} for queries [${queryIds.join(',')}]:`, lastError.message)
          // Brief pause before retry
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }
    }
    
    // All retries exhausted — log error but continue with other chunks
    console.error(`[Scan] Chunk failed after ${MAX_CHUNK_RETRIES + 1} attempts:`, lastError?.message)
    return { completedQueries: queryIds.length, totalCostCents: 0, success: false }
  }, [])

  // ============================================
  // Start Scan (browser-based chunked)
  // ============================================

  const startScan = useCallback(async (projectId: string, projectName: string) => {
    // Check if already has active job
    const existingActiveJob = jobsRef.current.find(
      job => job.projectId === projectId && ['queued', 'running'].includes(job.status)
    )
    
    if (existingActiveJob) {
      console.log(`[Scan] Project ${projectId} already has an active scan`)
      return
    }
    
    // Create AbortController for this scan
    const abortController = new AbortController()
    abortControllersRef.current.set(projectId, abortController)
    const { signal } = abortController
    
    try {
      // Step 1: Call /scan/start to create scan record and get metadata
      const startRes = await fetch(`/api/projects/${projectId}/scan/start`, {
        method: 'POST',
        signal,
      })
      
      if (!startRes.ok) {
        const errorData = await startRes.json().catch(() => ({ error: 'Unknown error' }))
        
        // Add failed job to show error
        setJobs(prev => {
          const filtered = prev.filter(j => j.projectId !== projectId)
          return [...filtered, {
            id: '',
            projectId,
            projectName,
            status: 'failed' as const,
            progress: { current: 0, total: 0 },
            error: errorData.error || `Failed to start scan (${startRes.status})`,
            errorCode: errorData.code,
          }]
        })
        abortControllersRef.current.delete(projectId)
        return
      }
      
      const scanData = await startRes.json()
      const { 
        scanId, 
        queries, 
        models, 
        reservationId,
        followUpEnabled,
        followUpDepth,
      } = scanData
      
      const totalQueries = queries.length
      const queryIds: string[] = queries.map((q: { id: string }) => q.id)
      
      // Add running job
      const newJob: ScanJob = {
        id: scanId,
        projectId,
        projectName,
        status: 'running',
        scanId,
        progress: { 
          current: 0, 
          total: totalQueries, 
          message: `Starting scan (${totalQueries} queries, ${models.length} models)...` 
        },
        startedAt: new Date(),
      }
      
      setJobs(prev => {
        const filtered = prev.filter(j => j.projectId !== projectId)
        return [...filtered, newJob]
      })
      
      console.log(`[Scan] Started scan ${scanId}: ${totalQueries} queries × ${models.length} models`)
      
      // Step 2: Split queries into chunks and process sequentially
      const chunkSize = calculateChunkSize(models.length)
      const chunks: string[][] = []
      
      for (let i = 0; i < queryIds.length; i += chunkSize) {
        chunks.push(queryIds.slice(i, i + chunkSize))
      }
      
      console.log(`[Scan] Processing ${chunks.length} chunks (${chunkSize} queries per chunk)`)
      
      let completedQueries = 0
      let totalCostCents = 0
      let failedChunks = 0
      
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        // Check if cancelled
        if (signal.aborted) {
          console.log(`[Scan] Scan ${scanId} cancelled by user`)
          break
        }
        
        const chunkQueryIds = chunks[chunkIndex]
        
        // Update progress message
        updateJob(projectId, {
          progress: {
            current: completedQueries,
            total: totalQueries,
            message: `Processing query ${completedQueries + 1}/${totalQueries}...`,
          },
        })
        
        // Process chunk
        const result = await processChunk(projectId, scanId, chunkQueryIds, models, signal)
        
        if (signal.aborted) break
        
        if (result.success) {
          completedQueries += result.completedQueries
          totalCostCents += result.totalCostCents
        } else {
          // Chunk failed after retries — count queries as processed but failed
          completedQueries += chunkQueryIds.length
          failedChunks++
        }
        
        // Update progress
        updateJob(projectId, {
          progress: {
            current: completedQueries,
            total: totalQueries,
            message: completedQueries < totalQueries 
              ? `Processing query ${completedQueries + 1}/${totalQueries}...`
              : 'Finalizing scan...',
          },
        })
      }
      
      // Step 3: Complete the scan (calculate scores)
      if (!signal.aborted) {
        try {
          const completeRes = await fetch(`/api/projects/${projectId}/scan/${scanId}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reservationId }),
            signal,
          })
          
          if (!completeRes.ok) {
            console.error(`[Scan] Failed to complete scan ${scanId}:`, completeRes.status)
          }
        } catch (error) {
          if (!(error instanceof DOMException && (error as DOMException).name === 'AbortError')) {
            console.error(`[Scan] Error completing scan ${scanId}:`, error)
          }
        }
        
        // Mark as completed
        const finalStatus = failedChunks > 0 && failedChunks === chunks.length ? 'failed' : 'completed'
        
        updateJob(projectId, {
          status: finalStatus,
          progress: {
            current: completedQueries,
            total: totalQueries,
            message: finalStatus === 'completed' 
              ? `Scan completed (${completedQueries} queries processed)`
              : `Scan completed with errors (${failedChunks} chunks failed)`,
          },
          error: failedChunks > 0 ? `${failedChunks} chunk(s) failed` : undefined,
        })
        
        console.log(`[Scan] Scan ${scanId} ${finalStatus}: ${completedQueries}/${totalQueries} queries, cost: ${totalCostCents} cents, failed chunks: ${failedChunks}`)
      } else {
        // Scan was cancelled — mark as stopped on server
        try {
          await fetch(`/api/projects/${projectId}/scan/${scanId}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reservationId }),
          })
        } catch {
          // Best effort cleanup
        }
        
        updateJob(projectId, {
          status: 'cancelled',
          progress: {
            current: completedQueries,
            total: totalQueries,
            message: 'Scan cancelled by user',
          },
          error: 'Cancelled by user',
        })
        
        console.log(`[Scan] Scan ${scanId} cancelled: ${completedQueries}/${totalQueries} queries completed before cancel`)
      }
      
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        // Cancelled during start — already handled
        return
      }
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to start scan'
      console.error('[Scan] Error starting scan:', error)
      
      setJobs(prev => {
        const filtered = prev.filter(j => j.projectId !== projectId)
        return [...filtered, {
          id: '',
          projectId,
          projectName,
          status: 'failed' as const,
          progress: { current: 0, total: 0 },
          error: errorMessage,
        }]
      })
    } finally {
      abortControllersRef.current.delete(projectId)
    }
  }, [updateJob, processChunk])

  // ============================================
  // Cancel Scan
  // ============================================

  const cancelScan = useCallback((projectId: string) => {
    const controller = abortControllersRef.current.get(projectId)
    if (controller) {
      controller.abort()
      // The startScan async loop will handle cleanup and status update
    } else {
      // No active controller — just update status locally
      setJobs(prev => prev.map(j => 
        j.projectId === projectId && ['queued', 'running'].includes(j.status)
          ? { ...j, status: 'cancelled' as const, error: 'Cancelled by user' }
          : j
      ))
    }
  }, [])

  // ============================================
  // Clear helpers
  // ============================================

  const clearJob = useCallback((projectId: string) => {
    // Ensure any active scan is cancelled
    const controller = abortControllersRef.current.get(projectId)
    if (controller) {
      controller.abort()
      abortControllersRef.current.delete(projectId)
    }
    setJobs(prev => prev.filter(job => job.projectId !== projectId))
  }, [])
  
  const clearCompleted = useCallback(() => {
    setJobs(prev => prev.filter(job => !['completed', 'failed', 'cancelled'].includes(job.status)))
  }, [])
  
  // ============================================
  // Query helpers
  // ============================================

  const getJobForProject = useCallback((projectId: string) => {
    return jobs.find(job => job.projectId === projectId)
  }, [jobs])
  
  const hasActiveJob = useCallback((projectId: string) => {
    return jobs.some(
      job => job.projectId === projectId && ['queued', 'running'].includes(job.status)
    )
  }, [jobs])
  
  // ============================================
  // Render
  // ============================================

  return (
    <ScanContext.Provider value={{
      jobs,
      isProcessing,
      startScan,
      cancelScan,
      clearJob,
      clearCompleted,
      getJobForProject,
      hasActiveJob,
    }}>
      {children}
    </ScanContext.Provider>
  )
}
