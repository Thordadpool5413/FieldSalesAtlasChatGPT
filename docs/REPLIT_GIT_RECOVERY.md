# Replit and GitHub merge recovery

Repaired main preserves the readiness recovery (**3037c98** and **4bd95c7**) and all subsequent uploaded Replit snapshots. The latest branch, **replit-recovery-e38c12f**, points to **089d11f** and includes **e38c12f**. The earlier branch **replit-recovery-d0a16a5** retains **d0a16a5** and **4b699f5**. The original recovery branches remain available as backups.

The resolution combines structured provider failures and explicit stale/unknown messages, preserves Canadian forecasts/warnings and bounded observation validation, and keeps the UI travel types connected to the canonical API contract. Replit's map, navigation and source-information changes are retained.

The map key and source details follow the map so the phone layout keeps the map in its first viewport. Replit's newer theme tokens, restrained map styling and first-visit/returning-visit checks are retained. Browser checks cover grouped navigation, collapsed phone setup and a searchable map list alongside booking readiness and shared-trainer recovery.

The latest Replit changes remove the returning-user header row and its trip button. The map controls and main Travel navigation remain available; browser checks validate both after reloading.

## Synchronize the recovered workspace

Pause Replit Agent edits and stop the current Run process while synchronizing. If there is no pending merge and the working tree is clean, run these commands one line at a time:

~~~bash
git pull --ff-only origin main
git status -sb
git log -1 --oneline
~~~

The pull can fast-forward because repaired main contains the uploaded Replit snapshot. The final status should show main tracking origin/main without ahead/behind counts or unmerged paths. Restart Run once after synchronization. Source synchronization does not publish the app.

## Only when a merge is still pending

Use this section only when Git reports an unfinished merge. Check for its merge reference:

~~~bash
git rev-parse --verify -q MERGE_HEAD
~~~

If there is no output and the command exits with status 1, no merge is active; skip the abort and use the synchronization commands above. Otherwise, back up the tracked working-tree changes before aborting the unfinished merge:

~~~bash
atlas_merge_backup=$(mktemp /tmp/atlas-replit-merge.XXXXXX) &&
git diff --binary HEAD > "$atlas_merge_backup" &&
git merge --abort &&
git pull --ff-only origin main &&
git status -sb
~~~

The temporary patch is an additional copy of the pending tracked changes, including any conflict markers or manual edits. The backup file is outside Git. The committed Replit work is also preserved on the recovery branch and as an ancestor of repaired main.

If any command fails, the chain stops. Keep its output and the temporary patch; do not use force push, hard reset or clean to bypass the failure.

## Future updates

Start with a clean working tree and a fast-forward-only pull. If Replit and GitHub both have new commits, preserve the committed Replit work on a separate recovery branch and reconcile the exact histories before pulling again. A blind normal merge can stop with content conflicts; a force reset can discard local work.

Private SQLite records, ignored data files and untracked files are outside this source reconciliation. Do not add database files or credentials to a recovery commit.
