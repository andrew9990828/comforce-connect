import assert from 'node:assert/strict'
import test from 'node:test'
import { monthlyIncidents, neighborhoodNames, neighborhoodSummary } from '../src/safety/crimeData.ts'

test('crime animation covers ten complete months and totals match the summary', () => {
  assert.equal(monthlyIncidents.length, 10)
  assert.equal(monthlyIncidents[0].month, '2026-01')
  assert.equal(monthlyIncidents.at(-1).month, '2026-10')
  for (const month of monthlyIncidents) assert.deepEqual(Object.keys(month.counts), [...neighborhoodNames])
  for (const row of neighborhoodSummary) {
    const total = monthlyIncidents.reduce((sum, month) => sum + month.counts[row.name], 0)
    assert.equal(total, row.incidents2026, row.name)
    assert.equal(Number(((row.incidents2026 / row.incidents2025 - 1) * 100).toFixed(1)), row.change, row.name)
  }
})
