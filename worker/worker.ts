import { handleUnfurlRequest } from 'cloudflare-workers-unfurl'
import type { RoomSnapshot } from '@tldraw/sync-core'
import { AutoRouter, error, type IRequest } from 'itty-router'
import { handleAssetDownload, handleAssetUpload } from './assetUploads'
import {
	DEFAULT_ROOT_CANVAS_ID,
	MAX_BACKUP_ROOMS,
	createAuditObjectKey,
	createBackupObjectKey,
	createBackupRoomPrefix,
	createSnapshotSummary,
	findLinkedCanvasIds,
	getRoomIdForCanvasId,
	getRoomNamespaceNames,
	type BackupPayload,
	type BackupResult,
} from './backup'

export { TldrawDurableObject } from './TldrawDurableObject'

interface SnapshotApiResponse {
	snapshot: RoomSnapshot
}

interface BackupRunResult {
	createdAt: string
	reason: BackupPayload['reason']
	results: BackupResult[]
	rootRoomId: string
	truncated: boolean
}

function assertAdminRequest(request: Request, env: Env) {
	if (!env.BACKUP_TOKEN) {
		return new Response('Admin backup endpoints are not enabled', { status: 404 })
	}

	const authorization = request.headers.get('authorization') ?? ''
	const token = authorization.replace(/^Bearer\s+/i, '').trim()
	if (token !== env.BACKUP_TOKEN) {
		return new Response('Forbidden', { status: 403 })
	}

	return null
}

function isSnapshotApiResponse(value: unknown): value is SnapshotApiResponse {
	return (
		!!value &&
		typeof value === 'object' &&
		Array.isArray((value as SnapshotApiResponse).snapshot?.documents)
	)
}

async function fetchRoomSnapshot(env: Env, roomId: string) {
	const url = new URL(`/api/admin/snapshot/${encodeURIComponent(roomId)}`, 'https://worker.internal')

	for (const namespaceName of getRoomNamespaceNames(roomId)) {
		const id = env.TLDRAW_DURABLE_OBJECT.idFromName(namespaceName)
		const room = env.TLDRAW_DURABLE_OBJECT.get(id)
		const response = await room.fetch(url.toString())

		if (response.status === 404) continue
		if (!response.ok) {
			throw new Error(`Snapshot request failed for ${roomId}: ${response.status}`)
		}

		const payload = (await response.json()) as unknown
		if (!isSnapshotApiResponse(payload)) {
			throw new Error(`Snapshot response was malformed for ${roomId}`)
		}

		return payload.snapshot
	}

	return null
}

async function writeAuditEvent(env: Env, event: string, details: Record<string, unknown>) {
	const createdAt = new Date().toISOString()
	await env.TLDRAW_BUCKET.put(
		createAuditObjectKey(createdAt, event),
		JSON.stringify({ createdAt, event, ...details }, null, 2),
		{
			httpMetadata: { contentType: 'application/json' },
			customMetadata: { event },
		}
	)
}

async function backupRoom(
	env: Env,
	roomId: string,
	createdAt: string,
	reason: BackupPayload['reason']
): Promise<{ result: BackupResult; snapshot: RoomSnapshot | null }> {
	try {
		const snapshot = await fetchRoomSnapshot(env, roomId)
		if (!snapshot) {
			return { result: { roomId, status: 'missing' }, snapshot: null }
		}

		const summary = createSnapshotSummary(roomId, createdAt, snapshot)
		const key = createBackupObjectKey(roomId, createdAt)
		const payload: BackupPayload = { createdAt, reason, roomId, snapshot, summary }

		await env.TLDRAW_BUCKET.put(key, JSON.stringify(payload), {
			httpMetadata: { contentType: 'application/json' },
			customMetadata: {
				documentCount: String(summary.documentCount),
				documentClock: String(summary.documentClock ?? ''),
				reason,
				roomId,
			},
		})

		return {
			result: { documentCount: summary.documentCount, key, roomId, status: 'backed_up' },
			snapshot,
		}
	} catch (exception) {
		const message = exception instanceof Error ? exception.message : String(exception)
		return { result: { error: message, roomId, status: 'failed' }, snapshot: null }
	}
}

async function runBackup(env: Env, reason: BackupPayload['reason']): Promise<BackupRunResult> {
	const createdAt = new Date().toISOString()
	const queue = [DEFAULT_ROOT_CANVAS_ID]
	const seen = new Set(queue)
	const results: BackupResult[] = []
	let truncated = false

	while (queue.length > 0) {
		const roomId = queue.shift()
		if (!roomId) break

		const { result, snapshot } = await backupRoom(env, roomId, createdAt, reason)
		results.push(result)

		if (!snapshot) continue
		for (const canvasId of findLinkedCanvasIds(snapshot)) {
			const linkedRoomId = getRoomIdForCanvasId(canvasId)
			if (seen.has(linkedRoomId)) continue
			if (seen.size >= MAX_BACKUP_ROOMS) {
				truncated = true
				break
			}
			seen.add(linkedRoomId)
			queue.push(linkedRoomId)
		}
	}

	const runResult = { createdAt, reason, results, rootRoomId: DEFAULT_ROOT_CANVAS_ID, truncated }
	await writeAuditEvent(env, 'backup_run', {
		backedUp: results.filter((result) => result.status === 'backed_up').length,
		failed: results.filter((result) => result.status === 'failed').length,
		missing: results.filter((result) => result.status === 'missing').length,
		reason,
		roomCount: results.length,
		truncated,
	})

	return runResult
}

async function handleManualBackup(request: IRequest, env: Env) {
	const denied = assertAdminRequest(request, env)
	if (denied) return denied

	const result = await runBackup(env, 'manual')
	return Response.json(result)
}

async function handleListBackups(request: IRequest, env: Env) {
	const denied = assertAdminRequest(request, env)
	if (denied) return denied

	const url = new URL(request.url)
	const roomId = url.searchParams.get('roomId')
	const limitValue = Number(url.searchParams.get('limit') ?? '100')
	const limit = Number.isFinite(limitValue) ? Math.min(Math.max(limitValue, 1), 1000) : 100
	const prefix = roomId ? createBackupRoomPrefix(roomId) : 'backups/'
	const list = await env.TLDRAW_BUCKET.list({
		cursor: url.searchParams.get('cursor') ?? undefined,
		limit,
		prefix,
	})
	const cursor = list.truncated ? list.cursor : null

	return Response.json({
		cursor,
		objects: list.objects.map((object) => ({
			key: object.key,
			size: object.size,
			uploaded: object.uploaded.toISOString(),
		})),
		prefix,
		truncated: list.truncated,
	})
}

const router = AutoRouter<IRequest, [env: Env, ctx: ExecutionContext]>({
	catch: (exception) => {
		console.error(exception)
		return error(exception)
	},
})
	.get('/api/connect/:roomId', (request, env) => {
		const id = env.TLDRAW_DURABLE_OBJECT.idFromName(request.params.roomId)
		const room = env.TLDRAW_DURABLE_OBJECT.get(id)
		return room.fetch(request.url, { headers: request.headers, body: request.body })
	})
	.post('/api/admin/backups', handleManualBackup)
	.get('/api/admin/backups', handleListBackups)
	.post('/api/uploads/:uploadId', handleAssetUpload)
	.get('/api/uploads/:uploadId', handleAssetDownload)
	.get('/api/unfurl', handleUnfurlRequest)
	.all('*', () => new Response('Not found', { status: 404 }))

export default {
	fetch: router.fetch,
	scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
		ctx.waitUntil(runBackup(env, 'scheduled'))
	},
}
