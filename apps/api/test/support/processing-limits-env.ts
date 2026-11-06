/**
 * Imported FIRST by documents-processing-limits.e2e-spec.ts, before AppModule (configuration is
 * validated when it loads). Tiny ceilings let a test cross them with a few characters and a
 * fraction of a second instead of megabytes and half a minute.
 */
process.env.MAX_EXTRACTED_CHARS = '100';
process.env.UPLOAD_TIMEOUT_MS = '300';
