/**
 * scrape-catalog.js
 * ===========================================
 * Scrapes product listings from the Swiss Time USA Elefta store
 * and writes the data to catalog.json in the repo root.
 *
 * Run locally:
 *   npm install
 *   node scrape-catalog.js
 *
 * Run automatically: GitHub Actions runs this every 2 hours.
 * ===========================================
 */

const puppeteer = require('puppeteer');
const fs        = require('fs');
const path      = require('path');

const STORE_URL = 'https://swisstimeusa.elefta.store/store/3f6a81';
// Always write catalog.json to the repo root regardless of where script lives
const OUT_FILE  = path.join(__dirname, 'catalog.json');

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
    await page.setViewport({ width: 1400, height: 900 });
    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/120.0.0.0 Safari/537.36'
    );

    console.log(`Navigating to ${STORE_URL} ...`);
    await page.goto(STORE_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    console.log('Waiting for JS to render products...');
    await new Promise(r => setTimeout(r, 8000));

    // Scroll to bottom to trigger lazy-loaded images
    await page.evaluate(async () => {
        await new Promise(resolve => {
            let total = 0;
            const dist = 400;
            const timer = setInterval(() => {
                window.scrollBy(0, dist);
                total += dist;
                if (total >= document.body.scrollHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 150);
        });
    });
    await new Promise(r => setTimeout(r, 3000));

    // Scrape all rendered product cards
    const products = await page.evaluate(() => {
        const results = [];

        // Try common card selectors Elefta might use
        const selectors = [
            '[class*="product-card"]',
            '[class*="ProductCard"]',
            '[class*="item-card"]',
            '[class*="watch-card"]',
            '[class*="inventory-item"]',
            '[class*="listing-item"]',
            '[data-product]',
            '[class*="card"]:not(header):not(footer)'
        ];

        let cards = [];
        for (const sel of selectors) {
            const found = document.querySelectorAll(sel);
            if (found.length > 2) {
                cards = Array.from(found);
                console.log('Matched selector:', sel, '- count:', found.length);
                break;
            }
        }

        // Fallback: find elements containing price + reference text
        if (cards.length === 0) {
            cards = Array.from(document.querySelectorAll('*')).filter(el => {
                const t = el.innerText || '';
                return (t.includes('$') || t.includes('Ref')) &&
                       el.children.length >= 2 &&
                       el.children.length <= 15;
            });
        }

        cards.forEach((card, i) => {
            const text = card.innerText || '';
            if (text.trim().length < 5) return;

            // Extract fields via regex
            const priceMatch = text.match(/\$[\d,]+(\.\d{2})?/);
            const refMatch   = text.match(/[Rr]ef\.?\s*[:#]?\s*([\w\-\/]+)/);
            const lines      = text.split('\n').map(l => l.trim()).filter(Boolean);

            // Collect all image srcs in card
            const imgs = Array.from(card.querySelectorAll('img'))
                .map(img => img.src || img.getAttribute('data-src') || '')
                .filter(s => s && !s.startsWith('data:') && s.length > 10);

            const link = card.querySelector('a');

            results.push({
                id:        i,
                name:      lines[0] || `Watch ${i + 1}`,
                brand:     lines[1] && lines[1].length < 40 ? lines[1] : '',
                reference: refMatch ? refMatch[1].trim() : '',
                price:     priceMatch ? priceMatch[0] : 'Contact for price',
                image:     imgs[0] || '',
                images:    imgs,
                details:   lines,
                href:      link ? link.href : '',
                rawText:   text.substring(0, 600)
            });
        });

        return results;
    });

    await browser.close();

    if (products.length === 0) {
        console.warn('WARNING: 0 products found.');
        console.warn('The page structure may have changed or the site blocked the scraper.');
        // Write empty array so the site shows a proper empty state rather than erroring
        fs.writeFileSync(OUT_FILE, JSON.stringify([], null, 2));
    } else {
        console.log(`✓ Found ${products.length} products.`);
        fs.writeFileSync(OUT_FILE, JSON.stringify(products, null, 2));
        console.log(`✓ Saved to ${OUT_FILE}`);
    }
})();
