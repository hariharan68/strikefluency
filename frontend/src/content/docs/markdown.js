// Pure markdown helpers used by the docs registry.
//
// These live apart from registry.js because that module calls import.meta.glob
// at the top level, which only Vite can resolve — keeping the pure functions
// here means they can be imported and unit-tested under plain node.

// Minimal frontmatter reader. Handles `key: value` pairs between the opening
// and closing `---` fences — enough for title/description/status, and small
// enough that a gray-matter dependency isn't worth it.
export function parseFrontmatter(raw) {
  const normalized = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---\n')) return { data: {}, body: normalized.trim() }

  const end = normalized.indexOf('\n---', 3)
  if (end === -1) return { data: {}, body: normalized.trim() }

  const data = {}
  for (const line of normalized.slice(4, end).split('\n')) {
    const separator = line.indexOf(':')
    if (separator === -1) continue
    const key = line.slice(0, separator).trim()
    if (!key) continue
    // Tolerate quoted values so titles may contain a colon.
    data[key] = line.slice(separator + 1).trim().replace(/^["']|["']$/g, '')
  }

  const bodyStart = normalized.indexOf('\n', end + 1)
  return { data, body: bodyStart === -1 ? '' : normalized.slice(bodyStart + 1).trim() }
}

// Turns heading text into an anchor id. DocsTOC and MarkdownRenderer both call
// this, which is what keeps the TOC links and the rendered ids in sync.
export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

// Pulls h2/h3 headings for the "On this page" rail. Fenced code blocks are
// skipped so a commented-out "## foo" inside one never becomes an entry.
export function extractHeadings(body) {
  const headings = []
  let inFence = false
  for (const line of body.split('\n')) {
    if (/^\s*```/.test(line)) { inFence = !inFence; continue }
    if (inFence) continue
    const match = /^(#{2,3})\s+(.+?)\s*$/.exec(line)
    if (!match) continue
    const text = match[2].replace(/[*`_]/g, '').trim()
    headings.push({ depth: match[1].length, text, id: slugify(text) })
  }
  return headings
}

// Strips markdown syntax down to prose, for search snippets and scoring.
export function toPlainText(body) {
  return body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*[|>#-]+\s*/gm, ' ')
    // Table cell separators become spaces, so a snippet from a table reads as
    // prose rather than as a row of pipes.
    .replace(/\s*\|\s*/g, ' ')
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Strips a leading "NN-" ordering prefix and returns [order, rest].
export function splitOrderPrefix(name) {
  const match = /^(\d+)-(.*)$/.exec(name)
  if (!match) return [Number.MAX_SAFE_INTEGER, name]
  return [Number(match[1]), match[2]]
}

// "trading-desk" -> "Trading desk". Only the first word is capitalised so
// section labels read as sentences, not Title Case.
export function humanize(slug) {
  const words = slug.split('-').join(' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
