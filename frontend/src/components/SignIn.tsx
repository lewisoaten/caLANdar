import React from "react";
import { useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import CssBaseline from "@mui/material/CssBaseline";
import TextField from "@mui/material/TextField";
import Box from "@mui/material/Box";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import Alert from "@mui/material/Alert";
import Typography from "@mui/material/Typography";
import Container from "@mui/material/Container";
import { UserDispatchContext } from "../UserProvider";
import { useNavigate, useLocation } from "react-router-dom";

export default function SignIn() {
  const { signIn, isSignedIn } = useContext(UserDispatchContext);

  const navigate = useNavigate();
  const location = useLocation();

  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    // Prevent page reload
    event.preventDefault();

    const data = new FormData(event.currentTarget);

    //Validate email
    const email = data.get("email") as string;
    if (!email) {
      alert("Please enter an email");
      return;
    }

    signIn(email)
      // @ts-ignore: Cannot possibly work out why this is complaining about type.
      .then(() => {
        setSubmitted(true);
      });
  };

  useEffect(() => {
    if (isSignedIn()) {
      navigate(location.state?.from || "/home");
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Container component="main" maxWidth="xs">
      <CssBaseline />
      <Box
        sx={{
          marginTop: 8,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <Avatar sx={{ m: 1, bgcolor: "secondary.main" }}>
          <LockOutlinedIcon />
        </Avatar>
        <Typography component="h1" variant="h5">
          Sign In
        </Typography>
        {!submitted ? (
          <Box
            component="form"
            onSubmit={handleSubmit}
            noValidate
            sx={{ mt: 1 }}
          >
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label="Email Address"
              name="email"
              autoComplete="email"
              autoFocus
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
            >
              Submit Email Verification
            </Button>
          </Box>
        ) : (
          <React.Fragment>
            <Alert severity="success">
              Verification email sent, please click the link in your email to
              continue.
            </Alert>
            <Button component={Link} to="/verify_email">
              Enter Verification Token
            </Button>
          </React.Fragment>
        )}
      </Box>
    </Container>
  );
}
