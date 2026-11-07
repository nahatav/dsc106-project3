"""Render docs/hero.png from docs/hero-render.html (dark reach map, real data)."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path(__file__).resolve().parents[1] / "docs" / "hero.png"


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge")
        pg = await b.new_page(viewport={"width": 1200, "height": 800}, device_scale_factor=1)
        await pg.goto("http://localhost:9999/hero-render.html", wait_until="networkidle")
        await pg.wait_for_selector("body[data-done='1']", timeout=30000)
        await pg.locator("#stage").screenshot(path=str(OUT))
        await b.close()
    print("wrote", OUT)

asyncio.run(main())
