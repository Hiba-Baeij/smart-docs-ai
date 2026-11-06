/**
 * Imported FIRST by rate-limit.e2e-spec.ts. Configuration is validated when AppModule loads, so
 * this must run before that import; ES modules evaluate in import order, which guarantees it.
 * setup-env.ts gives every other spec a generous limit; this spec tests the real value.
 */
process.env.AUTH_RATE_LIMIT = '5';
