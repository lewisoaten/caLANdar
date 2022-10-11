import React, { ReactNode, createContext, useState } from "react";
import { useNavigate } from "react-router-dom";

interface IUserContext {
  email: string;
  token: string;
  loggedIn: boolean;
}

// Create two context:
// UserContext: to query the context state
// UserDispatchContext: to mutate the context state
const UserContext = createContext({
  email: "",
  token: "",
  loggedIn: false,
} as IUserContext);
const UserDispatchContext = createContext({
  signIn: (email: string) => Promise<Response>,
  verifyEmail: (token: string) => Promise<Response>,
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

  function signIn(email: string) {
    const user_details = getStoredAccount();
    if (user_details.loggedIn) {
      return user_details;
    }

    const signin_promise = fetch(
      `${process.env.REACT_APP_API_PROXY}/api/login`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: email }),
      },
    ).then((response) => {
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

    return fetch(`${process.env.REACT_APP_API_PROXY}/api/verify-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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
        };
        localStorage.setItem("user_context", JSON.stringify(accountDetails));
        setUserDetails(accountDetails);
        return accountDetails;
      });
  }

  function signOut() {
    localStorage.removeItem("user_context");
    setUserDetails({ email: "", token: "", loggedIn: false });
    navigate("/");
  }

  function getStoredAccount() {
    const user = localStorage.getItem("user_context");
    return user
      ? JSON.parse(user)
      : ({ email: "", token: "", loggedIn: false } as IUserContext);
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
