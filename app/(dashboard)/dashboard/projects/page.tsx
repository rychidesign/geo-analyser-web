import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getProjects } from '@/lib/db/projects'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { ProjectsList } from '@/components/dashboard/projects-list'

export default async function ProjectsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  // Fetch projects from database
  const projects = user ? await getProjects() : []

  return (
    <>
      {/* Header */}
      <div className="bg-zinc-950 border-b border-zinc-800/50 lg:shrink-0 px-4 py-4 lg:px-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Projects</h1>
            <p className="text-sm text-zinc-400">Manage your GEO projects and track brand visibility.</p>
          </div>
          <Link href="/dashboard/projects/new">
            <Button>
              <Plus className="w-4 h-4" />
              New Project
            </Button>
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 lg:p-8 lg:flex-1 lg:overflow-y-auto">
        <ProjectsList projects={projects} />
      </div>
    </>
  )
}
