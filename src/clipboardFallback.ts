interface ClipboardFileLike {
	type: string
}

interface ClipboardDataLike {
	files: ArrayLike<ClipboardFileLike>
	getData(type: string): string
}

export function hasTldrawClipboardMarker(text: string) {
	return /<div data-tldraw[^>]*>/.test(text)
}

export function isRecentCachedTldrawCopy(copiedAt: number | null, now: number, maxAgeMs: number) {
	return copiedAt !== null && now - copiedAt <= maxAgeMs
}

export function shouldPasteCachedTldrawContentWhileEditing({
	clipboardData,
	copiedAt,
	maxAgeMs,
	now,
}: {
	clipboardData: ClipboardDataLike | null
	copiedAt: number | null
	maxAgeMs: number
	now: number
}) {
	if (!isRecentCachedTldrawCopy(copiedAt, now, maxAgeMs)) return false
	if (!clipboardData) return true

	for (const file of Array.from(clipboardData.files)) {
		if (file.type.startsWith('image/') || file.type.startsWith('video/')) return false
	}

	const html = clipboardData.getData('text/html')
	if (hasTldrawClipboardMarker(html)) return true
	if (html.trim()) return false

	const text = clipboardData.getData('text/plain')
	if (hasTldrawClipboardMarker(text)) return true
	if (text.trim()) return false

	return true
}
