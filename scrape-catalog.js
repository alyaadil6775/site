/**
 * scrape-catalog.js
 * ===========================================
 * Scrapes Swiss Time USA Elefta store and writes catalog.json
 *
 * Run locally:
 *   npm install puppeteer
 *   node scrape-catalog.js
 *
 * Runs automatically via GitHub Actions every 2 hours.
 * ===========================================
 */

const puppeteer = require('puppeteer');
const fs        = require('fs');
const path      = require('path');

const STORE_URL = 'https://swisstimeusa.elefta.store/store/3f6a81';
const OUT_FILE  = path.join(__dirname, 'catalog.json');

// Names that are page-level labels, not real products
const JUNK_NAMES = new Set([
  'SWISS TIME USA', 'Brand', 'Reference Number',
  'Series', 'Condition', 'Box & Papers', 'Powered By', 'Contact Us'
]);

(async () => {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    console.log('Navigating to store...');
    await page.goto(STORE_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    console.log('Waiting for JS render...');
    await new Promise(r => setTimeout(r, 8000));

    // Scroll incrementally — pause after each pass so lazy-loaded
    // items have time to render before we scroll further.
    // Keeps going until the page height stops growing for 3 rounds.
    console.log('Scrolling to load all lazy items...');
    let unchangedRounds = 0;
    let lastHeight = 0;

    while (unchangedRounds < 3) {
        const currentHeight = await page.evaluate(() => document.body.scrollHeight);

        // Scroll to bottom in small steps
        await page.evaluate(async () => {
            await new Promise(resolve => {
                const step = 300;
                let pos = window.scrollY;
                const id = setInterval(() => {
                    window.scrollBy(0, step);
                    pos += step;
                    if (pos >= document.body.scrollHeight) {
                        clearInterval(id);
                        resolve();
                    }
                }, 100);
            });
        });

        // Wait for new items to render
        await new Promise(r => setTimeout(r, 2500));

        const newHeight = await page.evaluate(() => document.body.scrollHeight);
        console.log(`  Height: ${currentHeight} → ${newHeight}`);

        if (newHeight === currentHeight) {
            unchangedRounds++;
        } else {
            unchangedRounds = 0; // new content appeared, keep scrolling
        }
        lastHeight = newHeight;
    }

    console.log(`Scroll done. Final page height: ${lastHeight}`);
    await new Promise(r => setTimeout(r, 2000));

    // ── Core scrape ───────────────────────────────────────────────
    const rawItems = await page.evaluate(() => {
        const results = [];

        // Elefta renders each listing as a small card.
        // Try specific selectors first, then fall back.
        const SELECTORS = [
            '[class*="InventoryItem"]',
            '[class*="inventory-item"]',
            '[class*="listing-item"]',
            '[class*="product-item"]',
            '[class*="item-card"]',
            '[class*="watch-item"]',
            '[class*="ProductCard"]',
            '[class*="product-card"]',
            '[class*="storeItem"]',
            '[class*="store-item"]'
        ];

        let cards = [];
        for (const sel of SELECTORS) {
            const found = [...document.querySelectorAll(sel)];
            if (found.length > 3) {
                cards = found;
                console.log('[scraper] selector hit:', sel, found.length);
                break;
            }
        }

        // Fallback: find all elements that contain exactly one price
        // and exactly one image from the CDN
        if (cards.length === 0) {
            cards = [...document.querySelectorAll('*')].filter(el => {
                if (el.children.length < 1 || el.children.length > 20) return false;
                const txt = el.innerText || '';
                const hasPrice = /\$[\d,]+/.test(txt);
                const hasImg   = el.querySelector('img[src*="cloudfront"]');
                return hasPrice && hasImg;
            });
            console.log('[scraper] fallback cards:', cards.length);
        }

        cards.forEach((card, i) => {
            const img  = card.querySelector('img[src*="cloudfront"], img[data-src*="cloudfront"]');
            const src  = img ? (img.src || img.getAttribute('data-src') || '') : '';

            // Skip cards with no CDN image (ghost/duplicate elements)
            if (!src || src.includes('logo_footer')) return;

            const txt   = (card.innerText || '').trim();
            const lines = txt.split('\n').map(l => l.trim()).filter(Boolean);

            // Price: first $X,XXX match
            const priceMatch = txt.match(/\$[\d,]+(\.\d{2})?/);
            const price      = priceMatch ? priceMatch[0] : 'Contact for price';

            // Reference: full ref number — match patterns like 116520, 126711CHNR,
            // 210.30.42.20.03.001, 428.17.39.60.01.001, A13317101C1A1, 4016/W4PN0008
            const refMatch = txt.match(
                /[Rr]ef\.?\s*[:#]?\s*([\w\-\/\.]+(?:[\w\-\/\.]+)*)/
            );
            const reference = refMatch ? refMatch[1].trim().replace(/\.$/, '') : '';

            // Name = first non-empty line
            const name = lines[0] || `Item ${i}`;

            // Description = second line (the dial/bracelet description)
            const description = lines[1] || '';

            // Brand: derive from the watch name
            const brandMap = {
                'Rolex': 'Rolex', 'Omega': 'Omega', 'Cartier': 'Cartier',
                'Breitling': 'Breitling', 'Patek': 'Patek Philippe',
                'Audemars': 'Audemars Piguet', 'IWC': 'IWC', 'TAG': 'TAG Heuer'
            };
            let brand = '';
            for (const [key, val] of Object.entries(brandMap)) {
                if (name.startsWith(key)) { brand = val; break; }
            }

            // Reserved flag
            const reserved = lines.some(l => l.toLowerCase() === 'reserved');

            // Condition / box from description text
            const hasCard   = description.includes('Card') || description.includes('Papers');
            const condition = 'Pre-Owned';

            const link = card.querySelector('a');

            results.push({
                id:          i,
                name,
                brand,
                description,
                reference,
                price,
                reserved,
                condition,
                hasCard,
                image:       src,
                href:        link ? link.href : ''
            });
        });

        return results;
    });

    await browser.close();

    // ── Post-process: deduplicate by (name + reference + price) ──
    // Keep the version with the better image (non-empty image wins)
    const seen    = new Map();
    const JUNK    = ['SWISS TIME USA','Brand','Reference Number','Series',
                     'Condition','Box & Papers','Powered By','Contact Us'];

    rawItems.forEach(item => {
        if (JUNK.includes(item.name)) return;
        if (!item.image)              return; // always drop no-image duplicates

        const key = `${item.name}|${item.reference}|${item.description}`;
        if (!seen.has(key)) {
            seen.set(key, item);
        }
    });

    const products = [...seen.values()].map((p, i) => ({ ...p, id: i }));

    if (products.length === 0) {
        console.warn('WARNING: 0 products found after dedup. Writing empty array.');
        fs.writeFileSync(OUT_FILE, JSON.stringify([], null, 2));
    } else {
        console.log(`✓ ${products.length} unique products scraped.`);
        fs.writeFileSync(OUT_FILE, JSON.stringify(products, null, 2));
        console.log(`✓ Saved → ${OUT_FILE}`);
    }
})();
