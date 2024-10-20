import React from "react";
import { ReactNode, createContext, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import * as Sentry from "@sentry/react";

interface IUserContext {
  email: string;
  token: string;
  loggedIn: boolean;
  isAdmin: boolean;
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

const UserDispatchContext = createContext({
  signIn: (_email: string) => Promise<Response>,
  verifyEmail: (_token: string) => Promise<Response>,
  signOut: () => {},
  isSignedIn: () => false as boolean,
});

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
        redirect: location.state?.from.pathname,
      }),
    }).then((response) => {
      if (response.status === 200) {
        return response.json();
      } else {
        alert("Invalid email");
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
          alert("Invalid verification token");
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
        navigate(response.redirect || "/events");
        return accountDetails;
      });
  }

  function signOut() {
    localStorage.removeItem("user_context");
    setUserDetails(getStoredAccount());
    navigate("/");
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

  const dispatchContext = {
    signIn,
    verifyEmail,
    signOut,
    isSignedIn,
  };

  return (
    <UserContext.Provider value={userDetails}>
      <UserDispatchContext.Provider value={dispatchContext}>
        {children}
      </UserDispatchContext.Provider>
    </UserContext.Provider>
  );
}

export { UserProvider, UserContext, UserDispatchContext };
