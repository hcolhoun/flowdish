'use client'

type TesseractLog = {
  status?: string
  progress?: number
}

type TesseractBrowser = {
  recognize: (
    image: File | Blob | HTMLCanvasElement,
    language?: string,
    options?: {
      logger?: (message: TesseractLog) => void
      tessedit_pageseg_mode?: string
      preserve_interword_spaces?: string
    }
  ) => Promise<{ data: { text: string } }>
}

declare global {
  interface Window {
    Tesseract?: TesseractBrowser
  }
}

function loadTesseract() {
  return new Promise<TesseractBrowser>((resolve, reject) => {
    if (window.Tesseract) {
      resolve(window.Tesseract)
      return
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-tesseract-loader="true"]'
    )

    if (existingScript) {
      existingScript.addEventListener('load', () => {
        if (window.Tesseract) resolve(window.Tesseract)
        else reject(new Error('OCR failed to load.'))
      })
      existingScript.addEventListener('error', () => reject(new Error('OCR failed to load.')))
      return
    }

    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
    script.async = true
    script.dataset.tesseractLoader = 'true'
    script.onload = () => {
      if (window.Tesseract) resolve(window.Tesseract)
      else reject(new Error('OCR failed to load.'))
    }
    script.onerror = () => reject(new Error('OCR failed to load.'))
    document.body.appendChild(script)
  })
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read the image.'))
    }

    image.src = url
  })
}

async function prepareImageForOcr(file: File, setProgress?: (message: string) => void) {
  setProgress?.('Preparing image...')

  const image = await loadImage(file)
  const maxWidth = 2600
  const scale = Math.max(1, Math.min(3, maxWidth / image.width))
  const width = Math.round(image.width * scale)
  const height = Math.round(image.height * scale)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })

  if (!context) throw new Error('Could not prepare the image.')

  canvas.width = width
  canvas.height = height
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, width, height)

  const imageData = context.getImageData(0, 0, width, height)
  const pixels = imageData.data

  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index]
    const green = pixels[index + 1]
    const blue = pixels[index + 2]
    const grey = red * 0.299 + green * 0.587 + blue * 0.114
    const contrasted = (grey - 128) * 1.8 + 128
    const blackOrWhite = contrasted > 150 ? 255 : 0

    pixels[index] = blackOrWhite
    pixels[index + 1] = blackOrWhite
    pixels[index + 2] = blackOrWhite
  }

  context.putImageData(imageData, 0, 0)
  return canvas
}

export async function readImageTextWithTesseract(
  file: File,
  setProgress?: (message: string) => void
) {
  setProgress?.('Loading OCR...')
  const tesseract = await loadTesseract()
  const preparedImage = await prepareImageForOcr(file, setProgress)

  const result = await tesseract.recognize(preparedImage, 'eng', {
    tessedit_pageseg_mode: '6',
    preserve_interword_spaces: '1',
    logger: (message) => {
      if (!message.status) return

      const progress =
        typeof message.progress === 'number' ? ` ${Math.round(message.progress * 100)}%` : ''

      setProgress?.(`${message.status}${progress}`)
    },
  })

  const text = result.data.text.trim()

  if (text.length < 30) {
    throw new Error('OCR did not find enough readable text. Try a clearer photo.')
  }

  return text
}
