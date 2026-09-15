import assert from 'node:assert/strict'
import test from 'node:test'
import { default as manifest } from '../lib/typert.host.js'
import { apply } from '../lib/index.js'

test('Typert manifest is loader-compatible', () => {
  assert.equal(manifest.package, 'dsh-openspec-workbench')
  assert.equal(manifest.face, 'host')
  assert.ok(Array.isArray(manifest.schemas))
  assert.ok(Array.isArray(manifest.invocations))
  for (const item of manifest.invocations) {
    assert.equal(item.invocation.kind, 'direct')
    assert.equal(item.result.mode, 'strict')
    assert.equal(typeof item.result.typeSymbol, 'string')
    assert.ok(item.result.schema?._zod)
    assert.equal(typeof item.result.schema.parse, 'function')
  }
})

test('Host apply publishes a stable Typert binding', () => {
  const provided = new Map()
  const cleanups = []
  apply({
    workspaceRegistry: { list: () => [] },
    fs: {},
    provide: (key, value) => provided.set(key, value),
    effect: (factory) => cleanups.push(factory()),
  })
  const service = provided.get('openspecWorkbench')
  assert.ok(service)
  assert.equal(service.typertRemote.service, service)
  assert.equal(service.typertRemote.serviceKey, 'openspecWorkbench')
  assert.equal(service.typertRemote.namespace, 'openspec-workbench')
  for (const cleanup of cleanups) if (typeof cleanup === 'function') cleanup()
})
