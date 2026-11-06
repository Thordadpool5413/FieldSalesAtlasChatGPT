---
name: Python toolchain rebuilds
description: Replit Python runtime or package changes may block managed workflow restarts while the environment rebuilds.
---

Treat optional Python features as a risk to already-running app workflows. Installing and then removing a Python module, followed by package installation attempts, left the API workflow waiting on environment rebuilds even though the app packages had typechecked and built. Several longer managed restarts did not recover it.

**Why:** an optional optimizer setup interrupted the working API preview, while the Python dependencies remained unavailable.

**How to apply:** only change system language modules when the requested app depends on them; prefer project dependencies where possible. If managed restarts keep timing out at environment rebuild, stop retrying and report that blocker rather than launching an unmanaged server.
