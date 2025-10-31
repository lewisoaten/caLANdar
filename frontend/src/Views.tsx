import React from "react";
import { Route, Routes } from "react-router-dom";
import * as Sentry from "@sentry/react";
import SignIn from "./components/SignIn";
import VerifyEmail from "./components/VerifyEmail";
import Account from "./components/Account";
import EventSelection from "./components/EventSelection";
import Event from "./components/Event";
import EventManagement from "./components/EventManagement";
import ProtectedRoutes from "./ProtectedRoutes";
import EventsAdmin from "./components/EventsAdmin";
import GamersAdmin from "./components/GamersAdmin";
import EventGames from "./components/EventGames";

export const SentryRoutes = Sentry.withSentryReactRouterV6Routing(Routes);

const Views = () => {
  return (
    <SentryRoutes>
      <Route path="/" element={<SignIn />} />
      <Route path="/verify_email">
        <Route path=":token" element={<VerifyEmail />} />
        <Route path="" element={<VerifyEmail />} />
      </Route>
      <Route element={<ProtectedRoutes />}>
        <Route path="/events" element={<EventSelection />} />
        <Route path="/events/:id" element={<Event />} />
        <Route path="/events/:id/games" element={<EventGames />} />
        <Route path="/account" element={<Account />} />
        <Route path="/admin/events">
          <Route path="" element={<EventsAdmin />} />
          <Route path=":id" element={<EventManagement />} />
        </Route>
        <Route path="/admin/gamers" element={<GamersAdmin />} />
      </Route>
    </SentryRoutes>
  );
};

export default Views;
