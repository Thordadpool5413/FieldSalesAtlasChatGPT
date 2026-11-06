import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { handler as fieldAtlasHandler } from "./field-atlas/backend/index";
import { openEvents } from "./field-atlas/backend/runtime/events";
import type { ServerResponse } from "node:http";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);
app.use("/api", async (req, res, next) => {
  if (req.path === "/events" && req.method === "GET") {
    openEvents(res as unknown as ServerResponse);
    return;
  }

  try {
    const headers = new Headers();
    for (const name of ["accept", "content-type", "origin", "sec-fetch-site", "host"]) {
      const value = req.get(name);
      if (value) headers.set(name, value);
    }
    const body =
      req.body === undefined || ["GET", "HEAD"].includes(req.method)
        ? undefined
        : JSON.stringify(req.body);
    const result = await fieldAtlasHandler(
      new Request(new URL(req.originalUrl, "http://localhost"), {
        method: req.method,
        headers,
        ...(body === undefined ? {} : { body }),
      }),
    );

    res.status(result.status);
    result.headers.forEach((value, name) => res.setHeader(name, value));
    res.send(Buffer.from(await result.arrayBuffer()));
  } catch (error) {
    req.log.error({ err: error }, "Field Atlas API request failed");
    next(error);
  }
});

export default app;
