import * as React from "react";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { Link } from "react-router-dom";

const theme = createTheme();

const Menu = () => {
  return (
    <ThemeProvider theme={theme}>
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
    </ThemeProvider>
  );
};

export default Menu;
