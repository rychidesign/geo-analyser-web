'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface MobileHeaderProps {
  onMenuClick: () => void
}

export function MobileHeader({ onMenuClick }: MobileHeaderProps) {
  return (
    <div className="lg:hidden sticky top-0 z-50 h-14 bg-zinc-900 border-b border-zinc-800 flex items-center px-4 gap-3">
      {/* Logo */}
      <Link href="/dashboard" className="flex items-center gap-2 flex-1">
        <Image 
          src="/app-icon.png" 
          alt="GEO Analyser" 
          width={24} 
          height={24}
          className="rounded-md"
        />
        <span className="text-sm font-semibold">GEO Analyser</span>
      </Link>

      {/* Hamburger Menu */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onMenuClick}
        className="text-zinc-400 hover:text-zinc-100"
      >
        <Menu className="w-5 h-5" />
      </Button>
    </div>
  )
}
