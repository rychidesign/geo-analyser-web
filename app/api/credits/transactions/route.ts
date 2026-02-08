import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTransactionHistory } from '@/lib/credits'
import { safeErrorMessage } from '@/lib/api-error'

export const dynamic = 'force-dynamic'

/**
 * GET /api/credits/transactions - Get user's transaction history
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const offset = parseInt(url.searchParams.get('offset') || '0')

    const transactions = await getTransactionHistory(user.id, limit, offset)

    return NextResponse.json({
      transactions,
      pagination: {
        limit,
        offset,
        hasMore: transactions.length === limit,
      },
    })
  } catch (error: unknown) {
    console.error('[Transactions API] Error:', error)
    return NextResponse.json(
      { error: safeErrorMessage(error, 'Failed to fetch transactions') },
      { status: 500 }
    )
  }
}
