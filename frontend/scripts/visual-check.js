import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const routes = [
  { name: 'register', url: 'http://127.0.0.1:5173/register' },
  { name: 'login', url: 'http://127.0.0.1:5173/login' }
]

const screenshotsDir = path.join(process.cwd(), 'screenshots')
mkdirSync(screenshotsDir, { recursive: true })

const browser = await chromium.launch()

try {
  for (const route of routes) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const response = await page.goto(route.url, { waitUntil: 'networkidle' })

    if (!response?.ok()) {
      throw new Error(`${route.name} returned HTTP ${response?.status() ?? 'unknown'}`)
    }

    const outPath = path.join(screenshotsDir, `${route.name}.png`)
    await page.screenshot({ path: outPath, fullPage: true })
    console.log(`Saved ${outPath}`)
    await page.close()
  }
} finally {
  await browser.close()
}
