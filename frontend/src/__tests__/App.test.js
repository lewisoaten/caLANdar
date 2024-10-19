import React from "react";
import { test, expect } from "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import App from "../App";

test("renders product name", () => {
  render(<App />);
  const linkElement = screen.getByText(/caLANdar/i);
  expect(linkElement).toBeInTheDocument();
});
