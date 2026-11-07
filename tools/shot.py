"""Screenshot the local preview with headless Edge: python tools/shot.py out.png [selector] [width]"""
import sys, asyncio
from playwright.async_api import async_playwright

async def main(out, sel=None, width=1280):
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge")
        pg = await b.new_page(viewport={"width": int(width), "height": 900}, device_scale_factor=1, reduced_motion="reduce")
        await pg.goto("http://localhost:9999/", wait_until="networkidle")
        await pg.wait_for_timeout(3500)
        if sel:
            await pg.locator(sel).screenshot(path=out)
        else:
            await pg.screenshot(path=out, full_page=True)
        errs = []
        await b.close()

asyncio.run(main(*sys.argv[1:]))
