/**
 * Polyfill for Node.js < 17.4.0 where `crypto.getRandomValues` is not available
 * directly on the node:crypto module object (only on `crypto.webcrypto`).
 * Vite 5.4+ calls `crypto.getRandomValues` in resolveConfig to generate a
 * WebSocket token, which crashes on older Node runtimes (e.g. some Codespace images).
 */
import cryptoModule from 'node:crypto';

if (typeof cryptoModule.getRandomValues !== 'function') {
  cryptoModule.getRandomValues = cryptoModule.webcrypto.getRandomValues.bind(
    cryptoModule.webcrypto
  );
}
