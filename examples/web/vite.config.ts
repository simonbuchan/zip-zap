import fs from "node:fs/promises";
import {setTimeout as delay} from "node:timers/promises";
import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "slow-server",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          try {
            if (req.url?.startsWith("/file/")) {
              const filePath = req.url.slice("/file/".length);

              const file = await fs.open(filePath, "r").catch((error) => {
                return null
              });
              if (!file) {
                res.writeHead(404);
                res.end();
                return;
              }

              const stat = await file.stat();

              res.writeHead(200, {
                "Content-Type": "application/octet-stream",
                "Content-Length": stat.size,
              });

              const targetKbps = 50_000;
              let bytesSent = 0;
              let startTime = Date.now();
              for await (const chunk of file.createReadStream()) {
                res.write(chunk);
                bytesSent += chunk.length;
                const elapsedMs = Date.now() - startTime;
                // kilobytes and milliseconds cancel
                const targetBytes = targetKbps * elapsedMs;
                if (bytesSent > targetBytes) {
                  const delayMs = (bytesSent - targetBytes) / targetKbps;
                  await delay(delayMs);
                }
              }
            } else {
              next();
            }
          } catch (error) {
            next(error);
          }
        });
      },
    },
  ],
});
