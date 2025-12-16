// =========================================================
// SCRIPT: server-screenshot.js (DOMAIN EKSTERNAL - CLEAN URL)
// FITUR: Ambil Screenshot dari Domain Eksternal TANPA ekstensi .html
// =========================================================

import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";

const ROOT_DIR = process.cwd();
const ARTIKEL_DIR = path.join(ROOT_DIR, "artikel");
const IMG_DIR = path.join(ROOT_DIR, "img");

const EXT = "webp";

// GANTI BASE_URL ke domain target eksternal Anda
// Pastikan BASE_URL diakhiri dengan slash (/) jika diperlukan sebelum slug.
const BASE_URL = 'https://portalbalikpapan.com/'; 

const TARGET_WIDTH = 1200; 

// Konfigurasi pemblokiran resource
const BLOCKED_RESOURCE_TYPES = [
    'media', 'font', 'image', 'xhr', 'fetch', 'other'
];
const BLOCKED_KEYWORDS = [
    'ad.', 'advert', 'googlead', 'doubleclick', 
    'analytics', 'track', 'tagmanager', 'facebook.com/tr', 'googlesyndication'
];

async function main() {
  try {
    if (!fs.existsSync(ARTIKEL_DIR)) {
      console.error("[FATAL] Folder 'artikel/' tidak ditemukan.");
      process.exit(1);
    }

    fs.mkdirSync(IMG_DIR, { recursive: true });

    // Membaca daftar slug artikel dari folder lokal
    const files = fs.readdirSync(ARTIKEL_DIR).filter(f => f.endsWith(".html"));
    console.log(`🧭 Menemukan ${files.length} slug artikel lokal untuk domain eksternal...`);

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
    
    // --- KONFIGURASI BLOKIR RESOURCE ---
    await page.setRequestInterception(true);

    page.on('request', (request) => {
        const url = request.url().toLowerCase();
        const resourceType = request.resourceType();
        
        let shouldBlock = false;

        // A. Blokir berdasarkan Tipe Resource umum
        if (BLOCKED_RESOURCE_TYPES.includes(resourceType)) {
            if (resourceType !== 'document' && resourceType !== 'stylesheet' && resourceType !== 'script') {
                 shouldBlock = true;
            }
        }
        
        // B. Blokir berdasarkan Kata Kunci (Targeting Ads/Trackers)
        if (!shouldBlock && BLOCKED_KEYWORDS.some(keyword => url.includes(keyword))) {
            shouldBlock = true;
        }

        if (shouldBlock) {
            request.abort();
        } else {
            request.continue();
        }
    });
    // --- END: KONFIGURASI BLOKIR RESOURCE ---

    for (const file of files) {
        // base = nama file tanpa ekstensi (.html) -> ini adalah SLUG yang bersih
      const base = path.basename(file, ".html");
      const output = path.join(IMG_DIR, `${base}.${EXT}`);

      if (fs.existsSync(output)) {
        console.log(`[⏭️] Lewati ${output} (sudah ada)`);
        continue;
      }

      // 🚨 PERUBAHAN UTAMA: Membangun URL eksternal TANPA penambahan .html
      const url = `${BASE_URL}${base}`; // Dihapus '.html' di sini
      console.log(`[🔍] Rendering ${url}`);

      try {
        const response = await page.goto(url, {
          waitUntil: ["load", "networkidle2"],
          timeout: 60000, 
        });

        if (!response || response.status() !== 200) {
          console.error(`[❌] Status ${response?.status() || 'NO RESPONSE'} saat memuat ${url}`);
          continue;
        }

        await page.screenshot({
          path: output,
          type: EXT,
          quality: EXT === "webp" ? 90 : 90,
          fullPage: true, 
        });

        console.log(`[📸] Screenshot full page disimpan: ${output}`);
      } catch (err) {
        console.error(`[⚠️] Gagal screenshot ${url}: ${err.message}`);
      }

      await new Promise(r => setTimeout(r, 1000)); 
    }

    await browser.close();
    console.log("🎉 Semua screenshot selesai!");

  } catch (err) {
    console.error(`[FATAL] ${err.message}`);
  } 
}

main();
