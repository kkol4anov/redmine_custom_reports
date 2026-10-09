/* Report presentation. User-provided text is only inserted with textContent. */
jQuery(function($) {
  'use strict';
  var redraw = [];
  function el(tag, text, parent, attrs) {
    var node = document.createElement(tag);
    if (text !== null && text !== undefined) node.textContent = text;
    Object.keys(attrs || {}).forEach(function(k) { node.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(node);
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
      el('caption', (source.name ? source.name + ' — ' : '') + (swapped ? source.column_caption : source.row_caption) + ' × ' +
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
    var labels = info.labels, show = !!info.show_values;
    var pie = info.chart_type === 'pie' || info.chart_type === 'donut';
    var horizontal = info.chart_type === 'horizontal_bar', multi = info.multi_series;
    var toolbar = el('div', null, container, {class: 'report-toolbar'});
    checkbox(toolbar, labels.values, show, function() {
      show = this.checked;
      details.open = show;
      configureValues();
      model.update();
    });
    var scroll = el('div', null, container, {class: 'report-chart-scroll'});
    var svgNode = container.querySelector('svg'), svg = d3.select(svgNode);
    scroll.appendChild(svgNode);
    svg.attr('role', 'img').attr('aria-label', labels.values + ' — ' + info.group_by_caption);
    var details = el('details', null, container, {class: 'report-data-details'});
    el('summary', labels.table, details);
    details.open = show && !pie;
    var categories = data[0] ? data[0].values.map(function(v) { return v.label; }) : [];
    table(details, {name: '', row_caption: info.group_by_caption, column_caption: labels.series,
      rows: categories, columns: data.map(function(s) { return s.key; }),
      values: categories.map(function(_, i) { return data.map(function(s) { return s.values[i].value; }); }),
      overlapping: data.length > 1}, info);

    // Keep the data table immutable: NVD3 adds stack offsets and disabled flags.
    var chartData = data.map(function(series, index) {
      var duplicate = data.filter(function(s) { return s.key === series.key; }).length > 1;
      return {key: series.key + (duplicate ? ' [' + (index + 1) + ']' : ''),
        values: series.values.map(function(value, i) {
          return {label: value.label, value: value.value, category: String(i)};
        })};
    });
    function escape(text) { return el('span', String(text)).innerHTML; }
    function numberTick(value) { return value % 1 === 0 ? count(value) : ''; }
    function categoryTick(value) {
      var label = categories[Number(value)] || '';
      return label.length > 30 ? label.slice(0, 29) + '…' : label;
    }
    var model;
    if (pie) {
      model = nv.models.pieChart().donut(info.chart_type === 'donut')
        .showLabels(false).valueFormat(count)
        .x(function(d) { return d.label + (show ? ' — ' + count(d.value) : ''); })
        .y(function(d) { return d.value; })
        .tooltipContent(function(key, value, event) {
          return '<h3>' + escape(event.point.label) + '</h3><p>' + escape(value) + '</p>';
        });
    } else {
      if (multi) {
        model = horizontal ? nv.models.multiBarHorizontalChart() : nv.models.multiBarChart();
        model.stacked(info.bar_mode !== 'grouped').showControls(true);
        if (horizontal) model.showValues(false); // Extension labels support both modes.
        else model.clipEdge(false).delay(180).reduceXTicks(false);
      } else {
        model = nv.models.discreteBarChart().staggerLabels(true).valueFormat(count);
      }
      model.x(function(d) { return d.category; }).y(function(d) { return d.value; });
      model.margin({top: 35, right: horizontal ? 85 : 30, bottom: horizontal ? 55 : 95, left: horizontal ? 210 : 70});
      model.xAxis.tickFormat(categoryTick).axisLabel(info.group_by_caption);
      model.yAxis.tickFormat(numberTick);
      model.tooltipContent(function(key, x, y, event) {
        return '<h3>' + escape(event.point.label) + '</h3><p>' +
          (multi ? escape(key) + ': ' : '') + escape(y) + '</p>';
      });
    }
    model.noData(labels.empty).tooltips(true);
    $(container).data('nvd3_chart', model);
    function configureValues() {
      if (pie) model.pie.reportShowValues(show).reportValueFormat(count);
      else if (multi) model.multibar.reportShowValues(show).reportValueFormat(count);
      else model.showValues(show);
    }
    configureValues();

    function resize(initial) {
      var width = Math.max(360, container.clientWidth || 800), height = 500;
      if (multi) width = Math.max(width, 600); // Native legend and mode controls must not overlap.
      if (!pie && !horizontal) width = Math.max(width, categories.length * Math.max(75, data.length * 36) + 100);
      if (horizontal) height = Math.max(height, categories.length * Math.max(40, data.length * 28) + 100);
      svg.style('width', width + 'px').style('height', height + 'px')
        .attr('width', width).attr('height', height);
      model.width(width).height(height);
      if (initial) {
        // NVD3 v1 pieChart does not detect a series with an empty values array.
        var empty = !categories.length || (pie && !sum(chartData[0].values.map(function(d) { return d.value; })));
        svg.datum(empty ? [] : chartData).transition().duration(500).call(model);
      } else model.update();
    }
    redraw.push(function() { resize(false); });
    resize(true);
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
