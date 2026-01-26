'use client'

import { useScan } from '@/lib/scan/scan-context'
import { Loader2, X, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import Link from 'next/link'

export function ScanStatusBar() {
  const { jobs, cancelScan, clearJob, clearCompleted } = useScan()
  const [expanded, setExpanded] = useState(false)
  
  // Get active jobs (running or queued)
  const activeJobs = jobs.filter(job => ['running', 'queued'].includes(job.status))
  const completedJobs = jobs.filter(job => ['completed', 'failed', 'cancelled'].includes(job.status))
  
  // Nothing to show
  if (jobs.length === 0) return null
  
  const currentJob = jobs.find(job => job.status === 'running')
  const queuedCount = jobs.filter(job => job.status === 'queued').length
  
  return (
    <div className="bg-zinc-900 border-b border-zinc-800">
      {/* Main bar - always visible when there are jobs */}
      <div 
        className="px-4 py-2 flex items-center justify-between cursor-pointer hover:bg-zinc-800/50"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-4">
          {currentJob ? (
            <>
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                <span className="text-sm font-medium">
                  Scanning: {currentJob.projectName}
                </span>
              </div>
              
              {currentJob.progress.total > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-32 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${(currentJob.progress.current / currentJob.progress.total) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-zinc-500">
                    {currentJob.progress.current}/{currentJob.progress.total}
                  </span>
                </div>
              )}
            </>
          ) : queuedCount > 0 ? (
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-zinc-400" />
              <span className="text-sm text-zinc-400">
                {queuedCount} scan{queuedCount !== 1 ? 's' : ''} in queue
              </span>
            </div>
          ) : completedJobs.length > 0 && (
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-zinc-400">
                {completedJobs.length} scan{completedJobs.length !== 1 ? 's' : ''} completed
              </span>
            </div>
          )}
          
          {queuedCount > 0 && currentJob && (
            <span className="text-xs text-zinc-500 border-l border-zinc-700 pl-4">
              +{queuedCount} queued
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          {currentJob && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                cancelScan(currentJob.projectId)
              }}
              className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              Stop
            </button>
          )}
          
          {completedJobs.length > 0 && !currentJob && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                clearCompleted()
              }}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              Clear
            </button>
          )}
          
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-zinc-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-500" />
          )}
        </div>
      </div>
      
      {/* Expanded view - shows all jobs */}
      {expanded && jobs.length > 0 && (
        <div className="border-t border-zinc-800 max-h-64 overflow-y-auto">
          {jobs.map((job) => (
            <div 
              key={job.projectId}
              className="px-4 py-2 flex items-center justify-between hover:bg-zinc-800/30 border-b border-zinc-800/50 last:border-b-0"
            >
              <div className="flex items-center gap-3">
                {job.status === 'running' && <Loader2 className="w-4 h-4 animate-spin text-blue-400" />}
                {job.status === 'queued' && <Clock className="w-4 h-4 text-zinc-400" />}
                {job.status === 'completed' && <CheckCircle className="w-4 h-4 text-emerald-400" />}
                {job.status === 'failed' && <XCircle className="w-4 h-4 text-red-400" />}
                {job.status === 'cancelled' && <X className="w-4 h-4 text-zinc-500" />}
                
                <Link 
                  href={`/dashboard/projects/${job.projectId}`}
                  className="text-sm hover:text-blue-400 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  {job.projectName}
                </Link>
                
                <span className={`text-xs px-2 py-0.5 rounded ${
                  job.status === 'running' ? 'bg-blue-500/10 text-blue-400' :
                  job.status === 'queued' ? 'bg-zinc-500/10 text-zinc-400' :
                  job.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                  job.status === 'failed' ? 'bg-red-500/10 text-red-400' :
                  'bg-zinc-500/10 text-zinc-500'
                }`}>
                  {job.status}
                </span>
              </div>
              
              <div className="flex items-center gap-3">
                {job.status === 'running' && job.progress.total > 0 && (
                  <span className="text-xs text-zinc-500">
                    {job.progress.current}/{job.progress.total}
                  </span>
                )}
                
                {job.error && (
                  <span className="text-xs text-red-400 max-w-48 truncate" title={job.error}>
                    {job.error}
                  </span>
                )}
                
                {['queued', 'running'].includes(job.status) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      cancelScan(job.projectId)
                    }}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Cancel
                  </button>
                )}
                
                {['completed', 'failed', 'cancelled'].includes(job.status) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      clearJob(job.projectId)
                    }}
                    className="text-xs text-zinc-500 hover:text-zinc-300"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
