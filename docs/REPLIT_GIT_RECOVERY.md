# Replit and GitHub merge recovery

The readiness recovery merges Replit snapshot **3037c98** with GitHub readiness **4bd95c7**, preserving both histories. The separate branch **replit-recovery-readiness** retains the original Replit snapshot.

The resolution combines structured provider failures and explicit stale/unknown messages, preserves Canadian forecasts/warnings and bounded observation validation, and keeps the UI travel types connected to the canonical API contract. Replit's map, navigation and source-information changes are retained.

The map key and source details follow the map so the phone layout keeps the map in its first viewport. Browser checks cover Replit's grouped navigation, collapsed phone setup and searchable map list alongside booking readiness and shared-trainer recovery.

## Finish the already pending merge in Replit

After the repair is pushed to GitHub main, stop the current Run process. Back up the tracked working-tree changes before aborting the unfinished merge:

~~~bash
atlas_merge_backup=$(mktemp /tmp/atlas-replit-merge.XXXXXX) &&
git diff --binary HEAD > "$atlas_merge_backup" &&
git merge --abort &&
git pull --ff-only origin main &&
git status -sb
~~~

The temporary patch is an additional copy of the pending tracked changes, including any conflict markers or manual edits. The backup file is outside Git. The committed Replit work is also preserved on the recovery branch and as an ancestor of repaired main.

The pull can fast-forward because repaired main contains the Replit commit. The final status should show main tracking origin/main without ahead/behind counts or unmerged paths. Restart Run once after synchronization. Source synchronization does not publish the app.

If any command fails, the chain stops. Keep its output and the temporary patch; do not use force push, hard reset or clean to bypass the failure.

## Future updates

Start with a clean working tree and a fast-forward-only pull. If Replit and GitHub both have new commits, preserve the committed Replit work on a separate recovery branch and reconcile the exact histories before pulling again. A blind normal merge can stop with content conflicts; a force reset can discard local work.

Private SQLite records, ignored data files and untracked files are outside this source reconciliation. Do not add database files or credentials to a recovery commit.
