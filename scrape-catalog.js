/**
 * scrape-catalog.js
 * Scrapes Swiss Time USA Elefta store and writes catalog.json
 * Incremental mode: only clicks popups for items not already in catalog.json
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

// ── Load existing catalog so we can skip already-scraped items ───────────────
function loadExistingCatalog() {
    try {
        if (fs.existsSync(OUT_FILE)) {
            const data = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
            console.log(`Loaded ${data.length} existing items from catalog.json`);
            return data;
        }
    } catch (err) {
        console.warn('Could not load existing catalog, starting fresh:', err.message);
    }
    return [];
}

// ── Build a lookup key for deduplication ─────────────────────────────────────
// Uses image URL as primary key (most reliable), falls back to name+reference
function itemKey(item) {
    return item.image || `${item.name}||${item.reference || ''}`;
}

// ── Save catalog to disk (called after every new item so progress is never lost)
function saveCatalog(products) {
    const reassigned = products.map((p, i) => ({ ...p, id: i }));
    fs.writeFileSync(OUT_FILE, JSON.stringify(reassigned, null, 2));
    return reassigned;
}

// ── Normalise a raw scraped item into the final product shape ─────────────────
function normalise(p) {
    const out = {
        id:          0, // reassigned on save
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
}

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

    // ── 0. Load existing catalog ─────────────────────────────────────────────
    const existingCatalog = loadExistingCatalog();

    // Build a Set of known keys for O(1) lookup
    const existingKeys = new Set(existingCatalog.map(itemKey));

    // Also track which existing items are still live on the site
    // (we'll use this to remove items that have sold / been delisted)
    const stillLive = new Set();

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

    // ── 5. Determine which items are new vs already known ────────────────────
    const newItems      = [];
    const skippedItems  = [];

    for (const item of rawItems) {
        if (JUNK.has(item.name) || !item.image) continue;
        const key = itemKey(item);
        stillLive.add(key);
        if (existingKeys.has(key)) {
            skippedItems.push(item);
        } else {
            newItems.push(item);
        }
    }

    console.log(`\n${newItems.length} new items to scrape, ${skippedItems.length} already in catalog — skipping their popups`);

    // ── 6. Remove items from existing catalog that are no longer on the site ─
    const survivingExisting = existingCatalog.filter(p => stillLive.has(itemKey(p)));
    const removedCount = existingCatalog.length - survivingExisting.length;
    if (removedCount > 0) {
        console.log(`Removed ${removedCount} item(s) no longer listed on the site`);
    }

    // Working catalog starts as the surviving existing items
    // New items will be appended as they are scraped
    let workingCatalog = [...survivingExisting];

    // ── 7. Click popups only for new items ───────────────────────────────────
    if (newItems.length === 0) {
        console.log('Nothing new to scrape — catalog is up to date.');
    } else {
        console.log('\nScraping popup details for new items…');
    }

    // Dedup guard for new items within this run
    const seenThisRun = new Set(workingCatalog.map(itemKey));

    for (let i = 0; i < newItems.length; i++) {
        const item = newItems[i];
        let popupSel = null;
        process.stdout.write(`  [${i + 1}/${newItems.length}] ${item.name.slice(0, 50)}… `);

        try {
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

            // Wait for popup to appear and be visible
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
                } catch (_) { /* try next */ }
            }

            if (!popupSel) {
                console.log('⚠ popup not detected');
                await closeAnyPopup(page, null);
                continue;
            }

            // Wait for popup image to finish loading
            try {
                await page.waitForFunction((sel) => {
                    const popup = document.querySelector(sel);
                    if (!popup) return false;
                    const img = popup.querySelector('img[src*="cloudfront"]');
                    return img ? img.complete : true;
                }, { timeout: 4000 }, popupSel);
            } catch (_) { /* proceed anyway */ }

            // Scrape the popup
            const popupData = await page.evaluate((sel, labelMap) => {
                const popup = document.querySelector(sel);
                if (!popup) return {};

                const result = {};

                const imgs = [...popup.querySelectorAll('img')]
                    .map(img => img.src || img.getAttribute('data-src') || '')
                    .filter(src => src && src.includes('cloudfront') && !src.includes('logo'));
                if (imgs.length) result.images = [...new Set(imgs)];

                const pairs = {};

                popup.querySelectorAll('dt').forEach(dt => {
                    const dd = dt.nextElementSibling;
                    if (dd && dd.tagName === 'DD') {
                        pairs[dt.innerText.trim().toLowerCase()] = dd.innerText.trim();
                    }
                });

                popup.querySelectorAll('tr').forEach(row => {
                    const cells = [...row.querySelectorAll('th, td')];
                    if (cells.length >= 2) {
                        pairs[cells[0].innerText.trim().toLowerCase()] = cells[1].innerText.trim();
                    }
                });

                popup.querySelectorAll('li, [class*="spec"], [class*="detail"], [class*="row"], [class*="field"]').forEach(el => {
                    const children = [...el.children];
                    if (children.length >= 2) {
                        const label = children[0].innerText.trim().toLowerCase().replace(/:$/, '');
                        const value = children[1].innerText.trim();
                        if (label && value && label.length < 30) pairs[label] = value;
                    }
                });

                [...popup.querySelectorAll('p, span, div')].forEach(el => {
                    if (el.children.length > 2) return;
                    const text = (el.innerText || '').trim();
                    const m = text.match(/^([^:]{2,30}):\s*(.+)$/);
                    if (m) pairs[m[1].toLowerCase()] = m[2].trim();
                });

                for (const [rawLabel, value] of Object.entries(pairs)) {
                    const key = labelMap[rawLabel];
                    if (key) {
                        result[key] = key === 'hasCard'
                            ? /yes|include|✓|with/i.test(value)
                            : value;
                    }
                }

                const descEl = popup.querySelector(
                    '[class*="description"], [class*="desc"], [class*="notes"], [class*="detail-text"]'
                );
                if (descEl && descEl.innerText.trim().length > 20) {
                    result.popupDescription = descEl.innerText.trim();
                }

                const priceEl = popup.querySelector('[class*="price"], [class*="Price"]');
                if (priceEl) {
                    const m = (priceEl.innerText || '').match(/\$[\d,]+(\.\d{2})?/);
                    if (m) result.popupPrice = m[0];
                }

                if (!result.reference) {
                    const refMatch = popup.innerText.match(/[Rr]ef\.?\s*[:#]?\s*([\w\-\/\.]{4,20})/);
                    if (refMatch) result.reference = refMatch[1].trim().replace(/\.$/, '');
                }

                return result;
            }, popupSel, POPUP_LABEL_MAP);

            Object.assign(item, popupData);
            if (popupData.popupPrice) {
                item.price = popupData.popupPrice;
                delete item.popupPrice;
            }
            if (!item.images || !item.images.length) {
                item.images = item.image ? [item.image] : [];
            }

            // Only add if not a duplicate within this run
            const key = itemKey(item);
            if (!seenThisRun.has(key)) {
                seenThisRun.add(key);
                workingCatalog.push(normalise(item));

                // ── Save after every single new item so progress is never lost ──
                workingCatalog = saveCatalog(workingCatalog);
            }

            process.stdout.write('✓\n');

        } catch (err) {
            process.stdout.write(`✗ (${err.message.slice(0, 60)})\n`);
        }

        await closeAnyPopup(page, popupSel);
    }

    await browser.close();

    // ── 8. Final save with clean IDs ─────────────────────────────────────────
    workingCatalog = saveCatalog(workingCatalog);

    console.log(`\n✓ Done. catalog.json has ${workingCatalog.length} items.`);
    if (newItems.length > 0) {
        console.log(`  Added:   ${newItems.length} new`);
    }
    if (removedCount > 0) {
        console.log(`  Removed: ${removedCount} no longer listed`);
    }
    console.log(`  Kept:    ${survivingExisting.length} existing`);

})();
