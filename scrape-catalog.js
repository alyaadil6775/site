/**
 * scrape-catalog.js
 * Scrapes Swiss Time USA Elefta store.
 * Phase 1: scroll full listing page, collect card links + thumbnail
 * Phase 2: visit each detail page, extract full specs + all images
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
    'Audemars': 'Audemars Piguet', 'IWC': 'IWC', 'TAG': 'TAG Heuer',
    'AP': 'Audemars Piguet', 'Richard': 'Richard Mille', 'Hublot': 'Hublot',
    'Panerai': 'Panerai', 'Tudor': 'Tudor', 'Grand Seiko': 'Grand Seiko',
    'Seiko': 'Seiko', 'Vacheron': 'Vacheron Constantin', 'Jaeger': 'Jaeger-LeCoultre'
};

function extractBrand(name) {
    for (const [key, val] of Object.entries(BRAND_MAP)) {
        if (name.startsWith(key)) return val;
    }
    return '';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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

    // ── PHASE 1: Load full listing page ────────────────────────────
    console.log('Navigating to store listing...');
    await page.goto(STORE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(8000);

    // Find scroll container
    const scrollSel = await page.evaluate(() => {
        let best = null, bestH = window.innerHeight;
        for (const el of document.querySelectorAll('*')) {
            const s = window.getComputedStyle(el);
            if (['auto','scroll'].includes(s.overflowY) || ['auto','scroll'].includes(s.overflow)) {
                if (el.scrollHeight > bestH) { bestH = el.scrollHeight; best = el; }
            }
        }
        if (!best) return null;
        if (best.id) return '#' + best.id;
        const cls = (best.className||'').trim().split(/\s+/).find(c => c.length > 2 && !c.startsWith('css-'));
        return cls ? '.' + cls : null;
    });
    console.log('Scroll container:', scrollSel || 'window');

    // Scroll until page stops growing
    console.log('Scrolling to load all items...');
    let lastH = 0, stable = 0, r = 0;
    while (stable < 5) {
        r++;
        const hBefore = await page.evaluate((sel) => {
            const el = sel ? document.querySelector(sel) : null;
            if (el) { el.scrollTop = el.scrollHeight; return el.scrollHeight; }
            window.scrollTo(0, document.body.scrollHeight);
            return Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
        }, scrollSel);
        await sleep(2000);
        const hAfter = await page.evaluate((sel) => {
            const el = sel ? document.querySelector(sel) : null;
            return el ? el.scrollHeight : Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
        }, scrollSel);
        console.log(`  Scroll ${r}: ${hBefore}px → ${hAfter}px`);
        if (hAfter > lastH) { lastH = hAfter; stable = 0; } else { stable++; }
    }
    console.log(`All items loaded. Height: ${lastH}px`);
    await sleep(2000);

    // Collect card stubs — just enough to know what to visit
    const CARD_SELS = [
        '.watch-list-item', '[class*="watch-list-item flex"]',
        '[class*="InventoryItem"]', '[class*="inventory-item"]',
        '[class*="listing-item"]', '[class*="product-item"]',
        '[class*="item-card"]', '[class*="watch-item"]',
        '[class*="ProductCard"]', '[class*="product-card"]',
        '[class*="storeItem"]', '[class*="store-item"]'
    ];

    const cardStubs = await page.evaluate((sels) => {
        let cards = [];
        let usedSel = null;

        // Log counts for all selectors to diagnose which one hits
        for (const sel of sels) {
            const found = [...document.querySelectorAll(sel)];
            if (found.length > 0) console.log('[page] sel', sel, '->', found.length);
            // Accept if it finds cards — with OR without price check (price may lazy-render)
            if (found.length > 3 && !usedSel) {
                const withPrice = found.filter(el => /\$[\d,]+/.test(el.innerText||''));
                if (withPrice.length > 3) { cards = withPrice; usedSel = sel + ' (with price)'; break; }
                if (found.length > 10)    { cards = found;      usedSel = sel + ' (no price filter)'; break; }
            }
        }

        // Fallback: any element with CDN image
        if (!cards.length) {
            usedSel = 'fallback';
            cards = [...document.querySelectorAll('*')].filter(el => {
                if (el.children.length < 1 || el.children.length > 25) return false;
                return el.querySelector('img[src*="cloudfront"]');
            });
        }

        console.log('[page] used selector:', usedSel, '| cards:', cards.length);
        return cards.map(card => {
            const img  = card.querySelector('img[src*="cloudfront"], img[data-src*="cloudfront"]');
            const src  = img ? (img.src || img.getAttribute('data-src') || '') : '';
            const link = card.querySelector('a');
            const txt  = (card.innerText||'').trim();
            const lines = txt.split('\n').map(l=>l.trim()).filter(Boolean);
            const priceMatch = txt.match(/\$[\d,]+(\.\d{2})?/);
            return {
                name:      lines[0] || '',
                price:     priceMatch ? priceMatch[0] : 'Contact for price',
                image:     src,
                href:      link ? link.href : '',
                reserved:  lines.some(l => l.toLowerCase() === 'reserved'),
            };
        }).filter(c => c.image && !c.image.includes('logo_footer') && c.href);
    }, CARD_SELS);

    console.log(`Found ${cardStubs.length} cards. Starting detail scrape...`);

    // Deduplicate stubs by href before visiting
    const seenHref = new Set();
    const uniqueStubs = cardStubs.filter(c => {
        if (seenHref.has(c.href)) return false;
        seenHref.add(c.href); return true;
    });
    console.log(`Unique detail pages to visit: ${uniqueStubs.length}`);

    // ── PHASE 2: Visit each detail page ────────────────────────────
    const products = [];

    for (let i = 0; i < uniqueStubs.length; i++) {
        const stub = uniqueStubs[i];
        if (JUNK.has(stub.name)) continue;

        console.log(`  [${i+1}/${uniqueStubs.length}] ${stub.name}`);

        try {
            await page.goto(stub.href, { waitUntil: 'networkidle2', timeout: 30000 });
            await sleep(2500);

            const detail = await page.evaluate(() => {
                // ── Images ──────────────────────────────────────────
                // Grab all cloudfront images on the page (thumbnails + main)
                const allImgs = [...document.querySelectorAll('img[src*="cloudfront"]')]
                    .map(img => img.src)
                    .filter(src => !src.includes('logo_footer'));
                // Deduplicate while preserving order
                const images = [...new Set(allImgs)];

                // ── Price ────────────────────────────────────────────
                const bodyTxt = document.body.innerText || '';
                const priceMatch = bodyTxt.match(/\$[\d,]+(\.\d{2})?/);
                const price = priceMatch ? priceMatch[0] : '';

                // ── SKU ──────────────────────────────────────────────
                const skuMatch = bodyTxt.match(/SKU[:\s]+([A-Z0-9]+)/i);
                const sku = skuMatch ? skuMatch[1] : '';

                // ── Full name / title ────────────────────────────────
                // Usually in an h1 or the largest heading
                const h1 = document.querySelector('h1, h2, [class*="title"], [class*="name"]');
                const fullName = h1 ? h1.innerText.trim() : '';

                // ── Specs table ──────────────────────────────────────
                // Elefta renders specs as label/value pairs in a table or dl
                const specs = {};

                // Strategy 1: table rows with 2 cells
                document.querySelectorAll('tr').forEach(row => {
                    const cells = row.querySelectorAll('td, th');
                    if (cells.length === 2) {
                        const key = cells[0].innerText.trim();
                        const val = cells[1].innerText.trim();
                        if (key && val) specs[key] = val;
                    }
                });

                // Strategy 2: definition list
                document.querySelectorAll('dl').forEach(dl => {
                    const dts = [...dl.querySelectorAll('dt')];
                    const dds = [...dl.querySelectorAll('dd')];
                    dts.forEach((dt, i) => {
                        if (dds[i]) specs[dt.innerText.trim()] = dds[i].innerText.trim();
                    });
                });

                // Strategy 3: adjacent sibling divs/spans used as label+value
                // (common in React/MUI grids)
                document.querySelectorAll('[class*="spec"], [class*="detail"], [class*="attribute"], [class*="property"], [class*="field"]').forEach(el => {
                    const children = [...el.children];
                    if (children.length === 2) {
                        const key = children[0].innerText.trim();
                        const val = children[1].innerText.trim();
                        if (key && val && key.length < 40) specs[key] = val;
                    }
                });

                // Strategy 4: scan all text for known label patterns
                const labelPatterns = [
                    'Ref. Number', 'Reference', 'Brand', 'Series', 'Model', 'Serial Number',
                    'Dial', 'Bezel', 'Bracelet', 'Material', 'Gender', 'Category',
                    'Size', 'Metal', 'Condition', 'Papers', 'Warranty Date', 'Link Count',
                    'Year', 'Case Size', 'Movement', 'Water Resistance', 'Functions'
                ];
                const allEls = [...document.querySelectorAll('*')];
                allEls.forEach(el => {
                    if (el.children.length > 0) return; // leaf nodes only
                    const txt = el.innerText.trim();
                    for (const label of labelPatterns) {
                        if (txt === label) {
                            // Look at next sibling or parent's next child
                            const next = el.nextElementSibling;
                            if (next && next.children.length === 0) {
                                specs[label] = next.innerText.trim();
                            }
                        }
                    }
                });

                // ── Reserved ─────────────────────────────────────────
                const reserved = /reserved/i.test(bodyTxt);

                // ── hasCard ──────────────────────────────────────────
                const hasCard = /\bcard\b|\bpapers?\b/i.test(bodyTxt);

                return { fullName, price, sku, images, specs, reserved, hasCard };
            });

            // Build the product record
            const name  = detail.fullName || stub.name;
            const brand = extractBrand(name) || specs_val(detail.specs, 'Brand') || '';

            function specs_val(specs, ...keys) {
                for (const k of keys) {
                    for (const sk of Object.keys(specs)) {
                        if (sk.toLowerCase().includes(k.toLowerCase())) return specs[sk];
                    }
                }
                return '';
            }

            products.push({
                id:          i,
                name,
                brand:       brand || extractBrand(stub.name),
                sku:         detail.sku || '',
                price:       detail.price || stub.price,
                reserved:    detail.reserved || stub.reserved,
                condition:   specs_val(detail.specs, 'Condition') || 'Pre-Owned',
                hasCard:     detail.hasCard,
                // Core specs
                reference:   specs_val(detail.specs, 'Ref. Number', 'Reference') || '',
                series:      specs_val(detail.specs, 'Series', 'Model') || '',
                serialNumber:specs_val(detail.specs, 'Serial') || '',
                dial:        specs_val(detail.specs, 'Dial') || '',
                bezel:       specs_val(detail.specs, 'Bezel') || '',
                bracelet:    specs_val(detail.specs, 'Bracelet', 'Strap') || '',
                material:    specs_val(detail.specs, 'Material', 'Metal') || '',
                gender:      specs_val(detail.specs, 'Gender') || '',
                size:        specs_val(detail.specs, 'Size', 'Case Size') || '',
                year:        specs_val(detail.specs, 'Year', 'Warranty Date') || '',
                // All remaining specs as a flat object for future use
                specs:       detail.specs,
                // Images — first is primary, rest are gallery
                image:       detail.images[0] || stub.image,
                images:      detail.images,
            });

        } catch (err) {
            console.warn(`  ⚠ Failed to scrape ${stub.href}: ${err.message}`);
            // Fall back to stub data so we don't lose the item entirely
            products.push({
                id:        i,
                name:      stub.name,
                brand:     extractBrand(stub.name),
                price:     stub.price,
                reserved:  stub.reserved,
                condition: 'Pre-Owned',
                hasCard:   false,
                image:     stub.image,
                images:    [stub.image],
                reference: '', series: '', sku: '', specs: {}
            });
        }
    }

    await browser.close();

    // Final dedup by image (shouldn't be needed but just in case)
    const seenImg = new Set();
    const final = products.filter(p => {
        if (!p.image || JUNK.has(p.name)) return false;
        if (seenImg.has(p.image)) return false;
        seenImg.add(p.image); return true;
    }).map((p, i) => ({ ...p, id: i }));

    console.log(`\n✓ ${final.length} products scraped with full details.`);
    fs.writeFileSync(OUT_FILE, JSON.stringify(final, null, 2));
    console.log(`✓ Written to ${OUT_FILE}`);
})();
