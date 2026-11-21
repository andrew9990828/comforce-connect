// Field guide chapter URLs and navigation. Codex (GPT-6) built shareable preview routes.
import { route } from '../preview/location'

export const chapters = [
  { id: 'people', title: 'People served', anchor: 'community-reach' },
  { id: 'atlas', title: 'Neighborhood atlas', anchor: 'neighborhoods' },
  { id: 'services', title: 'Service directory', anchor: 'services' },
  { id: 'requests', title: 'How requests work', anchor: 'request-guide' },
  { id: 'families', title: 'Family support', anchor: 'family-title' },
  { id: 'reports', title: 'City reports', anchor: 'city-history-title' },
] as const

export function guideRoute(path: string) {
  const [, impact, edition, id, ...rest] = path.split('/')
  if (impact !== 'impact' || !['reference', 'reader'].includes(edition) || rest.length) return
  const chapter = chapters.find(item => item.id === id)
  if (id && !chapter) return
  return route('/impact') + location.search + (chapter ? '#' + chapter.anchor : location.hash)
}

