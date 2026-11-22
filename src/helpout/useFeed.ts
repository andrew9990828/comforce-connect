// React binding for the board feed. Contributor: asherjaenchen. AI assistance: Claude Opus 5.5.
import { useSyncExternalStore } from 'react'
import type { Feed } from './feed'

export function useFeed<T>(feed: Feed<T>) {
  return useSyncExternalStore(feed.subscribe, feed.get)
}
