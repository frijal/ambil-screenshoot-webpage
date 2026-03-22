// =========================================================
// SCRIPT: server-screenshot.ts (BUN NATIVE OPTIMIZED)
// =========================================================

import { existsSync, mkdirSync, readdirSync } from "node:fs"; // Tetap digunakan untuk operasi direktori kompleks
import path from "node:path";
import puppeteer from "puppeteer";

const ROOT_DIR = process.cwd();
const ARTIKEL_DIR = path.join(ROOT_DIR, "artikel");
const IMG_DIR = path.join(ROOT_DIR, "img");

const INPUT_SLUG_FILE = path.join(ARTIKEL_DIR, "portal.txt");
const BASE_DOMAIN = 'https://portalbalikpapan.com';

const EXT = "webp";
const TARGET_WIDTH = 1200;
const DEFAULT_VIEWPORT_HEIGHT = 3080;
const HEIGHT_TO_CROP_FROM_BOTTOM = 1124;

// Konfigurasi pemblokiran resource agar loading lebih ngebut
const BLOCKED_RESOURCE_TYPES = ['media', 'xhr', 'fetch', 'other'];
const BLOCKED_KEYWORDS = [
    'ad.', 'advert', 'googlead', 'doubleclick',
    'analytics', 'track', 'tagmanager', 'facebook.com/tr', 'googlesyndication'
];

/**
 * Membaca file menggunakan Bun.file (Lebih cepat dari fs)
 */
async function readSlugsFromInputFile(): Promise<string[]> {
    const file = Bun.file(INPUT_SLUG_FILE);
    if (!(await file.exists())) {
        console.error(`[FATAL] File input tidak ditemukan: ${INPUT_SLUG_FILE}`);
        return [];
    }

    const content = await file.text();
    return content.split('\n')
                  .map(line => line.trim())
                  .filter(line => line.length > 0);
}

/**
 * Mendapatkan daftar screenshot yang sudah ada
 */
function getExistingScreenshots(): Set<string> {
    if (!existsSync(IMG_DIR)) {
        mkdirSync(IMG_DIR, { recursive: true });
        return new Set();
    }
    const existingFiles = readdirSync(IMG_DIR).filter(f => f.endsWith(`.${EXT}`));
    return new Set(existingFiles);
}

async function main() {
    try {
        const slugs = await readSlugsFromInputFile();
        if (slugs.length === 0) {
            console.log("🧭 Tidak ada slug ditemukan. Proses dihentikan.");
            return;
        }

        const existingScreenshots = getExistingScreenshots();
        console.log(`🧭 Menemukan ${slugs.length} URL. (${existingScreenshots.size} sudah ada)...`);

        const browser = await puppeteer.launch({
            headless: true, // Bun mendukung 'true' (identik dengan 'new' di versi lama)
            defaultViewport: { width: TARGET_WIDTH, height: DEFAULT_VIEWPORT_HEIGHT },
            args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
        });

        const page = await browser.newPage();

        // Optimasi Request Interception
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const url = request.url().toLowerCase();
            const resourceType = request.resourceType();
            
            const isBlockedType = BLOCKED_RESOURCE_TYPES.includes(resourceType) && 
                                 !['document', 'stylesheet', 'script'].includes(resourceType);
            const isBlockedKeyword = BLOCKED_KEYWORDS.some(kw => url.includes(kw));

            if (isBlockedType || isBlockedKeyword) {
                request.abort();
            } else {
                request.continue();
            }
        });

        for (const slug of slugs) {
            let url = slug.startsWith('http') ? slug : `${BASE_DOMAIN}${slug}`;
            let slugPath = slug.replace(BASE_DOMAIN, '').replace(/^https?:\/\//, '').replace(/^\/|\/$/g, '');
            
            const fileName = slugPath.replace(/\//g, '-') || 'index';
            const outputFileName = `${fileName}.${EXT}`;

            if (existingScreenshots.has(outputFileName)) {
                console.log(`[⏭️] Lewati ${outputFileName}`);
                continue;
            }

            const outputPath = path.join(IMG_DIR, outputFileName);
            console.log(`[🔍] Rendering ${url}`);

            try {
                const response = await page.goto(url, {
                    waitUntil: "networkidle0",
                    timeout: 60000,
                });

                if (!response || response.status() !== 200) {
                    console.error(`[❌] Status ${response?.status()} pada ${url}`);
                    continue;
                }

                // Pengganti waitForTimeout yang lebih bersih
                await Bun.sleep(500); 

                // Ukur tinggi asli halaman
                const totalHeight = await page.evaluate(() => document.documentElement.scrollHeight);
                const targetHeight = Math.max(100, totalHeight - HEIGHT_TO_CROP_FROM_BOTTOM);

                // Set viewport ke ukuran hasil crop
                await page.setViewport({ width: TARGET_WIDTH, height: targetHeight });

                await page.screenshot({
                    path: outputPath,
                    type: "webp", // Langsung tembak webp
                    quality: 85,   // 85 sudah sangat cukup untuk web (Diet Mode)
                    clip: { x: 0, y: 0, width: TARGET_WIDTH, height: targetHeight }
                });

                // Reset viewport untuk loop berikutnya
                await page.setViewport({ width: TARGET_WIDTH, height: DEFAULT_VIEWPORT_HEIGHT });
                console.log(`[📸] Tersimpan: ${outputFileName} (${targetHeight}px)`);

            } catch (err: any) {
                console.error(`[⚠️] Gagal screenshot ${url}: ${err.message}`);
            }

            await Bun.sleep(1000); // Jeda antar request agar tidak dianggap bot ganas
        }

        await browser.close();
        console.log("🎉 Semua proses selesai menggunakan Bun!");

    } catch (err: any) {
        console.error(`[FATAL] ${err.message}`);
    }
}

main();
