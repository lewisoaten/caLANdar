import React from "react";
import moment from "moment";
import "moment/min/locales.min";
import "./App.css";
import { UserProvider } from "./UserProvider";
import Views from "./Views";
import Dashboard from "./components/Dashboard";
import { SnackbarProvider } from "notistack";

function App() {
  moment.updateLocale("en-gb", {});

  return (
    <UserProvider>
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
    </UserProvider>
  );
}

export default App;
