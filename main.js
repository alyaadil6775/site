/**
 * main.js
 * ============================================================
 * Saleh Jewelers — site-wide JavaScript
 *
 * Responsibilities:
 *   1. Dynamically inject header.html and footer.html
 *   2. Mobile navigation toggle (hamburger ↔ X)
 *   3. Newsletter popup modal logic
 * ============================================================
 */

/* ── 1. Component Loader ──────────────────────────────────── */

/**
 * Fetches an HTML partial and injects it into a target element.
 * @param {string} file        - Path to the partial (e.g. 'header.html')
 * @param {string} targetId    - ID of the placeholder element in index.html
 * @param {Function} [callback]- Optional function to run after injection
 */
async function loadComponent(file, targetId, callback) {
    try {
        const response = await fetch(file);
        if (!response.ok) throw new Error(`Failed to load ${file}: ${response.status}`);
        const html = await response.text();
        document.getElementById(targetId).innerHTML = html;
        if (typeof callback === 'function') callback();
    } catch (err) {
        console.error(err);
    }
}

/* ── 2. Mobile Navigation ─────────────────────────────────── */

function initMobileMenu() {
    const menu     = document.querySelector('#mobile-menu');
    const navLinks = document.querySelector('#nav-list');

    if (!menu || !navLinks) return;

    // Toggle sidebar open / closed
    menu.addEventListener('click', () => {
        menu.classList.toggle('is-active');
        navLinks.classList.toggle('active');
    });

    // Close sidebar when any nav link is clicked
    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            menu.classList.remove('is-active');
            navLinks.classList.remove('active');
        });
    });
}

/* ── 3. Newsletter Popup Modal ────────────────────────────── */

const modal = document.getElementById('newsletterModal');

function openModal() {
    if (!modal) return;
    modal.style.display       = 'block';
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    if (!modal) return;
    modal.style.display       = 'none';
    document.body.style.overflow = 'auto';
}

// Expose closeModal globally so the inline onclick in the HTML still works
window.closeModal = closeModal;

// Open modal 1 second after the page fully loads
window.addEventListener('load', () => {
    setTimeout(openModal, 1000);
});

// Close modal when clicking the dark overlay (outside the box)
window.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
});

// Listen for the "closeMe" postMessage from the Customer.html iframe
window.addEventListener('message', (event) => {
    if (event.data === 'closeMe') closeModal();
}, false);

/* ── Bootstrap ────────────────────────────────────────────── */

// Load header first, then initialise the mobile menu once it exists in the DOM.
// Footer has no JS dependencies so it loads independently.
loadComponent('components/header/header.html', 'site-header', initMobileMenu);
loadComponent('components/footer/footer.html', 'site-footer');
