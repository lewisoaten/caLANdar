import React from "react";
import moment from "moment";
import "moment/min/locales.min";
import "./App.css";
import { UserProvider } from "./UserProvider";
import Views from "./Views";
import Dashboard from "./components/Dashboard";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { SnackbarProvider } from "notistack";

function App() {
  const theme = createTheme({ palette: { mode: "dark" } });
  moment.updateLocale("en-gb", {});

  return (
    <UserProvider>
      <ThemeProvider theme={theme}>
        <SnackbarProvider
          maxSnack={3}
          anchorOrigin={{
            vertical: "bottom",
            horizontal: "right",
          }}
        >
          <Dashboard>
            <Views />
          </Dashboard>
        </SnackbarProvider>
      </ThemeProvider>
    </UserProvider>
  );
}

export default App;
