/**
 * Backward-compatible entry point: the session logic lives in ./omp/*
 * (OmpProcess / OmpTransport / OmpProtocol / OmpSession / OmpCapabilities),
 * re-exported here through the facade so existing './omp' imports keep working.
 */
export * from './omp/index'
