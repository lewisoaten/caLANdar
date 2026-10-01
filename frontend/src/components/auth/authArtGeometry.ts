/**
 * Flat, pre-projected geometry and the motion plan for `AuthHeroArt`.
 *
 * The artwork used to be a live CSS 3D scene (a tilted 2600 x 4080 grid plane
 * with the floor plan floating above it) with ~30 animations, most of them on
 * SVG children (main-thread style + repaint every frame). Here the same scene
 * is projected once, in JS, into a handful of 2D paths merged by colour, so the
 * still frame rasterises once and never repaints. Strokes are emitted as filled
 * outlines in plan space before projection, so they keep the exact perspective
 * foreshortening of the 3D version.
 *
 * Motion is limited to a few deliberately separate layers, and every keyframe
 * here animates `transform` and/or `opacity` only (compositor-only); a unit
 * test enforces that through `ANIMATED_PROPERTIES`.
 */
import {
  PERSPECTIVE_ORIGIN_Y,
  RIG,
  projectFloorPoint,
  projectPlanPoint,
  type AuthScene,
  type DeskState,
} from "./authArtModel";

type Pt = [number, number];

const r1 = (n: number) => Math.round(n * 10) / 10;
const area = (pts: Pt[]) =>
  pts.reduce((s, [x, y], i) => {
    const [x2, y2] = pts[(i + 1) % pts.length];
    return s + x * y2 - x2 * y;
  }, 0);
/** Wind a polygon one way (true) or the other, so nonzero fills merge. */
const wind = (pts: Pt[], positive: boolean) =>
  area(pts) >= 0 === positive ? pts : [...pts].reverse();
const poly = (pts: Pt[]) =>
  `M${pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join("L")}Z`;

/** Plan point -> rig screen point (the plan floats `h` above the grid). */
const toScreen = (pts: Pt[], h: number = RIG.planLift): Pt[] =>
  pts.map(([x, y]) => {
    const p = projectPlanPoint(x, y, h);
    return [p.x, p.y];
  });

const shape = (pts: Pt[]) => poly(wind(toScreen(pts), true));
/** An outline of a closed plan shape: outer and inner edge, nonzero fill. */
const ring = (outer: Pt[], inner: Pt[]) =>
  poly(wind(toScreen(outer), true)) + poly(wind(toScreen(inner), false));

/** Chamfered rectangle (top-left and bottom-right corners), offset by `d`. */
export function chamfer(
  x: number,
  y: number,
  w: number,
  h: number,
  cut: number,
  d = 0,
): Pt[] {
  const c = Math.max(0, cut + d * (2 - Math.SQRT2));
  const [X, Y, W, H] = [x - d, y - d, w + 2 * d, h + 2 * d];
  return [
    [X + c, Y],
    [X + W, Y],
    [X + W, Y + H - c],
    [X + W - c, Y + H],
    [X, Y + H],
    [X, Y + c],
  ];
}
const rect = (x: number, y: number, w: number, h: number): Pt[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
const circle = (cx: number, cy: number, r: number, n = 20): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });

/** A stroked open polyline as one quad per segment (square-ish caps). */
function strokePolyline(pts: Pt[], width: number, h?: number): string {
  let d = "";
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const [ux, uy] = [(bx - ax) / len, (by - ay) / len];
    const [nx, ny] = [(-uy * width) / 2, (ux * width) / 2];
    const e = width / 2;
    const a: Pt = [ax - ux * e, ay - uy * e];
    const b: Pt = [bx + ux * e, by + uy * e];
    d += poly(
      wind(
        toScreen(
          [
            [a[0] + nx, a[1] + ny],
            [b[0] + nx, b[1] + ny],
            [b[0] - nx, b[1] - ny],
            [a[0] - nx, a[1] - ny],
          ],
          h,
        ),
        true,
      ),
    );
  }
  return d;
}

/** Parse the absolute M/H/V/L paths the scene generator emits. */
export function parsePolyline(d: string): Pt[] {
  const pts: Pt[] = [];
  const re = /([MLHV])\s*([-\d.]+)(?:\s+([-\d.]+))?/g;
  let m: RegExpExecArray | null;
  let [x, y] = [0, 0];
  while ((m = re.exec(d))) {
    const a = Number(m[2]);
    if (m[1] === "H") x = a;
    else if (m[1] === "V") y = a;
    else [x, y] = [a, Number(m[3])];
    pts.push([x, y]);
  }
  return pts;
}

