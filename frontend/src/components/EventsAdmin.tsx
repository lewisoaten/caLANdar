import * as React from "react";
import { useState } from "react";
import { Button } from "@mui/material";
import AddSharp from "@mui/icons-material/AddSharp";
import CloseSharp from "@mui/icons-material/CloseSharp";
import { useSnackbar } from "notistack";
import { EventData } from "../types/events";
import EventTable from "./EventTable";
import EventsAdminDialog from "./EventsAdminDialog";
import { PageHeader } from "./hl";

/** Admin: Manage events. New-event form, search, status filters, table. */
const EventsAdmin = () => {
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const eventsState = useState([] as EventData[]);
  const { enqueueSnackbar } = useSnackbar();
  const formId = React.useId();

  const handleClose = (value?: EventData) => {
    setOpen(false);
    if (value) {
      enqueueSnackbar(`Created “${value.title}”`, { variant: "success" });
      // Refetch so the new event shows up with its derived status and counts.
      setRefreshKey((k) => k + 1);
    }
  };

  return (
    <>
      <PageHeader
        kicker="Admin"
        kickerTone="amber"
        title="Manage events"
        actions={
          <Button
            variant="contained"
            color="warning"
            size="medium"
            aria-expanded={open}
            aria-controls={open ? formId : undefined}
            startIcon={open ? <CloseSharp /> : <AddSharp />}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "Cancel" : "New event"}
          </Button>
        }
      />
      <div id={formId} hidden={!open}>
        <EventsAdminDialog variant="inline" open={open} onClose={handleClose} />
      </div>
      <EventTable
        eventsState={eventsState}
        asAdmin={true}
        pageSize={6}
        refreshKey={refreshKey}
      />
    </>
  );
};

export default EventsAdmin;
