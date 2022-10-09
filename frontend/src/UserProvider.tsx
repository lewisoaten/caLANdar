import React, { Dispatch, ReactNode, createContext, useState } from "react";
import { useNavigate } from "react-router-dom";

interface IUserContext {
  email: string;
  token: string;
  loggedIn: boolean;
}

// Create two context:
// UserContext: to query the context state
// UserDispatchContext: to mutate the context state
const UserContext = createContext({} as IUserContext);
const UserDispatchContext = createContext({
  signIn: (email: string, redirectTo: string) => {},
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

  function signIn(email: string, redirectTo: string = "/home") {
    const user_details = getStoredAccount();
    if (user_details.loggedIn) {
      return user_details;
    }

    fetch(`${process.env.REACT_APP_API_PROXY}/api/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: email }),
    })
      .then((response) => {
        if (response.status === 200) {
          return response.json();
        } else {
          alert("Invalid email");
          throw new Error("Invalid email");
        }
      })
      .then((response) => {
        const accountDetails = {
          email: email,
          token: response.token,
          loggedIn: true,
        };
        setAccount(accountDetails);
        navigate(redirectTo);
        return accountDetails;
      });

    return {} as IUserContext;
  }

  function signOut() {
    localStorage.removeItem("user_context");
    navigate("/");
  }

  function getStoredAccount() {
    const user = localStorage.getItem("user_context");
    return user ? JSON.parse(user) : ({} as IUserContext);
  }

  function isSignedIn() {
    return getStoredAccount().loggedIn;
  }

  function setAccount(user_context: IUserContext) {
    localStorage.setItem("user_context", JSON.stringify(user_context));
    setUserDetails(user_context);
  }

  const dispatchContext = {
    signIn,
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
