/**
 * Lets the validation scripts import application modules the same way the app
 * writes them — `from '../lib/workspace'`, no file extension.
 *
 * Node runs `.ts` files directly (type stripping), but ESM resolution requires
 * a full specifier, so `./migrations` would fail where `./migrations.ts` works.
 * Rather than push `.ts` extensions into `lib/` — which would force
 * `allowImportingTsExtensions` on the whole project for the sake of two scripts
 * — this hook appends the extension during resolution only.
 *
 * Loaded via `node --import ./scripts/register-ts-resolver.mjs`.
 */
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HAS_EXTENSION = /\.[mc]?[jt]sx?$/;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !HAS_EXTENSION.test(specifier) && context.parentURL) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (candidate.protocol === 'file:' && existsSync(fileURLToPath(candidate))) {
        return nextResolve(`${specifier}.ts`, context);
      }
    }
    return nextResolve(specifier, context);
  },
});
