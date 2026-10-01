import * as React from "react";
import { useContext, useEffect, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import CheckSharp from "@mui/icons-material/CheckSharp";
import MoreHorizSharp from "@mui/icons-material/MoreHorizSharp";
import RadioButtonUncheckedSharp from "@mui/icons-material/RadioButtonUncheckedSharp";
import ErrorOutlineSharp from "@mui/icons-material/ErrorOutlineSharp";
import { UserDispatchContext } from "../UserProvider";
import { colors, fonts, srOnly, tint } from "./hl";
import AuthLayout, {
  AuthKicker,
  AuthTitle,
  authCtaSx,
  bigInputSx,
  fieldLabelSx,
} from "./AuthLayout";

export const VERIFY_STEPS = [
  "Link token received",
  "Identity confirmed",
  "Loading your events",
] as const;

export type StepState = "done" | "active" | "todo";

/** State of each verify step when `progress` steps are complete (0-3). */
export function verifyStepStates(progress: number): StepState[] {
  return VERIFY_STEPS.map((_, i) =>
    i < progress ? "done" : i === progress ? "active" : "todo",
  );
}

const stepStyle: Record<
  StepState,
  { color: string; icon: React.ReactNode; sr: string }
> = {
  done: { color: colors.lime, icon: <CheckSharp />, sr: "done" },
  active: { color: colors.cyan, icon: <MoreHorizSharp />, sr: "in progress" },
  todo: {
    color: colors.placeholder,
    icon: <RadioButtonUncheckedSharp />,
    sr: "to do",
  },
};

function VerifyProgress({ progress }: { progress: number }) {
  const states = verifyStepStates(progress);
  return (
    <>
      <Box
        role="progressbar"
        aria-label="Sign-in progress"
        aria-valuemin={0}
        aria-valuemax={VERIFY_STEPS.length}
        aria-valuenow={progress}
        aria-valuetext={`${progress} of ${VERIFY_STEPS.length} steps complete`}
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "4px",
        }}
      >
        {states.map((s, i) => (
          <Box
            key={i}
            sx={{
              height: 6,
              backgroundColor: s === "done" ? colors.cyan : tint("cyan", 0.12),
              transition: "background-color .3s",
            }}
          />
        ))}
      </Box>
      <Box
        component="ol"
        sx={{
          listStyle: "none",
          m: 0,
          p: 0,
          display: "flex",
          flexDirection: "column",
          gap: "2px",
          fontFamily: fonts.mono,
          fontSize: 13,
        }}
      >
        {states.map((s, i) => (
          <Box
            component="li"
            key={i}
            aria-current={s === "active" ? "step" : undefined}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              minHeight: 36,
              color: stepStyle[s].color,
              "& svg": { fontSize: 18 },
            }}
          >
            <Box
              component="span"
              aria-hidden="true"
              sx={{ display: "inline-flex" }}
            >
              {stepStyle[s].icon}
            </Box>
            {VERIFY_STEPS[i]}
            <Box component="span" sx={srOnly}>
              {` (${stepStyle[s].sr})`}
            </Box>
          </Box>
        ))}
      </Box>
    </>
  );
}

type Phase = "form" | "verifying" | "done" | "error";

