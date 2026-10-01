import React from "react";
import { useContext, useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useSnackbar } from "notistack";
import { UserContext, UserDispatchContext } from "./UserProvider";

const ProtectedRoutes = () => {
  const { isSignedIn } = useContext(UserDispatchContext);
  const location = useLocation();
  return isSignedIn() ? (
    <Outlet />
  ) : (
    <Navigate to="/" replace state={{ from: location }} />
  );
};

/** Toast shown when a non-admin is sent away from an admin page. */
export const ADMINS_ONLY_MESSAGE = "Admins only";

/** Redirects non-admins to /events with a toast; nest inside ProtectedRoutes. */
export const AdminRoutes = () => {
  const { isAdmin } = useContext(UserContext);
  const { enqueueSnackbar } = useSnackbar();
  useEffect(() => {
    if (!isAdmin) {
      enqueueSnackbar(ADMINS_ONLY_MESSAGE, {
        variant: "warning",
        preventDuplicate: true,
      });
    }
  }, [isAdmin, enqueueSnackbar]);
  return isAdmin ? <Outlet /> : <Navigate to="/events" replace />;
};

export default ProtectedRoutes;
