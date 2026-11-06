-- Runs once, only when the data volume is empty (see ADR-015).
-- Integration tests must use this database; the name ends in _test on purpose (ADR-014).
CREATE DATABASE smartdocs_test;
