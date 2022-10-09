import * as React from "react";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { Link } from "react-router-dom";

const Menu = () => {
  return (
    <Stack direction="row" spacing={2}>
      <Button component={Link} to="/">
        Sign In Page
      </Button>
      <Button component={Link} to="/home">
        Home Page
      </Button>
      <Button component={Link} to="/account">
        Account Page
      </Button>
    </Stack>
  );
};

export default Menu;
