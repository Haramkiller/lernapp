import { useEffect, useRef } from 'react'

/**
 * Setzt bei jedem Schrittwechsel (nicht beim ersten Anzeigen) den Fokus auf die Überschrift im Container.
 * Sonst bleibt der Fokus am entfernten Knopf hängen, und Screenreader merken den neuen Schritt nicht.
 */
export function useStepFocus<T>(step: T) {
  const box = useRef<HTMLDivElement>(null)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const heading = box.current?.querySelector<HTMLElement>('h1')
    if (!heading) return
    heading.tabIndex = -1
    heading.focus()
  }, [step])
  return box
}
