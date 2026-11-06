---
name: Managed web preview bootstrapping
description: Distinguishes Replit workflow package-manager failures from application build failures.
---

When a managed web workflow fails during package-manager provisioning before the app server starts, validate the artifact's TypeScript check and direct build separately before changing application code. Do not alter the workspace package-manager pin unless logs establish that the pin itself is the cause and the wider workspace impact is understood.

**Why:** A managed workflow failed in pnpm bootstrap in this workspace while the artifact typecheck and direct Vite build succeeded. The failure was outside the UI source change.

**How to apply:** On future web changes, check whether Vite actually started in the workflow logs. If not, verify source with the artifact's checks and treat workflow provisioning as a separate issue.
