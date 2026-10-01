import { describe, test, expect, afterEach, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthHeroArt } from "../components/auth/AuthHeroArt";
import {
  RIG,
  generateAuthScene,
  mulberry32,
  projectPlanPoint,
} from "../components/auth/authArtModel";
import {
  ART_KEYFRAMES,
  animatedProperties,
  chooseArtMode,
  motionPlan,
  packetMotion,
  twinkleStars,
} from "../components/auth/authArtGeometry";
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

/** matchMedia stub: which media features match. */
const mockMedia = ({ reduce = false, narrow = false } = {}) => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches:
        (reduce && query.includes("prefers-reduced-motion: reduce")) ||
        (narrow && query.includes("max-width")),
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
const mockReducedMotion = (reduce: boolean) => mockMedia({ reduce });

/** Web Animations stub (jsdom has none): records every animate() call. */
interface FakeAnimation {
  el: Element;
  frames: Keyframe[];
  timing: KeyframeAnimationOptions;
  pause: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
}
let animations: FakeAnimation[] = [];
beforeEach(() => {
  animations = [];
  Element.prototype.animate = vi.fn(function (
    this: Element,
    frames: Keyframe[],
    timing: KeyframeAnimationOptions,
  ) {
    const a = {
      el: this,
      frames,
      timing,
      pause: vi.fn(),
      play: vi.fn(),
      cancel: vi.fn(),
    };
    animations.push(a);
    return a as unknown as Animation;
  }) as unknown as Element["animate"];
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // @ts-expect-error -- jsdom has no Web Animations; remove the stub.
  delete Element.prototype.animate;
});

/** IntersectionObserver stub that lets a test report visibility. */
const mockIntersection = () => {
  const callbacks: IntersectionObserverCallback[] = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: IntersectionObserverCallback) {
        callbacks.push(cb);
      }
      observe() {}
      disconnect() {}
    },
  );
  return (isIntersecting: boolean) =>
    act(() =>
      callbacks.forEach((cb) =>
        cb(
          [{ isIntersecting } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        ),
      ),
    );
};

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

