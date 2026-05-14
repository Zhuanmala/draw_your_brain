import {
	BaseBoxShapeUtil,
	HTMLContainer,
	T,
	resizeBox,
	type RecordProps,
	type TLBaseShape,
	type TLResizeInfo,
} from 'tldraw'
import type { CSSProperties, MouseEvent, PointerEvent } from 'react'

export const CANVAS_LINK_SHAPE_TYPE = 'canvas-link'
export const OPEN_CANVAS_EVENT = 'draw-your-brain:open-canvas'

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
		const handleOpen = (event: PointerEvent | MouseEvent) => {
			event.stopPropagation()
			window.dispatchEvent(
				new CustomEvent(OPEN_CANVAS_EVENT, {
					detail: {
						accent: shape.props.accent,
						canvasId: shape.props.canvasId,
						title: shape.props.title,
					},
				})
			)
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
					<button
						className="canvas-link-shape-open"
						onClick={handleOpen}
						onPointerDown={(event) => event.stopPropagation()}
						type="button"
					>
						Open
					</button>
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
