#!/bin/sh
# Regenerates design-sync-pkg/types (gitignored) and dist/ (gitignored) from the
# app source. tsc reports errors about asset imports and subpath types that we
# tolerate, but the declaration for the entry point MUST be emitted: fail if it
# isn't, so a broken emit can never publish an unusable `types` entry.
cd "$(dirname "$0")/.." || exit 1
rm -rf design-sync-pkg/types
npx tsc --declaration --emitDeclarationOnly --skipLibCheck --ignoreConfig --jsx react-jsx --module esnext \
  --moduleResolution bundler --target es2020 --esModuleInterop --resolveJsonModule \
  --outDir design-sync-pkg/types --rootDir . design-sync-pkg/entry.ts
if [ ! -s design-sync-pkg/types/design-sync-pkg/entry.d.ts ]; then
  echo "build-types: tsc did not emit design-sync-pkg/types/design-sync-pkg/entry.d.ts" >&2
  exit 1
fi
echo 'export * from "./design-sync-pkg/entry";' > design-sync-pkg/types/index.d.ts
npx vite build -c design-sync-pkg/vite.config.mts || exit 1
