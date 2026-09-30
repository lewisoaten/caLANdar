import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { Link as RouterLink, useLocation } from "react-router-dom";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import CloseSharp from "@mui/icons-material/CloseSharp";
import MenuItems, { displayName } from "./MenuItems";
import ActivityTicker from "./ActivityTicker";
import { BackgroundFx } from "./hl/BackgroundFx";
import { BrandMark } from "./hl/BrandMark";
import { UserAvatar } from "./hl/UserAvatar";
import { useIsMobile } from "./hl/useIsMobile";
import { colors, fonts, hairline, sectionGap, tint } from "./hl/tokens";
import { EventStatusPill } from "./shell/EventStatus";
import { NAV_ICONS } from "./shell/navIcons";
import {
  EVENTS_ITEM,
  eventNavItems,
  isActiveItem,
  isBareSection,
  isEventSection,
  type Crumb,
} from "./shell/navModel";
import { useShellState, type ShellState } from "./shell/useShellState";

export declare interface AppProps {
  children?: React.ReactNode;
}

const SIDEBAR_WIDTH = 256;
const TOPBAR_HEIGHT = 64;
const TABBAR_HEIGHT = 64;
const TICKER_HEIGHT = 36;
/** Content column max width; centred beyond it on large screens. */
export const CONTENT_MAX_WIDTH = 1400;

function SkipLink() {
  return (
    <Box
      component="a"
      href="#main-content"
      sx={{
        position: "fixed",
        top: 8,
        left: 8,
        zIndex: 2000,
        px: 2,
        py: 1.5,
        backgroundColor: colors.cyan,
        color: `${colors.ink} !important`,
        fontWeight: 700,
        fontSize: 14,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        textDecoration: "none",
        transform: "translateY(-200%)",
        "&:focus, &:focus-visible": { transform: "none" },
      }}
    >
      Skip to content
    </Box>
  );
}

function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  if (!crumbs.length) return <Box sx={{ flex: 1 }} />;
  return (
    <Box component="nav" aria-label="Breadcrumb" sx={{ flex: 1, minWidth: 0 }}>
      <Box
        component="ol"
        sx={{
          m: 0,
          p: 0,
          listStyle: "none",
          display: "block",
          fontFamily: fonts.mono,
          fontSize: 12,
          letterSpacing: "0.12em",
          color: colors.textDim,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          "& li": { display: "inline" },
          "& a": {
            color: "inherit",
            textDecoration: "none",
            "&:hover": { color: colors.cyan },
          },
        }}
      >
        <Box component="span" aria-hidden="true">
          {"// "}
        </Box>
        {crumbs.map((c, i) => (
          <li key={`${i}-${c.label}`}>
            {i > 0 && <span aria-hidden="true">{" / "}</span>}
            {c.to ? (
              <RouterLink to={c.to}>{c.label}</RouterLink>
            ) : (
              <span aria-current={i === crumbs.length - 1 ? "page" : undefined}>
                {c.label}
              </span>
            )}
          </li>
        ))}
      </Box>
    </Box>
  );
}

function MobileTabBar({ shell }: { shell: ShellState }) {
  const { activeEvent, route, access } = shell;
  if (!activeEvent) return null;
  const items = [EVENTS_ITEM, ...eventNavItems(activeEvent.id)];
  return (
    <Box
      component="nav"
      aria-label="Event"
      sx={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 20,
        display: "grid",
        gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
        backgroundColor: "rgba(8,10,16,0.95)",
        borderTop: `1px solid ${tint("cyan", 0.2)}`,
        backdropFilter: "blur(12px)",
        pb: "env(safe-area-inset-bottom)",
      }}
    >
      {items.map((item) => {
        const Icon = NAV_ICONS[item.key];
        const active = isActiveItem(item, route, activeEvent.id);
        const locked = Boolean(item.requiresRsvp) && !access.attending;
        const sx = {
          height: TABBAR_HEIGHT,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "4px",
          fontFamily: fonts.ui,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          textDecoration: "none",
          color: locked
            ? colors.textDim
            : active
              ? colors.cyan
              : colors.textNav,
          backgroundColor: active ? tint("cyan", 0.08) : "transparent",
          boxShadow: `inset 0 2px 0 ${active ? colors.cyan : "transparent"}`,
          "& svg": { fontSize: 22 },
          "&.Mui-focusVisible, &:focus-visible": {
            outline: `2px solid ${colors.cyan}`,
            outlineOffset: -2,
          },
        } as const;
        return locked ? (
          <ButtonBase
            key={item.key}
            component="span"
            role="link"
            aria-disabled="true"
            aria-label={`${item.label} (RSVP Yes or Maybe to unlock)`}
            title='RSVP "Yes" or "Maybe" to access this section.'
            tabIndex={0}
            sx={sx}
          >
            <Icon aria-hidden="true" />
            <span aria-hidden="true">{item.short}</span>
          </ButtonBase>
        ) : (
          <ButtonBase
            key={item.key}
            component={RouterLink}
            to={item.to}
            aria-current={active ? "page" : undefined}
            aria-label={item.label}
            sx={sx}
          >
            <Icon aria-hidden="true" />
            <span aria-hidden="true">{item.short}</span>
          </ButtonBase>
        );
      })}
    </Box>
  );
}

