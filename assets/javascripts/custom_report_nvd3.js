/* Add count labels without replacing NVD3's shapes, controls or transitions.
 * Loaded only on report pages, after the bundled nv.d3.min.js.
 */
(function() {
  'use strict';
  function extendModel(name, decorate, prepare) {
    var factory = nv.models[name];
    nv.models[name] = function() {
      var model = factory.apply(this, arguments), enabled = false;
      var format = d3.format(',.0f');
      function chart(selection) {
        if (prepare) prepare(selection, model);
        model(selection);
        selection.each(function(data) { decorate(d3.select(this), data, model, enabled, format); });
        return chart;
      }
      Object.keys(model).forEach(function(key) {
        if (typeof model[key] !== 'function') { chart[key] = model[key]; return; }
        chart[key] = function() {
          var result = model[key].apply(model, arguments);
          return result === model ? chart : result;
        };
      });
      chart.reportShowValues = function(value) {
        if (!arguments.length) return enabled;
        enabled = !!value;
        return chart;
      };
      chart.reportValueFormat = function(value) {
        if (!arguments.length) return format;
        format = value;
        return chart;
      };
      return chart;
    };
  }

  function barLabels(horizontal) {
    return function(container, data, model, enabled, format) {
      var x = model.xScale(), y = model.yScale(), stacked = model.stacked();
      var getX = model.x(), getY = model.y();
      var thickness = x.rangeBand() / (stacked ? 1 : Math.max(1, data.length));
      container.selectAll('.nv-groups > .nv-group').each(function(series) {
        // Older NVD3 leaves empty exit groups behind after hiding a series.
        var values = enabled && data.indexOf(series) >= 0 ? series.values : [];
        var labels = d3.select(this).selectAll('text.report-bar-value').data(values);
        labels.exit().remove();
        labels.enter().append('text').attr('class', 'report-bar-value').style('opacity', 0);
        labels.text(function(d, i) { return format(getY(d, i)); })
          .attr('dy', '.35em')
          .attr('text-anchor', horizontal && !stacked ? 'start' : 'middle')
          .classed('report-inside-value', stacked)
          .style('display', function(d, i) {
            var value = getY(d, i), start = stacked ? d.y0 : 0;
            var length = Math.abs(y(start + value) - y(start));
            var fits = horizontal ? length >= format(value).length * 7 + 8 && thickness >= 16 :
              length >= 16 && thickness >= format(value).length * 7 + 4;
            return value > 0 && (!stacked || fits) ? null : 'none';
          });
        d3.transition(labels).style('opacity', 1)
          .attr('x', function(d, i) {
            if (horizontal) return stacked ? y(d.y0 + getY(d, i) / 2) : y(getY(d, i)) + 5;
            return x(getX(d, i)) + (stacked ? 0 : d.series * thickness) + thickness / 2;
          })
          .attr('y', function(d, i) {
            if (horizontal) return x(getX(d, i)) + (stacked ? 0 : d.series * thickness) + thickness / 2;
            return stacked ? y(d.y0 + getY(d, i) / 2) : y(getY(d, i)) - 9;
          });
      });
    };
  }
  extendModel('multiBar', barLabels(false));
  extendModel('multiBarHorizontal', barLabels(true));

  // This NVD3 version only creates native discrete-bar labels on barsEnter.
  // Ensure they also reappear on an existing chart after off -> on.
  extendModel('discreteBar', function(container) {
    container.selectAll('.nv-bar text').classed('report-discrete-value', true);
  }, function(selection, model) {
    if (model.showValues()) selection.selectAll('.nv-bar').each(function() {
      var bar = d3.select(this);
      if (bar.select('text').empty()) bar.append('text').attr('text-anchor', 'middle');
    });
  });

  extendModel('pie', function(container, data, model, enabled, format) {
    var margin = model.margin();
    var radius = Math.min(model.width() - margin.left - margin.right,
      model.height() - margin.top - margin.bottom) / 2;
    var labelRadius = radius * (model.donut() ? 0.65 : 0.48);
    var centroid = d3.svg.arc().innerRadius(labelRadius).outerRadius(labelRadius);
    container.selectAll('.nv-slice').each(function(slice) {
      var visible = enabled && slice.value > 0 && slice.endAngle - slice.startAngle >= 2 * Math.PI * 0.035;
      var labels = d3.select(this).selectAll('text.report-slice-value').data(visible ? [slice] : []);
      labels.exit().remove();
      labels.enter().append('text').attr('class', 'report-slice-value report-inside-value').style('opacity', 0);
      labels.attr('text-anchor', 'middle').attr('dy', '.35em').text(function(d) { return format(d.value); });
      d3.transition(labels).style('opacity', 1)
        .attr('transform', function(d) { return 'translate(' + centroid.centroid(d) + ')'; });
    });
    var total = d3.sum(model.values()(data[0]) || [], function(d) { return d.disabled ? 0 : model.y()(d); });
    var center = container.select('.nv-wrap.nv-pie').select('.nv-pie').selectAll('text.report-donut-total')
      .data(enabled && model.donut() ? [total] : []);
    center.exit().remove();
    center.enter().append('text').attr('class', 'report-donut-total').attr('text-anchor', 'middle').attr('dy', '.35em');
    center.text(format);
  });
})();
