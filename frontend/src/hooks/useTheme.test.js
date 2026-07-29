import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AQUA_LIGHT_THEME,
  DARK_THEME,
  applyTheme,
  getPreferredLightTheme,
  getStoredTheme,
} from './useTheme.js'

test('registers Aqua Cloud as a persisted light theme', (context) => {
  const previous = {
    CustomEvent: globalThis.CustomEvent,
    document: globalThis.document,
    localStorage: globalThis.localStorage,
    window: globalThis.window,
  }
  const values = new Map()
  const classes = new Set()

  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
  globalThis.document = {
    documentElement: {
      classList: {
        contains: name => classes.has(name),
        toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
      },
      dataset: {},
    },
  }
  globalThis.window = {
    dispatchEvent: () => {},
  }
  globalThis.CustomEvent = class {
    constructor(type, init) {
      this.type = type
      this.detail = init?.detail
    }
  }

  context.after(() => {
    globalThis.CustomEvent = previous.CustomEvent
    globalThis.document = previous.document
    globalThis.localStorage = previous.localStorage
    globalThis.window = previous.window
  })

  assert.equal(applyTheme(AQUA_LIGHT_THEME), AQUA_LIGHT_THEME)
  assert.equal(getStoredTheme(), AQUA_LIGHT_THEME)
  assert.equal(getPreferredLightTheme(), AQUA_LIGHT_THEME)
  assert.equal(document.documentElement.dataset.theme, AQUA_LIGHT_THEME)
  assert.equal(classes.has(AQUA_LIGHT_THEME), true)

  applyTheme(DARK_THEME)
  assert.equal(classes.has(AQUA_LIGHT_THEME), false)
  assert.equal(classes.has(DARK_THEME), true)
  assert.equal(getPreferredLightTheme(), AQUA_LIGHT_THEME)
})
