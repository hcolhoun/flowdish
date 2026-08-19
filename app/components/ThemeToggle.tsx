'use client'

import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.dataset.theme = theme

  try {
    localStorage.setItem('flowdish-theme', theme)
  } catch {
    // The selected theme still applies for this visit if storage is unavailable.
  }
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light')
  }, [])

  function chooseTheme(nextTheme: Theme) {
    applyTheme(nextTheme)
    setTheme(nextTheme)
  }

  return (
    <div className="fd-theme-toggle" role="group" aria-label="Display theme">
      <button
        type="button"
        className="fd-theme-option"
        aria-pressed={theme === 'light'}
        onClick={() => chooseTheme('light')}
      >
        Light
      </button>
      <button
        type="button"
        className="fd-theme-option"
        aria-pressed={theme === 'dark'}
        onClick={() => chooseTheme('dark')}
      >
        Dark
      </button>
    </div>
  )
}
