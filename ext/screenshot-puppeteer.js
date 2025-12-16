// =========================================================
// SCRIPT: server-screenshot.js (DOMAIN EKSTERNAL DARI portal.txt)
// FITUR: Ambil Screenshot dari Domain Eksternal, Input URL dari file portal.txt
// PERBAIKAN: Mengatasi 'Protocol error' dengan menambahkan default height.
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
const TARGET_WIDTH = 1200; // Lebar tetap

// 💡 FIX: Menambahkan nilai height default. Meskipun akan diabaikan oleh fullPage: true,
// ini mencegah error 'mandatory field missing' dari protokol Chromium.
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
 * @returns {string[]} Array of slugs.
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
            // 🚨 PERBAIKAN DI SINI: Menyertakan 'height' untuk mencegah error Emulation.setDeviceMetricsOverride
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
            // Bersihkan slug: hapus slash (/) di awal dan akhir untuk penamaan file
            const cleanSlug = slug.replace(/^\/|\/$/g, '');

            // Nama file output: ganti slash di path dengan dash (-)
            const fileName = cleanSlug.replace(/\//g, '-');
            const output = path.join(IMG_DIR, `${fileName}.${EXT}`);

            if (fs.existsSync(output)) {
                console.log(`[⏭️] Lewati ${output} (sudah ada)`);
                continue;
            }

            // Membangun URL: BASE_DOMAIN + slug
            const url = `${BASE_DOMAIN}${slug}`;
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