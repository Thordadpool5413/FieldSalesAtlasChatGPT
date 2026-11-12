export function runtimeConfiguration(env?: NodeJS.ProcessEnv): {
  recordStore: string;
  routingProvider: string;
  routingConfigured: boolean;
  privateBucketConfigured: boolean;
  backupScope: string | null;
  flightStatusConfigured: boolean;
  flightWorkspacesConfigured: boolean;
  flightPollingEnabled: boolean;
  calendarEncryptionConfigured: boolean;
  googleCalendarConfigured: boolean;
  microsoftCalendarConfigured: boolean;
};
export function inspectRuntime(
  root: string,
  env?: NodeJS.ProcessEnv,
): Promise<{
  state: string;
  revision: string | null;
  webPort: number;
  apiPort: number;
  next?: string;
  checks?: Record<string, boolean>;
  issues?: Array<{ code: string; message: string }>;
  modifiedPaths?: string[];
  configurationDifferences?: string[];
}>;
