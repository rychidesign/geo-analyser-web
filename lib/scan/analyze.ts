import type { ScanMetrics } from '@/lib/db/schema'

/**
 * Extract sentences containing brand/domain mentions for context-aware sentiment
 */
function extractBrandContext(content: string, brandVariations: string[], domain: string): string {
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0)
  const relevantSentences: string[] = []
  
  for (const sentence of sentences) {
    const lowerSentence = sentence.toLowerCase()
    const hasBrand = brandVariations.some(brand => lowerSentence.includes(brand.toLowerCase()))
    const hasDomain = lowerSentence.includes(domain.toLowerCase())
    
    if (hasBrand || hasDomain) {
      relevantSentences.push(sentence)
    }
  }
  
  return relevantSentences.join(' ').toLowerCase()
}

/**
 * Analyze LLM response using regex patterns
 * Used for simple evaluation without AI
 */
export function analyzeResponseRegex(
  content: string,
  brandVariations: string[],
  domain: string
): ScanMetrics {
  const lowerContent = content.toLowerCase()
  
  // Check presence
  const brandMentioned = brandVariations.some(brand => 
    lowerContent.includes(brand.toLowerCase())
  )
  const domainMentioned = lowerContent.includes(domain.toLowerCase())

  // Combined Visibility Score: brand (50) + domain (50) = 100
  let visibilityScore = 0
  if (brandMentioned) visibilityScore += 50
  if (domainMentioned) visibilityScore += 50

  // Sentiment Score: Only calculated if visibility > 0
  let sentimentScore: number | null = null
  if (visibilityScore > 0) {
    const brandContext = extractBrandContext(content, brandVariations, domain)
    
    const positiveWords = ['best', 'excellent', 'great', 'recommend', 'top', 'leading', 'popular', 'trusted', 'reliable', 'effective', 'amazing', 'outstanding', 'superior', 'innovative']
    const negativeWords = ['worst', 'bad', 'avoid', 'poor', 'unreliable', 'expensive', 'limited', 'lacking', 'disappointing', 'inferior', 'problematic']
    
    let sentimentRaw = 0
    for (const word of positiveWords) {
      if (brandContext.includes(word)) sentimentRaw += 1
    }
    for (const word of negativeWords) {
      if (brandContext.includes(word)) sentimentRaw -= 1
    }
    sentimentRaw = Math.max(-5, Math.min(5, sentimentRaw))
    sentimentScore = Math.round(50 + (sentimentRaw * 10))
  }

  // Ranking Score (0-100): Position in list
  let rankingScore = 0
  const positionScores = [100, 80, 60, 40, 20]
  
  for (const brand of brandVariations) {
    const escapedBrand = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    
    // Pattern 1: Numbered lists
    const numberedPatterns = [
      { regex: new RegExp(`1[.):\\s]+[^\\n]*${escapedBrand}`, 'i'), score: 100 },
      { regex: new RegExp(`2[.):\\s]+[^\\n]*${escapedBrand}`, 'i'), score: 80 },
      { regex: new RegExp(`3[.):\\s]+[^\\n]*${escapedBrand}`, 'i'), score: 60 },
      { regex: new RegExp(`4[.):\\s]+[^\\n]*${escapedBrand}`, 'i'), score: 40 },
      { regex: new RegExp(`5[.):\\s]+[^\\n]*${escapedBrand}`, 'i'), score: 20 },
    ]
    
    for (const { regex, score } of numberedPatterns) {
      if (regex.test(content)) {
        rankingScore = Math.max(rankingScore, score)
        break
      }
    }
    
    // Pattern 2: Parenthetical lists
    if (rankingScore < 100) {
      const parenListRegex = /\(([^)]+)\)/g
      let match
      while ((match = parenListRegex.exec(content)) !== null) {
        const listContent = match[1]
        if (listContent.includes(',')) {
          const items = listContent.split(/[,;]/).map(s => s.trim()).filter(s => s.length > 0)
          for (let i = 0; i < Math.min(items.length, 5); i++) {
            if (new RegExp(escapedBrand, 'i').test(items[i])) {
              rankingScore = Math.max(rankingScore, positionScores[i])
              break
            }
          }
        }
      }
    }
    
    // Pattern 3: Comma-separated lists after keywords
    if (rankingScore < 100) {
      const listKeywords = [
        'jako', 'jsou', 'například', 'např\\.', 'patří', 'nabízejí', 'nabízí',
        'doporučuji', 'doporučujeme', 'zkuste', 'vyzkoušejte', 'třeba',
        ':', 'are', 'include', 'includes', 'like', 'such as', 'e\\.g\\.',
        'recommend', 'try', 'check out', 'visit', 'consider', 'offers'
      ]
      const keywordPattern = listKeywords.join('|')
      const listRegex = new RegExp(`(?:${keywordPattern})\\s*([^.!?\\n]+)`, 'gi')
      
      let match
      while ((match = listRegex.exec(content)) !== null) {
        const listContent = match[1]
        const items = listContent.split(/[,;]/).map(s => s.trim()).filter(s => s.length > 0)
        
        for (let i = 0; i < Math.min(items.length, 5); i++) {
          if (new RegExp(escapedBrand, 'i').test(items[i])) {
            rankingScore = Math.max(rankingScore, positionScores[i])
            break
          }
        }
      }
    }
    
    if (rankingScore === 100) break
  }

  // Recommendation Score
  let recommendationScore = 0
  if (brandMentioned && sentimentScore !== null) {
    recommendationScore += visibilityScore * 0.35
    recommendationScore += (sentimentScore - 50) * 0.35
    recommendationScore += rankingScore * 0.3
    recommendationScore = Math.min(100, Math.max(0, Math.round(recommendationScore + 30)))
  }

  return {
    visibility_score: visibilityScore,
    sentiment_score: sentimentScore,
    ranking_score: rankingScore,
    recommendation_score: recommendationScore,
  }
}
