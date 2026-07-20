import { useEffect, useRef, useState, type ReactNode } from 'react'

interface MagnetProps {
  children: ReactNode
  padding?: number
  strength?: number
  activeTransition?: string
  inactiveTransition?: string
  className?: string
}

export default function Magnet({
  children,
  padding = 150,
  strength = 3,
  activeTransition = 'transform 0.3s ease-out',
  inactiveTransition = 'transform 0.6s ease-in-out',
  className = '',
}: MagnetProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [transform, setTransform] = useState('translate3d(0px, 0px, 0px)')
  const [transition, setTransition] = useState(inactiveTransition)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const el = ref.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2

      const withinX =
        e.clientX >= rect.left - padding && e.clientX <= rect.right + padding
      const withinY =
        e.clientY >= rect.top - padding && e.clientY <= rect.bottom + padding

      if (withinX && withinY) {
        const x = (e.clientX - cx) / strength
        const y = (e.clientY - cy) / strength
        setTransform(`translate3d(${x}px, ${y}px, 0px)`)
        setTransition(activeTransition)
      } else {
        setTransform('translate3d(0px, 0px, 0px)')
        setTransition(inactiveTransition)
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [padding, strength, activeTransition, inactiveTransition])

  return (
    <div
      ref={ref}
      className={className}
      style={{ transform, transition, willChange: 'transform' }}
    >
      {children}
    </div>
  )
}
