# Replit and GitHub synchronization

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

## Finish the current synchronization

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
