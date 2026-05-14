import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { useSync } from '@tldraw/sync'
import {
	Tldraw,
	createShapeId,
	defaultBindingUtils,
	defaultShapeUtils,
	toRichText,
	type Editor,
	type TLDefaultColorStyle,
	type TLNoteShape,
} from 'tldraw'
import { getBookmarkPreview } from './getBookmarkPreview'
import { multiplayerAssetStore } from './multiplayerAssetStore'
import {
	CANVAS_LINK_SHAPE_TYPE,
	CanvasLinkShapeUtil,
	OPEN_CANVAS_EVENT,
	RENAME_CANVAS_EVENT,
	type CanvasLinkShape,
} from './canvasLinks'

const APP_NAME = 'draw your brain'
const DEFAULT_PROJECT_NAME = 'we build it'
const NOTE_SIZE = 200
const CANVAS_LINK_SIZE = { w: 280, h: 150 }
const DRAG_THRESHOLD = 8
const SHAPE_UTILS = [CanvasLinkShapeUtil]
const SYNC_SHAPE_UTILS = [...SHAPE_UTILS, ...defaultShapeUtils]
const CANVAS_REGISTRY_STORAGE_KEY = 'draw-your-brain:canvas-registry'
const LEGACY_CANVAS_REGISTRY_STORAGE_KEY = 'drwo-your-brain:canvas-registry'
const SYNC_ROOM_PREFIX = 'draw-your-brain:v3'
const TLDRAW_LICENSE_KEY = import.meta.env.VITE_TLDRAW_LICENSE_KEY

const STICKY_NOTE_COLORS = [
	{ name: 'Yellow', value: 'yellow', preview: '#f7d94c' },
	{ name: 'Blue', value: 'light-blue', preview: '#8ec5ff' },
	{ name: 'Green', value: 'light-green', preview: '#9ae6b4' },
	{ name: 'Red', value: 'light-red', preview: '#ff9aa2' },
	{ name: 'Violet', value: 'light-violet', preview: '#c4b5fd' },
] as const satisfies readonly {
	name: string
	value: TLDefaultColorStyle
	preview: string
}[]

const CANVAS_ACCENTS = ['#8ec5ff', '#9ae6b4', '#c4b5fd', '#ff9aa2', '#f7d94c'] as const

interface CanvasModel {
	id: string
	title: string
	parentId: string | null
	accent: string
}

type DraggingPaletteItem =
	| {
			type: 'sticky-note'
			color: TLDefaultColorStyle
			preview: string
			startX: number
			startY: number
			x: number
			y: number
	  }
	| {
			type: 'canvas-link'
			preview: string
			startX: number
			startY: number
			x: number
			y: number
	  }

const INITIAL_CANVASES: CanvasModel[] = [
	{
		id: 'we-build-it',
		title: DEFAULT_PROJECT_NAME,
		parentId: null,
		accent: '#8ec5ff',
	},
]

function loadCanvases() {
	if (typeof window === 'undefined') return INITIAL_CANVASES

	try {
		const stored =
			window.localStorage.getItem(CANVAS_REGISTRY_STORAGE_KEY) ??
			window.localStorage.getItem(LEGACY_CANVAS_REGISTRY_STORAGE_KEY)
		if (!stored) return INITIAL_CANVASES

		const parsed = JSON.parse(stored) as CanvasModel[]
		if (!Array.isArray(parsed) || !parsed.some((canvas) => canvas.id === INITIAL_CANVASES[0].id)) {
			return INITIAL_CANVASES
		}

		return parsed
	} catch {
		return INITIAL_CANVASES
	}
}

function createStickyNote(editor: Editor, clientX: number, clientY: number, color: TLDefaultColorStyle) {
	const pagePoint = editor.screenToPage({ x: clientX, y: clientY })
	const id = createShapeId()

	editor.createShape<TLNoteShape>({
		id,
		type: 'note',
		x: pagePoint.x - NOTE_SIZE / 2,
		y: pagePoint.y - NOTE_SIZE / 2,
		props: {
			color,
			labelColor: 'black',
			size: 'm',
			font: 'draw',
			align: 'middle',
			verticalAlign: 'middle',
			growY: 0,
			url: '',
			richText: toRichText(''),
			scale: 1,
			fontSizeAdjustment: 1,
			textFirstEditedBy: null,
		},
	})

	editor.select(id)
	editor.setCurrentTool('select')
}

