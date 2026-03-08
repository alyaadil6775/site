/* assets/css/main.css */
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

:root {
    --primary: #F5F0EB;
    --secondary: #E8DCCC;
    --accent: #C9A87A;
    --accent-dark: #A6895E;
    --text: #2C2C2C;
    --text-light: #5A5A5A;
    --white: #FFFFFF;
    --light-gray: #F9F7F4;
    --border: rgba(201, 168, 122, 0.2);
    --shadow: 0 5px 15px rgba(0, 0, 0, 0.05);
    --transition: all 0.3s ease;
}

body {
    font-family: 'Montserrat', sans-serif;
    line-height: 1.6;
    color: var(--text);
    background-color: var(--primary);
    overflow-x: hidden;
}

h1, h2, h3, h4 {
    font-family: 'Playfair Display', serif;
    font-weight: 600;
    color: var(--text);
}

.container {
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 20px;
}

/* Header Styles */
header {
    background-color: var(--white);
    position: sticky;
    top: 0;
    z-index: 1000;
    box-shadow: var(--shadow);
    transition: var(--transition);
}

.top-header {
    padding: 1.2rem 0;
    border-bottom: 1px solid var(--border);
}

.header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.logo {
    font-family: 'Playfair Display', serif;
    font-size: 2.2rem;
    font-weight: 700;
    color: var(--accent-dark);
    text-decoration: none;
    letter-spacing: 1.5px;
    display: flex;
    align-items: center;
    gap: 10px;
}

.logo-icon {
    font-size: 1.8rem;
    color: var(--accent);
}

.logo span {
    color: var(--text);
}

.contact-header {
    display: flex;
    align-items: center;
    gap: 1.8rem;
}

.contact-header a {
    color: var(--text);
    text-decoration: none;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    transition: var(--transition);
    font-weight: 500;
}

.contact-header a:hover {
    color: var(--accent);
}

/* Navigation Bar */
.navbar {
    padding: 0.8rem 0;
    background-color: var(--white);
}

.nav-container {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.nav-links {
    display: flex;
    list-style: none;
    gap: 2.5rem;
}

.nav-links a {
    text-decoration: none;
    color: var(--text);
    font-family: 'Montserrat', sans-serif;
    font-weight: 500;
    font-size: 1rem;
    padding: 0.5rem 0;
    position: relative;
    transition: var(--transition);
}

.nav-links a:after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    width: 0;
    height: 2px;
    background-color: var(--accent);
    transition: var(--transition);
}

.nav-links a:hover {
    color: var(--accent);
}

.nav-links a:hover:after {
    width: 100%;
}

.nav-links a.active {
    color: var(--accent);
}

.nav-links a.active:after {
    width: 100%;
}

.nav-button {
    background-color: var(--accent);
    color: var(--white);
    border: none;
    padding: 0.7rem 1.8rem;
    font-family: 'Montserrat', sans-serif;
    font-weight: 600;
    border-radius: 50px;
    cursor: pointer;
    transition: var(--transition);
    font-size: 0.95rem;
}

.nav-button:hover {
    background-color: var(--accent-dark);
    transform: translateY(-2px);
}

.mobile-menu-btn {
    display: none;
    background: none;
    border: none;
    font-size: 1.5rem;
    color: var(--text);
    cursor: pointer;
    z-index: 1001;
}

/* Mobile Navigation Menu */
.mobile-nav-overlay {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    z-index: 998;
}

.mobile-nav-overlay.active {
    display: block;
}

.mobile-nav-menu {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    width: 280px;
    height: 100vh;
    background-color: var(--white);
    z-index: 999;
    box-shadow: 0 0 20px rgba(0, 0, 0, 0.1);
    overflow-y: auto;
    transform: translateX(-100%);
    transition: transform 0.3s ease;
}

.mobile-nav-menu.active {
    display: block;
    transform: translateX(0);
}

.mobile-nav-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid var(--border);
    background-color: var(--white);
    position: sticky;
    top: 0;
    z-index: 1;
}

.mobile-nav-logo {
    font-family: 'Playfair Display', serif;
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--accent-dark);
    text-decoration: none;
}

