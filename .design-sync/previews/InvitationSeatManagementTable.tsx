import * as React from "react";
import * as S from "@ds-stories/frontend/src/stories/InvitationSeatManagementTable.stories";

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
    parameters: (st && st.parameters) ?? meta.parameters ?? {},
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
  return decorators.reduce(
    (inner: any, dec: any) => () => {
      const out = dec(inner, ctx);
      return out === undefined ? inner() : out;
    },
    render,
  );
}

export const AdminWithSeating = /* Admin With Seating */ compose(
  S,
  "AdminWithSeating",
);
export const NoSeatingConfigured = /* No Seating Configured */ compose(
  S,
  "NoSeatingConfigured",
);
export const NoInvitationsYet = /* No Invitations Yet */ compose(
  S,
  "NoInvitationsYet",
);
export const LongNames = /* Long Names */ compose(S, "LongNames");
export const SendInvitationsDialogOpen =
  /* Send Invitations Dialog Open */ withPlay(
    compose(S, "SendInvitationsDialogOpen"),
    clickSend,
  );

function withPlay(C: any, fn: (root: HTMLElement) => void) {
  return (props: any) => {
    const ref = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
      const t = setTimeout(() => {
        if (ref.current) fn(ref.current);
      }, 50);
      return () => clearTimeout(t);
    }, []);
    return React.createElement("div", { ref }, React.createElement(C, props));
  };
}
function clickSend(root: HTMLElement) {
  const b = Array.from(root.querySelectorAll("button")).find(
    (x) => x.textContent?.trim() === "Send Invitations",
  );
  if (b) (b as HTMLButtonElement).click();
}
