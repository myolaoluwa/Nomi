import "dotenv/config";
import { connect } from "./db.js";
import { createApp } from "./server.js";
const db = await connect();
const server = createApp(db).listen(
  Number(process.env.PORT || 4000),
  "0.0.0.0",
  () => console.log("Nomi API ready on port " + (process.env.PORT || 4000)),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      void db.close().then(() => process.exit(0));
    }),
  );
