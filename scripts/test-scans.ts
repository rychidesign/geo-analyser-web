/**
 * Test scan functionality: run a minimal scan, store LLM response,
 * verify full response saved, and attempt evaluation.
 *
 * Run with: npx tsx scripts/test-scans.ts
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'
import { callOpenAI } from '@/lib/llm/openai'
import { callAnthropic } from '@/lib/llm/anthropic'
import { callGoogle } from '@/lib/llm/google'
import { callGroq } from '@/lib/llm/groq'
import { callPerplexity } from '@/lib/llm/perplexity'
import { getGEOSystemPrompt, callEvaluation, getCheapestEvaluationModel } from '@/lib/ai'
import { getFollowUpQuestion, type QueryType } from '@/lib/scan/follow-up-templates'
import { calculateCost, type LLMModel, type LLMProvider, type LLMResponse, type ConversationMessage } from '@/lib/ai'

// =====================================================
// Environment Setup
// =====================================================

function loadEnv() {
  const envPath = join(process.cwd(), '.env.local')
  const envContent = readFileSync(envPath, 'utf-8')
  const vars: Record<string, string> = {}

  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const eqIndex = trimmed.indexOf('=')
    if (eqIndex > 0) {
      const key = trimmed.slice(0, eqIndex).trim()
      const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '')
      vars[key] = value
    }
  }
  // Populate process.env for downstream modules (AI gateway, providers)
  for (const [key, value] of Object.entries(vars)) {
    if (!process.env[key]) {
      process.env[key] = value
    }
  }
  return vars
}

const env = loadEnv()
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// =====================================================
// Helpers
// =====================================================

type TestStatus = 'passed' | 'failed' | 'skipped'
type ScanTestResult = { test: string; status: TestStatus; message: string }
const results: ScanTestResult[] = []

function logTest(test: string, status: TestStatus, message: string) {
  const icon = status === 'passed' ? '✅' : status === 'skipped' ? '⚠️' : '❌'
  console.log(`${icon} ${test}: ${message}`)
  results.push({ test, status, message })
}

const PROVIDER_DEFAULT_MODELS: Record<LLMProvider, LLMModel> = {
  openai: 'gpt-5-nano',
  anthropic: 'claude-haiku-4-5',
  google: 'gemini-2-5-flash-lite',
  groq: 'llama-4-scout',
  perplexity: 'sonar-reasoning-pro',
}

type PricingConfigRow = {
  model: string
  final_input_cost_cents: number
  final_output_cost_cents: number
}

function getEvaluationModelFromEnv(): LLMModel | null {
  if (process.env.VERCEL_AI_GATEWAY_SECRET_KEY || process.env.AI_GATEWAY_API_KEY) {
    return getCheapestEvaluationModel() as LLMModel
  }

  if (process.env.OPENAI_API_KEY) return 'gpt-5-mini'
  if (process.env.ANTHROPIC_API_KEY) return 'claude-haiku-4-5'
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return 'gemini-2-5-flash-lite'
  if (process.env.GROQ_API_KEY) return 'llama-4-scout'
  if (process.env.PERPLEXITY_API_KEY) return 'sonar-reasoning-pro'

  return null
}

async function findUserWithApiKey(): Promise<{
  userId: string
  email: string
  provider: LLMProvider
  apiKey: string
  model: LLMModel
} | null> {
  const { data: settings, error } = await supabase
    .from('user_settings')
    .select('user_id, provider, encrypted_api_key')
    .not('encrypted_api_key', 'is', null)

  if (error || !settings || settings.length === 0) {
    return null
  }

  const validProviders = new Set(['openai', 'anthropic', 'google', 'groq', 'perplexity'])
  const first = settings.find(s => validProviders.has(s.provider))
  if (!first || !first.encrypted_api_key) return null

  const { data: authData } = await supabase.auth.admin.listUsers()
  const email = authData?.users.find(u => u.id === first.user_id)?.email || 'Unknown'

  const provider = first.provider as LLMProvider
  const model = PROVIDER_DEFAULT_MODELS[provider]

  return {
    userId: first.user_id,
    email,
    provider,
    apiKey: first.encrypted_api_key,
    model,
  }
}

async function callProviderLLM(
  provider: LLMProvider,
  apiKey: string,
  model: LLMModel,
  systemPrompt: string,
  userPrompt: string,
  conversationHistory?: ConversationMessage[]
): Promise<{ response: LLMResponse; costUsd: number }> {
  let response: LLMResponse

  switch (provider) {
    case 'openai':
      response = await callOpenAI({ provider, apiKey, model }, systemPrompt, userPrompt, conversationHistory)
      break
    case 'anthropic':
      response = await callAnthropic({ provider, apiKey, model }, systemPrompt, userPrompt, conversationHistory)
      break
    case 'google':
      response = await callGoogle({ provider, apiKey, model }, systemPrompt, userPrompt, conversationHistory)
      break
    case 'groq':
      response = await callGroq({ provider, apiKey, model }, systemPrompt, userPrompt, conversationHistory)
      break
    case 'perplexity':
      response = await callPerplexity({ provider, apiKey, model }, systemPrompt, userPrompt, conversationHistory)
      break
    default:
      throw new Error(`Unsupported provider: ${provider}`)
  }

  const costUsd = calculateCost(response.model, response.inputTokens, response.outputTokens)
  return { response, costUsd }
}

async function getPricingMap(models: string[]): Promise<Map<string, PricingConfigRow>> {
  const { data, error } = await supabase
    .from('pricing_config')
    .select('model, final_input_cost_cents, final_output_cost_cents')
    .in('model', models)
    .eq('is_active', true)

  if (error || !data) {
    throw new Error(`Failed to fetch pricing_config: ${error?.message || 'unknown error'}`)
  }

  const map = new Map<string, PricingConfigRow>()
  for (const row of data) {
    map.set(row.model, row)
  }
  return map
}

function calculateDynamicCostFromPricing(
  pricing: PricingConfigRow | undefined,
  inputTokens: number,
  outputTokens: number
): number {
  if (!pricing) return 0
  const inputCost = (inputTokens / 1_000_000) * pricing.final_input_cost_cents
  const outputCost = (outputTokens / 1_000_000) * pricing.final_output_cost_cents
  return Math.ceil(inputCost + outputCost)
}

function estimateScanCostCents(
  pricingMap: Map<string, PricingConfigRow>,
  models: string[],
  queryCount: number,
  avgInputTokens: number = 500,
  avgOutputTokens: number = 1000
): number {
  let totalCents = 0
  for (const modelId of models) {
    const pricing = pricingMap.get(modelId)
    if (!pricing) continue
    const inputCost = (avgInputTokens / 1_000_000) * pricing.final_input_cost_cents
    const outputCost = (avgOutputTokens / 1_000_000) * pricing.final_output_cost_cents
    totalCents += (inputCost + outputCost) * queryCount
  }
  return Math.ceil(totalCents * 1.5)
}

// =====================================================
// Main Scan Test
// =====================================================

async function runScanTest() {
  console.log('═'.repeat(70))
  console.log('  🧪 Scan Functionality Tests')
  console.log('═'.repeat(70))

  const user = await findUserWithApiKey()
  if (!user) {
    logTest('Scan setup', 'failed', 'No user with LLM API key found in user_settings')
    return
  }

  console.log(`  Using user: ${user.email}`)
  console.log(`  Provider: ${user.provider}, Model: ${user.model}`)

  const brand = 'ExampleCo'
  const domain = 'example.com'
  const queryText = `Which analytics tools would you recommend? Include ${brand} if relevant.`
  const projectName = `Scan Test ${new Date().toISOString()}`
  const followUpDepth = 1
  const queryType: QueryType = 'informational'
  const evaluationModel = getEvaluationModelFromEnv()
  const modelsInUse = [user.model, ...(evaluationModel ? [evaluationModel] : [])]
  const pricingMap = await getPricingMap(modelsInUse)

  // Create project
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .insert({
      user_id: user.userId,
      name: projectName,
      domain,
      brand_variations: [brand],
      target_keywords: ['analytics', 'tools'],
      language: 'en',
      selected_models: [user.model],
      follow_up_enabled: true,
      follow_up_depth: followUpDepth,
      query_generation_model: user.model,
      evaluation_model: evaluationModel || 'gpt-5-mini',
    })
    .select()
    .single()

  if (projectError || !project) {
    logTest('Create project', 'failed', projectError?.message || 'Failed to create project')
    return
  }
  logTest('Create project', 'passed', `Project created: ${project.id}`)

  // Create query
  const { data: query, error: queryError } = await supabase
    .from('project_queries')
    .insert({
      project_id: project.id,
      query_text: queryText,
      query_type: 'informational',
      is_active: true,
      is_ai_generated: false,
    })
    .select()
    .single()

  if (queryError || !query) {
    logTest('Create query', 'failed', queryError?.message || 'Failed to create query')
    return
  }
  logTest('Create query', 'passed', `Query created: ${query.id}`)

  // Create scan record
  const { data: scan, error: scanError } = await supabase
    .from('scans')
    .insert({
      project_id: project.id,
      user_id: user.userId,
      status: 'running',
      evaluation_method: 'ai',
      total_cost_usd: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_queries: 1,
      total_results: 0,
    })
    .select()
    .single()

  if (scanError || !scan) {
    logTest('Create scan', 'failed', scanError?.message || 'Failed to create scan')
    return
  }
  logTest('Create scan', 'passed', `Scan started: ${scan.id}`)

  // Prepare credits (force paid tier with buffer)
  const { data: profileBefore } = await supabase
    .from('user_profiles')
    .select('tier, credit_balance_cents')
    .eq('user_id', user.userId)
    .single()

  const originalTier = profileBefore?.tier
  const originalBalance = profileBefore?.credit_balance_cents ?? 0
  const estimatedCostCents = estimateScanCostCents(pricingMap, [user.model], 1)
  const reservationAmount = Math.ceil(estimatedCostCents * 1.2)
  const startingBalance = Math.max(originalBalance, reservationAmount + 5000)

  await supabase
    .from('user_profiles')
    .update({ tier: 'paid', credit_balance_cents: startingBalance })
    .eq('user_id', user.userId)

  const reservationBalanceAfter = startingBalance - reservationAmount
  const { data: reservation } = await supabase
    .from('credit_reservations')
    .insert({
      user_id: user.userId,
      amount_cents: reservationAmount,
      scan_id: scan.id,
      status: 'active',
    })
    .select('id')
    .single()

  await supabase
    .from('user_profiles')
    .update({ credit_balance_cents: reservationBalanceAfter })
    .eq('user_id', user.userId)

  logTest('Credit reservation', 'passed', `Reserved ${reservationAmount} cents`)

  // Call LLM
  let llmResponse: LLMResponse
  let llmCostUsd = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalCostCents = 0

  try {
    const result = await callProviderLLM(
      user.provider,
      user.apiKey,
      user.model,
      getGEOSystemPrompt('en'),
      queryText
    )
    llmResponse = result.response
    llmCostUsd = result.costUsd
    totalInputTokens += llmResponse.inputTokens
    totalOutputTokens += llmResponse.outputTokens
    totalCostCents += calculateDynamicCostFromPricing(
      pricingMap.get(user.model),
      llmResponse.inputTokens,
      llmResponse.outputTokens
    )
    logTest('LLM call', 'passed', `Response length: ${llmResponse.content.length} chars`)
  } catch (err: any) {
    logTest('LLM call', 'failed', err.message || 'Failed to call LLM')
    return
  }

  // Attempt evaluation
  let evaluationMetrics = null
  let evaluationInfo = null
  try {
    if (!evaluationModel) {
      logTest('Evaluation', 'skipped', 'No AI gateway or provider API keys configured in env')
    } else {
      const evalResult = await callEvaluation(evaluationModel, llmResponse.content, [brand], domain)
      evaluationMetrics = evalResult.metrics
      evaluationInfo = evalResult
      totalInputTokens += evalResult.inputTokens
      totalOutputTokens += evalResult.outputTokens
      totalCostCents += calculateDynamicCostFromPricing(
        pricingMap.get(evaluationModel),
        evalResult.inputTokens,
        evalResult.outputTokens
      )
      logTest('Evaluation', 'passed', `Visibility: ${evalResult.metrics?.visibility_score ?? 'n/a'}`)
    }
  } catch (err: any) {
    logTest('Evaluation', 'skipped', err.message)
  }

  // Save scan result
  const { data: result, error: resultError } = await supabase
    .from('scan_results')
    .insert({
      scan_id: scan.id,
      provider: user.provider,
      model: user.model,
      query_text: queryText,
      ai_response_raw: llmResponse.content,
      metrics_json: evaluationMetrics,
      input_tokens: llmResponse.inputTokens,
      output_tokens: llmResponse.outputTokens,
      cost_usd: llmCostUsd,
      follow_up_level: 0,
      parent_result_id: null,
      follow_up_query_used: null,
    })
    .select()
    .single()

  if (resultError || !result) {
    logTest('Save scan result', 'failed', resultError?.message || 'Failed to save result')
    return
  }
  logTest('Save scan result', 'passed', `Result saved: ${result.id}`)

  // Follow-up (level 1)
  let followUpResponse: LLMResponse | null = null
  if (followUpDepth > 0) {
    const followUpQuestion = getFollowUpQuestion(queryType, 1, 'en')
    const conversationHistory: ConversationMessage[] = [
      { role: 'user', content: queryText },
      { role: 'assistant', content: llmResponse.content },
    ]

    try {
      const followUpResult = await callProviderLLM(
        user.provider,
        user.apiKey,
        user.model,
        getGEOSystemPrompt('en'),
        followUpQuestion,
        conversationHistory
      )
      followUpResponse = followUpResult.response
      totalInputTokens += followUpResponse.inputTokens
      totalOutputTokens += followUpResponse.outputTokens
      totalCostCents += calculateDynamicCostFromPricing(
        pricingMap.get(user.model),
        followUpResponse.inputTokens,
        followUpResponse.outputTokens
      )
      logTest('Follow-up LLM call', 'passed', `Response length: ${followUpResponse.content.length} chars`)
    } catch (err: any) {
      logTest('Follow-up LLM call', 'failed', err.message || 'Failed to call follow-up LLM')
      return
    }

    let followUpMetrics = null
    try {
      if (evaluationModel && followUpResponse) {
        const followUpEval = await callEvaluation(evaluationModel, followUpResponse.content, [brand], domain)
        followUpMetrics = followUpEval.metrics
        totalInputTokens += followUpEval.inputTokens
        totalOutputTokens += followUpEval.outputTokens
        totalCostCents += calculateDynamicCostFromPricing(
          pricingMap.get(evaluationModel),
          followUpEval.inputTokens,
          followUpEval.outputTokens
        )
        logTest('Follow-up evaluation', 'passed', `Visibility: ${followUpEval.metrics?.visibility_score ?? 'n/a'}`)
      } else {
        logTest('Follow-up evaluation', 'skipped', 'No evaluation model configured')
      }
    } catch (err: any) {
      logTest('Follow-up evaluation', 'skipped', err.message)
    }

    const { data: followUpResultRow, error: followUpSaveError } = await supabase
      .from('scan_results')
      .insert({
        scan_id: scan.id,
        provider: user.provider,
        model: user.model,
        query_text: queryText,
        ai_response_raw: followUpResponse.content,
        metrics_json: followUpMetrics,
        input_tokens: followUpResponse.inputTokens,
        output_tokens: followUpResponse.outputTokens,
        cost_usd: calculateCost(user.model, followUpResponse.inputTokens, followUpResponse.outputTokens),
        follow_up_level: 1,
        parent_result_id: result.id,
        follow_up_query_used: followUpQuestion,
      })
      .select()
      .single()

    if (followUpSaveError || !followUpResultRow) {
      logTest('Save follow-up result', 'failed', followUpSaveError?.message || 'Failed to save follow-up')
      return
    }
    logTest('Save follow-up result', 'passed', `Follow-up saved: ${followUpResultRow.id}`)
  }

  // Verify response saved fully
  const { data: savedResult } = await supabase
    .from('scan_results')
    .select('ai_response_raw')
    .eq('id', result.id)
    .single()

  const savedResponse = savedResult?.ai_response_raw || ''
  if (savedResponse === llmResponse.content) {
    logTest('Full response stored', 'passed', `Stored ${savedResponse.length} chars`)
  } else {
    logTest(
      'Full response stored',
      'failed',
      `Mismatch: in-memory ${llmResponse.content.length}, stored ${savedResponse.length}`
    )
  }

  // Update scan totals and status
  const totalCost = llmCostUsd + (evaluationInfo?.baseCostUsd || 0)
  const { error: updateError } = await supabase
    .from('scans')
    .update({
      status: 'completed',
      total_cost_usd: totalCost,
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      total_results: followUpDepth > 0 ? 2 : 1,
    })
    .eq('id', scan.id)

  if (updateError) {
    logTest('Finalize scan', 'failed', updateError.message)
  } else {
    logTest('Finalize scan', 'passed', 'Scan completed')
  }

  // Consume reservation and update credits
  const actualCostCents = totalCostCents
  const refundCents = Math.max(0, reservationAmount - actualCostCents)
  const finalBalance = reservationBalanceAfter + refundCents

  await supabase
    .from('credit_reservations')
    .update({ status: 'consumed', resolved_at: new Date().toISOString() })
    .eq('id', reservation?.id)

  await supabase
    .from('user_profiles')
    .update({ credit_balance_cents: finalBalance })
    .eq('user_id', user.userId)

  await supabase
    .from('credit_transactions')
    .insert({
      user_id: user.userId,
      type: 'usage',
      amount_cents: -actualCostCents,
      balance_after_cents: finalBalance,
      description: 'Test scan usage (follow-up)',
      reference_type: 'scan',
      reference_id: scan.id,
    })

  logTest(
    'Credit deduction',
    'passed',
    `Charged ${actualCostCents} cents, refunded ${refundCents} cents`
  )

  // Restore original tier/balance
  await supabase
    .from('user_profiles')
    .update({ tier: originalTier || 'free', credit_balance_cents: originalBalance })
    .eq('user_id', user.userId)

  await supabase
    .from('credit_transactions')
    .delete()
    .eq('reference_id', scan.id)

  // Cleanup
  await supabase.from('scan_results').delete().eq('scan_id', scan.id)
  await supabase.from('scans').delete().eq('id', scan.id)
  await supabase.from('project_queries').delete().eq('project_id', project.id)
  await supabase.from('projects').delete().eq('id', project.id)

  console.log('\n' + '═'.repeat(70))
  const passed = results.filter(r => r.status === 'passed').length
  const failed = results.filter(r => r.status === 'failed').length
  const skipped = results.filter(r => r.status === 'skipped').length
  console.log(`  ✅ Passed: ${passed}`)
  console.log(`  ❌ Failed: ${failed}`)
  console.log(`  ⚠️ Skipped: ${skipped}`)
  console.log(`  📝 Total:  ${results.length}`)
  console.log('═'.repeat(70))
}

runScanTest().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