export default function VerifyEmail() {
  const { verifyEmail, isSignedIn } = useContext(UserDispatchContext);

  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();

  const [searchParams] = useSearchParams();
  const [urlToken] = useState(
    () => searchParams.get("token") ?? params.token ?? null,
  );

  const [token, setToken] = useState(urlToken ?? "");
  const [phase, setPhase] = useState<Phase>(urlToken ? "verifying" : "form");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const started = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const verify = (value: string) => {
    setPhase("verifying");
    Promise.resolve(verifyEmail(value))
      // The provider stores the session and navigates on success.
      .then(() => setPhase("done"))
      .catch(() => setPhase("error"));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    // Prevent page reload
    event.preventDefault();

    const value = token.trim();
    if (!value) {
      setFieldError("Paste the token from your login email.");
      inputRef.current?.focus();
      return;
    }
    setFieldError(null);
    verify(value);
  };

  useEffect(() => {
    if (isSignedIn()) {
      navigate(location.state?.from || "/events");
    } else if (urlToken && !started.current) {
      // Guarded so StrictMode's double effect doesn't spend the token twice.
      started.current = true;
      verify(urlToken);
    }
    // Only on first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase === "error") headingRef.current?.focus();
  }, [phase]);

  const showForm = phase === "form" || phase === "error";
  const progress = phase === "done" ? 3 : phase === "verifying" ? 1 : 0;

  return (
    <AuthLayout>
      {showForm ? (
        <>
          <Box sx={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {phase === "error" ? (
              <AuthKicker color={colors.pinkText}>Link problem</AuthKicker>
            ) : (
              <AuthKicker>Manual entry</AuthKicker>
            )}
            <AuthTitle ref={headingRef} size="clamp(30px,4vw,40px)">
              {phase === "error" ? "Link didn't work" : "Verify email token"}
            </AuthTitle>
            <Typography
              sx={{
                m: 0,
                fontSize: 16,
                lineHeight: 1.6,
                color: colors.textMuted,
              }}
            >
              {phase === "error"
                ? "That login link is invalid or has expired (links last 30 minutes). Try the token again or request a new link."
                : "Open the link in your login email, or paste the token from it here."}
            </Typography>
          </Box>
          {phase === "error" && (
            <Box
              role="alert"
              sx={{
                display: "flex",
                alignItems: "flex-start",
                gap: 1.25,
                p: "12px 14px",
                border: `1px solid ${colors.pink}`,
                backgroundColor: tint("pink", 0.1),
                color: colors.text,
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              <ErrorOutlineSharp
                aria-hidden="true"
                sx={{ fontSize: 20, color: colors.pinkText, mt: "1px" }}
              />
              We couldn&apos;t verify that token.
            </Box>
          )}
          <Box
            component="form"
            onSubmit={handleSubmit}
            noValidate
            sx={{ display: "flex", flexDirection: "column", gap: "14px" }}
          >
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <Box component="label" htmlFor="token" sx={fieldLabelSx}>
                Token
              </Box>
              <TextField
                id="token"
                name="token"
                required
                fullWidth
                autoComplete="one-time-code"
                autoFocus={phase === "form"}
                value={token}
                onChange={(e) => {
                  setToken(e.target.value);
                  if (fieldError) setFieldError(null);
                }}
                error={Boolean(fieldError)}
                helperText={fieldError ?? undefined}
                inputRef={inputRef}
                slotProps={{
                  htmlInput: { spellCheck: false, autoCapitalize: "off" },
                  formHelperText: { role: "alert" },
                }}
                sx={bigInputSx}
              />
            </Box>
            <Button
              type="submit"
              variant="contained"
              size="large"
              fullWidth
              sx={authCtaSx}
            >
              Sign in
            </Button>
          </Box>
          <Typography
            sx={{ m: 0, fontSize: 14, lineHeight: 1.6, color: colors.textDim }}
          >
            No email?{" "}
            <Box
              component={Link}
              to="/"
              sx={{
                color: colors.cyan,
                display: "inline-flex",
                alignItems: "center",
                minHeight: 44,
                "&:focus-visible": {
                  outline: `2px solid ${colors.cyan}`,
                  outlineOffset: 2,
                },
              }}
            >
              Request a new login link
            </Box>
          </Typography>
        </>
      ) : (
        <>
          <Box sx={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <AuthKicker color={colors.cyan}>Verifying link</AuthKicker>
            <Box role="status" aria-live="polite">
              <AuthTitle size="clamp(30px,4vw,40px)">
                {phase === "done" ? "Access granted" : "Hold tight…"}
              </AuthTitle>
            </Box>
          </Box>
          <VerifyProgress progress={progress} />
          {phase === "done" && (
            <Button
              component={Link}
              to={location.state?.from || "/events"}
              variant="contained"
              color="success"
              size="large"
              fullWidth
              sx={authCtaSx}
            >
              Enter caLANdar
            </Button>
          )}
        </>
      )}
    </AuthLayout>
  );
}
