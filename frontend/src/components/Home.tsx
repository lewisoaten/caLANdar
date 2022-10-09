import * as React from "react";
import { useEffect, useState, useContext } from "react";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import { UserContext } from "../UserProvider";

const Home = () => {
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;
  const [test, setTest] = useState();

  useEffect(() => {
    fetch(`${process.env.REACT_APP_API_PROXY}/api`, {
      headers: {
        Authorization: "Bearer " + token,
      },
    })
      .then((response) => {
        return response.json();
      })
      .then((data) => {
        setTest(data.value);
      });
  }, []);

  return (
    <Container maxWidth="sm">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Protected Home Page
        </Typography>
        <p>{test}</p>
      </Box>
    </Container>
  );
};

export default Home;
