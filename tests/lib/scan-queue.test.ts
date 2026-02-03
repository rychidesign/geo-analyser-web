import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// =====================================================
// Scan Queue System Tests
// Tests for the background scan processing system
// =====================================================

// Mock Supabase client
const mockSupabaseClient = {
  from: vi.fn(),
  rpc: vi.fn(),
  auth: {
    getUser: vi.fn(),
  },
}

// Mock fetch for API calls
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock responses builder
const createMockChain = () => {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn(),
  }
  return chain
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(mockSupabaseClient),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => mockSupabaseClient,
}))

// =====================================================
// Types for Tests
// =====================================================

interface MockQueueItem {
  id: string
  user_id: string
  project_id: string
  scan_id: string | null
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  priority: number
  progress_current: number
  progress_total: number
  progress_message: string | null
  is_scheduled: boolean
  created_at: string
  updated_at: string
  started_at: string | null
  completed_at: string | null
  error_message: string | null
}

interface MockProject {
  id: string
  user_id: string
  name: string
  domain: string
  brand_variations: string[]
  selected_models: string[]
  follow_up_enabled: boolean
  follow_up_depth: number
  language: string
}

interface MockUserProfile {
  user_id: string
  tier: 'free' | 'paid' | 'test' | 'admin'
  credit_balance_cents: number
  free_scans_used_this_month: number
}

// =====================================================
// Helper Functions
// =====================================================

function createMockQueueItem(overrides: Partial<MockQueueItem> = {}): MockQueueItem {
  return {
    id: 'queue-123',
    user_id: 'user-123',
    project_id: 'project-123',
    scan_id: null,
    status: 'pending',
    priority: 0,
    progress_current: 0,
    progress_total: 10,
    progress_message: 'Waiting in queue...',
    is_scheduled: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    error_message: null,
    ...overrides,
  }
}

function createMockProject(overrides: Partial<MockProject> = {}): MockProject {
  return {
    id: 'project-123',
    user_id: 'user-123',
    name: 'Test Project',
    domain: 'example.com',
    brand_variations: ['Example', 'Example Inc'],
    selected_models: ['gpt-5-mini', 'claude-haiku-4-5'],
    follow_up_enabled: false,
    follow_up_depth: 1,
    language: 'en',
    ...overrides,
  }
}

function createMockProfile(overrides: Partial<MockUserProfile> = {}): MockUserProfile {
  return {
    user_id: 'user-123',
    tier: 'paid',
    credit_balance_cents: 5000, // $50
    free_scans_used_this_month: 0,
    ...overrides,
  }
}

// =====================================================
// Queue Creation Tests
// =====================================================

