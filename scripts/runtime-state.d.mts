export function runtimeConfiguration(env?: NodeJS.ProcessEnv): {
  recordStore: string;
  routingProvider: string;
  routingConfigured: boolean;
  privateBucketConfigured: boolean;
  backupScope: string | null;
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
