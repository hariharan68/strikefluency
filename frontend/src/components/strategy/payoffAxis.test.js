import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPayoffPriceAxis } from './payoffAxis.js'

test('builds the requested dynamic 200-point NIFTY axis', () => {
  const axis = buildPayoffPriceAxis({ spot: 24342, strikeStep: 50 })

  assert.equal(axis.tickGap, 200)
  assert.deepEqual(axis.ticks, [23600, 23800, 24000, 24200, 24400, 24600, 24800, 25000])
  assert.deepEqual(axis.domain, [23600, 25000])
})

test('moves the aligned range with spot instead of keeping static labels', () => {
  const axis = buildPayoffPriceAxis({ spot: 24610, strikeStep: 50 })

  assert.deepEqual(axis.ticks, [23800, 24000, 24200, 24400, 24600, 24800, 25000, 25200])
})

test('keeps the strike-aligned gap while zooming into fewer intervals', () => {
  const medium = buildPayoffPriceAxis({ spot: 24342, strikeStep: 50, zoom: 2 })
  const close = buildPayoffPriceAxis({ spot: 24342, strikeStep: 50, zoom: 4 })

  assert.deepEqual(medium.ticks, [23800, 24000, 24200, 24400, 24600, 24800])
  assert.deepEqual(close.ticks, [24000, 24200, 24400, 24600])
})
