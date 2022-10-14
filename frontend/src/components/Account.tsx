import React from "react";
import { Button, Container, Grid, Paper, Typography } from "@mui/material";
import { useContext } from "react";
import { UserDispatchContext, UserContext } from "../UserProvider";

const Account = () => {
  const { signOut } = useContext(UserDispatchContext);
  const { email } = useContext(UserContext);

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
            <Typography
              component="h2"
              variant="h6"
              color="primary"
              gutterBottom
            >
              Account page
            </Typography>
            <Typography variant="subtitle1" gutterBottom>
              {email}
            </Typography>
            <Button onClick={onClick}>Sign Out</Button>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
};

export default Account;
