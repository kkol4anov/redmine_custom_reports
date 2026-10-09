/* Report presentation. User-provided text is only inserted with textContent. */
jQuery(function($) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var colors = ['#2878ad', '#df8c28', '#39967c', '#b95463', '#8866ad', '#69833c', '#ad6743', '#568e9b'];
  var redraw = [];
  function el(tag, text, parent, attrs) {
    var node = document.createElement(tag);
    if (text !== null && text !== undefined) node.textContent = text;
    Object.keys(attrs || {}).forEach(function(k) { node.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(node);
    return node;
  }
  function svgEl(tag, attrs, parent, text) {
    var node = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function(k) { node.setAttribute(k, attrs[k]); });
    if (text !== undefined) node.textContent = text;
    parent.appendChild(node);
    return node;
  }
  function sum(a) { return a.reduce(function(total, n) { return total + n; }, 0); }
  function count(n) { return Number(n).toLocaleString(); }
  function checkbox(parent, caption, checked, change) {
    var label = el('label', null, parent);
    var input = el('input', null, label, {type: 'checkbox'});
    input.checked = checked;
    label.appendChild(document.createTextNode(' ' + caption));
    input.addEventListener('change', change);
    return input;
  }
  function button(parent, caption, action) {
    var b = el('button', caption, parent, {type: 'button'});
    b.addEventListener('click', action);
    return b;
  }
  function table(container, source, info) {
    var labels = info.labels, swapped = false;
    var toolbar = el('div', null, container, {class: 'report-toolbar'});
    var filters = el('details', null, container, {class: 'report-axis-filters'});
    el('summary', labels.rows + ' / ' + labels.columns, filters);
    var pickers = el('div', null, filters, {class: 'report-toolbar'});
    var mode = el('select', null, toolbar, {'aria-label': labels.values});
    [[labels.values, 'count'], ['% ' + labels.rows, 'row'], ['% ' + labels.columns, 'column'], ['% ' + labels.total, 'all']].forEach(function(item) {
      el('option', item[0], mode, {value: item[1]});
    });
    var heat = checkbox(toolbar, labels.heatmap, info.chart_type === 'heatmap', render);
    var view = el('div', null, container, {class: 'report-table-scroll'});
    function picker(caption, values) {
      var label = el('label', caption + ' ', pickers);
      var select = el('select', null, label, {multiple: 'multiple', size: Math.min(6, Math.max(2, values.length)), 'aria-label': caption});
      values.forEach(function(v, i) { var o = el('option', v, select, {value: i}); o.selected = true; });
      select.addEventListener('change', render);
      return select;
    }
    var rowPicker = picker(source.row_caption, source.rows);
    var colPicker = picker(source.column_caption, source.columns);
    function selected(select) {
      return Array.prototype.filter.call(select.options, function(o) { return o.selected; }).map(function(o) { return Number(o.value); });
    }
    button(toolbar, labels.swap, function() { swapped = !swapped; render(); });
    mode.addEventListener('change', render);
    if (source.overlapping) el('p', labels.overlap, container, {class: 'report-note'});
    function render() {
      while (view.firstChild) view.removeChild(view.firstChild);
      var ri = selected(rowPicker), ci = selected(colPicker);
      var rows = ri.map(function(i) { return source.rows[i]; });
      var cols = ci.map(function(i) { return source.columns[i]; });
      var values = ri.map(function(r) { return ci.map(function(c) { return source.values[r][c]; }); });
      if (swapped) {
        values = ci.map(function(c) { return ri.map(function(r) { return source.values[r][c]; }); });
        var tmp = rows; rows = cols; cols = tmp;
      }
      if (!rows.length || !cols.length) { el('p', labels.empty, view); return; }
      var rt = values.map(sum), ct = cols.map(function(_, c) { return sum(values.map(function(row) { return row[c]; })); });
      var total = sum(rt);
      function number(v, r, c) {
        var denominator = mode.value === 'row' ? (r < rows.length ? rt[r] : total) :
          mode.value === 'column' ? (c < cols.length ? ct[c] : total) : total;
        return mode.value === 'count' ? v : denominator ? v * 100 / denominator : 0;
      }
      var max = 0;
      values.forEach(function(row, r) { row.forEach(function(v, c) { max = Math.max(max, number(v, r, c)); }); });
      var t = el('table', null, view, {class: 'list report-matrix'});
      el('caption', source.name + ' — ' + (swapped ? source.column_caption : source.row_caption) + ' × ' +
        (swapped ? source.row_caption : source.column_caption), t);
      var head = el('tr', null, el('thead', null, t));
      el('th', swapped ? source.column_caption : source.row_caption, head, {scope: 'col'});
      cols.concat([labels.total]).forEach(function(c) { el('th', c, head, {scope: 'col'}); });
      var body = el('tbody', null, t);
      function addRow(caption, numbers, r, parent) {
        var tr = el('tr', null, parent);
        el('th', caption, tr, {scope: 'row'});
        numbers.forEach(function(v, c) {
          var n = number(v, r, c);
          var cell = el('td', mode.value === 'count' ? count(n) : n.toFixed(1) + '%', tr, {title: labels.values + ': ' + count(v)});
          if (heat.checked && r < rows.length && c < cols.length && n > 0) {
            cell.style.backgroundColor = 'rgba(40,120,173,' + (0.08 + 0.42 * n / max) + ')';
          }
        });
      }
      rows.forEach(function(caption, r) { addRow(caption, values[r].concat([rt[r]]), r, body); });
      addRow(labels.total, ct.concat([total]), rows.length, el('tfoot', null, t));
    }
    render();
  }

  function chart(container, info, data) {
    var labels = info.labels, show = info.show_values, stacked = info.bar_mode === 'stacked';
    var pie = info.chart_type === 'pie' || info.chart_type === 'donut';
    var horizontal = info.chart_type === 'horizontal_bar';
    var multi = info.multi_series;
    var hidden = {};
    var toolbar = el('div', null, container, {class: 'report-toolbar'});
    checkbox(toolbar, labels.values, show, function() { show = this.checked; details.open = show; render(); });
    if (multi) {
      var select = el('select', null, toolbar, {'aria-label': labels.layout});
      el('option', labels.stacked, select, {value: 'stacked'});
      el('option', labels.grouped, select, {value: 'grouped'});
      select.value = stacked ? 'stacked' : 'grouped';
      select.addEventListener('change', function() { stacked = this.value === 'stacked'; render(); });
    }
    var legend = el('div', null, container, {class: 'report-legend'});
    var scroll = el('div', null, container, {class: 'report-chart-scroll'});
    var svg = container.querySelector('svg');
    scroll.appendChild(svg);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', labels.values + ' — ' + info.group_by_caption);
    var details = el('details', null, container, {class: 'report-data-details'});
    el('summary', labels.table, details);
    details.open = show && !pie;
    var categories = data[0] ? data[0].values.map(function(v) { return v.label; }) : [];
    table(details, {name: '', row_caption: info.group_by_caption, column_caption: labels.series,
      rows: categories, columns: data.map(function(s) { return s.key; }),
      values: categories.map(function(_, i) { return data.map(function(s) { return s.values[i].value; }); }),
      overlapping: data.length > 1}, info);
    function render() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      while (legend.firstChild) legend.removeChild(legend.firstChild);
      var items = pie ? (data[0] ? data[0].values : []) : data;
      items.forEach(function(item, i) {
        var text = pie ? item.label + (show ? ' — ' + count(item.value) : '') : item.key;
        var b = button(legend, text, function() { hidden[i] = !hidden[i]; render(); });
        b.style.borderLeftColor = colors[i % colors.length];
        b.setAttribute('aria-pressed', String(!hidden[i]));
        if (hidden[i]) b.className = 'report-muted';
      });
      var active = items.map(function(item, i) { return {item: item, index: i}; }).filter(function(d) { return !hidden[d.index]; });
      var width = Math.max(360, container.clientWidth || 800), height = 400;
      function size() { svg.setAttribute('width', width); svg.setAttribute('height', height); svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height); }
      if (!active.length || !categories.length || (pie && !sum(active.map(function(d) { return d.item.value; })))) {
        size(); svgEl('text', {x: 20, y: 40}, svg, labels.empty); return;
      }
      if (pie) {
        var radius = Math.min(width / 2 - 24, 175), center = svgEl('g', {transform: 'translate(' + width / 2 + ',200)'}, svg);
        var total = sum(active.map(function(d) { return d.item.value; }));
        var slices = d3.layout.pie().sort(null).value(function(d) { return d.item.value; })(active);
        var arc = d3.svg.arc().innerRadius(info.chart_type === 'donut' ? radius * 0.58 : 0).outerRadius(radius);
        slices.forEach(function(s) {
          var path = svgEl('path', {d: arc(s), fill: colors[s.data.index % colors.length], stroke: '#fff', 'stroke-width': 2}, center);
          svgEl('title', {}, path, s.data.item.label + ': ' + count(s.value) + ' (' + (100 * s.value / total).toFixed(1) + '%)');
          // Tiny slices retain exact, permanent counts in the legend without colliding labels.
          if (show && s.value / total >= 0.035) {
            var mid = (s.startAngle + s.endAngle) / 2, r = radius * (info.chart_type === 'donut' ? 0.8 : 0.65);
            svgEl('text', {x: Math.sin(mid) * r, y: -Math.cos(mid) * r + 4, class: 'report-value'}, center, count(s.value));
          }
        });
        if (info.chart_type === 'donut' && show) {
          svgEl('text', {x: 0, y: 0, class: 'report-total'}, center, count(total));
          svgEl('text', {x: 0, y: 22, 'text-anchor': 'middle'}, center, labels.total);
        }
      } else {
        var n = categories.length, k = active.length;
        var margin = {left: horizontal ? 190 : 65, right: horizontal ? 90 : 45, top: 30, bottom: horizontal ? 50 : 130};
        if (horizontal) height = Math.max(300, n * (stacked ? 42 : 30 * k) + margin.top + margin.bottom);
        else width = Math.max(width, n * (stacked || !multi ? 85 : 55 * k) + margin.left + margin.right);
        var plotW = width - margin.left - margin.right, plotH = height - margin.top - margin.bottom;
        var maximum = 1;
        categories.forEach(function(_, i) {
          var vals = active.map(function(s) { return s.item.values[i].value; });
          maximum = Math.max(maximum, multi && stacked ? sum(vals) : Math.max.apply(null, vals));
        });
        // A non-zero integer tick step avoids duplicate labels for small counts.
        var step = Math.max(1, Math.ceil(maximum / 5)), limit = step * Math.ceil(maximum / step);
        var length = horizontal ? plotW : plotH;
        var band = (horizontal ? plotH : plotW) / n;
        var group = svgEl('g', {transform: 'translate(' + margin.left + ',' + margin.top + ')'}, svg);
        for (var tick = 0; tick <= limit; tick += step) {
          var pos = tick / limit * length;
          svgEl('line', horizontal ? {x1: pos, x2: pos, y1: 0, y2: plotH, class: 'report-grid'} :
            {x1: 0, x2: plotW, y1: plotH - pos, y2: plotH - pos, class: 'report-grid'}, group);
          svgEl('text', horizontal ? {x: pos, y: plotH + 22, 'text-anchor': 'middle'} :
            {x: -10, y: plotH - pos + 4, 'text-anchor': 'end'}, group, count(tick));
        }
        categories.forEach(function(category, i) {
          var offset = 0, useStack = multi && stacked;
          var label = svgEl('text', horizontal ? {x: -12, y: i * band + band / 2 + 4, 'text-anchor': 'end'} :
            {transform: 'translate(' + (i * band + band / 2) + ',' + (plotH + 18) + ') rotate(-35)', 'text-anchor': 'end'}, group,
            category.length > 26 ? category.slice(0, 25) + '…' : category);
          svgEl('title', {}, label, category);
          active.forEach(function(s, j) {
            var v = s.item.values[i].value, len = v / limit * length;
            var thickness = band * 0.75 / (useStack ? 1 : k);
            var cross = i * band + band * 0.125 + (useStack ? 0 : j * thickness);
            var start = (useStack ? offset : 0) / limit * length;
            var attrs = horizontal ? {x: start, y: cross, width: len, height: thickness - 1} :
              {x: cross, y: plotH - start - len, width: thickness - 1, height: len};
            attrs.fill = colors[s.index % colors.length];
            var bar = svgEl('rect', attrs, group);
            svgEl('title', {}, bar, category + ' / ' + s.item.key + ': ' + count(v));
            if (show && v > 0 && (!useStack || len >= (horizontal ? 32 : 16))) {
              svgEl('text', horizontal ? {x: start + (useStack ? len / 2 : len + 5), y: cross + thickness / 2 + 4,
                'text-anchor': useStack ? 'middle' : 'start', class: useStack ? 'report-value' : ''} :
                {x: cross + thickness / 2, y: plotH - start - len + (useStack ? len / 2 + 4 : -6),
                  'text-anchor': 'middle', class: useStack ? 'report-value' : ''}, group, count(v));
            }
            offset += v;
          });
        });
        // Exact values stay visible when segments are too small to label safely.

      }
      size();
    }
    redraw.push(render);
    render();
  }

  $('.custom-report').each(function() {
    var info = $(this).data('custom_report_info');
    $(this).find('.custom-report-chart').each(function() { chart(this, info, $(this).data('chart_data')); });
    $(this).find('.custom-report-table').each(function() { table(this, $(this).data('table_data'), info); });
  });
  var timer;
  $(window).on('resize.customReports', function() {
    clearTimeout(timer); timer = setTimeout(function() { redraw.forEach(function(render) { render(); }); }, 120);
  });
});
