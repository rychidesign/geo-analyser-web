'use client'

import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FolderOpen, Plus, ExternalLink, Calendar, Loader2, Clock } from 'lucide-react'
import { MultiScanDialog } from './multi-scan-dialog'
import { useScan } from '@/lib/scan/scan-context'
import type { Project } from '@/lib/db/schema'

interface ProjectsListProps {
  projects: Project[]
}

export function ProjectsList({ projects }: ProjectsListProps) {
  const { jobs, getJobForProject } = useScan()

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
                
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">{project.name}</CardTitle>
                    {isRunning && (
                      <div className="flex items-center gap-1.5 text-blue-400">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span className="text-xs">Running</span>
                      </div>
                    )}
                    {isQueued && (
                      <div className="flex items-center gap-1.5 text-zinc-400">
                        <Clock className="w-3.5 h-3.5" />
                        <span className="text-xs">Queued</span>
                      </div>
                    )}
                  </div>
                  <CardDescription className="flex items-center gap-1">
                    <ExternalLink className="w-3 h-3" />
                    {project.domain}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-1 text-zinc-500">
                      <Calendar className="w-4 h-4" />
                      {new Date(project.created_at).toLocaleDateString('en-US')}
                    </div>
                    <div className="text-zinc-400">
                      {project.brand_variations.length} brands
                    </div>
                  </div>
                  
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </>
  )
}
