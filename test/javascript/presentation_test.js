/* Dev-only dependency: npm install --no-save jsdom
 * REDMINE_ROOT=/path/to/redmine node test/javascript/presentation_test.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const plugin = path.resolve(__dirname, '../..');
const redmine = process.env.REDMINE_ROOT || path.resolve(plugin, '../..');
const labels = Object.fromEntries(['stacked', 'grouped', 'values', 'total', 'empty', 'rows', 'columns',
  'swap', 'table', 'overlap', 'heatmap', 'layout', 'series'].map(k => [k, k]));
const data = [{key: 'First', values: [{label: 'A', value: 10}, {label: 'B', value: 20}]},
              {key: 'Second', values: [{label: 'A', value: 5}, {label: 'B', value: 0}]}];
async function setup(type, payload, values = true) {
  const dom = new JSDOM('<!doctype html><div class="custom-report"><div id="target"></div></div>', {runScripts: 'outside-only'});
  const w = dom.window, d = w.document;
  w.eval(fs.readFileSync(path.join(redmine, 'public/javascripts/jquery-3.6.1-ui-1.13.2-ujs-5.2.8.1.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(plugin, 'assets/javascripts/d3.v2.min.js'), 'utf8'));
  const isTable = ['table', 'heatmap'].includes(type);
  d.querySelector('.custom-report').setAttribute('data-custom_report_info', JSON.stringify({chart_type: type,
    labels, show_values: values, bar_mode: 'stacked', multi_series: ['stacked_bar', 'horizontal_bar'].includes(type), group_by_caption: 'Category'}));
  const target = d.querySelector('#target');
  target.className = isTable ? 'custom-report-table' : 'custom-report-chart';
  target.setAttribute(isTable ? 'data-table_data' : 'data-chart_data', JSON.stringify(payload));
  if (!isTable) target.innerHTML = '<svg></svg>';
  w.eval(fs.readFileSync(path.join(plugin, 'assets/javascripts/custom_report_charts.js'), 'utf8'));
  await new Promise(resolve => w.jQuery(resolve));
  function change(node, value) { if (value !== undefined) node.value = value; node.dispatchEvent(new w.Event('change')); }
  return {w, d, change, close: () => w.close()};
}
(async () => {
  for (const type of ['stacked_bar', 'horizontal_bar', 'bar', 'pie', 'donut']) {
    const env = await setup(type, ['bar', 'pie', 'donut'].includes(type) ? [data[0]] : data);
    const {d, w, change} = env;
    assert(d.querySelector('svg').children.length > 0, type + ' draws');
    assert(!d.querySelector('svg').innerHTML.includes('NaN'), type + ' finite geometry');
    assert(d.querySelector('.report-matrix'), type + ' has exact data');
    const toggle = d.querySelector('.report-toolbar input');
    toggle.checked = false; change(toggle);
    assert.equal(d.querySelectorAll('svg .report-value').length, 0, type + ' labels disabled');
    toggle.checked = true; change(toggle);
    assert(d.querySelectorAll('svg .report-value').length > 0 || type === 'bar');
    if (['stacked_bar', 'horizontal_bar'].includes(type)) {
      const select = d.querySelector('.report-toolbar select');
      assert.equal(select.value, 'stacked');
      const before = d.querySelector('svg').innerHTML;
      change(select, 'grouped');
      assert.notEqual(d.querySelector('svg').innerHTML, before, 'mode changes geometry');
    }
    d.querySelectorAll('.report-legend button').forEach(b => b.click());
    assert(d.querySelector('svg').textContent.includes('empty'), 'all hidden handled');
    w.dispatchEvent(new w.Event('resize'));
    await new Promise(r => setTimeout(r, 140));
    assert(!d.querySelector('svg').innerHTML.includes('NaN'));
    env.close();
  }
  const source = {name: 'Pivot', row_caption: 'Person', column_caption: 'Status', rows: ['A', '<img src=x onerror=alert(1)>'],
    columns: ['Open', 'Closed'], values: [[10, 20], [0, 30]], overlapping: true};
  const env = await setup('heatmap', source);
  const {d, change} = env;
  assert.equal(d.querySelector('tfoot td:last-child').textContent, '60');
  assert.equal(d.querySelectorAll('img').length, 0, 'labels are escaped');
  assert.equal(d.querySelectorAll('.report-note').length, 1, 'overlap warning');
  const mode = d.querySelector('.report-toolbar select');
  change(mode, 'row');
  assert.equal(d.querySelector('tbody tr td').textContent, '33.3%');
  assert.equal(d.querySelector('tbody tr td:last-child').textContent, '100.0%');
  change(mode, 'column');
  assert.equal(d.querySelector('tbody tr td').textContent, '100.0%');
  change(mode, 'all');
  assert.equal(d.querySelector('tbody tr td').textContent, '16.7%');
  change(mode, 'count');
  d.querySelector('.report-toolbar button').click();
  assert.equal(d.querySelector('tbody tr th').textContent, 'Open');
  assert.equal(d.querySelector('tbody tr td:last-child').textContent, '10');
  const rows = d.querySelectorAll('select[multiple]')[0];
  rows.options[1].selected = false; change(rows);
  assert.equal(d.querySelector('tfoot td:last-child').textContent, '30', 'visible totals recomputed');
  rows.options[0].selected = false; change(rows);
  assert(d.querySelector('.report-table-scroll').textContent.includes('empty'));
  env.close();
  const zero = await setup('table', {...source, values: [[0, 0], [0, 0]]});
  zero.change(zero.d.querySelector('.report-toolbar select'), 'row');
  assert(!/NaN|Infinity/.test(zero.d.body.textContent));
  zero.close();
  const empty = await setup('pie', [{key: 'Empty', values: []}]);
  assert(empty.d.querySelector('svg').textContent.includes('empty'));
  empty.close();
  console.log('PASS: five chart types, toggles, modes, legend, resize, totals, percentages, transpose, axis filters, empty/zero data, HTML escaping');
})().catch(e => { console.error(e); process.exitCode = 1; });
