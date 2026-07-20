import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'

interface AnimatedTextProps {
  text: string
  className?: string
  style?: React.CSSProperties
}

function Char({
  char,
  progress,
  range,
}: {
  char: string
  progress: ReturnType<typeof useScroll>['scrollYProgress']
  range: [number, number]
}) {
  const opacity = useTransform(progress, range, [0.2, 1])

  return (
    <span className="relative inline-block whitespace-pre">
      <span style={{ opacity: 0 }}>{char}</span>
      <motion.span className="absolute left-0 top-0" style={{ opacity }}>
        {char}
      </motion.span>
    </span>
  )
}

export default function AnimatedText({
  text,
  className = '',
  style,
}: AnimatedTextProps) {
  const ref = useRef<HTMLParagraphElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start 0.8', 'end 0.2'],
  })

  const words = text.split(' ')

  let charIndex = 0
  const total = text.length

  return (
    <p ref={ref} className={className} style={style}>
      {words.map((word, wi) => {
        const chars = word.split('')
        const wordEl = (
          <span key={wi} className="inline-block whitespace-nowrap">
            {chars.map((char, ci) => {
              const start = charIndex / total
              const end = (charIndex + 1) / total
              charIndex += 1
              return (
                <Char
                  key={ci}
                  char={char}
                  progress={scrollYProgress}
                  range={[start, Math.min(end, 1)]}
                />
              )
            })}
          </span>
        )
        charIndex += 1
        return (
          <span key={wi}>
            {wordEl}
            {wi < words.length - 1 ? ' ' : null}
          </span>
        )
      })}
    </p>
  )
}
