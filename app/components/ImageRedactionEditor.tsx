'use client'

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Check, MousePointer2, Plus, RotateCcw, Trash2 } from 'lucide-react'

export type RedactionDocumentKind = 'delivery' | 'supplier_price' | 'sales'

type RedactionBox = {
  id: string
  x: number
  y: number
  width: number
  height: number
}

type PointerAction = {
  mode: 'create' | 'move' | 'resize'
  id: string
  startX: number
  startY: number
  original: RedactionBox
}

export type ImageRedactionEditorHandle = {
  exportRedactedImage: () => Promise<{
    dataUrl: string
    redactionCount: number
  }>
}

type ImageRedactionEditorProps = {
  file: File
  kind: RedactionDocumentKind
  disabled?: boolean
}

const MAX_OUTPUT_BYTES = 3 * 1024 * 1024

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value))
}

function suggestedBoxes(kind: RedactionDocumentKind): RedactionBox[] {
  if (kind === 'sales') {
    return [
      { id: crypto.randomUUID(), x: 0.6, y: 0.08, width: 0.35, height: 0.13 },
      { id: crypto.randomUUID(), x: 0.08, y: 0.91, width: 0.84, height: 0.06 },
    ]
  }

  return [
    { id: crypto.randomUUID(), x: 0.52, y: 0.04, width: 0.44, height: 0.22 },
    { id: crypto.randomUUID(), x: 0.06, y: 0.9, width: 0.88, height: 0.07 },
  ]
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not prepare the image for redaction.'))
    image.src = url
  })
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Could not create the redacted image.'))
      },
      'image/jpeg',
      quality
    )
  })
}

function blobDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not prepare the redacted image.'))
    reader.readAsDataURL(blob)
  })
}

const ImageRedactionEditor = forwardRef<
  ImageRedactionEditorHandle,
  ImageRedactionEditorProps
