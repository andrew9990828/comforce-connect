// Turns a model-supplied time into UTC. Claude (Opus 5.5) wrote this after review found offset-less times read as UTC,
// then nonexistent dates and spring-forward times silently shifted. Invalid times are rejected so staff can choose a real one.
// ComForce works in Milwaukee, so a time without an offset means Chicago wall-clock time, including across daylight saving.
const pattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:(Z)|([+-])(\d{2}):?(\d{2}))?$/
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
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(value => Number(value || 0))
  const wall = Date.UTC(year, month - 1, day, hour, minute, second)
  // Date.UTC rolls February 30 over to March 2, so check the calendar fields survive unchanged.
  const check = new Date(wall)
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day
    || hour > 23 || minute > 59 || second > 59) throw new Error(`${raw.trim()} is not a real date and time. Choose a valid one.`)

  if (match[7]) return check.toISOString()
  if (match[8]) {
    const offsetHours = Number(match[9]), offsetMinutes = Number(match[10])
    if (offsetHours > 14 || offsetMinutes > 59) throw new Error(`${raw.trim()} has an invalid offset.`)
    const sign = match[8] === '+' ? 1 : -1
    return new Date(wall - sign * (offsetHours * 60 + offsetMinutes) * 60_000).toISOString()
  }

  // Guess with the offset at the wall time, then correct once with the offset at the guess (handles daylight-saving edges).
  let utc = wall - (chicagoWall(wall) - wall)
  utc = wall - (chicagoWall(utc) - utc)
  // On the spring-forward night, times like 2:30 AM never happen in Chicago. Converting them would silently move the appointment.
  if (chicagoWall(utc) !== wall) throw new Error(`${raw.trim()} doesn't exist in Chicago because the clocks spring forward that night. Choose another time.`)
  return new Date(utc).toISOString()
}
