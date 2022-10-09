import { useEffect, useState } from "react";
import logo from "./logo.svg";
import "./App.css";

function App() {
  // useEffect(() => {
  //   fetch(`/api`)
  //   .then((response) => console.log(response));
  // }, []);

  const [test, setTest] = useState([]);

  const fetchData = () => {
    fetch(`${process.env.REACT_APP_API_PROXY}/api`)
      .then((response) => {
        return response.text();
      })
      .then((data) => {
        setTest(data);
      });
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Edit <code>src/App.js</code> and save to reload.
        </p>
        <p>{test}</p>
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>
      </header>
    </div>
  );
}

export default App;
