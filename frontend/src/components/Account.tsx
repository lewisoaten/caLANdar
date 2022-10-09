import React from "react";
import Button from "@mui/material/Button";
import { useContext } from "react";
import { UserDispatchContext } from "../UserProvider";

const Account = () => {
  const { signOut } = useContext(UserDispatchContext);

  const onClick = () => {
    signOut();
  };

  return (
    <div>
      <p>(Protected) Account page</p>
      <Button onClick={onClick}>Sign Out</Button>
    </div>
  );
};

export default Account;
