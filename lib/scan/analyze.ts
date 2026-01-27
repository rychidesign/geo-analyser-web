import type { ScanMetrics } from '@/lib/db/schema'

/**
 * Extract sentences containing brand/domain mentions for context-aware sentiment
 */
function extractBrandContext(response: string, brandVariations: string[], domain: string): string {
  const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 0)
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
  response: string,
  brandVariations: string[],
  domain: string
): ScanMetrics {
  const lowerResponse = response.toLowerCase()
  
  // Check if brand is mentioned
  const brandMentioned = brandVariations.some(brand => 
    lowerResponse.includes(brand.toLowerCase())
  )
  
  // Check if domain is mentioned
  const domainMentioned = lowerResponse.includes(domain.toLowerCase())
  
  // Combined visibility score: brand (50) + domain (50) = 100
  let visibilityScore = 0
  if (brandMentioned) visibilityScore += 50
  if (domainMentioned) visibilityScore += 50
  
  // Sentiment analysis only from context around brand/domain mentions
  let sentimentScore = 0
  let rankingScore = 0
  let recommendationScore = 0
  
  if (brandMentioned || domainMentioned) {
    // Extract only sentences that mention the brand or domain
    const brandContext = extractBrandContext(response, brandVariations, domain)
    
    const positiveWords = ['recommend', 'best', 'excellent', 'great', 'top', 'leading', 'premier', 'quality', 'reliable', 'trusted', 'popular']
    const negativeWords = ['avoid', 'worst', 'poor', 'bad', 'disappointing', 'unreliable', 'expensive', 'lacking']
    
    const positiveCount = positiveWords.filter(word => brandContext.includes(word)).length
    const negativeCount = negativeWords.filter(word => brandContext.includes(word)).length
    
    sentimentScore = 50
    if (positiveCount > 0) sentimentScore += Math.min(positiveCount * 10, 40)
    if (negativeCount > 0) sentimentScore -= Math.min(negativeCount * 10, 40)
    
    rankingScore = positiveCount > 0 ? 90 : 50
    
    recommendationScore = Math.round(
      visibilityScore * 0.35 +
      ((sentimentScore - 50) * 2) * 0.35 +
      rankingScore * 0.3
    )
    recommendationScore = Math.min(100, Math.max(0, recommendationScore))
  }
  
  return {
    visibility_score: visibilityScore,
    sentiment_score: sentimentScore,
    ranking_score: rankingScore,
    recommendation_score: recommendationScore,
  }
}
