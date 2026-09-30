/**
 * Story helpers: an in-page fake of the caLANdar API plus router/user wrappers.
 *
 * Storybook stories for data-driven components used MSW, which needs a service
 * worker and so can't run in a static preview. This patches `window.fetch`
 * instead, so the same story renders in Storybook and in the design-sync
 * previews. Routes are global to the page: scope scenarios by giving each story
 * its own event id (e.g. `/api/events/101/...`) so stories never clash.
 */
import * as React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import type { Decorator } from "@storybook/react";
import { UserContext } from "../UserProvider";

export interface MockRequest {
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  method: string;
}

type Handler = unknown | ((req: MockRequest) => unknown);

interface Route {
  method: string;
  regex: RegExp;
  keys: string[];
  handler: Handler;
}

const routes: Route[] = [];
let installed = false;

/** A JSON response with a custom status and optional headers. */
export const mockResponse = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

function compile(pattern: string): { regex: RegExp; keys: string[] } {
  const keys: string[] = [];
  const src = pattern
    .split("/")
    .map((seg) => {
      if (seg.startsWith(":")) {
        keys.push(seg.slice(1));
        return "([^/]+)";
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return { regex: new RegExp(`^${src}/?$`), keys };
}

function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const url = new URL(raw, window.location.origin);
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    for (const r of routes) {
      if (r.method !== method) continue;
      const m = r.regex.exec(url.pathname);
      if (!m) continue;
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      let body: unknown = undefined;
      if (typeof init?.body === "string") {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      }
      const out =
        typeof r.handler === "function"
          ? await (r.handler as (q: MockRequest) => unknown)({
              params,
              query: url.searchParams,
              body,
              method,
            })
          : r.handler;
      return out instanceof Response ? out : mockResponse(200, out);
    }
    return realFetch(input, init);
  };
}

/**
 * Register fake API routes, keyed `"GET /api/events/:id/rooms"`. A value is a
 * JSON body or a function of the request returning a body / `mockResponse`.
 * Later registrations for the same method+path replace earlier ones.
 */
export function mockApi(table: Record<string, Handler>) {
  install();
  for (const [key, handler] of Object.entries(table)) {
    const [method, path] = key.split(" ");
    const { regex, keys } = compile(path);
    const i = routes.findIndex(
      (r) => r.method === method && r.regex.source === regex.source,
    );
    const entry = { method, regex, keys, handler };
    if (i >= 0) routes[i] = entry;
    else routes.push(entry);
  }
}

/**
 * For components that call `useParams()`: renders the story under `pattern`
 * (e.g. "/events/:id") after redirecting the surrounding router to `initial`
 * (e.g. "/events/101"). Works whether or not a Router already wraps the story.
 */
export const withRoute = (pattern: string, initial: string): Decorator =>
  function RouteDecorator(Story) {
    return (
      <Routes>
        <Route path={pattern} element={<Story />} />
        <Route path="*" element={<Navigate to={initial} replace />} />
      </Routes>
    );
  };

/** Provide the signed-in user that components read from UserContext. */
export const withUser = (
  user: Partial<React.ContextType<typeof UserContext>> = {},
): Decorator =>
  function UserDecorator(Story) {
    return (
      <UserContext.Provider
        value={{
          email: "sam@example.com",
          token: "storybook-token",
          loggedIn: true,
          isAdmin: false,
          ...user,
        }}
      >
        <Story />
      </UserContext.Provider>
    );
  };

const svgUri = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const PALETTE = ["#5F27DD", "#08F7FE", "#F2059F", "#51FF7E", "#FFA500"];

/**
 * Steam cover art and the default event banner are remote/static files that a
 * static preview can't rely on. Swap them for generated SVGs so cards render
 * the same offline (and forces lazy images eager): call once at the top of a story file that shows them.
 */
export function stubImages() {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __imagesStubbed?: boolean };
  if (w.__imagesStubbed) return;
  w.__imagesStubbed = true;

  const rewrite = (value: string): string => {
    const steam = /steam\/apps\/(\d+)\//.exec(value);
    if (steam) {
      const color = PALETTE[Number(steam[1]) % PALETTE.length];
      return svgUri(
        `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="215" viewBox="0 0 460 215"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#16161a"/></linearGradient></defs><rect width="460" height="215" fill="url(#g)"/><circle cx="230" cy="107" r="42" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="6"/><path d="M218 88l30 19-30 19z" fill="#fff" fill-opacity=".85"/></svg>`,
      );
    }
    if (value.includes("lan_party_image")) {
      return svgUri(
        `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300" viewBox="0 0 600 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3d1a8f"/><stop offset="1" stop-color="#232946"/></linearGradient></defs><rect width="600" height="300" fill="url(#g)"/><g fill="#08F7FE" fill-opacity=".8"><rect x="90" y="150" width="120" height="70" rx="6"/><rect x="240" y="150" width="120" height="70" rx="6"/><rect x="390" y="150" width="120" height="70" rx="6"/></g><text x="300" y="100" text-anchor="middle" font-family="sans-serif" font-size="34" font-weight="700" fill="#fff">LAN PARTY</text></svg>`,
      );
    }
    return value;
  };

  // React may set an image's src either as an attribute or as a property.
  const original = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name: string, value: string) {
    if (this.tagName === "IMG") {
      // Offscreen lazy images never load in a tall static preview (and never
      // decode), so load everything eagerly.
      if (name === "loading") value = "eager";
      if (name === "src" && typeof value === "string") value = rewrite(value);
    }
    return original.call(this, name, value);
  };
  const desc = Object.getOwnPropertyDescriptor(
    HTMLImageElement.prototype,
    "src",
  );
  if (desc?.set && desc.get) {
    const { get, set } = desc;
    Object.defineProperty(HTMLImageElement.prototype, "src", {
      ...desc,
      get() {
        return get.call(this);
      },
      set(value: string) {
        set.call(this, typeof value === "string" ? rewrite(value) : value);
      },
    });
  }
  const loading = Object.getOwnPropertyDescriptor(
    HTMLImageElement.prototype,
    "loading",
  );
  if (loading?.set && loading.get) {
    const { get, set } = loading;
    Object.defineProperty(HTMLImageElement.prototype, "loading", {
      ...loading,
      get() {
        return get.call(this);
      },
      set() {
        set.call(this, "eager");
      },
    });
  }
}
