import * as React from "react";
import Box from "@mui/material/Box";
import useMediaQuery from "@mui/material/useMediaQuery";
import { colors, fonts, tint } from "../hl/tokens";
import { usePrefersReducedMotion } from "../hl/usePrefersReducedMotion";
import { RIG, generateAuthScene } from "./authArtModel";
import {
  beaconGeometry,
  chooseArtMode,
  gridLayer,
  gridLinePaths,
  glowBand,
  gridTile,
  motionPlan,
  packetMotion,
  planGeometry,
  skylinePaths,
  starPaths,
  twinkleStars,
  type ArtPalette,
  type ArtPath,
  type AuthArtMode,
} from "./authArtGeometry";

/*
 * Generated hero artwork for the signed-out pages: a synthwave horizon with a
 * striped sun and server-tower skyline, a scrolling neon grid floor, and the
 * seat-map floor plan hovering above it (desk pods, circuit traces, data
 * packets and a beacon over "your desk"), finished with HUD readouts,
 * scanlines, film grain and a vignette.
 *
 * Built for cheap frames (it is the first thing a phone sees):
 * - The scene is projected once in JS (`authArtGeometry`) into a few merged
 *   2D paths: no live 3D, no masks or blend modes on anything that moves, and
 *   the still frame rasterises once.
 * - Only `transform`/`opacity` animate (Web Animations, so they stay on the
 *   compositor; see `motionPlan`), each on its own small layer. 'full'
 *   (desktop) runs grid scroll, desk pulse, two packets, tag bob, beam flicker
 *   and five twinkling stars; 'lite' (phones, low-power devices, Save-Data)
 *   runs just the grid scroll and the pulse; 'still' runs nothing.
 * - Everything pauses while the tab is hidden, the art is off-screen, or
 *   someone is typing on a small screen. prefers-reduced-motion always wins.
 *
 * Seeded (a seed always draws the same scene). Purely decorative: aria-hidden,
 * nothing focusable, no images or requests.
 */

const palette: ArtPalette = {
  cyan: colors.cyan,
  violet: colors.violet,
  violetLight: colors.violetLight,
  lime: colors.lime,
  tint,
};

/**
 * Film grain, scanlines and vignette as one static layer (grain alpha baked
 * into the tile instead of an opacity/blend over moving content).
 */
const NOISE = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.0385 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>',
)}")`;

const GRID = gridLayer();
const SUN = { cx: RIG.width / 2, cy: RIG.horizon - 12, r: 158 };
/** Horizon glow bands (the old box-shadow: 18px 3px cyan, 60px 14px violet). */
const GLOW_C = glowBand(0.55, 1 + 3, 18);
const GLOW_V = glowBand(0.35, 1 + 14, 60);
type GlowBand = ReturnType<typeof glowBand>;

export interface AuthHeroArtProps {
  /** Seed for the generated layout (stars, skyline, desks, traces). */
  seed?: number;
  /** Show the HUD readouts (hidden in the compact mobile banner). */
  hud?: boolean;
  /**
   * Motion set: 'auto' (default) picks 'full' on desktop and 'lite' on phones
   * and low-power devices; 'still' is the static frame. Reduced motion always
   * forces 'still'.
   */
  mode?: AuthArtMode | "auto";
}

interface NavigatorHints {
  connection?: { saveData?: boolean };
  deviceMemory?: number;
  hardwareConcurrency?: number;
}

function useArtMode(requested: AuthArtMode | "auto") {
  const reducedMotion = usePrefersReducedMotion();
  const narrow = useMediaQuery("(max-width: 880px)", { noSsr: true });
  const nav = (typeof navigator === "undefined" ? {} : navigator) as
    NavigatorHints | Record<string, never>;
  return {
    reducedMotion,
    mode: chooseArtMode(requested, {
      reducedMotion,
      narrow,
      saveData: nav.connection?.saveData,
      deviceMemory: nav.deviceMemory,
      cores: nav.hardwareConcurrency,
    }),
  };
}

