---
name: Workspace API initialization
description: Workspace API requests can race the shell's initial guest or shared-link setup.
---

Private workspace requests may start from page effects during the same render cycle as identity initialization, especially on a directly opened route. Resolve the workspace key by awaiting the existing idempotent initializer before attaching private request parameters. Public geography and aviation endpoints should remain independent of this workspace handshake.

**Why:** A fresh direct travel-page load requested preferences before the shell finished opening its workspace. The client threw “Workspace is still opening” and the route failed to render.

**How to apply:** Keep workspace-aware client methods synchronized with the shared initializer. When adding direct-link pages or changing startup flow, test from a clean browser state. Do not create a second initializer or weaken trainer-seat authorization.
