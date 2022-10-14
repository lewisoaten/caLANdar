import * as React from "react";
import { useEffect, useState, useContext } from "react";
import { Container, Button, Grid, Paper, Typography } from "@mui/material";
import { useParams, useNavigate } from "react-router-dom";
import { UserContext } from "../UserProvider";
import { dateParser } from "../utils";
import { EventData, defaultEventData } from "../types/events";

const EventManagement = () => {
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;
  const [event, setEvent] = useState(defaultEventData);

  const navigate = useNavigate();

  let { id } = useParams();

  useEffect(() => {
    fetch(`${process.env.REACT_APP_API_PROXY}/api/events/${id}`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
    })
      .then((response) => {
        return response
          .text()
          .then((data) => JSON.parse(data, dateParser) as EventData);
      })
      .then((data) => {
        setEvent(data);
      });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onClick = () => {
    fetch(`${process.env.REACT_APP_API_PROXY}/api/events/${id}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
    }).then((response) => {
      if (response.status === 204) {
        navigate("..");
      } else {
        alert("Unable to delete event");
        throw new Error("Unable to delete event");
      }
    });
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
              {event.title}
            </Typography>
            <Typography variant="body1" gutterBottom>
              {event.description}
            </Typography>
            <Button onClick={onClick} variant="contained" color="error">
              Delete
            </Button>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
};

export default EventManagement;
