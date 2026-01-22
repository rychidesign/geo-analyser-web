'use client'

import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'

interface AIResponseProps {
  content: string
  brandVariations?: string[]
  keywords?: string[]
  domain?: string
}

export function AIResponse({ content, brandVariations, keywords, domain }: AIResponseProps) {
  // Process highlights before passing to ReactMarkdown
  const processedContent = (() => {
    if (!brandVariations && !keywords && !domain) {
      return content
    }

    // Create array of all terms to highlight - use Set to avoid duplicates
    const brandTermsSet = new Set<string>()
    
    // Add brand variations and domain
    if (brandVariations) {
      brandVariations.forEach(brand => brandTermsSet.add(brand.toLowerCase()))
    }
    if (domain) {
      brandTermsSet.add(domain.toLowerCase())
    }
    
    // Add common domain extensions
    const commonExtensions = ['.cz', '.com', '.sk', '.de', '.net', '.org', '.io']
    if (brandVariations) {
      brandVariations.forEach(brand => {
        commonExtensions.forEach(ext => {
          brandTermsSet.add(`${brand.toLowerCase()}${ext}`)
        })
      })
    }
    
    // Convert to array and sort by length (longest first) to match longer terms first
    const sortedBrands = Array.from(brandTermsSet).sort((a, b) => b.length - a.length)
    const sortedKeywords = (keywords || []).sort((a, b) => b.length - a.length)
    
    let processed = content
    
    // Replace brand names with markers (skip already marked text)
    sortedBrands.forEach(term => {
      const regex = new RegExp(`(?<!«BRAND»[^«]*)\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b(?![^«]*«/BRAND»)`, 'gi')
      processed = processed.replace(regex, (match) => `«BRAND»${match}«/BRAND»`)
    })
    
    // Replace keywords with markers (skip already marked text)
    sortedKeywords.forEach(term => {
      const regex = new RegExp(`(?<!«[^«]*)\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b(?![^«]*«/)`, 'gi')
      processed = processed.replace(regex, (match) => `«KW»${match}«/KW»`)
    })
    
    // Convert markers to HTML
    processed = processed
      .replace(/«BRAND»([^«]+)«\/BRAND»/g, '<mark data-type="brand">$1</mark>')
      .replace(/«KW»([^«]+)«\/KW»/g, '<mark data-type="keyword">$1</mark>')
    
    return processed
  })()

  return (
    <div className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed">
      <ReactMarkdown rehypePlugins={[rehypeRaw]}>
        {processedContent}
      </ReactMarkdown>
      
      <style jsx global>{`
        mark[data-type="brand"] {
          background-color: rgba(250, 204, 21, 0.85) !important;
          color: #18181b !important;
          font-weight: 600 !important;
          padding: 2px 6px !important;
          margin: 0 2px !important;
          border-radius: 2px !important;
        }
        mark[data-type="keyword"] {
          background-color: rgba(251, 146, 60, 0.85) !important;
          color: #18181b !important;
          font-weight: 600 !important;
          padding: 2px 6px !important;
          margin: 0 2px !important;
          border-radius: 2px !important;
        }
      `}</style>
    </div>
  )
}