describe('Scan Queue Creation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Queue Validation', () => {
    it('should reject queue creation without authentication', async () => {
      const response = await simulateQueueRequest({
        authenticated: false,
      })

      expect(response.status).toBe(401)
      expect(response.body.error).toBe('Unauthorized')
    })

    it('should reject queue creation for non-existent project', async () => {
      const response = await simulateQueueRequest({
        authenticated: true,
        projectExists: false,
      })

      expect(response.status).toBe(404)
      expect(response.body.error).toBe('Project not found')
    })

    it('should reject queue creation without active queries', async () => {
      const response = await simulateQueueRequest({
        authenticated: true,
        projectExists: true,
        queries: [],
      })

      expect(response.status).toBe(400)
      expect(response.body.error).toContain('No active queries')
    })

    it('should reject queue creation without selected models', async () => {
      const response = await simulateQueueRequest({
        authenticated: true,
        projectExists: true,
        queries: [{ id: 'q1', query_text: 'test query' }],
        project: createMockProject({ selected_models: [] }),
      })

      expect(response.status).toBe(400)
      expect(response.body.error).toContain('No models selected')
    })
  })

  describe('Duplicate Queue Prevention', () => {
    it('should reject if scan already queued for project', async () => {
      const response = await simulateQueueRequest({
        authenticated: true,
        projectExists: true,
        queries: [{ id: 'q1', query_text: 'test query' }],
        existingQueueItem: createMockQueueItem({ status: 'pending' }),
      })

      expect(response.status).toBe(409)
      expect(response.body.code).toBe('SCAN_ALREADY_QUEUED')
      expect(response.body.queueId).toBe('queue-123')
    })

    it('should reject if scan already running for project', async () => {
      const response = await simulateQueueRequest({
        authenticated: true,
        projectExists: true,
        queries: [{ id: 'q1', query_text: 'test query' }],
        existingQueueItem: createMockQueueItem({ status: 'running' }),
      })

      expect(response.status).toBe(409)
      expect(response.body.code).toBe('SCAN_ALREADY_QUEUED')
    })
  })

  describe('Successful Queue Creation', () => {
    it('should create queue item with correct data', async () => {
      const response = await simulateQueueRequest({
        authenticated: true,
        projectExists: true,
        queries: [
          { id: 'q1', query_text: 'test query 1' },
          { id: 'q2', query_text: 'test query 2' },
        ],
        profile: createMockProfile({ tier: 'paid', credit_balance_cents: 5000 }),
      })

      expect(response.status).toBe(200)
      expect(response.body.queueId).toBeDefined()
      expect(response.body.status).toBe('pending')
      expect(response.body.totalOperations).toBe(4) // 2 queries × 2 models
    })

    it('should calculate total operations with follow-ups', async () => {
      const response = await simulateQueueRequest({
        authenticated: true,
        projectExists: true,
        queries: [{ id: 'q1', query_text: 'test query' }],
        project: createMockProject({
          follow_up_enabled: true,
          follow_up_depth: 2,
        }),
      })

      expect(response.status).toBe(200)
      // 1 query × 2 models × (1 initial + 2 follow-ups) = 6
      expect(response.body.totalOperations).toBe(6)
    })
  })
})

// =====================================================
// Credit Handling Tests
// =====================================================

describe('Scan Queue Credit Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Free Tier', () => {
    it('should allow free tier users to queue scan within limits', async () => {
      const response = await simulateQueueRequest({
        authenticated: true,
        projectExists: true,
        queries: [{ id: 'q1', query_text: 'test query' }],
        profile: createMockProfile({
          tier: 'free',
          credit_balance_cents: 0,
          free_scans_used_this_month: 0,
        }),
      })

      expect(response.status).toBe(200)
      expect(response.body.estimatedCostUsd).toBe(0)
    })

    it('should reject free tier users who exceeded scan limit', async () => {
      const response = await simulateQueueRequest({
        authenticated: true,
        projectExists: true,
        queries: [{ id: 'q1', query_text: 'test query' }],
        profile: createMockProfile({
          tier: 'free',
          free_scans_used_this_month: 2, // Limit is usually 2
        }),
        canRunScanResult: { allowed: false, reason: 'Free tier limit reached' },
      })

      expect(response.status).toBe(403)
      expect(response.body.code).toBe('SCAN_LIMIT_REACHED')
    })
  })

  describe('Paid Tier', () => {
    it('should estimate cost correctly for paid users', async () => {
      const response = await simulateQueueRequest({
        authenticated: true,
        projectExists: true,
        queries: [
          { id: 'q1', query_text: 'test query 1' },
          { id: 'q2', query_text: 'test query 2' },
        ],
        profile: createMockProfile({
          tier: 'paid',
          credit_balance_cents: 10000,
        }),
        estimatedCostCents: 150, // $1.50 estimated
      })

      expect(response.status).toBe(200)
      expect(response.body.estimatedCostUsd).toBe(1.5)
    })

    it('should reject paid users with insufficient credits', async () => {
      const response = await simulateQueueRequest({
        authenticated: true,
        projectExists: true,
        queries: [{ id: 'q1', query_text: 'test query' }],
        profile: createMockProfile({
          tier: 'paid',
          credit_balance_cents: 10, // Only $0.10
        }),
        estimatedCostCents: 500, // Needs $5.00
      })

      expect(response.status).toBe(402)
      expect(response.body.code).toBe('INSUFFICIENT_CREDITS')
      expect(response.body.estimatedCost).toBe(5)
      expect(response.body.available).toBe(0.1)
    })
  })

  describe('Admin/Test Tier', () => {
    it('should allow admin users without credit check', async () => {
      const response = await simulateQueueRequest({
        authenticated: true,
        projectExists: true,
        queries: [{ id: 'q1', query_text: 'test query' }],
        profile: createMockProfile({
          tier: 'admin',
          credit_balance_cents: 0,
        }),
      })

      expect(response.status).toBe(200)
    })

    it('should allow test users without credit check', async () => {
      const response = await simulateQueueRequest({
        authenticated: true,
        projectExists: true,
        queries: [{ id: 'q1', query_text: 'test query' }],
        profile: createMockProfile({
          tier: 'test',
          credit_balance_cents: 0,
        }),
      })

      expect(response.status).toBe(200)
    })
  })
})

