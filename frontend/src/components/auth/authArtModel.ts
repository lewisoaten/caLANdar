/**
 * Pure, seeded generator for the signed-out hero artwork (`AuthHeroArt`).
 *
 * Everything is laid out in fixed "rig" pixels: a 1200px wide stage whose
 * horizon sits at y = 360. The component scales the rig per breakpoint, so the
 * same numbers drive every screen size and the output for a given seed never
 * changes (stable stories and snapshots).
 */

/** Small fast PRNG (mulberry32). Same seed, same sequence. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rig geometry, shared by the generator and the component's CSS. */
export const RIG = {
  width: 1200,
  height: 1500,
  /** Horizon line (rig y). */
  horizon: 360,
  /** CSS perspective distance. */
  perspective: 380,
  /** Floor tilt (rotateX, degrees): under 90 looks down onto the floor. */
  tilt: 70,
  /** Screen drop from the horizon to the floor's pivot line (depth 0). */
  eye: 520,
  /** Floor plane: width, length behind depth 0, length in front of it. */
  planeWidth: 2600,
  planeFar: 3600,
  planeNear: 480,
  /** Grid cell on the floor. */
  cell: 120,
  /** Floor plan (the floating seat map) size, in plane px. */
  planWidth: 1240,
  planDepth: 1500,
  /** Depth of the plan's near edge (plane px; 0 = the pivot line). */
  planNear: 60,
  /** How high the plan floats above the grid. */
  planLift: 26,
} as const;

const tiltRad = (RIG.tilt * Math.PI) / 180;

/**
 * Perspective origin (rig y) that puts the tilted floor's vanishing line
 * exactly on the horizon.
 */
export const PERSPECTIVE_ORIGIN_Y =
  RIG.horizon + RIG.perspective / Math.tan(tiltRad);

/** Screen (rig) position of a floor point `depth` px away, `h` px above it. */
export function projectFloorPoint(x: number, depth: number, h = 0) {
  const pivotY = RIG.horizon + RIG.eye;
  const dy = -depth * Math.cos(tiltRad) - h * Math.sin(tiltRad);
  const dz = -depth * Math.sin(tiltRad) + h * Math.cos(tiltRad);
  const k = RIG.perspective / (RIG.perspective - dz);
  return {
    x: RIG.width / 2 + x * k,
    y: PERSPECTIVE_ORIGIN_Y + (pivotY + dy - PERSPECTIVE_ORIGIN_Y) * k,
    scale: k,
  };
}

/** Screen (rig) position of a point on the floor plan, `h` px above it. */
export function projectPlanPoint(
  x: number,
  y: number,
  h: number = RIG.planLift,
) {
  // Plan y grows towards the viewer; depth grows away from it.
  return projectFloorPoint(
    x - RIG.planWidth / 2,
    RIG.planNear + (RIG.planDepth - y),
    h,
  );
}

export type DeskState = "lime" | "violet" | "empty" | "you";

export interface Desk {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Which long edge carries the monitor. */
  monitor: "top" | "bottom";
  state: DeskState;
}

export interface Star {
  x: number;
  y: number;
  r: number;
  /** Twinkle group 0-2 (each group animates on its own phase). */
  group: number;
}

export interface Tower {
  x: number;
  w: number;
  h: number;
  lights: Array<{ x: number; y: number; tone: "cyan" | "violet" | "lime" }>;
}

export interface Trace {
  d: string;
  /** Animated data packet along the trace. */
  packet: boolean;
  delay: number;
  duration: number;
}

export interface Node {
  x: number;
  y: number;
  tone: "cyan" | "lime" | "violet";
  delay: number;
}

export interface AuthScene {
  seed: number;
  stars: Star[];
  towers: Tower[];
  desks: Desk[];
  traces: Trace[];
  nodes: Node[];
  stage: { x: number; y: number; w: number; h: number };
  /** The highlighted "your desk". */
  you: Desk;
  online: number;
  total: number;
  /** Latency values cycled by the HUD ticker (ms). */
  pings: number[];
}

const round = (n: number) => Math.round(n * 10) / 10;

