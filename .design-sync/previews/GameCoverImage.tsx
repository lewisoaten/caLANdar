import * as React from "react";
import * as S from "@ds-stories/frontend/src/stories/GameCoverImage.stories";

function compose(S: any, key: string) {
  const meta: any = S.default ?? {};
  const st: any = S[key];
  const args: any = { ...(meta.args ?? {}), ...(st && st.args ? st.args : {}) };
  // Storybook resolves argTypes.mapping (control value -> real arg) before
  // rendering; mirror that so mapped args don't render raw.
  const at: any = {
    ...(meta.argTypes ?? {}),
    ...(st && st.argTypes ? st.argTypes : {}),
  };
  for (const k of Object.keys(args)) {
    const m = at[k] && at[k].mapping;
    if (m && typeof m === "object" && args[k] in m) args[k] = m[args[k]];
  }
  const title: string = typeof meta.title === "string" ? meta.title : "";
  const ctx: any = {
    args,
    name: key,
    title,
    kind: title,
    id: "",
    componentId: "",
    globals: {},
    viewMode: "story",
    parameters: {
      ...(meta.parameters ?? {}),
      ...((st && st.parameters) ?? {}),
    },
  };
  let render: (() => any) | null = null;
  if (st && typeof st.render === "function")
    render = () => st.render(args, ctx);
  else if (typeof st === "function") render = () => st(args, ctx);
  else if (typeof meta.render === "function")
    render = () => meta.render(args, ctx);
  else {
    const C = (st && st.component) || meta.component;
    if (C) render = () => React.createElement(C, args);
  }
  if (!render) return () => null;
  // [].concat: a single function is legal CSF decorator shorthand. A
  // decorator returning undefined (stubbed addon) falls through to the inner
  // render — otherwise one unrecognized addon blanks the cell silently.
  const decorators: any[] = ([] as any[])
    .concat((st && st.decorators) ?? [])
    .concat(meta.decorators ?? []);
  const composed: any = decorators.reduce(
    (inner: any, dec: any) => () => {
      const out = dec(inner, ctx);
      return out === undefined ? inner() : out;
    },
    render,
  );
  // caLANdar fork: mirror .storybook/preview.tsx, which wraps every story in
  // BackgroundFxProvider (defaultEnabled from parameters.backgroundFx) and a
  // MemoryRouter unless the story sets parameters.router === false (it mounts
  // its own). Both come from the single bundle copy.
  return () => {
    const G: any = (window as any).CaLANdar ?? {};
    let el: any = composed();
    if (ctx.parameters.router !== false && G.MemoryRouter)
      el = React.createElement(G.MemoryRouter, null, el);
    if (G.BackgroundFxProvider)
      el = React.createElement(
        G.BackgroundFxProvider,
        { defaultEnabled: ctx.parameters.backgroundFx },
        el,
      );
    return el;
  };
}

export const SteamHeader = /* Steam Header */ compose(S, "SteamHeader");
export const Fallback = /* Fallback */ compose(S, "Fallback");

// The story file bundles its own copy of utils/gameCover, so its module-level
// markLegacyHeaderFailed(NO_ART) never reaches the component's copy in the
// design-system bundle. Mark the failure on the bundle's copy as well.
{
  const G: any = (window as any).CaLANdar ?? {};
  G.markLegacyHeaderFailed?.(3949040);
  G.markResolvedCoverFailed?.(3949040);
}
