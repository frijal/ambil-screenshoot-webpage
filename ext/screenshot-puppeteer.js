// =========================================================
// SCRIPT: server-screenshot.js (ADVANCED)
// FITUR: Full Page (Height Auto), Blokir Iklan/Tracker, GH-ACTIONS SAFE
// =========================================================

import fs from "fs";
import path from "path";
import express from "express";
import puppeteer from "puppeteer";

const ROOT_DIR = process.cwd();
const ARTIKEL_DIR = path.join(ROOT_DIR, "artikel");
const IMG_DIR = path.join(ROOT_DIR, "img");

const EXT = "webp";
const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}/artikel/`;

// Lebar tetap 1200px
const TARGET_WIDTH = 1200;
// TARGET_HEIGHT dinonaktifkan karena kita menggunakan fullPage: true (tinggi otomatis)
// const TARGET_HEIGHT = 630;

// Konfigurasi pemblokiran resource
const BLOCKED_RESOURCE_TYPES = [
  'media',       // Video, audio
'font',        // Font eksternal
'image',       // Gambar, tetapi akan diizinkan sebagian di logika
'xhr',         // Panggilan AJAX/API
'fetch',       // Panggilan Fetch API
'other'        // Catch-all
];

// Kata kunci iklan/tracker yang dicari di URL
const BLOCKED_KEYWORDS = [
  'ad.', 'advert', 'googlead', 'doubleclick',
'analytics', 'track', 'tagmanager', 'facebook.com/tr', 'googlesyndication'
];

function startServer() {
  return new Promise((resolve, reject) => {
    const app = express();

    // Cache ringan
    app.use((req, res, next) => {
      res.set("Cache-Control", "public, max-age=60");
      next();
    });

    app.use(express.static(ROOT_DIR));

    const server = app.listen(PORT, () => {
      console.log(`[🌐] Local server ready at http://localhost:${PORT}`);
      resolve(server);
    });

    server.on("error", reject);
  });
}

async function main() {
  // Start local server
  const server = await startServer();

  try {
    if (!fs.existsSync(ARTIKEL_DIR)) {
      console.error("[FATAL] Folder 'artikel/' tidak ditemukan.");
      process.exit(1);
    }

    fs.mkdirSync(IMG_DIR, { recursive: true });

    const files = fs.readdirSync(ARTIKEL_DIR).filter(f => f.endsWith(".html"));
    console.log(`🧭 Menemukan ${files.length} artikel...`);

    // Launch browser sekali saja
    const browser = await puppeteer.launch({
      headless: "new",
      // HANYA set lebar. Tinggi akan otomatis karena opsi fullPage: true.
      defaultViewport: { width: TARGET_WIDTH },
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
    });

    const page = await browser.newPage();

    // --- START: KONFIGURASI BLOKIR RESOURCE ---
    await page.setRequestInterception(true);

    page.on('request', (request) => {
      const url = request.url().toLowerCase();
      const resourceType = request.resourceType();

      let shouldBlock = false;

      // A. Blokir berdasarkan Tipe Resource umum
      if (BLOCKED_RESOURCE_TYPES.includes(resourceType)) {
        // Kita harus mengizinkan 'document', 'stylesheet', dan 'script' agar halaman terrender benar
        if (resourceType !== 'document' && resourceType !== 'stylesheet' && resourceType !== 'script') {
          shouldBlock = true;
        }
      }

      // B. Blokir berdasarkan Kata Kunci (Targeting Ads/Trackers)
      if (!shouldBlock && BLOCKED_KEYWORDS.some(keyword => url.includes(keyword))) {
        shouldBlock = true;
      }

      // C. Eksekusi
      if (shouldBlock) {
        request.abort();
      } else {
        request.continue();
      }
    });
    // --- END: KONFIGURASI BLOKIR RESOURCE ---

    for (const file of files) {
      const base = path.basename(file, ".html");
      const output = path.join(IMG_DIR, `${base}.${EXT}`);

      if (fs.existsSync(output)) {
        console.log(`[⏭️] Lewati ${output} (sudah ada)`);
        continue;
      }

      const url = `${BASE_URL}${base}.html`;
      console.log(`[🔍] Rendering ${url}`);

      try {
        const response = await page.goto(url, {
          waitUntil: ["load", "networkidle2"],
          timeout: 45000,
        });

        if (!response || response.status() !== 200) {
          console.error(`[❌] Status ${response?.status()} saat memuat ${url}`);
          continue;
        }

        await page.screenshot({
          path: output,
          type: EXT,
          quality: EXT === "webp" ? 90 : 90,
          fullPage: true, // AKTIF: Tinggi penuh, lebar 1200px
        });

        console.log(`[📸] Screenshot full page disimpan: ${output}`);
      } catch (err) {
        console.error(`[⚠️] Gagal screenshot ${url}: ${err.message}`);
      }

      await new Promise(r => setTimeout(r, 500));
    }

    await browser.close();
    console.log("🎉 Semua screenshot selesai!");

  } catch (err) {
    console.error(`[FATAL] ${err.message}`);
  } finally {
    server.close(() => console.log("[🛑] Server lokal ditutup."));
  }
}

main();