/** Build the whole scene for a seed. */
export function generateAuthScene(seed = 2026): AuthScene {
  const rnd = mulberry32(seed);
  const pick = <T>(items: readonly T[]) =>
    items[Math.floor(rnd() * items.length)];

  // Sky: stars thin out towards the horizon, none in the brand corner.
  const stars: Star[] = [];
  while (stars.length < 90) {
    const x = rnd() * RIG.width;
    const y = Math.pow(rnd(), 1.4) * (RIG.horizon - 70) - 60;
    stars.push({
      x: round(x),
      y: round(y),
      r: round(0.6 + rnd() * rnd() * 1.8),
      group: Math.floor(rnd() * 3),
    });
  }

  // Skyline of server towers along the horizon, low in the middle so the sun
  // shows through.
  const towers: Tower[] = [];
  let x = -20;
  while (x < RIG.width + 20) {
    const w = 18 + Math.floor(rnd() * 46);
    const fromCentre = Math.abs(x + w / 2 - RIG.width / 2) / (RIG.width / 2);
    const max = 26 + 120 * Math.pow(fromCentre, 1.3);
    const h = Math.round(10 + rnd() * max);
    const lights: Tower["lights"] = [];
    const count = Math.floor((h / 14) * rnd());
    for (let i = 0; i < count; i++) {
      lights.push({
        x: round(x + 4 + rnd() * (w - 10)),
        y: round(RIG.horizon - h + 6 + rnd() * (h - 10)),
        tone: pick(["cyan", "cyan", "violet", "lime"] as const),
      });
    }
    towers.push({ x, w, h, lights });
    x += w + (rnd() < 0.25 ? Math.floor(rnd() * 14) : 2);
  }

  // Floor plan: three columns of desk pods, four rows deep, like the seat map.
  const desks: Desk[] = [];
  const deskW = 66;
  const deskH = 60;
  const gap = 8;
  const perRow = 4;
  const podW = perRow * deskW + (perRow - 1) * gap;
  const colX = [40, (RIG.planWidth - podW) / 2, RIG.planWidth - 40 - podW];
  const rowY = [300, 600, 900, 1200];
  const rows = "ABCDEFGHJKLM";
  rowY.forEach((py, r) => {
    colX.forEach((px, c) => {
      for (let side = 0; side < 2; side++) {
        for (let i = 0; i < perRow; i++) {
          const roll = rnd();
          const state: DeskState =
            roll < 0.46 ? "lime" : roll < 0.66 ? "violet" : "empty";
          desks.push({
            id: `${rows[r * 3 + c]}-${String(side * perRow + i + 1).padStart(2, "0")}`,
            x: px + i * (deskW + gap),
            y: py + side * (deskH + 12),
            w: deskW,
            h: deskH,
            monitor: side === 0 ? "bottom" : "top",
            state,
          });
        }
      }
    });
  });
  // "Your desk": near-ish, off-centre, so the beacon reads well.
  const youIndex = desks.findIndex((d) => d.id === "J-02");
  const you = { ...desks[youIndex], state: "you" as const };
  desks[youIndex] = you;

  const stage = { x: RIG.planWidth / 2 - 300, y: 60, w: 600, h: 70 };

  // Circuit traces: two aisles run from the front to the stage, each pod
  // branches into its aisle with a 45-degree bend; nodes at every joint.
  const aisles = [
    (colX[0] + podW + colX[1]) / 2,
    (colX[1] + podW + colX[2]) / 2,
  ];
  const traces: Trace[] = [];
  const nodes: Node[] = [];
  const stageY = stage.y + stage.h;
  aisles.forEach((ax, i) => {
    const sx = stage.x + (i === 0 ? 150 : stage.w - 150);
    traces.push({
      d: `M${ax} ${RIG.planDepth}V${stageY + 90}L${sx} ${stageY + 20}V${stageY}`,
      packet: true,
      delay: round(rnd() * 2),
      duration: round(3.2 + rnd() * 1.6),
    });
    nodes.push({
      x: ax,
      y: stageY + 90,
      tone: "cyan",
      delay: round(rnd() * 2),
    });
  });
  rowY.forEach((py) => {
    const cy = py + deskH + 6;
    colX.forEach((px, c) => {
      const toLeft = c === 2 || (c === 1 && rnd() < 0.5);
      const ax = toLeft ? aisles[c === 2 ? 1 : 0] : aisles[c === 0 ? 0 : 1];
      const edge = toLeft ? px : px + podW;
      const bend = 18;
      const dir = ax > edge ? 1 : -1;
      traces.push({
        d: `M${edge} ${cy}H${round(ax - dir * bend)}L${ax} ${cy - bend}`,
        packet: rnd() < 0.5,
        delay: round(rnd() * 3),
        duration: round(1.6 + rnd()),
      });
      nodes.push({
        x: ax,
        y: cy - bend,
        tone: pick(["cyan", "lime", "violet"] as const),
        delay: round(rnd() * 2.4),
      });
    });
  });
  // The core switch under the stage.
  nodes.push({
    x: RIG.planWidth / 2,
    y: stageY + 20,
    tone: "violet",
    delay: 0,
  });

  const total = desks.length;
  const online = desks.filter((d) => d.state !== "empty").length;
  const pings = Array.from({ length: 8 }, () => 6 + Math.floor(rnd() * 18));

  return {
    seed,
    stars,
    towers,
    desks,
    traces,
    nodes,
    stage,
    you,
    online,
    total,
    pings,
  };
}
