'use client'

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'

// Types
export interface ScanJob {
  id: string  // scan ID from database
  projectId: string
  projectName: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress: {
    current: number
    total: number
    message?: string
  }
  error?: string
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

// Note: All evaluation now uses AI via /api/scan/evaluate endpoint

interface ScanProviderProps {
  children: React.ReactNode
}

export function ScanProvider({ children }: ScanProviderProps) {
  const [jobs, setJobs] = useState<ScanJob[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  
  const processingRef = useRef(false)
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map())
  
  // Use a ref to always have access to the latest jobs state
  const jobsRef = useRef<ScanJob[]>(jobs)
  useEffect(() => {
    jobsRef.current = jobs
  }, [jobs])
  
  // Process the queue
  const processQueue = useCallback(async () => {
    if (processingRef.current) return
    
    const nextJob = jobsRef.current.find(job => job.status === 'queued')
    if (!nextJob) {
      setIsProcessing(false)
      return
    }
    
    processingRef.current = true
    setIsProcessing(true)
    
    const abortController = new AbortController()
    abortControllersRef.current.set(nextJob.projectId, abortController)
    
    try {
      // Update job to running
      setJobs(prev => prev.map(job => 
        job.projectId === nextJob.projectId 
          ? { ...job, status: 'running' as const, startedAt: new Date() }
          : job
      ))
      
      // 1. Start scan - creates scan record and gets config
      const startRes = await fetch(`/api/projects/${nextJob.projectId}/scan/start`, {
        method: 'POST',
        signal: abortController.signal,
      })
      
      if (!startRes.ok) {
        const errorData = await startRes.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || `Failed to start scan (${startRes.status})`)
      }
      
      const { scanId, queries, models, totalOperations, brandVariations, domain } = await startRes.json()
      
      // Update job with scan ID and progress info
      setJobs(prev => prev.map(job => 
        job.projectId === nextJob.projectId 
          ? { ...job, id: scanId, progress: { current: 0, total: totalOperations, message: 'Starting...' } }
          : job
      ))
      
      // 2. Process each query × model
      let completed = 0
      
      for (const query of queries) {
        for (const model of models) {
          // Check if cancelled
          if (abortController.signal.aborted) {
            throw new Error('Scan cancelled by user')
          }
          
          // Update progress message
          setJobs(prev => prev.map(job => 
            job.projectId === nextJob.projectId 
              ? { 
                  ...job, 
                  progress: { 
                    current: completed, 
                    total: totalOperations, 
                    message: `Testing ${model}...` 
                  } 
                }
              : job
          ))
          
          try {
            // Call LLM
            const llmRes = await fetch('/api/llm/call', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ model, query: query.query_text }),
              signal: abortController.signal,
            })
            
            if (!llmRes.ok) {
              console.warn(`[Scan] LLM call failed for ${model}`)
              continue
            }
            
            const llmResult = await llmRes.json()
            
            // Analyze response using AI evaluation
            let metrics
            let evaluationCost = null
            
            const evalRes = await fetch('/api/scan/evaluate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                content: llmResult.content,
                brandVariations,
                domain,
              }),
              signal: abortController.signal,
            })
            
            if (evalRes.ok) {
              const evalResult = await evalRes.json()
              metrics = evalResult.metrics
              evaluationCost = evalResult.evaluation
            } else {
              throw new Error('AI evaluation failed')
            }
            
