/**
 * Follow-up question templates for organic brand visibility testing
 * 
 * These questions are designed to:
 * 1. Never mention the brand directly (organic testing)
 * 2. Encourage the AI to expand on its recommendations
 * 3. Test if the brand "persists" through the conversation
 */

export type QueryType = 'informational' | 'transactional' | 'comparison'

export interface FollowUpTemplate {
  level: 1 | 2 | 3
  queryType: QueryType
  questions: {
    en: string
    cs: string
  }
}

/**
 * Follow-up templates organized by query type and depth level
 */
export const FOLLOW_UP_TEMPLATES: FollowUpTemplate[] = [
  // ============================================
  // INFORMATIONAL QUERIES
  // ============================================
  {
    level: 1,
    queryType: 'informational',
    questions: {
      en: 'Can you elaborate more on your top recommendations?',
      cs: 'Můžeš více rozvést svá hlavní doporučení?'
    }
  },
  {
    level: 2,
    queryType: 'informational',
    questions: {
      en: 'What specific features or qualities should I look for?',
      cs: 'Na jaké konkrétní vlastnosti nebo kvality bych se měl zaměřit?'
    }
  },
  {
    level: 3,
    queryType: 'informational',
    questions: {
      en: 'Are there any other alternatives I should consider?',
      cs: 'Jsou nějaké další alternativy, které bych měl zvážit?'
    }
  },

  // ============================================
  // TRANSACTIONAL QUERIES
  // ============================================
  {
    level: 1,
    queryType: 'transactional',
    questions: {
      en: 'Which option would you specifically recommend to buy and why?',
      cs: 'Kterou možnost bys konkrétně doporučil ke koupi a proč?'
    }
  },
  {
    level: 2,
    queryType: 'transactional',
    questions: {
      en: 'What should I consider before making a purchase?',
      cs: 'Co bych měl zvážit před nákupem?'
    }
  },
  {
    level: 3,
    queryType: 'transactional',
    questions: {
      en: 'Can you compare the top options in terms of value for money?',
      cs: 'Můžeš porovnat top možnosti z hlediska hodnoty za peníze?'
    }
  },

  // ============================================
  // COMPARISON QUERIES
  // ============================================
  {
    level: 1,
    queryType: 'comparison',
    questions: {
      en: 'Can you rank these options and explain your reasoning?',
      cs: 'Můžeš seřadit tyto možnosti a vysvětlit své pořadí?'
    }
  },
  {
    level: 2,
    queryType: 'comparison',
    questions: {
      en: 'What are the key differences between the top options?',
      cs: 'Jaké jsou hlavní rozdíly mezi top možnostmi?'
    }
  },
  {
    level: 3,
    queryType: 'comparison',
    questions: {
      en: 'Which one has the best reputation and why?',
      cs: 'Která z nich má nejlepší reputaci a proč?'
    }
  },
]

/**
 * Get follow-up question for a specific query type and depth level
 */
export function getFollowUpQuestion(
  queryType: QueryType,
  level: 1 | 2 | 3,
  language: string = 'en'
): string {
  const template = FOLLOW_UP_TEMPLATES.find(
    t => t.queryType === queryType && t.level === level
  )

  if (!template) {
    // Fallback to generic question
    return language === 'cs' 
      ? 'Můžeš mi říct více?'
      : 'Can you tell me more?'
  }

  // Use Czech if language starts with 'cs', otherwise English
  const lang = language.toLowerCase().startsWith('cs') ? 'cs' : 'en'
  return template.questions[lang]
}

/**
 * Get all follow-up questions for a query type up to specified depth
 */
export function getFollowUpQuestions(
  queryType: QueryType,
  depth: number,
  language: string = 'en'
): string[] {
  const questions: string[] = []
  
  for (let level = 1; level <= Math.min(depth, 3); level++) {
    questions.push(getFollowUpQuestion(queryType, level as 1 | 2 | 3, language))
  }
  
  return questions
}

/**
 * Weight configuration for calculating overall score with follow-ups
 * 
 * The weights are designed to:
 * - Give significant weight to initial response (baseline)
 * - Reward brands that persist through the conversation
 * - Slightly decrease importance at deeper levels
 */
export const FOLLOW_UP_WEIGHTS = {
  // Weights for different configurations
  depth1: { 0: 0.5, 1: 0.5 },                      // 50% initial, 50% F1
  depth2: { 0: 0.35, 1: 0.35, 2: 0.30 },           // 35% initial, 35% F1, 30% F2
  depth3: { 0: 0.30, 1: 0.30, 2: 0.25, 3: 0.15 }, // 30% initial, 30% F1, 25% F2, 15% F3
} as const

/**
 * Get weight for a specific follow-up level based on total depth
 */
