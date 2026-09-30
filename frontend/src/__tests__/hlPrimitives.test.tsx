import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import theme from "../theme";
import {
  FilterChips,
  HlPagination,
  Kicker,
  Trophy,
  UserAvatar,
  avatarGradient,
  formatCountdown,
  formatRange,
  getInitials,
  getPageItems,
  pageCount,
  splitCountdown,
  AVATAR_GRADIENTS,
} from "../components/hl";
import { getTrophyColor } from "../utils/trophyColors";

const wrap = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe("pagination helpers", () => {
  test("pageCount is at least 1", () => {
    expect(pageCount(0, 10)).toBe(1);
    expect(pageCount(30, 9)).toBe(4);
  });

  test("getPageItems keeps first, last and current +-1 with gaps", () => {
    expect(getPageItems(1, 1)).toEqual([1]);
    expect(getPageItems(1, 4)).toEqual([1, 2, 3, 4]);
    expect(getPageItems(1, 10)).toEqual([1, 2, "gap", 10]);
    expect(getPageItems(5, 10)).toEqual([1, "gap", 4, 5, 6, "gap", 10]);
    expect(getPageItems(10, 10)).toEqual([1, "gap", 9, 10]);
    // A gap would only hide page 2, so page 2 is shown instead.
    expect(getPageItems(4, 10)).toEqual([1, 2, 3, 4, 5, "gap", 10]);
  });

  test("formatRange", () => {
    expect(formatRange(1, 9, 30)).toBe("1–9 OF 30");
    expect(formatRange(4, 9, 30)).toBe("28–30 OF 30");
    expect(formatRange(1, 9, 0)).toBe("0 OF 0");
  });
});

describe("HlPagination", () => {
  test("marks the current page and pages forward/back", async () => {
    const onChange = vi.fn();
    wrap(<HlPagination page={2} pageSize={9} total={30} onChange={onChange} />);
    expect(
      screen.getByRole("navigation", { name: "Pages" }),
    ).toBeInTheDocument();
    expect(screen.getByText("10–18 OF 30")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Page 2" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(onChange).toHaveBeenLastCalledWith(3);
    await userEvent.click(screen.getByRole("button", { name: "Page 4" }));
    expect(onChange).toHaveBeenLastCalledWith(4);
    await userEvent.click(
      screen.getByRole("button", { name: "Previous page" }),
    );
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  test("disables prev on the first page and next on the last", () => {
    wrap(<HlPagination page={1} pageSize={10} total={5} onChange={() => {}} />);
    expect(
      screen.getByRole("button", { name: "Previous page" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });
});

describe("countdown", () => {
  const start = Date.UTC(2026, 9, 16, 18, 0, 0);
  test("splits the remaining time", () => {
    const now = start - (15 * 86400 + 18 * 3600 + 43 * 60 + 39) * 1000;
    const parts = splitCountdown(start, now);
    expect(parts).toEqual({
      days: 15,
      hours: 18,
      minutes: 43,
      seconds: 39,
      done: false,
    });
    expect(formatCountdown(parts)).toBe("15D 18:43:39");
    expect(formatCountdown(parts, "short")).toBe("15D");
  });

  test("is done once the target has passed", () => {
    expect(splitCountdown(start, start + 1000).done).toBe(true);
    expect(splitCountdown(new Date(start), new Date(start)).done).toBe(true);
    expect(
      formatCountdown(splitCountdown(start, start - 3 * 3600000), "short"),
    ).toBe("03:00");
  });

  test("accepts ISO strings and objects with valueOf (moment)", () => {
    const iso = new Date(start).toISOString();
    expect(splitCountdown(iso, { valueOf: () => start - 60000 }).minutes).toBe(
      1,
    );
  });
});

describe("avatars", () => {
  test("initials come from the handle or email local part", () => {
    expect(getInitials("ProGamer123")).toBe("PR");
    expect(getInitials("dan_the_man")).toBe("DA");
    expect(getInitials("lewis@example.com")).toBe("LE");
    expect(getInitials("")).toBe("?");
    expect(getInitials(null)).toBe("?");
  });

  test("gradient is deterministic and from the palette", () => {
    expect(avatarGradient("ProGamer123")).toBe(avatarGradient("progamer123"));
    expect(AVATAR_GRADIENTS).toContain(avatarGradient("LagWizard"));
  });

  test("decorative avatars are hidden; standalone ones are labelled", () => {
    const { container } = wrap(<UserAvatar name="LagWizard" />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    wrap(<UserAvatar name="FragQueen" decorative={false} />);
    expect(screen.getByRole("img", { name: "FragQueen" })).toHaveTextContent(
      "FR",
    );
  });

  test("falls back to initials when the image fails", () => {
    const { container } = wrap(
      <UserAvatar name="NoScope_Nia" src="https://example.com/a.png" />,
    );
    const img = container.querySelector("img")!;
    fireEvent.error(img);
    expect(container).toHaveTextContent("NO");
  });
});

describe("FilterChips", () => {
  const options = [
    { id: "all", label: "All", count: 15 },
    { id: "live", label: "Live", count: 2 },
  ];

  test("single select exposes aria-pressed", async () => {
    const onChange = vi.fn();
    wrap(
      <FilterChips
        label="Status"
        options={options}
        value="all"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("group", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /All/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(screen.getByRole("button", { name: /Live/ }));
    expect(onChange).toHaveBeenCalledWith("live");
  });

  test("multiple select toggles values", async () => {
    const onChange = vi.fn();
    wrap(
      <FilterChips
        multiple
        label="Types"
        options={options}
        value={["live"]}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /All/ }));
    expect(onChange).toHaveBeenCalledWith(["live", "all"]);
    await userEvent.click(screen.getByRole("button", { name: /Live/ }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});

describe("Trophy and Kicker", () => {
  test("trophy colours use the HyperLAN tokens", () => {
    expect(getTrophyColor(1)).toBe("#ffd23d");
    expect(getTrophyColor(2)).toBe("#c9d3e6");
    expect(getTrophyColor(3)).toBe("#e8945a");
    expect(getTrophyColor(4)).toBe("");
    expect(getTrophyColor(null)).toBe("");
  });

  test("only ranks 1-3 render a trophy", () => {
    wrap(<Trophy rank={1} />);
    expect(screen.getByRole("img", { name: "1st place" })).toBeInTheDocument();
    const { container } = wrap(<Trophy rank={4} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("kicker hides the decorative prefix from screen readers", () => {
    const { container } = wrap(<Kicker>Your invites</Kicker>);
    expect(container).toHaveTextContent("// Your invites");
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent(
      "//",
    );
  });
});
