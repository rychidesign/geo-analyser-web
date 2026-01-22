import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { TABLES } from '@/lib/db/schema'
import { callLLM } from '@/lib/llm'
import type { LLMProvider, LLMModel } from '@/lib/llm/types'

const GENERATION_PROMPT = `You are an expert in GEO (Generative Engine Optimization) and SEO. Your task is to generate test queries that will be used to evaluate how well AI models organically mention and recommend brands in a specific industry.

Context (for understanding the industry only - DO NOT use these names in queries):
- Industry/Category: Based on keywords: {keywords}
- Domain type: {domain}
- Language: {language}

CRITICAL RULES:
1. DO NOT include any brand names, company names, or product names in the queries
2. Queries must be GENERIC industry questions where a brand MIGHT naturally be recommended
3. The goal is to test if AI will organically mention the brand without being asked about it directly

Generate exactly 5 diverse test queries that a potential customer might ask an AI assistant. The queries should:

1. Cover different query types:
   - Informational (e.g., "What are the best tools for project management?")
   - Transactional (e.g., "Where can I find affordable CRM software?")
   - Comparison (e.g., "What should I consider when choosing an email marketing platform?")

2. Be natural and realistic - the way real users would ask

3. Cover different aspects:
   - General category/industry searches
   - Problem-solving queries
   - Recommendation requests
   - "Best of" and "top" lists
   - How-to questions related to the industry

4. Use the provided language for the queries

5. NEVER mention specific brands - keep queries generic to the industry/category

Return ONLY a valid JSON array of objects with this exact structure:
[
  {
    "query_text": "The actual query text",
    "query_type": "informational" | "transactional" | "comparison"
  }
]

Do not include any explanation, markdown formatting, or anything else - just the JSON array.`

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id: projectId } = await params

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

    const queryGenerationModel = (helperSettings?.model || 'gpt-5-nano') as LLMModel
    
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
