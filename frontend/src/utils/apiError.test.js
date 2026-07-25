import test from 'node:test'
import assert from 'node:assert/strict'

import { getApiErrorMessage, toDisplayMessage } from './apiError.js'

test('formats FastAPI validation details as render-safe text', () => {
  const detail = [
    { type: 'missing', loc: ['query', 'expiry'], msg: 'Field required', input: null },
    { type: 'string_type', loc: ['body', 'setup_tag'], msg: 'Input should be a valid string', input: {} },
  ]

  assert.equal(
    toDisplayMessage(detail),
    'expiry: Field required; setup_tag: Input should be a valid string',
  )
})

test('extracts nested API messages and falls back for unknown objects', () => {
  assert.equal(
    getApiErrorMessage({ response: { data: { detail: { message: 'Market is closed' } } } }, 'Fallback'),
    'Market is closed',
  )
  assert.equal(toDisplayMessage({ unexpected: true }, 'Fallback'), 'Fallback')
})
