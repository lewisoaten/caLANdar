import React from "react";
import moment from "moment";
import "moment/min/locales.min";
import "./App.css";
import { UserProvider } from "./UserProvider";
import Views from "./Views";
import Dashboard from "./components/Dashboard";
import { BackgroundFxProvider } from "./components/hl/BackgroundFx";
import { HlSnackbarProvider } from "./components/hl/HlSnackbarProvider";

function App() {
  moment.updateLocale("en-gb", {});

  return (
    <UserProvider>
      <BackgroundFxProvider>
        <HlSnackbarProvider>
          <Dashboard>
            <Views />
          </Dashboard>
        </HlSnackbarProvider>
      </BackgroundFxProvider>
    </UserProvider>
  );
}

export default App;
