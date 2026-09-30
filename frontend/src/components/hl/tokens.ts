/**
 * HyperLAN design tokens.
 *
 * The single source of truth for colours, fonts and the signature shapes of
 * the redesign (see `README.md` next to this file). The MUI theme in
 * `src/theme.ts` is built from these values; components that need a raw value
 * (a tinted fill, a chamfer, a corner bracket) should import it from here
 * rather than hard-code a hex.
 *
 * Every text/background pair listed in `contrastPairs` is asserted to reach
 * WCAG AA (4.5:1) by `src/__tests__/hlTokens.test.ts`.
 */

/** Raw colour values. */
export const colors = {
  /** Page background. */
  bg: "#06070b",
  /** Panels and cards (translucent, on top of `bg`). */
  surface: "rgba(12,15,24,0.85)",
  /** `surface` flattened over `bg`, for places that cannot be translucent. */
  surfaceFlat: "#0c0f18",
  /** Dialogs, drawers, menus, selects, stat cells. */
  surfaceSolid: "#0b0e16",
  /** Image placeholders. */
  surface2: "#151a28",
  /** Sidebar / bars. */
  chrome: "rgba(8,10,16,0.86)",

  text: "#eef3ff",
  text2: "#c9d1e6",
  textMuted: "#a9b3cc",
  /** Inactive nav items. */
  textNav: "#aab4cf",
  /** Kickers, labels, meta. Use `textMuted` instead on tinted fills. */
  textDim: "#7c87a6",
  placeholder: "#6f7a98",
  /** Disabled icons/borders only; never for readable text. */
  disabled: "#3a4058",

  cyan: "#36e6ff",
  violet: "#8b5cff",
  violetLight: "#a58bff",
  /** Violet for text on dark backgrounds (`violet` itself is fills only). */
  violetText: "#c4b2ff",
  lime: "#9dff5a",
  amber: "#ffc23d",
  pink: "#ff4d94",
  /** Pink for body-size text. */
  pinkText: "#ff7aae",

  gold: "#ffd23d",
  silver: "#c9d3e6",
  bronze: "#e8945a",

  /** Text colour on solid accent fills (cyan/lime/amber/pink/violet). */
  ink: "#06070b",
} as const;

/** RGB triplets, for building `rgba()` tints. */
const rgb = {
  cyan: "54,230,255",
  violet: "139,92,255",
  lime: "157,255,90",
  amber: "255,194,61",
  pink: "255,77,148",
  neutral: "169,179,204",
  text: "238,243,255",
} as const;

/** `rgba()` of an accent at the given alpha. */
export const tint = (name: keyof typeof rgb, alpha: number) =>
  `rgba(${rgb[name]},${alpha})`;

/** Hairline borders (cyan at low alpha). */
export const hairline = {
  /** Row separators inside a panel. */
  faint: tint("cyan", 0.07),
  /** Section dividers inside a panel. */
  soft: tint("cyan", 0.12),
  /** Chrome (sidebar, top bar) borders. */
  chrome: tint("cyan", 0.14),
  /** Panel / card default. */
  panel: tint("cyan", 0.16),
  /** Inputs and controls. */
  control: tint("cyan", 0.25),
  /** Outline buttons. */
  strong: tint("cyan", 0.45),
} as const;

export const fonts = {
  ui: '"Chakra Petch", system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
} as const;

/** Box shadows / glows. */
export const effects = {
  /** Selected tiles, focused CTAs. */
  glow: `0 0 24px -4px ${tint("cyan", 0.8)}`,
  dialog: `0 30px 80px -20px ${tint("cyan", 0.25)}`,
  toast: `0 12px 40px -10px ${tint("cyan", 0.5)}`,
  backdrop: "rgba(3,4,8,0.7)",
  backdropBlur: "blur(3px)",
} as const;

/** Visually hide content but keep it for screen readers (spread into `sx`). */
export const srOnly = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  border: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
} as const;

/** Section gap between blocks on a page. */
export const sectionGap = "clamp(18px,2.4vw,28px)";

/** Width at and below which the mobile layout applies. */
export const MOBILE_MAX_WIDTH = 760;

/**
 * `clip-path` for the signature chamfer: top-left and bottom-right corners cut
 * at 45deg by `size` px. Pass `"tr-bl"` to cut the other two corners.
 */
export const chamfer = (size = 10, corners: "tl-br" | "tr-bl" = "tl-br") =>
  corners === "tl-br"
    ? `polygon(${size}px 0,100% 0,100% calc(100% - ${size}px),calc(100% - ${size}px) 100%,0 100%,0 ${size}px)`
    : `polygon(0 0,calc(100% - ${size}px) 0,100% ${size}px,100% 100%,${size}px 100%,0 calc(100% - ${size}px))`;

/** Percentage chamfer for square tiles of any size (avatars). */
export const chamferPct =
  "polygon(20% 0,100% 0,100% 80%,80% 100%,0 100%,0 20%)";

