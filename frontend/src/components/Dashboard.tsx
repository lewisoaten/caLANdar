import * as React from "react";
import {
  CssBaseline,
  Box,
  Toolbar,
  Typography,
  IconButton,
  Stack,
} from "@mui/material";
import Drawer from "@mui/material/Drawer";
import AppBar from "@mui/material/AppBar";
import MenuIcon from "@mui/icons-material/Menu";
import CalandarIcon from "../calandar.svg";
import MenuItems from "./MenuItems";
import { useState } from "react";

const drawerWidth: number = 240;

export declare interface AppProps {
  children?: React.ReactNode;
}

function ResponsiveDrawer(props: AppProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuUpdateButtonLoadingState = useState(false);
  const menuUpdateButtonDoneState = useState(false);
  const [rsvpRefreshTrigger, setRsvpRefreshTrigger] = useState(0);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  // Make RSVP refresh handler available globally
  React.useEffect(() => {
    const handleRsvpChange = () => {
      setRsvpRefreshTrigger((prev) => prev + 1);
    };

    window.addEventListener("calandar:rsvp-updated", handleRsvpChange);
    return () => {
      window.removeEventListener("calandar:rsvp-updated", handleRsvpChange);
    };
  }, []);

  return (
    <Box sx={{ display: "flex" }}>
      <CssBaseline />
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
        }}
      >
        <Toolbar
          sx={{
            pr: "24px", // keep right padding when drawer closed
          }}
        >
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: "none" } }}
          >
            <MenuIcon />
          </IconButton>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h4">
              <CalandarIcon />
            </Typography>
            <Typography
              component="h1"
              variant="h4"
              color="inherit"
              noWrap
              sx={{ flexGrow: 1 }}
            >
              caLANdar
            </Typography>
          </Stack>
          {/* <IconButton color="inherit">
              <Badge badgeContent={4} color="secondary">
                <NotificationsIcon />
              </Badge>
            </IconButton> */}
        </Toolbar>
      </AppBar>
      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
        aria-label="mailbox folders"
      >
        {/* The implementation can be swapped with js to avoid SEO duplication of links. */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true, // Better open performance on mobile.
          }}
          sx={{
            display: { xs: "block", sm: "none" },
            "& .MuiDrawer-paper": {
              boxSizing: "border-box",
              width: drawerWidth,
            },
          }}
        >
          <MenuItems
            updateButtonLoadingState={menuUpdateButtonLoadingState}
            updateButtonDoneState={menuUpdateButtonDoneState}
            rsvpRefreshTrigger={rsvpRefreshTrigger}
          />
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: "none", sm: "block" },
            "& .MuiDrawer-paper": {
              boxSizing: "border-box",
              width: drawerWidth,
            },
          }}
          open
        >
          <MenuItems
            updateButtonLoadingState={menuUpdateButtonLoadingState}
            updateButtonDoneState={menuUpdateButtonDoneState}
            rsvpRefreshTrigger={rsvpRefreshTrigger}
          />
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{
          backgroundColor: (theme) => theme.palette.background.default,
          flexGrow: 1,
          height: "100vh",
          overflow: "auto",
        }}
      >
        <Toolbar />
        {props.children}
      </Box>
    </Box>
  );
}

export default function Dashboard(props: AppProps) {
  return <ResponsiveDrawer>{props.children}</ResponsiveDrawer>;
}