function MenuSheet({
  shell,
  open,
  onClose,
}: {
  shell: ShellState;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          role: "dialog",
          "aria-modal": true,
          "aria-label": "Menu",
          sx: {
            border: 0,
            borderTop: `1px solid ${tint("cyan", 0.3)}`,
            px: 2,
            pt: "18px",
            pb: "calc(18px + env(safe-area-inset-bottom))",
            maxHeight: "85vh",
          },
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          px: 0.5,
          pb: "14px",
          mb: 1,
          borderBottom: `1px solid ${hairline.chrome}`,
        }}
      >
        <UserAvatar name={displayName(shell)} src={shell.avatarUrl} size={44} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ fontSize: 16, fontWeight: 600 }}>{displayName(shell)}</Box>
          <Box
            sx={{
              fontFamily: fonts.mono,
              fontSize: 11,
              color: colors.textDim,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {shell.email}
          </Box>
        </Box>
        <IconButton
          aria-label="Close menu"
          onClick={onClose}
          sx={{ border: `1px solid ${hairline.control}`, color: colors.text }}
        >
          <CloseSharp />
        </IconButton>
      </Box>
      <MenuItems
        shell={shell}
        variant="sheet"
        onNavigate={onClose}
        includeEvents={!shell.activeEvent}
      />
    </Drawer>
  );
}

/**
 * The app shell: fixed left sidebar (desktop), breadcrumb top bar with the
 * active event's status pill, the main content column, the live ticker on the
 * four event pages, and on mobile (<= 760px) a bottom tab bar plus a menu
 * sheet. Sign-in and email verification render full-screen without chrome.
 */
