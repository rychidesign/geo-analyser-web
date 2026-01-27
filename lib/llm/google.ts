import { GoogleGenerativeAI } from '@google/generative-ai'
import type { LLMConfig, LLMResponse } from './types'

// Map our model IDs to actual Google AI API model names
const MODEL_MAP: Record<string, string> = {
  'gemini-3-pro-preview': 'gemini-3-pro-preview',       // Gemini 3 Pro Preview
  'gemini-3-flash-preview': 'gemini-3-flash-preview',   // Gemini 3 Flash Preview
  'gemini-2-5-flash': 'gemini-2.5-flash',               // Gemini 2.5 Flash
  'gemini-2-5-flash-lite': 'gemini-2.5-flash-lite',     // Gemini 2.5 Flash Lite
  // Support legacy names with dots (from old DB entries)
  'gemini-3.pro.preview': 'gemini-3-pro-preview',
  'gemini-3.flash.preview': 'gemini-3-flash-preview',
  'gemini-2.5.flash': 'gemini-2.5-flash',
  'gemini-2.5.flash.lite': 'gemini-2.5-flash-lite',
}

// Timeout for API calls (Vercel Hobby has 25s limit for Edge)
const API_TIMEOUT_MS = 22000

export async function callGoogle(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<LLMResponse> {
  const genAI = new GoogleGenerativeAI(config.apiKey)
  
  // Map to actual API model name
  const apiModel = MODEL_MAP[config.model] || config.model
  
  const model = genAI.getGenerativeModel({ 
    model: apiModel,
    systemInstruction: systemPrompt,
    generationConfig: {
      maxOutputTokens: 1000, // Limit response size to speed up
    },
  })

  // Use AbortController for timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  
  try {
    const result = await model.generateContent(userPrompt)
    clearTimeout(timeoutId)
    
    const response = result.response
    const content = response.text()

    // Google returns usage metadata
    const usageMetadata = response.usageMetadata

    return {
      content,
      inputTokens: usageMetadata?.promptTokenCount || 0,
      outputTokens: usageMetadata?.candidatesTokenCount || 0,
      model: config.model, // Return our model ID for consistency
    }
  } catch (error: any) {
    clearTimeout(timeoutId)
    if (error.name === 'AbortError') {
      throw new Error(`Google AI request timed out after ${API_TIMEOUT_MS}ms`)
    }
    throw error
  }
}
