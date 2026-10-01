import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { useState } from "react";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  LinearProgress,
  Link,
  MenuItem,
  Pagination,
  Radio,
  Select,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddSharp from "@mui/icons-material/AddSharp";
import ArrowForwardSharp from "@mui/icons-material/ArrowForwardSharp";
import DeleteSharp from "@mui/icons-material/DeleteSharp";
import EditSharp from "@mui/icons-material/EditSharp";
import { useSnackbar } from "notistack";
import { Kicker, sectionGap } from "../components/hl";

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Box component="section" sx={{ display: "grid", gap: 1.5 }}>
      <Kicker>{label}</Kicker>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: 1.5,
          alignItems: "center",
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

/** Every themed MUI component, for checking the HyperLAN theme at a glance. */
function ThemeShowcase() {
  const [tab, setTab] = useState(0);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState("24h");
  const { enqueueSnackbar } = useSnackbar();

  return (
    <Box sx={{ display: "grid", gap: sectionGap, maxWidth: 1100 }}>
      <Box>
        <Kicker>Theme</Kicker>
        <Typography variant="h1">HyperLAN</Typography>
        <Typography variant="h2" sx={{ mt: 2 }}>
          Heading two
        </Typography>
        <Typography variant="h3">Heading three</Typography>
        <Typography variant="h4">Heading four</Typography>
        <Typography variant="h5">Heading five</Typography>
        <Typography variant="body1" color="text.secondary">
          Body copy in Chakra Petch. <Link href="#">A themed link</Link>.
        </Typography>
        <Typography variant="mono">MONO 18:43:39 · EVT-001</Typography>
      </Box>

      <Section label="Buttons">
        <Button
          variant="contained"
          size="large"
          endIcon={<ArrowForwardSharp />}
        >
          Enter lobby
        </Button>
        <Button variant="contained">RSVP now</Button>
        <Button variant="contained" color="warning" startIcon={<AddSharp />}>
          New event
        </Button>
        <Button variant="contained" color="success">
          Recalculate
        </Button>
        <Button variant="contained" color="error">
          Delete
        </Button>
        <Button variant="outlined" startIcon={<EditSharp />}>
          Edit RSVP
        </Button>
        <Button variant="outlined" color="warning">
          Refresh cache
        </Button>
        <Button variant="outlined" color="inherit">
          Use another email
        </Button>
        <Button>Text button</Button>
        <Button variant="contained" disabled>
          Disabled
        </Button>
        <Button variant="outlined" disabled>
          Disabled
        </Button>
        <Tooltip title="Delete">
          <IconButton aria-label="Delete">
            <DeleteSharp />
          </IconButton>
        </Tooltip>
      </Section>

      <Section label="Inputs">
        <TextField label="Event title" placeholder="Autumn LAN" />
        <TextField
          label="Callsign"
          defaultValue="ProGamer123"
          helperText="Shown to the squad"
        />
        <TextField
          label="Steam ID"
          error
          helperText="Enter a 17-digit SteamID64"
        />
        <FormControl sx={{ minWidth: 200 }}>
          <InputLabel id="when">When</InputLabel>
          <Select
            labelId="when"
            label="When"
            value={sel}
            onChange={(e) => setSel(e.target.value)}
          >
            <MenuItem value="24h">Last 24 hours</MenuItem>
            <MenuItem value="7d">Last 7 days</MenuItem>
            <MenuItem value="30d">Last 30 days</MenuItem>
            <MenuItem value="all">All time</MenuItem>
          </Select>
        </FormControl>
      </Section>

      <Section label="Selection">
        <FormControlLabel
          control={<Checkbox defaultChecked />}
          label="Bring my own seat"
        />
        <FormControlLabel control={<Checkbox />} label="Unchecked" />
        <FormControlLabel control={<Radio checked />} label="Yes" />
        <FormControlLabel control={<Radio checked={false} />} label="No" />
        <FormControlLabel
          control={<Switch defaultChecked />}
          label="RSVP open"
        />
        <FormControlLabel control={<Switch />} label="Off" />
      </Section>

      <Section label="Chips, progress, pagination">
        <Chip label="Default" />
        <Chip label="Cyan" color="primary" variant="outlined" />
        <Chip label="Lime" color="success" />
        <Chip
          label="Amber"
          color="warning"
          variant="outlined"
          onDelete={() => {}}
        />
        <Chip label="Pink" color="error" variant="outlined" />
        <Box sx={{ width: 240 }}>
          <LinearProgress variant="determinate" value={62} />
        </Box>
        <Pagination count={10} page={3} />
      </Section>

      <Tabs
        value={tab}
        onChange={(_e, v) => setTab(v)}
        aria-label="Event management"
      >
        <Tab label="Details" />
        <Tab label="Invites" />
        <Tab label="Seating" />
        <Tab label="Broadcast" />
      </Tabs>

      <Box
        sx={{
          display: "grid",
          gap: 1.5,
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        }}
      >
        <Alert severity="success">
          <AlertTitle>Saved</AlertTitle>Seat map updated.
        </Alert>
        <Alert severity="info">Steam library syncing.</Alert>
        <Alert severity="warning">Library 30+ days old.</Alert>
        <Alert severity="error" variant="outlined">
          Clash with another session.
        </Alert>
        <Alert severity="success" variant="filled">
          Filled success
        </Alert>
      </Box>

      <Card>
        <CardHeader
          title="Card"
          subheader="Surface, hairline border, corner bracket"
        />
        <CardContent>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Event</TableCell>
                <TableCell>Invited</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow hover>
                <TableCell>Autumn LAN 2026</TableCell>
                <TableCell>8</TableCell>
                <TableCell>Live RSVPs</TableCell>
              </TableRow>
              <TableRow hover>
                <TableCell>Winter Frag Fest</TableCell>
                <TableCell>6</TableCell>
                <TableCell>Draft</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Section label="Overlays">
        <Button variant="outlined" onClick={() => setOpen(true)}>
          Open dialog
        </Button>
        <Button
          variant="outlined"
          color="success"
          onClick={() =>
            enqueueSnackbar("Saved · seat map updated", { variant: "success" })
          }
        >
          Toast
        </Button>
        <Button
          variant="outlined"
          color="error"
          onClick={() =>
            enqueueSnackbar("Dropped on a clash, reverted", {
              variant: "error",
            })
          }
        >
          Error toast
        </Button>
      </Section>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Suggest for this LAN</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Adds the game to the vote and casts your vote for it.
          </DialogContentText>
          <TextField
            label="Pitch it (optional)"
            multiline
            rows={3}
            fullWidth
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button
            color="inherit"
            variant="outlined"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button variant="contained" onClick={() => setOpen(false)}>
            Suggest &amp; vote
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

const meta = {
  title: "HyperLAN/Theme",
  component: ThemeShowcase,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ThemeShowcase>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Components: Story = {};
