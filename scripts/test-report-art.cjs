const assert = require('node:assert/strict');
const path = require('node:path');
const { embedReportArt } = require('./embed-report-art.cjs');
const puppeteer = require('puppeteer-core');
const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const uri = `data:image/png;base64,${pixel}`;
const ids = ['drive_file_one', 'drive_file_two', 'drive_file_three'];

(async () => {
  let requests = 0;
  const snapshot = { artes: { piezas: Object.fromEntries(ids.map(id => [id, { id }])) } };
  const result = await embedReportArt(snapshot, async () => {
    requests++;
    return new Response(Buffer.from(pixel, 'base64'), { headers: { 'content-type': 'image/png' } });
  });
  assert.equal(result.embedded, 3);
  assert.equal(requests, 3);
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true });
  try {
    async function setup(data, fallback) {
      const page = await browser.newPage();
      await page.setContent(`<div id="week-report">${ids.map(id => `<div><img class="rp-ad-art" data-arte-id="${id}" alt="${id}" hidden><div data-arte-placeholder="true">Video</div></div>`).join('')}</div>`);
      await page.evaluate((data, fallback) => {
        window.AmadorShared = {};
        window.AMADOR_META_DATA = data;
        // Simulate a live data refresh replacing the build snapshot without embedded images.
        window.AmadorObjectives = { meta: () => ({ artes: { piezas: {} } }) };
        window.AMADOR_DATA_ENDPOINT = 'https://script.google.com/macros/s/authorized_endpoint_for_test/exec';
        window.fetch = async () => {
          if (!fallback) throw Error('Offline');
          return { ok: true, json: async () => ({ ok: true, piezas: fallback }) };
        };
      }, data, fallback);
      await page.addScriptTag({ path: path.join(__dirname, '../js/report-week.js') });
      return page;
    }
    let page = await setup(snapshot, null);
    assert.deepEqual(await page.evaluate(() => window.ReporteSemanal.preparePdf()), { total: 3, incrustadas: 3 });
    assert.equal(await page.evaluate(() => [...document.images].filter(i => i.naturalWidth && !i.hidden && i.src.startsWith('data:')).length), 3);
    assert.equal(await page.$eval('#week-report', el => el.querySelectorAll('[data-arte-placeholder]').length), 0);
    await page.close();
    page = await setup({}, Object.fromEntries(ids.map(id => [id, { mime: 'image/png', datos: pixel }])));
    assert.equal((await page.evaluate(() => window.ReporteSemanal.preparePdf())).incrustadas, 3);
    await page.close();
    page = await setup({}, null);
    await assert.rejects(page.evaluate(() => window.ReporteSemanal.preparePdf()), /No se pudo preparar 3 arte/);
    await page.close();
    page = await setup({ artes: { piezas: { one: { id: ids[0], thumbnailData: uri } } } }, null);
    await assert.rejects(page.evaluate(() => window.ReporteSemanal.preparePdf()), /No se pudo preparar 2 arte/);
    await page.close();
    page = await setup({}, Object.fromEntries(ids.map(id => [id, { mime: 'image/png', datos: 'AAAA' }])));
    await assert.rejects(page.evaluate(() => window.ReporteSemanal.preparePdf()), /No se pudo preparar 3 arte/);
    await page.close();
    console.log('PASS: embedded offline, live refresh, failed-image recovery, missing/partial/corrupt artwork');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
