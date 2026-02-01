'use client'

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { getFollowUpQuestion, type QueryType } from './follow-up-templates'

// Types
interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

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
  errorCode?: string  // For specific error handling (SCAN_LIMIT_REACHED, INSUFFICIENT_CREDITS, etc.)
  startedAt?: Date
  reservationId?: string  // Credit reservation ID
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
        const error = new Error(errorData.error || `Failed to start scan (${startRes.status})`) as Error & { code?: string }
        error.code = errorData.code
        throw error
      }
      
      const { 
        scanId, 
        queries, 
        models, 
        totalOperations, 
        brandVariations, 
        domain,
        language,
        reservationId,
        followUpEnabled,
        followUpDepth,
      } = await startRes.json()
      
      // Update job with scan ID, reservation ID, and progress info
      setJobs(prev => prev.map(job => 
        job.projectId === nextJob.projectId 
          ? { ...job, id: scanId, reservationId, progress: { current: 0, total: totalOperations, message: 'Starting...' } }
          : job
      ))
      
      // 2. Process each query × model (with optional follow-ups)
      let completed = 0
      
      for (const query of queries) {
        const queryType = (query.query_type || 'informational') as QueryType
        
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
            // === INITIAL QUERY (Level 0) ===
            const llmRes = await fetch('/api/llm/call', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ model, query: query.query_text, language }),
              signal: abortController.signal,
            })
            
            if (!llmRes.ok) {
              console.warn(`[Scan] LLM call failed for ${model}`)
              continue
            }
            
            const llmResult = await llmRes.json()
            
            // Evaluate initial response
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
            
            // Save initial result
            const saveRes = await fetch('/api/scan/save-result', {
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
                evaluationCost,
                followUpLevel: 0,
                parentResultId: null,
                followUpQueryUsed: null,
              }),
              signal: abortController.signal,
            })
            
            const saveResult = await saveRes.json()
            let parentResultId = saveResult.resultId
            
            completed++
            
            // Update progress
            setJobs(prev => prev.map(job => 
              job.projectId === nextJob.projectId 
                ? { ...job, progress: { current: completed, total: totalOperations } }
                : job
            ))
            
            // === FOLLOW-UP QUERIES (Levels 1-3) ===
            if (followUpEnabled && followUpDepth > 0) {
              // Build conversation history
              const conversationHistory: ConversationMessage[] = [
                { role: 'user', content: query.query_text },
                { role: 'assistant', content: llmResult.content },
              ]
              
              for (let level = 1; level <= followUpDepth; level++) {
                // Check if cancelled
                if (abortController.signal.aborted) {
                  throw new Error('Scan cancelled by user')
                }
                
                // Get follow-up question (respects language setting)
                const followUpQuery = getFollowUpQuestion(queryType, level as 1 | 2 | 3, language || 'en')
                
                // Update progress message
                setJobs(prev => prev.map(job => 
                  job.projectId === nextJob.projectId 
                    ? { 
                        ...job, 
                        progress: { 
                          current: completed, 
                          total: totalOperations, 
                          message: `${model} Follow-up ${level}...` 
                        } 
                      }
                    : job
                ))
                
                // Call LLM with conversation history (includes language for response language)
                const followUpLlmRes = await fetch('/api/llm/call', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                    model, 
                    query: followUpQuery,
                    conversationHistory,
                    language,
                  }),
                  signal: abortController.signal,
                })
                
                if (!followUpLlmRes.ok) {
                  console.warn(`[Scan] Follow-up ${level} LLM call failed for ${model}`)
                  completed++
                  setJobs(prev => prev.map(job => 
                    job.projectId === nextJob.projectId 
                      ? { ...job, progress: { current: completed, total: totalOperations } }
                      : job
                  ))
                  continue
                }
                
                const followUpLlmResult = await followUpLlmRes.json()
                
                // Evaluate follow-up response
                let followUpMetrics
                let followUpEvalCost = null
                
                const followUpEvalRes = await fetch('/api/scan/evaluate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    content: followUpLlmResult.content,
                    brandVariations,
                    domain,
                  }),
                  signal: abortController.signal,
                })
                
                if (followUpEvalRes.ok) {
                  const followUpEvalResult = await followUpEvalRes.json()
                  followUpMetrics = followUpEvalResult.metrics
                  followUpEvalCost = followUpEvalResult.evaluation
                } else {
                  // Use zero metrics if evaluation fails
                  followUpMetrics = {
                    visibility_score: 0,
                    sentiment_score: 0,
                    ranking_position: null,
                    recommendation_strength: 0,
                    overall_score: 0,
                    brand_mentioned: false,
                    domain_mentioned: false,
                    summary: 'Evaluation failed',
                  }
                }
                
                // Save follow-up result
                const followUpSaveRes = await fetch('/api/scan/save-result', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    scanId,
                    model,
                    query: query.query_text, // Original query text for grouping
                    response: followUpLlmResult.content,
                    inputTokens: followUpLlmResult.inputTokens,
                    outputTokens: followUpLlmResult.outputTokens,
                    metrics: followUpMetrics,
                    evaluationCost: followUpEvalCost,
                    followUpLevel: level,
                    parentResultId,
                    followUpQueryUsed: followUpQuery,
                  }),
                  signal: abortController.signal,
                })
                
                const followUpSaveResult = await followUpSaveRes.json()
                
                // Update parent for next level
                parentResultId = followUpSaveResult.resultId
                
                // Add to conversation history for next follow-up
                conversationHistory.push({ role: 'user', content: followUpQuery })
                conversationHistory.push({ role: 'assistant', content: followUpLlmResult.content })
                
                completed++
                
                // Update progress
                setJobs(prev => prev.map(job => 
                  job.projectId === nextJob.projectId 
                    ? { ...job, progress: { current: completed, total: totalOperations } }
                    : job
                ))
                
                // Small delay between follow-ups
                await new Promise(resolve => setTimeout(resolve, 200))
              }
            }
            
          } catch (err: any) {
            if (err.name === 'AbortError') throw err
            console.warn(`[Scan] Error processing ${model}:`, err.message)
          }
          
          // Small delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 300))
        }
      }
      
      // 3. Complete scan (with reservation ID for credit processing)
      await fetch(`/api/projects/${nextJob.projectId}/scan/${scanId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservationId }),
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
            ? { ...job, status: 'failed' as const, error: error.message, errorCode: error.code }
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
    
    // Find the job to get scan ID and reservation ID
    const job = jobsRef.current.find(j => j.projectId === projectId)
    
    // Update database if scan has started (has an ID)
    if (job?.id) {
      try {
        await fetch(`/api/projects/${projectId}/scan/${job.id}/stop`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reservationId: job.reservationId }),
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
