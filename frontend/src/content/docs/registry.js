// Documentation content registry.
//
// Every .md file under this directory becomes a docs page. Section and ordering
// come from the folder/file names, so adding a page needs no edit here:
//
//   01-getting-started/02-create-your-account.md
//   └─ section "Getting started" (order 1), slug "create-your-account" (order 2)
//
// Loading is eager on purpose. DocsPage is a lazy() route, so all of this lands
// in the docs chunk and is only fetched when someone opens /docs — and having it
// resolved up front means the sidebar tree and the search index need no waterfall.
const files = import.meta.glob('./**/*.md', { query: '?raw', import: 'default', eager: true })

const VALID_STATUS = new Set(['stable', 'partial', 'coming-soon'])

// Pure helpers live in markdown.js so they can be unit-tested under plain node
// — this module's top-level glob call only resolves inside Vite.
import {
  extractHeadings,
  humanize,
  parseFrontmatter,
  slugify,
  splitOrderPrefix,
  toPlainText,
} from './markdown'

export { extractHeadings, parseFrontmatter, slugify }

function buildPages() {
  const pages = []

  for (const [path, raw] of Object.entries(files)) {
    // './01-getting-started/02-create-your-account.md'
    const parts = path.replace(/^\.\//, '').replace(/\.md$/, '').split('/')
    if (parts.length !== 2) {
      throw new Error(`Docs file must live in exactly one section folder: ${path}`)
    }

    const [sectionOrder, sectionSlug] = splitOrderPrefix(parts[0])
    const [pageOrder, slug] = splitOrderPrefix(parts[1])
    const { data, body } = parseFrontmatter(raw)

    if (!data.title) throw new Error(`Docs page is missing a frontmatter title: ${path}`)
    const status = data.status || 'stable'
    if (!VALID_STATUS.has(status)) {
      throw new Error(`Unknown status "${status}" in ${path} (expected ${[...VALID_STATUS].join(', ')})`)
    }

    pages.push({
      path,
      slug,
      title: data.title,
      description: data.description || '',
      status,
      section: humanize(sectionSlug),
      sectionSlug,
      sectionOrder,
      pageOrder,
      body,
      headings: extractHeadings(body),
      text: toPlainText(body),
    })
  }

  pages.sort((a, b) => a.sectionOrder - b.sectionOrder || a.pageOrder - b.pageOrder)

  const seen = new Set()
  for (const page of pages) {
    if (seen.has(page.slug)) throw new Error(`Duplicate docs slug: ${page.slug}`)
    seen.add(page.slug)
  }

  return pages
}

export const pages = buildPages()

const bySlug = new Map(pages.map(page => [page.slug, page]))

export function getPage(slug) {
  return bySlug.get(slug) || null
}

// Sections in order, each with its pages — drives the sidebar.
export const navTree = pages.reduce((sections, page) => {
  let section = sections.find(s => s.slug === page.sectionSlug)
  if (!section) {
    section = { slug: page.sectionSlug, label: page.section, pages: [] }
    sections.push(section)
  }
  section.pages.push(page)
  return sections
}, [])

export const firstPage = pages[0] || null

export function adjacentPages(slug) {
  const index = pages.findIndex(page => page.slug === slug)
  if (index === -1) return { prev: null, next: null }
  return { prev: pages[index - 1] || null, next: pages[index + 1] || null }
}

// Scored search over titles, headings and body prose. Small enough that pulling
// in a search library would cost more than it saves.
export function searchDocs(query, limit = 8) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return []

  const results = []

  for (const page of pages) {
    const title = page.title.toLowerCase()
    const description = page.description.toLowerCase()
    const text = page.text.toLowerCase()
    const headings = page.headings.map(h => h.text.toLowerCase()).join(' ')

    let score = 0
    let matchedAll = true

    for (const term of terms) {
      let termScore = 0
      if (title.startsWith(term)) termScore += 60
      else if (title.includes(term)) termScore += 40
      if (headings.includes(term)) termScore += 18
      if (description.includes(term)) termScore += 10
      if (text.includes(term)) termScore += 6
      if (termScore === 0) { matchedAll = false; break }
      score += termScore
    }

    if (!matchedAll) continue

    // Snippet around the first body hit, so results show why they matched.
    let snippet = page.description
    const hit = text.indexOf(terms[0])
    if (hit !== -1) {
      const start = Math.max(0, hit - 60)
      snippet = `${start > 0 ? '…' : ''}${page.text.slice(start, start + 160).trim()}…`
    }

    results.push({ page, score, snippet })
  }

  return results.sort((a, b) => b.score - a.score || a.page.title.localeCompare(b.page.title)).slice(0, limit)
}
