const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const context = vm.createContext({ window: {}, document: { readyState: 'loading', addEventListener() {} }, console });
vm.runInContext(fs.readFileSync(path.join(root, 'js/shared.js'), 'utf8'), context);
const source = fs.readFileSync(path.join(root, 'js/objectives.js'), 'utf8');
vm.runInContext(source.replace('window.AmadorObjectives = {', 'window.testCoverage = { metaCoverageDay, metaToMonth }; window.AmadorObjectives = {'), context);
const { metaCoverageDay, metaToMonth } = context.window.testCoverage;
const meta = { source: 'nexus', year: 2026, month: 11, through: '2026-11-23', capturedAt: '2026-11-23T13:00:01-05:00',
  columns: ['day', 'campaign', 'adSet', 'ad', 'objective', 'spend', 'impressions', 'messages', 'purchases'],
  rows: [['2026-11-20', 'CampaÃ±a', 'Conjunto', 'Anuncio', 'Ventas', 42.50, 100, 3, 1],
    ['2026-11-23', 'CampaÃ±a', 'Conjunto', 'Anuncio', 'Ventas', 0, 0, 0, 0]] };
assert.equal(metaCoverageDay(meta, '2026-11-20'), '2026-11-23');
const month = metaToMonth(meta, null);
assert.equal(month.lastDataDay, 23);
assert.equal(month.meta.lastDay, '2026-11-20');
assert.equal(month.adSpendTotal, 42.50);
for (const change of [{source: 'export'}, {through: ''}, {through: '2026-12-01'}, {through: '2026-11-31'},
  {through: '2026-11-19'}, {through: '2026-11-24'}, {capturedAt: 'invalid'}, {capturedAt: '2026-11-23T02:00:00Z'}]) {
  assert.equal(metaCoverageDay({...meta, ...change}, '2026-11-20'), '2026-11-20');
}
assert.equal(metaToMonth({...meta, source: 'export'}, null).lastDataDay, 20);
console.log('OK: Nexus coverage, zero activity days, unchanged totals and invalid dates');
