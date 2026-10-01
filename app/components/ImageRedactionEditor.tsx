'use client'

import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { ArrowRight, MousePointer2, Plus, RotateCcw, Trash2 } from 'lucide-react'

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
  onProcess?: () => void
  processing?: boolean
}

const MAX_OUTPUT_BYTES = 3 * 1024 * 1024

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value))
}

function suggestedBoxes(kind: RedactionDocumentKind, aspectRatio = 1): RedactionBox[] {
  if (kind === 'sales') {
    return [
      { id: crypto.randomUUID(), x: 0.06, y: 0.16, width: 0.88, height: 0.7 },
    ]
  }

  return [
    kind === 'delivery'
      ? aspectRatio < 0.66
        ? { id: crypto.randomUUID(), x: 0.03, y: 0.245, width: 0.94, height: 0.4 }
        : { id: crypto.randomUUID(), x: 0.025, y: 0.27, width: 0.95, height: 0.53 }
      : { id: crypto.randomUUID(), x: 0.04, y: 0.16, width: 0.92, height: 0.72 },
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
>(function ImageRedactionEditor(
  { file, kind, disabled = false, onProcess, processing = false },
  ref
) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const pointerActionRef = useRef<PointerAction | null>(null)
  const aspectRatioRef = useRef(1)
  const maskId = `selection-mask-${useId().replace(/:/g, '')}`
  const [imageUrl, setImageUrl] = useState('')
  const [boxes, setBoxes] = useState<RedactionBox[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [tool, setTool] = useState<'select' | 'add'>('select')
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    let active = true
    setImageUrl(url)
    setBoxes([])
    setSelectedId('')
    setTool('select')
    setConfirmed(false)

    loadImage(url)
      .then((image) => {
        if (!active) return
        aspectRatioRef.current = image.naturalWidth / image.naturalHeight
        setBoxes(suggestedBoxes(kind, aspectRatioRef.current))
      })
      .catch(() => {
        if (active) setBoxes(suggestedBoxes(kind))
      })

    return () => {
      active = false
      URL.revokeObjectURL(url)
    }
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
    setBoxes(suggestedBoxes(kind, aspectRatioRef.current))
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
          throw new Error('Check the selected area and confirm it before processing.')
        }

        if (boxes.length === 0) {
          throw new Error('Select the product table before processing.')
        }

        const image = await loadImage(imageUrl)
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')

        if (!context) throw new Error('Could not create the redacted image.')

        const selectionBounds = boxes.reduce(
          (bounds, box) => ({
            left: Math.min(bounds.left, box.x),
            top: Math.min(bounds.top, box.y),
            right: Math.max(bounds.right, box.x + box.width),
            bottom: Math.max(bounds.bottom, box.y + box.height),
          }),
          { left: 1, top: 1, right: 0, bottom: 0 }
        )
        const selectedSourceWidth = Math.max(
          1,
          Math.ceil((selectionBounds.right - selectionBounds.left) * image.naturalWidth)
        )
        const selectedSourceHeight = Math.max(
          1,
          Math.ceil((selectionBounds.bottom - selectionBounds.top) * image.naturalHeight)
        )

        let maxDimension = 2400
        let quality = 0.88
        let blob: Blob | null = null

        while (!blob || blob.size > MAX_OUTPUT_BYTES) {
          const scale = Math.min(
            1,
            maxDimension / Math.max(selectedSourceWidth, selectedSourceHeight)
          )
          const width = Math.max(1, Math.round(selectedSourceWidth * scale))
          const height = Math.max(1, Math.round(selectedSourceHeight * scale))

          canvas.width = width
          canvas.height = height
          context.fillStyle = '#000000'
          context.fillRect(0, 0, width, height)

          for (const box of boxes) {
            const sourceX = Math.floor(box.x * image.naturalWidth)
            const sourceY = Math.floor(box.y * image.naturalHeight)
            const sourceWidth = Math.ceil(box.width * image.naturalWidth)
            const sourceHeight = Math.ceil(box.height * image.naturalHeight)
            const outputX = Math.floor(
              (box.x - selectionBounds.left) * image.naturalWidth * scale
            )
            const outputY = Math.floor(
              (box.y - selectionBounds.top) * image.naturalHeight * scale
            )
            const outputWidth = Math.ceil(sourceWidth * scale)
            const outputHeight = Math.ceil(sourceHeight * scale)

            context.drawImage(
              image,
              sourceX,
              sourceY,
              sourceWidth,
              sourceHeight,
              outputX,
              outputY,
              outputWidth,
              outputHeight
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
            Only the selected area will be sent for AI reading. Do not include sensitive data.
          </div>
        </div>

        <div className="flex items-center gap-1" role="toolbar" aria-label="Selection tools">
          <button
            type="button"
            title="Select and move included areas"
            aria-label="Select and move included areas"
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
            title="Draw an area to include"
            aria-label="Draw an area to include"
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
            title="Delete selected area"
            aria-label="Delete selected area"
            onClick={removeSelected}
            disabled={disabled || !selectedBox}
            className="grid h-10 w-10 place-items-center rounded-md border bg-white text-red-700 disabled:opacity-40"
          >
            <Trash2 size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            title="Reset table selection"
            aria-label="Reset table selection"
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
                alt="Document with product table selected for processing"
                className="block max-h-[65vh] max-w-full"
                draggable={false}
              />
            </>
          ) : null}

          {imageUrl ? (
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <mask id={maskId}>
                  <rect width="1000" height="1000" fill="white" />
                  {boxes.map((box) => (
                    <rect
                      key={box.id}
                      x={box.x * 1000}
                      y={box.y * 1000}
                      width={box.width * 1000}
                      height={box.height * 1000}
                      fill="black"
                    />
                  ))}
                </mask>
              </defs>
              <rect
                width="1000"
                height="1000"
                fill="rgba(15, 23, 42, 0.66)"
                mask={`url(#${maskId})`}
              />
            </svg>
          ) : null}

          {boxes.map((box) => {
            const selected = box.id === selectedId
            return (
              <div
                key={box.id}
                data-redaction-box={box.id}
                className={`absolute border-2 bg-transparent ${
                  selected
                    ? 'border-emerald-400 outline-2 outline-offset-1 outline-white'
                    : 'border-white'
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

      <div className="flex flex-col gap-3 bg-white px-4 py-3 sm:flex-row sm:items-center">
        <label className="flex flex-1 cursor-pointer items-start gap-3 text-sm text-slate-800">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            disabled={disabled || boxes.length === 0}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            I checked the selection. It contains the product table and no sensitive data.
          </span>
        </label>
        {onProcess ? (
          <button
            type="button"
            onClick={onProcess}
            disabled={disabled || processing || !confirmed || boxes.length === 0}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <span>{processing ? 'Processing...' : 'Process'}</span>
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  )
})

export default ImageRedactionEditor
