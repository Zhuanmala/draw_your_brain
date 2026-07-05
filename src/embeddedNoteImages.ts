export interface RectLike {
	h: number
	w: number
	x: number
	y: number
}

export interface EmbeddedImageInput {
	h: number
	w: number
}

export interface EmbeddedImagePlacement extends RectLike {}

const DEFAULT_NOTE_IMAGE_PADDING = 18
const DEFAULT_NOTE_IMAGE_GAP = 8

export function fitSizeInside(
	size: { h: number; w: number },
	max: { h: number; w: number }
) {
	const width = Math.max(1, size.w)
	const height = Math.max(1, size.h)
	const maxWidth = Math.max(1, max.w)
	const maxHeight = Math.max(1, max.h)
	const scale = Math.min(maxWidth / width, maxHeight / height, 1)

	return {
		h: height * scale,
		w: width * scale,
	}
}

export function getEmbeddedImagePlacements(
	noteBounds: RectLike,
	images: EmbeddedImageInput[],
	options: { gap?: number; padding?: number } = {}
): EmbeddedImagePlacement[] {
	if (images.length === 0) return []

	const padding = options.padding ?? DEFAULT_NOTE_IMAGE_PADDING
	const gap = options.gap ?? DEFAULT_NOTE_IMAGE_GAP
	const innerX = noteBounds.x + padding
	const innerY = noteBounds.y + padding
	const innerW = Math.max(1, noteBounds.w - padding * 2)
	const innerH = Math.max(1, noteBounds.h - padding * 2)
	const slotH = Math.max(1, (innerH - gap * (images.length - 1)) / images.length)
	let y = innerY

	return images.map((image) => {
		const fitted = fitSizeInside(image, { h: slotH, w: innerW })
		const placement = {
			h: fitted.h,
			w: fitted.w,
			x: innerX + (innerW - fitted.w) / 2,
			y,
		}
		y += slotH + gap
		return placement
	})
}