export function getFollowUpWeight(level: number, totalDepth: number): number {
  const weightsKey = `depth${totalDepth}` as keyof typeof FOLLOW_UP_WEIGHTS
  const weights = FOLLOW_UP_WEIGHTS[weightsKey] || FOLLOW_UP_WEIGHTS.depth1
  
  return (weights as Record<number, number>)[level] || 0
}

/**
 * Calculate weighted average score across all follow-up levels
 * @deprecated Use calculateResilienceScore instead for new scoring logic
 */
export function calculateWeightedScore(
  scores: { level: number; score: number | null }[],
  totalDepth: number
): number | null {
  let totalWeight = 0
  let weightedSum = 0
  let hasValidScores = false

  for (const { level, score } of scores) {
    if (score === null) continue
    
    const weight = getFollowUpWeight(level, totalDepth)
    weightedSum += score * weight
    totalWeight += weight
    hasValidScores = true
  }

  if (!hasValidScores || totalWeight === 0) return null
  
  return Math.round(weightedSum / totalWeight)
}

// =====================================================
// RESILIENCE SCORING
// =====================================================

/**
 * Result metrics needed for resilience calculation
 */
export interface ResultForResilience {
  follow_up_level: number
  recommendation_score: number
  visibility_score: number
  sentiment_score: number | null
  brand_mentioned?: boolean
}

/**
 * Resilience score result
 */
export interface ResilienceScoreResult {
  final_score: number           // Final adjusted score (0-100)
  initial_score: number         // Score from Level 0 only
  conversational_bonus: number  // How much follow-ups added/subtracted
  brand_persistence: number     // % of levels where brand was mentioned (0-100)
  sentiment_stability: number   // How stable sentiment is across levels (0-100)
  follow_up_active: boolean     // Whether follow-ups were used in calculation
}

/**
 * Calculate Resilience Score
 * 
 * Scoring algorithm where follow-ups act as confirmation bonuses and persistence matters:
 * - Base: Score from Level 0 (Initial)
 * - If follow-up is BETTER: add 50% of the difference
 * - If follow-up is WORSE: subtract only 20% of the difference
 * - Special case: if brand completely disappears in follow-up, penalize more (40%)
 * - Persistence bonus/penalty:
 *   - 100% persistence: +5 points bonus (brand mentioned in all levels)
 *   - Partial persistence: penalty proportional to lost visibility
 * 
 * @param results - Array of results from a single query-model chain
 * @param followUpEnabled - Whether follow-ups are enabled for this project
 */