.mobile-nav-close {
    background: none;
    border: none;
    font-size: 1.5rem;
    color: var(--text);
    cursor: pointer;
}

.mobile-nav-links {
    list-style: none;
    padding: 0;
    margin: 0;
}

.mobile-nav-links li {
    border-bottom: 1px solid var(--border);
}

.mobile-nav-links a {
    display: block;
    padding: 1.2rem 1.5rem;
    text-decoration: none;
    color: var(--text);
    font-weight: 500;
    transition: var(--transition);
}

.mobile-nav-links a:hover,
.mobile-nav-links a.active {
    color: var(--accent);
    background-color: rgba(201, 168, 122, 0.05);
}

/* Hero Section */
.hero {
    background: linear-gradient(rgba(245, 240, 235, 0.9), rgba(245, 240, 235, 0.95)), url('https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1920&q=80');
    background-size: cover;
    background-position: center;
    padding: 7rem 0 5rem;
    text-align: center;
    position: relative;
    overflow: hidden;
}

.hero:before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: radial-gradient(circle at 30% 50%, rgba(201, 168, 122, 0.1) 0%, transparent 60%);
    pointer-events: none;
}

.hero h1 {
    font-size: 3.8rem;
    margin-bottom: 1.5rem;
    letter-spacing: 1px;
    line-height: 1.2;
}

.hero p {
    font-size: 1.2rem;
    max-width: 700px;
    margin: 0 auto 3rem;
    color: var(--text-light);
}

.cta-button {
    display: inline-block;
    background-color: var(--accent);
    color: var(--white);
    padding: 1.1rem 2.8rem;
    font-family: 'Montserrat', sans-serif;
    font-weight: 600;
    text-decoration: none;
    border-radius: 50px;
    font-size: 1.1rem;
    letter-spacing: 1px;
    transition: var(--transition);
    border: 2px solid var(--accent);
    position: relative;
    overflow: hidden;
    z-index: 1;
}

.cta-button:before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 0%;
    height: 100%;
    background-color: var(--white);
    transition: var(--transition);
    z-index: -1;
}

.cta-button:hover:before {
    width: 100%;
}

.cta-button:hover {
    color: var(--accent);
}

/* Contact Info Section */
.contact-info {
    padding: 6rem 0;
    background-color: var(--white);
}

.section-title {
    text-align: center;
    font-size: 2.8rem;
    margin-bottom: 1rem;
    position: relative;
}

.section-subtitle {
    text-align: center;
    color: var(--text-light);
    max-width: 700px;
    margin: 0 auto 4rem;
    font-size: 1.1rem;
}

.contact-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 2.5rem;
    margin-top: 2rem;
}

.contact-card {
    background-color: var(--light-gray);
    padding: 3rem 2.5rem;
    border-radius: 10px;
    box-shadow: var(--shadow);
    text-align: center;
    transition: var(--transition);
    border: 1px solid transparent;
    position: relative;
    overflow: hidden;
}

.contact-card:before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 5px;
    background-color: var(--accent);
}

.contact-card:hover {
    transform: translateY(-10px);
    box-shadow: 0 15px 30px rgba(0, 0, 0, 0.08);
    border-color: var(--border);
}

.contact-icon {
    font-size: 2.8rem;
    color: var(--accent);
    margin-bottom: 1.8rem;
    height: 80px;
    width: 80px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: rgba(201, 168, 122, 0.1);
    border-radius: 50%;
    margin: 0 auto 1.8rem;
}

.contact-card h3 {
    font-size: 1.6rem;
    margin-bottom: 1rem;
}

.contact-card p {
    color: var(--text-light);
    margin-bottom: 1.8rem;
    font-size: 0.95rem;
}

.contact-detail {
    font-size: 1.3rem;
    color: var(--text);
    font-weight: 600;
}

/* Collections Section */
.collections {
    padding: 6rem 0;
    background-color: var(--light-gray);
}

.collection-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 2.5rem;
    margin-top: 3rem;
}

.collection-item {
    text-align: center;
    padding: 2.5rem 2rem;
    border-radius: 10px;
    background-color: var(--white);
    transition: var(--transition);
    box-shadow: var(--shadow);
    border: 1px solid transparent;
}

