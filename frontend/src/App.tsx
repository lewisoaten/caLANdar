import React from "react";
import "./App.css";
import { UserProvider } from "./UserProvider";
import Views from "./Views";
import Dashboard from "./components/Dashboard";
import { createTheme, ThemeProvider } from "@mui/material/styles";

function App() {
  const theme = createTheme({ palette: { mode: "dark" } });

  return (
    <UserProvider>
      <ThemeProvider theme={theme}>
        <Dashboard>
          <Views />
        </Dashboard>
      </ThemeProvider>
    </UserProvider>
  );
}

export default App;
