import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')

test('christiane can sign in with password 123456', () => {
	assert.match(appSource, /christiane:\s*['"]123456['"]/)
})
