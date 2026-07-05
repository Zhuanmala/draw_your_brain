import assert from 'node:assert/strict'
import test from 'node:test'
import {
	hasTldrawClipboardMarker,
	isRecentCachedTldrawCopy,
	shouldPasteCachedTldrawContentWhileEditing,
} from './clipboardFallback.ts'

function clipboardData({
	files = [],
	html = '',
	text = '',
}: {
	files?: { type: string }[]
	html?: string
	text?: string
}) {
	return {
		files,
		getData(type: string) {
			if (type === 'text/html') return html
			if (type === 'text/plain') return text
			return ''
		},
	}
}

test('hasTldrawClipboardMarker detects copied tldraw html', () => {
	assert.equal(hasTldrawClipboardMarker('<div data-tldraw>{"shapes":[]}</div>'), true)
	assert.equal(hasTldrawClipboardMarker('<p>hello</p>'), false)
})

test('isRecentCachedTldrawCopy rejects stale copies', () => {
	assert.equal(isRecentCachedTldrawCopy(1000, 1200, 500), true)
	assert.equal(isRecentCachedTldrawCopy(1000, 2000, 500), false)
	assert.equal(isRecentCachedTldrawCopy(null, 1200, 500), false)
})

test('shouldPasteCachedTldrawContentWhileEditing accepts tldraw marker and empty clipboard', () => {
	assert.equal(
		shouldPasteCachedTldrawContentWhileEditing({
			clipboardData: clipboardData({ html: '<div data-tldraw>{}</div>', text: 'shape text' }),
			copiedAt: 1000,
			maxAgeMs: 500,
			now: 1100,
		}),
		true
	)
	assert.equal(
		shouldPasteCachedTldrawContentWhileEditing({
			clipboardData: clipboardData({}),
			copiedAt: 1000,
			maxAgeMs: 500,
			now: 1100,
		}),
		true
	)
})

test('shouldPasteCachedTldrawContentWhileEditing leaves normal text and real image files alone', () => {
	assert.equal(
		shouldPasteCachedTldrawContentWhileEditing({
			clipboardData: clipboardData({ text: 'normal text' }),
			copiedAt: 1000,
			maxAgeMs: 500,
			now: 1100,
		}),
		false
	)
	assert.equal(
		shouldPasteCachedTldrawContentWhileEditing({
			clipboardData: clipboardData({ files: [{ type: 'image/png' }] }),
			copiedAt: 1000,
			maxAgeMs: 500,
			now: 1100,
		}),
		false
	)
})
