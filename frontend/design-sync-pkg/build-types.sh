#!/bin/sh
# Regenerates design-sync-pkg/types (gitignored) from the app source. tsc errors
# about assets/subpaths are expected - declarations still emit.
cd "$(dirname "$0")/.." || exit 1
rm -rf design-sync-pkg/types
npx tsc --declaration --emitDeclarationOnly --skipLibCheck --jsx react-jsx --module esnext \
  --moduleResolution bundler --target es2020 --esModuleInterop --resolveJsonModule \
  --outDir design-sync-pkg/types --rootDir . design-sync-pkg/entry.ts
echo 'export * from "./design-sync-pkg/entry";' > design-sync-pkg/types/index.d.ts
(npx vite build -c design-sync-pkg/vite.config.ts || exit 1)
exit 0
