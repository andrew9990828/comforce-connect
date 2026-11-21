// Turns a model-supplied time into UTC. Claude (Opus 5.5) wrote this after review found offset-less times read as UTC.
// ComForce works in Milwaukee, so a time without an offset means Chicago wall-clock time, including across daylight saving.
const pattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/
const parts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
})

// Chicago's wall-clock reading at instant `utc`, expressed as if it were UTC.
function chicagoWall(utc: number) {
  const get = (type: string) => Number(parts.formatToParts(new Date(utc)).find(part => part.type === type)?.value)
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
}

export function chicagoTime(raw: string): string {
  const match = pattern.exec(raw.trim())
  if (!match) throw new Error('Give a date and time like 2026-11-21T09:30 in Chicago time, or include an offset.')
  if (match[7]) {
    const parsed = Date.parse(raw.trim())
    if (!Number.isFinite(parsed)) throw new Error('That time is not valid.')
    return new Date(parsed).toISOString()
  }
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(value => Number(value || 0))
  const wall = Date.UTC(year, month - 1, day, hour, minute, second)
  const check = new Date(wall)
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) throw new Error('That time is not valid.')
  // Guess with the offset at the wall time, then correct once with the offset at the guess (handles daylight-saving edges).
  let utc = wall - (chicagoWall(wall) - wall)
  utc = wall - (chicagoWall(utc) - utc)
  return new Date(utc).toISOString()
}
