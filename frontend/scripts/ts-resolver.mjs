/**
 * Minimal ESM resolver hook so Node's native TypeScript type-stripping can
 * resolve the extensionless relative imports used across the source tree
 * (e.g. `./edgeEngine` -> `./edgeEngine.ts`).
 *
 * Used only by `npm run check:logic`. Zero dependencies.
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    try {
      return await nextResolve(specifier, context);
    } catch (err) {
      for (const suffix of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
        try {
          return await nextResolve(specifier + suffix, context);
        } catch {
          /* try the next candidate */
        }
      }
      throw err;
    }
  }
  return nextResolve(specifier, context);
}
