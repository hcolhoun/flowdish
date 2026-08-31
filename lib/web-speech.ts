export type VoiceRecognitionResult = {
  isFinal: boolean
  0: {
    transcript: string
  }
}

export type VoiceRecognitionEvent = Event & {
  resultIndex: number
  results: ArrayLike<VoiceRecognitionResult>
}

export type VoiceRecognitionErrorEvent = Event & {
  error: string
}

export type VoiceRecognition = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: VoiceRecognitionEvent) => void) | null
  onerror: ((event: VoiceRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

export type VoiceRecognitionConstructor = new () => VoiceRecognition

declare global {
  interface Window {
    SpeechRecognition?: VoiceRecognitionConstructor
    webkitSpeechRecognition?: VoiceRecognitionConstructor
  }
}
