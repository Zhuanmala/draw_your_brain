import {
	DEFAULT_INITIAL_SNAPSHOT,
	DurableObjectSqliteSyncWrapper,
	SQLiteSyncStorage,
	TLSocketRoom,
	type SessionStateSnapshot,
} from '@tldraw/sync-core'
import {
	createTLSchema,
	defaultBindingSchemas,
	defaultShapeSchemas,
	type TLRecord,
} from '@tldraw/tlschema'
import { createMigrationSequence } from '@tldraw/store'
import { T } from '@tldraw/validate'
import { DurableObject } from 'cloudflare:workers'
import { AutoRouter, error, type IRequest } from 'itty-router'

const schema = createTLSchema({
	shapes: {
		...defaultShapeSchemas,
		'canvas-link': {
			props: {
				w: T.number,
				h: T.number,
				canvasId: T.string,
				title: T.string,
				accent: T.string,
			},
			migrations: createMigrationSequence({
				sequenceId: 'com.tldraw.shape.canvas-link',
				sequence: [],
			}),
		},
	},
	bindings: { ...defaultBindingSchemas },
})

const INITIAL_ROOM_SNAPSHOT = {
	documentClock: 1,
	tombstoneHistoryStartsAtClock: 1,
	schema: schema.serialize(),
	documents: DEFAULT_INITIAL_SNAPSHOT.documents.map((document) => ({
		...document,
		lastChangedClock: 1,
	})),
}

interface SocketAttachment {
	sessionId: string
	snapshot: SessionStateSnapshot | null
}

export class TldrawDurableObject extends DurableObject {
	private room: TLSocketRoom<TLRecord, void> | null = null
	private storage: SQLiteSyncStorage<TLRecord> | null = null
	private readonly sessionIdToWs = new Map<string, WebSocket>()

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env)
		this.ctx.setWebSocketAutoResponse(
			new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}')
		)
	}

	private getOrCreateStorage() {
		if (!this.storage) {
			const sql = new DurableObjectSqliteSyncWrapper(this.ctx.storage)
			this.storage = new SQLiteSyncStorage<TLRecord>({
				sql,
				snapshot: SQLiteSyncStorage.hasBeenInitialized(sql) ? undefined : INITIAL_ROOM_SNAPSHOT,
			})
		}

		return this.storage
	}

	private getExistingSnapshot() {
		if (this.storage) return this.storage.getSnapshot()

		const sql = new DurableObjectSqliteSyncWrapper(this.ctx.storage)
		if (!SQLiteSyncStorage.hasBeenInitialized(sql)) return null

		this.storage = new SQLiteSyncStorage<TLRecord>({ sql })
		return this.storage.getSnapshot()
	}

	private getOrCreateRoom(): TLSocketRoom<TLRecord, void> {
		if (!this.room) {
			this.room = new TLSocketRoom<TLRecord, void>({
				schema,
				storage: this.getOrCreateStorage(),
				clientTimeout: Infinity,
				onSessionSnapshot: (sessionId, snapshot) => {
					const ws = this.sessionIdToWs.get(sessionId)
					if (ws) ws.serializeAttachment({ sessionId, snapshot })
				},
			})

			for (const ws of this.ctx.getWebSockets()) {
				const attachment = ws.deserializeAttachment() as SocketAttachment | null
				if (!attachment?.sessionId) continue

				if (attachment.snapshot) {
					this.room.handleSocketResume({
						sessionId: attachment.sessionId,
						socket: ws,
						snapshot: attachment.snapshot,
					})
				}
			}
		}

		return this.room
	}

	private readonly router = AutoRouter({ catch: (e) => error(e) })
		.get('/api/connect/:roomId', (request) => this.handleConnect(request))
		.get('/api/admin/snapshot/:roomId', (request) => this.handleSnapshot(request))

	fetch(request: Request): Response | Promise<Response> {
		return this.router.fetch(request)
	}

	async handleConnect(request: IRequest) {
		const sessionId = request.query.sessionId as string
		if (!sessionId) return error(400, 'Missing sessionId')

		const { 0: clientWebSocket, 1: serverWebSocket } = new WebSocketPair()
		this.ctx.acceptWebSocket(serverWebSocket)
		serverWebSocket.serializeAttachment({ sessionId, snapshot: null } satisfies SocketAttachment)

		this.getOrCreateRoom().handleSocketConnect({ sessionId, socket: serverWebSocket })

		return new Response(null, { status: 101, webSocket: clientWebSocket })
	}

	handleSnapshot(request: IRequest) {
		const snapshot = this.getExistingSnapshot()
		if (!snapshot) return error(404, `Room has no stored snapshot: ${request.params.roomId}`)

		return Response.json({ snapshot })
	}

	private getSessionId(ws: WebSocket) {
		const attachment = ws.deserializeAttachment() as SocketAttachment | null
		return attachment?.sessionId ?? null
	}

	override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		const sessionId = this.getSessionId(ws)
		if (!sessionId) return

		this.sessionIdToWs.set(sessionId, ws)
		this.getOrCreateRoom().handleSocketMessage(sessionId, message)
	}

	override async webSocketClose(ws: WebSocket) {
		this.handleWebSocketEnd(ws, 'handleSocketClose')
	}

	override async webSocketError(ws: WebSocket) {
		this.handleWebSocketEnd(ws, 'handleSocketError')
	}

	private handleWebSocketEnd(ws: WebSocket, method: 'handleSocketClose' | 'handleSocketError') {
		const attachment = ws.deserializeAttachment() as SocketAttachment | null
		if (!attachment?.sessionId) return

		this.sessionIdToWs.delete(attachment.sessionId)

		const room = this.getOrCreateRoom()
		if (attachment.snapshot && !room.getSessionSnapshot(attachment.sessionId)) {
			room.handleSocketResume({
				sessionId: attachment.sessionId,
				socket: ws,
				snapshot: attachment.snapshot,
			})
		}

		room[method](attachment.sessionId)
	}
}
