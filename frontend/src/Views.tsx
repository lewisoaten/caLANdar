import React from "react";
import { Route, Routes } from "react-router-dom";
import SignIn from "./components/SignIn";
import VerifyEmail from "./components/VerifyEmail";
import Account from "./components/Account";
import Home from "./components/Home";
import ProtectedRoutes from "./ProtectedRoutes";

const Views = () => {
  return (
    <Routes>
      <Route path="/" element={<SignIn />} />
      <Route path="/verify_email">
        <Route path=":token" element={<VerifyEmail />} />
        <Route path="" element={<VerifyEmail />} />
      </Route>
      <Route element={<ProtectedRoutes />}>
        <Route path="/home" element={<Home />} />
        <Route path="/account" element={<Account />} />
      </Route>
    </Routes>
  );
};

export default Views;
