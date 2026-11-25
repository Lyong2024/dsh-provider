import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

export interface SeenRequest {
  method: string;
  url: string;
  authorization: string | undefined;
  apiKey: string | undefined;
  body: string;
}

export interface ProbeServer {
  url: string;
  seen: SeenRequest[];
  close: () => Promise<void>;
}

export function startProbeServer(): Promise<ProbeServer> {
  const seen: SeenRequest[] = [];
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer | string) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    request.on("end", () => {
      const header = request.headers.authorization;
      const apiKey = request.headers["x-api-key"];
      seen.push({
        method: request.method ?? "",
        url: request.url ?? "",
        authorization: typeof header === "string" ? header : undefined,
        apiKey: typeof apiKey === "string" ? apiKey : undefined,
        body: Buffer.concat(chunks).toString("utf8"),
      });
      response.writeHead(204);
      response.end();
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("probe server has no port"));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${address.port}/v1`,
        seen,
        close: () =>
          new Promise((done, fail) => {
            server.close((error) => (error ? fail(error) : done()));
          }),
      });
    });
  });
}
