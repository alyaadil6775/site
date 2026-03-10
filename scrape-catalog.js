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

function scrapeCards(cards) {
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
        const hasCard     = description.includes('Card') || description.includes('Papers');
        const link        = card.querySelector('a');

        results.push({
            name,
            brand:       extractBrand(name),
            description,
            reference,
            price,
            reserved,
            condition:   'Pre-Owned',
            hasCard,
            image:       src,
            href:        link ? link.href : ''
        });
    });
    return results;
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

    console.log('Navigating...');
    await page.goto(STORE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 8000));

    // ── Scroll loop: keep scrolling until item count stops growing ──
    // This handles infinite-scroll pagination where new items are injected
    // into the DOM as you scroll, not just lazy-loaded images.
    console.log('Starting scroll loop...');

    const SELECTORS = [
        '.watch-list-item',            // Elefta exact class (confirmed from DOM)
        '[class*="watch-list-item flex"]', // fallback with partial match
        '[class*="InventoryItem"]', '[class*="inventory-item"]',
        '[class*="listing-item"]', '[class*="product-item"]',
        '[class*="item-card"]',    '[class*="watch-item"]',
        '[class*="ProductCard"]',  '[class*="product-card"]',
        '[class*="storeItem"]',    '[class*="store-item"]'
    ];

    function getActiveSelector(page) {
        return page.evaluate((selectors) => {
            for (const sel of selectors) {
                const found = [...document.querySelectorAll(sel)];
                // Must have multiple results AND contain a price (real product cards)
                if (found.length > 3 && found.some(el => /\$[\d,]+/.test(el.innerText || ''))) {
                    return sel;
                }
            }
            return null;
        }, SELECTORS);
    }

    let lastItemCount  = 0;
    let stableRounds   = 0;
    const MAX_STABLE   = 4;   // stop after 4 rounds with no new items
    const MAX_ROUNDS   = 40;  // hard cap — avoid infinite loop
    let round          = 0;

    while (stableRounds < MAX_STABLE && round < MAX_ROUNDS) {
        round++;

        // Scroll to the very bottom
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await new Promise(r => setTimeout(r, 800));
        // Scroll a bit more to trigger any threshold-based loaders
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await new Promise(r => setTimeout(r, 2500));

        // Count how many product cards are now in the DOM
        const activeSelector = await getActiveSelector(page);
        const itemCount = activeSelector
            ? await page.evaluate(sel => document.querySelectorAll(sel).length, activeSelector)
            : await page.evaluate(() =>
                [...document.querySelectorAll('*')].filter(el => {
                    const txt = el.innerText || '';
                    return /\$[\d,]+/.test(txt) && el.querySelector('img[src*="cloudfront"]');
                }).length
            );

        console.log(`  Round ${round}: ${itemCount} cards in DOM`);

        if (itemCount > lastItemCount) {
            lastItemCount = itemCount;
            stableRounds  = 0;
        } else {
            stableRounds++;
        }
    }

    console.log(`Scroll complete after ${round} rounds. Total DOM cards: ${lastItemCount}`);
    await new Promise(r => setTimeout(r, 2000));

    // ── Diagnose: dump class names of elements containing CDN images ──
    const diagnostics = await page.evaluate(() => {
        const imgs = [...document.querySelectorAll('img[src*="cloudfront"]')];
        const seen = new Set();
        imgs.slice(0, 10).forEach(img => {
            let el = img;
            for (let i = 0; i < 6; i++) {
                el = el.parentElement;
                if (!el) break;
                if (el.className && typeof el.className === 'string') {
                    seen.add(`${el.tagName.toLowerCase()}.${el.className.trim().replace(/\s+/g, '.')}`);
                }
            }
        });
        return [...seen].slice(0, 30);
    });
    console.log('=== DOM classes around CDN images ===');
    diagnostics.forEach(c => console.log(' ', c));
    console.log('=====================================');

    // ── Scrape all cards now that full page is loaded ──
    const activeSelector = await getActiveSelector(page);
    console.log('Active selector:', activeSelector);

    const rawItems = await page.evaluate((selectors, scrapeCardsStr) => {
        // Re-instantiate scrapeCards inside page context
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

        let cards = [];
        for (const sel of selectors) {
            const found = [...document.querySelectorAll(sel)];
            if (found.length > 3) { cards = found; break; }
        }

        // Fallback
        if (cards.length === 0) {
            cards = [...document.querySelectorAll('*')].filter(el => {
                if (el.children.length < 1 || el.children.length > 20) return false;
                const txt = el.innerText || '';
                return /\$[\d,]+/.test(txt) && el.querySelector('img[src*="cloudfront"]');
            });
        }

        console.log('[page] total cards found:', cards.length);

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
            const hasCard     = description.includes('Card') || description.includes('Papers');
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

    // ── Deduplicate by image URL (guaranteed unique per watch) ──
    const seenImg  = new Set();
    const seenText = new Set();

    const products = rawItems
        .filter(item => {
            if (JUNK.has(item.name))            return false;
            if (!item.image)                     return false;
            if (seenImg.has(item.image))         return false;
            const tk = `${item.name}||${item.description}`;
            if (seenText.has(tk))                return false;
            seenImg.add(item.image);
            seenText.add(tk);
            return true;
        })
        .map((p, i) => ({ ...p, id: i }));

    if (products.length === 0) {
        console.warn('WARNING: 0 products after dedup.');
        fs.writeFileSync(OUT_FILE, JSON.stringify([], null, 2));
    } else {
        console.log(`✓ ${products.length} unique products scraped.`);
        fs.writeFileSync(OUT_FILE, JSON.stringify(products, null, 2));
        console.log(`✓ Saved → ${OUT_FILE}`);
    }
})();
