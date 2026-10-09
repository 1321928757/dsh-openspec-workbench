import assert from 'node:assert/strict'
import test from 'node:test'
import { default as manifest } from '../lib/typert.host.js'
import { apply } from '../lib/index.js'

function validateStrictCodec(pkgName, codec, subject) {
  if (codec.mode !== 'strict') return
  if (typeof codec.typeSymbol !== 'string' || !codec.typeSymbol) throw new Error(`typert-loader: ${pkgName} ${subject} typeSymbol must be a string`)
  if (typeof codec.create !== 'function') throw new Error(`typert-loader: ${pkgName} ${subject} has no create() factory`)
}

test('Typert manifest is loader-compatible', () => {
  assert.equal(manifest.package, 'dsh-openspec-workbench')
  assert.equal(manifest.face, 'host')
  assert.ok(Array.isArray(manifest.schemas))
  assert.ok(Array.isArray(manifest.invocations))
  for (const item of manifest.invocations) {
    assert.equal(item.invocation.kind, 'direct')
    assert.equal(item.result.mode, 'strict')
    assert.equal(typeof item.result.typeSymbol, 'string')
    assert.equal(typeof item.result.create, 'function')
    const resultSchema = item.result.create()
    assert.ok(resultSchema?._zod)
    assert.equal(typeof resultSchema.parse, 'function')
    assert.deepEqual(resultSchema.parse({ ok: true }), { ok: true })
    assert.throws(() => resultSchema.parse(null))
    for (const parameter of item.parameters) {
      assert.equal(typeof parameter.codec.create, 'function')
      assert.deepEqual(parameter.codec.create().parse({ workspaceId: 'w1' }), { workspaceId: 'w1' })
      assert.throws(() => parameter.codec.create().parse([]))
    }
    assert.equal('schema' in item.result, false)
    for (const parameter of item.parameters) assert.equal('schema' in parameter.codec, false)

    const legacyResult = { mode: 'strict', typeSymbol: item.result.typeSymbol, schema: item.result.create() }
    assert.throws(
      () => validateStrictCodec(manifest.package, legacyResult, `invocation "${item.id}" result codec`),
      (error) => error.message === `typert-loader: ${manifest.package} invocation "${item.id}" result codec has no create() factory`,
    )
    const legacyParameter = { mode: 'strict', typeSymbol: item.parameters[0].codec.typeSymbol, schema: item.parameters[0].codec.create() }
    assert.throws(
      () => validateStrictCodec(manifest.package, legacyParameter, `invocation "${item.id}" parameter codec`),
      (error) => error.message === `typert-loader: ${manifest.package} invocation "${item.id}" parameter codec has no create() factory`,
    )
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