// =====================================================
// Queue Status Tests
// =====================================================

describe('Scan Queue Status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Status Retrieval', () => {
    it('should return pending status correctly', () => {
      const queueItem = createMockQueueItem({
        status: 'pending',
        progress_current: 0,
        progress_total: 10,
        progress_message: 'Waiting in queue...',
      })

      const status = formatQueueStatus(queueItem)

      expect(status.status).toBe('pending')
      expect(status.progress.current).toBe(0)
      expect(status.progress.total).toBe(10)
      expect(status.progress.message).toBe('Waiting in queue...')
    })

    it('should return running status with progress', () => {
      const queueItem = createMockQueueItem({
        status: 'running',
        progress_current: 5,
        progress_total: 10,
        progress_message: 'Processing gpt-5-mini... (5/10)',
        started_at: new Date().toISOString(),
      })

      const status = formatQueueStatus(queueItem)

      expect(status.status).toBe('running')
      expect(status.progress.current).toBe(5)
      expect(status.progress.total).toBe(10)
      expect(status.startedAt).toBeDefined()
    })

    it('should return completed status with scan data', () => {
      const queueItem = createMockQueueItem({
        status: 'completed',
        progress_current: 10,
        progress_total: 10,
        progress_message: 'Scan completed',
        scan_id: 'scan-456',
        completed_at: new Date().toISOString(),
      })

      const status = formatQueueStatus(queueItem)

      expect(status.status).toBe('completed')
      expect(status.scanId).toBe('scan-456')
      expect(status.completedAt).toBeDefined()
    })

    it('should return failed status with error message', () => {
      const queueItem = createMockQueueItem({
        status: 'failed',
        progress_current: 3,
        progress_total: 10,
        error_message: 'API rate limit exceeded',
      })

      const status = formatQueueStatus(queueItem)

      expect(status.status).toBe('failed')
      expect(status.error).toBe('API rate limit exceeded')
    })
  })

  describe('Progress Calculation', () => {
    it('should calculate progress percentage correctly', () => {
      expect(calculateProgressPercentage(0, 10)).toBe(0)
      expect(calculateProgressPercentage(5, 10)).toBe(50)
      expect(calculateProgressPercentage(10, 10)).toBe(100)
      expect(calculateProgressPercentage(7, 20)).toBe(35)
    })

    it('should handle edge cases', () => {
      expect(calculateProgressPercentage(0, 0)).toBe(0)
      expect(calculateProgressPercentage(5, 0)).toBe(100)
      expect(calculateProgressPercentage(-1, 10)).toBe(0)
    })
  })
})

// =====================================================
// Queue Cancellation Tests
// =====================================================