.collection-item:hover {
    transform: translateY(-5px);
    border-color: var(--border);
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
}

.collection-icon {
    font-size: 3rem;
    color: var(--accent);
    margin-bottom: 1.8rem;
    height: 90px;
    width: 90px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: rgba(201, 168, 122, 0.1);
    border-radius: 50%;
    margin: 0 auto 1.8rem;
}

.collection-item h3 {
    font-size: 1.6rem;
    margin-bottom: 1rem;
}

.collection-item p {
    color: var(--text-light);
}

/* Services Section */
.services {
    padding: 6rem 0;
    background-color: var(--white);
}

.services-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 2.5rem;
    margin-top: 3rem;
}

.service-item {
    background-color: var(--light-gray);
    padding: 2.8rem;
    border-radius: 10px;
    box-shadow: var(--shadow);
    border: 1px solid transparent;
    transition: var(--transition);
}

.service-item:hover {
    border-color: var(--border);
}

.service-item h3 {
    font-size: 1.6rem;
    margin-bottom: 1.8rem;
    display: flex;
    align-items: center;
    gap: 1.2rem;
    color: var(--accent-dark);
}

.service-item ul {
    list-style-type: none;
    padding-left: 0;
}

.service-item li {
    padding: 0.8rem 0;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 1rem;
}

.service-item li i {
    color: var(--accent);
    font-size: 0.9rem;
}

/* Timepieces Section */
.timepieces {
    padding: 6rem 0;
    background-color: var(--light-gray);
    position: relative;
    overflow: hidden;
}

.timepieces:before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: radial-gradient(circle at 70% 30%, rgba(201, 168, 122, 0.05) 0%, transparent 50%);
    pointer-events: none;
}

.timepiece-content {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 4rem;
    align-items: center;
    margin-top: 3rem;
}

.timepiece-text {
    padding-right: 2rem;
}

.brand-highlight {
    display: inline-flex;
    align-items: center;
    background-color: rgba(201, 168, 122, 0.1);
    padding: 0.8rem 1.5rem;
    border-radius: 50px;
    margin-top: 1.5rem;
    font-weight: 600;
    color: var(--accent-dark);
}

.timepiece-image {
    background: linear-gradient(rgba(245, 240, 235, 0.9), rgba(245, 240, 235, 0.95)), url('https://images.unsplash.com/photo-1523170335258-f5ed11844a49?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1180&q=80');
    background-size: cover;
    background-position: center;
    height: 400px;
    border-radius: 10px;
    box-shadow: var(--shadow);
}

/* Location Section */
.location {
    padding: 6rem 0;
    background-color: var(--white);
}

.location-content {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 4rem;
    margin-top: 3rem;
    align-items: start;
}

.location-info {
    padding-right: 2rem;
}

.hours-list {
    list-style-type: none;
    margin-top: 1.5rem;
}

.hours-list li {
    display: flex;
    justify-content: space-between;
    padding: 1rem 0;
    border-bottom: 1px solid var(--border);
}

.map-container {
    height: 400px;
    border-radius: 10px;
    overflow: hidden;
    box-shadow: var(--shadow);
    background: linear-gradient(rgba(245, 240, 235, 0.9), rgba(245, 240, 235, 0.95)), url('https://plus.unsplash.com/premium_photo-1709033404514-c3953af680b4?q=80&w=774&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D');
    background-size: cover;
    background-position: center;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
}

.map-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(232, 220, 204, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
}

/* Newsletter Section */
.newsletter {
    padding: 6rem 0;
    background-color: var(--secondary);
    text-align: center;
}

.newsletter h2 {
    color: var(--text);
}

.newsletter p {
    max-width: 600px;
    margin: 1.5rem auto 3rem;
    color: var(--text-light);
}

.newsletter-form {
    max-width: 500px;
    margin: 0 auto;
}

.newsletter-form form {
    display: flex;
    flex-direction: column;
    gap: 1.8rem;
}

.form-group {
    display: flex;
    flex-direction: column;
    text-align: left;
}

.form-group label {
    margin-bottom: 0.8rem;
    color: var(--text);
    font-weight: 500;
}

