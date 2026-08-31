'use client'

import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, Mic, Square } from 'lucide-react'
import type { VoiceRecognition } from '@/lib/web-speech'

type VoiceDictationButtonProps = {
  onTranscript: (transcript: string) => void | Promise<void>
  processing?: boolean
  disabled?: boolean
}

function recognitionErrorMessage(code: string) {
  if (code === 'not-allowed' || code === 'service-not-allowed') {
    return 'Microphone access was blocked. Allow microphone access for Flowdish and try again.'
  }

  if (code === 'no-speech') return 'No speech was heard. Tap the microphone and try again.'
  if (code === 'audio-capture') return 'No working microphone was found on this device.'
  if (code === 'network') return 'Voice recognition could not connect. Check the connection and try again.'

  return 'Voice recognition stopped unexpectedly. Please try again.'
}

export default function VoiceDictationButton({
  onTranscript,
  processing = false,
  disabled = false,
}: VoiceDictationButtonProps) {
  const recognitionRef = useRef<VoiceRecognition | null>(null)
  const finalTranscriptRef = useRef('')
  const interimTranscriptRef = useRef('')
  const shouldSubmitRef = useRef(false)
  const submittedRef = useRef(false)
  const [supported, setSupported] = useState(true)
  const [listening, setListening] = useState(false)
  const [interimText, setInterimText] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition))

    return () => {
      shouldSubmitRef.current = false
      recognitionRef.current?.abort()
    }
  }, [])

  function finishRecognition() {
    setListening(false)
    recognitionRef.current = null

    if (!shouldSubmitRef.current || submittedRef.current) return

    const transcript = `${finalTranscriptRef.current} ${interimTranscriptRef.current}`
      .replace(/\s+/g, ' ')
      .trim()

    if (!transcript) {
      setError('No speech was heard. Tap the microphone and try again.')
      return
    }

    submittedRef.current = true
    setInterimText('')
    void onTranscript(transcript)
  }

  function startListening() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition

    if (!Recognition) {
      setSupported(false)
      return
    }

    const recognition = new Recognition()
    finalTranscriptRef.current = ''
    interimTranscriptRef.current = ''
    shouldSubmitRef.current = true
    submittedRef.current = false
    setError('')
    setInterimText('Listening...')

    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-IE'

    recognition.onresult = (event) => {
      let interim = ''

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const text = result[0]?.transcript || ''

        if (result.isFinal) {
          finalTranscriptRef.current = `${finalTranscriptRef.current} ${text}`.trim()
        } else {
          interim += text
        }
      }

      interimTranscriptRef.current = interim.trim()
      setInterimText(
        `${finalTranscriptRef.current} ${interimTranscriptRef.current}`.replace(/\s+/g, ' ').trim()
      )
    }

    recognition.onerror = (event) => {
      shouldSubmitRef.current = false
      setError(recognitionErrorMessage(event.error))
      setListening(false)
    }

    recognition.onend = finishRecognition
    recognitionRef.current = recognition

    try {
      recognition.start()
      setListening(true)
    } catch {
      shouldSubmitRef.current = false
      recognitionRef.current = null
      setError('The microphone could not start. Please try again.')
    }
  }

  function stopListening() {
    if (!recognitionRef.current) return
    setInterimText((current) => current || 'Processing voice...')
    recognitionRef.current.stop()
  }

  if (!supported) {
    return (
      <p className="text-sm text-amber-700">
        Voice entry is not supported by this browser. Use Safari or Chrome with microphone access.
      </p>
    )
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={listening ? stopListening : startListening}
        disabled={disabled || processing}
        aria-pressed={listening}
        className={
          listening
            ? 'inline-flex min-h-11 items-center gap-2 rounded-lg bg-red-700 px-4 py-2 font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60'
            : 'inline-flex min-h-11 items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 font-medium text-blue-800 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60'
        }
      >
        {processing ? (
          <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin" />
        ) : listening ? (
          <Square aria-hidden="true" className="h-4 w-4 fill-current" />
        ) : (
          <Mic aria-hidden="true" className="h-5 w-5" />
        )}
        {processing ? 'Preparing draft...' : listening ? 'Stop and review' : 'Voice entry'}
      </button>

      {listening && interimText ? (
        <p className="max-w-xl text-sm text-slate-600" aria-live="polite">
          {interimText}
        </p>
      ) : null}

      {error ? (
        <p className="max-w-xl text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