function createCanvasLink(editor: Editor, clientX: number, clientY: number, canvas: CanvasModel) {
	const pagePoint = editor.screenToPage({ x: clientX, y: clientY })
	const id = createShapeId()

	editor.createShape<CanvasLinkShape>({
		id,
		type: CANVAS_LINK_SHAPE_TYPE,
		x: pagePoint.x - CANVAS_LINK_SIZE.w / 2,
		y: pagePoint.y - CANVAS_LINK_SIZE.h / 2,
		props: {
			...CANVAS_LINK_SIZE,
			canvasId: canvas.id,
			title: canvas.title,
			accent: canvas.accent,
		},
	})

	editor.select(id)
	editor.setCurrentTool('select')
}

function shouldUseCloudflareSync() {
	const syncMode = new URLSearchParams(window.location.search).get('sync')
	if (syncMode === '1') return true
	if (syncMode === '0') return false
	if (import.meta.env.VITE_ENABLE_SYNC === 'true') return true
	if (import.meta.env.VITE_ENABLE_SYNC === 'false') return false

	return true
}

function getSyncRoomId(canvasId: string) {
	return `${SYNC_ROOM_PREFIX}:${canvasId}`
}

function handleEditorMount(editor: Editor, onMount: (editor: Editor) => void) {
	const showTldrawUi = () => editor.updateInstanceState({ isFocusMode: false })

	onMount(editor)
	showTldrawUi()
	editor.registerExternalAssetHandler('url', getBookmarkPreview)

	const focusModeTimers = [
		window.setTimeout(showTldrawUi, 100),
		window.setTimeout(showTldrawUi, 1000),
	]
	const focusModeInterval = window.setInterval(showTldrawUi, 500)

	return () => {
		focusModeTimers.forEach((timer) => window.clearTimeout(timer))
		window.clearInterval(focusModeInterval)
	}
}

function CollaborativeCanvas({
	activeCanvasId,
	onMount,
}: {
	activeCanvasId: string
	onMount: (editor: Editor) => void
}) {
	const uri = `${window.location.origin}/api/connect/${encodeURIComponent(getSyncRoomId(activeCanvasId))}`
	const [mountedCanvasId, setMountedCanvasId] = useState<string | null>(null)
	const [localFallbackCanvasId, setLocalFallbackCanvasId] = useState<string | null>(null)
	const store = useSync({
		uri,
		assets: multiplayerAssetStore,
		shapeUtils: useMemo(() => SYNC_SHAPE_UTILS, []),
		bindingUtils: useMemo(() => defaultBindingUtils, []),
	})

	useEffect(() => {
		setMountedCanvasId(null)
		setLocalFallbackCanvasId(null)
	}, [activeCanvasId])

	useEffect(() => {
		if (store.status === 'error') {
			setLocalFallbackCanvasId(activeCanvasId)
			return
		}

		if (store.status !== 'loading' || localFallbackCanvasId === activeCanvasId) return

		const fallbackTimer = window.setTimeout(() => {
			setLocalFallbackCanvasId(activeCanvasId)
		}, 4000)

		return () => window.clearTimeout(fallbackTimer)
	}, [activeCanvasId, localFallbackCanvasId, store.status])

	useEffect(() => {
		if (mountedCanvasId === activeCanvasId || localFallbackCanvasId === activeCanvasId) return

		const mountTimer = window.setTimeout(() => {
			setLocalFallbackCanvasId(activeCanvasId)
		}, 4500)

		return () => window.clearTimeout(mountTimer)
	}, [activeCanvasId, localFallbackCanvasId, mountedCanvasId])

	if (localFallbackCanvasId === activeCanvasId) {
		return <LocalCanvas activeCanvasId={activeCanvasId} onMount={onMount} />
	}

	if (store.status !== 'synced-remote') {
		return null
	}

	return (
		<Tldraw
			key={activeCanvasId}
			licenseKey={TLDRAW_LICENSE_KEY}
			onMount={(editor) => {
				setMountedCanvasId(activeCanvasId)
				return handleEditorMount(editor, onMount)
			}}
			shapeUtils={SHAPE_UTILS}
			store={store.store}
		/>
	)
}

function LocalCanvas({
	activeCanvasId,
	onMount,
}: {
	activeCanvasId: string
	onMount: (editor: Editor) => void
}) {
	return (
		<Tldraw
			key={activeCanvasId}
			licenseKey={TLDRAW_LICENSE_KEY}
			onMount={(editor) => handleEditorMount(editor, onMount)}
			shapeUtils={SHAPE_UTILS}
		/>
	)
}

