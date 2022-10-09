import React from "react";
import { useContext } from "react";
import { useLocation } from "react-router";
import { Navigate, Outlet } from "react-router-dom";
import { UserDispatchContext } from "./UserProvider";

const ProtectedRoutes = () => {
  const { isSignedIn } = useContext(UserDispatchContext);
  const location = useLocation();
  return isSignedIn() ? (
    <Outlet />
  ) : (
    <Navigate to="/" replace state={{ from: location }} />
  );
};

export default ProtectedRoutes;