export default function Dashboard({ children }: AppProps) {
  const shell = useShellState();
  const isMobile = useIsMobile();
  const location = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const firstPath = useRef(location.pathname);

  const { route, loggedIn, activeEvent, access } = shell;
  const bare = !loggedIn || isBareSection(route.section);

  // Move focus to the page (and scroll to its top) after client-side
  // navigation, so keyboard and screen reader users land on the new content.
  useEffect(() => {
    if (firstPath.current === location.pathname) return;
    firstPath.current = location.pathname;
    window.scrollTo?.(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  // The sheet closes itself on navigation via onNavigate, and is not shown
  // if the layout switches to desktop while open.
  const sheetVisible = sheetOpen && isMobile;

  if (bare) {
    return (
      <>
        <BackgroundFx />
        <SkipLink />
        <Box
          component="main"
          id="main-content"
          ref={mainRef}
          tabIndex={-1}
          sx={{ minHeight: "100vh", outline: "none" }}
        >
          {children}
        </Box>
      </>
    );
  }

  const onEventPage = isEventSection(route.section) && Boolean(route.eventId);
  const showTicker =
    onEventPage &&
    access.responded &&
    activeEvent != null &&
    String(activeEvent.id) === route.eventId;
  const showTabBar = isMobile && activeEvent != null;
  // Shown wherever there is an active event (the design shows it on every
  // page); the next/live event is never "ended", a viewed past one says so.
  const showPill = activeEvent != null;

  const mobileBottomPad = `calc(${showTabBar ? TABBAR_HEIGHT : 0}px + ${
    onEventPage ? TICKER_HEIGHT : 0
  }px + env(safe-area-inset-bottom) + 40px)`;

  return (
    <>
      <BackgroundFx />
      <SkipLink />
      <Box sx={{ display: "flex", minHeight: "100vh" }}>
        {!isMobile && (
          <Box
            component="aside"
            aria-label="Sidebar"
            sx={{
              width: SIDEBAR_WIDTH,
              flex: "none",
              position: "sticky",
              top: 0,
              height: "100vh",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              borderRight: `1px solid ${hairline.chrome}`,
              backgroundColor: colors.chrome,
              backdropFilter: "blur(10px)",
            }}
          >
            <Box
              sx={{
                height: TOPBAR_HEIGHT,
                flex: "none",
                px: 2.5,
                display: "flex",
                alignItems: "center",
                borderBottom: `1px solid ${hairline.chrome}`,
              }}
            >
              <ButtonBase
                component={RouterLink}
                to="/events"
                aria-label="caLANdar home"
                sx={{
                  "&.Mui-focusVisible": {
                    outline: `2px solid ${colors.cyan}`,
                    outlineOffset: 4,
                  },
                }}
              >
                <BrandMark size={32} tagline="LAN PARTY OS" />
              </ButtonBase>
            </Box>
            <MenuItems shell={shell} variant="sidebar" />
          </Box>
        )}

        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Box
            component="header"
            sx={{
              position: "sticky",
              top: 0,
              zIndex: 15,
              height: TOPBAR_HEIGHT,
              flex: "none",
              display: "flex",
              alignItems: "center",
              gap: "14px",
              px: "clamp(16px, 3vw, 40px)",
              borderBottom: `1px solid ${hairline.chrome}`,
              backgroundColor: "rgba(6,7,11,0.82)",
              backdropFilter: "blur(12px)",
            }}
          >
            {isMobile && (
              <ButtonBase
                component={RouterLink}
                to="/events"
                aria-label="caLANdar home"
                sx={{
                  minWidth: 44,
                  minHeight: 44,
                  justifyContent: "flex-start",
                }}
              >
                <BrandMark size={30} wordmark={false} />
              </ButtonBase>
            )}
            <Breadcrumb crumbs={shell.breadcrumb} />
            {showPill && activeEvent && (
              <EventStatusPill event={activeEvent} compact={isMobile} />
            )}
            {isMobile && (
              <ButtonBase
                aria-label="Open menu"
                aria-haspopup="dialog"
                aria-expanded={sheetVisible}
                onClick={() => setSheetOpen(true)}
                sx={{
                  width: 44,
                  height: 44,
                  flex: "none",
                  "&.Mui-focusVisible": {
                    outline: `2px solid ${colors.cyan}`,
                    outlineOffset: 2,
                  },
                }}
              >
                <UserAvatar
                  name={displayName(shell)}
                  src={shell.avatarUrl}
                  size={40}
                />
              </ButtonBase>
            )}
          </Box>

          <Box
            component="main"
            id="main-content"
            ref={mainRef}
            tabIndex={-1}
            sx={{
              flex: 1,
              width: "100%",
              maxWidth: CONTENT_MAX_WIDTH,
              mx: "auto",
              outline: "none",
              px: "clamp(14px, 3vw, 40px)",
              pt: "clamp(18px, 3vw, 40px)",
              pb: { xs: mobileBottomPad, md: "64px" },
              display: "flex",
              flexDirection: "column",
              gap: sectionGap,
            }}
          >
            {children}
          </Box>

          {showTicker && activeEvent && !isMobile && (
            <ActivityTicker
              event_id={activeEvent.id}
              responded={access.responded}
              placement="sticky"
            />
          )}
        </Box>
      </Box>

      {isMobile && showTicker && activeEvent && (
        <ActivityTicker
          event_id={activeEvent.id}
          responded={access.responded}
          placement="fixed"
        />
      )}
      {showTabBar && <MobileTabBar shell={shell} />}
      {isMobile && (
        <MenuSheet
          shell={shell}
          open={sheetVisible}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  );
}
