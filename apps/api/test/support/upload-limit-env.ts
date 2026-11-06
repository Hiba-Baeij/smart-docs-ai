/**
 * Imported FIRST by the upload specs, before AppModule (configuration is validated when it
 * loads). A 1 KiB ceiling lets a test cross the limit without sending megabytes.
 */
process.env.MAX_UPLOAD_BYTES = '1024';
