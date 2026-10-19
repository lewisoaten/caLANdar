// Shared helpers for local browser checks against vite (:3000) + API (:8080).
const { chromium } = require("playwright-core");
const { execFileSync } = require("child_process");
const API =
  process.env.CALANDAR_API ||
  `${__dirname}/../../../api/target/debug/calandar-api`;

function token(email) {
  return execFileSync(API, ["dev-token", email], {
    env: {
      ...process.env,
      PASETO_SECRET_KEY: "wubbalubbadubdubwubbalubbadubdub",
    },
    stdio: ["ignore", "pipe", "ignore"],
  })
    .toString()
    .trim();
}

const ADMINS = ["lewis@oaten.name", "marshallx7a@gmail.com"];

async function browser() {
  return chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    headless: true,
    args: ["--no-sandbox"],
  });
}

/** A page signed in as `email` (viewport defaults to desktop). */
async function pageAs(b, email, viewport = { width: 1440, height: 1000 }) {
  const ctx = await b.newContext({ viewport });
  const t = token(email);
  await ctx.addInitScript(
    ([e, t, admin]) => {
      localStorage.setItem(
        "user_context",
        JSON.stringify({ email: e, token: t, loggedIn: true, isAdmin: admin }),
      );
    },
    [email, t, ADMINS.includes(email)],
  );
  const page = await ctx.newPage();
  page.on("pageerror", (err) =>
    console.log(`[pageerror ${email}]`, err.message),
  );
  page.on("console", (m) => {
    if (m.type() === "error")
      console.log(`[console ${email}]`, m.text().slice(0, 300));
  });
  return page;
}

async function api(method, path, email, body) {
  const res = await fetch(`http://localhost:8080/api${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token(email)}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  if (!res.ok)
    throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  return json;
}

module.exports = { browser, pageAs, token, api };
