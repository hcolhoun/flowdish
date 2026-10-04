export const LEGAL_VERSIONS = {
  terms: '2026-10-02',
  dpa: '2026-10-02',
  privacy: '2026-10-02',
  aiNotice: '2026-10-02',
} as const

export function planUsesAi(plan: string | null | undefined) {
  return plan === 'ENTERPRISE'
}
