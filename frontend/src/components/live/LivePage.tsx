import * as React from "react";
import { useContext, useState } from "react";
import { useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { useSnackbar } from "notistack";
import { UserContext } from "../../UserProvider";
import { PageHeader, Panel } from "../hl";
import { colors, fonts } from "../hl/tokens";
import { useLive } from "../../live/useLive";
import { sendLiveCommand } from "../../live/commands";
import { userFacingReason } from "../../utils/apiError";
import { ConnectionIndicator } from "./ConnectionIndicator";

/** The Live page (phase 0: connection and raw log only). */
export default function LivePage() {
  const { id } = useParams();
  const eventId = Number(id);
  const { token } = useContext(UserContext);
  const { connection, state } = useLive(
    Number.isFinite(eventId) ? eventId : null,
  );
  const { enqueueSnackbar } = useSnackbar();
  const [text, setText] = useState("");

  const post = async () => {
    if (!connection) return;
    try {
      await sendLiveCommand(
        connection,
        token,
        "/posts",
        { text, ttl: "10m", tv: false },
        { admin: true },
      );
      setText("");
    } catch (e) {
      enqueueSnackbar(userFacingReason(e) ?? "Couldn't post", {
        variant: "error",
      });
    }
  };

  return (
    <>
      <PageHeader
        title="Live"
        kicker={state.event?.title ?? "Live"}
        actions={
          <ConnectionIndicator
            status={state.status}
            lastUpdate={state.lastUpdate}
          />
        }
      />
      {state.isAdmin && (
        <Panel title="Post to everyone" tone="amber">
          <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
            <TextField
              label="Message"
              value={text}
              onChange={(e) => setText(e.target.value)}
              sx={{ flex: "1 1 260px" }}
            />
            <Button
              variant="contained"
              color="warning"
              disabled={!text.trim()}
              onClick={post}
            >
              Post
            </Button>
          </Box>
        </Panel>
      )}
      <Panel title="Feed" kicker={`SEQ ${state.seq}`}>
        <Box
          component="ol"
          sx={{ m: 0, p: 0, listStyle: "none", fontFamily: fonts.mono }}
        >
          {[...state.feed].reverse().map((row) => (
            <Box
              component="li"
              key={row.seq}
              sx={{ fontSize: 12, color: colors.textMuted, py: 0.5 }}
            >
              {row.seq} · {row.kind} · {JSON.stringify(row.payload)}
            </Box>
          ))}
        </Box>
      </Panel>
    </>
  );
}
