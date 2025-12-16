// =========================================================
// SCRIPT: server-screenshot.js (DOMAIN EKSTERNAL DARI portal.txt)
// PERBAIKAN: Logika konstruksi URL yang robust (anti-duplikasi domain).
// =========================================================

import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";

const ROOT_DIR = process.cwd();
const ARTIKEL_DIR = path.join(ROOT_DIR, "artikel");
const IMG_DIR = path.join(ROOT_DIR, "img");

const INPUT_SLUG_FILE = path.join(ARTIKEL_DIR, "portal.txt");
const BASE_DOMAIN = 'https://portalbalikpapan.com'; // Base Domain

const EXT = "webp";
const TARGET_WIDTH = 1200; 
const DEFAULT_VIEWPORT_HEIGHT = 1080; 

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
    
    // Baca konten, bagi berdasarkan baris baru, dan filter baris kosong
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

        // A. Blokir berdasarkan Tipe Resource umum
        if (BLOCKED_RESOURCE_TYPES.includes(resourceType)) {
            if (resourceType !== 'document' && resourceType !== 'stylesheet' && resourceType !== 'script') {
                shouldBlock = true;
            }
        }
        
        // B. Blokir berdasarkan Kata Kunci
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
        // 1. Tentukan URL yang akan diakses Puppeteer (PERBAIKAN LOGIKA)
        let url;
        let slugForFileName = slug; // default

        // Cek apakah slug sudah berupa URL lengkap
        if (slug.startsWith('http')) {
            url = slug; // Gunakan slug sebagai URL lengkap
            // Hapus BASE_DOMAIN dari slug untuk penamaan file
            slugForFileName = slug.replace(BASE_DOMAIN, '').replace('https://', '').replace('http://', '');
        } else {
            url = `${BASE_DOMAIN}${slug}`; // Gabungkan BASE_DOMAIN jika hanya path
        }
        
        // 2. Tentukan Nama File Output
        // Bersihkan path untuk penamaan file: hapus slash (/) di awal dan akhir
        const cleanSlug = slugForFileName.replace(/^\/|\/$/g, ''); 
        
        // Ganti semua slash di path yang tersisa (misal /berita/xyz) dengan dash (-) untuk nama file
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
