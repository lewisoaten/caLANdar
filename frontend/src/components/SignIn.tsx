import * as React from "react";
import { useContext, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ArrowForwardSharp from "@mui/icons-material/ArrowForwardSharp";
import MarkEmailReadSharp from "@mui/icons-material/MarkEmailReadSharp";
import { UserDispatchContext } from "../UserProvider";
import { colors } from "./hl";
import AuthLayout, {
  AuthKicker,
  AuthTitle,
  authCtaSx,
  bigInputSx,
  fieldLabelSx,
  looksLikeEmail,
} from "./AuthLayout";

export default function SignIn() {
  const { signIn, isSignedIn } = useContext(UserDispatchContext);

  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    // Prevent page reload
    event.preventDefault();

    const value = email.trim();
    if (!value) {
      setError("Enter your email address.");
      inputRef.current?.focus();
      return;
    }
    if (!looksLikeEmail(value)) {
      setError("That doesn't look like an email address.");
      inputRef.current?.focus();
      return;
    }

    setError(null);
    setLoading(true);
    Promise.resolve(signIn(value))
      .then(() => {
        setSubmitted(true);
      })
      .catch(() => {
        setError(
          "We couldn't send a login link to that address. Check it's the one your invite came to.",
        );
        inputRef.current?.focus();
      })
      .finally(() => setLoading(false));
  };

  const reset = () => {
    setSubmitted(false);
    setError(null);
  };

  useEffect(() => {
    if (isSignedIn()) {
      navigate(location.state?.from || "/events");
    }
    // Only on first render: redirect users who are already signed in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Move focus to the new heading when the view switches, so screen reader
  // and keyboard users hear the result.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (submitted) headingRef.current?.focus();
    else inputRef.current?.focus();
  }, [submitted]);

  return (
    <AuthLayout>
      {!submitted ? (
        <>
          <Box sx={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <AuthKicker>Player login</AuthKicker>
            <AuthTitle>Jump in</AuthTitle>
            <Typography
              sx={{
                m: 0,
                fontSize: 16,
                lineHeight: 1.6,
                color: colors.textMuted,
              }}
            >
              Enter your email and we&apos;ll send a one-time login link. No
              passwords.
            </Typography>
          </Box>
          <Box
            component="form"
            onSubmit={handleSubmit}
            noValidate
            sx={{ display: "flex", flexDirection: "column", gap: "14px" }}
          >
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <Box component="label" htmlFor="email" sx={fieldLabelSx}>
                Email
              </Box>
              <TextField
                id="email"
                name="email"
                type="email"
                required
                fullWidth
                autoComplete="email"
                autoFocus
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                error={Boolean(error)}
                helperText={error ?? undefined}
                inputRef={inputRef}
                slotProps={{
                  htmlInput: { inputMode: "email", spellCheck: false },
                  formHelperText: { role: "alert" },
                }}
                sx={bigInputSx}
              />
            </Box>
            <Button
              type="submit"
              variant="contained"
              size="large"
              loading={loading}
              loadingPosition="end"
              endIcon={<ArrowForwardSharp aria-hidden="true" />}
              fullWidth
              sx={authCtaSx}
            >
              Send login link
            </Button>
          </Box>
          <Typography
            sx={{ m: 0, fontSize: 14, lineHeight: 1.6, color: colors.textDim }}
          >
            Invite only. If you&apos;ve been invited to an event, use the same
            email the invite came to.
          </Typography>
        </>
      ) : (
        <>
          <Box sx={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <MarkEmailReadSharp
              aria-hidden="true"
              sx={{ fontSize: 44, color: colors.lime }}
            />
            <AuthTitle ref={headingRef} size="clamp(30px,4vw,40px)">
              Check your inbox
            </AuthTitle>
            <Typography
              sx={{
                m: 0,
                fontSize: 16,
                lineHeight: 1.6,
                color: colors.textMuted,
              }}
            >
              We sent a login link to{" "}
              <Box component="strong" sx={{ color: colors.text }}>
                {email.trim()}
              </Box>
              . It expires in 30 minutes.
            </Typography>
          </Box>
          <Box sx={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <Button
              component={Link}
              to="/verify_email"
              variant="contained"
              size="large"
            >
              Enter code manually
            </Button>
            <Button
              variant="outlined"
              color="inherit"
              size="large"
              onClick={reset}
            >
              Use another email
            </Button>
          </Box>
        </>
      )}
    </AuthLayout>
  );
}