describe("authArtGeometry", () => {
  test("every keyframe animates only compositor properties", () => {
    const scene = generateAuthScene();
    const palette = {
      cyan: colors.cyan,
      violet: colors.violet,
      violetLight: colors.violetLight,
      lime: colors.lime,
      tint: () => "#000",
    };
    const plan = motionPlan(
      "full",
      packetMotion(scene, palette),
      twinkleStars(scene),
    );
    expect(
      animatedProperties([
        ...Object.values(ART_KEYFRAMES),
        ...plan.map((p) => p.frames),
      ]),
    ).toEqual(["opacity", "transform"]);
  });

  test("lite runs at most two animations, still none", () => {
    expect(motionPlan("lite")).toHaveLength(2);
    expect(motionPlan("still")).toHaveLength(0);
  });

  test("chooses the motion set from the device", () => {
    const wide = {
      reducedMotion: false,
      narrow: false,
      cores: 8,
      deviceMemory: 8,
    };
    expect(chooseArtMode("auto", wide)).toBe("full");
    expect(chooseArtMode("auto", { ...wide, narrow: true })).toBe("lite");
    expect(chooseArtMode("auto", { ...wide, saveData: true })).toBe("lite");
    expect(chooseArtMode("auto", { ...wide, deviceMemory: 4 })).toBe("lite");
    expect(chooseArtMode("auto", { ...wide, cores: 4 })).toBe("lite");
    expect(chooseArtMode("full", { ...wide, narrow: true })).toBe("full");
    expect(chooseArtMode("full", { ...wide, reducedMotion: true })).toBe(
      "still",
    );
    expect(chooseArtMode("auto", { ...wide, reducedMotion: true })).toBe(
      "still",
    );
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

  test("animates in full on desktop and goes still under reduced motion", () => {
    mockReducedMotion(false);
    const { unmount } = render(<AuthHeroArt mode="full" />);
    let art = screen.getByTestId("auth-hero-art");
    expect(art).toHaveAttribute("data-motion", "full");
    expect(art).not.toHaveClass("hlAuthArt--static");
    expect(animations.length).toBeGreaterThan(2);
    unmount();
    // Unmounting cancels every animation.
    for (const a of animations) expect(a.cancel).toHaveBeenCalled();

    animations = [];
    mockReducedMotion(true);
    // Reduced motion wins over an explicit mode.
    render(<AuthHeroArt mode="full" />);
    art = screen.getByTestId("auth-hero-art");
    expect(art).toHaveAttribute("data-motion", "reduced");
    expect(art).toHaveAttribute("data-mode", "still");
    expect(art).toHaveClass("hlAuthArt--static");
    expect(animations).toHaveLength(0);
  });

  test.each([
    ["full", 2 + 2 + 2 + 5],
    ["lite", 2],
    ["still", 0],
  ] as const)("mode %s runs %i animations", (mode, count) => {
    mockMedia();
    render(<AuthHeroArt mode={mode} />);
    const art = screen.getByTestId("auth-hero-art");
    expect(art).toHaveAttribute("data-mode", mode);
    expect(animations).toHaveLength(count);
    // Packets and twinkling stars only exist in full.
    const extras = art.querySelectorAll(
      ".hlAuthArt-packet, .hlAuthArt-twinkle",
    );
    expect(extras.length).toBe(mode === "full" ? 7 : 0);
  });

  test("auto picks lite on narrow screens and full on wide ones", () => {
    mockMedia({ narrow: true });
    const { unmount } = render(<AuthHeroArt />);
    expect(screen.getByTestId("auth-hero-art")).toHaveAttribute(
      "data-mode",
      "lite",
    );
    unmount();
    mockMedia({ narrow: false });
    vi.stubGlobal("navigator", {
      ...navigator,
      hardwareConcurrency: 8,
      deviceMemory: 8,
    });
    render(<AuthHeroArt />);
    expect(screen.getByTestId("auth-hero-art")).toHaveAttribute(
      "data-mode",
      "full",
    );
  });

  test("animates only transform and opacity, and emits no CSS animations", () => {
    mockMedia();
    render(<AuthHeroArt mode="full" />);
    const props = new Set<string>();
    for (const a of animations)
      for (const f of a.frames)
        for (const k of Object.keys(f))
          if (!["offset", "easing", "composite"].includes(k)) props.add(k);
    expect([...props].sort()).toEqual(["opacity", "transform"]);
    // Nothing is left to CSS animations (main-thread ticks, paint).
    const css = [...document.querySelectorAll("style")]
      .map((s) => s.textContent)
      .join("\n");
    expect(css).toMatch(/hlAuthArt/);
    expect(css).not.toMatch(/@keyframes/);
    expect(css).not.toMatch(/animation\s*:/);
    expect(css).not.toMatch(/mix-blend-mode|mask-composite/);
  });

  test("pauses while the tab is hidden", () => {
    mockMedia();
    render(<AuthHeroArt mode="lite" />);
    const art = screen.getByTestId("auth-hero-art");
    let hidden = true;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(art).toHaveAttribute("data-paused", "true");
    expect(art).toHaveClass("hlAuthArt--paused");
    for (const a of animations) expect(a.pause).toHaveBeenCalled();

    hidden = false;
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(art).toHaveAttribute("data-paused", "false");
    for (const a of animations) expect(a.play).toHaveBeenCalled();
  });

  test("pauses while scrolled off-screen", () => {
    mockMedia();
    const report = mockIntersection();
    render(<AuthHeroArt mode="full" />);
    const art = screen.getByTestId("auth-hero-art");
    report(false);
    expect(art).toHaveAttribute("data-paused", "true");
    for (const a of animations) expect(a.pause).toHaveBeenCalled();
    report(true);
    expect(art).toHaveAttribute("data-paused", "false");
  });

  test("pauses while typing on a small screen, not on a large one", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    try {
      mockMedia({ narrow: true });
      const { unmount } = render(<AuthHeroArt mode="lite" />);
      const art = screen.getByTestId("auth-hero-art");
      act(() => input.focus());
      expect(art).toHaveAttribute("data-paused", "true");
      act(() => input.blur());
      expect(art).toHaveAttribute("data-paused", "false");
      unmount();

      mockMedia({ narrow: false });
      render(<AuthHeroArt mode="full" />);
      act(() => input.focus());
      expect(screen.getByTestId("auth-hero-art")).toHaveAttribute(
        "data-paused",
        "false",
      );
    } finally {
      input.remove();
    }
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