            // Save result
            await fetch('/api/scan/save-result', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                scanId,
                model,
                query: query.query_text,
                response: llmResult.content,
                inputTokens: llmResult.inputTokens,
                outputTokens: llmResult.outputTokens,
                metrics,
                evaluationCost, // Include AI evaluation cost if used
              }),
              signal: abortController.signal,
            })
            
            completed++
            
            // Update progress
            setJobs(prev => prev.map(job => 
              job.projectId === nextJob.projectId 
                ? { ...job, progress: { current: completed, total: totalOperations } }
                : job
            ))
            
          } catch (err: any) {
            if (err.name === 'AbortError') throw err
            console.warn(`[Scan] Error processing ${model}:`, err.message)
          }
          
          // Small delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 300))
        }
      }
      
      // 3. Complete scan
      await fetch(`/api/projects/${nextJob.projectId}/scan/${scanId}/complete`, {
        method: 'POST',
        signal: abortController.signal,
      })
      
      // Mark as completed
      setJobs(prev => prev.map(job => 
        job.projectId === nextJob.projectId 
          ? { ...job, status: 'completed' as const, progress: { current: completed, total: totalOperations } }
          : job
      ))
      
      console.log(`[Scan] Completed scan for ${nextJob.projectName}: ${completed}/${totalOperations}`)
      
    } catch (error: any) {
      if (error.name === 'AbortError' || error.message === 'Scan cancelled by user') {
        setJobs(prev => prev.map(job => 
          job.projectId === nextJob.projectId 
            ? { ...job, status: 'cancelled' as const, error: 'Cancelled by user' }
            : job
        ))
      } else {
        console.error('[Scan] Error:', error)
        setJobs(prev => prev.map(job => 
          job.projectId === nextJob.projectId 
            ? { ...job, status: 'failed' as const, error: error.message }
            : job
        ))
      }
    } finally {
      processingRef.current = false
      abortControllersRef.current.delete(nextJob.projectId)
      
      // Use jobsRef.current instead of stale jobs closure
      // Process next job after short delay
      setTimeout(() => {
        const currentJobs = jobsRef.current
        const hasMoreJobs = currentJobs.some(j => j.status === 'queued' && j.projectId !== nextJob.projectId)
        if (hasMoreJobs) {
          processQueue()
        } else {
          setIsProcessing(false)
        }
      }, 500)
    }
  }, []) // Remove jobs from dependencies since we use jobsRef
  
  // Auto-process queue when jobs change
  useEffect(() => {
    const hasQueuedJobs = jobs.some(job => job.status === 'queued')
    if (hasQueuedJobs && !processingRef.current) {
      processQueue()
    }
  }, [jobs, processQueue])
  
  // Actions
  const startScan = useCallback(async (projectId: string, projectName: string) => {
    // Check if already has active job - use functional update to get current state
    setJobs(prev => {
      const existingActiveJob = prev.find(
        job => job.projectId === projectId && ['queued', 'running'].includes(job.status)
      )
      
      if (existingActiveJob) {
        console.log(`[Scan] Project ${projectId} already has an active scan`)
        return prev // Return unchanged
      }
      
      // Remove any completed/failed/cancelled jobs for this project before adding new one
      const filteredJobs = prev.filter(
        job => job.projectId !== projectId || ['queued', 'running'].includes(job.status)
      )
      
      // Add to queue
      const newJob: ScanJob = {
        id: '',
        projectId,
        projectName,
        status: 'queued',
        progress: { current: 0, total: 0 },
      }
      
      return [...filteredJobs, newJob]
    })
  }, [])
  
  const cancelScan = useCallback(async (projectId: string) => {
    const controller = abortControllersRef.current.get(projectId)
    if (controller) {
      controller.abort()
    }
    
    // Find the job to get scan ID
    const job = jobsRef.current.find(j => j.projectId === projectId)
    
    // Update database if scan has started (has an ID)
    if (job?.id) {
      try {
        await fetch(`/api/projects/${projectId}/scan/${job.id}/stop`, {
          method: 'POST',
        })
      } catch (err) {
        console.warn('[Scan] Failed to update scan status in database:', err)
      }
    }
    
    setJobs(prev => prev.map(job => 
      job.projectId === projectId && ['queued', 'running'].includes(job.status)
        ? { ...job, status: 'cancelled' as const, error: 'Stopped by user' }
        : job
    ))
  }, [])
  
  const clearJob = useCallback((projectId: string) => {
    setJobs(prev => prev.filter(job => job.projectId !== projectId))
  }, [])
  
  const clearCompleted = useCallback(() => {
    setJobs(prev => prev.filter(job => !['completed', 'failed', 'cancelled'].includes(job.status)))
  }, [])
  
  // Helpers
  const getJobForProject = useCallback((projectId: string) => {
    return jobs.find(job => job.projectId === projectId)
  }, [jobs])
  
  const hasActiveJob = useCallback((projectId: string) => {
    return jobs.some(
      job => job.projectId === projectId && ['queued', 'running'].includes(job.status)
    )
  }, [jobs])
  
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
