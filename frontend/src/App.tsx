import React from "react";
import "./App.css";
import { UserProvider } from "./UserProvider";
import Views from "./Views";
import Menu from "./components/Menu";

function App() {
  return (
    <UserProvider>
      <div>
        <Menu />
        <Views />
      </div>
    </UserProvider>
  );
}

export default App;
