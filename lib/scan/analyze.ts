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
  
  // Simple sentiment analysis (presence of positive/negative words)
  const positiveWords = ['recommend', 'best', 'excellent', 'great', 'top', 'leading', 'premier']
  const negativeWords = ['avoid', 'worst', 'poor', 'bad', 'disappointing']
  
  const positiveCount = positiveWords.filter(word => lowerResponse.includes(word)).length
  const negativeCount = negativeWords.filter(word => lowerResponse.includes(word)).length
  
  const sentimentScore = positiveCount > 0 ? 
    (negativeCount > 0 ? 50 : 75) : 
    (negativeCount > 0 ? 25 : 50)
  
  return {
    visibility_score: brandMentioned ? 100 : 0,
    sentiment_score: brandMentioned ? sentimentScore : 0,
    citation_score: domainMentioned ? 100 : 0,
    ranking_score: brandMentioned ? (positiveCount > 0 ? 90 : 50) : 0,
    recommendation_score: brandMentioned ? sentimentScore : 0,
  }
}
