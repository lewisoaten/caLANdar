import * as React from "react";
import Box from "@mui/material/Box";
import { keyframes } from "@mui/material/styles";
import { colors, fonts, tint } from "../hl/tokens";
import { usePrefersReducedMotion } from "../hl/usePrefersReducedMotion";
import {
  PERSPECTIVE_ORIGIN_Y,
  RIG,
  generateAuthScene,
  projectPlanPoint,
  type Desk,
  type DeskState,
} from "./authArtModel";

/*
 * Generated hero artwork for the signed-out pages: a synthwave horizon with a
 * striped sun and server-tower skyline, a scrolling neon grid floor, and the
 * seat-map floor plan hovering above it (desk pods, circuit traces, data
 * packets and a beacon over "your desk"), finished with HUD readouts,
 * scanlines, film grain and a vignette.
 *
 * Built only from SVG and CSS: no images, no requests, no dependencies. All
 * motion is CSS (transform/opacity, plus stroke-dashoffset on a few short
 * paths) and stops entirely under prefers-reduced-motion; the still frame is
 * designed to stand on its own. The layout is seeded, so a seed always draws
 * the same scene. Purely decorative: aria-hidden, nothing focusable.
 */

const gridScroll = keyframes`
  from { transform: translate3d(0, 0, 0); }
  to { transform: translate3d(0, ${RIG.cell}px, 0); }
`;
const planBob = keyframes`
  from { transform: translateZ(0); }
  to { transform: translateZ(14px); }
`;
const labelBob = keyframes`
  from { transform: translate(-50%, -100%) translateY(0); }
  to { transform: translate(-50%, -100%) translateY(-9px); }
`;
const twinkle = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.25; }
`;
const ring = keyframes`
  from { transform: scale(0.5); opacity: 0.95; }
  to { transform: scale(2.6); opacity: 0; }
`;
const packet = keyframes`
  from { stroke-dashoffset: 100; }
  to { stroke-dashoffset: 0; }
`;
const flicker = keyframes`
  0%, 100% { opacity: 1; }
  45% { opacity: 0.78; }
  50% { opacity: 0.95; }
  55% { opacity: 0.7; }
`;
const sweep = keyframes`
  0% { transform: translate3d(0, -40%, 0); opacity: 0; }
  12% { opacity: 1; }
  70% { opacity: 1; }
  100% { transform: translate3d(0, 260%, 0); opacity: 0; }
`;
/** Ticker reel: 8 values plus a repeat of the first (8/9 of its height). */
const tick = keyframes`
  from { transform: translateY(0); }
  to { transform: translateY(-88.8889%); }
`;

const deskTone: Record<DeskState, { stroke: string; fill: string }> = {
  lime: { stroke: colors.lime, fill: tint("lime", 0.16) },
  violet: { stroke: colors.violetLight, fill: tint("violet", 0.26) },
  empty: { stroke: tint("cyan", 0.42), fill: "rgba(6,7,11,0.55)" },
  you: { stroke: colors.cyan, fill: tint("cyan", 0.38) },
};

const deskPath = ({ x, y, w, h }: Desk, cut = 9) =>
  `M${x + cut} ${y}H${x + w}V${y + h - cut}L${x + w - cut} ${y + h}H${x}V${y + cut}Z`;

/** Tiled film grain, rasterised once by the browser. */
const NOISE = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.55 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>',
)}")`;

export interface AuthHeroArtProps {
  /** Seed for the generated layout (stars, skyline, desks, traces). */
  seed?: number;
  /** Show the HUD readouts (hidden in the compact mobile banner). */
  hud?: boolean;
}

