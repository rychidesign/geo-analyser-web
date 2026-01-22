'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PageHeaderProps {
  backHref?: string
  backLabel?: string
  title: string
  actions?: React.ReactNode
}

export function PageHeader({ backHref, backLabel, title, actions }: PageHeaderProps) {
  return (
    <div className="sticky top-0 z-10 bg-zinc-950 border-b border-zinc-800/50 px-8 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          {backHref && (
            <Link 
              href={backHref}
              className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100"
            >
              <ArrowLeft className="w-4 h-4" />
              {backLabel || 'Back'}
            </Link>
          )}
          <h1 className="text-xl font-semibold">{title}</h1>
        </div>
        {actions && (
          <div className="flex gap-3">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
