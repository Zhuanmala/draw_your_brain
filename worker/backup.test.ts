import assert from 'node:assert/strict'
import test from 'node:test'
import {
	DEFAULT_ROOT_CANVAS_ID,
	createBackupObjectKey,
	createBackupRoomPrefix,
	createSnapshotSummary,
	findLinkedCanvasIds,
	getRoomNamespaceNames,
} from './backup.ts'

const now = '2026-07-05T04:00:00.000Z'

test('createBackupObjectKey uses a stable room folder and sortable timestamp', () => {
	assert.equal(
		createBackupRoomPrefix('draw-your-brain:v3:we-build-it'),
		'backups/draw-your-brain_v3_we-build-it/'
	)
	assert.equal(
		createBackupObjectKey('draw-your-brain:v3:we-build-it', now),
		'backups/draw-your-brain_v3_we-build-it/2026-07-05T04-00-00-000Z.json'
	)
})

test('getRoomNamespaceNames prefers the URL-encoded namespace used by connect paths', () => {
	assert.deepEqual(getRoomNamespaceNames('draw-your-brain:v3:we-build-it'), [
		'draw-your-brain%3Av3%3Awe-build-it',
		'draw-your-brain:v3:we-build-it',
	])
})

test('findLinkedCanvasIds returns unique canvas-link ids from a snapshot', () => {
	const ids = findLinkedCanvasIds({
		documentClock: 3,
		documents: [
			{
				lastChangedClock: 1,
				state: {
					id: 'shape:1',
					typeName: 'shape',
					type: 'canvas-link',
					props: { canvasId: 'child-a' },
				},
			},
			{
				lastChangedClock: 2,
				state: {
					id: 'shape:2',
					typeName: 'shape',
					type: 'canvas-link',
					props: { canvasId: 'child-a' },
				},
			},
			{
				lastChangedClock: 3,
				state: { id: 'shape:3', typeName: 'shape', type: 'note', props: {} },
			},
		],
		tombstoneHistoryStartsAtClock: 1,
	})

	assert.deepEqual(ids, ['child-a'])
})

test('createSnapshotSummary counts documents and custom shape types', () => {
	const summary = createSnapshotSummary(DEFAULT_ROOT_CANVAS_ID, now, {
		documentClock: 2,
		documents: [
			{ lastChangedClock: 1, state: { id: 'shape:1', typeName: 'shape', type: 'note' } },
			{
				lastChangedClock: 2,
				state: { id: 'shape:2', typeName: 'shape', type: 'canvas-link' },
			},
			{ lastChangedClock: 2, state: { id: 'asset:1', typeName: 'asset', type: 'image' } },
		],
		tombstoneHistoryStartsAtClock: 1,
	})

	assert.equal(summary.roomId, DEFAULT_ROOT_CANVAS_ID)
	assert.equal(summary.documentClock, 2)
	assert.equal(summary.documentCount, 3)
	assert.deepEqual(summary.recordsByTypeName, { asset: 1, shape: 2 })
	assert.deepEqual(summary.shapesByType, { 'canvas-link': 1, note: 1 })
})
