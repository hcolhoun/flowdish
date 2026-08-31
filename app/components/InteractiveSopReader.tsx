'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Mic, Pause, Play, RotateCcw, Square, Volume2 } from 'lucide-react'
import type { VoiceRecognition } from '@/lib/web-speech'

type ReaderStatus = 'idle' | 'speaking' | 'paused'

type InteractiveSopReaderProps = {
  title: string
  instructions: string
}

function splitInstructions(instructions: string) {
  return instructions
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((step) => step.replace(/^[-*\d.)\s]+/, '').trim())
    .filter(Boolean)
}

function normaliseCommand(transcript: string) {
  return transcript
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export default function InteractiveSopReader({
  title,
  instructions,
}: InteractiveSopReaderProps) {
  const steps = useMemo(() => splitInstructions(instructions), [instructions])
  const stepsRef = useRef(steps)
  const statusRef = useRef<ReaderStatus>('idle')
  const stepIndexRef = useRef(0)
  const recognitionRef = useRef<VoiceRecognition | null>(null)
  const commandListenerActiveRef = useRef(false)
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [status, setStatus] = useState<ReaderStatus>('idle')
  const [stepIndex, setStepIndex] = useState(0)
  const [speechSupported, setSpeechSupported] = useState(true)
  const [commandsSupported, setCommandsSupported] = useState(true)
  const [commandsListening, setCommandsListening] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    stepsRef.current = steps
  }, [steps])

  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    stepIndexRef.current = stepIndex
  }, [stepIndex])

  useEffect(() => {
    setSpeechSupported('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window)
    setCommandsSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition))

    return () => {
      commandListenerActiveRef.current = false
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current)
      recognitionRef.current?.abort()
      window.speechSynthesis?.cancel()
    }
  }, [])

  function setReaderStatus(nextStatus: ReaderStatus) {
    statusRef.current = nextStatus
    setStatus(nextStatus)
  }

  function stopCommandListener() {
    commandListenerActiveRef.current = false
    setCommandsListening(false)
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current)
    restartTimerRef.current = null
    recognitionRef.current?.abort()
    recognitionRef.current = null
  }

  function pauseReading() {
    if (statusRef.current !== 'speaking') return
    // Some Safari speech voices cannot resume a paused utterance reliably.
    // Cancelling lets Continue restart the current instruction consistently.
    window.speechSynthesis.cancel()
    setReaderStatus('paused')
  }

  function continueReading() {
    if (statusRef.current !== 'paused') return
    speakStep(stepIndexRef.current)
  }

  function handleVoiceCommand(transcript: string) {
    const command = normaliseCommand(transcript)

    if (command === 'pause' || command === 'pause reading') {
      pauseReading()
    } else if (
      command === 'continue' ||
      command === 'continue reading' ||
      command === 'resume' ||
      command === 'resume reading'
    ) {
      continueReading()
    }
  }

  function startCommandListener() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Recognition || commandListenerActiveRef.current) return

    commandListenerActiveRef.current = true

    const listen = () => {
      if (!commandListenerActiveRef.current || statusRef.current === 'idle') return

      const recognition = new Recognition()
      recognition.continuous = true
      recognition.interimResults = false
      recognition.lang = 'en-IE'

      recognition.onresult = (event) => {
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index]
          if (result.isFinal) handleVoiceCommand(result[0]?.transcript || '')
        }
      }

      recognition.onerror = (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          commandListenerActiveRef.current = false
          setCommandsListening(false)
          setError('Microphone access is blocked. The on-screen reader controls will still work.')
        }
      }

      recognition.onend = () => {
        recognitionRef.current = null
        setCommandsListening(false)

        if (commandListenerActiveRef.current && statusRef.current !== 'idle') {
          restartTimerRef.current = setTimeout(listen, 250)
        }
      }

      recognitionRef.current = recognition

      try {
        recognition.start()
        setCommandsListening(true)
      } catch {
        recognitionRef.current = null
        restartTimerRef.current = setTimeout(listen, 500)
      }
    }

    listen()
  }

  function finishReading() {
    window.speechSynthesis.cancel()
    setReaderStatus('idle')
    setStepIndex(0)
    stepIndexRef.current = 0
    stopCommandListener()
  }

  function speakStep(index: number) {
    const currentSteps = stepsRef.current

    if (index >= currentSteps.length) {
      finishReading()
      return
    }

    stepIndexRef.current = index
    setStepIndex(index)
    setReaderStatus('speaking')

    const utterance = new SpeechSynthesisUtterance(currentSteps[index])
    utterance.lang = 'en-IE'
    utterance.rate = 0.92
    utterance.onend = () => {
      if (statusRef.current === 'speaking') speakStep(index + 1)
    }
    utterance.onerror = (event) => {
      if (event.error === 'canceled' || event.error === 'interrupted') return
      setError('The SOP reader stopped unexpectedly. Tap Read aloud to try again.')
      finishReading()
    }

    window.speechSynthesis.speak(utterance)
  }

  function startReading() {
    if (!speechSupported || steps.length === 0) return

    setError('')
    window.speechSynthesis.cancel()
    speakStep(0)
    startCommandListener()
  }

  function repeatStep() {
    window.speechSynthesis.cancel()
    speakStep(stepIndexRef.current)
  }

  const active = status !== 'idle'

  return (
    <div className="mt-4 border-y bg-slate-50 px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        {!active ? (
          <button
            type="button"
            onClick={startReading}
            disabled={!speechSupported || steps.length === 0}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Volume2 aria-hidden="true" className="h-5 w-5" />
            Read aloud
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={status === 'paused' ? continueReading : pauseReading}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-800"
            >
              {status === 'paused' ? (
                <Play aria-hidden="true" className="h-5 w-5 fill-current" />
              ) : (
                <Pause aria-hidden="true" className="h-5 w-5 fill-current" />
              )}
              {status === 'paused' ? 'Continue' : 'Pause'}
            </button>

            <button
              type="button"
              onClick={repeatStep}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border bg-white px-4 py-2 font-medium text-slate-800 hover:bg-slate-100"
            >
              <RotateCcw aria-hidden="true" className="h-5 w-5" />
              Repeat step
            </button>

            <button
              type="button"
              onClick={finishReading}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 font-medium text-red-700 hover:bg-red-50"
            >
              <Square aria-hidden="true" className="h-4 w-4 fill-current" />
              Stop
            </button>
          </>
        )}
      </div>

      {active ? (
        <div className="mt-3" aria-live="polite">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
            <span>
              Step {stepIndex + 1} of {steps.length}
            </span>
            {commandsSupported ? (
              <span className="inline-flex items-center gap-1.5">
                <Mic aria-hidden="true" className="h-4 w-4" />
                {commandsListening ? 'Listening for pause or continue' : 'Starting voice commands'}
              </span>
            ) : (
              <span>Voice commands unavailable; use the controls above.</span>
            )}
          </div>
          <p className="mt-2 max-w-3xl font-medium text-slate-900">{steps[stepIndex]}</p>
        </div>
      ) : null}

      {!speechSupported ? (
        <p className="mt-2 text-sm text-amber-700">
          Spoken SOPs are not supported by this browser.
        </p>
      ) : steps.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">Add instructions to enable the SOP reader.</p>
      ) : null}

      {error ? (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <span className="sr-only">Interactive reader for {title}</span>
    </div>
  )
}
