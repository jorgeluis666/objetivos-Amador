const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const puppeteer = require('puppeteer-core');
const { execFileSync } = require('child_process');

(async () => {
  if (!process.env.DASHBOARD_PASSWORD) throw Error('Missing authorized dashboard credential');
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    const response = await page.goto('https://amador.limaretail.com/', { waitUntil: 'domcontentloaded' });
    if (response.status() !== 200) throw Error('Production did not respond 200');
    const deployedHash = crypto.createHash('sha256').update(await response.buffer()).digest('hex');
    await page.waitForFunction(() => document.querySelector('#gate-submit')?.disabled === false);
    await page.type('#gate-pass', process.env.DASHBOARD_PASSWORD);
    await page.click('#gate-submit');
    await page.waitForSelector('[data-view-target="view-reports"]', { timeout: 60000 });
    await page.click('.sidebar [data-view-target="view-reports"]');
    await page.click('#view-reports [data-view-target="view-week"]');
    await page.waitForFunction(() => [...document.querySelectorAll('#week-select option')].some(o => o.value === '2026-11:8'), { timeout: 120000 });
    // Let live synchronization finish before selecting the requested report.
    await page.waitForFunction(() => /Sincronizado/.test(document.querySelector('#data-status-btn')?.textContent || ''), { timeout: 120000 });
    await page.select('#week-select', '2026-11:8');
    // Exercise the real production download handler. Replace only the native dialog
    // with Chromium's PDF writer; report DOM, styles, images and preparation are unchanged.
    await page.evaluate(() => { window.__printRequested = false; window.print = () => { window.__printRequested = true; }; });
    await page.click('#week-print');
    await page.waitForFunction(() => window.__printRequested || document.querySelector('#week-print-error'), { timeout: 45000 });
    const proof = await page.evaluate(() => ({
      requested: window.__printRequested,
      error: document.querySelector('#week-print-error')?.textContent || null,
      period: document.querySelector('#week-select').selectedOptions[0].textContent,
      images: [...document.querySelectorAll('#week-report img.rp-ad-art')].map(img => ({ name: img.alt, embedded: img.src.startsWith('data:image/'), width: img.naturalWidth, height: img.naturalHeight, hidden: img.hidden })),
      pages: document.querySelectorAll('#week-doc > section').length
    }));
    if (!proof.requested || proof.error || proof.images.length !== 3 || proof.images.some(i => !i.embedded || !i.width || i.hidden)) throw Error('Incomplete production artwork: ' + JSON.stringify(proof));
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.querySelectorAll('#week-report img')].map(img => img.decode())); });
    const pdf = Buffer.from(await page.pdf({ printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false }));
    const images = await page.$$eval('#week-report img.rp-ad-art', imgs => imgs.map(img => img.src));
    // PDF and source pixels travel only over stdin to the local validation process.
    // No report, screenshot, credential or private metric is saved/uploaded as an artifact.
    const verification = execFileSync('python', [path.join(__dirname, 'verify-production-images.py')], {
      input: JSON.stringify({ pdf: pdf.toString('base64'), images }), encoding: 'utf8', maxBuffer: 1024 * 1024
    });
    console.log('PRODUCTION_PDF', JSON.stringify({ url: 'https://amador.limaretail.com/', production_html_sha256: deployedHash, print_button_passed: true, ...JSON.parse(verification) }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