>(function ImageRedactionEditor({ file, kind, disabled = false }, ref) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const pointerActionRef = useRef<PointerAction | null>(null)
  const [imageUrl, setImageUrl] = useState('')
  const [boxes, setBoxes] = useState<RedactionBox[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [tool, setTool] = useState<'select' | 'add'>('select')
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setImageUrl(url)
    setBoxes(suggestedBoxes(kind))
    setSelectedId('')
    setTool('select')
    setConfirmed(false)

    return () => URL.revokeObjectURL(url)
  }, [file, kind])

  const selectedBox = useMemo(
    () => boxes.find((box) => box.id === selectedId) ?? null,
    [boxes, selectedId]
  )

  function pointFromEvent(event: React.PointerEvent<HTMLDivElement>) {
    const bounds = stageRef.current?.getBoundingClientRect()
    if (!bounds) return null

    return {
      x: clamp((event.clientX - bounds.left) / bounds.width),
      y: clamp((event.clientY - bounds.top) / bounds.height),
    }
  }

  function replaceBox(id: string, next: RedactionBox) {
    setBoxes((current) => current.map((box) => (box.id === id ? next : box)))
    setConfirmed(false)
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (disabled) return

    const point = pointFromEvent(event)
    if (!point) return

    const target = event.target as HTMLElement
    const boxElement = target.closest<HTMLElement>('[data-redaction-box]')
    const boxId = boxElement?.dataset.redactionBox || ''
    const box = boxes.find((candidate) => candidate.id === boxId)

    if (box && tool === 'select') {
      setSelectedId(box.id)
      pointerActionRef.current = {
        mode: target.dataset.resizeHandle === 'true' ? 'resize' : 'move',
        id: box.id,
        startX: point.x,
        startY: point.y,
        original: box,
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      event.preventDefault()
      return
    }

    if (tool !== 'add') {
      setSelectedId('')
      return
    }

    const id = crypto.randomUUID()
    const boxToCreate = {
      id,
      x: point.x,
      y: point.y,
      width: 0,
      height: 0,
    }

    setBoxes((current) => [...current, boxToCreate])
    setSelectedId(id)
    setConfirmed(false)
    pointerActionRef.current = {
      mode: 'create',
      id,
      startX: point.x,
      startY: point.y,
      original: boxToCreate,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const action = pointerActionRef.current
    const point = pointFromEvent(event)
    if (!action || !point) return

    if (action.mode === 'create') {
      replaceBox(action.id, {
        id: action.id,
        x: Math.min(action.startX, point.x),
        y: Math.min(action.startY, point.y),
        width: Math.abs(point.x - action.startX),
        height: Math.abs(point.y - action.startY),
      })
      return
    }

    if (action.mode === 'move') {
      const deltaX = point.x - action.startX
      const deltaY = point.y - action.startY

      replaceBox(action.id, {
        ...action.original,
        x: clamp(action.original.x + deltaX, 0, 1 - action.original.width),
        y: clamp(action.original.y + deltaY, 0, 1 - action.original.height),
      })
      return
    }

    replaceBox(action.id, {
      ...action.original,
      width: clamp(point.x - action.original.x, 0.015, 1 - action.original.x),
      height: clamp(point.y - action.original.y, 0.015, 1 - action.original.y),
    })
  }

  function finishPointerAction(event: React.PointerEvent<HTMLDivElement>) {
    const action = pointerActionRef.current
    if (!action) return

    if (action.mode === 'create') {
      setBoxes((current) => {
        const created = current.find((box) => box.id === action.id)
        if (!created || created.width < 0.015 || created.height < 0.015) {
          return current.filter((box) => box.id !== action.id)
        }
        return current
      })
      setTool('select')
    }

    pointerActionRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function resetSuggestions() {
    setBoxes(suggestedBoxes(kind))
    setSelectedId('')
    setTool('select')
    setConfirmed(false)
  }

  function removeSelected() {
    if (!selectedId) return
    setBoxes((current) => current.filter((box) => box.id !== selectedId))
    setSelectedId('')
    setConfirmed(false)
  }

  useImperativeHandle(
    ref,
    () => ({
      async exportRedactedImage() {
        if (!confirmed) {
          throw new Error('Check the redacted image and confirm it before parsing.')
        }

        const image = await loadImage(imageUrl)
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')

        if (!context) throw new Error('Could not create the redacted image.')

        let maxDimension = 2400
        let quality = 0.88
        let blob: Blob | null = null

        while (!blob || blob.size > MAX_OUTPUT_BYTES) {
          const scale = Math.min(
            1,
            maxDimension / Math.max(image.naturalWidth, image.naturalHeight)
          )
          const width = Math.max(1, Math.round(image.naturalWidth * scale))
          const height = Math.max(1, Math.round(image.naturalHeight * scale))

          canvas.width = width
          canvas.height = height
          context.fillStyle = '#ffffff'
          context.fillRect(0, 0, width, height)
          context.drawImage(image, 0, 0, width, height)
          context.fillStyle = '#000000'

          for (const box of boxes) {
            context.fillRect(
              Math.floor(box.x * width),
              Math.floor(box.y * height),
              Math.ceil(box.width * width),
              Math.ceil(box.height * height)
            )
          }

          blob = await canvasBlob(canvas, quality)
          if (blob.size <= MAX_OUTPUT_BYTES || maxDimension <= 1200) break

          maxDimension = Math.max(1200, Math.round(maxDimension * 0.8))
          quality = 0.72
        }

        if (!blob || blob.size > MAX_OUTPUT_BYTES) {
          throw new Error('The redacted image is still too large. Take a lower-resolution photo.')
        }

        return {
          dataUrl: await blobDataUrl(blob),
          redactionCount: boxes.length,
        }
      },
    }),
    [boxes, confirmed, imageUrl]
  )

  return (
    <div className="mt-5 overflow-hidden rounded-lg border bg-slate-50">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-white px-3 py-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Privacy preview</div>
          <div className="text-xs text-slate-600">
            Only this flattened, redacted copy will be sent for AI reading.
          </div>
        </div>

        <div className="flex items-center gap-1" role="toolbar" aria-label="Redaction tools">
          <button
            type="button"
            title="Select and move redactions"
            aria-label="Select and move redactions"
            aria-pressed={tool === 'select'}
            onClick={() => setTool('select')}
            disabled={disabled}
            className={`grid h-10 w-10 place-items-center rounded-md border disabled:opacity-50 ${
              tool === 'select' ? 'bg-slate-900 text-white' : 'bg-white text-slate-800'
            }`}
          >
            <MousePointer2 size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            title="Draw a privacy redaction"
            aria-label="Draw a privacy redaction"
            aria-pressed={tool === 'add'}
            onClick={() => setTool('add')}
            disabled={disabled}
            className={`grid h-10 w-10 place-items-center rounded-md border disabled:opacity-50 ${
              tool === 'add' ? 'bg-slate-900 text-white' : 'bg-white text-slate-800'
            }`}
          >
            <Plus size={19} aria-hidden="true" />
          </button>
          <button
            type="button"
            title="Delete selected redaction"
            aria-label="Delete selected redaction"
            onClick={removeSelected}
            disabled={disabled || !selectedBox}
            className="grid h-10 w-10 place-items-center rounded-md border bg-white text-red-700 disabled:opacity-40"
          >
            <Trash2 size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            title="Reset suggested redactions"
            aria-label="Reset suggested redactions"
            onClick={resetSuggestions}
            disabled={disabled}
            className="grid h-10 w-10 place-items-center rounded-md border bg-white text-slate-800 disabled:opacity-50"
          >
            <RotateCcw size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="overflow-auto bg-slate-200 p-3 text-center">
        <div
          ref={stageRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishPointerAction}
          onPointerCancel={finishPointerAction}
          className={`relative inline-block max-w-full select-none bg-white shadow-sm ${
            tool === 'add' ? 'cursor-crosshair' : 'cursor-default'
          }`}
          style={{ touchAction: 'none' }}
        >
          {imageUrl ? (
            <>
              {/* The temporary object URL never leaves the browser. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt="Document awaiting privacy redaction"
                className="block max-h-[65vh] max-w-full"
                draggable={false}
              />
            </>
          ) : null}

          {boxes.map((box) => {
            const selected = box.id === selectedId
            return (
              <div
                key={box.id}
                data-redaction-box={box.id}
                className={`absolute bg-black ${
                  selected ? 'outline-2 outline-offset-2 outline-amber-400' : ''
                }`}
                style={{
                  left: `${box.x * 100}%`,
                  top: `${box.y * 100}%`,
                  width: `${box.width * 100}%`,
                  height: `${box.height * 100}%`,
                  minWidth: '8px',
                  minHeight: '8px',
                  cursor: tool === 'select' ? 'move' : 'crosshair',
                }}
              >
                {selected && tool === 'select' ? (
                  <span
                    data-resize-handle="true"
                    className="absolute -bottom-2 -right-2 h-5 w-5 cursor-se-resize rounded-sm border-2 border-white bg-amber-400"
                    aria-hidden="true"
                  />
                ) : null}
              </div>
            )
          })}
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-3 bg-white px-4 py-3 text-sm text-slate-800">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          disabled={disabled}
          className="mt-0.5 h-4 w-4"
        />
        <span className="flex-1">
          I checked the image. Names, addresses, contact, account and payment details are covered.
        </span>
        {confirmed ? <Check size={18} className="text-green-700" aria-hidden="true" /> : null}
      </label>
    </div>
  )
})

export default ImageRedactionEditor
