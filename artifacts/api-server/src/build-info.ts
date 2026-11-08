export type BuildInfo = {
  app: string;
  revision: string | null;
  sourceModified: boolean | null;
  builtAt: string | null;
  mode: string;
};
declare const __ATLAS_BUILD_INFO__: BuildInfo;
// Defined by esbuild. Source-only test imports must not claim a compiled revision.
export const apiBuildInfo: BuildInfo =
  typeof __ATLAS_BUILD_INFO__ === "undefined"
    ? {
        app: "Field Sales Atlas",
        revision: null,
        sourceModified: null,
        builtAt: null,
        mode: "source",
      }
    : __ATLAS_BUILD_INFO__;
