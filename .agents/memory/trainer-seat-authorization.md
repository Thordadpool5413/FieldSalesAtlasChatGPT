---
name: Trainer-seat authorization
description: Authorization rule for trainer-specific resources accessed through shared workspace links.
---

A trainer bearer link is bound to one seat. Every endpoint that selects seat-specific data must derive or validate that seat from the authorized link, not trust a caller-controlled query or path parameter.

**Why:** A workspace-key middleware can correctly lock the trainer identity while a separate selector such as `slot` still lets a caller access the other trainer's private settings.

**How to apply:** When adding or changing APIs for trainer-specific preferences or other private resources, enforce the seat on both reads and writes, and add an API-level cross-seat denial check.
