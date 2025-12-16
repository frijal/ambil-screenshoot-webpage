// =========================================================
// SCRIPT: server-screenshot.js (ADVANCED CROPPING)
// FITUR: Ambil Screenshot dari Domain Eksternal, MEMOTONG 1124px dari bawah.
// =========================================================

import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";

const ROOT_DIR = process.cwd();
const ARTIKEL_DIR = path.join(ROOT_DIR, "artikel");
const IMG_DIR = path.join(ROOT_DIR, "img");

const INPUT_SLUG_FILE = path.join(ARTIKEL_DIR, "portal.txt");
const BASE_DOMAIN = 'https://portalbalikpapan.com';

const EXT = "webp";
const TARGET_WIDTH = 1200;
const DEFAULT_VIEWPORT_HEIGHT = 3080; // Placeholder untuk menghindari error protokol

// ✂️ NILAI PEMOTONGAN YANG ANDA MINTA
const HEIGHT_TO_CROP_FROM_BOTTOM = 1124;

// Konfigurasi pemblokiran resource
const BLOCKED_RESOURCE_TYPES = [
    'media', 'xhr', 'fetch', 'other'
];
const BLOCKED_KEYWORDS = [
    'ad.', 'advert', 'googlead', 'doubleclick',
    'analytics', 'track', 'tagmanager', 'facebook.com/tr', 'googlesyndication'
];

/**
 * Membaca file portal.txt dan mengembalikan daftar slug/path.
 */
function readSlugsFromInputFile() {
    if (!fs.existsSync(INPUT_SLUG_FILE)) {
        console.error(`[FATAL] File input tidak ditemukan: ${INPUT_SLUG_FILE}`);
        return [];
    }

    const content = fs.readFileSync(INPUT_SLUG_FILE, 'utf8');
    return content.split('\n')
                  .map(line => line.trim())
                  .filter(line => line.length > 0);
}


async function main() {
  try {
    const slugs = readSlugsFromInputFile();

    if (slugs.length === 0) {
      console.log("🧭 Tidak ada slug ditemukan di portal.txt. Proses dihentikan.");
      return;
    }

    fs.mkdirSync(IMG_DIR, { recursive: true });

    console.log(`🧭 Menemukan ${slugs.length} URL untuk di-screenshot dari ${INPUT_SLUG_FILE}...`);

    // Launch browser sekali saja
    const browser = await puppeteer.launch({
      headless: "new",
      defaultViewport: { width: TARGET_WIDTH, height: DEFAULT_VIEWPORT_HEIGHT },
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
        if (BLOCKED_RESOURCE_TYPES.includes(resourceType)) {
            if (resourceType !== 'document' && resourceType !== 'stylesheet' && resourceType !== 'script') {
                 shouldBlock = true;
            }
        }
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

    for (const slug of slugs) {
        let url;
        let slugForFileName = slug;

        if (slug.startsWith('http')) {
            url = slug;
            slugForFileName = slug.replace(BASE_DOMAIN, '').replace('https://', '').replace('http://', '');
        } else {
            url = `${BASE_DOMAIN}${slug}`;
        }

        const cleanSlug = slugForFileName.replace(/^\/|\/$/g, '');
        const fileName = cleanSlug.replace(/\//g, '-');
        const output = path.join(IMG_DIR, `${fileName}.${EXT}`);

      if (fs.existsSync(output)) {
        console.log(`[⏭️] Lewati ${output} (sudah ada)`);
        continue;
      }

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

        // =========================================================
        // 🚨 LOGIKA PENGUKURAN DAN PEMOTONGAN KETINGGIAN
        // =========================================================

        // 1. Ambil tinggi konten total halaman (scroll height)
        const totalHeight = await page.evaluate(() => document.documentElement.scrollHeight);

        // 2. Hitung tinggi screenshot target
        const targetHeight = Math.max(0, totalHeight - HEIGHT_TO_CROP_FROM_BOTTOM); // Pastikan tidak negatif

        if (targetHeight === 0) {
            console.log(`[⚠️] Konten terlalu pendek. Tinggi total (${totalHeight}px) kurang dari batas potong (${HEIGHT_TO_CROP_FROM_BOTTOM}px). Melewati.`);
            continue;
        }

        // 3. Set Viewport sementara ke target height
        // Ini agar Puppeteer me-render seluruh konten (termasuk yang dipotong)
        await page.setViewport({ width: TARGET_WIDTH, height: targetHeight });

        // 4. Lakukan Screenshot menggunakan opsi 'clip'
        await page.screenshot({
          path: output,
          type: EXT,
          quality: EXT === "webp" ? 90 : 90,
          // Gunakan clip untuk menentukan area yang akan ditangkap
           clip: {
               x: 0,
               y: 0,
               width: TARGET_WIDTH,
               height: targetHeight // Tangkap dari atas (y=0) hingga targetHeight
           }
        });

        // 5. Kembalikan Viewport ke default (Opsional, tapi praktik yang baik)
        await page.setViewport({ width: TARGET_WIDTH, height: DEFAULT_VIEWPORT_HEIGHT });

        console.log(`[📸] Screenshot dipotong (Tinggi ${targetHeight}px, Potong Bawah ${HEIGHT_TO_CROP_FROM_BOTTOM}px) disimpan: ${output}`);
        // =========================================================

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
