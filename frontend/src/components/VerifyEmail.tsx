import React from "react";
import { useContext, useEffect } from "react";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import CssBaseline from "@mui/material/CssBaseline";
import TextField from "@mui/material/TextField";
import Box from "@mui/material/Box";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import Typography from "@mui/material/Typography";
import Container from "@mui/material/Container";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { UserDispatchContext } from "../UserProvider";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";

const theme = createTheme();

export default function VerifyEmail() {
  const { verifyEmail, isSignedIn } = useContext(UserDispatchContext);

  const navigate = useNavigate();
  const location = useLocation();

  const [searchParams] = useSearchParams();
  let [urlToken] = React.useState(searchParams.get("token"));

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    // Prevent page reload
    event.preventDefault();

    const data = new FormData(event.currentTarget);

    //Validate email
    const token = data.get("token") as string;
    if (!token) {
      alert("Please enter your verification token.");
      return;
    }

    verifyEmail(token)
      // @ts-ignore: Cannot possibly work out why this is complaining about type.
      .then(() => {
        navigate(location.state?.from || "/home");
      });
  };

  useEffect(() => {
    if (isSignedIn()) {
      navigate(location.state?.from || "/home");
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ThemeProvider theme={theme}>
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
              id="token"
              label="Token"
              name="token"
              autoComplete="token"
              defaultValue={urlToken}
              autoFocus
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
            >
              Sign In
            </Button>
          </Box>
        </Box>
      </Container>
    </ThemeProvider>
  );
}
