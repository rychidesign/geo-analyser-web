'use client'

import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FolderOpen, Plus, ExternalLink, Calendar } from 'lucide-react'
import { MultiScanDialog } from './multi-scan-dialog'
import type { Project } from '@/lib/db/schema'

interface ProjectsListProps {
  projects: Project[]
}

export function ProjectsList({ projects }: ProjectsListProps) {
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
        {projects.map((project) => (
          <Link key={project.id} href={`/dashboard/projects/${project.id}`}>
            <Card className="hover:border-zinc-700 transition-colors cursor-pointer">
              <CardHeader>
                <CardTitle className="text-base">{project.name}</CardTitle>
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
        ))}
      </div>
    </>
  )
}