.form-group input {
    padding: 1.1rem 1.5rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background-color: var(--white);
    color: var(--text);
    font-size: 1rem;
    transition: var(--transition);
}

.form-group input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(201, 168, 122, 0.2);
}

.newsletter-button {
    background-color: var(--accent);
    color: var(--white);
    border: none;
    padding: 1.2rem 2.5rem;
    font-family: 'Montserrat', sans-serif;
    font-weight: 600;
    font-size: 1.1rem;
    border-radius: 50px;
    cursor: pointer;
    transition: var(--transition);
    margin-top: 1rem;
}

.newsletter-button:hover {
    background-color: var(--accent-dark);
    transform: translateY(-3px);
    box-shadow: 0 7px 15px rgba(166, 137, 94, 0.2);
}

.form-note {
    font-size: 0.9rem;
    color: var(--text-light);
    margin-top: 1.5rem;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 1rem;
}

.form-note span {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
}

/* Footer */
footer {
    background-color: var(--white);
    padding: 4rem 0 2.5rem;
    border-top: 1px solid var(--border);
}

.footer-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2.5rem;
}

.footer-logo {
    font-family: 'Playfair Display', serif;
    font-size: 2.2rem;
    font-weight: 700;
    color: var(--accent-dark);
    display: flex;
    align-items: center;
    gap: 10px;
}

.footer-links {
    display: flex;
    gap: 2.5rem;
    flex-wrap: wrap;
    justify-content: center;
}

.footer-links a {
    color: var(--text);
    text-decoration: none;
    transition: var(--transition);
    font-weight: 500;
    position: relative;
}

.footer-links a:after {
    content: '';
    position: absolute;
    bottom: -5px;
    left: 0;
    width: 0;
    height: 2px;
    background-color: var(--accent);
    transition: var(--transition);
}

.footer-links a:hover {
    color: var(--accent);
}

.footer-links a:hover:after {
    width: 100%;
}

.social-icons {
    display: flex;
    gap: 1.5rem;
    margin-top: 1rem;
}

.social-icons a {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background-color: var(--light-gray);
    color: var(--text);
    transition: var(--transition);
}

.social-icons a:hover {
    background-color: var(--accent);
    color: var(--white);
    transform: translateY(-3px);
}

.copyright {
    margin-top: 3rem;
    padding-top: 2rem;
    border-top: 1px solid var(--border);
    width: 100%;
    color: var(--text-light);
    font-size: 0.9rem;
    text-align: center;
}

/* Responsive Styles */
@media (max-width: 992px) {
    .hero h1 {
        font-size: 3rem;
    }
    
    .section-title {
        font-size: 2.4rem;
    }
    
    .contact-grid, .collection-grid, .services-grid {
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    }
    
    .nav-links {
        gap: 1.8rem;
    }
}

@media (max-width: 768px) {
    .header-content {
        flex-direction: column;
        gap: 1.5rem;
    }
    
    .contact-header {
        flex-wrap: wrap;
        justify-content: center;
    }
    
    /* Mobile Navigation - Hide desktop nav, show mobile menu button */
    .nav-links {
        display: none;
    }
    
    .mobile-menu-btn {
        display: block;
    }
    
    .nav-button {
        display: none;
    }
    
    .hero {
        padding: 5rem 0 3rem;
    }
    
    .hero h1 {
        font-size: 2.5rem;
    }
    
    .section-title {
        font-size: 2rem;
    }
    
    .location-content, .timepiece-content {
        grid-template-columns: 1fr;
        gap: 3rem;
    }
    
    .location-info {
        padding-right: 0;
    }
    
    .timepiece-text {
        padding-right: 0;
    }
    
    .footer-links {
        flex-direction: column;
        align-items: center;
        gap: 1.5rem;
    }
}

@media (max-width: 480px) {
    .hero h1 {
        font-size: 2rem;
    }
    
    .contact-grid, .collection-grid, .services-grid {
        grid-template-columns: 1fr;
    }
    
    .contact-card, .service-item {
        padding: 2.5rem 1.8rem;
    }
    
    .cta-button, .newsletter-button {
        padding: 1rem 2rem;
    }
    
    .mobile-nav-menu {
        width: 100%;
    }
}
