import {
	BaseBoxShapeUtil,
	HTMLContainer,
	T,
	resizeBox,
	type RecordProps,
	type TLBaseShape,
	type TLResizeInfo,
} from 'tldraw'
import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'

export const CANVAS_LINK_SHAPE_TYPE = 'canvas-link'
export const OPEN_CANVAS_EVENT = 'draw-your-brain:open-canvas'
export const RENAME_CANVAS_EVENT = 'draw-your-brain:rename-canvas'

export interface CanvasLinkShapeProps {
	w: number
	h: number
	canvasId: string
	title: string
	accent: string
}

export type CanvasLinkShape = TLBaseShape<typeof CANVAS_LINK_SHAPE_TYPE, CanvasLinkShapeProps>

declare module '@tldraw/tlschema' {
	export interface TLGlobalShapePropsMap {
		[CANVAS_LINK_SHAPE_TYPE]: CanvasLinkShapeProps
	}
}

export class CanvasLinkShapeUtil extends BaseBoxShapeUtil<CanvasLinkShape> {
	static override type = CANVAS_LINK_SHAPE_TYPE
	static override props: RecordProps<CanvasLinkShape> = {
		w: T.number,
		h: T.number,
		canvasId: T.string,
		title: T.string,
		accent: T.string,
	}

	override canBind() {
		return true
	}

	override canResize() {
		return true
	}

	override getDefaultProps(): CanvasLinkShape['props'] {
		return {
			w: 280,
			h: 150,
			canvasId: 'canvas',
			title: 'Canvas',
			accent: '#8ec5ff',
		}
	}

	override component(shape: CanvasLinkShape) {
		const openButtonRef = useRef<HTMLButtonElement>(null)
		const renameButtonRef = useRef<HTMLButtonElement>(null)

		// 始终持有最新的 props，供原生事件回调使用
		const propsRef = useRef(shape.props)
		propsRef.current = shape.props

		// 原生事件监听：touchend 不受 pointer capture 影响，手机端可靠触发
		useEffect(() => {
			const openBtn = openButtonRef.current
			const renameBtn = renameButtonRef.current
			if (!openBtn || !renameBtn) return

			let lastOpenTime = 0
			let lastRenameTime = 0

			const handleOpenTouchEnd = (e: TouchEvent) => {
				e.stopPropagation()
				e.preventDefault()
				const now = Date.now()
				if (now - lastOpenTime < 400) return
				lastOpenTime = now
				const { accent, canvasId, title } = propsRef.current
				window.dispatchEvent(
					new CustomEvent(OPEN_CANVAS_EVENT, { detail: { accent, canvasId, title } })
				)
			}

			const handleRenameTouchEnd = (e: TouchEvent) => {
				e.stopPropagation()
				e.preventDefault()
				const now = Date.now()
				if (now - lastRenameTime < 400) return
				lastRenameTime = now
				const { canvasId, title } = propsRef.current
				const newTitle = window.prompt('Rename canvas:', title)
				if (newTitle && newTitle.trim() && newTitle.trim() !== title) {
					window.dispatchEvent(
						new CustomEvent(RENAME_CANVAS_EVENT, {
							detail: { canvasId, title: newTitle.trim() },
						})
					)
				}
			}

			openBtn.addEventListener('touchend', handleOpenTouchEnd, { passive: false })
			renameBtn.addEventListener('touchend', handleRenameTouchEnd, { passive: false })

			return () => {
				openBtn.removeEventListener('touchend', handleOpenTouchEnd)
				renameBtn.removeEventListener('touchend', handleRenameTouchEnd)
			}
		}, [])

		// 桌面端点击处理（鼠标没有 pointer capture 问题）
		const dispatchOpen = () => {
			const { accent, canvasId, title } = shape.props
			window.dispatchEvent(
				new CustomEvent(OPEN_CANVAS_EVENT, { detail: { accent, canvasId, title } })
			)
		}

		const dispatchRename = () => {
			const newTitle = window.prompt('Rename canvas:', shape.props.title)
			if (newTitle && newTitle.trim() && newTitle.trim() !== shape.props.title) {
				window.dispatchEvent(
					new CustomEvent(RENAME_CANVAS_EVENT, {
						detail: { canvasId: shape.props.canvasId, title: newTitle.trim() },
					})
				)
			}
		}

		return (
			<HTMLContainer id={shape.id} className="canvas-link-shape">
				<div
					className="canvas-link-shape-card"
					style={{ '--canvas-link-accent': shape.props.accent } as CSSProperties}
				>
					<div className="canvas-link-shape-icon" aria-hidden="true">
						<span />
						<span />
						<span />
					</div>
					<div className="canvas-link-shape-copy">
						<span>Canvas</span>
						<strong>{shape.props.title}</strong>
					</div>
					<div className="canvas-link-shape-actions">
						<button
							ref={renameButtonRef}
							aria-label="Rename canvas"
							className="canvas-link-shape-rename"
							onPointerDown={(e) => e.stopPropagation()}
							onPointerUp={(e) => { e.stopPropagation(); dispatchRename() }}
							title="Rename"
							type="button"
						>
							✎
						</button>
						<button
							ref={openButtonRef}
							className="canvas-link-shape-open"
							onPointerDown={(e) => e.stopPropagation()}
							onPointerUp={(e) => { e.stopPropagation(); dispatchOpen() }}
							type="button"
						>
							Open
						</button>
					</div>
				</div>
			</HTMLContainer>
		)
	}

	override getIndicatorPath(shape: CanvasLinkShape) {
		const path = new Path2D()
		path.roundRect(0, 0, shape.props.w, shape.props.h, 10)
		return path
	}

	override onResize(shape: CanvasLinkShape, info: TLResizeInfo<CanvasLinkShape>) {
		return resizeBox(shape, info)
	}
}
