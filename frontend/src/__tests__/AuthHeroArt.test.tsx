import { describe, test, expect, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthHeroArt } from "../components/auth/AuthHeroArt";
import {
  RIG,
  generateAuthScene,
  mulberry32,
  projectPlanPoint,
} from "../components/auth/authArtModel";
import SignIn from "../components/SignIn";
import VerifyEmail from "../components/VerifyEmail";
import { UserProvider } from "../UserProvider";
import { AUTH_SCRIM } from "../components/AuthLayout";
import { colors } from "../components/hl/tokens";

const channels = (c: string): number[] =>
  c.startsWith("#")
    ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
    : c
        .replace(/[^\d.,]/g, "")
        .split(",")
        .map(Number);
const luminance = ([r, g, b]: number[]) => {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const contrast = (a: number[], b: number[]) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const mockReducedMotion = (reduce: boolean) => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion: reduce"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("authArtModel", () => {
  test("the PRNG and the scene are deterministic per seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(generateAuthScene(2026)).toEqual(generateAuthScene(2026));
    expect(generateAuthScene(7).desks).not.toEqual(
      generateAuthScene(2026).desks,
    );
  });

  test("lays out a seat-map floor plan with exactly one claimed desk", () => {
    const scene = generateAuthScene();
    expect(scene.desks).toHaveLength(96);
    expect(scene.desks.filter((d) => d.state === "you")).toEqual([scene.you]);
    expect(new Set(scene.desks.map((d) => d.id)).size).toBe(96);
    expect(scene.online).toBeGreaterThan(0);
    expect(scene.online).toBeLessThanOrEqual(scene.total);
    expect(scene.pings).toHaveLength(8);
    for (const d of scene.desks) {
      expect(d.x).toBeGreaterThanOrEqual(0);
      expect(d.x + d.w).toBeLessThanOrEqual(RIG.planWidth);
      expect(d.y + d.h).toBeLessThanOrEqual(RIG.planDepth);
    }
  });

  test("projects the floor below the horizon, nearer rows lower and larger", () => {
    const far = projectPlanPoint(RIG.planWidth / 2, 0);
    const near = projectPlanPoint(RIG.planWidth / 2, RIG.planDepth);
    expect(far.y).toBeGreaterThan(RIG.horizon);
    expect(near.y).toBeGreaterThan(far.y);
    expect(near.scale).toBeGreaterThan(far.scale);
  });
});

describe("hero text contrast", () => {
  test("every hero text colour clears 4.5:1 over the scrim, even on pure white art", () => {
    const [r, g, b, a] = channels(AUTH_SCRIM);
    // Worst case: the brightest possible pixel of artwork under the scrim.
    const under = [255, 255, 255];
    const composite = [r, g, b].map((v, i) => v * a + under[i] * (1 - a));
    for (const fg of [colors.text, colors.text2, colors.cyan, colors.lime]) {
      expect(contrast(channels(fg), composite)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("AuthHeroArt", () => {
  test("is decorative: aria-hidden with nothing focusable", () => {
    render(<AuthHeroArt />);
    const art = screen.getByTestId("auth-hero-art");
    expect(art).toHaveAttribute("aria-hidden", "true");
    expect(
      art.querySelectorAll("a,button,input,select,textarea,[tabindex]"),
    ).toHaveLength(0);
    for (const svg of art.querySelectorAll("svg")) {
      expect(svg).toHaveAttribute("focusable", "false");
    }
    // Generated, not fetched: no images at all.
    expect(art.querySelectorAll("img,image")).toHaveLength(0);
  });

  test("renders the same markup for the same seed", () => {
    const { container: a } = render(<AuthHeroArt seed={11} />);
    const { container: b } = render(<AuthHeroArt seed={11} />);
    expect(a.innerHTML).toBe(b.innerHTML);
  });

  test("animates by default and goes static under reduced motion", () => {
    mockReducedMotion(false);
    const { unmount } = render(<AuthHeroArt />);
    let art = screen.getByTestId("auth-hero-art");
    expect(art).toHaveAttribute("data-motion", "full");
    expect(art).not.toHaveClass("hlAuthArt--static");
    unmount();

    mockReducedMotion(true);
    render(<AuthHeroArt />);
    art = screen.getByTestId("auth-hero-art");
    expect(art).toHaveAttribute("data-motion", "reduced");
    expect(art).toHaveClass("hlAuthArt--static");
  });

  test.each([
    ["Sign in", <SignIn key="s" />],
    ["Verify email", <VerifyEmail key="v" />],
  ])("%s uses the generated art, not the stock photo", (_, page) => {
    localStorage.clear();
    const { container } = render(
      <MemoryRouter>
        <UserProvider>{page}</UserProvider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("auth-hero-art")).toBeInTheDocument();
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.innerHTML).not.toMatch(/lan_party_image/);
    expect(document.head.innerHTML).not.toMatch(/lan_party_image/);
  });
});
