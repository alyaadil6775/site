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

    // ── Find the real scroll container ─────────────────────────────
    // Elefta renders inside an inner div with overflow:scroll, not on
    // document.body — so we must scroll that element, not the window.
    const scrollSel = await page.evaluate(() => {
        const els = [...document.querySelectorAll('*')];
        let best = null;
        let bestHeight = window.innerHeight;
        for (const el of els) {
            const style = window.getComputedStyle(el);
            const scrollable = ['auto', 'scroll'].includes(style.overflowY) ||
                               ['auto', 'scroll'].includes(style.overflow);
            if (scrollable && el.scrollHeight > bestHeight) {
                bestHeight = el.scrollHeight;
                best = el;
            }
        }
        if (!best) return null;
        if (best.id) return '#' + best.id;
        // Use first meaningful class
        const cls = (best.className || '').trim().split(/\s+/)
            .find(c => c.length > 2 && !c.startsWith('css-'));
        return cls ? '.' + cls : null;
    });
    console.log('Scroll container:', scrollSel || 'window (fallback)');

    // ── Scroll loop ─────────────────────────────────────────────────
    // Keep scrolling the container to its bottom and waiting for new
    // items to inject. Stop when scrollHeight stops growing for 5 rounds.
    console.log('Scrolling to load all watches...');

    let lastHeight   = 0;
    let stableRounds = 0;
    let round        = 0;

    while (stableRounds < 5) {
        round++;

        const heightBefore = await page.evaluate((sel) => {
            const el = sel ? document.querySelector(sel) : null;
            if (el) { el.scrollTop = el.scrollHeight; return el.scrollHeight; }
            window.scrollTo(0, document.body.scrollHeight);
            return Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
        }, scrollSel);

        await new Promise(r => setTimeout(r, 2000));

        const heightAfter = await page.evaluate((sel) => {
            const el = sel ? document.querySelector(sel) : null;
            if (el) return el.scrollHeight;
            return Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
        }, scrollSel);

        console.log(`  Scroll ${round}: ${heightBefore}px → ${heightAfter}px`);

        if (heightAfter > lastHeight) {
            lastHeight   = heightAfter;
            stableRounds = 0;
        } else {
            stableRounds++;
        }
    }

    console.log(`Done scrolling after ${round} rounds. Final height: ${lastHeight}px`);

    // One more scroll to bottom to ensure last batch rendered
    await page.evaluate((sel) => {
        const el = sel ? document.querySelector(sel) : null;
        if (el) el.scrollTop = el.scrollHeight;
        else window.scrollTo(0, document.body.scrollHeight);
    }, scrollSel);
    await new Promise(r => setTimeout(r, 3000));

    // ── Scrape all cards ────────────────────────────────────────────
    const SELECTORS = [
        '.watch-list-item',
        '[class*="watch-list-item flex"]',
        '[class*="InventoryItem"]', '[class*="inventory-item"]',
        '[class*="listing-item"]', '[class*="product-item"]',
        '[class*="item-card"]',    '[class*="watch-item"]',
        '[class*="ProductCard"]',  '[class*="product-card"]',
        '[class*="storeItem"]',    '[class*="store-item"]'
    ];

    const rawItems = await page.evaluate((selectors, brandMap) => {
        function extractBrand(name) {
            for (const [key, val] of Object.entries(brandMap)) {
                if (name.startsWith(key)) return val;
            }
            return '';
        }

        let cards = [];
        let usedSel = null;
        for (const sel of selectors) {
            const found = [...document.querySelectorAll(sel)];
            if (found.length > 3 && found.some(el => /\$[\d,]+/.test(el.innerText || ''))) {
                cards = found;
                usedSel = sel;
                break;
            }
        }

        if (cards.length === 0) {
            usedSel = 'fallback';
            cards = [...document.querySelectorAll('*')].filter(el => {
                if (el.children.length < 1 || el.children.length > 25) return false;
                return /\$[\d,]+/.test(el.innerText || '') &&
                       el.querySelector('img[src*="cloudfront"]');
            });
        }

        console.log('[page] selector:', usedSel, '| cards:', cards.length);

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
    }, SELECTORS, BRAND_MAP);

    await browser.close();
    console.log(`Raw items from page: ${rawItems.length}`);

    // ── Deduplicate ─────────────────────────────────────────────────
    const seenImg  = new Set();
    const seenText = new Set();

    const products = rawItems
        .filter(item => {
            if (JUNK.has(item.name))         return false;
            if (!item.image)                  return false;
            if (seenImg.has(item.image))      return false;
            const tk = `${item.name}||${item.description}`;
            if (seenText.has(tk))             return false;
            seenImg.add(item.image);
            seenText.add(tk);
            return true;
        })
        .map((p, i) => ({ id: i, name: p.name, brand: p.brand, description: p.description, reference: p.reference, price: p.price, reserved: p.reserved, condition: p.condition, hasCard: p.hasCard, image: p.image }));

    if (products.length === 0) {
        console.warn('WARNING: 0 products after dedup.');
        fs.writeFileSync(OUT_FILE, JSON.stringify([], null, 2));
    } else {
        console.log(`✓ ${products.length} unique products saved.`);
        fs.writeFileSync(OUT_FILE, JSON.stringify(products, null, 2));
        console.log(`✓ Written to ${OUT_FILE}`);
    }
})();
