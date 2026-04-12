/**
 * scrape-catalog.js
 * Scrapes Swiss Time USA Elefta store and writes catalog.json
 * Clicks each item to open its popup and scrapes full details + all images.
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

const POPUP_LABEL_MAP = {
    'brand':            'brand',
    'reference number': 'reference',
    'ref':              'reference',
    'series':           'series',
    'condition':        'condition',
    'box & papers':     'hasCard',
    'box and papers':   'hasCard',
    'papers':           'hasCard',
    'dial':             'dial',
    'bezel':            'bezel',
    'bracelet':         'bracelet',
    'band':             'bracelet',
    'strap':            'bracelet',
    'material':         'material',
    'case material':    'material',
    'case size':        'size',
    'size':             'size',
    'year':             'year',
    'year of purchase': 'year',
    'gender':           'gender',
    'serial':           'serialNumber',
    'serial number':    'serialNumber',
    'sku':              'sku',
    'model':            'model',
    'movement':         'movement',
    'water resistance': 'waterResistance',
    'power reserve':    'powerReserve',
    'functions':        'functions',
    'description':      'popupDescription',
};

const CARD_SELECTORS = [
    '.watch-list-item',
    '[class*="watch-list-item flex"]',
    '[class*="InventoryItem"]', '[class*="inventory-item"]',
    '[class*="listing-item"]', '[class*="product-item"]',
    '[class*="item-card"]',    '[class*="watch-item"]',
    '[class*="ProductCard"]',  '[class*="product-card"]',
    '[class*="storeItem"]',    '[class*="store-item"]'
];

const POPUP_SELECTORS = [
    '[class*="modal"]',
    '[class*="popup"]',
    '[class*="drawer"]',
    '[class*="detail"]',
    '[class*="overlay"]',
    '[role="dialog"]',
    '[aria-modal="true"]',
];

function extractBrand(name) {
    for (const [key, val] of Object.entries(BRAND_MAP)) {
        if (name.startsWith(key)) return val;
    }
    return '';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Close any open popup and wait for it to actually disappear ───────────────
async function closeAnyPopup(page, popupSel) {
    try {
        await page.evaluate(() => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            const closeSelectors = [
                '[aria-label*="close" i]', '[aria-label*="dismiss" i]',
                '[class*="close"]', '[class*="dismiss"]',
                'button[class*="modal"]', '[data-dismiss]',
            ];
            for (const sel of closeSelectors) {
                const btn = document.querySelector(sel);
                if (btn) { btn.click(); return; }
            }
        });

        // Wait for the popup to actually be gone rather than sleeping
        if (popupSel) {
            await page.waitForFunction((sel) => {
                const el = document.querySelector(sel);
                if (!el) return true;
                const rect  = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                return rect.width === 0 || rect.height === 0 ||
                       style.display === 'none' || style.visibility === 'hidden' ||
                       style.opacity === '0';
            }, { timeout: 3000 }, popupSel).catch(() => {});
        }
    } catch (_) { /* ignore */ }
}

