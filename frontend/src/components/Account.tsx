import React from "react";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import { useContext } from "react";
import { UserDispatchContext } from "../UserProvider";
import Title from "./Title";

const Account = () => {
  const { signOut } = useContext(UserDispatchContext);

  const onClick = () => {
    signOut();
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Grid container spacing={3}>
        <Grid item xs={12} md={12} lg={12}>
          <Paper
            sx={{
              p: 2,
              display: "flex",
              flexDirection: "column",
              height: 240,
            }}
          >
            <Title>Account page</Title>
            <Button onClick={onClick}>Sign Out</Button>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
};

export default Account;
