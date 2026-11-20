import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from './motion'

type Props = {
  frames: string[]
  fps: number
  /** Standard: true. */
  loop?: boolean
  /** Nur bei loop=false: nach dem letzten Bild (bei reduzierter Bewegung sofort). */
  onDone?: () => void
  className?: string
  /** Standard: '' (dekorativ). */
  alt?: string
}

/** Spielt Einzelbilder ab; bei reduzierter Bewegung nur das erste Bild. */
export function Sprite({ frames, fps, loop = true, onDone, className, alt = '' }: Props) {
  const reduced = useReducedMotion()
  const seq = frames.join('|')
  const [state, setState] = useState({ seq, index: 0 })
  // Neue Bildfolge: sofort bei Bild 0 beginnen (ohne ein Bild der alten Folge zu zeigen).
  const current = state.seq === seq ? state : { seq, index: 0 }
  if (current !== state) setState(current)

  const done = useRef(onDone)
  done.current = onDone

  useEffect(() => {
    for (const src of frames) new Image().src = src
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq])

  useEffect(() => {
    if (reduced || frames.length <= 1) {
      if (!loop) done.current?.()
      return
    }
    let index = 0
    const timer = setInterval(() => {
      index += 1
      if (index >= frames.length) {
        if (loop) index = 0
        else {
          clearInterval(timer)
          done.current?.()
          return
        }
      }
      setState({ seq, index })
    }, 1000 / fps)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq, fps, loop, reduced])

  const src = frames[reduced ? 0 : Math.min(current.index, frames.length - 1)]
  return <img className={className ? `sprite ${className}` : 'sprite'} src={src} alt={alt} draggable={false} />
}