export function calculateResilienceScore(
  results: ResultForResilience[],
  followUpEnabled: boolean
): ResilienceScoreResult {
  // Sort by level to ensure correct order
  const sorted = [...results].sort((a, b) => a.follow_up_level - b.follow_up_level)
  
  // Find initial result (level 0)
  const initial = sorted.find(r => r.follow_up_level === 0)
  
  // No initial result - return zeros
  if (!initial) {
    return {
      final_score: 0,
      initial_score: 0,
      conversational_bonus: 0,
      brand_persistence: 0,
      sentiment_stability: 0,
      follow_up_active: false,
    }
  }
  
  const initialScore = initial.recommendation_score
  const followUps = sorted.filter(r => r.follow_up_level > 0)
  
  // If follow-ups disabled or no follow-ups available
  if (!followUpEnabled || followUps.length === 0) {
    const brandMentioned = initial.visibility_score > 0
    return {
      final_score: initialScore,
      initial_score: initialScore,
      conversational_bonus: 0,
      brand_persistence: brandMentioned ? 100 : 0,
      sentiment_stability: 100, // No variation = stable
      follow_up_active: false,
    }
  }
  
  // Calculate brand persistence (% of levels with brand mention)
  const allResults = [initial, ...followUps]
  const brandMentionCount = allResults.filter(r => r.visibility_score > 0).length
  const brandPersistence = Math.round((brandMentionCount / allResults.length) * 100)
  
  // Calculate sentiment stability (100 - average deviation from mean)
  const sentiments = allResults
    .filter(r => r.sentiment_score !== null && r.visibility_score > 0)
    .map(r => r.sentiment_score as number)
  
  let sentimentStability = 100
  if (sentiments.length > 1) {
    const avgSentiment = sentiments.reduce((a, b) => a + b, 0) / sentiments.length
    const avgDeviation = sentiments.reduce((sum, s) => sum + Math.abs(s - avgSentiment), 0) / sentiments.length
    sentimentStability = Math.round(Math.max(0, 100 - avgDeviation))
  }
  
  // Calculate average follow-up score
  const avgFollowUpScore = followUps.reduce((acc, r) => acc + r.recommendation_score, 0) / followUps.length
  
  // Check if brand disappeared in any follow-up
  const brandDisappearedInFollowUp = initial.visibility_score > 0 && 
    followUps.some(r => r.visibility_score === 0)
  
  // Calculate difference between follow-up and initial scores
  const diff = avgFollowUpScore - initialScore
  
  // === SCORE ADJUSTMENT ===
  // Part 1: Asymmetric adjustment based on follow-up recommendation scores
  let scoreAdjustment: number
  if (diff > 0) {
    // Follow-up is BETTER: add 50% of the improvement
    scoreAdjustment = diff * 0.5
  } else if (brandDisappearedInFollowUp) {
    // Brand disappeared: penalize more (40% of the drop)
    scoreAdjustment = diff * 0.4
  } else {
    // Follow-up is WORSE but brand still present: mild penalty (20%)
    scoreAdjustment = diff * 0.2
  }
  
  // Part 2: Persistence bonus/penalty
  // - 100% persistence (brand in all levels): +5 points bonus
  // - Partial persistence: penalty proportional to lost percentage
  // - 0% persistence (brand never mentioned): no persistence bonus (already penalized by low scores)
  let persistenceAdjustment = 0
  if (initial.visibility_score > 0) {
    // Only apply persistence adjustment if brand was initially mentioned
    if (brandPersistence === 100) {
      // Full persistence: +5 points bonus
      persistenceAdjustment = 5
    } else if (brandPersistence > 0) {
      // Partial persistence: penalty based on how much was lost
      // e.g., 50% persistence = -2.5 points, 25% = -3.75 points
      const lostPercentage = (100 - brandPersistence) / 100
      persistenceAdjustment = -lostPercentage * 5
    } else {
      // 0% persistence in follow-ups (brand completely lost): -5 points
      persistenceAdjustment = -5
    }
  }
  
  // Total adjustment
  const totalAdjustment = scoreAdjustment + persistenceAdjustment
  
  // Clamp final score to 0-100 (round to 1 decimal)
  const finalScore = Math.round(Math.min(100, Math.max(0, initialScore + totalAdjustment)) * 10) / 10
  
  return {
    final_score: finalScore,
    initial_score: initialScore,
    conversational_bonus: Math.round(totalAdjustment * 10) / 10, // Round to 1 decimal
    brand_persistence: brandPersistence,
    sentiment_stability: sentimentStability,
    follow_up_active: true,
  }
}

/**
 * Calculate aggregated resilience score across multiple query-model chains
 * 
 * @param chainResults - Array of arrays, each representing a conversation chain
 * @param followUpEnabled - Whether follow-ups are enabled
 */
export function calculateAggregatedResilienceScore(
  chainResults: ResultForResilience[][],
  followUpEnabled: boolean
): ResilienceScoreResult {
  if (chainResults.length === 0) {
    return {
      final_score: 0,
      initial_score: 0,
      conversational_bonus: 0,
      brand_persistence: 0,
      sentiment_stability: 100,
      follow_up_active: false,
    }
  }
  
  // Calculate resilience for each chain
  const chainScores = chainResults.map(chain => calculateResilienceScore(chain, followUpEnabled))
  
  // Average all metrics
  const count = chainScores.length
  
  return {
    final_score: Math.round(chainScores.reduce((sum, s) => sum + s.final_score, 0) / count * 10) / 10,
    initial_score: Math.round(chainScores.reduce((sum, s) => sum + s.initial_score, 0) / count * 10) / 10,
    conversational_bonus: Math.round(chainScores.reduce((sum, s) => sum + s.conversational_bonus, 0) / count * 10) / 10,
    brand_persistence: Math.round(chainScores.reduce((sum, s) => sum + s.brand_persistence, 0) / count),
    sentiment_stability: Math.round(chainScores.reduce((sum, s) => sum + s.sentiment_stability, 0) / count),
    follow_up_active: followUpEnabled && chainScores.some(s => s.follow_up_active),
  }
}

/**
 * Colors for displaying follow-up levels in UI
 */
export const FOLLOW_UP_COLORS = {
  0: { name: 'Initial', color: '#3b82f6', bgColor: 'bg-blue-500' },    // Blue
  1: { name: 'F1', color: '#22c55e', bgColor: 'bg-green-500' },        // Green
  2: { name: 'F2', color: '#f97316', bgColor: 'bg-orange-500' },       // Orange
  3: { name: 'F3', color: '#a855f7', bgColor: 'bg-purple-500' },       // Purple
} as const

export function getFollowUpColor(level: number): (typeof FOLLOW_UP_COLORS)[keyof typeof FOLLOW_UP_COLORS] {
  return FOLLOW_UP_COLORS[level as keyof typeof FOLLOW_UP_COLORS] || FOLLOW_UP_COLORS[0]
}