function App() {
	const [editor, setEditor] = useState<Editor | null>(null)
	const [canvases, setCanvases] = useState<CanvasModel[]>(loadCanvases)
	const [activeCanvasId, setActiveCanvasId] = useState(INITIAL_CANVASES[0].id)
	const [canvasHistory, setCanvasHistory] = useState<string[]>([])
	const [draggingPaletteItem, setDraggingPaletteItem] = useState<DraggingPaletteItem | null>(null)
	const draggingPaletteItemRef = useRef<DraggingPaletteItem | null>(null)
	const editorRef = useRef<Editor | null>(null)
	const canvasesRef = useRef(canvases)
	const useCloudflareSync = shouldUseCloudflareSync()

	const activeCanvas = canvases.find((canvas) => canvas.id === activeCanvasId) ?? canvases[0]
	const parentCanvas =
		canvasHistory.length > 0
			? (canvases.find((c) => c.id === canvasHistory[canvasHistory.length - 1]) ?? null)
			: null

	const handleSetEditor = useCallback((e: Editor) => {
		editorRef.current = e
		setEditor(e)
	}, [])

	const handleBack = useCallback(() => {
		setCanvasHistory((h) => {
			const next = [...h]
			const prevId = next.pop() ?? INITIAL_CANVASES[0].id
			setActiveCanvasId(prevId)
			return next
		})
	}, [])

	useEffect(() => {
		draggingPaletteItemRef.current = draggingPaletteItem
	}, [draggingPaletteItem])

	useEffect(() => {
		canvasesRef.current = canvases
		window.localStorage.setItem(CANVAS_REGISTRY_STORAGE_KEY, JSON.stringify(canvases))
	}, [canvases])

	useEffect(() => {
		if (!draggingPaletteItem) return

		const handlePointerMove = (event: globalThis.PointerEvent) => {
			setDraggingPaletteItem((current) =>
				current
					? {
							...current,
							x: event.clientX,
							y: event.clientY,
						}
					: current
			)
		}

		const handlePointerUp = (event: globalThis.PointerEvent) => {
			const current = draggingPaletteItemRef.current

			if (editor && current) {
				const distance = Math.hypot(event.clientX - current.startX, event.clientY - current.startY)

				if (distance > DRAG_THRESHOLD && current.type === 'sticky-note') {
					createStickyNote(editor, event.clientX, event.clientY, current.color)
				} else if (distance > DRAG_THRESHOLD && current.type === 'canvas-link') {
					const childCount =
						canvasesRef.current.filter((canvas) => canvas.parentId === activeCanvas.id).length + 1
					const canvas: CanvasModel = {
						id: `canvas-${Date.now()}-${childCount}`,
						title: `Canvas ${childCount}`,
						parentId: activeCanvas.id,
						accent: CANVAS_ACCENTS[childCount % CANVAS_ACCENTS.length],
					}

					setCanvases((currentCanvases) => [...currentCanvases, canvas])
					createCanvasLink(editor, event.clientX, event.clientY, canvas)
				}
			}

			setDraggingPaletteItem(null)
		}

		const handlePointerCancel = () => setDraggingPaletteItem(null)

		window.addEventListener('pointermove', handlePointerMove)
		window.addEventListener('pointerup', handlePointerUp)
		window.addEventListener('pointercancel', handlePointerCancel)

		return () => {
			window.removeEventListener('pointermove', handlePointerMove)
			window.removeEventListener('pointerup', handlePointerUp)
			window.removeEventListener('pointercancel', handlePointerCancel)
		}
	}, [activeCanvas.id, activeCanvas.title, draggingPaletteItem, editor])

	useEffect(() => {
		const handleOpenCanvas = (event: Event) => {
			const detail = (event as CustomEvent<{
				accent?: string
				canvasId: string
				title?: string
			}>).detail
			const canvasId = detail?.canvasId
			if (canvasId) {
				setCanvases((currentCanvases) => {
					if (currentCanvases.some((canvas) => canvas.id === canvasId)) return currentCanvases

					return [
						...currentCanvases,
						{
							id: canvasId,
							title: detail.title ?? 'Canvas',
							parentId: activeCanvasId,
							accent: detail.accent ?? '#8ec5ff',
						},
					]
				})
				setCanvasHistory((h) => [...h, activeCanvasId])
				setActiveCanvasId(canvasId)
			}
		}

		window.addEventListener(OPEN_CANVAS_EVENT, handleOpenCanvas)

		return () => window.removeEventListener(OPEN_CANVAS_EVENT, handleOpenCanvas)
	}, [activeCanvasId])

	useEffect(() => {
		const handleRenameCanvas = (event: Event) => {
			const detail = (event as CustomEvent<{ canvasId: string; title: string }>).detail
			if (!detail?.canvasId || !detail?.title) return

			setCanvases((prev) =>
				prev.map((c) => (c.id === detail.canvasId ? { ...c, title: detail.title } : c))
			)

			const ed = editorRef.current
			if (ed) {
				const shapes = ed.getCurrentPageShapes()
				const match = shapes.find(
					(s) =>
						s.type === CANVAS_LINK_SHAPE_TYPE &&
						(s as CanvasLinkShape).props.canvasId === detail.canvasId
				)
				if (match) {
					ed.updateShape({ id: match.id, type: CANVAS_LINK_SHAPE_TYPE, props: { title: detail.title } })
				}
			}
		}

		window.addEventListener(RENAME_CANVAS_EVENT, handleRenameCanvas)
		return () => window.removeEventListener(RENAME_CANVAS_EVENT, handleRenameCanvas)
	}, [])

	const handleStickyNotePointerDown = useCallback(
		(event: PointerEvent<HTMLButtonElement>, color: TLDefaultColorStyle, preview: string) => {
			if (!editor) return

			event.preventDefault()
			setDraggingPaletteItem({
				type: 'sticky-note',
				color,
				preview,
				startX: event.clientX,
				startY: event.clientY,
				x: event.clientX,
				y: event.clientY,
			})
		},
		[editor]
	)

	const handleCanvasLinkPointerDown = useCallback(
		(event: PointerEvent<HTMLButtonElement>) => {
			if (!editor) return

			event.preventDefault()
			setDraggingPaletteItem({
				type: 'canvas-link',
				preview: '#8ec5ff',
				startX: event.clientX,
				startY: event.clientY,
				x: event.clientX,
				y: event.clientY,
			})
		},
		[editor]
	)

	return (
		<div className="app-shell">
			{useCloudflareSync ? (
				<CollaborativeCanvas activeCanvasId={activeCanvas.id} onMount={handleSetEditor} />
			) : (
				<LocalCanvas activeCanvasId={activeCanvas.id} onMount={handleSetEditor} />
			)}

			<div className="brand-panel" aria-label={APP_NAME}>
				<span className="brand-mark" aria-hidden="true">
					db
				</span>
				<span>{APP_NAME}</span>
			</div>

			{parentCanvas && (
				<div className="canvas-nav-panel">
					<button className="back-button" onClick={handleBack} type="button">
						← {parentCanvas.title}
					</button>
					<span className="current-canvas-name">{activeCanvas.title}</span>
				</div>
			)}

			<div className="sticky-note-palette" aria-label="Canvas and sticky note tools">
				<button
					aria-label="Drag a child canvas"
					className="canvas-link-palette-button"
					onPointerDown={handleCanvasLinkPointerDown}
					title="Child canvas"
					type="button"
				>
					<span className="canvas-link-palette-icon" aria-hidden="true">
						<span />
						<span />
						<span />
					</span>
					Canvas
				</button>
				{STICKY_NOTE_COLORS.map((color) => (
					<button
						aria-label={`${color.name} sticky note`}
						className="sticky-note-swatch"
						key={color.value}
						onPointerDown={(event) => handleStickyNotePointerDown(event, color.value, color.preview)}
						style={{ '--sticky-note-color': color.preview } as CSSProperties}
						title={color.name}
						type="button"
					/>
				))}
			</div>

			{draggingPaletteItem ? (
				<div
					className={
						draggingPaletteItem.type === 'canvas-link'
							? 'canvas-link-drag-preview'
							: 'sticky-note-drag-preview'
					}
					style={
						{
							'--canvas-link-accent': draggingPaletteItem.preview,
							'--sticky-note-color': draggingPaletteItem.preview,
							left: draggingPaletteItem.x,
							top: draggingPaletteItem.y,
						} as CSSProperties
					}
				/>
			) : null}
		</div>
	)
}

export default App
