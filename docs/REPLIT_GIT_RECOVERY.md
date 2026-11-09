# Replit and GitHub synchronization

## PostgreSQL setup recovery

The recovery bundle `atlas-replit-recovery-78c2589.bundle` preserves the exact
Replit commit **78c25893ef00bffb640f50a89dca87dcab950c5c**, based on **c3cc706**.
It contains the two publication marker commits, Flight DNA wording changes, the
on-demand aircraft observation panel/provider and generated API definitions.
The reconciliation merges that actual history with the PostgreSQL/backup/routing
setup at **2c9e1fc**. Both tips remain ancestors; no force push or replacement of
the local Replit branch is needed.

Validation also preserves unknown ADS-B numeric fields instead of converting null
to zero, rejects missing/old position ages, and checks the production gate using
Replit's deployment flag as well as `NODE_ENV`. Aircraft observations stay separate
from airline or booking status. The panel labels position ages relative to its
snapshot check and shows the provider timestamp separately from retrieval time.
These changes do not provision any external provider or publish the application.

Keep Agent and source edits paused, stop Run and any Shell app, then run:

```bash
git pull --ff-only origin main &&
git status -sb &&
git log -1 --oneline &&
pnpm install --frozen-lockfile
```

This can fast-forward a clean Replit checkout still at `78c2589`. If Agent creates
another commit afterward, inspect and preserve that newer history first. The
downloaded `.bundle` recovery file is now ignored so it stays out of source commits.
Continue with [Replit setup](operations/REPLIT_SETUP.md) only after synchronization.
Pulling does not migrate data or publish the app.

### When the recovery push lacks GitHub workflow scope

An OAuth recovery push can be rejected when its workflow files differ from those
on GitHub main, even if the local commits do not edit workflows. Do not remove CI
or rewrite the source history to make that transfer succeed. A Git bundle can
transfer the committed history directly to the authorized reconciliation checkout:

```bash
git bundle create atlas-replit-recovery.bundle HEAD ^origin/main &&
git bundle verify atlas-replit-recovery.bundle
```

The receiver must have the prerequisite commit printed by `git bundle verify`.
Transfer the file privately; it contains Git-tracked history, not uncommitted or
ignored workspace files. Verify it again in the receiving repository, import its
HEAD into a recovery ref, and merge/validate before updating main. Creating a bundle
leaves the sender's branch and tracked files untouched. Use a fresh file name for
a later snapshot.

## Earlier recovery history

GitHub main combines the backend reliability changes at **6a4328f** with the
complete Replit snapshot at **c5ccd68**. That snapshot includes the four local
Replit commits ending at **4dd8059**, plus the saved Flight DNA CSS, generated
mockup registry and both mockup source files. It was uploaded through
`replit-recovery-after-6a4328f` and merged by GitHub PR #1 at **29b3a8c**. The
original Replit commits remain ancestors of main even if GitHub removes the
recovery branch after merging.

The reconciliation retains the workspace initialization fix, page error boundary,
connection wording, theme/layout changes and mockups alongside the shared source
validation, maintenance, backup and build-verification work. No application is
published by synchronizing Git.

## Earlier synchronization from c5ccd68

1. Stop any active task using **Stop in Replit's Agent panel**. Stop **Run** too.
   Stopping Run alone does not stop an Agent task from creating more source commits.
2. Keep Agent and manual source edits paused until the status check below completes.
3. From Replit's Shell, run:

```bash
git pull --ff-only origin main && git status -sb && git log -1 --oneline
```

The reconciled main contains `c5ccd68`, so that exact Replit snapshot can
fast-forward. A clean result shows `## main...origin/main` without ahead/behind
counts or modified paths. Then restart Run once with `pnpm run replit`.
Publication remains a separate action.

Fast-forwarding depends on commit ancestry. A clean working tree alone does not
prove the branches are synchronized. If Replit creates another commit after the
snapshot was uploaded, stop and preserve that newer version before proceeding.

## If the branches diverge again

Inspect the exact state first:

```bash
git fetch origin
git status -sb
git log -1 --oneline
git rev-list --left-right --count HEAD...origin/main
```

If both counts are nonzero, each side has commits missing from the other.
`git pull --ff-only` will correctly refuse to discard either history. Repeating
that command does not reconcile them.

Preserve the committed Replit version on a **new, uniquely named recovery branch**:

```bash
git push origin HEAD:refs/heads/replit-recovery-UNIQUE-NAME
```

A push of HEAD includes committed files only. It does **not** include unstaged,
staged-but-uncommitted or untracked files. Inspect `git status` and save any such
source edits deliberately before claiming that the recovery snapshot is complete.
When a generated registry imports new components, preserve those components with
it. Do not stage private databases, credentials or unrelated local files.

Reconcile and validate the complete snapshot against current GitHub main before
updating main. Preserve its actual commits as ancestors of the result; copying
files or cherry-picking alone does not make Replit's existing history eligible
for a fast-forward. Record the recovery commit ID until the workspace and GitHub both report the
same main commit. If the recovery branch is deleted after a PR merge, verify
that its snapshot remains an ancestor of main.

## Pending merges and local data

If status reports unmerged paths, preserve the conflict resolutions and any
subsequent edits before attempting an abort. `git merge --abort` can fail when
working files changed after the merge began. Inspect the failing paths and save
those edits rather than forcing the abort. An extra `git diff --binary HEAD`
patch can preserve tracked edits, but it is not a backup of untracked or ignored
files and should not be treated as the complete workspace snapshot.

Do not use force push, hard reset or clean to bypass divergence. Private SQLite
records, ignored data files and untracked files are separate from committed
source history and must be preserved independently. A successful source pull is
not a database migration or a deployment publication.
