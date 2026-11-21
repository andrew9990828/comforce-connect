// Browser language preferences and formatting, implemented by OpenAI Codex (GPT-6).
import { useSyncExternalStore } from 'react'
import demoMessages from './demo.json'
import messages from './messages.json'

export const languages = { en: 'English', es: 'Español', hmn: 'Hmong (Hmoob)', de: 'Deutsch', pl: 'Polski' } as const
export type Language = keyof typeof languages
const catalogIndex: Record<Exclude<Language, 'en'>, number> = { es: 0, hmn: 1, de: 2, pl: 3 }
const storageKey = 'comforce.language'
const catalog: Record<string, string[]> = messages

function supported(value: string | null): Language | undefined {
  const code = value?.toLowerCase().split('-')[0]
  if (code === 'mww') return 'hmn'
  if (code && Object.hasOwn(languages, code)) return code as Language
}
function initialLanguage(): Language {
  try {
    const saved = supported(localStorage.getItem(storageKey))
    if (saved) return saved
  } catch { /* Keep the selector usable when storage is disabled. */ }
  return navigator.languages.map(supported).find(Boolean) ?? 'en'
}
let language = initialLanguage()
const listeners = new Set<() => void>()

function applyLanguage(next: Language) {
  language = next
  document.documentElement.lang = next
  listeners.forEach(listener => listener())
}
applyLanguage(language)
window.addEventListener('storage', event => {
  if (event.key === storageKey || event.key === null) applyLanguage(initialLanguage())
})
export function setLanguage(next: Language) {
  try { localStorage.setItem(storageKey, next) } catch { /* Use the selection for this visit. */ }
  applyLanguage(next)
}
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function useLanguage() {
  return useSyncExternalStore(subscribe, () => language)
}
export function t(key: string, values: Record<string, string | number> = {}): string {
  const translation = language === 'en' ? key : catalog[key]?.[catalogIndex[language]] ?? key
  return translation.replace(/\{(\w+)\}/g, (original, name: string) => String(values[name] ?? original))
}
const demoCatalog: Record<string, string[]> = demoMessages

export function demoText(value: string, demo: boolean) {
  if (!demo || language === 'en' || !Object.hasOwn(demoCatalog, value)) return value
  return demoCatalog[value][catalogIndex[language]] ?? value
}

const monthFormatters = new Map<string, Intl.DateTimeFormat>()
function monthFormat(locale: string, short: boolean) {
  const key = locale + (short ? '-short' : '-long')
  let formatter = monthFormatters.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      month: short ? 'short' : 'long', year: short ? undefined : 'numeric', timeZone: 'UTC',
    })
    monthFormatters.set(key, formatter)
  }
  return formatter
}
const englishMonth = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' })
export function monthLabel(month: string, short = false) {
  const date = new Date(month + '-01T12:00:00Z')
  if (language === 'hmn') {
    const name = t(englishMonth.format(date))
    return short ? month.slice(5).replace(/^0/, '') : name + ' ' + month.slice(0, 4)
  }
  return monthFormat(language, short).format(date)
}
const chicagoOptions: Intl.DateTimeFormatOptions = {
  timeZone: 'America/Chicago', year: 'numeric', month: 'short', day: 'numeric',
  hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
}
const chicagoFormats = {
  en: new Intl.DateTimeFormat('en-US', chicagoOptions),
  es: new Intl.DateTimeFormat('es-US', chicagoOptions),
  de: new Intl.DateTimeFormat('de-DE', chicagoOptions),
  pl: new Intl.DateTimeFormat('pl-PL', chicagoOptions),
  hmn: new Intl.DateTimeFormat('en-US', { ...chicagoOptions, month: 'long', hourCycle: 'h23' }),
}
export function chicagoDate(iso: string) {
  const date = new Date(iso)
  const formatter = chicagoFormats[language]
  if (language !== 'hmn') return formatter.format(date)
  const parts = formatter.formatToParts(date)
  const part = (name: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === name)?.value ?? ''
  return part('day') + ' ' + t(part('month')) + ' ' + part('year') + ' · ' + part('hour') + ':' + part('minute') + ' ' + part('timeZoneName')
}
