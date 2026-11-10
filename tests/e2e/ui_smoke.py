"""
Optional end-to-end smoke test of the web UI in a real browser.

    pip install playwright && playwright install chromium
    npm run build
    python tests/e2e/ui_smoke.py            # optional: CHROME_PATH=/path/to/chrome

It starts the app on a free port with a throw-away state folder, drives the three
steps (files -> rename -> confirm), checks the files on disk, then undoes.
"""
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[2]


def start_server(state_dir: str) -> tuple[subprocess.Popen, str]:
    env = {**os.environ, "FILE_RENAMER_HOME": state_dir}
    proc = subprocess.Popen(
        ["node", str(ROOT / "dist" / "cli" / "main.js"), "ui", "--no-open"],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env,
    )
    assert proc.stdout is not None
    for line in proc.stdout:
        match = re.search(r"(http://127\.0\.0\.1:\d+/#t=[\w-]+)", line)
        if match:
            return proc, match.group(1)
    raise RuntimeError("server did not start")


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        photos = Path(tmp, "photos")
        photos.mkdir()
        for i in range(1, 13):
            (photos / f"IMG_{i}.JPG").write_text(f"photo{i}")
        (photos / "notes.txt").write_text("n")
        original = sorted(p.name for p in photos.iterdir())

        proc, url = start_server(str(Path(tmp, "state")))
        launch = {"args": ["--no-sandbox"]}
        if os.environ.get("CHROME_PATH"):
            launch["executable_path"] = os.environ["CHROME_PATH"]
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(**launch)
                page = browser.new_page()
                problems: list[str] = []
                page.on("pageerror", lambda e: problems.append(str(e)))
                page.on("dialog", lambda d: (problems.append(f"dialog: {d.message}"), d.dismiss()))

                # Step 1: choose the folder, filter, deselect one file
                page.goto(url)
                page.fill(".path-input", str(photos))
                page.click("text=Carica file")
                page.fill("input[aria-label='Solo queste estensioni']", "jpg")
                expect(page.locator(".list-head strong")).to_have_text(re.compile(r"^12 di 12"))
                page.uncheck("input[aria-label='Includi IMG_12.JPG']")
                page.get_by_role("button", name=re.compile(r"Avanti con 11 file")).click()

                # Step 2: free name, automatic digits
                page.fill("input[aria-label='Nome dei file']", "Vacanza")
                expect(page.locator("table.preview td.cell-new").first).to_have_text(re.compile(r"Vacanza_01\.JPG"))
                page.get_by_role("button", name=re.compile(r"Avanti: rivedi 11 file")).click()

                # Step 3: confirm
                page.get_by_role("button", name="Rinomina 11 file").click()
                expect(page.locator(".result .big")).to_contain_text("11 file rinominati")
                names = sorted(p.name for p in photos.iterdir())
                assert "Vacanza_01.JPG" in names and "Vacanza_11.JPG" in names, names
                assert "IMG_12.JPG" in names and "notes.txt" in names, names

                # Undo
                page.get_by_role("button", name="Annulla questa rinomina").click()
                expect(page.locator(".result .big")).to_contain_text("Ripristinati 11 file")
                assert sorted(p.name for p in photos.iterdir()) == original
                browser.close()
            assert not problems, problems
        finally:
            proc.terminate()
            proc.wait(timeout=5)
    print("UI smoke test: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
