import { describe, expect, test } from "vitest";
import { contrastPairs, chamfer } from "../components/hl/tokens";

// WCAG 2.x relative luminance / contrast ratio.
const parse = (c: string): [number, number, number, number] => {
  const hex = /^#([0-9a-f]{6})$/i.exec(c);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = /^rgba?\(([^)]+)\)$/.exec(c);
  if (!rgba) throw new Error(`Unparseable colour ${c}`);
  const [r, g, b, a = "1"] = rgba[1].split(",").map((s) => s.trim());
  return [Number(r), Number(g), Number(b), Number(a)];
};

const over = (top: string, bottom: [number, number, number]) => {
  const [r, g, b, a] = parse(top);
  return [r, g, b].map((v, i) => v * a + bottom[i] * (1 - a)) as [
    number,
    number,
    number,
  ];
};

const luminance = (rgb: [number, number, number]) => {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const ratio = (a: [number, number, number], b: [number, number, number]) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("HyperLAN tokens", () => {
  test.each(contrastPairs.map((p) => [p.name, p] as const))(
    "%s reaches 4.5:1",
    (_name, pair) => {
      const [r, g, b] = parse(pair.bg);
      let bg: [number, number, number] = [r, g, b];
      // `over` lists layers top-first; composite bottom-up.
      for (const layer of [...(pair.over ?? [])].reverse()) {
        bg = over(layer, bg);
      }
      const fg = over(pair.fg, bg);
      expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    },
  );

  test("chamfer builds a six-point polygon", () => {
    expect(chamfer(10)).toBe(
      "polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px)",
    );
    expect(chamfer(24, "tr-bl")).toContain("calc(100% - 24px) 0");
  });
});
