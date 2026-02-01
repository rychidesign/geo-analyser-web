'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, Copy, MessageSquare, Settings, Calendar, History } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import type { ProjectWithScore } from '@/lib/db/projects'

interface DuplicateProjectDialogProps {
  project: ProjectWithScore
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

interface DuplicationOptions {
  queries: boolean
  settings: boolean
  scheduledScan: boolean
  scanHistory: boolean
}

export function DuplicateProjectDialog({
  project,
  open,
  onOpenChange,
  onSuccess,
}: DuplicateProjectDialogProps) {
  const router = useRouter()
  const { showSuccess, showError } = useToast()
  const [loading, setLoading] = useState(false)
  const [newName, setNewName] = useState(`${project.name} (Copy)`)
  const [options, setOptions] = useState<DuplicationOptions>({
    queries: true,
    settings: true,
    scheduledScan: false,
    scanHistory: false,
  })

  const handleDuplicate = async () => {
    if (!newName.trim()) {
      showError('Please enter a name for the new project.')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/projects/${project.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newName: newName.trim(),
          options,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to duplicate project')
      }

      const { project: newProject } = await response.json()

      showSuccess(`"${newProject.name}" has been created successfully.`)

      onSuccess()
      router.push(`/dashboard/projects/${newProject.id}`)
    } catch (error) {
      console.error('Error duplicating project:', error)
      showError(error instanceof Error ? error.message : 'An error occurred while duplicating the project.')
    } finally {
      setLoading(false)
    }
  }

  const toggleOption = (key: keyof DuplicationOptions) => {
    setOptions(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="w-5 h-5" />
            Duplicate Project
          </DialogTitle>
          <DialogDescription>
            Create a copy of "{project.name}" with selected data.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* New project name */}
          <div className="space-y-2">
            <Label htmlFor="newName">New project name</Label>
            <Input
              id="newName"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Enter project name"
              disabled={loading}
            />
          </div>

          {/* Duplication options */}
          <div className="space-y-4">
            <Label className="text-zinc-400">Include in copy</Label>
            
            <div className="space-y-3">
              {/* Queries */}
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="queries"
                  checked={options.queries}
                  onCheckedChange={() => toggleOption('queries')}
                  disabled={loading}
                />
                <label
                  htmlFor="queries"
                  className="flex items-center gap-2 text-sm font-medium leading-none cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4 text-zinc-500" />
                  Queries
                  <span className="text-zinc-500 font-normal">
                    – All test queries will be copied
                  </span>
                </label>
              </div>

              {/* Settings */}
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="settings"
                  checked={options.settings}
                  onCheckedChange={() => toggleOption('settings')}
                  disabled={loading}
                />
                <label
                  htmlFor="settings"
                  className="flex items-center gap-2 text-sm font-medium leading-none cursor-pointer"
                >
                  <Settings className="w-4 h-4 text-zinc-500" />
                  Settings
                  <span className="text-zinc-500 font-normal">
                    – Models, language, follow-ups
                  </span>
                </label>
              </div>

              {/* Scheduled scan */}
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="scheduledScan"
                  checked={options.scheduledScan}
                  onCheckedChange={() => toggleOption('scheduledScan')}
                  disabled={loading}
                />
                <label
                  htmlFor="scheduledScan"
                  className="flex items-center gap-2 text-sm font-medium leading-none cursor-pointer"
                >
                  <Calendar className="w-4 h-4 text-zinc-500" />
                  Scheduled scan
                  <span className="text-zinc-500 font-normal">
                    – Copy schedule configuration
                  </span>
                </label>
              </div>

              {/* Scan history */}
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="scanHistory"
                  checked={options.scanHistory}
                  onCheckedChange={() => toggleOption('scanHistory')}
                  disabled={loading}
                />
                <label
                  htmlFor="scanHistory"
                  className="flex items-center gap-2 text-sm font-medium leading-none cursor-pointer"
                >
                  <History className="w-4 h-4 text-zinc-500" />
                  Scan history
                  <span className="text-zinc-500 font-normal">
                    – All past scans and results
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Info about brand/domain */}
          <p className="text-xs text-zinc-500">
            Brand name and domain will always be copied from the original project.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDuplicate}
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Duplicating...
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 mr-2" />
                Duplicate
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
