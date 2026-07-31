// Unit tests for the docs content helpers. Run with `npm test` (node --test).
//
// registry.js itself calls import.meta.glob at the top level, which only Vite
// resolves, so the pure helpers live in markdown.js and are imported directly
// here. The glob-dependent parts (nav tree, slug uniqueness) are enforced at
// build time — registry.js throws on a missing title, an unknown status, a bad
// path shape or a duplicate slug, failing `npm run build` rather than shipping
// broken docs. The filesystem tests below cover the same ground for content.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractHeadings, humanize, parseFrontmatter, slugify, splitOrderPrefix } from './markdown.js'

const here = dirname(fileURLToPath(import.meta.url))

test('parseFrontmatter reads keys and returns the body', () => {
  const { data, body } = parseFrontmatter(
    '---\ntitle: Hello\nstatus: partial\n---\n\n# Hello\n\nBody text.'
  )
  assert.equal(data.title, 'Hello')
  assert.equal(data.status, 'partial')
  assert.equal(body, '# Hello\n\nBody text.')
})

test('parseFrontmatter tolerates colons and quotes in values', () => {
  const { data } = parseFrontmatter('---\ntitle: "Orders: a guide"\n---\nBody')
  assert.equal(data.title, 'Orders: a guide')
})

test('parseFrontmatter handles a document with no frontmatter', () => {
  const { data, body } = parseFrontmatter('# Just a heading')
  assert.deepEqual(data, {})
  assert.equal(body, '# Just a heading')
})

test('slugify produces stable anchor ids', () => {
  assert.equal(slugify('Max daily loss'), 'max-daily-loss')
  assert.equal(slugify('Stop-loss, targets & setup tags'), 'stop-loss-targets-setup-tags')
  assert.equal(slugify('  Spaced   Out  '), 'spaced-out')
})

test('extractHeadings picks up h2 and h3 but not h1', () => {
  const headings = extractHeadings('# Title\n\n## First\n\ntext\n\n### Nested\n\n## Second')
  assert.deepEqual(headings, [
    { depth: 2, text: 'First', id: 'first' },
    { depth: 3, text: 'Nested', id: 'nested' },
    { depth: 2, text: 'Second', id: 'second' },
  ])
})

test('extractHeadings ignores headings inside fenced code blocks', () => {
  const headings = extractHeadings('## Real\n\n```\n## Not a heading\n```\n\n## Also real')
  assert.deepEqual(headings.map(h => h.text), ['Real', 'Also real'])
})

test('splitOrderPrefix separates ordering from the slug', () => {
  assert.deepEqual(splitOrderPrefix('03-market-vs-limit-orders'), [3, 'market-vs-limit-orders'])
  assert.deepEqual(splitOrderPrefix('no-prefix'), [Number.MAX_SAFE_INTEGER, 'no-prefix'])
})

test('humanize turns a folder slug into a section label', () => {
  assert.equal(humanize('trading-desk'), 'Trading desk')
  assert.equal(humanize('market-data-and-brokers'), 'Market data and brokers')
})

test('every docs page has valid frontmatter and a unique slug', () => {
  const sections = readdirSync(here, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)

  assert.ok(sections.length > 0, 'expected at least one docs section folder')

  const slugs = new Set()
  let pageCount = 0

  for (const section of sections) {
    assert.match(section, /^\d+-[a-z0-9-]+$/, `section folder "${section}" must be NN-kebab-case`)

    for (const file of readdirSync(join(here, section)).filter(f => f.endsWith('.md'))) {
      assert.match(file, /^\d+-[a-z0-9-]+\.md$/, `page "${file}" must be NN-kebab-case.md`)

      const { data, body } = parseFrontmatter(readFileSync(join(here, section, file), 'utf8'))
      const where = `${section}/${file}`

      assert.ok(data.title, `${where} is missing a frontmatter title`)
      assert.ok(data.description, `${where} is missing a frontmatter description`)
      assert.ok(
        ['stable', 'partial', 'coming-soon'].includes(data.status || 'stable'),
        `${where} has unknown status "${data.status}"`
      )
      assert.ok(body.length > 0, `${where} has an empty body`)

      const slug = file.replace(/\.md$/, '').replace(/^\d+-/, '')
      assert.ok(!slugs.has(slug), `duplicate docs slug "${slug}" at ${where}`)
      slugs.add(slug)
      pageCount += 1
    }
  }

  assert.ok(pageCount >= 30, `expected at least 30 docs pages, found ${pageCount}`)
})

test('internal /docs links point at pages that exist', () => {
  const slugs = new Set()
  const links = []

  for (const section of readdirSync(here, { withFileTypes: true }).filter(e => e.isDirectory())) {
    for (const file of readdirSync(join(here, section.name)).filter(f => f.endsWith('.md'))) {
      slugs.add(file.replace(/\.md$/, '').replace(/^\d+-/, ''))
      const body = readFileSync(join(here, section.name, file), 'utf8')
      for (const match of body.matchAll(/\]\(\/docs\/([a-z0-9-]+)\)/g)) {
        links.push({ target: match[1], from: `${section.name}/${file}` })
      }
    }
  }

  for (const link of links) {
    assert.ok(slugs.has(link.target), `${link.from} links to missing page /docs/${link.target}`)
  }
})
