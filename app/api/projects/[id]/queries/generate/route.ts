import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { TABLES } from '@/lib/db/schema'
import { callLLM } from '@/lib/llm'
import type { LLMProvider, LLMModel } from '@/lib/llm/types'

const GENERATION_PROMPT = `You are an expert in GEO (Generative Engine Optimization). Generate test queries that real people would ask an AI assistant.

Context (for understanding the industry only - DO NOT use these names in queries):
- Industry/Category: Based on keywords: {keywords}
- Domain type: {domain}
- Language: {language}

CRITICAL RULES:
1. DO NOT include any brand names, company names, or product names
2. Queries must be GENERIC industry questions where a brand MIGHT naturally be recommended
3. The goal is to test if AI will organically mention the brand without being asked directly

Generate exactly {count} diverse test queries. Make them sound HUMAN and CONVERSATIONAL:

**SOUND LIKE A REAL PERSON:**
- Use casual, everyday language (not corporate-speak)
- Include conversational starters: "I'm looking for...", "Can you recommend...", "What's the go-to for...", "I need help with..."
- Add context/situation: "I've been doing X manually but...", "My team is growing and we need...", "I'm a beginner and..."
- Express frustration or goals: "I'm tired of...", "I want something that...", "Is there anything that actually..."
- Ask like talking to a friend: "Hey, what do people use for...", "Any suggestions for..."

**VARY THE STYLE:**
- Some short and direct: "best app for X?"
- Some with personal context: "I run a small business and need..."
- Some comparing approaches: "should I use X approach or Y approach for..."
- Some problem-focused: "how do I solve..." or "what's the easiest way to..."

**QUERY TYPES TO COVER:**
- Informational: seeking knowledge ("how does X work?", "what should I know about...")
- Transactional: ready to act ("where can I find...", "what's a good...")
- Comparison: evaluating options ("what's better for...", "pros and cons of...")

**USE THE PROVIDED LANGUAGE** - If Czech, write in natural spoken Czech. If English, use casual English.

Return ONLY a valid JSON array:
[
  {
    "query_text": "The actual query text",
    "query_type": "informational" | "transactional" | "comparison"
  }
]

No explanation, no markdown - just the JSON array.`

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id: projectId } = await params

    // Parse request body for count
    let count = 5
    try {
      const body = await request.json()
      if (body.count && typeof body.count === 'number' && body.count >= 1 && body.count <= 20) {
        count = body.count
      }
    } catch {
      // If no body or invalid JSON, use default count of 5
    }

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get project details
    const { data: project, error: projectError } = await supabase
      .from(TABLES.PROJECTS)
      .select('*')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single()

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Get helper model settings
    const { data: helperSettings } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', '_helpers')
      .single()

    const queryGenerationModel = (helperSettings?.model || 'gpt-5-mini') as LLMModel
    
    // Determine provider from model name
    const getProviderFromModel = (model: string): LLMProvider => {
      if (model.startsWith('gpt')) return 'openai'
      if (model.startsWith('claude')) return 'anthropic'
      if (model.startsWith('gemini')) return 'google'
      return 'openai'
    }

    const provider = getProviderFromModel(queryGenerationModel)
    const model = queryGenerationModel

    // Get API key for the provider
    const { data: providerSettings } = await supabase
      .from('user_settings')
      .select('encrypted_api_key')
      .eq('user_id', user.id)
      .eq('provider', provider)
      .single()

    const apiKey = providerSettings?.encrypted_api_key

    if (!apiKey) {
      return NextResponse.json(
        { error: `No API key configured for ${provider}. Please add an API key in Settings.` },
        { status: 400 }
      )
    }

    // Build the prompt - intentionally NOT including brand name to keep queries generic
    const prompt = GENERATION_PROMPT
      .replace('{domain}', project.domain)
      .replace('{keywords}', project.target_keywords?.join(', ') || 'general')
      .replace('{language}', project.language || 'English')
      .replace('{count}', count.toString())

    // Call LLM
    const response = await callLLM(
      { provider, model, apiKey },
      'You are an expert in GEO (Generative Engine Optimization) and SEO.',
      prompt
    )

    if (!response.content) {
      return NextResponse.json(
        { error: 'Failed to generate queries' },
        { status: 500 }
      )
    }

    // Parse the response
    let generatedQueries: Array<{ query_text: string; query_type: string }>
    
    try {
      // Try to extract JSON from the response (handle potential markdown wrapping)
      let jsonContent = response.content.trim()
      
      // Remove markdown code blocks if present
      if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
      }
      
      generatedQueries = JSON.parse(jsonContent)
      
      if (!Array.isArray(generatedQueries)) {
        throw new Error('Response is not an array')
      }
    } catch (parseError) {
      console.error('Failed to parse LLM response:', response.content)
      return NextResponse.json(
        { error: 'Failed to parse generated queries. Please try again.' },
        { status: 500 }
      )
    }

    // Validate and insert queries
    const validQueries = generatedQueries.filter(q => 
      q.query_text && 
      typeof q.query_text === 'string' &&
      ['informational', 'transactional', 'comparison'].includes(q.query_type)
    )

    if (validQueries.length === 0) {
      return NextResponse.json(
        { error: 'No valid queries generated. Please try again.' },
        { status: 500 }
      )
    }

    // Insert queries into database
    const queriesToInsert = validQueries.map(q => ({
      project_id: projectId,
      query_text: q.query_text.trim(),
      query_type: q.query_type,
      is_ai_generated: true,
      is_active: true,
    }))

    const { data: insertedQueries, error: insertError } = await supabase
      .from(TABLES.PROJECT_QUERIES)
      .insert(queriesToInsert)
      .select()

    if (insertError) {
      console.error('Error inserting queries:', insertError)
      return NextResponse.json(
        { error: 'Failed to save generated queries' },
        { status: 500 }
      )
    }

    // Update monthly usage for the generation cost
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    
    // Try to update existing record
    const { data: existing } = await supabase
      .from('monthly_usage')
      .select()
      .eq('user_id', user.id)
      .eq('month', month)
      .eq('provider', provider)
      .eq('model', model)
      .eq('usage_type', 'generation')
      .single()

    if (existing) {
      await supabase
        .from('monthly_usage')
        .update({
          total_input_tokens: existing.total_input_tokens + (response.inputTokens || 0),
          total_output_tokens: existing.total_output_tokens + (response.outputTokens || 0),
          total_cost_usd: existing.total_cost_usd + (response.costUsd || 0),
          scan_count: existing.scan_count + 1,
        })
        .eq('id', existing.id)
    } else {
      await supabase
        .from('monthly_usage')
        .insert({
          user_id: user.id,
          month,
          provider,
          model,
          usage_type: 'generation',
          total_input_tokens: response.inputTokens || 0,
          total_output_tokens: response.outputTokens || 0,
          total_cost_usd: response.costUsd || 0,
          scan_count: 1,
        })
    }

    return NextResponse.json({
      queries: insertedQueries,
      generation: {
        provider,
        model,
        cost: response.costUsd,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
      }
    })
  } catch (error) {
    console.error('Error generating queries:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