/**
 * True while the motion should be paused: tab hidden, art scrolled out of
 * view, or a text field focused on a small screen (typing, keyboard up).
 */
function usePaused(ref: React.RefObject<HTMLElement | null>, active: boolean) {
  const [hidden, setHidden] = React.useState(
    () => typeof document !== "undefined" && document.hidden,
  );
  const [offscreen, setOffscreen] = React.useState(false);
  const [typing, setTyping] = React.useState(false);

  React.useEffect(() => {
    if (!active) return;
    const onVisibility = () => setHidden(document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [active]);

  React.useEffect(() => {
    const el = ref.current;
    if (!active || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) setOffscreen(!e.isIntersecting);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [active, ref]);

  React.useEffect(() => {
    if (!active) return;
    const small = () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 879.98px)").matches;
    const isField = (t: EventTarget | null) =>
      t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
    const onIn = (e: FocusEvent) => setTyping(isField(e.target) && small());
    const onOut = () => setTyping(false);
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    };
  }, [active]);

  return active && (hidden || offscreen || typing);
}

/**
 * Runs the mode's Web Animations on the art's elements and pauses/resumes
 * them; cancels everything on unmount or when the mode changes.
 */
function useMotion(
  ref: React.RefObject<HTMLElement | null>,
  plan: ReturnType<typeof motionPlan>,
  paused: boolean,
) {
  const running = React.useRef<Animation[]>([]);
  React.useEffect(() => {
    const root = ref.current;
    if (!root || plan.length === 0) return;
    const anims: Animation[] = [];
    for (const spec of plan) {
      const el = root.querySelectorAll<HTMLElement | SVGElement>(spec.target)[
        spec.index
      ];
      if (el && typeof el.animate === "function")
        anims.push(el.animate(spec.frames as Keyframe[], spec.timing));
    }
    running.current = anims;
    return () => {
      anims.forEach((a) => a.cancel());
      running.current = [];
    };
  }, [ref, plan]);
  React.useEffect(() => {
    for (const a of running.current) {
      if (paused) a.pause();
      else a.play();
    }
  }, [paused, plan]);
}

const Paths = ({ paths }: { paths: ArtPath[] }) => (
  <>
    {paths.map((p, i) => (
      <path key={i} d={p.d} fill={p.fill} fillOpacity={p.opacity} />
    ))}
  </>
);

/** Latency readout: updated from JS every 1.5 s, only while animating. */
function Ping({ pings, running }: { pings: number[]; running: boolean }) {
  const [i, setI] = React.useState(0);
  React.useEffect(() => {
    if (!running) return;
    const t = window.setInterval(
      () => setI((n) => (n + 1) % pings.length),
      1500,
    );
    return () => window.clearInterval(t);
  }, [running, pings.length]);
  return (
    <b className="hlAuthArt-ping">{String(pings[i]).padStart(3, "0")}ms</b>
  );
}

export function AuthHeroArt({
  seed = 2026,
  hud = true,
  mode: requested = "auto",
}: AuthHeroArtProps) {
  const scene = React.useMemo(() => generateAuthScene(seed), [seed]);
  const { mode, reducedMotion } = useArtMode(requested);
  const ref = React.useRef<HTMLDivElement>(null);
  const paused = usePaused(ref, mode !== "still");
  const full = mode === "full";

  const g = React.useMemo(() => {
    const beacon = beaconGeometry(scene);
    const twinkles = full ? twinkleStars(scene) : [];
    const packets = full ? packetMotion(scene, palette) : [];
    return {
      plan: planGeometry(scene, palette),
      twinkles,
      stars: starPaths(scene, new Set(twinkles.map((t) => t.i))),
      skyline: skylinePaths(scene, palette),
      beacon,
      packets,
      motion: motionPlan(mode, packets, twinkles),
    };
  }, [scene, full, mode]);
  useMotion(ref, g.motion, paused);
  const { beacon } = g;

  return (
    <Box
      ref={ref}
      aria-hidden="true"
      data-testid="auth-hero-art"
      data-seed={seed}
      data-mode={mode}
      data-paused={paused ? "true" : "false"}
      data-motion={reducedMotion ? "reduced" : mode}
      className={[
        "hlAuthArt",
        `hlAuthArt--${mode}`,
        mode === "still" && "hlAuthArt--static",
        paused && "hlAuthArt--paused",
      ]
        .filter(Boolean)
        .join(" ")}
      sx={rootSx}
    >
      <div className="hlAuthArt-rig">
        {/* Static base: sky, sun, stars, skyline, floor and converging grid */}
        <svg
          className="hlAuthArt-base"
          width={RIG.width}
          height={RIG.height}
          viewBox={`0 0 ${RIG.width} ${RIG.height}`}
          focusable="false"
        >
          <defs>
            <linearGradient id="hlaSky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={colors.bg} />
              <stop offset="0.45" stopColor="#0b0920" />
              <stop offset="0.8" stopColor="#1a0f45" />
              <stop offset="1" stopColor="#2b1670" />
            </linearGradient>
            <radialGradient id="hlaHalo" cx="0.5" cy="1" r="0.75">
              <stop offset="0" stopColor={colors.violet} stopOpacity="0.55" />
              <stop offset="0.35" stopColor={colors.violet} stopOpacity="0.2" />
              <stop offset="1" stopColor={colors.violet} stopOpacity="0" />
            </radialGradient>
            <linearGradient id="hlaSun" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#c8fbff" />
              <stop offset="0.25" stopColor={colors.cyan} />
              <stop offset="0.7" stopColor={colors.violetLight} />
              <stop offset="1" stopColor={colors.violet} />
            </linearGradient>
            <mask id="hlaSunCut">
              <rect width={RIG.width} height={RIG.horizon} fill="#fff" />
              <path
                fill="#000"
                d={Array.from({ length: 9 }, (_, i) => {
                  const y = SUN.cy - SUN.r * 0.28 + i * 19;
                  return `M0 ${y}h${RIG.width}v${1.5 + i * 1.3}h${-RIG.width}Z`;
                }).join("")}
              />
            </mask>
            <linearGradient
              id="hlaFloor"
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1={RIG.horizon}
              x2="0"
              y2={RIG.horizon + 520}
            >
              <stop offset="0" stopColor="#120b30" />
              <stop offset={120 / 520} stopColor="#0a0718" />
              <stop offset="1" stopColor={colors.bg} />
            </linearGradient>
            <clipPath id="hlaGridClip">
              <rect
                x={GRID.clip.left}
                y={RIG.horizon}
                width={GRID.clip.right - GRID.clip.left}
                height={RIG.height * 2}
              />
            </clipPath>
          </defs>
          <rect
            width={RIG.width}
            height={RIG.horizon + 4}
            fill="url(#hlaSky)"
          />
          <ellipse
            cx={SUN.cx}
            cy={RIG.horizon}
            rx={620}
            ry={300}
            fill="url(#hlaHalo)"
          />
          <g className="hlAuthArt-sun">
            <circle
              cx={SUN.cx}
              cy={SUN.cy}
              r={SUN.r + 26}
              fill="none"
              stroke={tint("cyan", 0.22)}
              strokeWidth="1.5"
              strokeDasharray="2 10"
            />
            <circle
              cx={SUN.cx}
              cy={SUN.cy}
              r={SUN.r}
              fill="url(#hlaSun)"
              mask="url(#hlaSunCut)"
            />
          </g>
          {g.stars.map(([plain, violet], group) => (
            <g key={group} opacity={group === 2 ? 0.6 : undefined}>
              <path d={plain} fill={colors.text} />
              <path d={violet} fill={colors.violetText} />
            </g>
          ))}
          {/* Floor glow; below it the gradient has reached the page colour. */}
          <rect
            x={-400}
            y={RIG.horizon}
            width={RIG.width + 800}
            height={520}
            fill="url(#hlaFloor)"
          />
          <Paths paths={g.skyline} />
          <g clipPath="url(#hlaGridClip)">
            <Paths paths={staticGridLines()} />
          </g>
        </svg>
        {g.twinkles.map((t) => (
          <div
            key={t.i}
            className="hlAuthArt-twinkle"
            style={{
              left: t.x - t.size / 2,
              top: t.y - t.size / 2,
              width: t.size,
              height: t.size,
            }}
          />
        ))}

        {/* The one moving grid layer, under a static screen-space fade */}
        <div className="hlAuthArt-gridFade">
          <div className="hlAuthArt-gridMove" />
        </div>

        {/* Static floor plan, haze and horizon glow */}
        <svg
          className="hlAuthArt-plan"
          width={RIG.width}
          height={RIG.height}
          viewBox={`0 0 ${RIG.width} ${RIG.height}`}
          focusable="false"
        >
          <defs>
            <linearGradient
              id="hlaStage"
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1={g.plan.stage.y1}
              x2="0"
              y2={g.plan.stage.y2}
            >
              <stop offset="0" stopColor={colors.violet} stopOpacity="0.85" />
              <stop offset="1" stopColor={colors.violet} stopOpacity="0.15" />
            </linearGradient>
            <linearGradient id="hlaHaze" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={colors.violet} stopOpacity="0" />
              <stop
                offset="0.27"
                stopColor={colors.violet}
                stopOpacity="0.34"
              />
              <stop offset="0.5" stopColor={colors.violet} stopOpacity="0.16" />
              <stop offset="1" stopColor={colors.violet} stopOpacity="0" />
            </linearGradient>
            <linearGradient id="hlaHorizon" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor={colors.cyan} stopOpacity="0" />
              <stop offset="0.3" stopColor={colors.cyan} />
              <stop offset="0.5" stopColor="#e6fdff" />
              <stop offset="0.7" stopColor={colors.cyan} />
              <stop offset="1" stopColor={colors.cyan} stopOpacity="0" />
            </linearGradient>
            <linearGradient
              id="hlaGridFade"
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1={GRID.fade[0].y}
              x2="0"
              y2={GRID.fade[GRID.fade.length - 1].y}
            >
              {GRID.fade.map((f, i) => (
                <stop
                  key={i}
                  offset={
                    (f.y - GRID.fade[0].y) /
                    (GRID.fade[GRID.fade.length - 1].y - GRID.fade[0].y)
                  }
                  stopColor={f.colour}
                  stopOpacity={f.opacity}
                />
              ))}
            </linearGradient>
            <linearGradient id="hlaRefl" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={colors.cyan} stopOpacity="0.5" />
              <stop offset="0.4" stopColor={colors.violet} stopOpacity="0.3" />
              <stop offset="1" stopColor={colors.violet} stopOpacity="0" />
            </linearGradient>
            <radialGradient
              id="hlaReflFade"
              gradientUnits="userSpaceOnUse"
              cx="0"
              cy="0"
              r="1"
              gradientTransform={`translate(${SUN.cx} ${RIG.horizon}) scale(${SUN.r} 260)`}
            >
              <stop offset="0.3" stopColor="#fff" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
            <mask id="hlaReflMask">
              <rect
                x={SUN.cx - SUN.r}
                y={RIG.horizon}
                width={SUN.r * 2}
                height={260}
                fill="url(#hlaReflFade)"
              />
            </mask>
            {glowGradient("hlaGlowC", colors.cyan, GLOW_C)}
            {glowGradient("hlaGlowV", colors.violet, GLOW_V)}
          </defs>
          {/* Grid fade towards the horizon, then the sun's reflection */}
          <rect
            x={GRID.clip.left}
            y={RIG.horizon}
            width={GRID.clip.right - GRID.clip.left}
            height={GRID.fade[GRID.fade.length - 1].y - RIG.horizon}
            fill="url(#hlaGridFade)"
          />
          <path
            mask="url(#hlaReflMask)"
            fill="url(#hlaRefl)"
            d={Array.from(
              { length: 29 },
              (_, i) =>
                `M${SUN.cx - SUN.r} ${RIG.horizon + i * 9}h${SUN.r * 2}v3h${-SUN.r * 2}Z`,
            ).join("")}
          />
          <Paths paths={g.plan.paths} />
          {!full && <Paths paths={g.plan.aislePackets} />}
          <rect
            x={-400}
            y={RIG.horizon - 40}
            width={RIG.width + 800}
            height={150}
            fill="url(#hlaHaze)"
          />
          {(
            [
              [GLOW_V, "hlaGlowV"],
              [GLOW_C, "hlaGlowC"],
            ] as const
          ).map(([band, id]) => (
            <rect
              key={id}
              x={-400}
              y={RIG.horizon - band.extent}
              width={RIG.width + 800}
              height={band.extent * 2}
              fill={`url(#${id})`}
            />
          ))}
          <rect
            x={-400}
            y={RIG.horizon - 1}
            width={RIG.width + 800}
            height={2}
            fill="url(#hlaHorizon)"
          />
        </svg>
      </div>

      {/* Grain, scanlines and vignette: static, painted straight after the
          static plan so the two can share a layer. */}
      <div className="hlAuthArt-finish" />

      <div className="hlAuthArt-rig hlAuthArt-rig--top">
        {/* Beacon: beam, pulse ring, packets and the tag */}
        <svg
          className="hlAuthArt-beam"
          width={beacon.box.right - beacon.box.left}
          height={beacon.box.bottom - beacon.box.top}
          viewBox={`${beacon.box.left} ${beacon.box.top} ${beacon.box.right - beacon.box.left} ${beacon.box.bottom - beacon.box.top}`}
          style={{ left: beacon.box.left, top: beacon.box.top }}
          focusable="false"
        >
          <defs>
            <linearGradient
              id="hlaBeam"
              gradientUnits="userSpaceOnUse"
              {...beacon.gradient}
            >
              <stop offset="0" stopColor={colors.cyan} stopOpacity="0.75" />
              <stop offset="0.3" stopColor={colors.cyan} stopOpacity="0.35" />
              <stop offset="0.35" stopColor={colors.cyan} stopOpacity="0.26" />
              <stop offset="0.6" stopColor={colors.cyan} stopOpacity="0.1" />
              <stop offset="1" stopColor={colors.cyan} stopOpacity="0" />
            </linearGradient>
            <linearGradient
              id="hlaBeamSide"
              gradientUnits="userSpaceOnUse"
              {...beacon.gradient}
            >
              <stop offset="0" stopColor={colors.cyan} stopOpacity="0.6" />
              <stop offset="0.3" stopColor={colors.cyan} stopOpacity="0.6" />
              <stop offset="1" stopColor={colors.cyan} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={beacon.body} fill="url(#hlaBeam)" />
          <path d={beacon.sides} fill="url(#hlaBeamSide)" />
        </svg>
        <div
          className="hlAuthArt-pulse"
          style={{
            left: beacon.pulse.left,
            top: beacon.pulse.top,
            width: beacon.pulse.width,
            height: beacon.pulse.height,
            borderWidth: `${beacon.pulse.borderY}px ${beacon.pulse.borderX}px`,
          }}
        />
        {g.packets.map((p, i) => (
          <div
            key={i}
            className="hlAuthArt-packet"
            style={{
              width: p.width,
              height: p.height,
              marginLeft: -p.width / 2,
              marginTop: -p.height / 2,
              backgroundColor: p.colour,
              boxShadow: `0 0 6px ${p.colour}`,
              transform: p.frames[0].transform,
            }}
          />
        ))}
        <div
          className="hlAuthArt-tag"
          style={{ left: beacon.label.x, top: beacon.label.y }}
        >
          <span className="hlAuthArt-tagKicker">{"// YOUR DESK"}</span>
          <span className="hlAuthArt-tagId">{scene.you.id}</span>
        </div>
      </div>

      {hud && (
        <div className="hlAuthArt-hud">
          <div className="hlAuthArt-hudRow">
            <span>{"// NODES ONLINE"}</span>
            <b>
              {scene.online}
              <i>/{scene.total}</i>
            </b>
          </div>
          <div className="hlAuthArt-bars">
            {Array.from({ length: 16 }, (_, i) => (
              <span
                key={i}
                className={
                  i < Math.round((scene.online / scene.total) * 16)
                    ? "on"
                    : undefined
                }
              />
            ))}
          </div>
          <div className="hlAuthArt-hudRow">
            <span>PING</span>
            <Ping pings={scene.pings} running={full && !paused} />
          </div>
          <div className="hlAuthArt-hudRow">
            <span>UPLINK</span>
            <b className="lime">10 GB/S</b>
          </div>
        </div>
      )}
    </Box>
  );
}

function glowGradient(id: string, c: string, band: GlowBand) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      {band.stops.map((s, i) => (
        <stop key={i} offset={s.offset} stopColor={c} stopOpacity={s.opacity} />
      ))}
    </linearGradient>
  );
}

