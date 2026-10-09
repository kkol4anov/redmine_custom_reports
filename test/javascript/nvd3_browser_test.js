/* Dev-only dependencies: playwright, jquery@3.6.1.
 * Optional: CHROMIUM_EXECUTABLE_PATH, REPORT_SCREENSHOTS (existing directory).
 * node test/javascript/nvd3_browser_test.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const plugin = path.resolve(__dirname, '../..');
const labels = Object.fromEntries(['stacked', 'grouped', 'values', 'total', 'empty', 'rows', 'columns',
  'swap', 'table', 'overlap', 'heatmap', 'layout', 'series'].map(k => [k, k]));
const data = [{key: 'Моделирование', values: [{label: 'В работе', value: 30}, {label: 'На проверке', value: 20}, {label: 'Готово', value: 15}]},
  {key: 'Разработка', values: [{label: 'В работе', value: 18}, {label: 'На проверке', value: 10}, {label: 'Готово', value: 25}]}];

(async () => {
  const browser = await chromium.launch({headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']});
  try {
    const page = await browser.newPage({viewport: {width: 1100, height: 900}});
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    async function setup(type, payload, show = true, mode = 'stacked') {
      await page.goto('about:blank');
      await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body style="font:14px Arial;padding:20px"><h2>Отчёт — ' + type + '</h2><div class="custom-report"><div id="target"></div></div></body></html>');
      await page.addScriptTag({path: require.resolve('jquery')});
      for (const file of ['nv.d3.css', 'custom_report.css']) {
        await page.addStyleTag({path: path.join(plugin, 'assets/stylesheets', file)});
      }
      for (const file of ['d3.v2.min.js', 'nv.d3.min.js', 'custom_report_nvd3.js']) {
        await page.addScriptTag({path: path.join(plugin, 'assets/javascripts', file)});
      }
      await page.evaluate(({type, payload, show, labels, mode}) => {
        const table = ['table', 'heatmap'].includes(type);
        const target = document.querySelector('#target');
        document.querySelector('.custom-report').setAttribute('data-custom_report_info', JSON.stringify({chart_type: type,
          labels, show_values: show, bar_mode: mode, multi_series: ['stacked_bar', 'horizontal_bar'].includes(type), group_by_caption: 'Статус'}));
        target.className = table ? 'custom-report-table' : 'custom-report-chart';
        target.setAttribute(table ? 'data-table_data' : 'data-chart_data', JSON.stringify(payload));
        if (!table) target.innerHTML = '<svg></svg>';
      }, {type, payload, show, labels, mode});
      await page.addScriptTag({path: path.join(plugin, 'assets/javascripts/custom_report_charts.js')});
      await page.waitForTimeout(1400);
      assert.deepEqual(errors, [], 'no JavaScript errors');
    }
    const counts = '.report-bar-value, .report-discrete-value, .report-slice-value';
    const geometry = () => page.locator('svg .nv-bar').evaluateAll(nodes => nodes.map(n => n.outerHTML).join(''));
    for (const type of ['stacked_bar', 'horizontal_bar', 'bar', 'pie', 'donut']) {
      const multi = ['stacked_bar', 'horizontal_bar'].includes(type);
      await setup(type, multi ? data : [data[0]], false);
      assert(await page.locator('svg .nvd3').count(), type + ' uses NVD3');
      const toggle = page.locator('#target > .report-toolbar input');
      await toggle.check();
      await page.waitForTimeout(800);
      assert(await page.locator(counts).count(), type + ' labels appear on existing chart');
      await toggle.uncheck();
      await page.waitForTimeout(800);
      assert.equal(await page.locator(counts).count(), 0, type + ' labels disappear');
      await toggle.check();
      await page.waitForTimeout(800);
      assert(await page.locator(counts).count(), type + ' labels reappear');
      if (multi) {
        assert.equal(await page.evaluate(() => jQuery('#target').data('nvd3_chart').stacked()), true);
        const before = await geometry();
        // Keep a reference: transitions must update, not destroy, native SVG nodes.
        await page.evaluate(() => { window.originalBar = document.querySelector('svg .nv-bar'); });
        await page.locator('.nv-controlsWrap .nv-series').filter({hasText: 'Grouped'}).click();
        await page.waitForTimeout(100);
        const during = await geometry();
        await page.waitForTimeout(1000);
        const after = await geometry();
        assert.notEqual(before, after, type + ' switches geometry');
        assert.notEqual(during, after, type + ' animates transition');
        assert(await page.evaluate(() => window.originalBar === document.querySelector('svg .nv-bar')), 'keeps SVG nodes');
        assert.equal(await page.evaluate(() => jQuery('#target').data('nvd3_chart').stacked()), false);
        await page.locator('.nv-controlsWrap .nv-series').filter({hasText: 'Stacked'}).click();
        await page.waitForTimeout(800);
      }
      if (type !== 'bar') {
        await page.locator('.nv-legendWrap .nv-series').first().click();
        await page.waitForTimeout(800);
        assert(await page.locator('.nv-legendWrap .nv-series.disabled').count(), 'native legend hides series');
        await page.locator('.nv-legendWrap .nv-series').first().click();
        await page.waitForTimeout(800);
      }
      if (process.env.REPORT_SCREENSHOTS) {
        await page.screenshot({path: path.join(process.env.REPORT_SCREENSHOTS, type + '.png'), fullPage: true});
      }
      await page.setViewportSize({width: 800, height: 900});
      await page.waitForTimeout(900);
      const svg = await page.locator('svg').innerHTML();
      assert(!/NaN|Infinity/.test(svg), type + ' has finite resized geometry');
      assert.deepEqual(errors, [], type + ' no runtime errors');
      await page.setViewportSize({width: 1100, height: 900});
      console.log('PASS:', type, 'native model, labels, interaction, transitions, resize');
    }
    for (const type of ['stacked_bar', 'horizontal_bar', 'bar']) {
      await setup(type, [{key: 'Zeros', values: [{label: 'A', value: 0}, {label: 'B', value: 0}]}]);
      assert(!/NaN|Infinity/.test(await page.locator('svg').innerHTML()), type + ' handles all-zero counts');
    }
    await setup('stacked_bar', data, true, 'grouped');
    assert.equal(await page.evaluate(() => jQuery('#target').data('nvd3_chart').stacked()), false, 'saved Grouped mode');
    await page.setViewportSize({width: 390, height: 800});
    await page.waitForTimeout(900);
    assert((await page.locator('svg').boundingBox()).width >= 600, 'mobile chart scrolls instead of colliding controls');
    await page.setViewportSize({width: 1100, height: 900});
    for (const type of ['stacked_bar', 'horizontal_bar', 'bar', 'pie', 'donut']) {
      await setup(type, [{key: 'Empty', values: []}]);
      assert.equal(await page.locator('.nv-noData').textContent(), 'empty');
    }
    await setup('donut', [{key: 'Zero', values: [{label: 'Zero', value: 0}]}]);
    assert.equal(await page.locator('.nv-noData').textContent(), 'empty');
    await setup('pie', [{key: 'Unsafe', values: [{label: '<img src=x onerror=alert(1)>', value: 10}]}]);
    await page.locator('.nv-slice path').hover();
    await page.waitForTimeout(150);
    assert.equal(await page.locator('img').count(), 0, 'tooltip does not inject HTML');
    assert((await page.locator('.nvtooltip').textContent()).includes('<img'), 'tooltip retains literal text');
    const source = {name: 'Pivot', row_caption: 'Person', column_caption: 'Status', rows: ['A', 'B'],
      columns: ['Open', 'Closed'], values: [[10, 20], [0, 30]], overlapping: true};
    await setup('heatmap', source);
    assert.equal(await page.locator('tfoot td:last-child').textContent(), '60');
    const mode = page.locator('#target > .report-toolbar select');
    await mode.selectOption('row');
    assert.equal(await page.locator('tbody tr').first().locator('td').first().textContent(), '33.3%');
    await mode.selectOption('column');
    assert.equal(await page.locator('tbody tr').first().locator('td').first().textContent(), '100.0%');
    await mode.selectOption('all');
    assert.equal(await page.locator('tbody tr').first().locator('td').first().textContent(), '16.7%');
    await mode.selectOption('count');
    await page.locator('#target > .report-toolbar button').click();
    assert.equal(await page.locator('tbody tr').first().locator('th').textContent(), 'Open');
    await page.locator('.report-axis-filters summary').click();
    await page.locator('select[multiple]').first().selectOption(['0']);
    assert.equal(await page.locator('tfoot td:last-child').textContent(), '30');
    await page.locator('select[multiple]').first().selectOption([]);
    assert.equal(await page.locator('.report-table-scroll').textContent(), 'empty');
    await setup('table', {...source, values: [[0, 0], [0, 0]]});
    await page.locator('#target > .report-toolbar select').selectOption('row');
    assert(!/NaN|Infinity/.test(await page.locator('table').textContent()), 'zero denominator handled');
    assert.deepEqual(errors, []);
    console.log('PASS: empty data, saved mode, escaping, totals, percentages, transpose, axis filters');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