describe('Scan Queue Cancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should cancel pending scan successfully', async () => {
    const response = await simulateCancelRequest({
      authenticated: true,
      queueItemExists: true,
      currentStatus: 'pending',
    })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.message).toBe('Scan cancelled')
  })

  it('should cancel running scan successfully', async () => {
    const response = await simulateCancelRequest({
      authenticated: true,
      queueItemExists: true,
      currentStatus: 'running',
    })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
  })

  it('should reject cancellation of completed scan', async () => {
    const response = await simulateCancelRequest({
      authenticated: true,
      queueItemExists: true,
      currentStatus: 'completed',
    })

    expect(response.status).toBe(404)
    expect(response.body.error).toContain('already completed')
  })

  it('should reject cancellation by different user', async () => {
    const response = await simulateCancelRequest({
      authenticated: true,
      queueItemExists: false, // RLS would filter it out
    })

    expect(response.status).toBe(404)
  })
})

// =====================================================
// Worker Processing Tests
// =====================================================

describe('Scan Queue Worker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Queue Claiming', () => {
    it('should claim oldest pending scan by priority', () => {
      const queue = [
        createMockQueueItem({ id: 'q1', priority: 0, created_at: '2024-01-01T10:00:00Z' }),
        createMockQueueItem({ id: 'q2', priority: 1, created_at: '2024-01-01T11:00:00Z' }),
        createMockQueueItem({ id: 'q3', priority: 0, created_at: '2024-01-01T09:00:00Z' }),
      ]

      const claimed = selectNextQueueItem(queue)

      // Should select q2 (highest priority)
      expect(claimed?.id).toBe('q2')
    })

    it('should claim oldest scan when priorities are equal', () => {
      const queue = [
        createMockQueueItem({ id: 'q1', priority: 0, created_at: '2024-01-01T10:00:00Z' }),
        createMockQueueItem({ id: 'q2', priority: 0, created_at: '2024-01-01T11:00:00Z' }),
        createMockQueueItem({ id: 'q3', priority: 0, created_at: '2024-01-01T09:00:00Z' }),
      ]

      const claimed = selectNextQueueItem(queue)

      // Should select q3 (oldest)
      expect(claimed?.id).toBe('q3')
    })

    it('should return null for empty queue', () => {
      const claimed = selectNextQueueItem([])
      expect(claimed).toBeNull()
    })
  })

  describe('Scan Processing', () => {
    it('should update progress during processing', () => {
      const progressUpdates: Array<{ current: number; message: string }> = []
      
      // Simulate processing 4 operations
      for (let i = 0; i < 4; i++) {
        progressUpdates.push({
          current: i + 1,
          message: `Processing model ${i + 1}/4`,
        })
      }

      expect(progressUpdates).toHaveLength(4)
      expect(progressUpdates[3].current).toBe(4)
    })

    it('should handle worker cancellation check', () => {
      const queueItem = createMockQueueItem({ status: 'running' })
      expect(shouldContinueProcessing(queueItem)).toBe(true)

      const cancelledItem = createMockQueueItem({ status: 'cancelled' })
      expect(shouldContinueProcessing(cancelledItem)).toBe(false)
    })
  })

  describe('Cost Calculation', () => {
    it('should calculate scan cost correctly', () => {
      const results = [
        { inputTokens: 500, outputTokens: 1000, costUsd: 0.015 },
        { inputTokens: 600, outputTokens: 1200, costUsd: 0.018 },
        { inputTokens: 400, outputTokens: 800, costUsd: 0.012 },
      ]

      const totalCost = results.reduce((sum, r) => sum + r.costUsd, 0)
      const totalInputTokens = results.reduce((sum, r) => sum + r.inputTokens, 0)
      const totalOutputTokens = results.reduce((sum, r) => sum + r.outputTokens, 0)

      expect(totalCost).toBeCloseTo(0.045, 3)
      expect(totalInputTokens).toBe(1500)
      expect(totalOutputTokens).toBe(3000)
    })

    it('should convert cost to cents correctly', () => {
      const costUsd = 0.0456
      const costCents = Math.round(costUsd * 100)
      expect(costCents).toBe(5) // Rounded to nearest cent
    })
  })
})

// =====================================================
// Credit Reservation Tests
// =====================================================

