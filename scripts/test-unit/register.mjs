/**
 * Preloaded by `npm test` (`node --import`): points the Lingui macros at
 * test-only stubs, so a plain Node test can import any module that uses them.
 * The DOM tests compile the real macros instead (`scripts/test-dom/register.mjs`).
 */
import { registerHooks } from 'node:module';

const STUBS = {
  '@lingui/core/macro': new URL('./linguiCoreMacroStub.mjs', import.meta.url).href,
  '@lingui/react/macro': new URL('./linguiReactMacroStub.mjs', import.meta.url).href,
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    const url = STUBS[specifier];
    return url ? { url, shortCircuit: true } : nextResolve(specifier, context);
  },
});
