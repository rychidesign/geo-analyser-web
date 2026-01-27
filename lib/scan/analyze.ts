import type { ScanMetrics } from '@/lib/db/schema'

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
  
  // Simple sentiment analysis (only if brand is mentioned)
  let sentimentScore = 0
  let rankingScore = 0
  let recommendationScore = 0
  
  if (brandMentioned) {
    const positiveWords = ['recommend', 'best', 'excellent', 'great', 'top', 'leading', 'premier']
    const negativeWords = ['avoid', 'worst', 'poor', 'bad', 'disappointing']
    
    const positiveCount = positiveWords.filter(word => lowerResponse.includes(word)).length
    const negativeCount = negativeWords.filter(word => lowerResponse.includes(word)).length
    
    sentimentScore = positiveCount > 0 ? 
      (negativeCount > 0 ? 50 : 75) : 
      (negativeCount > 0 ? 25 : 50)
    
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
