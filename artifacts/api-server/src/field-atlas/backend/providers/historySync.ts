type InstalledPeriod = {
  period?: unknown;
  rows?: unknown;
  sha256?: unknown;
  sourceUrl?: unknown;
};
type SyncPeriod = {
  period?: string;
  state?: string;
  rows?: number;
  sha256?: string;
  sourceUrl?: string;
  error?: string;
  priorAttemptWarnings?: string[];
};
export function reconcileHistorySync(
  status: unknown,
  installed: InstalledPeriod[],
) {
  if (
    !status ||
    typeof status !== "object" ||
    !("periods" in status) ||
    !Array.isArray(status.periods)
  )
    return status;
  return {
    ...status,
    periods: (status.periods as SyncPeriod[]).map((period) => {
      const matched = installed.some(
        (row) =>
          row.period === period.period &&
          row.rows === period.rows &&
          row.sha256 === period.sha256 &&
          row.sourceUrl === period.sourceUrl,
      );
      if (
        period.state !== "imported" ||
        period.error !== "Official download returned HTTP 404" ||
        !matched
      )
        return period;
      const { error, ...rest } = period;
      return {
        ...rest,
        priorAttemptWarnings: [
          ...new Set([...(period.priorAttemptWarnings || []), error]),
        ],
        reconciliation:
          "Legacy download warning; installed dataset metadata matches this successful import. This comparison does not repeat a full archive integrity check.",
      };
    }),
  };
}