export function AuthHeroArt({ seed = 2026, hud = true }: AuthHeroArtProps) {
  const scene = React.useMemo(() => generateAuthScene(seed), [seed]);
  const reduced = usePrefersReducedMotion();

  const planLeft = RIG.planeWidth / 2 - RIG.planWidth / 2;
  const planTop = RIG.planeFar - RIG.planNear - RIG.planDepth;
  const beamHeight = 300;
  const you = scene.you;
  const label = projectPlanPoint(
    you.x + you.w / 2,
    you.y + you.h / 2,
    RIG.planLift + beamHeight * 0.62,
  );
  const sun = { cx: RIG.width / 2, cy: RIG.horizon - 12, r: 158 };
  const pings = [...scene.pings, scene.pings[0]];

  return (
    <Box
      aria-hidden="true"
      data-testid="auth-hero-art"
      data-seed={seed}
      data-motion={reduced ? "reduced" : "full"}
      className={`hlAuthArt${reduced ? " hlAuthArt--static" : ""}`}
      sx={rootSx}
    >
      <div className="hlAuthArt-rig">
        {/* Sky, sun and stars */}
        <svg
          className="hlAuthArt-sky"
          width={RIG.width}
          height={RIG.horizon + 4}
          viewBox={`0 0 ${RIG.width} ${RIG.horizon + 4}`}
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
              {Array.from({ length: 9 }, (_, i) => {
                const y = sun.cy - sun.r * 0.28 + i * 19;
                return (
                  <rect
                    key={i}
                    x="0"
                    y={y}
                    width={RIG.width}
                    height={1.5 + i * 1.3}
                    fill="#000"
                  />
                );
              })}
            </mask>
          </defs>
          <rect
            width={RIG.width}
            height={RIG.horizon + 4}
            fill="url(#hlaSky)"
          />
          <ellipse
            cx={sun.cx}
            cy={RIG.horizon}
            rx={620}
            ry={300}
            fill="url(#hlaHalo)"
          />
          <g className="hlAuthArt-sun">
            <circle
              cx={sun.cx}
              cy={sun.cy}
              r={sun.r + 26}
              fill="none"
              stroke={tint("cyan", 0.22)}
              strokeWidth="1.5"
              strokeDasharray="2 10"
            />
            <circle
              cx={sun.cx}
              cy={sun.cy}
              r={sun.r}
              fill="url(#hlaSun)"
              mask="url(#hlaSunCut)"
            />
          </g>
        </svg>
        {[0, 1, 2].map((group) => (
          <svg
            key={group}
            className={`hlAuthArt-stars hlAuthArt-stars-${group}`}
            width={RIG.width}
            height={RIG.horizon}
            viewBox={`0 0 ${RIG.width} ${RIG.horizon}`}
            focusable="false"
          >
            {scene.stars
              .filter((s) => s.group === group)
              .map((s, i) => (
                <circle
                  key={i}
                  cx={s.x}
                  cy={s.y}
                  r={s.r}
                  fill={i % 7 === 0 ? colors.violetText : colors.text}
                />
              ))}
          </svg>
        ))}

        {/* Floor: grid plane plus the floating floor plan */}
        <div className="hlAuthArt-floorBase" />
        <div
          className="hlAuthArt-reflection"
          style={{ left: sun.cx - sun.r, width: sun.r * 2 }}
        />
        <div className="hlAuthArt-floor">
          <div className="hlAuthArt-plane">
            <div className="hlAuthArt-gridFade">
              <div className="hlAuthArt-gridMove" />
            </div>
            <div className="hlAuthArt-planRig">
              <svg
                className="hlAuthArt-plan"
                width={RIG.planWidth}
                height={RIG.planDepth}
                viewBox={`0 0 ${RIG.planWidth} ${RIG.planDepth}`}
                style={{ left: planLeft, top: planTop }}
                focusable="false"
              >
                <defs>
                  <linearGradient id="hlaStage" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0"
                      stopColor={colors.violet}
                      stopOpacity="0.85"
                    />
                    <stop
                      offset="1"
                      stopColor={colors.violet}
                      stopOpacity="0.15"
                    />
                  </linearGradient>
                </defs>
                {/* Room outline with chamfered corners */}
                <path
                  d={`M40 0H${RIG.planWidth}V${RIG.planDepth - 40}L${RIG.planWidth - 40} ${RIG.planDepth}H0V40Z`}
                  fill="rgba(8,10,22,0.55)"
                  stroke={tint("cyan", 0.35)}
                  strokeWidth="3"
                />
                <path
                  d={`M0 120V40L40 0H160M${RIG.planWidth} ${RIG.planDepth - 120}V${RIG.planDepth - 40}L${RIG.planWidth - 40} ${RIG.planDepth}H${RIG.planWidth - 160}`}
                  fill="none"
                  stroke={colors.cyan}
                  strokeWidth="6"
                />
                {/* Stage */}
                <rect
                  x={scene.stage.x - 14}
                  y={scene.stage.y - 14}
                  width={scene.stage.w + 28}
                  height={scene.stage.h + 28}
                  fill={tint("violet", 0.12)}
                />
                <rect
                  x={scene.stage.x}
                  y={scene.stage.y}
                  width={scene.stage.w}
                  height={scene.stage.h}
                  fill="url(#hlaStage)"
                  stroke={colors.violetLight}
                  strokeWidth="3"
                />
                {/* Traces: a wide faint glow pass, the line, then packets */}
                {scene.traces.map((t, i) => (
                  <path
                    key={`g${i}`}
                    d={t.d}
                    fill="none"
                    stroke={tint("cyan", 0.12)}
                    strokeWidth="12"
                  />
                ))}
                {scene.traces.map((t, i) => (
                  <path
                    key={`l${i}`}
                    d={t.d}
                    fill="none"
                    stroke={tint("cyan", 0.6)}
                    strokeWidth="2.5"
                  />
                ))}
                {scene.traces
                  .filter((t) => t.packet)
                  .map((t, i) => (
                    <path
                      key={`p${i}`}
                      className="hlAuthArt-packet"
                      d={t.d}
                      pathLength={100}
                      fill="none"
                      stroke={i % 3 === 0 ? colors.lime : "#d6fbff"}
                      strokeWidth="5"
                      strokeLinecap="square"
                      style={{
                        animationDuration: `${t.duration}s`,
                        animationDelay: `-${t.delay}s`,
                      }}
                    />
                  ))}
                {/* Desks */}
                {scene.desks.map((d) => {
                  const tone = deskTone[d.state];
                  const my = d.monitor === "top" ? d.y + 4 : d.y + d.h - 9;
                  return (
                    <g key={d.id}>
                      {d.state !== "empty" && (
                        <path
                          d={deskPath(d)}
                          fill="none"
                          stroke={tone.stroke}
                          strokeOpacity="0.22"
                          strokeWidth="10"
                        />
                      )}
                      <path
                        d={deskPath(d)}
                        fill={tone.fill}
                        stroke={tone.stroke}
                        strokeWidth={d.state === "you" ? 4 : 2.5}
                      />
                      <rect
                        x={d.x + 12}
                        y={my}
                        width={d.w - 24}
                        height={5}
                        fill={
                          d.state === "empty" ? tint("cyan", 0.35) : tone.stroke
                        }
                      />
                    </g>
                  );
                })}
                {/* Nodes */}
                {scene.nodes.map((n, i) => {
                  const c =
                    n.tone === "lime"
                      ? colors.lime
                      : n.tone === "violet"
                        ? colors.violetLight
                        : colors.cyan;
                  return (
                    <g key={i}>
                      <circle
                        className="hlAuthArt-ring"
                        cx={n.x}
                        cy={n.y}
                        r={12}
                        fill="none"
                        stroke={c}
                        strokeWidth="3"
                        style={{ animationDelay: `-${n.delay}s` }}
                      />
                      <rect
                        x={n.x - 6}
                        y={n.y - 6}
                        width={12}
                        height={12}
                        fill={c}
                        transform={`rotate(45 ${n.x} ${n.y})`}
                      />
                    </g>
                  );
                })}
                {/* Your desk: target brackets and a pulse ring */}
                <circle
                  className="hlAuthArt-ring hlAuthArt-ring--you"
                  cx={you.x + you.w / 2}
                  cy={you.y + you.h / 2}
                  r={40}
                  fill="none"
                  stroke={colors.cyan}
                  strokeWidth="4"
                />
                <path
                  d={(() => {
                    const p = 14;
                    const l = 18;
                    const x0 = you.x - p;
                    const y0 = you.y - p;
                    const x1 = you.x + you.w + p;
                    const y1 = you.y + you.h + p;
                    return `M${x0} ${y0 + l}V${y0}H${x0 + l}M${x1 - l} ${y0}H${x1}V${y0 + l}M${x1} ${y1 - l}V${y1}H${x1 - l}M${x0 + l} ${y1}H${x0}V${y1 - l}`;
                  })()}
                  fill="none"
                  stroke={colors.cyan}
                  strokeWidth="4"
                />
              </svg>
              <div
                className="hlAuthArt-beam"
                style={{
                  left: planLeft + you.x - 10,
                  top: planTop + you.y + you.h / 2 - beamHeight,
                  width: you.w + 20,
                  height: beamHeight,
                }}
              />
            </div>
          </div>
        </div>

        {/* Skyline in front of the sun, then the horizon glow and fog */}
        <svg
          className="hlAuthArt-skyline"
          width={RIG.width}
          height={RIG.horizon + 2}
          viewBox={`0 0 ${RIG.width} ${RIG.horizon + 2}`}
          focusable="false"
        >
          {scene.towers.map((t, i) => (
            <g key={i}>
              <rect
                x={t.x}
                y={RIG.horizon - t.h}
                width={t.w}
                height={t.h + 2}
                fill="#07060f"
              />
              <rect
                x={t.x}
                y={RIG.horizon - t.h}
                width={t.w}
                height={1.5}
                fill={i % 4 === 0 ? tint("violet", 0.9) : tint("cyan", 0.5)}
              />
              {t.lights.map((l, j) => (
                <rect
                  key={j}
                  x={l.x}
                  y={l.y}
                  width={j % 3 === 0 ? 6 : 3}
                  height={1.6}
                  fill={
                    l.tone === "lime"
                      ? colors.lime
                      : l.tone === "violet"
                        ? colors.violetLight
                        : colors.cyan
                  }
                  opacity="0.85"
                />
              ))}
            </g>
          ))}
        </svg>
        <div className="hlAuthArt-haze" />
        <div className="hlAuthArt-horizon" />
        <div className="hlAuthArt-tag" style={{ left: label.x, top: label.y }}>
          <span className="hlAuthArt-tagKicker">{"// YOUR DESK"}</span>
          <span className="hlAuthArt-tagId">{you.id}</span>
        </div>
      </div>

      <div className="hlAuthArt-sweep" />
      <div className="hlAuthArt-grain" />
      <div className="hlAuthArt-scan" />
      <div className="hlAuthArt-vignette" />

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
            <b className="hlAuthArt-ticker">
              <span className="hlAuthArt-tickerReel">
                {pings.map((p, i) => (
                  <span key={i}>{String(p).padStart(3, "0")}ms</span>
                ))}
              </span>
            </b>
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

const planeHeight = RIG.planeFar + RIG.planeNear;

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
  "& .hlAuthArt-sky": { left: 0, top: 0 },
  // A smaller sun in the compact banner keeps clear of the brand.
  "& .hlAuthArt-sun": {
    transformOrigin: `${RIG.width / 2}px ${RIG.horizon}px`,
    transform: "scale(0.7)",
    "@media (min-width: 480px)": { transform: "scale(0.85)" },
    "@media (min-width: 880px)": { transform: "none" },
  },
  // The sky gradient does not reach the top of tall containers: extend it.
  "& .hlAuthArt-rig::before": {
    content: '""',
    position: "absolute",
    left: -2000,
    right: -2000,
    top: -2000,
    height: 2001,
    backgroundColor: colors.bg,
  },
  "& .hlAuthArt-stars": { left: 0, top: 0 },
  "& .hlAuthArt-stars-0": { animation: `${twinkle} 3.4s ease-in-out infinite` },
  "& .hlAuthArt-stars-1": {
    animation: `${twinkle} 4.6s ease-in-out -1.7s infinite`,
  },
  "& .hlAuthArt-stars-2": {
    opacity: 0.6,
    animation: `${twinkle} 2.6s ease-in-out -0.8s infinite`,
  },
  "& .hlAuthArt-floorBase": {
    position: "absolute",
    left: -2000,
    right: -2000,
    top: RIG.horizon,
    bottom: -3000,
    background: `linear-gradient(180deg, #120b30 0, #0a0718 120px, ${colors.bg} 520px)`,
  },
  "& .hlAuthArt-reflection": {
    position: "absolute",
    top: RIG.horizon,
    height: 260,
    background: `linear-gradient(180deg, ${tint("cyan", 0.5)} 0, ${tint("violet", 0.3)} 40%, transparent 100%)`,
    maskImage:
      "repeating-linear-gradient(180deg, #000 0 3px, transparent 3px 9px), radial-gradient(ellipse 50% 100% at 50% 0, #000 30%, transparent 100%)",
    maskComposite: "intersect",
  },
  "& .hlAuthArt-floor": {
    position: "absolute",
    inset: 0,
    perspective: `${RIG.perspective}px`,
    perspectiveOrigin: `${RIG.width / 2}px ${PERSPECTIVE_ORIGIN_Y}px`,
  },
  "& .hlAuthArt-plane": {
    position: "absolute",
    left: RIG.width / 2 - RIG.planeWidth / 2,
    top: RIG.horizon + RIG.eye - RIG.planeFar,
    width: RIG.planeWidth,
    height: planeHeight,
    transformOrigin: `50% ${RIG.planeFar}px`,
    transform: `rotateX(${RIG.tilt}deg)`,
    transformStyle: "preserve-3d",
  },
  "& .hlAuthArt-gridFade": {
    position: "absolute",
    inset: 0,
    overflow: "hidden",
    maskImage: `linear-gradient(180deg, transparent 2%, rgba(0,0,0,0.55) 22%, #000 60%), radial-gradient(ellipse 50% 100% at 50% 100%, #000 55%, transparent 100%)`,
    maskComposite: "intersect",
  },
  "& .hlAuthArt-gridMove": {
    position: "absolute",
    left: 0,
    right: 0,
    top: -RIG.cell,
    bottom: 0,
    backgroundImage: [
      `linear-gradient(90deg, ${tint("cyan", 0.55)} 3px, transparent 3px)`,
      `linear-gradient(0deg, ${tint("violet", 0.75)} 3px, transparent 3px)`,
    ].join(","),
    backgroundSize: `${RIG.cell}px ${RIG.cell}px`,
    backgroundPosition: `${(RIG.planeWidth / 2) % RIG.cell}px 0`,
    willChange: "transform",
    animation: `${gridScroll} 2.6s linear infinite`,
  },
  "& .hlAuthArt-planRig": {
    position: "absolute",
    inset: 0,
    transformStyle: "preserve-3d",
    animation: `${planBob} 5s ease-in-out infinite alternate`,
  },
  "& .hlAuthArt-plan": {
    transform: `translateZ(${RIG.planLift}px)`,
  },
  "& .hlAuthArt-packet": {
    strokeDasharray: "5 95",
    strokeDashoffset: 62,
    animation: `${packet} 3s linear infinite`,
  },
  "& .hlAuthArt-ring": {
    transformBox: "fill-box",
    transformOrigin: "center",
    transform: "scale(1.6)",
    opacity: 0.5,
    animation: `${ring} 2.6s ease-out infinite`,
  },
  "& .hlAuthArt-ring--you": { animationDuration: "2s" },
  "& .hlAuthArt-beam": {
    position: "absolute",
    transformOrigin: "50% 100%",
    transform: `translateZ(${RIG.planLift}px) rotateX(-90deg)`,
    background: `linear-gradient(0deg, ${tint("cyan", 0.75)} 0%, ${tint("cyan", 0.28)} 35%, transparent 100%)`,
    borderLeft: `2px solid ${tint("cyan", 0.6)}`,
    borderRight: `2px solid ${tint("cyan", 0.6)}`,
    maskImage: "linear-gradient(0deg, #000 30%, transparent 100%)",
    animation: `${flicker} 3.2s steps(1, end) infinite`,
  },
  "& .hlAuthArt-skyline": { left: 0, top: 0 },
  "& .hlAuthArt-haze": {
    position: "absolute",
    left: -400,
    right: -400,
    top: RIG.horizon - 40,
    height: 150,
    background: `linear-gradient(180deg, transparent 0, ${tint("violet", 0.34)} 27%, ${tint("violet", 0.16)} 50%, transparent 100%)`,
  },
  "& .hlAuthArt-horizon": {
    position: "absolute",
    left: -400,
    right: -400,
    top: RIG.horizon - 1,
    height: 2,
    background: `linear-gradient(90deg, transparent, ${colors.cyan} 30%, #e6fdff 50%, ${colors.cyan} 70%, transparent)`,
    boxShadow: `0 0 18px 3px ${tint("cyan", 0.55)}, 0 0 60px 14px ${tint("violet", 0.35)}`,
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
    animation: `${labelBob} 5s ease-in-out infinite alternate`,
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
  "& .hlAuthArt-sweep": {
    position: "absolute",
    left: 0,
    right: 0,
    top: "var(--hz)",
    height: "30%",
    background: `linear-gradient(180deg, transparent, ${tint("cyan", 0.06)} 70%, ${tint("cyan", 0.16)} 99%, transparent)`,
    animation: `${sweep} 7s ease-in infinite`,
    opacity: 0,
  },
  "& .hlAuthArt-grain": {
    position: "absolute",
    inset: 0,
    backgroundImage: NOISE,
    opacity: 0.07,
  },
  "& .hlAuthArt-scan": {
    position: "absolute",
    inset: 0,
    backgroundImage:
      "repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 3px)",
  },
  "& .hlAuthArt-vignette": {
    position: "absolute",
    inset: 0,
    background: `radial-gradient(ellipse 85% 75% at 50% 35%, transparent 55%, rgba(6,7,11,0.8) 100%)`,
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
  "& .hlAuthArt-bars": {
    display: "grid",
    gridTemplateColumns: "repeat(16, 1fr)",
    gap: "2px",
    "& span": { height: 6, backgroundColor: tint("cyan", 0.16) },
    "& span.on": { backgroundColor: colors.lime },
  },
  "& .hlAuthArt-ticker": {
    display: "inline-block",
    height: "1.3em",
    lineHeight: "1.3em",
    overflow: "hidden",
    fontSize: 12,
  },
  "& .hlAuthArt-tickerReel": {
    display: "flex",
    flexDirection: "column",
    animation: `${tick} 12s steps(8, end) infinite`,
    "& span": { height: "1.3em" },
  },

  // Reduced motion: every animation off, the base styles are the still frame.
  "&.hlAuthArt--static *, &.hlAuthArt--static *::before, &.hlAuthArt--static *::after":
    { animation: "none !important" },
  "@media (prefers-reduced-motion: reduce)": {
    "& *, & *::before, & *::after": { animation: "none !important" },
  },
} as const;

export default AuthHeroArt;
