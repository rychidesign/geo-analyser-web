'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FolderOpen, Plus, Loader2, Clock, Calendar, Settings, Target, MoreVertical, Copy } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MultiScanDialog } from './multi-scan-dialog'
import { DuplicateProjectDialog } from './duplicate-project-dialog'
import { useScan } from '@/lib/scan/scan-context'
import type { ProjectWithScore } from '@/lib/db/projects'

interface ProjectsListProps {
  projects: ProjectWithScore[]
}

export function ProjectsList({ projects }: ProjectsListProps) {
  const { jobs, getJobForProject } = useScan()
  const router = useRouter()
  const [duplicateProject, setDuplicateProject] = useState<ProjectWithScore | null>(null)

  if (projects.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FolderOpen className="w-12 h-12 text-zinc-700 mb-4" />
          <CardTitle className="text-lg mb-2">No projects yet</CardTitle>
          <CardDescription className="text-center max-w-sm mb-4">
            Create your first project and start tracking
            how AI systems present your brand.
          </CardDescription>
          <Link href="/dashboard/projects/new">
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Create Project
            </Button>
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      {/* Multi-scan button */}
      <div className="mb-6 flex items-center justify-between">
        <div className="text-sm text-zinc-400">
          {projects.length} project{projects.length !== 1 ? 's' : ''}
        </div>
        <MultiScanDialog projects={projects} />
      </div>

      {/* Projects grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((project) => {
          const job = getJobForProject(project.id)
          const isRunning = job?.status === 'running'
          const isQueued = job?.status === 'queued'
          
          return (
            <Link key={project.id} href={`/dashboard/projects/${project.id}`}>
              <Card className="hover:border-zinc-700 transition-colors cursor-pointer relative overflow-hidden">
                {/* Scan status indicator */}
                {(isRunning || isQueued) && (
                  <div className={`absolute top-0 left-0 right-0 h-1 ${
                    isRunning ? 'bg-blue-500' : 'bg-zinc-600'
                  }`}>
                    {isRunning && job?.progress.total > 0 && (
                      <div 
                        className="h-full bg-blue-400 transition-all duration-300"
                        style={{ width: `${(job.progress.current / job.progress.total) * 100}%` }}
                      />
                    )}
                  </div>
                )}
                
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">{project.name}</CardTitle>
                      <CardDescription className="text-zinc-500 truncate">
                        {project.domain}
                      </CardDescription>
                    </div>
                    {isRunning && (
                      <div className="flex items-center gap-1.5 text-blue-400 ml-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span className="text-xs">Running</span>
                      </div>
                    )}
                    {isQueued && (
                      <div className="flex items-center gap-1.5 text-zinc-400 ml-2">
                        <Clock className="w-3.5 h-3.5" />
                        <span className="text-xs">Queued</span>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between text-sm">
                    {/* Left side: Score + Scheduled scan */}
                    <div className="flex items-center gap-4">
                      {/* Overall score */}
                      <div className="flex items-center gap-1.5 text-zinc-500" title="Overall score">
                        <Target className="w-4 h-4" />
                        <span className="text-xs font-medium">
                          {project.latest_score !== null ? `${project.latest_score.toFixed(1)}%` : '—'}
                        </span>
                      </div>
                      
                      {/* Scheduled scan day - only show if enabled */}
                      {project.scheduled_scan_enabled && project.next_scheduled_scan_at && (
                        <div className="flex items-center gap-1.5 text-zinc-500" title="Next scheduled scan">
                          <Calendar className="w-4 h-4" />
                          <span className="text-xs">
                            {new Date(project.next_scheduled_scan_at).toLocaleDateString('en-US', {
                              weekday: 'long'
                            })}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    {/* Right side: Menu */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button 
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                          }}
                          className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 -m-1"
                          title="Project options"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setDuplicateProject(project)
                          }}
                        >
                          <Copy className="w-4 h-4 mr-2" />
                          Duplicate project
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            router.push(`/dashboard/projects/${project.id}/settings`)
                          }}
                        >
                          <Settings className="w-4 h-4 mr-2" />
                          Settings
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      {/* Duplicate Project Dialog */}
      {duplicateProject && (
        <DuplicateProjectDialog
          project={duplicateProject}
          open={!!duplicateProject}
          onOpenChange={(open) => !open && setDuplicateProject(null)}
          onSuccess={() => {
            setDuplicateProject(null)
            router.refresh()
          }}
        />
      )}
    </>
  )
}
