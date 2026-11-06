/**
 * Imported FIRST by cookie-secure.e2e-spec.ts. Configuration is validated when AppModule loads, so
 * this must run before that import; ES modules evaluate in import order, which guarantees it.
 * It simulates a production-style deployment, where cookies must carry the Secure attribute.
 */
process.env.COOKIE_SECURE = 'true';
