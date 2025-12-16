// =========================================================
// SCRIPT: server-screenshot.js (OPTIMIZED & CROPPING)
// FITUR: Ambil Screenshot dari Domain Eksternal, Potong 1124px dari Bawah.
// BARU: Memeriksa dan Melewati URL yang Sudah Di-screenshot.
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
const DEFAULT_VIEWPORT_HEIGHT = 1080;
const HEIGHT_TO_CROP_FROM_BOTTOM = 1124; 

// Konfigurasi pemblokiran resource
const BLOCKED_RESOURCE_TYPES = [
    'media', 'font', 'image', 'xhr', 'fetch', 'other'
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

/**
 * 💡 FUNGSI BARU: Mendapatkan Set nama file screenshot yang sudah ada.
 * @returns {Set<string>} Set berisi nama file screenshot yang ada (contoh: 'pejabat-terjerat.webp').
 */
function getExistingScreenshots() {
    try {
        if (!fs.existsSync(IMG_DIR)) {
            fs.mkdirSync(IMG_DIR, { recursive: true });
            return new Set();
        }
        const existingFiles = fs.readdirSync(IMG_DIR).filter(f => f.endsWith(`.${EXT}`));
        return new Set(existingFiles);
    } catch (error) {
        console.error(`[⚠️] Gagal membaca folder ${IMG_DIR}: ${error.message}`);
        return new Set();
    }
}


async function main() {
  try {
    const slugs = readSlugsFromInputFile();

    if (slugs.length === 0) {
      console.log("🧭 Tidak ada slug ditemukan di portal.txt. Proses dihentikan.");
      return;
    }

    // Dapatkan daftar screenshot yang sudah ada di memori
    const existingScreenshots = getExistingScreenshots();

    console.log(`🧭 Menemukan ${slugs.length} URL untuk di-screenshot. (${existingScreenshots.size} sudah ada)...`);

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
        const outputFileName = `${fileName}.${EXT}`; // Nama file lengkap

        // 💡 LOGIKA DUPLIKASI BARU: Cek di Set yang sudah dimuat di memori
        if (existingScreenshots.has(outputFileName)) {
          console.log(`[⏭️] Lewati ${outputFileName} (sudah ada)`);
          continue;
        }

        // Path lengkap untuk output
        const output = path.join(IMG_DIR, outputFileName);
        
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

        // --- LOGIKA PENGUKURAN DAN PEMOTONGAN KETINGGIAN ---
        
        const totalHeight = await page.evaluate(() => document.documentElement.scrollHeight);
        const targetHeight = Math.max(0, totalHeight - HEIGHT_TO_CROP_FROM_BOTTOM);

        if (targetHeight === 0) {
            console.log(`[⚠️] Konten terlalu pendek (${totalHeight}px). Melewati.`);
            continue;
        }

        await page.setViewport({ width: TARGET_WIDTH, height: targetHeight });
        
        await page.screenshot({
          path: output,
          type: EXT,
          quality: EXT === "webp" ? 90 : 90,
          clip: {
               x: 0,
               y: 0,
               width: TARGET_WIDTH,
               height: targetHeight 
           }
        });
        
        await page.setViewport({ width: TARGET_WIDTH, height: DEFAULT_VIEWPORT_HEIGHT }); 

        console.log(`[📸] Screenshot dipotong (Tinggi ${targetHeight}px) disimpan: ${outputFileName}`);
        // --- END LOGIKA PENGUKURAN ---

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
