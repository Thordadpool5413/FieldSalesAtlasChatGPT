These two tiny Parquet files are synthetic provider-contract fixtures used only
by checkpoint-archive.test.ts. They are never imported by the running app or
included in its public assets. One row checks zero/null handling, the documented
Eastern wall-clock schema, and rejection of an incompatible UTC schema.

Generated with hyparquet-writer using an explicit schema, uncompressed columns,
and created_by = "Field Sales Atlas isolated test fixture". No private records or
real passenger data are present.