const polyLength = (pts: Pt[]) =>
  pts
    .slice(1)
    .reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);

/** Point `s` px along a polyline. */
function pointAt(pts: Pt[], s: number): Pt {
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (s <= len || i === pts.length - 2) {
      const t = Math.min(1, s / (len || 1));
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    s -= len;
  }
  return pts[pts.length - 1];
}

/** The part of a polyline from `s0` to `s1` px. */
function subPolyline(pts: Pt[], s0: number, s1: number): Pt[] {
  const out: Pt[] = [pointAt(pts, s0)];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc > s0 && acc < s1) out.push(pts[i]);
  }
  out.push(pointAt(pts, s1));
  return out;
}

export interface ArtPath {
  d: string;
  fill: string;
  opacity?: number;
}

/** Palette (kept here so the geometry stays a pure module). */
export interface ArtPalette {
  cyan: string;
  violet: string;
  violetLight: string;
  lime: string;
  tint: (name: "cyan" | "violet" | "lime", alpha: number) => string;
}

// ---------------------------------------------------------------------------
// Grid floor

/** Grid line alpha along the plane (plane y: 0 = far edge), from the old mask. */
function depthFade(planeY: number) {
  const f = planeY / (RIG.planeFar + RIG.planeNear);
  if (f <= 0.02) return 0;
  if (f <= 0.22) return ((f - 0.02) / 0.2) * 0.55;
  if (f <= 0.6) return 0.55 + ((f - 0.22) / 0.38) * 0.45;
  return 1;
}
/** Sideways fade: ellipse 50% x 100% at the plane's near centre. */
function sideFade(x: number, planeY: number) {
  const H = RIG.planeFar + RIG.planeNear;
  const u = Math.hypot(x / (RIG.planeWidth / 2), (H - planeY) / H);
  return u <= 0.55 ? 1 : u >= 1 ? 0 : (1 - u) / 0.45;
}

/** Lowest rig y the art ever needs to cover (tall portrait tablets). */
const RIG_BOTTOM = 1800;

/** Floor depth whose grid line lands at the bottom of the art. */
export const NEAR_DEPTH = (() => {
  let [lo, hi] = [-400, 0];
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (projectFloorPoint(0, mid).y > RIG_BOTTOM) lo = mid;
    else hi = mid;
  }
  return Math.floor(hi);
})();

const planeYOf = (depth: number) => RIG.planeFar - depth;

/** Horizontal band of the art the grid can show in (rig x). */
const GRID_X = { left: -150, right: 1350 };

/** Grid alpha along the floor centre line (the fade towards the horizon). */
const centreFade = (planeY: number) => depthFade(planeY) * sideFade(0, planeY);

/**
 * Static converging grid lines (the ones that never move), bucketed by alpha.
 * Only the sideways fade is baked in; the fade towards the horizon is the
 * shared `gridLayer().fade` overlay, which covers the moving lines too.
 */
export function gridLinePaths(p: ArtPalette): ArtPath[] {
  const buckets = new Map<number, string>();
  const y0 = 0.02 * (RIG.planeFar + RIG.planeNear);
  const y1 = planeYOf(NEAR_DEPTH);
  const steps = 18;
  for (let px = 100; px + 3 <= RIG.planeWidth; px += RIG.cell) {
    const x0 = px - RIG.planeWidth / 2;
    for (let i = 0; i < steps; i++) {
      // Denser segments far away, where the fade changes fastest on screen.
      const a = y0 + (y1 - y0) * Math.pow(i / steps, 1.6);
      const b = y0 + (y1 - y0) * Math.pow((i + 1) / steps, 1.6);
      const mid = (a + b) / 2;
      if (centreFade(mid) < 0.01) continue;
      const alpha =
        Math.round(
          Math.min(1, sideFade(x0 + 1.5, mid) / sideFade(0, mid)) * 20,
        ) / 20;
      if (alpha <= 0) continue;
      const quad = [
        [x0, planeYOf(a)],
        [x0 + 3, planeYOf(a)],
        [x0 + 3, planeYOf(b)],
        [x0, planeYOf(b)],
      ].map(([x, dep]) => {
        const s = projectFloorPoint(x, dep);
        return [s.x, s.y] as Pt;
      });
      const xs = quad.map((q) => q[0]);
      if (Math.max(...xs) < GRID_X.left || Math.min(...xs) > GRID_X.right)
        continue;
      buckets.set(alpha, (buckets.get(alpha) ?? "") + poly(wind(quad, true)));
    }
  }
  return [...buckets].map(([alpha, d]) => ({
    d,
    fill: p.tint("cyan", 0.55),
    opacity: alpha,
  }));
}

