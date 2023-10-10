import {
  Card,
  CardMedia,
  CardContent,
  Typography,
  CardActions,
  Button,
} from "@mui/material";
import React from "react";
import { Link } from "react-router-dom";
import { EventData } from "../types/events";

interface EventCardProps {
  event: EventData;
}

export default function EventCard(props: EventCardProps) {
  const { event } = props;

  // use default image if none is provided
  var image = "/static/lan_party_image.jpg";
  if (event.image) {
    image = "data:image/jpeg;base64," + event.image;
  }

  return (
    <Card>
      <CardMedia
        component="img"
        height="140"
        image={image}
        alt="lan party image"
      />
      <CardContent>
        <Typography gutterBottom variant="h5" component="div">
          {event.title}
        </Typography>
        <Typography variant="subtitle1" gutterBottom>
          {event.timeBegin.calendar() + " to " + event.timeEnd.calendar()}
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ whiteSpace: "pre-wrap" }}
        >
          {event.description}
        </Typography>
      </CardContent>
      <CardActions>
        <Button size="small" component={Link} to={event.id.toString()}>
          Open
        </Button>
      </CardActions>
    </Card>
  );
}
