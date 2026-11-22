// Simple line icons for the resident pages, drawn on a 24px grid.
import type { ReactNode } from 'react'

const paths = {
  food: <><path d="M5 8h14l-1.2 12H6.2z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></>,
  transportation: <><path d="M3.5 16.5V12l2-5h13l2 5v4.5z"/><path d="M3.5 12h17"/><circle cx="7.5" cy="17" r="1.8"/><circle cx="16.5" cy="17" r="1.8"/></>,
  shelter: <><path d="M3 11 12 3.5 21 11"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/></>,
  family_support: <><circle cx="10" cy="7.5" r="3"/><path d="M3.5 20c0-3.6 2.9-6.5 6.5-6.5 1 0 1.9.2 2.7.6"/><circle cx="17" cy="16" r="2.6"/><path d="m19 18 2.5 2.5"/></>,
  youth: <><circle cx="8" cy="7" r="2.6"/><circle cx="16.5" cy="9" r="2.1"/><path d="M3 20c0-3 2.2-5.5 5-5.5s5 2.5 5 5.5"/><path d="M13.5 20c0-2.4 1.3-4.2 3-4.2s3 1.8 3 4.2"/></>,
  other: <><circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/></>,
  status: <><rect x="5.5" y="4.5" width="13" height="16" rx="2"/><path d="M9.5 3.5h5v3h-5z"/><path d="m9 13.5 2 2 4-4"/></>,
  phone: <path d="M6 3.5h3.2l1.8 4.6-2.3 1.5a10.5 10.5 0 0 0 5.7 5.7l1.5-2.3 4.6 1.8V18a2.5 2.5 0 0 1-2.5 2.5A15 15 0 0 1 3.5 6 2.5 2.5 0 0 1 6 3.5z"/>,
  text: <path d="M4 5h16v11H9l-5 4z"/>,
  email: <><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/></>,
  map: <><path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></>,
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof paths

export default function Icon({ name, size = 28 }: { name: IconName; size?: number }) {
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>
}
