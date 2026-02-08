import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { TABLES } from '@/lib/db/schema'
import { callAI, getCheapestEvaluationModel, getModelInfo } from '@/lib/ai'
import { calculateDynamicCost, deductCredits, getUserProfile } from '@/lib/credits'

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

    // Use project-level query generation model or default to cheapest
    let modelToUse = project.query_generation_model || getCheapestEvaluationModel()
    
    // Validate model exists
    const modelInfo = getModelInfo(modelToUse)
    if (!modelInfo) {
      console.warn(`[Generate] Unknown model ${modelToUse}, using default`)
      modelToUse = getCheapestEvaluationModel()
    }

    // Build the prompt - intentionally NOT including brand name to keep queries generic
    const prompt = GENERATION_PROMPT
      .replace('{domain}', project.domain)
      .replace('{keywords}', project.target_keywords?.join(', ') || 'general')
      .replace('{language}', project.language || 'English')
      .replace('{count}', count.toString())

    // Call AI using new module
    const response = await callAI({
      model: modelToUse,
      systemPrompt: 'You are an expert in GEO (Generative Engine Optimization) and SEO.',
      userPrompt: prompt,
      maxOutputTokens: 2048,
      temperature: 0.8, // Higher temperature for more creative/varied queries
    })

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

    // Deduplicate: fetch existing query texts for this project
    const { data: existingQueries } = await supabase
      .from(TABLES.PROJECT_QUERIES)
      .select('query_text')
      .eq('project_id', projectId)

    const existingTexts = new Set(
      (existingQueries || []).map((q: { query_text: string }) => q.query_text.trim().toLowerCase())
    )

    // Filter out queries that already exist (case-insensitive) and deduplicate within batch
    const seenTexts = new Set<string>()
    const queriesToInsert = validQueries
      .filter(q => {
        const normalized = q.query_text.trim().toLowerCase()
        if (existingTexts.has(normalized) || seenTexts.has(normalized)) {
          return false
        }
        seenTexts.add(normalized)
        return true
      })
      .map(q => ({
        project_id: projectId,
        query_text: q.query_text.trim(),
        query_type: q.query_type,
        is_ai_generated: true,
        is_active: true,
      }))

    if (queriesToInsert.length === 0) {
      return NextResponse.json({
        queries: [],
        generation: {
          provider: response.provider,
          model: modelToUse,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          costUsd: 0,
        },
        message: 'All generated queries already exist in this project.',
      })
    }

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

    // Calculate cost with dynamic pricing
    const costCents = await calculateDynamicCost(
      modelToUse,
      response.inputTokens,
      response.outputTokens
    )

    // Update monthly usage for the generation cost
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    
    // Try to update existing record
    const { data: existing } = await supabase
      .from('monthly_usage')
      .select()
      .eq('user_id', user.id)
      .eq('month', month)
      .eq('provider', response.provider)
      .eq('model', modelToUse)
      .eq('usage_type', 'generation')
      .single()

    if (existing) {
      await supabase
        .from('monthly_usage')
        .update({
          total_input_tokens: existing.total_input_tokens + (response.inputTokens || 0),
          total_output_tokens: existing.total_output_tokens + (response.outputTokens || 0),
          total_cost_usd: existing.total_cost_usd + (costCents / 100),
          scan_count: existing.scan_count + 1,
        })
        .eq('id', existing.id)
    } else {
      await supabase
        .from('monthly_usage')
        .insert({
          user_id: user.id,
          month,
          provider: response.provider,
          model: modelToUse,
          usage_type: 'generation',
          total_input_tokens: response.inputTokens || 0,
          total_output_tokens: response.outputTokens || 0,
          total_cost_usd: costCents / 100,
          scan_count: 1,
        })
    }

    // Deduct credits for paid tier users
    if (costCents > 0) {
      const profile = await getUserProfile(user.id)
      if (profile && profile.tier === 'paid') {
        const deductResult = await deductCredits(user.id, costCents, {
          description: `Query generation: ${validQueries.length} queries using ${modelToUse}`,
          referenceType: 'generation',
          referenceId: projectId,
          metadata: {
            model: modelToUse,
            queryCount: validQueries.length,
            inputTokens: response.inputTokens,
            outputTokens: response.outputTokens,
          },
        })
        
        if (!deductResult.success) {
          console.warn(`[Generate] Failed to deduct credits: ${deductResult.error}`)
          // Don't fail the request - queries were already generated
        }
      }
    }

    return NextResponse.json({
      queries: insertedQueries,
      generation: {
        provider: response.provider,
        model: modelToUse,
        costUsd: costCents / 100,
        costCents,
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
