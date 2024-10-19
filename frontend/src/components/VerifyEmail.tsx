import React from "react";
import { useContext, useEffect, useState, useRef } from "react";
import {
  Avatar,
  Box,
  Container,
  CssBaseline,
  TextField,
  Typography,
} from "@mui/material";
import LoadingButton from "@mui/lab/LoadingButton";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { UserDispatchContext } from "../UserProvider";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";

export default function VerifyEmail() {
  const submitButton = useRef<HTMLButtonElement>(null);

  const { verifyEmail, isSignedIn } = useContext(UserDispatchContext);

  const navigate = useNavigate();
  const location = useLocation();

  const [searchParams] = useSearchParams();
  const [urlToken] = useState(searchParams.get("token"));

  const [loading, setLoading] = React.useState(false);

  searchParams.delete("token");

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    // Prevent page reload
    event.preventDefault();

    setLoading(true);

    const data = new FormData(event.currentTarget);

    //Validate email
    const token = data.get("token") as string;
    if (!token) {
      alert("Please enter your verification token.");
      return;
    }

    verifyEmail(token);
  };

  useEffect(() => {
    if (isSignedIn()) {
      navigate(location.state?.from || "/events");
    } else if (urlToken) {
      if (submitButton.current) {
        submitButton.current.click();
      }
    }
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
          Verify Email Token
        </Typography>
        <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1 }}>
          <TextField
            margin="normal"
            required
            fullWidth
            id="token"
            label="Token"
            name="token"
            autoComplete="token"
            defaultValue={urlToken}
            autoFocus
          />
          <LoadingButton
            type="submit"
            ref={submitButton}
            loading={loading}
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
          >
            Sign In
          </LoadingButton>
        </Box>
      </Box>
    </Container>
  );
}
