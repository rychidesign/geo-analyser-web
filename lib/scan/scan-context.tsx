'use client'

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'

// Types
export interface ScanJob {
  id: string          // Queue ID (initially) or scan ID (once created)
  queueId: string     // Queue ID for status polling
  projectId: string
  projectName: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress: {
    current: number
    total: number
    message?: string
  }
  error?: string
  errorCode?: string  // For specific error handling (SCAN_LIMIT_REACHED, INSUFFICIENT_CREDITS, etc.)
  scanId?: string     // Actual scan ID once processing starts
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

// Polling interval for checking scan status (in ms)
const POLL_INTERVAL = 2000

export function ScanProvider({ children }: ScanProviderProps) {
  const [jobs, setJobs] = useState<ScanJob[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [initialized, setInitialized] = useState(false)
  
  // Track active polling intervals
  const pollingRef = useRef<Map<string, NodeJS.Timeout>>(new Map())
  
  // Use a ref to always have access to the latest jobs state
  const jobsRef = useRef<ScanJob[]>(jobs)
  useEffect(() => {
    jobsRef.current = jobs
    // Update isProcessing based on current jobs
    setIsProcessing(jobs.some(j => ['queued', 'running'].includes(j.status)))
  }, [jobs])
  
  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      pollingRef.current.forEach(interval => clearInterval(interval))
      pollingRef.current.clear()
    }
  }, [])
  
  // Restore active scans on initial load (survives page refresh)
  useEffect(() => {
    if (initialized) return
    
    const restoreActiveScans = async () => {
      try {
        const res = await fetch('/api/scan/active')
        if (!res.ok) {
          setInitialized(true)
          return
        }
        
        const { scans } = await res.json()
        
        if (scans && scans.length > 0) {
          console.log(`[Scan] Restoring ${scans.length} active scan(s)`)
          
          const restoredJobs: ScanJob[] = scans.map((scan: any) => ({
            id: scan.queueId,
            queueId: scan.queueId,
            projectId: scan.projectId,
            projectName: scan.projectName,
            status: scan.status as ScanJob['status'],
            scanId: scan.scanId,
            progress: scan.progress,
            error: scan.error,
            startedAt: scan.startedAt ? new Date(scan.startedAt) : undefined,
          }))
          
          setJobs(restoredJobs)
          
          // Start polling for each restored job (done after startPolling is defined)
          // We'll handle this in a separate effect
        }
      } catch (error) {
        console.warn('[Scan] Failed to restore active scans:', error)
      } finally {
        setInitialized(true)
      }
    }
    
    restoreActiveScans()
  }, [initialized])
  
  // Start polling for a scan's status
  const startPolling = useCallback((projectId: string, queueId: string) => {
    // Don't start if already polling
    if (pollingRef.current.has(projectId)) return
    
    const pollStatus = async () => {
      const job = jobsRef.current.find(j => j.projectId === projectId)
      if (!job || !['queued', 'running'].includes(job.status)) {
        // Stop polling if job is done or removed
        const interval = pollingRef.current.get(projectId)
        if (interval) {
          clearInterval(interval)
          pollingRef.current.delete(projectId)
        }
        return
      }
      
      try {
        const res = await fetch(`/api/projects/${projectId}/scan/queue/${queueId}`)
        if (!res.ok) {
          console.warn(`[Scan Poll] Failed to get status: ${res.status}`)
          return
        }
        
        const data = await res.json()
        
        setJobs(prev => prev.map(j => {
          if (j.projectId !== projectId) return j
          
          return {
            ...j,
            status: data.status as ScanJob['status'],
            scanId: data.scanId || j.scanId,
            progress: {
              current: data.progress.current,
              total: data.progress.total,
              message: data.progress.message,
            },
            error: data.error,
            startedAt: data.startedAt ? new Date(data.startedAt) : j.startedAt,
          }
        }))
        
        // If completed or failed, stop polling
        if (['completed', 'failed', 'cancelled'].includes(data.status)) {
          const interval = pollingRef.current.get(projectId)
          if (interval) {
            clearInterval(interval)
            pollingRef.current.delete(projectId)
          }
        }
        
      } catch (error) {
        console.warn('[Scan Poll] Error:', error)
      }
    }
    
    // Initial poll
    pollStatus()
    
    // Set up interval
    const interval = setInterval(pollStatus, POLL_INTERVAL)
    pollingRef.current.set(projectId, interval)
  }, [])
  
  // Stop polling for a project
  const stopPolling = useCallback((projectId: string) => {
    const interval = pollingRef.current.get(projectId)
    if (interval) {
      clearInterval(interval)
      pollingRef.current.delete(projectId)
    }
  }, [])
  
  // Start polling for restored jobs after initialization
  useEffect(() => {
    if (!initialized) return
    
    // Start polling for any active jobs that aren't already being polled
    jobs.forEach(job => {
      if (['queued', 'running'].includes(job.status) && job.queueId && !pollingRef.current.has(job.projectId)) {
        startPolling(job.projectId, job.queueId)
      }
    })
  }, [initialized, jobs, startPolling])
  
  // Actions
  const startScan = useCallback(async (projectId: string, projectName: string) => {
    // Check if already has active job
    const existingActiveJob = jobsRef.current.find(
      job => job.projectId === projectId && ['queued', 'running'].includes(job.status)
    )
    
    if (existingActiveJob) {
      console.log(`[Scan] Project ${projectId} already has an active scan`)
      return
    }
    
    try {
      // Queue the scan on the server
      const res = await fetch(`/api/projects/${projectId}/scan/queue`, {
        method: 'POST',
      })
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
        
        // Special case: scan already queued
        if (errorData.code === 'SCAN_ALREADY_QUEUED') {
          console.log(`[Scan] Scan already queued for ${projectId}, starting to poll`)
          const queueId = errorData.queueId
          
          // Add job to track it
          setJobs(prev => {
            const filtered = prev.filter(
              job => job.projectId !== projectId || ['queued', 'running'].includes(job.status)
            )
            return [...filtered, {
              id: queueId,
              queueId,
              projectId,
              projectName,
              status: 'running' as const,
              progress: { current: 0, total: 0, message: 'Reconnecting...' },
            }]
          })
          
          // Start polling
          startPolling(projectId, queueId)
          return
        }
        
        // Add failed job to show error
        setJobs(prev => {
          const filtered = prev.filter(j => j.projectId !== projectId)
          return [...filtered, {
            id: '',
            queueId: '',
            projectId,
            projectName,
            status: 'failed' as const,
            progress: { current: 0, total: 0 },
            error: errorData.error || `Failed to start scan (${res.status})`,
            errorCode: errorData.code,
          }]
        })
        return
      }
      
      const { queueId, totalOperations, message } = await res.json()
      
      // Remove any completed/failed jobs for this project and add new job
      setJobs(prev => {
        const filtered = prev.filter(
          job => job.projectId !== projectId || ['queued', 'running'].includes(job.status)
        )
        
        const newJob: ScanJob = {
          id: queueId,
          queueId,
          projectId,
          projectName,
          status: 'queued',
          progress: { 
            current: 0, 
            total: totalOperations, 
            message: message || 'Queued for processing...' 
          },
        }
        
        return [...filtered, newJob]
      })
      
      // Start polling for status updates
      startPolling(projectId, queueId)
      
      console.log(`[Scan] Queued scan for ${projectName}: ${queueId}`)
      
    } catch (error: any) {
      console.error('[Scan] Error starting scan:', error)
      
      setJobs(prev => {
        const filtered = prev.filter(j => j.projectId !== projectId)
        return [...filtered, {
          id: '',
          queueId: '',
          projectId,
          projectName,
          status: 'failed' as const,
          progress: { current: 0, total: 0 },
          error: error.message || 'Failed to start scan',
        }]
      })
    }
  }, [startPolling])
  
  const cancelScan = useCallback(async (projectId: string) => {
    const job = jobsRef.current.find(j => j.projectId === projectId)
    if (!job || !job.queueId) return
    
    // Stop polling
    stopPolling(projectId)
    
    try {
      // Cancel on server
      await fetch(`/api/projects/${projectId}/scan/queue/${job.queueId}`, {
        method: 'DELETE',
      })
    } catch (err) {
      console.warn('[Scan] Failed to cancel scan on server:', err)
    }
    
    // Update local state
    setJobs(prev => prev.map(j => 
      j.projectId === projectId && ['queued', 'running'].includes(j.status)
        ? { ...j, status: 'cancelled' as const, error: 'Cancelled by user' }
        : j
    ))
  }, [stopPolling])
  
  const clearJob = useCallback((projectId: string) => {
    stopPolling(projectId)
    setJobs(prev => prev.filter(job => job.projectId !== projectId))
  }, [stopPolling])
  
  const clearCompleted = useCallback(() => {
    // Stop all polling for completed jobs
    jobsRef.current.forEach(job => {
      if (['completed', 'failed', 'cancelled'].includes(job.status)) {
        stopPolling(job.projectId)
      }
    })
    setJobs(prev => prev.filter(job => !['completed', 'failed', 'cancelled'].includes(job.status)))
  }, [stopPolling])
  
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
