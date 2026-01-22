import { createClient } from '@/lib/supabase/server'
import { getProjectStats } from '@/lib/db/projects'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart3, FolderOpen, Zap, TrendingUp } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch real stats from database
  const stats = user ? await getProjectStats(user.id) : {
    projects: 0,
    scans: 0,
    avgScore: 0,
    thisMonth: 0,
  }

  return (
    <>
      {/* Header */}
      <div className="shrink-0 bg-zinc-950 border-b border-zinc-800/50" style={{ padding: '16px 32px' }}>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-zinc-400">Welcome back, {user?.email}</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">
              Projects
            </CardTitle>
            <FolderOpen className="w-4 h-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.projects}</div>
            <p className="text-xs text-zinc-500 mt-1">
              Active projects
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">
              Scans
            </CardTitle>
            <Zap className="w-4 h-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.scans}</div>
            <p className="text-xs text-zinc-500 mt-1">
              Total completed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">
              Average Score
            </CardTitle>
            <BarChart3 className="w-4 h-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgScore}%</div>
            <p className="text-xs text-zinc-500 mt-1">
              Brand visibility
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">
              This Month
            </CardTitle>
            <TrendingUp className="w-4 h-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.thisMonth}</div>
            <p className="text-xs text-zinc-500 mt-1">
              New scans
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Empty State */}
      {stats.projects === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderOpen className="w-12 h-12 text-zinc-700 mb-4" />
            <CardTitle className="text-lg mb-2">No projects yet</CardTitle>
            <CardDescription className="text-center max-w-sm mb-4">
              Create your first project and start tracking 
              how AI systems present your brand.
            </CardDescription>
            <a 
              href="/dashboard/projects/new"
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
            >
              Create Project
            </a>
          </CardContent>
        </Card>
      )}
      </div>
    </>
  )
}
