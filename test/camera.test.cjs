'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

let camera

test.before(async () => {
  camera = await import('../monitor/camera.mjs')
})

test('clampScale keeps the configured range', () => {
  assert.equal(camera.clampScale(0.1), 0.3)
  assert.equal(camera.clampScale(9), 3)
  assert.equal(camera.clampScale(1.5), 1.5)
  assert.equal(camera.clampScale(5, 1, 2), 2)
})

test('zoomTransform keeps the world point under the cursor', () => {
  const next = camera.zoomTransform({ scale: 1, tx: 0, ty: 0 }, 100, 50, 2)
  assert.equal(next.scale, 2)
  assert.equal(next.tx, -100)
  assert.equal(next.ty, -50)

  // The point at (100, 50) in viewport coordinates is still over the same
  // diagram point after the zoom: screen = tx + scale * world.
  const worldX = (100 - next.tx) / next.scale
  const worldY = (50 - next.ty) / next.scale
  assert.equal(next.tx + next.scale * worldX, 100)
  assert.equal(next.ty + next.scale * worldY, 50)
})

test('zoomTransform returns the same transform at the scale limit', () => {
  const current = { scale: 3, tx: 10, ty: 20 }
  const next = camera.zoomTransform(current, 0, 0, 2)
  assert.deepEqual(next, current)
})

test('fitTransform centers content and respects maxFit', () => {
  const next = camera.fitTransform(200, 100, 400, 300, { padding: 0, maxFit: 1.5 })
  assert.equal(next.scale, 1.5)
  assert.equal(next.tx, 50)
  assert.equal(next.ty, 75)

  const smaller = camera.fitTransform(100, 50, 400, 300, { padding: 0, maxFit: 2 })
  assert.equal(smaller.scale, 2)
  assert.equal(smaller.tx, 100)
  assert.equal(smaller.ty, 100)
})

test('fitTransform returns null for an empty viewport or content', () => {
  assert.equal(camera.fitTransform(0, 10, 400, 300), null)
  assert.equal(camera.fitTransform(10, 10, 0, 300), null)
})

test('createCamera attaches to an open shadow root and drives the transform', () => {
  const listeners = new Map()
  const style = { setProperty: () => {}, removeProperty: () => {} }
  const canvas = {
    style: {},
    clientWidth: 400,
    clientHeight: 300,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  }
  const diagram = {
    style: {},
    offsetWidth: 200,
    offsetHeight: 100,
    scrollWidth: 200,
    scrollHeight: 100,
  }
  const view = {
    style,
    shadowRoot: {
      querySelector: (selector) => (selector === '.canvas' ? canvas : selector === '.diagram' ? diagram : null),
    },
    classList: { add: () => {}, remove: () => {} },
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
  }
  const changes = []
  global.window = { addEventListener: () => {}, removeEventListener: () => {} }
  global.requestAnimationFrame = (fn) => { fn(); return 1 }
  global.cancelAnimationFrame = () => {}
  global.ResizeObserver = class {
    observe () {}
    disconnect () {}
  }
  try {
    const cam = camera.createCamera(view, { onChange: (scale) => changes.push(scale) })
    assert.equal(cam.attach(), true)
    assert.equal(canvas.style.overflow, 'hidden')
    assert.equal(diagram.style.margin, '0')
    assert.equal(diagram.style.transformOrigin, '0 0')
    assert.match(diagram.style.transform, /scale\(1\.5\)/)
    assert.equal(changes.at(-1), 1.5)

    cam.reset()
    assert.equal(cam.getScale(), 1)
    assert.match(diagram.style.transform, /translate\(100px, 100px\) scale\(1\)/)

    cam.zoomBy(2)
    assert.equal(cam.getScale(), 2)
    cam.zoomBy(4)
    assert.equal(cam.getScale(), 3)
    cam.detach()
  } finally {
    delete global.window
    delete global.requestAnimationFrame
    delete global.cancelAnimationFrame
    delete global.ResizeObserver
  }
})