// ── Main ─────────────────────────────────────────────────────────────────────
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

    // ── 1. Load the store ────────────────────────────────────────────────────
    console.log('Navigating to store...');
    await page.goto(STORE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    console.log('Waiting for initial render...');
    await sleep(8000);

    // ── 2. Find scroll container ─────────────────────────────────────────────
    const scrollSel = await page.evaluate(() => {
        let best = null, bestHeight = window.innerHeight;
        for (const el of document.querySelectorAll('*')) {
            const style = window.getComputedStyle(el);
            const scrollable = ['auto', 'scroll'].includes(style.overflowY) ||
                               ['auto', 'scroll'].includes(style.overflow);
            if (scrollable && el.scrollHeight > bestHeight) {
                bestHeight = el.scrollHeight; best = el;
            }
        }
        if (!best) return null;
        if (best.id) return '#' + best.id;
        const cls = (best.className || '').trim().split(/\s+/)
            .find(c => c.length > 2 && !c.startsWith('css-'));
        return cls ? '.' + cls : null;
    });
    console.log('Scroll container:', scrollSel || 'window (fallback)');

    // ── 3. Scroll until all cards are loaded ─────────────────────────────────
    console.log('Scrolling to load all watches...');
    let lastHeight = 0, stableRounds = 0, round = 0;

    while (stableRounds < 5) {
        round++;
        const heightBefore = await page.evaluate((sel) => {
            const el = sel ? document.querySelector(sel) : null;
            if (el) { el.scrollTop = el.scrollHeight; return el.scrollHeight; }
            window.scrollTo(0, document.body.scrollHeight);
            return Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
        }, scrollSel);

        await sleep(2000);

        const heightAfter = await page.evaluate((sel) => {
            const el = sel ? document.querySelector(sel) : null;
            return el ? el.scrollHeight : Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
        }, scrollSel);

        console.log(`  Scroll ${round}: ${heightBefore}px → ${heightAfter}px`);

        if (heightAfter > lastHeight) { lastHeight = heightAfter; stableRounds = 0; }
        else { stableRounds++; }
    }

    console.log(`Done scrolling after ${round} rounds. Final height: ${lastHeight}px`);

    // Scroll back to top so the first card is clickable
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(1500);

    // ── 4. Scrape basic card data ─────────────────────────────────────────────
    const rawItems = await page.evaluate((selectors, brandMap) => {
        function extractBrand(name) {
            for (const [key, val] of Object.entries(brandMap)) {
                if (name.startsWith(key)) return val;
            }
            return '';
        }

        let cards = [], usedSel = null;
        for (const sel of selectors) {
            const found = [...document.querySelectorAll(sel)];
            if (found.length > 3 && found.some(el => /\$[\d,]+/.test(el.innerText || ''))) {
                cards = found; usedSel = sel; break;
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

        return cards.map((card, i) => {
            const img = card.querySelector('img[src*="cloudfront"], img[data-src*="cloudfront"]');
            const src = img ? (img.src || img.getAttribute('data-src') || '') : '';
            if (!src || src.includes('logo_footer')) return null;

            const txt   = (card.innerText || '').trim();
            const lines = txt.split('\n').map(l => l.trim()).filter(Boolean);

            const priceMatch = txt.match(/\$[\d,]+(\.\d{2})?/);
            const price      = priceMatch ? priceMatch[0] : 'Contact for price';
            const refMatch   = txt.match(/[Rr]ef\.?\s*[:#]?\s*([\w\-\/\.]+)/);
            const reference  = refMatch ? refMatch[1].trim().replace(/\.$/, '') : '';
            const name       = lines[0] || `Item ${i}`;
            const reserved   = lines.some(l => l.toLowerCase() === 'reserved');
            const hasCard    = txt.toLowerCase().includes('box') || txt.toLowerCase().includes('papers');
            const link       = card.querySelector('a');

            card.setAttribute('data-scrape-index', String(i));

            return {
                scrapeIndex: i,
                name,
                brand:       extractBrand(name),
                description: lines[1] || '',
                reference,
                price,
                reserved,
                condition:   'Pre-Owned',
                hasCard,
                image:       src,
                href:        link ? link.href : ''
            };
        }).filter(Boolean);
    }, CARD_SELECTORS, BRAND_MAP);

    console.log(`Raw items from page: ${rawItems.length}`);

    // ── 5. Click each card, scrape the popup, merge data ─────────────────────
    console.log('\nScraping popup details for each item…');

    for (let i = 0; i < rawItems.length; i++) {
        const item = rawItems[i];
        let popupSel = null;
        process.stdout.write(`  [${i + 1}/${rawItems.length}] ${item.name.slice(0, 50)}… `);

        try {
            // Scroll card into view and click
            const clicked = await page.evaluate((idx) => {
                const card = document.querySelector(`[data-scrape-index="${idx}"]`);
                if (!card) return false;
                card.scrollIntoView({ block: 'center' });
                card.click();
                return true;
            }, item.scrapeIndex);

            if (!clicked) {
                console.log('⚠ card not found, skipping popup');
                continue;
            }

            // Wait for popup to appear and be visible — no fixed sleep
            for (const sel of POPUP_SELECTORS) {
                try {
                    await page.waitForSelector(sel, { visible: true, timeout: 5000 });
                    const visible = await page.evaluate((s) => {
                        const el = document.querySelector(s);
                        if (!el) return false;
                        const rect = el.getBoundingClientRect();
                        return rect.width > 100 && rect.height > 100;
                    }, sel);
                    if (visible) { popupSel = sel; break; }
                } catch (_) { /* try next selector */ }
            }

            if (!popupSel) {
                console.log('⚠ popup not detected');
                await closeAnyPopup(page, null);
                continue;
            }

            // Wait for at least one cloudfront image inside the popup to finish loading
            try {
                await page.waitForFunction((sel) => {
                    const popup = document.querySelector(sel);
                    if (!popup) return false;
                    const img = popup.querySelector('img[src*="cloudfront"]');
                    return img ? img.complete : true;
                }, { timeout: 4000 }, popupSel);
            } catch (_) { /* image didn't load in time, proceed anyway */ }

            // ── Scrape the popup ──────────────────────────────────────────────
            const popupData = await page.evaluate((sel, labelMap) => {
                const popup = document.querySelector(sel);
                if (!popup) return {};

                const result = {};

                // All images
                const imgs = [...popup.querySelectorAll('img')]
                    .map(img => img.src || img.getAttribute('data-src') || '')
                    .filter(src => src && src.includes('cloudfront') && !src.includes('logo'));
                if (imgs.length) result.images = [...new Set(imgs)];

                // Key-value extraction — 4 patterns
                const pairs = {};

                // Pattern A: <dt> / <dd>
                popup.querySelectorAll('dt').forEach(dt => {
                    const dd = dt.nextElementSibling;
                    if (dd && dd.tagName === 'DD') {
                        pairs[dt.innerText.trim().toLowerCase()] = dd.innerText.trim();
                    }
                });

                // Pattern B: table <th> / <td>
                popup.querySelectorAll('tr').forEach(row => {
                    const cells = [...row.querySelectorAll('th, td')];
                    if (cells.length >= 2) {
                        pairs[cells[0].innerText.trim().toLowerCase()] = cells[1].innerText.trim();
                    }
                });

                // Pattern C: labelled child elements
                popup.querySelectorAll('li, [class*="spec"], [class*="detail"], [class*="row"], [class*="field"]').forEach(el => {
                    const children = [...el.children];
                    if (children.length >= 2) {
                        const label = children[0].innerText.trim().toLowerCase().replace(/:$/, '');
                        const value = children[1].innerText.trim();
                        if (label && value && label.length < 30) pairs[label] = value;
                    }
                });

                // Pattern D: inline "Label: Value" text
                [...popup.querySelectorAll('p, span, div')].forEach(el => {
                    if (el.children.length > 2) return;
                    const text = (el.innerText || '').trim();
                    const m = text.match(/^([^:]{2,30}):\s*(.+)$/);
                    if (m) pairs[m[1].toLowerCase()] = m[2].trim();
                });

                // Map labels → field names
                for (const [rawLabel, value] of Object.entries(pairs)) {
                    const key = labelMap[rawLabel];
                    if (key) {
                        if (key === 'hasCard') {
                            result[key] = /yes|include|✓|with/i.test(value);
                        } else {
                            result[key] = value;
                        }
                    }
                }

                // Description / long text block
                const descEl = popup.querySelector(
                    '[class*="description"], [class*="desc"], [class*="notes"], [class*="detail-text"]'
                );
                if (descEl && descEl.innerText.trim().length > 20) {
                    result.popupDescription = descEl.innerText.trim();
                }

                // Price (cleaner version from popup)
                const priceEl = popup.querySelector('[class*="price"], [class*="Price"]');
                if (priceEl) {
                    const m = (priceEl.innerText || '').match(/\$[\d,]+(\.\d{2})?/);
                    if (m) result.popupPrice = m[0];
                }

                // Reference fallback
                if (!result.reference) {
                    const refMatch = popup.innerText.match(/[Rr]ef\.?\s*[:#]?\s*([\w\-\/\.]{4,20})/);
                    if (refMatch) result.reference = refMatch[1].trim().replace(/\.$/, '');
                }

                return result;
            }, popupSel, POPUP_LABEL_MAP);

            // Merge popup data into card item
            Object.assign(item, popupData);
            if (popupData.popupPrice) {
                item.price = popupData.popupPrice;
                delete item.popupPrice;
            }
            if (!item.images || !item.images.length) {
                item.images = item.image ? [item.image] : [];
            }

            process.stdout.write('✓\n');

        } catch (err) {
            process.stdout.write(`✗ (${err.message.slice(0, 60)})\n`);
        }

        // Close popup and wait for it to actually disappear before moving to next card
        await closeAnyPopup(page, popupSel);
    }

    await browser.close();

    // ── 6. Deduplicate & normalise ────────────────────────────────────────────
    const seenImg  = new Set();
    const seenText = new Set();

    const products = rawItems
        .filter(item => {
            if (JUNK.has(item.name))    return false;
            if (!item.image)             return false;
            if (seenImg.has(item.image)) return false;
            const tk = `${item.name}||${item.description}`;
            if (seenText.has(tk))        return false;
            seenImg.add(item.image);
            seenText.add(tk);
            return true;
        })
        .map((p, i) => {
            const out = {
                id:          i,
                name:        p.name,
                brand:       p.brand,
                description: p.popupDescription || p.description,
                reference:   p.reference,
                price:       p.price,
                reserved:    p.reserved,
                condition:   p.condition,
                hasCard:     p.hasCard,
                image:       p.image,
                images:      p.images && p.images.length > 1 ? p.images : undefined,
            };

            const extras = [
                'series','dial','bezel','bracelet','material','size',
                'year','gender','serialNumber','sku','model',
                'movement','waterResistance','powerReserve','functions'
            ];
            extras.forEach(k => { if (p[k]) out[k] = p[k]; });

            Object.keys(out).forEach(k => { if (out[k] === undefined) delete out[k]; });

            return out;
        });

    if (products.length === 0) {
        console.warn('\nWARNING: 0 products after dedup.');
        fs.writeFileSync(OUT_FILE, JSON.stringify([], null, 2));
    } else {
        console.log(`\n✓ ${products.length} unique products saved to ${OUT_FILE}`);
        fs.writeFileSync(OUT_FILE, JSON.stringify(products, null, 2));
    }
})();
