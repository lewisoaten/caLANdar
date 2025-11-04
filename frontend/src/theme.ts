import { createTheme } from "@mui/material/styles";

/**
 * CaLANdar Custom Theme - Futuristic Gamer Aesthetic
 *
 * This theme provides a modern, high-contrast design tailored for gamers
 * organizing LAN parties. Features include:
 * - Deep purple/violet primary colors
 * - Neon cyan/magenta/green accents
 * - Dark backgrounds with subtle gradients
 * - Bold, readable typography
 * - Glowing effects on interactive elements
 *
 * To extend this theme:
 * - Modify palette colors below
 * - Add component-specific overrides in components section
 * - Adjust typography for different font families
 */

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#5F27DD", // Deep violet
      light: "#8854ff",
      dark: "#3d1a8f",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#08F7FE", // Neon cyan
      light: "#5ffbff",
      dark: "#00c4cb",
      contrastText: "#000000",
    },
    error: {
      main: "#F2059F", // Hot pink
      light: "#ff4dbe",
      dark: "#b80077",
    },
    warning: {
      main: "#FFA500", // Orange
      light: "#ffb733",
      dark: "#cc8400",
    },
    info: {
      main: "#08F7FE", // Neon cyan
      light: "#5ffbff",
      dark: "#00c4cb",
    },
    success: {
      main: "#51FF7E", // Neon green
      light: "#7fffaa",
      dark: "#2acc5f",
    },
    background: {
      default: "#16161a", // Very dark blue-black
      paper: "#232946", // Dark blue-purple
    },
    text: {
      primary: "#fffffe", // Near white
      secondary: "#b8c1ec", // Light purple-blue
      disabled: "#7f8ba3",
    },
    divider: "rgba(95, 39, 221, 0.2)", // Semi-transparent violet
  },
  typography: {
    fontFamily: [
      "Montserrat",
      "-apple-system",
      "BlinkMacSystemFont",
      '"Segoe UI"',
      "Roboto",
      '"Helvetica Neue"',
      "Arial",
      "sans-serif",
    ].join(","),
    h1: {
      fontWeight: 700,
      letterSpacing: "-0.02em",
    },
    h2: {
      fontWeight: 700,
      letterSpacing: "-0.01em",
    },
    h3: {
      fontWeight: 700,
      letterSpacing: "-0.01em",
    },
    h4: {
      fontWeight: 700,
      letterSpacing: "0em",
    },
    h5: {
      fontWeight: 600,
      letterSpacing: "0em",
    },
    h6: {
      fontWeight: 600,
      letterSpacing: "0.01em",
    },
    button: {
      fontWeight: 600,
      textTransform: "none", // Modern, less shouty buttons
      letterSpacing: "0.02em",
    },
  },
  shape: {
    borderRadius: 8, // Slightly rounded corners for modern look
  },
  shadows: [
    "none",
    "0px 2px 4px rgba(95, 39, 221, 0.2)",
    "0px 4px 8px rgba(95, 39, 221, 0.25)",
    "0px 6px 12px rgba(95, 39, 221, 0.3)",
    "0px 8px 16px rgba(95, 39, 221, 0.35)",
    "0px 10px 20px rgba(95, 39, 221, 0.4)",
    "0px 12px 24px rgba(95, 39, 221, 0.45)",
    "0px 14px 28px rgba(95, 39, 221, 0.5)",
    "0px 16px 32px rgba(95, 39, 221, 0.55)",
    "0px 18px 36px rgba(95, 39, 221, 0.6)",
    "0px 20px 40px rgba(95, 39, 221, 0.65)",
    "0px 22px 44px rgba(95, 39, 221, 0.7)",
    "0px 24px 48px rgba(95, 39, 221, 0.75)",
    "0px 26px 52px rgba(95, 39, 221, 0.8)",
    "0px 28px 56px rgba(95, 39, 221, 0.85)",
    "0px 30px 60px rgba(95, 39, 221, 0.9)",
    "0px 32px 64px rgba(95, 39, 221, 0.95)",
    "0px 34px 68px rgba(95, 39, 221, 1)",
    "0px 36px 72px rgba(95, 39, 221, 1)",
    "0px 38px 76px rgba(95, 39, 221, 1)",
    "0px 40px 80px rgba(95, 39, 221, 1)",
    "0px 42px 84px rgba(95, 39, 221, 1)",
    "0px 44px 88px rgba(95, 39, 221, 1)",
    "0px 46px 92px rgba(95, 39, 221, 1)",
    "0px 48px 96px rgba(95, 39, 221, 1)",
  ],
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          // Subtle gradient background
          background: "linear-gradient(135deg, #16161a 0%, #232946 100%)",
          backgroundAttachment: "fixed",
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: false,
      },
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: "10px 24px",
          transition: "all 0.3s ease-in-out",
        },
        contained: {
          boxShadow: "0px 4px 12px rgba(95, 39, 221, 0.4)",
          "&:hover": {
            boxShadow: "0px 6px 20px rgba(95, 39, 221, 0.6)",
            transform: "translateY(-2px)",
          },
        },
        outlined: {
          borderWidth: 2,
          "&:hover": {
            borderWidth: 2,
            boxShadow: "0px 4px 12px rgba(95, 39, 221, 0.3)",
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          backgroundImage: "linear-gradient(135deg, #232946 0%, #1a1f3a 100%)",
          border: "1px solid rgba(95, 39, 221, 0.2)",
          transition: "all 0.3s ease-in-out",
          "&:hover": {
            border: "1px solid rgba(95, 39, 221, 0.5)",
            boxShadow: "0px 8px 24px rgba(95, 39, 221, 0.4)",
            transform: "translateY(-4px)",
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "linear-gradient(135deg, #232946 0%, #1a1f3a 100%)",
          border: "1px solid rgba(95, 39, 221, 0.1)",
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: "linear-gradient(90deg, #232946 0%, #2d3561 100%)",
          borderBottom: "2px solid rgba(8, 247, 254, 0.3)",
          boxShadow: "0px 4px 20px rgba(8, 247, 254, 0.2)",
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundImage: "linear-gradient(180deg, #232946 0%, #1a1f3a 100%)",
          borderRight: "2px solid rgba(95, 39, 221, 0.3)",
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            "& fieldset": {
              borderColor: "rgba(95, 39, 221, 0.3)",
              borderWidth: 2,
            },
            "&:hover fieldset": {
              borderColor: "rgba(95, 39, 221, 0.5)",
            },
            "&.Mui-focused fieldset": {
              borderColor: "#08F7FE",
              boxShadow: "0px 0px 8px rgba(8, 247, 254, 0.5)",
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          borderRadius: 6,
        },
        filled: {
          border: "1px solid rgba(95, 39, 221, 0.3)",
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: "1px solid rgba(95, 39, 221, 0.2)",
        },
        head: {
          fontWeight: 700,
          background: "rgba(95, 39, 221, 0.1)",
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 600,
        },
        filledSuccess: {
          background: "linear-gradient(135deg, #51FF7E 0%, #2acc5f 100%)",
        },
        filledError: {
          background: "linear-gradient(135deg, #F2059F 0%, #b80077 100%)",
        },
        filledWarning: {
          background: "linear-gradient(135deg, #FFA500 0%, #cc8400 100%)",
        },
        filledInfo: {
          background: "linear-gradient(135deg, #08F7FE 0%, #00c4cb 100%)",
        },
      },
    },
    MuiAvatar: {
      styleOverrides: {
        root: {
          border: "2px solid rgba(8, 247, 254, 0.5)",
          boxShadow: "0px 0px 12px rgba(8, 247, 254, 0.3)",
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
          border: "2px solid rgba(95, 39, 221, 0.3)",
          boxShadow: "0px 12px 40px rgba(95, 39, 221, 0.6)",
        },
      },
    },
  },
});

export default theme;
