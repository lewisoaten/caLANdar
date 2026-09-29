// moment's locale bundles are imported only for their side effect of
// registering locales, and ship no type declarations. TypeScript 6 checks
// side-effect imports by default (noUncheckedSideEffectImports) and rejects
// them without these; TypeScript 7 accepts the JS files as they are.
declare module "moment/min/locales.min";
declare module "moment/locale/en-gb";
