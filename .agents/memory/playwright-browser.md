---
name: Playwright browser in Replit
description: Use the system Chromium executable when Playwright's managed browser cache is absent.
---

When Playwright cannot find its cached Chromium, this environment provides Chromium at `/repl/tools/bin/chromium`; set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to that executable for browser checks.

**Why:** Browser checks initially failed before test execution because Playwright's cached headless shell was absent, despite a system Chromium being available.

**How to apply:** Check the configured browser path first; if its default cache is missing, use the system executable override instead of adding or changing project dependencies.
