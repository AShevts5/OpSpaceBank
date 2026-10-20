import { motion, useReducedMotion } from 'framer-motion'
import { useEffect } from 'react'

/** Где на экране входа стояла открытка со зданием — отсюда и стартуем. */
export interface PostcardRect {
  left: number
  top: number
  width: number
  height: number
  rotate: number
}

interface Props {
  /** где на картинке двери (доли ширины и высоты) — туда «летит» камера */
  doors?: [number, number]
  from?: PostcardRect | null
  onDone: () => void
}

const ASPECT = 800 / 1000 // bank.svg — 800×1000
const GROW = 0.45
const ZOOM_AT = 0.3
const ZOOM = 0.85
const REVEAL_AT = 1.0
const REVEAL = 0.4
const TOTAL = REVEAL_AT + REVEAL + 0.1

function doorsOnScreen(doors: [number, number]) {
  const w = window.innerWidth
  const h = window.innerHeight
  const imgH = Math.max(w / ASPECT, h)
  const imgW = imgH * ASPECT
  return { x: (w - imgW) * 0.5 + doors[0] * imgW, y: h - imgH + doors[1] * imgH }
}

/**
 * «Заходим в банк»: открытка разворачивается на весь экран, камера наезжает на
 * золотые двери, вспыхивает тёплый свет — и под ним проявляется операционный зал.
 * Пропускается кликом или клавишей; при prefers-reduced-motion не показывается.
 */
export default function EnterTransition({ doors = [0.5, 0.74], from, onDone }: Props) {
  const reduced = useReducedMotion()

  useEffect(() => {
    if (reduced) {
      onDone()
      return
    }
    const timer = window.setTimeout(onDone, TOTAL * 1000)
    const skip = (e: KeyboardEvent) => {
      if (['Escape', 'Enter', ' '].includes(e.key)) onDone()
    }
    window.addEventListener('keydown', skip)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', skip)
    }
  }, [onDone, reduced])

  if (reduced) return null
  const full = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight, rotate: 0 }
  const door = doorsOnScreen(doors)

  return (
    <div className="enter" onClick={onDone} role="presentation" title="Нажмите, чтобы пропустить">
      <motion.div className="enter__backdrop" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ delay: REVEAL_AT, duration: REVEAL, ease: 'easeOut' }} />
      <motion.div
        className="enter__frame"
        initial={{ ...(from ?? full), borderRadius: from ? 28 : 0, borderWidth: from ? 6 : 0, opacity: 1 }}
        animate={{ ...full, borderRadius: 0, borderWidth: 0, opacity: 0 }}
        transition={{ duration: GROW, ease: [0.3, 0, 0.2, 1], opacity: { delay: REVEAL_AT, duration: REVEAL * 0.75 } }}
      >
        <motion.img
          src="/art/bank.svg"
          alt=""
          style={{ transformOrigin: `${door.x}px ${door.y}px` }}
          initial={{ scale: 1, x: 0, y: 0, objectPosition: from ? '50% 70%' : '50% 100%' }}
          animate={{ scale: 5, x: full.width / 2 - door.x, y: full.height * 0.55 - door.y, objectPosition: '50% 100%' }}
          transition={{ delay: ZOOM_AT, duration: ZOOM, ease: [0.55, 0, 0.75, 0.3], objectPosition: { duration: GROW, ease: [0.3, 0, 0.2, 1] } }}
        />
        <motion.div className="enter__light" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: ZOOM_AT + ZOOM * 0.6, duration: 0.35 }} />
      </motion.div>
      <span className="enter__skip">Нажмите, чтобы пропустить</span>
    </div>
  )
}
