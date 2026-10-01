import React from "react";
import {
  ReactNode,
  createContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import * as Sentry from "@sentry/react";

interface IUserContext {
  email: string;
  token: string;
  loggedIn: boolean;
  isAdmin: boolean;
}

interface IUserDispatchContext {
  signIn: (email: string) => Promise<Response>;
  verifyEmail: (token: string) => Promise<Response>;
  signOut: () => void;
  isSignedIn: () => boolean;
}

// Create two context:
// UserContext: to query the context state
// UserDispatchContext: to mutate the context state
const UserContext = createContext({
  email: "",
  token: "",
  loggedIn: false,
  isAdmin: false,
} as IUserContext);

const defaultDispatchContext: IUserDispatchContext = {
  signIn: () =>
    Promise.reject(new Error("signIn not implemented")) as Promise<Response>,
  verifyEmail: () =>
    Promise.reject(
      new Error("verifyEmail not implemented"),
    ) as Promise<Response>,
  signOut: () => {},
  isSignedIn: () => false,
};

const UserDispatchContext = createContext<IUserDispatchContext>(
  defaultDispatchContext,
);

interface Props {
  children?: ReactNode;
  // any props that come into the component
}

// A "provider" is used to encapsulate only the
// components that needs the state in this context
function UserProvider({ children }: Props) {
  const [userDetails, setUserDetails] = useState(getStoredAccount());

  const navigate = useNavigate();
  const location = useLocation();
  // Keep the latest router values in refs so the dispatch functions below can
  // keep a stable identity. Consumers list them in effect dependencies, and a
  // new identity on every navigation would refetch their data each time.
  const navigateRef = useRef(navigate);
  const locationRef = useRef(location);
  useEffect(() => {
    navigateRef.current = navigate;
    locationRef.current = location;
  }, [navigate, location]);

  function signIn(email: string) {
    const user_details = getStoredAccount();
    if (user_details.loggedIn) {
      return user_details;
    }

    const signin_promise = fetch(`/api/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        email: email,
        redirect: locationRef.current.state?.from?.pathname,
      }),
    }).then((response) => {
      if (response.status === 200) {
        return response.json();
      } else {
        throw new Error("Invalid email");
      }
    });

    return signin_promise;
  }

  function verifyEmail(token: string) {
    const user_details = getStoredAccount();
    if (user_details.loggedIn) {
      return user_details;
    }

    return fetch(`/api/verify-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ token: token }),
    })
      .then((response) => {
        if (response.status === 200) {
          return response.json();
        } else {
          throw new Error("Invalid verification token");
        }
      })
      .then((response) => {
        const accountDetails = {
          email: response.email,
          token: response.token,
          loggedIn: true,
          isAdmin: response.isAdmin,
        };
        localStorage.setItem("user_context", JSON.stringify(accountDetails));
        setUserDetails(accountDetails);
        Sentry.setUser({ email: accountDetails.email });
        navigateRef.current(response.redirect || "/events");
        return accountDetails;
      });
  }

  function signOut() {
    localStorage.removeItem("user_context");
    setUserDetails(getStoredAccount());
    navigateRef.current("/");
  }

  function getStoredAccount() {
    const user = localStorage.getItem("user_context");
    const obtainedUser = user
      ? JSON.parse(user)
      : ({
          email: "",
          token: "",
          loggedIn: false,
          isAdmin: false,
        } as IUserContext);
    if (obtainedUser.loggedIn) {
      Sentry.setUser({ email: obtainedUser.email });
    } else {
      Sentry.setUser(null);
    }
    return obtainedUser;
  }

  function isSignedIn() {
    return getStoredAccount().loggedIn;
  }

  // The functions only read refs, localStorage and state setters, none of
  // which change, so the context value is created once.
  const dispatchContext = useMemo(
    () => ({ signIn, verifyEmail, signOut, isSignedIn }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <UserContext.Provider value={userDetails}>
      <UserDispatchContext.Provider value={dispatchContext}>
        {children}
      </UserDispatchContext.Provider>
    </UserContext.Provider>
  );
}

export { UserProvider, UserContext, UserDispatchContext };
