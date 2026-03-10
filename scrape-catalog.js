/**
 * scrape-catalog.js
 * Scrapes Swiss Time USA Elefta store and writes catalog.json
 * Run: npm install puppeteer && node scrape-catalog.js
 */

const puppeteer = require('puppeteer');
const fs        = require('fs');
const path      = require('path');

const STORE_URL = 'https://swisstimeusa.elefta.store/store/3f6a81';
const OUT_FILE  = path.join(__dirname, 'catalog.json');

const JUNK = new Set([
    'SWISS TIME USA', 'Brand', 'Reference Number',
    'Series', 'Condition', 'Box & Papers', 'Powered By', 'Contact Us'
]);

const BRAND_MAP = {
    'Rolex': 'Rolex', 'Omega': 'Omega', 'Cartier': 'Cartier',
    'Breitling': 'Breitling', 'Patek': 'Patek Philippe',
    'Audemars': 'Audemars Piguet', 'IWC': 'IWC', 'TAG': 'TAG Heuer'
};

function extractBrand(name) {
    for (const [key, val] of Object.entries(BRAND_MAP)) {
        if (name.startsWith(key)) return val;
    }
    return '';
}

(async () => {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    console.log('Navigating to store...');
    await page.goto(STORE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    console.log('Waiting for initial render...');
    await new Promise(r => setTimeout(r, 8000));

    // ── Scroll until the page stops growing ────────────────────────
    // Elefta uses infinite scroll — new watch cards are injected into
    // the DOM as you reach the bottom. We keep scrolling until the
    // page height hasn't changed for 3 consecutive checks.
    console.log('Scrolling page to load all watches...');

    let lastHeight   = 0;
    let stableRounds = 0;
    let round        = 0;

    while (stableRounds < 5) {
        round++;

        // Scroll to the absolute bottom of the current page
        const heightBeforeWait = await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
            return document.body.scrollHeight;
        });

        // Wait for new items to be injected by the infinite scroll handler
        await new Promise(r => setTimeout(r, 2000));

        const heightAfterWait = await page.evaluate(() => document.body.scrollHeight);
        console.log(`  Scroll ${round}: height ${heightBeforeWait}px → ${heightAfterWait}px`);

        if (heightAfterWait > lastHeight) {
            lastHeight   = heightAfterWait;
            stableRounds = 0; // page grew — keep going
        } else {
            stableRounds++; // no change — count toward stopping
        }
    }

    console.log(`All items loaded after ${round} scrolls. Final page height: ${lastHeight}px`);

    // Scroll back to top then to bottom once more so all images are in view
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise(r => setTimeout(r, 1000));
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(r => setTimeout(r, 2000));

    // ── Scrape ─────────────────────────────────────────────────────
    const SELECTORS = [
        '.watch-list-item',
        '[class*="watch-list-item flex"]',
        '[class*="InventoryItem"]', '[class*="inventory-item"]',
        '[class*="listing-item"]', '[class*="product-item"]',
        '[class*="item-card"]',    '[class*="watch-item"]',
        '[class*="ProductCard"]',  '[class*="product-card"]',
        '[class*="storeItem"]',    '[class*="store-item"]'
    ];

    const rawItems = await page.evaluate((selectors) => {
        const BRAND_MAP = {
            'Rolex': 'Rolex', 'Omega': 'Omega', 'Cartier': 'Cartier',
            'Breitling': 'Breitling', 'Patek': 'Patek Philippe',
            'Audemars': 'Audemars Piguet', 'IWC': 'IWC', 'TAG': 'TAG Heuer'
        };
        function extractBrand(name) {
            for (const [key, val] of Object.entries(BRAND_MAP)) {
                if (name.startsWith(key)) return val;
            }
            return '';
        }

        // Find the right selector — must match cards that contain a price
        let cards = [];
        let usedSelector = null;
        for (const sel of selectors) {
            const found = [...document.querySelectorAll(sel)];
            if (found.length > 3 && found.some(el => /\$[\d,]+/.test(el.innerText || ''))) {
                cards = found;
                usedSelector = sel;
                break;
            }
        }

        // Fallback: any element containing a CDN image and a price
        if (cards.length === 0) {
            usedSelector = 'fallback';
            cards = [...document.querySelectorAll('*')].filter(el => {
                if (el.children.length < 1 || el.children.length > 25) return false;
                return /\$[\d,]+/.test(el.innerText || '') &&
                       el.querySelector('img[src*="cloudfront"]');
            });
        }

        console.log('[page] selector:', usedSelector, '| cards:', cards.length);

        const results = [];
        cards.forEach((card, i) => {
            const img = card.querySelector('img[src*="cloudfront"], img[data-src*="cloudfront"]');
            const src = img ? (img.src || img.getAttribute('data-src') || '') : '';
            if (!src || src.includes('logo_footer')) return;

            const txt   = (card.innerText || '').trim();
            const lines = txt.split('\n').map(l => l.trim()).filter(Boolean);

            const priceMatch = txt.match(/\$[\d,]+(\.\d{2})?/);
            const price      = priceMatch ? priceMatch[0] : 'Contact for price';

            const refMatch  = txt.match(/[Rr]ef\.?\s*[:#]?\s*([\w\-\/\.]+)/);
            const reference = refMatch ? refMatch[1].trim().replace(/\.$/, '') : '';

            const name        = lines[0] || `Item ${i}`;
            const description = lines[1] || '';
            const reserved    = lines.some(l => l.toLowerCase() === 'reserved');
            const hasCard     = txt.toLowerCase().includes('box') || txt.toLowerCase().includes('papers');
            const link        = card.querySelector('a');

            results.push({
                name,
                brand:     extractBrand(name),
                description,
                reference,
                price,
                reserved,
                condition: 'Pre-Owned',
                hasCard,
                image:     src,
                href:      link ? link.href : ''
            });
        });

        return results;
    }, SELECTORS);

    await browser.close();
    console.log(`Raw items scraped from page: ${rawItems.length}`);

    // ── Deduplicate ─────────────────────────────────────────────────
    const seenImg  = new Set();
    const seenText = new Set();

    const products = rawItems
        .filter(item => {
            if (JUNK.has(item.name)) return false;
            if (!item.image)         return false;
            if (seenImg.has(item.image)) return false;
            const tk = `${item.name}||${item.description}`;
            if (seenText.has(tk))    return false;
            seenImg.add(item.image);
            seenText.add(tk);
            return true;
        })
        .map((p, i) => ({ ...p, id: i }));

    if (products.length === 0) {
        console.warn('WARNING: 0 products after dedup — writing empty array.');
        fs.writeFileSync(OUT_FILE, JSON.stringify([], null, 2));
    } else {
        console.log(`✓ ${products.length} unique products saved.`);
        fs.writeFileSync(OUT_FILE, JSON.stringify(products, null, 2));
        console.log(`✓ Written to ${OUT_FILE}`);
    }
})();
