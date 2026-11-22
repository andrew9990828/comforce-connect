// Removes contact details from free text before it reaches the model. Claude (Opus 5.5) added this after review
// found emails in resident descriptions reaching OpenAI verbatim. Pattern-based, so it is a safety net, not a guarantee.
const email = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi
const phone = /(?:\+?1[\s.-]*)?(?:\(\d{3}\)|\b\d{3})[\s.-]*\d{3}[\s.-]*\d{4}\b|\b\d{3}[\s.-]\d{4}\b/g
const street = /\b\d{1,6}\s+(?:[NSEW]\.?\s+)?(?:[A-Z0-9][\w'.-]*\s+){1,4}(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Ct|Court|Pl|Place|Way|Pkwy|Parkway|Ter|Terrace|Cir|Circle|Hwy|Highway)\b\.?(?:\s*(?:Apt|Unit|#)\s*[\w-]+)?/g

export function redact(text: string): string
export function redact(text: string | null | undefined): string | null
export function redact(text: string | null | undefined) {
  if (!text) return text ?? null
  return text.replace(email, '[email removed]').replace(street, '[address removed]').replace(phone, '[phone removed]')
}