/** The converging grid lines do not depend on the seed: build them once. */
let gridLineCache: ArtPath[] | undefined;
const staticGridLines = () => (gridLineCache ??= gridLinePaths(palette));

const rootSx = {
  position: "absolute",
  inset: 0,
  overflow: "hidden",
  pointerEvents: "none",
  userSelect: "none",
  backgroundColor: colors.bg,
  // Horizon height (screen) and rig scale, per breakpoint.
  "--hz": "120px",
  "--s": 0.46,
  "@media (min-width: 480px)": { "--hz": "150px", "--s": 0.62 },
  "@media (min-width: 880px)": { "--hz": "24%", "--s": 0.82 },
  "@media (min-width: 1280px)": { "--s": 0.92 },
  "@media (min-width: 1760px)": { "--s": 1.06 },

  "& svg": { display: "block", position: "absolute", overflow: "visible" },

  "& .hlAuthArt-rig": {
    position: "absolute",
    left: "50%",
    top: "var(--hz)",
    width: RIG.width,
    height: RIG.height,
    marginLeft: `${-RIG.width / 2}px`,
    marginTop: `${-RIG.horizon}px`,
    transform: "scale(var(--s))",
    transformOrigin: `${RIG.width / 2}px ${RIG.horizon}px`,
  },
  "& .hlAuthArt-base, & .hlAuthArt-plan": {
    left: 0,
    top: 0,
  },
  // A smaller sun in the compact banner keeps clear of the brand.
  "& .hlAuthArt-sun": {
    transformOrigin: `${RIG.width / 2}px ${RIG.horizon}px`,
    transform: "scale(0.7)",
    "@media (min-width: 480px)": { transform: "scale(0.85)" },
    "@media (min-width: 880px)": { transform: "none" },
  },
  // The sky gradient does not reach the top of tall containers: extend it.
  "& .hlAuthArt-rig:not(.hlAuthArt-rig--top)::before": {
    content: '""',
    position: "absolute",
    left: -2000,
    right: -2000,
    top: -2000,
    height: 2001,
    backgroundColor: colors.bg,
  },
  "& .hlAuthArt-gridFade": {
    position: "absolute",
    left: GRID.box.left,
    top: GRID.box.top,
    width: GRID.box.width,
    height: GRID.box.height,
    overflow: "hidden",
  },
  "& .hlAuthArt-gridMove": {
    position: "absolute",
    left: GRID.el.left,
    top: GRID.el.top,
    width: GRID.el.width,
    height: GRID.el.height,
    transformOrigin: "0 0",
    transform: GRID.transform(0),
    backgroundImage: gridTile(colors.violet),
    backgroundRepeat: "repeat-y",
  },
  "& .hlAuthArt-pulse": {
    position: "absolute",
    boxSizing: "border-box",
    borderStyle: "solid",
    borderColor: colors.cyan,
    borderRadius: "50%",
    // Still frame of the pulse.
    transform: "scale(1.6)",
    opacity: 0.5,
  },
  "& .hlAuthArt-packet": { position: "absolute", left: 0, top: 0 },
  "& .hlAuthArt-twinkle": {
    position: "absolute",
    borderRadius: "50%",
    background: `radial-gradient(circle, ${colors.text} 0 26%, ${tint("cyan", 0.35)} 34%, transparent 70%)`,
  },
  "& .hlAuthArt-tag": {
    position: "absolute",
    transform: "translate(-50%, -100%)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "2px",
    padding: "6px 10px 7px",
    fontFamily: fonts.mono,
    whiteSpace: "nowrap",
    color: colors.cyan,
    backgroundColor: "rgba(6,7,11,0.82)",
    border: `1px solid ${tint("cyan", 0.6)}`,
    boxShadow: `0 0 18px -4px ${tint("cyan", 0.8)}`,
    "&::after": {
      content: '""',
      position: "absolute",
      left: "50%",
      top: "100%",
      width: "1px",
      height: 22,
      backgroundColor: tint("cyan", 0.7),
    },
  },
  "& .hlAuthArt-tagKicker": {
    fontSize: 11,
    letterSpacing: "0.18em",
    color: colors.textMuted,
  },
  "& .hlAuthArt-tagId": {
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: "0.08em",
  },

  // Screen-space finish
  "& .hlAuthArt-finish": {
    position: "absolute",
    inset: 0,
    backgroundImage: [
      "radial-gradient(ellipse 85% 75% at 50% 35%, transparent 55%, rgba(6,7,11,0.8) 100%)",
      "repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 3px)",
      NOISE,
    ].join(","),
  },

  "& .hlAuthArt-hud": {
    position: "absolute",
    top: "clamp(22px,4vw,56px)",
    right: "clamp(22px,4vw,56px)",
    width: 196,
    display: "none",
    flexDirection: "column",
    gap: "7px",
    padding: "12px 14px",
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: "0.14em",
    color: colors.textMuted,
    backgroundColor: "rgba(6,7,11,0.72)",
    border: `1px solid ${tint("cyan", 0.22)}`,
    borderLeft: `2px solid ${colors.cyan}`,
    "@media (min-width: 1100px)": { display: "flex" },
    "@media (min-width: 560px) and (max-width: 879.98px)": { display: "flex" },
    "& b": { fontWeight: 700, color: colors.cyan, letterSpacing: "0.08em" },
    "& b.lime": { color: colors.lime },
    "& i": { fontStyle: "normal", color: colors.textDim },
  },
  "& .hlAuthArt-hudRow": {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  "& .hlAuthArt-ping": { fontSize: 12, lineHeight: "1.3em", height: "1.3em" },
  "& .hlAuthArt-bars": {
    display: "grid",
    gridTemplateColumns: "repeat(16, 1fr)",
    gap: "2px",
    "& span": { height: 6, backgroundColor: tint("cyan", 0.16) },
    "& span.on": { backgroundColor: colors.lime },
  },

  // Layer hints for the two always-moving layers, only while they move.
  "&.hlAuthArt--lite:not(.hlAuthArt--paused), &.hlAuthArt--full:not(.hlAuthArt--paused)":
    {
      "& .hlAuthArt-gridMove": { willChange: "transform" },
      "& .hlAuthArt-pulse": { willChange: "transform, opacity" },
    },
} as const;

export default AuthHeroArt;
