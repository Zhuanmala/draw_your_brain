import type { RoomSnapshot } from '@tldraw/sync-core'

export const SYNC_ROOM_PREFIX = 'draw-your-brain:v3'
export const DEFAULT_ROOT_CANVAS_ID = `${SYNC_ROOM_PREFIX}:we-build-it`
export const MAX_BACKUP_ROOMS = 200

export interface SnapshotSummary {
	createdAt: string
	documentClock: number | null
	documentCount: number
	recordsByTypeName: Record<string, number>
	roomId: string
	shapesByType: Record<string, number>
	tombstoneCount: number
}

export interface BackupPayload {
	createdAt: string
	reason: 'manual' | 'scheduled'
	roomId: string
	snapshot: RoomSnapshot
	summary: SnapshotSummary
}

export interface BackupResult {
	documentCount?: number
	error?: string
	key?: string
	roomId: string
	status: 'backed_up' | 'failed' | 'missing'
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

export function getRoomIdForCanvasId(canvasId: string) {
	return canvasId.startsWith(`${SYNC_ROOM_PREFIX}:`) ? canvasId : `${SYNC_ROOM_PREFIX}:${canvasId}`
}

export function getRoomNamespaceNames(roomId: string) {
	const encodedRoomId = encodeURIComponent(roomId)
	return encodedRoomId === roomId ? [roomId] : [encodedRoomId, roomId]
}

export function createBackupRoomPrefix(roomId: string) {
	const roomPath = roomId.replace(/[^A-Za-z0-9._-]/g, '_')
	return `backups/${roomPath}/`
}

export function createBackupObjectKey(roomId: string, createdAt: string) {
	const timestamp = createdAt.replace(/[:.]/g, '-')
	return `${createBackupRoomPrefix(roomId)}${timestamp}.json`
}

export function createAuditObjectKey(createdAt: string, event: string) {
	const day = createdAt.slice(0, 10)
	const timestamp = createdAt.replace(/[:.]/g, '-')
	const suffix = crypto.randomUUID()
	return `audit/${day}/${timestamp}-${event}-${suffix}.json`
}

export function createSnapshotSummary(
	roomId: string,
	createdAt: string,
	snapshot: RoomSnapshot
): SnapshotSummary {
	const recordsByTypeName: Record<string, number> = {}
	const shapesByType: Record<string, number> = {}

	for (const document of snapshot.documents) {
		const state = asRecord(document.state)
		const typeName = typeof state?.typeName === 'string' ? state.typeName : 'unknown'
		recordsByTypeName[typeName] = (recordsByTypeName[typeName] ?? 0) + 1

		if (typeName === 'shape') {
			const shapeType = typeof state?.type === 'string' ? state.type : 'unknown'
			shapesByType[shapeType] = (shapesByType[shapeType] ?? 0) + 1
		}
	}

	return {
		createdAt,
		documentClock: snapshot.documentClock ?? snapshot.clock ?? null,
		documentCount: snapshot.documents.length,
		recordsByTypeName,
		roomId,
		shapesByType,
		tombstoneCount: snapshot.tombstones ? Object.keys(snapshot.tombstones).length : 0,
	}
}

export function findLinkedCanvasIds(snapshot: RoomSnapshot) {
	const canvasIds = new Set<string>()

	for (const document of snapshot.documents) {
		const state = asRecord(document.state)
		if (state?.typeName !== 'shape' || state.type !== 'canvas-link') continue

		const props = asRecord(state.props)
		const canvasId = props?.canvasId
		if (typeof canvasId === 'string' && canvasId.trim()) {
			canvasIds.add(canvasId)
		}
	}

	return [...canvasIds]
}
