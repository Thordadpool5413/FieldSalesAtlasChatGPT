---
name: Managed web preview bootstrapping
description: Distinguishes Replit workflow package-manager failures from application build failures.
---

When a managed artifact fails before Vite starts, compare the root `packageManager` pin with the pnpm version available in the runtime. If logs show startup trying to install the pinned version and aborting, check lockfile compatibility and align the pin with the installed runtime rather than changing application code or dependencies. Restart the artifact-owned workflow afterward.

**Why:** This workspace's pinned pnpm version did not match the available runtime. Replit's bootstrap aborted before Vite; aligning the pin let the web workflow start, while the lockfile remained compatible.

**How to apply:** Use workflow logs to distinguish package-manager bootstrap failures from app startup errors. Verify the installed pnpm and lockfile format before changing the root pin; then restart only the managed artifact workflow.