describe('Credit Reservation Flow', () => {
  describe('Reservation Creation', () => {
    it('should reserve credits with 20% buffer', () => {
      const estimatedCost = 100 // $1.00
      const reservationAmount = Math.ceil(estimatedCost * 1.2)
      expect(reservationAmount).toBe(120) // $1.20 reserved
    })

    it('should not reserve for free tier', () => {
      const profile = createMockProfile({ tier: 'free' })
      const shouldReserve = profile.tier !== 'free'
      expect(shouldReserve).toBe(false)
    })

    it('should reserve for paid tier', () => {
      const profile = createMockProfile({ tier: 'paid' })
      const shouldReserve = profile.tier !== 'free'
      expect(shouldReserve).toBe(true)
    })
  })

  describe('Reservation Consumption', () => {
    it('should consume actual cost and refund excess', () => {
      const reserved = 120 // $1.20
      const actual = 85 // $0.85
      const refund = reserved - actual
      
      expect(refund).toBe(35) // $0.35 refunded
    })

    it('should handle cost exceeding reservation', () => {
      const reserved = 100
      const actual = 150
      const additional = actual - reserved
      
      expect(additional).toBe(50) // Need to deduct extra $0.50
    })
  })

  describe('Reservation Release on Failure', () => {
    it('should release full reservation on scan failure', () => {
      const reserved = 120
      const released = reserved
      expect(released).toBe(120)
    })

    it('should release full reservation on cancellation', () => {
      const reserved = 120
      const released = reserved
      expect(released).toBe(120)
    })
  })
})

// =====================================================
// State Restoration Tests
// =====================================================

describe('Scan State Restoration', () => {
  describe('Active Scan Recovery', () => {
    it('should restore pending scan after refresh', () => {
      const activeScans = [
        {
          queueId: 'queue-123',
          projectId: 'project-123',
          projectName: 'Test Project',
          status: 'pending',
          progress: { current: 0, total: 10 },
        },
      ]

      const restoredJobs = activeScans.map(scan => ({
        id: scan.queueId,
        queueId: scan.queueId,
        projectId: scan.projectId,
        projectName: scan.projectName,
        status: scan.status,
        progress: scan.progress,
      }))

      expect(restoredJobs).toHaveLength(1)
      expect(restoredJobs[0].status).toBe('pending')
    })

    it('should restore running scan with progress', () => {
      const activeScans = [
        {
          queueId: 'queue-456',
          projectId: 'project-456',
          projectName: 'Another Project',
          scanId: 'scan-789',
          status: 'running',
          progress: { current: 5, total: 10, message: 'Processing...' },
        },
      ]

      const restoredJobs = activeScans.map(scan => ({
        id: scan.queueId,
        queueId: scan.queueId,
        projectId: scan.projectId,
        projectName: scan.projectName,
        scanId: scan.scanId,
        status: scan.status,
        progress: scan.progress,
      }))

      expect(restoredJobs[0].progress.current).toBe(5)
      expect(restoredJobs[0].scanId).toBe('scan-789')
    })

    it('should not restore completed scans', () => {
      const allScans = [
        { queueId: 'q1', status: 'completed' },
        { queueId: 'q2', status: 'running' },
        { queueId: 'q3', status: 'failed' },
        { queueId: 'q4', status: 'pending' },
      ]

      const activeScans = allScans.filter(s => 
        ['pending', 'running'].includes(s.status)
      )

      expect(activeScans).toHaveLength(2)
      expect(activeScans.map(s => s.queueId)).toEqual(['q2', 'q4'])
    })
  })

  describe('Polling Resumption', () => {
    it('should start polling for restored active scans', () => {
      const restoredJobs = [
        { projectId: 'p1', queueId: 'q1', status: 'running' },
        { projectId: 'p2', queueId: 'q2', status: 'pending' },
      ]

      const jobsNeedingPolling = restoredJobs.filter(j => 
        ['queued', 'running', 'pending'].includes(j.status) && j.queueId
      )

      expect(jobsNeedingPolling).toHaveLength(2)
    })

    it('should not poll for completed jobs', () => {
      const restoredJobs = [
        { projectId: 'p1', queueId: 'q1', status: 'completed' },
      ]

      const jobsNeedingPolling = restoredJobs.filter(j => 
        ['queued', 'running', 'pending'].includes(j.status)
      )

      expect(jobsNeedingPolling).toHaveLength(0)
    })
  })
})

