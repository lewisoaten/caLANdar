import { Pact } from "@pact-foundation/pact";
import path from "path";

global.port = 8080;
global.provider = new Pact({
  cors: true,
  port: global.port,
  log: path.resolve(process.cwd(), "logs", "pact.log"),
  dir: path.resolve(process.cwd(), "pacts"),
  spec: 2,
  pactfileWriteMode: "update",
  consumer: "calandar-consumer",
  provider: "calandar-provider",
  host: "127.0.0.1",
});
