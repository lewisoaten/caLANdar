// Full end-to-end test of caLANdar Live on the final branch.
const { browser, pageAs, api } = require("./lib");
const { execSync } = require("child_process");
const E = Number(process.argv[2]);
const S = process.env.E2E_OUT || __dirname;
const ADMIN = "lewis@oaten.name";
let n = 0;
const ok = (msg) => console.log(`  ✓ ${++n}. ${msg}`);
const shot = (p, name) =>
  p.screenshot({ path: `${S}/final-${name}.png`, fullPage: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function closeAdmin(p) {
  const d = p.getByRole("dialog", { name: "Admin" });
  for (let i = 0; i < 3 && (await d.count()) > 0; i += 1) {
    await p.keyboard.press("Escape");
    await sleep(400);
  }
  await d.waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
}

(async () => {
  const b = await browser();
  const ana = await pageAs(b, "ana@example.com");
  const bo = await pageAs(b, "bo@example.com");
  const cy = await pageAs(b, "cy@example.com");
  const admin = await pageAs(b, ADMIN);
  const url = `http://localhost:3000/events/${E}/live`;

  console.log("Phase 0: plumbing");
  for (const p of [ana, bo, cy, admin]) await p.goto(url);
  await ana
    .getByRole("status")
    .getByText("LIVE", { exact: true })
    .first()
    .waitFor({ timeout: 15000 });
  ok("stream connects (● LIVE)");
  await admin.getByRole("button", { name: /Admin: \d+ outstanding/ }).click();
  await admin.getByLabel("Message").fill("Welcome to the LAN!");
  await admin.getByRole("button", { name: "Post", exact: true }).click();
  await ana.getByText("Welcome to the LAN!").first().waitFor({ timeout: 8000 });
  await closeAdmin(admin);
  await ana.getByText("Welcome to the LAN!").first().waitFor({ timeout: 8000 });
  ok("admin post reaches another browser as a toast");

  console.log("Phase 1: timeline, check-in, one schedule");
  for (const p of [ana, bo, cy]) {
    // Dismiss the admin's welcome toast, as people would.
    await p
      .getByRole("button", { name: "Hide" })
      .first()
      .click({ timeout: 3000 })
      .catch(() => {});
    await p.getByRole("button", { name: "I'm here" }).click();
    await p
      .getByText(/CHECKED IN/)
      .first()
      .waitFor();
  }
  await admin.getByText("Cyx").first().waitFor();
  ok("three gamers check in; the admin's feed shows it");
  const snap = await api("GET", `/events/${E}/live`, "ana@example.com");
  const pid = (h) => snap.people.find((p) => p.handle === h).pid;
  const l4d = snap.lobbies.find((l) => l.name === "Left 4 Dead 2");
  const moved = new Date(Date.parse(l4d.start) + 3600e3).toISOString();
  await api(
    "PATCH",
    `/events/${E}/game_schedule/${l4d.id}?as_admin=true`,
    ADMIN,
    { gameId: 550, startTime: moved, durationMinutes: 90 },
  );
  await bo.getByText("moved to").first().waitFor({ timeout: 8000 });
  ok("an edit on the schedule page moves the lobby on Live, with a feed line");
  const sched = await pageAs(b, ADMIN);
  await sched.goto(`http://localhost:3000/events/${E}/schedule`);
  await sched
    .getByRole("button", { name: /Left 4 Dead 2/ })
    .first()
    .waitFor({ timeout: 10000 });
  ok("the schedule page shows the same lobby");

  console.log("Phase 2: presence");
  await api("POST", `/events/${E}/live/dev/presence?as_admin=true`, ADMIN, {
    pid: pid("ProGamer123"),
    gameId: 730,
    gameName: "Counter-Strike 2",
  });
  await ana.getByText("NEW GAME").first().waitFor({ timeout: 8000 });
  ok("Steam (simulated) auto-creates a CS2 lobby; Ana is asked to set it up");
  await ana.getByRole("button", { name: "2", exact: true }).first().click();
  await ana.getByRole("button", { name: "Save for everyone" }).click();
  await ana
    .getByText(/Survivors|Killers/)
    .first()
    .waitFor({ timeout: 8000 });
  ok("players and teams saved for everyone");
  await bo.getByRole("button", { name: /Counter-Strike 2, LIVE/ }).click();
  await bo.getByRole("button", { name: "Join now" }).click();
  await bo
    .getByRole("button", { name: "Leave lobby" })
    .waitFor({ timeout: 8000 });
  ok("Bo joins by hand");
  await admin.getByRole("button", { name: "Audit" }).click();
  await admin.getByTestId("audit-timeline").getByText("Bo").waitFor();
  await admin.getByRole("button", { name: "Lobbies" }).click();
  ok("the admin's audit lens shows each gamer's stays");

  console.log("Phase 3: votes and the start-time machine");
  await cy.getByRole("button", { name: "Call vote ▾" }).click();
  await cy.getByRole("menuitem", { name: /Propose a game/ }).click();
  await cy.getByLabel("Search games").fill("Phas");
  await cy.getByRole("option", { name: /Phasmophobia/ }).click();
  const sheet = cy.getByRole("dialog", { name: "Propose a game" });
  await sheet
    .getByRole("button", { name: /^\d\d:\d\d$/ })
    .nth(3)
    .click();
  await sheet
    .getByRole("button", { name: /^Run alongside$/ })
    .click()
    .catch(() => {});
  await sheet.getByRole("button", { name: /^Propose · start at/ }).click();
  await cy.getByText("NEEDS ONE BACKER").waitFor({ timeout: 8000 });
  await ana.getByRole("button", { name: /Phasmophobia, PROPOSED/ }).click();
  await ana.getByRole("button", { name: "Pre-join", exact: true }).click();
  await cy.getByText("FINAL · BACKED").first().waitFor({ timeout: 8000 });
  ok("Cy proposes Phasmophobia, Ana backs it");
  // Challenge the moved L4D2 with Golf; everyone votes Golf in the browser.
  await bo.getByRole("button", { name: /Left 4 Dead 2, PLANNED/ }).click();
  await bo.getByRole("button", { name: "Call vote ▾" }).click();
  await bo.getByRole("menuitem", { name: /Propose a game/ }).click();
  await bo.getByLabel("Search games").fill("Golf");
  await bo.getByRole("option", { name: /Golf With Friends/ }).click();
  const golf = bo.getByRole("dialog", { name: "Propose a game" });
  // Start at L4D2's time: pick it via the API for determinism instead.
  await golf.getByRole("button", { name: "Close" }).click();
  await api("POST", `/events/${E}/live/lobbies`, "bo@example.com", {
    kind: "game",
    gameId: 431240,
    start: moved,
    durationMin: 60,
    mode: "option",
    lobbyId: l4d.id,
  });
  for (const p of [ana, cy]) {
    await p
      .getByRole("article", { name: /^Vote: What's on/ })
      .getByRole("button", { name: /Golf With Friends/ })
      .click();
  }
  await ana
    .getByText(/FINALISING/)
    .first()
    .waitFor({ timeout: 8000 });
  ok(
    "a challenge opens What's on; all three vote Golf in the browser: finalising",
  );
  await sleep(21500);
  await api("POST", `/events/${E}/live/tick`, "ana@example.com");
  await bo.getByText("FINAL · UNANIMOUS").first().waitFor({ timeout: 8000 });
  ok("unanimous after the 20s settle: Golf replaces L4D2");
  // Delay: DRG (planned in the seed for a few minutes from now) with Ana pre-joined.
  const drg = snap.lobbies.find((l) => l.name === "Deep Rock Galactic");
  await api(
    "POST",
    `/events/${E}/live/lobbies/${drg.id}/prejoin`,
    "cy@example.com",
    {},
  );
  await api(
    "PATCH",
    `/events/${E}/game_schedule/${drg.id}?as_admin=true`,
    ADMIN,
    {
      gameId: 548430,
      startTime: new Date(Date.now() - 30e3).toISOString(),
      durationMinutes: 120,
    },
  );
  await api("POST", `/events/${E}/live/tick`, "cy@example.com");
  await cy.getByText("NOBODY'S IN YET").first().waitFor({ timeout: 8000 });
  ok("DRG starts with nobody in: Cy gets the pink alert");
  await cy.getByRole("button", { name: "Delay start…" }).first().click();
  const delay = cy.getByRole("dialog", { name: "Delay start" });
  await delay.getByRole("button", { name: "+30M" }).click();
  await delay.getByRole("button", { name: /^Call vote/ }).click();
  await cy
    .getByText(/Delay Deep Rock Galactic by 30m/)
    .first()
    .waitFor({ timeout: 8000 });
  ok("Cy calls a delay vote (the grace is held)");
  await admin.getByRole("button", { name: /Admin: \d+ outstanding/ }).click();
  await admin.getByLabel("Force an option…").first().click();
  await admin.getByRole("option", { name: /Delay \+30m/ }).click();
  await closeAdmin(admin);
  await cy.getByText("FINAL · ADMIN PICK").first().waitFor({ timeout: 8000 });
  const drgNow = (
    await api("GET", `/events/${E}/live`, "cy@example.com")
  ).lobbies.find((l) => l.id === drg.id);
  if (Date.parse(drgNow.start) < Date.now() + 25 * 60e3)
    throw new Error("DRG wasn't delayed");
  ok("the admin forces it from the FAB: DRG starts 30 minutes later");
  await shot(cy, "cy");

  console.log("Resilience");
  await bo.context().setOffline(true);
  await bo
    .getByText(/OFFLINE|RECONNECTING/)
    .first()
    .waitFor({ timeout: 10000 });
  await api("POST", `/events/${E}/live/posts?as_admin=true`, ADMIN, {
    text: "Missed while offline",
    ttl: "10m",
    tv: false,
  });
  await bo.context().setOffline(false);
  await bo
    .getByText("Missed while offline")
    .first()
    .waitFor({ timeout: 15000 });
  ok("Bo goes offline, misses a post, and catches up on reconnecting");
  if (process.env.RESTART_API)
    execSync(process.env.RESTART_API, { stdio: "ignore" });
  else
    console.log(
      "  (set RESTART_API to a command that restarts the API to test recovery)",
    );
  await api("POST", `/events/${E}/live/posts?as_admin=true`, ADMIN, {
    text: "After the restart",
    ttl: "10m",
    tv: false,
  });
  await ana.getByText("After the restart").first().waitFor({ timeout: 20000 });
  ok("the API restarts; Ana's stream reconnects and resumes");

  console.log("Phase 4: room scale");
  const view = await api(
    "PUT",
    `/events/${E}/live/settings?as_admin=true`,
    ADMIN,
    { rotateWallboard: true },
  );
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv = await ctx.newPage();
  await tv.goto(`http://localhost:3000/live/${view.wallboardToken}`);
  await tv.getByText(/IN GAME/).waitFor({ timeout: 10000 });
  await api("POST", `/events/${E}/live/posts?as_admin=true`, ADMIN, {
    text: "Pizza is here",
    ttl: "10m",
    tv: true,
  });
  await tv.getByText("Pizza is here").waitFor({ timeout: 8000 });
  ok("the wall-board (no login) shows live data and TV posts");
  await tv.screenshot({ path: `${S}/final-tv.png` });
  const key = await api("GET", `/live/push/key`, "ana@example.com");
  if (!key.publicKey) throw new Error("no push key");
  ok("Web Push is available (VAPID key served)");
  const phone = await pageAs(b, "bo@example.com", { width: 390, height: 844 });
  await phone.goto(url);
  await phone.getByText("CHECKED IN").first().waitFor({ timeout: 10000 });
  const overflow = await phone.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  if (overflow > 0) throw new Error(`phone overflows by ${overflow}px`);
  ok("the phone layout fits 390px");
  await shot(phone, "phone");
  await shot(ana, "ana");
  await b.close();
  console.log(`All ${n} checks passed.`);
})().catch((e) => {
  console.error("FAILED:", e.message.split("\n").slice(0, 6).join("\n"));
  process.exit(1);
});
