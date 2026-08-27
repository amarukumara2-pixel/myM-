import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import AdmZip from "adm-zip";
import fs from 'fs';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // API routes
  app.get("/api/ping", (req, res) => res.json({ status: "ok" }));
  
  app.get("/api/download-app", (req, res) => {
    const zip = new AdmZip();
    
    // Add essential files/directories
    const filesToInclude = ['src', 'server.ts', 'package.json', 'index.html', 'tsconfig.json', 'vite.config.ts', 'netlify.toml', 'netlify-dist.toml', 'tailwind.config.js', 'postcss.config.js', 'firebase-applet-config.json'];
    
    filesToInclude.forEach(item => {
      const fullPath = path.join(process.cwd(), item);
      if (fs.existsSync(fullPath)) {
        if (fs.lstatSync(fullPath).isDirectory()) {
          zip.addLocalFolder(fullPath, item);
        } else {
          zip.addLocalFile(fullPath);
        }
      }
    });
    
    const buffer = zip.toBuffer();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=app-code.zip');
    res.send(buffer);
  });

  app.post("/api/gemini/generate", async (req, res) => {
    let clientApiKey: string | undefined;
    try {
      clientApiKey = req.headers["x-api-key"] as string;
      const apiKey = clientApiKey || process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        return res.status(400).json({ error: "Gemini API Key missing. Please set it in the AI settings or .env file." });
      }
      
      const client = new GoogleGenAI({ apiKey });
      
      const { contents, config } = req.body;
      
      // Map contents to SDK format
      let finalContents;
      if (Array.isArray(contents)) {
        finalContents = contents.map((c: any) => ({
          role: c.role === 'model' ? 'model' : 'user',
          parts: Array.isArray(c.parts) ? c.parts : [{ text: String(c.parts || c.text || c) }]
        }));
      } else if (contents && Array.isArray(contents.parts)) {
        finalContents = [{ role: 'user', parts: contents.parts }];
      } else {
        finalContents = [{ role: 'user', parts: [{ text: String(contents) }] }];
      }

      const finalConfig: any = {};
      if (config) {
        if (config.system_instruction || config.systemInstruction) {
          finalConfig.systemInstruction = config.system_instruction || config.systemInstruction;
        }
        if (config.tools) finalConfig.tools = config.tools;
        if (config.temperature !== undefined) finalConfig.temperature = config.temperature;
        if (config.maxOutputTokens !== undefined) finalConfig.maxOutputTokens = config.maxOutputTokens;
      }

      const modelsToTry = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
      
      let response;
      const maxAttempts = 3;
      let backoffDelay = 1000;
      
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const currentModel = modelsToTry[attempt - 1] || "gemini-3.1-flash-lite";
        try {
          console.log(`Server: Requesting Gemini API with model ${currentModel} (Attempt ${attempt}/${maxAttempts})`);
          response = await client.models.generateContent({
            model: currentModel,
            contents: finalContents,
            config: finalConfig
          });
          break; // Success! Break out of the retry loop.
        } catch (error: any) {
          const errorMessage = error?.message || error?.toString() || "";
          const isRetryable = 
            errorMessage.includes("429") || 
            errorMessage.includes("Quota") || 
            errorMessage.includes("503") || 
            errorMessage.includes("demand") || 
            errorMessage.includes("temporary") || 
            errorMessage.includes("UNAVAILABLE") || 
            error?.status === 429 ||
            error?.status === 503;
          
          if (isRetryable && attempt < maxAttempts) {
            console.log(`Server: Request with model ${currentModel} temporary busy. Retrying in ${backoffDelay}ms... (Attempt ${attempt}/${maxAttempts})`);
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
            backoffDelay *= 2;
            continue;
          }
          throw error; // Re-throw if other error or all retries exhausted
        }
      }
      
      res.json({
        text: response ? response.text || "" : "",
        functionCalls: response ? response.functionCalls || [] : []
      });
    } catch (error: any) {
      console.error("Gemini API server-side error:", error);
      
      const errorMessage = error?.message || error?.toString() || "";
      if (errorMessage.includes("503") || errorMessage.includes("UNAVAILABLE") || errorMessage.includes("demand") || error?.status === 503) {
        return res.status(503).json({ 
          error: `AI සේවාව දැනට ඉතා කාර්යබහුලයි (Service Unavailable/High Demand). කරුණාකර තත්පර කිහිපයකින් නැවත උත්සාහ කරන්න, නැතහොත් Settings වෙත ගොස් ඔබගේම Gemini API Key එකක් ඇතුලත් කරන්න. / Shared AI service is experiencing high demand. Please wait a moment and try again, or add your own Gemini API Key in Settings to bypass this limit.`,
          details: errorMessage
        });
      }

      if (errorMessage.includes("429") || errorMessage.includes("Quota exceeded") || error?.status === 429) {
        return res.status(429).json({ 
          error: `Rate limit reached. Please wait a moment and try again.${clientApiKey ? ' (Using your custom API Key)' : ' You can configure your own Google Gemini API Key in the settings to avoid this limit.'}`,
          details: errorMessage
        });
      }

      res.status(500).json({ 
        error: error.message || "Failed to generate AI response",
        details: error.toString()
      });
    }
  });

  // Protect API routes
  app.all("/api/*all", (req, res) => {
    res.status(404).json({ error: "Not Found" });
  });

  // Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
