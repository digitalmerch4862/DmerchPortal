import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';

// Load .env if it exists
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Standard middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files from Vite build
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// API Route Handler (Vercel Emulation)
app.all('/api/:filename', async (req, res) => {
  const { filename } = req.params;
  
  // Try to find the matching TS file in the api directory
  const apiFilePath = path.join(__dirname, 'api', `${filename}.ts`);
  
  if (!fs.existsSync(apiFilePath)) {
    console.log(`[Server] 404 - API not found: /api/${filename}`);
    return res.status(404).json({ ok: false, error: `API endpoint /api/${filename} not found` });
  }

  try {
    // Dynamically import the API handler. 
    // Since we run this with 'tsx', it will handle the TypeScript files.
    const module = await import(apiFilePath);
    const handler = module.default;

    if (typeof handler === 'function') {
      // Vercel handlers expect (req, res)
      return await handler(req, res);
    } else {
      console.error(`[Server] API module /api/${filename} does not export a default function`);
      return res.status(500).json({ ok: false, error: 'Internal Server Error: Invalid API handler' });
    }
  } catch (err) {
    console.error(`[Server] Error in /api/${filename}:`, err);
    return res.status(500).json({ 
      ok: false, 
      error: 'Internal Server Error',
      details: err instanceof Error ? err.message : String(err)
    });
  }
});

// Single Page Application (SPA) routing
app.get('*', (req, res) => {
  const indexHtml = path.join(distPath, 'index.html');
  if (fs.existsSync(indexHtml)) {
    res.sendFile(indexHtml);
  } else {
    res.status(404).send('Application not built. Please run "npm run build" first.');
  }
});

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`\n==================================================`);
  console.log(`   DMERCH Portal is running in Container Mode`);
  console.log(`   Internal Port: ${PORT}`);
  console.log(`   Directory: ${__dirname}`);
  console.log(`==================================================\n`);
});
