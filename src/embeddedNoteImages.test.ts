import assert from 'node:assert/strict'
import test from 'node:test'
import { fitSizeInside, getEmbeddedImagePlacements } from './embeddedNoteImages.ts'

test('fitSizeInside preserves aspect ratio and never upscales', () => {
	assert.deepEqual(fitSizeInside({ w: 400, h: 200 }, { w: 160, h: 160 }), { w: 160, h: 80 })
	assert.deepEqual(fitSizeInside({ w: 80, h: 60 }, { w: 160, h: 160 }), { w: 80, h: 60 })
})

test('getEmbeddedImagePlacements centers one image inside note padding', () => {
	assert.deepEqual(
		getEmbeddedImagePlacements({ x: 0, y: 0, w: 200, h: 200 }, [{ w: 400, h: 200 }]),
		[{ x: 18, y: 18, w: 164, h: 82 }]
	)
})

test('getEmbeddedImagePlacements stacks multiple images inside the note', () => {
	const placements = getEmbeddedImagePlacements(
		{ x: 0, y: 0, w: 200, h: 200 },
		[
			{ w: 100, h: 100 },
			{ w: 100, h: 100 },
		],
		{ gap: 10, padding: 20 }
	)

	assert.equal(placements.length, 2)
	assert.equal(placements[0].w, 75)
	assert.equal(placements[0].h, 75)
	assert.equal(placements[0].x, 62.5)
	assert.equal(placements[0].y, 20)
	assert.equal(placements[1].y, 105)
})
