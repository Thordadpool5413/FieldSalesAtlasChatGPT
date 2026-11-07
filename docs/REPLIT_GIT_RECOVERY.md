# Replit and GitHub merge recovery

Repaired main preserves the readiness recovery (**3037c98** and **4bd95c7**) and all subsequent uploaded Replit snapshots. The latest branch, **replit-recovery-mobile-menu**, points to **1c1385b**, which commits the previously interrupted merge and the mobile menu/search edits. Earlier recovery branches remain available as backups.

The resolution combines structured provider failures and explicit stale/unknown messages, preserves Canadian forecasts/warnings and bounded observation validation, and keeps the UI travel types connected to the canonical API contract. Replit's map, navigation and source-information changes are retained.

The map key and source details follow the map so the phone layout keeps the map in its first viewport. Replit's newer theme tokens, restrained map styling and first-visit/returning-visit checks are retained. Browser checks cover grouped navigation, collapsed phone setup and a searchable map list alongside booking readiness and shared-trainer recovery.

The latest Replit changes remove the returning-user header row and its trip button. The map controls and main Travel navigation remain available; browser checks validate both after reloading.

The subsequent Replit snapshot also preserves setup reopening from People, a compact landscape layout, a saved region after reload, shared airport-color tokens for both map modes, and clearer tool names. The Canadian observation adapter retains bounded queries, validated timestamps and explicit stale/unknown results.

The phone Focus action is inside the territory panel. The background toolbar stays behind that panel, leaving its Close button and other panel controls reachable.

The mobile menu shares the desktop TEAM and INSIGHTS groups and keeps Atlas, Travel, People and Calendar in the bottom bar. The workspace search and map search retain distinct scopes. One map key and one source-details panel remain below the map; duplicate copies introduced during reconciliation are removed.

## Synchronize the recovered workspace

Pause Replit Agent edits and stop the current Run process while synchronizing. If there is no pending merge and the working tree is clean, run these commands one line at a time:

Replit snapshot **1c1385b** has already completed its merge and has a clean working tree, so it uses this normal synchronization flow.

~~~bash
git pull --ff-only origin main
git status -sb
git log -1 --oneline
~~~

The pull can fast-forward because repaired main contains the uploaded Replit snapshot. The final status should show main tracking origin/main without ahead/behind counts or unmerged paths. Restart Run once after synchronization. Source synchronization does not publish the app.

## Recover from an interrupted merge

After the exact Replit snapshot has been reconciled into GitHub main, use this block if a previous pull stopped with conflicts. It backs up tracked changes and aborts only when a merge is actually active. The subshell stops on failure without changing the interactive shell's options:

~~~bash
(
  set -e
  atlas_merge_backup=$(mktemp /tmp/atlas-replit-merge.XXXXXX)
  git diff --binary HEAD > "$atlas_merge_backup"
  printf 'Saved pending changes: %s\n' "$atlas_merge_backup"
  if git rev-parse --verify -q MERGE_HEAD >/dev/null; then
    git merge --abort
  fi
  git pull --ff-only origin main
  git status -sb
  git log -1 --oneline
)
~~~

The temporary patch is an additional copy of the pending tracked changes, including any conflict markers or manual edits. The backup file is outside Git. The committed Replit work is also preserved on the recovery branch and as an ancestor of repaired main.

If any command fails, the chain stops. Keep its output and the temporary patch; do not use force push, hard reset or clean to bypass the failure.

## Future updates

Start with a clean working tree and a fast-forward-only pull. If Replit and GitHub both have new commits, preserve the committed Replit work on a separate recovery branch and reconcile the exact histories before pulling again. A blind normal merge can stop with content conflicts; a force reset can discard local work.

Private SQLite records, ignored data files and untracked files are outside this source reconciliation. Do not add database files or credentials to a recovery commit.
