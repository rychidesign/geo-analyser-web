'use client'

import { useState } from 'react'
import { DashboardSidebar } from './sidebar'
import { MobileHeader } from './mobile-header'
import { ScanStatusBar } from './scan-status-bar'
import { ScanProvider } from '@/lib/scan/scan-context'
import type { User } from '@supabase/supabase-js'

interface DashboardLayoutClientProps {
  user: User
  children: React.ReactNode
}

export function DashboardLayoutClient({ user, children }: DashboardLayoutClientProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <ScanProvider>
      <div className="h-screen bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden">
        {/* Mobile Header - visible only on mobile */}
        <MobileHeader onMenuClick={() => setSidebarOpen(true)} />

        {/* Scan Status Bar - shows when scans are running */}
        <ScanStatusBar />

        {/* Main Layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar - always visible on desktop, toggleable on mobile */}
          <DashboardSidebar 
            user={user} 
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />

          {/* Overlay for mobile when sidebar is open - positioned to the right of sidebar */}
          {sidebarOpen && (
            <div 
              className="lg:hidden fixed inset-y-0 left-64 right-0 bg-black/50 z-40"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          {/* Main Content */}
          <main className="flex-1 overflow-y-auto lg:overflow-hidden lg:flex lg:flex-col">
            {children}
          </main>
        </div>
      </div>
    </ScanProvider>
  )
}
