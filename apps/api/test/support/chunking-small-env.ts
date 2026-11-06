/**
 * Imported FIRST by documents-chunking.e2e-spec.ts, before AppModule (configuration is validated
 * when it loads). Chunks of about ten words turn the few-word fixtures into several chunks, so
 * page numbers, sheet names and heading paths can be checked on real extraction output.
 * Valid because 10 + 2 + 60 reserved words fit under 80.
 */
process.env.CHUNK_TARGET_WORDS = '10';
process.env.CHUNK_OVERLAP_WORDS = '2';
process.env.CHUNK_MAX_WORDS = '80';
