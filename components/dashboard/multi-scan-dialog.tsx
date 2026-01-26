'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { PlayCircle, Loader2, CheckCircle2 } from 'lucide-react'
import type { Project } from '@/lib/db/schema'

interface MultiScanDialogProps {
  projects: Project[]
  onScanStarted?: () => void
}

export function MultiScanDialog({ projects, onScanStarted }: MultiScanDialogProps) {
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set())
  const [isOpen, setIsOpen] = useState(false)
  const [isStarting, setIsStarting] = useState(false)

  const toggleProject = (projectId: string) => {
    const newSelected = new Set(selectedProjects)
    if (newSelected.has(projectId)) {
      newSelected.delete(projectId)
    } else {
      newSelected.add(projectId)
    }
    setSelectedProjects(newSelected)
  }

  const selectAll = () => {
    setSelectedProjects(new Set(projects.map(p => p.id)))
  }

  const clearAll = () => {
    setSelectedProjects(new Set())
  }

  const startScans = async () => {
    if (selectedProjects.size === 0) return

    setIsStarting(true)
    try {
      // Add to frontend queue using ScanQueueManager
      if (typeof window !== 'undefined' && (window as any).__addScanToQueue) {
        const selectedProjectsList = Array.from(selectedProjects)
        for (const projectId of selectedProjectsList) {
          const project = projects.find(p => p.id === projectId)
          if (project) {
            (window as any).__addScanToQueue(projectId, project.name)
          }
        }
        
        // Close dialog and reset
        setIsOpen(false)
        setSelectedProjects(new Set())
        onScanStarted?.()
      } else {
        alert('Scan queue not initialized. Please refresh the page.')
      }
    } catch (error) {
      console.error('Failed to start scans:', error)
      alert('Failed to start scans')
    } finally {
      setIsStarting(false)
    }
  }

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        size="sm"
        className="gap-2"
      >
        <PlayCircle className="w-4 h-4" />
        Run Multiple Scans
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <Card className="w-full max-w-2xl max-h-[80vh] flex flex-col bg-zinc-900 border-zinc-800">
        <div className="p-6 border-b border-zinc-800">
          <h2 className="text-xl font-semibold mb-2">Run Multiple Scans</h2>
          <p className="text-sm text-zinc-400">
            Select projects to scan. They will be queued and processed one by one.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-zinc-400">
              {selectedProjects.size} of {projects.length} selected
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={selectAll}
                className="h-7 text-xs"
              >
                Select All
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={clearAll}
                className="h-7 text-xs"
              >
                Clear All
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {projects.map((project) => {
              const isSelected = selectedProjects.has(project.id)
              return (
                <div
                  key={project.id}
                  onClick={() => toggleProject(project.id)}
                  className={`p-4 rounded-lg border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-blue-500/10 border-blue-500/50'
                      : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-medium truncate">{project.name}</div>
                        {project.scheduled_scan_enabled && (
                          <Badge className="border-0 bg-purple-500/10 text-purple-400 text-xs">
                            Scheduled
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-zinc-500 truncate">
                        {project.domain}
                      </div>
                    </div>
                    {isSelected && (
                      <CheckCircle2 className="w-5 h-5 text-blue-400 flex-shrink-0 ml-3" />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="p-6 border-t border-zinc-800 flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => {
              setIsOpen(false)
              setSelectedProjects(new Set())
            }}
            disabled={isStarting}
          >
            Cancel
          </Button>
          <Button
            onClick={startScans}
            disabled={selectedProjects.size === 0 || isStarting}
            className="gap-2"
          >
            {isStarting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <PlayCircle className="w-4 h-4" />
                Start {selectedProjects.size} Scan{selectedProjects.size !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  )
}