/** The floor's background gradient (rig y -> colour), as drawn by the base. */
export const FLOOR_STOPS: Array<[number, string]> = [
  [RIG.horizon, "#120b30"],
  [RIG.horizon + 120, "#0a0718"],
  [RIG.horizon + 520, "#06070b"],
];
function floorColour(y: number) {
  const hex = (c: string) =>
    [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  for (let i = 0; i < FLOOR_STOPS.length - 1; i++) {
    const [ya, ca] = FLOOR_STOPS[i];
    const [yb, cb] = FLOOR_STOPS[i + 1];
    if (y <= yb || i === FLOOR_STOPS.length - 2) {
      const t = Math.max(0, Math.min(1, (y - ya) / (yb - ya)));
      const [A, B] = [hex(ca), hex(cb)];
      return `#${A.map((v, k) =>
        Math.round(v + (B[k] - v) * t)
          .toString(16)
          .padStart(2, "0"),
      ).join("")}`;
    }
  }
  return FLOOR_STOPS[FLOOR_STOPS.length - 1][1];
}

/** Layout of the one moving layer: the cross lines of the grid, in 3D. */
export function gridLayer() {
  const planeLeft = RIG.width / 2 - RIG.planeWidth / 2;
  const planeTop = RIG.horizon + RIG.eye - RIG.planeFar;
  const top = RIG.horizon;
  const height = planeYOf(NEAR_DEPTH) + RIG.cell;
  // Element-local coordinates (its top-left is plane (0, -cell)).
  const po = {
    x: RIG.width / 2 - planeLeft,
    y: PERSPECTIVE_ORIGIN_Y - (planeTop - RIG.cell),
  };
  const oy = RIG.planeFar + RIG.cell;
  const transform = (t: number) =>
    `translate(${r1(po.x)}px, ${r1(po.y)}px) perspective(${RIG.perspective}px) ` +
    `translate(0px, ${r1(oy - po.y)}px) rotateX(${RIG.tilt}deg) ` +
    `translate(${-RIG.planeWidth / 2}px, ${-oy}px) translateY(${t}px)`;
  // Fade towards the horizon: the floor colour painted over the lines at
  // 1 - alpha. Same result as masking them, without a mask on (or above) the
  // moving layer.
  const fade: Array<{ y: number; colour: string; opacity: number }> = [];
  for (let i = 0; i <= 14; i++) {
    const planeY = (i / 14) * 0.62 * (RIG.planeFar + RIG.planeNear);
    const y = Math.max(RIG.horizon, projectFloorPoint(0, planeYOf(planeY)).y);
    fade.push({
      y: r1(y),
      colour: floorColour(y),
      opacity: Math.round((1 - centreFade(planeY)) * 1000) / 1000,
    });
  }
  return {
    box: {
      left: GRID_X.left,
      top,
      width: GRID_X.right - GRID_X.left,
      height: RIG_BOTTOM - top,
    },
    el: {
      left: planeLeft - GRID_X.left,
      top: planeTop - RIG.cell - top,
      width: RIG.planeWidth,
      height,
    },
    transform,
    fade,
    clip: GRID_X,
  };
}

/** One 2600 x 120 tile of the moving cross lines, faded sideways. */
export function gridTile(violet: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${RIG.planeWidth}" height="${RIG.cell}">` +
    `<linearGradient id="g"><stop offset="0.003" stop-color="${violet}" stop-opacity="0"/>` +
    `<stop offset="0.23" stop-color="${violet}"/><stop offset="0.77" stop-color="${violet}"/>` +
    `<stop offset="0.997" stop-color="${violet}" stop-opacity="0"/></linearGradient>` +
    `<rect y="${RIG.cell - 3}" width="100%" height="3" fill="url(#g)" fill-opacity="0.75"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// ---------------------------------------------------------------------------
// Floor plan

const deskTone = (
  p: ArtPalette,
): Record<DeskState, { stroke: string; fill: string; monitor: string }> => ({
  lime: { stroke: p.lime, fill: p.tint("lime", 0.16), monitor: p.lime },
  violet: {
    stroke: p.violetLight,
    fill: p.tint("violet", 0.26),
    monitor: p.violetLight,
  },
  empty: {
    stroke: p.tint("cyan", 0.42),
    fill: "rgba(6,7,11,0.55)",
    monitor: p.tint("cyan", 0.35),
  },
  you: { stroke: p.cyan, fill: p.tint("cyan", 0.38), monitor: p.cyan },
});

const nodeColour = (p: ArtPalette, tone: "cyan" | "lime" | "violet") =>
  tone === "lime" ? p.lime : tone === "violet" ? p.violetLight : p.cyan;

/** Fraction of a trace covered by the still-frame packet (dash 5/95 at offset 62). */
const PACKET_AT = 0.38;
const PACKET_LEN = 0.05;

export interface PlanGeometry {
  /** Ordered draw list (merged by fill), all in rig screen px. */
  paths: ArtPath[];
  /** Still-frame packets on the two aisles (left out when they animate). */
  aislePackets: ArtPath[];
  /** Screen y range of the stage, for its vertical gradient. */
  stage: { y1: number; y2: number; d: string };
}

export function planGeometry(scene: AuthScene, p: ArtPalette): PlanGeometry {
  const W = RIG.planWidth;
  const D = RIG.planDepth;
  const paths: ArtPath[] = [];
  const add = (d: string, fill: string, opacity?: number) =>
    d && paths.push({ d, fill, opacity });

  // Room outline with chamfered corners and bright corner accents.
  add(shape(chamfer(0, 0, W, D, 40)), "rgba(8,10,22,0.55)");
  add(
    ring(chamfer(0, 0, W, D, 40, 1.5), chamfer(0, 0, W, D, 40, -1.5)),
    p.tint("cyan", 0.35),
  );
  add(
    strokePolyline(
      [
        [0, 120],
        [0, 40],
        [40, 0],
        [160, 0],
      ],
      6,
    ) +
      strokePolyline(
        [
          [W, D - 120],
          [W, D - 40],
          [W - 40, D],
          [W - 160, D],
        ],
        6,
      ),
    p.cyan,
  );

  // Stage.
  const s = scene.stage;
  add(
    shape(rect(s.x - 14, s.y - 14, s.w + 28, s.h + 28)),
    p.tint("violet", 0.12),
  );
  const stageShape = toScreen(rect(s.x, s.y, s.w, s.h));
  const stage = {
    d: poly(wind(stageShape, true)),
    y1: Math.min(...stageShape.map((q) => q[1])),
    y2: Math.max(...stageShape.map((q) => q[1])),
  };
  paths.push({ d: stage.d, fill: "url(#hlaStage)" });
  add(
    ring(
      rect(s.x - 1.5, s.y - 1.5, s.w + 3, s.h + 3),
      rect(s.x + 1.5, s.y + 1.5, s.w - 3, s.h - 3),
    ),
    p.violetLight,
  );

  // Traces: glow pass, line, then the still-frame packets.
  const traces = scene.traces.map((t) => parsePolyline(t.d));
  add(traces.map((t) => strokePolyline(t, 12)).join(""), p.tint("cyan", 0.12));
  add(traces.map((t) => strokePolyline(t, 2.5)).join(""), p.tint("cyan", 0.6));
  const packets: Record<string, string> = {};
  const aislePackets: ArtPath[] = [];
  scene.traces
    .map((t, i) => ({ t, pts: traces[i], aisle: i < 2 }))
    .filter(({ t }) => t.packet)
    .forEach(({ pts, aisle }, i) => {
      const L = polyLength(pts);
      const d = strokePolyline(
        subPolyline(pts, L * PACKET_AT, L * (PACKET_AT + PACKET_LEN)),
        5,
      );
      const fill = i % 3 === 0 ? p.lime : "#d6fbff";
      if (aisle) aislePackets.push({ d, fill });
      else packets[fill] = (packets[fill] ?? "") + d;
    });
  Object.entries(packets).forEach(([fill, d]) => add(d, fill));

  // Desks, merged per tone: glow, body, outline, monitor.
  const tone = deskTone(p);
  const by = (fn: (d: AuthScene["desks"][number]) => string, pick: string) => {
    const acc = new Map<string, string>();
    for (const desk of scene.desks) {
      const k = (tone[desk.state] as Record<string, string>)[pick];
      acc.set(k, (acc.get(k) ?? "") + fn(desk));
    }
    return acc;
  };
  const sw = (state: DeskState) => (state === "you" ? 4 : 2.5);
  for (const [fill, d] of by(
    (k) =>
      k.state === "empty"
        ? ""
        : ring(
            chamfer(k.x, k.y, k.w, k.h, 9, 5),
            chamfer(k.x, k.y, k.w, k.h, 9, -5),
          ),
    "stroke",
  ))
    add(d, fill, 0.22);
  for (const [fill, d] of by(
    (k) => shape(chamfer(k.x, k.y, k.w, k.h, 9, -sw(k.state) / 2)),
    "fill",
  ))
    add(d, fill);
  for (const [fill, d] of by(
    (k) =>
      ring(
        chamfer(k.x, k.y, k.w, k.h, 9, sw(k.state) / 2),
        chamfer(k.x, k.y, k.w, k.h, 9, -sw(k.state) / 2),
      ),
    "stroke",
  ))
    add(d, fill);
  for (const [fill, d] of by((k) => {
    const my = k.monitor === "top" ? k.y + 4 : k.y + k.h - 9;
    return shape(rect(k.x + 12, my, k.w - 24, 5));
  }, "monitor"))
    add(d, fill);

  // Nodes: the still frame of their pulse ring (scale 1.6, 50%), then diamonds.
  const rings = new Map<string, string>();
  const dots = new Map<string, string>();
  for (const n of scene.nodes) {
    const c = nodeColour(p, n.tone);
    rings.set(
      c,
      (rings.get(c) ?? "") +
        ring(circle(n.x, n.y, 19.2 + 2.4), circle(n.x, n.y, 19.2 - 2.4)),
    );
    dots.set(
      c,
      (dots.get(c) ?? "") +
        shape([
          [n.x, n.y - 8.5],
          [n.x + 8.5, n.y],
          [n.x, n.y + 8.5],
          [n.x - 8.5, n.y],
        ]),
    );
  }
  rings.forEach((d, c) => add(d, c, 0.5));
  dots.forEach((d, c) => add(d, c));

  // Your desk: target brackets.
  const y = scene.you;
  const [x0, y0, x1, y1, l] = [
    y.x - 14,
    y.y - 14,
    y.x + y.w + 14,
    y.y + y.h + 14,
    18,
  ];
  add(
    [
      [
        [x0, y0 + l],
        [x0, y0],
        [x0 + l, y0],
      ],
      [
        [x1 - l, y0],
        [x1, y0],
        [x1, y0 + l],
      ],
      [
        [x1, y1 - l],
        [x1, y1],
        [x1 - l, y1],
      ],
      [
        [x0 + l, y1],
        [x0, y1],
        [x0, y1 - l],
      ],
    ]
      .map((pts) => strokePolyline(pts as Pt[], 4))
      .join(""),
    p.cyan,
  );

  return { paths, aislePackets, stage };
}

// ---------------------------------------------------------------------------
// The beacon over "your desk"

export const BEAM_HEIGHT = 300;

export function beaconGeometry(scene: AuthScene) {
  const you = scene.you;
  const cx = you.x + you.w / 2;
  const cy = you.y + you.h / 2;
  const [bx0, bx1] = [you.x - 12, you.x + you.w + 12];
  const [h0, h1] = [RIG.planLift, RIG.planLift + BEAM_HEIGHT];
  const corners = toScreen(
    [
      [bx0, cy],
      [bx1, cy],
    ],
    h0,
  ).concat(
    toScreen(
      [
        [bx1, cy],
        [bx0, cy],
      ],
      h1,
    ),
  );
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const box = {
    left: Math.floor(Math.min(...xs)) - 2,
    top: Math.floor(Math.min(...ys)) - 2,
    right: Math.ceil(Math.max(...xs)) + 2,
    bottom: Math.ceil(Math.max(...ys)) + 2,
  };
  const side = (x: number) =>
    poly(
      wind(
        toScreen(
          [
            [x, cy],
            [x + 2, cy],
          ],
          h0,
        ).concat(
          toScreen(
            [
              [x + 2, cy],
              [x, cy],
            ],
            h1,
          ),
        ),
        true,
      ),
    );
  const base = projectPlanPoint(cx, cy, h0);
  const top = projectPlanPoint(cx, cy, h1);

  // Pulse ring around the desk: the projected circle as an ellipse.
  const c = projectPlanPoint(cx, cy);
  const ex = projectPlanPoint(cx + 40, cy);
  const n = projectPlanPoint(cx, cy - 40);
  const s = projectPlanPoint(cx, cy + 40);
  const kx = (ex.x - c.x) / 40;
  const ky = (s.y - n.y) / 80;
  const pulse = {
    left: r1(c.x - 42 * kx),
    top: r1(c.y - 42 * ky),
    width: r1(84 * kx),
    height: r1(84 * ky),
    borderX: r1(4 * kx),
    borderY: r1(4 * ky),
  };

  const label = projectPlanPoint(cx, cy, RIG.planLift + BEAM_HEIGHT * 0.62);
  return {
    box,
    body: poly(wind(corners, true)),
    sides: side(bx0) + side(bx1 - 2),
    gradient: { x1: base.x, y1: base.y, x2: top.x, y2: top.y },
    pulse,
    label: { x: r1(label.x), y: r1(label.y) },
  };
}

// ---------------------------------------------------------------------------
// Sky and skyline, merged into a few paths

const dot = (x: number, y: number, r: number) =>
  `M${r1(x - r)} ${y}a${r} ${r} 0 1 0 ${r1(2 * r)} 0a${r} ${r} 0 1 0 ${r1(-2 * r)} 0`;

/** Brightest stars: the few that twinkle (as tiny layers) in 'full'. */
export function twinkleStars(scene: AuthScene, count = 5) {
  return scene.stars
    .map((s, i) => ({ ...s, i }))
    .filter((s) => s.y > 8)
    .sort((a, b) => b.r - a.r || a.i - b.i)
    .slice(0, count)
    .map((s, k) => ({
      i: s.i,
      x: s.x,
      y: s.y,
      size: r1(s.r * 2 + 6),
      delay: r1(k * 0.9),
      duration: r1(2.6 + (k % 3) * 0.8),
    }));
}

/**
 * Stars per twinkle group, split into [plain, violet] path data, leaving out
 * the stars at the indexes in `skip` (drawn separately).
 */
export function starPaths(
  scene: AuthScene,
  skip: ReadonlySet<number> = new Set(),
): Array<[string, string]> {
  return [0, 1, 2].map((g) => {
    const out: [string, string] = ["", ""];
    scene.stars
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.group === g)
      .forEach(({ s, i }, k) => {
        if (!skip.has(i)) out[k % 7 === 0 ? 1 : 0] += dot(s.x, s.y, s.r);
      });
    return out;
  });
}

export function skylinePaths(scene: AuthScene, p: ArtPalette): ArtPath[] {
  const H = RIG.horizon;
  let body = "";
  const tops: Record<string, string> = {};
  const lights: Record<string, string> = {};
  scene.towers.forEach((t, i) => {
    body += `M${t.x} ${H - t.h}h${t.w}v${t.h + 2}h${-t.w}Z`;
    const top = i % 4 === 0 ? p.tint("violet", 0.9) : p.tint("cyan", 0.5);
    tops[top] = (tops[top] ?? "") + `M${t.x} ${H - t.h}h${t.w}v1.5h${-t.w}Z`;
    t.lights.forEach((l, j) => {
      const c = nodeColour(p, l.tone);
      const w = j % 3 === 0 ? 6 : 3;
      lights[c] = (lights[c] ?? "") + `M${l.x} ${l.y}h${w}v1.6h${-w}Z`;
    });
  });
  return [
    { d: body, fill: "#07060f" },
    ...Object.entries(tops).map(([fill, d]) => ({ d, fill })),
    ...Object.entries(lights).map(([fill, d]) => ({ d, fill, opacity: 0.85 })),
  ];
}

/** Standard normal CDF (Abramowitz-Stegun erf approximation). */
function phi(x: number) {
  const t = 1 / (1 + (0.3275911 * Math.abs(x)) / Math.SQRT2);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp((-x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/**
 * Vertical gradient stops reproducing `box-shadow: 0 0 <blur> <spread>` around
 * a thin full-width line (Gaussian blur, sigma = blur / 2), so the horizon
 * glow is a plain gradient fill. Returns the band's half height too.
 */
export function glowBand(alpha: number, half: number, blur: number) {
  const sigma = blur / 2;
  const extent = half + 3 * sigma;
  const stops: Array<{ offset: number; opacity: number }> = [];
  for (let i = -8; i <= 8; i++) {
    const d = (i / 8) * extent;
    const a = alpha * (phi((half - d) / sigma) - phi((-half - d) / sigma));
    stops.push({
      offset: Math.round(((d + extent) / (2 * extent)) * 1000) / 1000,
      opacity: Math.round(a * 1000) / 1000,
    });
  }
  return { extent, stops };
}

// ---------------------------------------------------------------------------
// Motion plan: compositor-only keyframes

export interface Keyframe {
  offset: number;
  transform?: string;
  opacity?: number;
  /** Timing function from this keyframe to the next. */
  easing?: string;
}

/** Data packets riding the two aisles, as transform keyframes in rig px. */
export function packetMotion(scene: AuthScene, p: ArtPalette) {
  return scene.traces.slice(0, 2).map((t, i) => {
    const pts = parsePolyline(t.d);
    const L = polyLength(pts);
    const dash = PACKET_LEN * L;
    const sample = (f: number) => {
      const [a, b] = toScreen([
        pointAt(pts, f * L),
        pointAt(pts, Math.min(L, f * L + dash)),
      ]);
      const mid = projectPlanPoint(...pointAt(pts, f * L + dash / 2));
      return {
        x: (a[0] + b[0]) / 2,
        y: (a[1] + b[1]) / 2,
        len: Math.max(1, Math.hypot(b[0] - a[0], b[1] - a[1])),
        width: 5 * mid.scale,
        angle: (Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180) / Math.PI,
      };
    };
    const first = sample(0);
    const end = 1 - PACKET_LEN;
    const frames: Keyframe[] = Array.from({ length: 17 }, (_, k) => {
      const f = (k / 16) * end;
      const q = sample(f);
      const sx = Math.round((q.width / first.width) * 1000) / 1000;
      const sy = Math.round((q.len / first.len) * 1000) / 1000;
      return {
        offset: k / 16,
        transform: `translate(${r1(q.x)}px, ${r1(q.y)}px) rotate(${r1(q.angle)}deg) scale(${sx}, ${sy})`,
        opacity: k === 16 ? 0 : 1,
      };
    });
    return {
      width: r1(first.width),
      height: r1(first.len),
      colour: i === 0 ? p.lime : "#d6fbff",
      duration: t.duration,
      delay: t.delay,
      frames,
    };
  });
}

/** The fixed animations, by name (all compositor-only). */
export const ART_KEYFRAMES = {
  gridScroll: [
    { offset: 0, transform: gridLayer().transform(0) },
    { offset: 1, transform: gridLayer().transform(RIG.cell) },
  ],
  pulse: [
    { offset: 0, transform: "scale(0.5)", opacity: 0.95 },
    { offset: 1, transform: "scale(2.6)", opacity: 0 },
  ],
  tagBob: [
    { offset: 0, transform: "translate(-50%, -100%) translateY(0px)" },
    { offset: 1, transform: "translate(-50%, -100%) translateY(-9px)" },
  ],
  flicker: [
    { offset: 0, opacity: 1, easing: "steps(1, end)" },
    { offset: 0.45, opacity: 0.78, easing: "steps(1, end)" },
    { offset: 0.5, opacity: 0.95, easing: "steps(1, end)" },
    { offset: 0.55, opacity: 0.7, easing: "steps(1, end)" },
    { offset: 1, opacity: 1 },
  ],
  twinkle: [
    { offset: 0, opacity: 1, easing: "ease-in-out" },
    { offset: 0.5, opacity: 0.25, easing: "ease-in-out" },
    { offset: 1, opacity: 1 },
  ],
} satisfies Record<string, Keyframe[]>;

/** Keyframe keys that are timing, not animated properties. */
const TIMING_KEYS = new Set(["offset", "easing", "composite"]);

/** Every CSS property any of the given keyframes animate. */
export function animatedProperties(sets: Keyframe[][]): string[] {
  const props = new Set<string>();
  for (const frames of sets)
    for (const f of frames)
      for (const k of Object.keys(f)) if (!TIMING_KEYS.has(k)) props.add(k);
  return [...props].sort();
}

/** One Web Animations call: `root.querySelectorAll(target)[index].animate()`. */
export interface MotionSpec {
  target: string;
  index: number;
  frames: Keyframe[];
  timing: {
    duration: number;
    delay?: number;
    easing?: string;
    direction?: "normal" | "alternate";
    iterations: number;
  };
}

/**
 * Everything that moves in a mode, as Web Animations specs. (WAAPI rather
 * than CSS animations: React's root listeners for animation events make
 * Chrome tick every CSS animation on the main thread to fire
 * `animationiteration`; WAAPI animations have no iteration events and stay
 * entirely on the compositor.)
 */
export function motionPlan(
  mode: AuthArtMode,
  packets: ReturnType<typeof packetMotion> = [],
  twinkles: ReturnType<typeof twinkleStars> = [],
): MotionSpec[] {
  if (mode === "still") return [];
  const loop = (
    duration: number,
    extra: Partial<MotionSpec["timing"]> = {},
  ) => ({
    duration: duration * 1000,
    iterations: Infinity,
    ...extra,
  });
  const plan: MotionSpec[] = [
    {
      target: ".hlAuthArt-gridMove",
      index: 0,
      frames: ART_KEYFRAMES.gridScroll,
      timing: loop(2.6),
    },
    {
      target: ".hlAuthArt-pulse",
      index: 0,
      frames: ART_KEYFRAMES.pulse,
      timing: loop(2, { easing: "ease-out" }),
    },
  ];
  if (mode === "lite") return plan;
  plan.push(
    {
      target: ".hlAuthArt-tag",
      index: 0,
      frames: ART_KEYFRAMES.tagBob,
      timing: loop(5, { easing: "ease-in-out", direction: "alternate" }),
    },
    {
      target: ".hlAuthArt-beam",
      index: 0,
      frames: ART_KEYFRAMES.flicker,
      timing: loop(3.2),
    },
    ...packets.map((p, index) => ({
      target: ".hlAuthArt-packet",
      index,
      frames: p.frames,
      timing: loop(p.duration, { delay: -p.delay * 1000 }),
    })),
    ...twinkles.map((t, index) => ({
      target: ".hlAuthArt-twinkle",
      index,
      frames: ART_KEYFRAMES.twinkle,
      timing: loop(t.duration, { delay: -t.delay * 1000 }),
    })),
  );
  return plan;
}

// ---------------------------------------------------------------------------
// Mode choice

export type AuthArtMode = "full" | "lite" | "still";

export interface DeviceHints {
  reducedMotion: boolean;
  /** Viewport at or under 880px wide. */
  narrow: boolean;
  saveData?: boolean;
  deviceMemory?: number;
  cores?: number;
}

/**
 * Which motion set to run. Reduced motion always wins (still frame); 'auto'
 * picks the light set on phones and low-power devices.
 */
export function chooseArtMode(
  requested: AuthArtMode | "auto",
  hints: DeviceHints,
): AuthArtMode {
  if (hints.reducedMotion) return "still";
  if (requested !== "auto") return requested;
  const lowPower =
    hints.saveData === true ||
    (hints.deviceMemory !== undefined && hints.deviceMemory <= 4) ||
    (hints.cores !== undefined && hints.cores <= 4);
  return hints.narrow || lowPower ? "lite" : "full";
}
