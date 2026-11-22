// Fictional visual-preview records. Codex (GPT-6) prepared sample queue and map states.
import type { TeamRequest } from '../team/queue'
import { neighborhoods } from '../impact/neighborhoods'

const services = ['food', 'transportation', 'family_support', 'shelter'] as const
export const sampleRequests: TeamRequest[] = services.map((service, i) => ({
  id: String(i), reference: 'MKE-010' + i, neighborhood: neighborhoods[i],
  description: ['Help with groceries this week.', 'A ride to an appointment.', 'Please arrange a family check-in.', 'Help finding a place to stay.'][i],
  contact_method: 'text', contact: '(414) 555-0100', source: 'web', created_at: '2026-11-16T14:00:00Z',
  second_method: i === 0 ? 'email' : null, second_contact: i === 0 ? 'resident@example.invalid' : null,
  family_support: service === 'family_support' ? { support: 'Family check-in', safe_contact: 'Text after 4 p.m.' } : null,
  needs: [{ id: 'need-' + i, service, assigned_staff_id: null, status: 'open', owner: [null, 'Jordan', 'Alex', null][i], provider: null,
    follow_up: i === 2 ? '2026-11-18T17:00:00Z' : null, fulfilled_at: null, unmet_reason: null, partner_contact: null, referrals: [], history: [] }],
}))

export const sampleImpact = Array.from({ length: 6 }, (_, index) => {
  const month = '2026-' + String(6 + index).padStart(2, '0')
  const counts = neighborhoods.map((neighborhood, i) => {
    const n = (i * 3 + index * 2) % 7
    return { month, neighborhood, requests_helped: n, needs_fulfilled: n, food_fulfilled: Math.floor(n / 2), family_followups: n % 2, referrals_made: n % 3 }
  })
  const total = { month, neighborhood: null, requests_helped: 0, needs_fulfilled: 0, food_fulfilled: 0, family_followups: 0, referrals_made: 0 }
  for (const row of counts) for (const key of ['requests_helped', 'needs_fulfilled', 'food_fulfilled', 'family_followups', 'referrals_made'] as const) total[key] += row[key]
  return [...counts, total]
}).flat()
