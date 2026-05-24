import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Helper macro to get the API key
  function getApiKey() {
    return process.env.MEGALLM_API_KEY;
  }

  // GET /api/models
  app.get("/api/models", async (req, res) => {
    try {
      const apiKey = getApiKey();
      if (!apiKey) {
        return res.status(401).json({ error: "MEGALLM_API_KEY is not configured" });
      }

      const response = await fetch("https://ai.megallm.io/v1/models", {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        const err = await response.text();
        return res.status(response.status).json({ error: err });
      }

      const data = await response.json();
      res.json(data);
    } catch (e: any) {
      console.error('Error fetching models:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/chat/completions
  app.post("/api/chat/completions", async (req, res) => {
    try {
      const apiKey = getApiKey();
      if (!apiKey) {
        return res.status(401).json({ error: "MEGALLM_API_KEY is not configured" });
      }

      const isStreaming = req.body.stream === true;
      const response = await fetch("https://ai.megallm.io/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(req.body),
      });

      if (!response.ok) {
        let err;
        try {
          err = await response.json();
        } catch {
          err = { error: await response.text() };
        }
        return res.status(response.status).json(err);
      }

      if (isStreaming && response.body) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Iterate through the stream and pipe it to response
        for await (const chunk of response.body as any) {
          res.write(chunk);
        }
        res.end();
      } else {
        const data = await response.json();
        res.json(data);
      }
    } catch (e: any) {
      console.error('Error in chat completions:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