/**
 * Panel corner-bracket accent as background layers: a 14x14px, 2px L in the
 * top-left corner (and optionally the mirrored one bottom-right).
 *
 * Painted with `background-origin: border-box`, so it sits on the element's
 * corner even with a border and is never clipped by `overflow: hidden`. Spread
 * into `sx` *after* any `backgroundColor`; it sets `backgroundImage`.
 */
export const bracket = (
  options: { color?: string; size?: number; both?: boolean } = {},
) => {
  const { color = colors.cyan, size = 14, both = false } = options;
  const line = `linear-gradient(${color},${color})`;
  const layers = [line, line];
  const sizes = [`${size}px 2px`, `2px ${size}px`];
  const positions = ["0 0", "0 0"];
  if (both) {
    layers.push(line, line);
    sizes.push(`${size}px 2px`, `2px ${size}px`);
    positions.push("100% 100%", "100% 100%");
  }
  return {
    backgroundImage: layers.join(","),
    backgroundSize: sizes.join(","),
    backgroundPosition: positions.join(","),
    backgroundRepeat: "no-repeat",
    backgroundOrigin: "border-box",
  } as const;
};

/** Semantic accent tones shared by Tag, StatCell, FilterChips, etc. */
export type HlTone = "cyan" | "violet" | "lime" | "amber" | "pink" | "neutral";

export interface ToneColors {
  /** Readable text/icon colour on dark backgrounds. */
  fg: string;
  /** Solid fill (for filled tags / bars); pair with `colors.ink` text. */
  solid: string;
  /** 1px border. */
  border: string;
  /** Tinted background behind the border. */
  fill: string;
}

export const tones: Record<HlTone, ToneColors> = {
  cyan: {
    fg: colors.cyan,
    solid: colors.cyan,
    border: colors.cyan,
    fill: tint("cyan", 0.08),
  },
  violet: {
    fg: colors.violetText,
    solid: colors.violetLight,
    border: colors.violetLight,
    fill: tint("violet", 0.12),
  },
  lime: {
    fg: colors.lime,
    solid: colors.lime,
    border: colors.lime,
    fill: tint("lime", 0.06),
  },
  amber: {
    fg: colors.amber,
    solid: colors.amber,
    border: colors.amber,
    fill: tint("amber", 0.08),
  },
  pink: {
    fg: colors.pinkText,
    solid: colors.pink,
    border: colors.pink,
    fill: tint("pink", 0.1),
  },
  neutral: {
    fg: colors.textMuted,
    solid: colors.textMuted,
    border: tint("neutral", 0.35),
    fill: tint("neutral", 0.06),
  },
};

/** Trophy colours for vote ranks 1-3. */
export const trophy = {
  1: colors.gold,
  2: colors.silver,
  3: colors.bronze,
} as const;

/**
 * Text/background pairs the design relies on. Each must reach 4.5:1 (checked
 * in the unit tests). Translucent backgrounds are listed with what they sit on.
 */
export const contrastPairs: Array<{
  name: string;
  fg: string;
  bg: string;
  /** Translucent layers (top first) composited over `bg`. */
  over?: string[];
}> = [
  ...(
    [
      "text",
      "text2",
      "textMuted",
      "textNav",
      "textDim",
      "placeholder",
      "cyan",
      "violetLight",
      "violetText",
      "lime",
      "amber",
      "pink",
      "pinkText",
      "gold",
      "silver",
      "bronze",
    ] as const
  ).flatMap((k) => [
    { name: `${k} on bg`, fg: colors[k], bg: colors.bg },
    {
      name: `${k} on surface`,
      fg: colors[k],
      bg: colors.bg,
      over: [colors.surface],
    },
    { name: `${k} on surfaceSolid`, fg: colors[k], bg: colors.surfaceSolid },
  ]),
  // Tinted fills: only the bright/muted text tones are used on them.
  ...(["text", "textMuted", "cyan"] as const).map((k) => ({
    name: `${k} on cyan-12 fill`,
    fg: colors[k],
    bg: colors.surfaceSolid,
    over: [tint("cyan", 0.12)],
  })),
  ...(Object.keys(tones) as HlTone[]).map((t) => ({
    name: `${t} tone on its fill`,
    fg: tones[t].fg,
    bg: colors.bg,
    over: [tones[t].fill, colors.surface],
  })),
  // Solid accent fills with ink text (contained buttons, filled tags).
  ...(
    ["cyan", "violet", "violetLight", "lime", "amber", "pink", "text"] as const
  ).map((k) => ({
    name: `ink on ${k}`,
    fg: colors.ink,
    bg: colors[k],
  })),
];

/** Everything above under one namespace: `import { hl } from "./hl"`. */
export const hl = {
  colors,
  tint,
  hairline,
  fonts,
  effects,
  sectionGap,
  srOnly,
  MOBILE_MAX_WIDTH,
  chamfer,
  chamferPct,
  bracket,
  tones,
  trophy,
} as const;

export default hl;
