'use client'

import { useState, useEffect } from 'react'

export interface ModelPricing {
  id: number
  provider: string
  model: string
  input_cost_cents: number
  output_cost_cents: number
  available_free_tier: boolean
  is_active: boolean
  // Admin-only fields
  base_input_cost_cents?: number
  base_output_cost_cents?: number
  markup_percentage?: number
  final_input_cost_cents?: number
  final_output_cost_cents?: number
}

interface PricingResponse {
  pricing: ModelPricing[]
  availableModels: string[] | null
  isLimited: boolean
  isAdmin: boolean
}

interface UsePricingReturn {
  pricing: ModelPricing[]
  availableModels: string[]
  isAdmin: boolean
  isLimited: boolean
  isLoading: boolean
  error: string | null
  refresh: () => void
  getModelPrice: (model: string) => { input: number; output: number } | null
  getEstimatedCost: (models: string[], queriesCount?: number, tokensPerQuery?: number) => number
}

export function usePricing(): UsePricingReturn {
  const [pricing, setPricing] = useState<ModelPricing[]>([])
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [isLimited, setIsLimited] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPricing = async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      const res = await fetch('/api/credits/pricing')
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to fetch pricing')
      }
      
      const data: PricingResponse = await res.json()
      setPricing(data.pricing.filter(p => p.is_active))
      setAvailableModels(data.availableModels || data.pricing.filter(p => p.is_active).map(p => p.model))
      setIsAdmin(data.isAdmin)
      setIsLimited(data.isLimited)
    } catch (err: any) {
      console.error('[usePricing] Error:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchPricing()
  }, [])

  const getModelPrice = (model: string) => {
    const modelPricing = pricing.find(p => p.model === model)
    if (!modelPricing) return null
    
    // Convert cents to USD per 1M tokens
    return {
      input: modelPricing.input_cost_cents / 100,
      output: modelPricing.output_cost_cents / 100,
    }
  }

  const getEstimatedCost = (models: string[], queriesCount = 10, tokensPerQuery = 500) => {
    let totalCost = 0
    
    for (const model of models) {
      const price = getModelPrice(model)
      if (price) {
        // Calculate cost for estimated tokens
        const inputCost = (tokensPerQuery / 1_000_000) * price.input * queriesCount
        const outputCost = (tokensPerQuery / 1_000_000) * price.output * queriesCount
        totalCost += inputCost + outputCost
      }
    }
    
    return totalCost
  }

  return {
    pricing,
    availableModels,
    isAdmin,
    isLimited,
    isLoading,
    error,
    refresh: fetchPricing,
    getModelPrice,
    getEstimatedCost,
  }
}

// Helper to format price for display
export function formatPrice(usdPerMillion: number): string {
  if (usdPerMillion < 0.01) {
    return `$${(usdPerMillion * 1000).toFixed(2)}/1K`
  }
  if (usdPerMillion < 1) {
    return `$${usdPerMillion.toFixed(3)}/1M`
  }
  return `$${usdPerMillion.toFixed(2)}/1M`
}