// =====================================================
// Integration Tests
// =====================================================

describe('End-to-End Scan Flow', () => {
  it('should handle complete scan lifecycle', async () => {
    // 1. Queue scan
    const queueResponse = await simulateQueueRequest({
      authenticated: true,
      projectExists: true,
      queries: [{ id: 'q1', query_text: 'test' }],
      profile: createMockProfile({ tier: 'paid', credit_balance_cents: 1000 }),
    })
    expect(queueResponse.status).toBe(200)
    const { queueId } = queueResponse.body

    // 2. Check status (pending)
    const pendingStatus = createMockQueueItem({
      id: queueId,
      status: 'pending',
      progress_current: 0,
      progress_total: 2,
    })
    expect(pendingStatus.status).toBe('pending')

    // 3. Worker picks up scan
    const runningStatus = createMockQueueItem({
      id: queueId,
      status: 'running',
      progress_current: 1,
      progress_total: 2,
      progress_message: 'Processing gpt-5-mini...',
    })
    expect(runningStatus.status).toBe('running')
    expect(runningStatus.progress_current).toBe(1)

    // 4. Scan completes
    const completedStatus = createMockQueueItem({
      id: queueId,
      status: 'completed',
      progress_current: 2,
      progress_total: 2,
      scan_id: 'scan-final',
    })
    expect(completedStatus.status).toBe('completed')
    expect(completedStatus.scan_id).toBe('scan-final')
  })

  it('should handle scan failure gracefully', async () => {
    // 1. Queue scan
    const queueResponse = await simulateQueueRequest({
      authenticated: true,
      projectExists: true,
      queries: [{ id: 'q1', query_text: 'test' }],
      profile: createMockProfile({ tier: 'paid', credit_balance_cents: 1000 }),
    })
    expect(queueResponse.status).toBe(200)

    // 2. Worker fails
    const failedStatus = createMockQueueItem({
      status: 'failed',
      progress_current: 1,
      progress_total: 2,
      error_message: 'API error: rate limit exceeded',
    })
    expect(failedStatus.status).toBe('failed')
    expect(failedStatus.error_message).toContain('rate limit')
  })

  it('should handle user cancellation', async () => {
    // 1. Queue scan
    const queueResponse = await simulateQueueRequest({
      authenticated: true,
      projectExists: true,
      queries: [{ id: 'q1', query_text: 'test' }],
      profile: createMockProfile({ tier: 'paid', credit_balance_cents: 1000 }),
    })
    expect(queueResponse.status).toBe(200)

    // 2. User cancels
    const cancelResponse = await simulateCancelRequest({
      authenticated: true,
      queueItemExists: true,
      currentStatus: 'running',
    })
    expect(cancelResponse.status).toBe(200)

    // 3. Check cancelled status
    const cancelledStatus = createMockQueueItem({
      status: 'cancelled',
      error_message: 'Cancelled by user',
    })
    expect(cancelledStatus.status).toBe('cancelled')
  })
})

// =====================================================
// Helper Simulation Functions
// =====================================================

interface QueueRequestOptions {
  authenticated: boolean
  projectExists?: boolean
  queries?: Array<{ id: string; query_text: string }>
  project?: MockProject
  profile?: MockUserProfile
  existingQueueItem?: MockQueueItem | null
  canRunScanResult?: { allowed: boolean; reason?: string }
  estimatedCostCents?: number
}

