import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcileHistorySync } from "../../api-server/src/field-atlas/backend/providers/historySync";
test("only the legacy 404 on a matching successful BTS import becomes a retained prior warning", () => {
  const period = {
    period: "2026-08",
    state: "imported",
    rows: 608389,
    sha256: "matching",
    sourceUrl: "official",
    error: "Official download returned HTTP 404",
  };
  const source = { state: "validated", periods: [period] };
  const output = reconcileHistorySync(source, [period]) as typeof source;
  assert.equal(output.periods[0].error, undefined);
  assert.deepEqual(
    (output.periods[0] as typeof period & { priorAttemptWarnings: string[] })
      .priorAttemptWarnings,
    [period.error],
  );
  assert.equal(source.periods[0].error, period.error);
  for (const changed of [
    { ...period, sha256: "different" },
    { ...period, rows: 12 },
  ])
    assert.equal(
      (reconcileHistorySync(source, [changed]) as typeof source).periods[0]
        .error,
      period.error,
    );
  const failed = { ...period, state: "failed" };
  assert.equal(
    (reconcileHistorySync({ periods: [failed] }, [period]) as typeof source)
      .periods[0].error,
    period.error,
  );
});
