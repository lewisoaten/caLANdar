import * as React from 'react';
import * as S from "@ds-stories/frontend/src/stories/GamersAdmin.stories";

function compose(S: any, key: string) {
  const meta: any = S.default ?? {};
  const st: any = S[key];
  const args: any = { ...(meta.args ?? {}), ...(st && st.args ? st.args : {}) };
  // Storybook resolves argTypes.mapping (control value -> real arg) before
  // rendering; mirror that so mapped args don't render raw.
  const at: any = { ...(meta.argTypes ?? {}), ...(st && st.argTypes ? st.argTypes : {}) };
  for (const k of Object.keys(args)) {
    const m = at[k] && at[k].mapping;
    if (m && typeof m === 'object' && args[k] in m) args[k] = m[args[k]];
  }
  const title: string = typeof meta.title === 'string' ? meta.title : '';
  const ctx: any = {
    args, name: key, title, kind: title, id: '', componentId: '',
    globals: {}, viewMode: 'story',
    parameters: (st && st.parameters) ?? meta.parameters ?? {},
  };
  let render: (() => any) | null = null;
  if (st && typeof st.render === 'function') render = () => st.render(args, ctx);
  else if (typeof st === 'function') render = () => st(args, ctx);
  else if (typeof meta.render === 'function') render = () => meta.render(args, ctx);
  else {
    const C = (st && st.component) || meta.component;
    if (C) render = () => React.createElement(C, args);
  }
  if (!render) return () => null;
  // [].concat: a single function is legal CSF decorator shorthand. A
  // decorator returning undefined (stubbed addon) falls through to the inner
  // render — otherwise one unrecognized addon blanks the cell silently.
  const decorators: any[] = ([] as any[]).concat((st && st.decorators) ?? []).concat(meta.decorators ?? []);
  return decorators.reduce((inner: any, dec: any) => () => {
    const out = dec(inner, ctx);
    return out === undefined ? inner() : out;
  }, render);
}

export const Default = /* Default */ compose(S, "Default");
export const SearchByHandle = /* Search By Handle */ withPlay(compose(S, "SearchByHandle"), typeInto("night"));
export const NoResults = /* No Results */ withPlay(compose(S, "NoResults"), typeInto("zzzz-no-such-gamer"));

function withPlay(C: any, fn: (root: HTMLElement) => void) {
  return (props: any) => {
    const ref = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
      const t = setTimeout(() => { if (ref.current) fn(ref.current); }, 800);
      return () => clearTimeout(t);
    }, []);
    return React.createElement('div', { ref }, React.createElement(C, props));
  };
}
function typeInto(text: string) {
  return (root: HTMLElement) => {
    const el = root.querySelector('input') as HTMLInputElement | null;
    if (!el) return;
    el.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
}
