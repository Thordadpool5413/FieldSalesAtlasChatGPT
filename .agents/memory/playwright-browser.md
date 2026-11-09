---
name: Playwright browser in Replit
description: Use the system Chromium executable when Playwright's managed browser cache is absent.
---

When Playwright cannot find its cached Chromium, this environment provides Chromium at `/repl/tools/bin/chromium`. The browser test and asset-optimization scripts check this path automatically; `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can still override it.

**Why:** Browser checks can fail before test execution when Playwright's cached headless shell is absent, even though system Chromium is available. Mock clocks installed after page load also do not reliably control app timers that were already created.

**How to apply:** Use the configured system-browser fallback instead of adding dependencies. For time-expiry tests, install `page.clock` before navigation so application intervals are created under the controlled clock.