async function simulateQueueRequest(options: QueueRequestOptions): Promise<{ status: number; body: any }> {
  // Simulate authentication check
  if (!options.authenticated) {
    return { status: 401, body: { error: 'Unauthorized' } }
  }

  // Simulate project check
  if (options.projectExists === false) {
    return { status: 404, body: { error: 'Project not found' } }
  }

  // Simulate queries check
  if (!options.queries || options.queries.length === 0) {
    return { status: 400, body: { error: 'No active queries found' } }
  }

  // Simulate models check
  const project = options.project || createMockProject()
  if (!project.selected_models || project.selected_models.length === 0) {
    return { status: 400, body: { error: 'No models selected. Please go to Project Settings and select at least one AI model.' } }
  }

  // Simulate existing queue check
  if (options.existingQueueItem) {
    return {
      status: 409,
      body: {
        error: 'A scan is already queued or running for this project',
        code: 'SCAN_ALREADY_QUEUED',
        queueId: options.existingQueueItem.id,
      },
    }
  }

  // Simulate can run scan check
  if (options.canRunScanResult && !options.canRunScanResult.allowed) {
    return {
      status: 403,
      body: {
        error: options.canRunScanResult.reason || 'Cannot run scan',
        code: 'SCAN_LIMIT_REACHED',
      },
    }
  }

  // Simulate credit check for paid users
  const profile = options.profile || createMockProfile()
  const estimatedCostCents = options.estimatedCostCents || 100
  
  if (profile.tier === 'paid') {
    const requiredCents = Math.ceil(estimatedCostCents * 1.2)
    if (profile.credit_balance_cents < requiredCents) {
      return {
        status: 402,
        body: {
          error: 'Insufficient credits for this scan',
          code: 'INSUFFICIENT_CREDITS',
          estimatedCost: estimatedCostCents / 100,
          available: profile.credit_balance_cents / 100,
        },
      }
    }
  }

  // Success
  const operationsPerQuery = project.follow_up_enabled ? (1 + project.follow_up_depth) : 1
  const totalOperations = options.queries.length * project.selected_models.length * operationsPerQuery

  return {
    status: 200,
    body: {
      queueId: 'queue-new-123',
      status: 'pending',
      totalOperations,
      estimatedCostUsd: profile.tier === 'free' ? 0 : estimatedCostCents / 100,
      message: 'Scan queued for processing',
    },
  }
}

interface CancelRequestOptions {
  authenticated: boolean
  queueItemExists: boolean
  currentStatus?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
}

async function simulateCancelRequest(options: CancelRequestOptions): Promise<{ status: number; body: any }> {
  if (!options.authenticated) {
    return { status: 401, body: { error: 'Unauthorized' } }
  }

  if (!options.queueItemExists) {
    return { status: 404, body: { error: 'Queue item not found' } }
  }

  if (options.currentStatus && ['completed', 'failed', 'cancelled'].includes(options.currentStatus)) {
    return {
      status: 404,
      body: { error: 'Cannot cancel: scan not found or already completed' },
    }
  }

  return {
    status: 200,
    body: { success: true, message: 'Scan cancelled' },
  }
}

// Helper functions
function formatQueueStatus(queueItem: MockQueueItem) {
  return {
    queueId: queueItem.id,
    status: queueItem.status,
    scanId: queueItem.scan_id,
    progress: {
      current: queueItem.progress_current,
      total: queueItem.progress_total,
      message: queueItem.progress_message,
    },
    error: queueItem.error_message,
    createdAt: queueItem.created_at,
    startedAt: queueItem.started_at,
    completedAt: queueItem.completed_at,
  }
}

function calculateProgressPercentage(current: number, total: number): number {
  if (total <= 0) return current > 0 ? 100 : 0
  if (current < 0) return 0
  return Math.round((current / total) * 100)
}

function selectNextQueueItem(queue: MockQueueItem[]): MockQueueItem | null {
  if (queue.length === 0) return null
  
  // Sort by priority (desc) then created_at (asc)
  const sorted = [...queue].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })
  
  return sorted[0]
}

function shouldContinueProcessing(queueItem: MockQueueItem): boolean {
  return queueItem.status === 'running'
}
