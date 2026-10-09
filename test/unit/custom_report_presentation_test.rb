require File.expand_path('../test_helper', __dir__)

class CustomReportPresentationTest < ActiveSupport::TestCase
  fixtures :projects, :users, :issues, :issue_statuses, :trackers,
           :enumerations, :projects_trackers, :enabled_modules,
           :custom_fields, :custom_fields_projects, :custom_fields_trackers,
           :custom_values, :roles, :members, :member_roles

  def setup
    User.current = User.find(1)
  end

  def teardown
    User.current = nil
  end

  def report(attributes = {})
    CustomReport.new({project: Project.find(1), user: User.current,
                     name: 'Matrix', chart_type: 'table', group_by: 'status',
                     column_by: 'tracker',
                     series_attributes: [{name: 'All', filters: {}}]}.merge(attributes))
  end

  def test_default_layout_inherits_settings_and_supports_override
    with_settings plugin_redmine_custom_reports: {'bar_mode' => 'grouped'} do
      assert_equal 'grouped', report.effective_bar_mode
      assert_equal 'stacked', report(bar_mode: 'stacked').effective_bar_mode
    end
    with_settings plugin_redmine_custom_reports: {} do
      assert_equal 'stacked', report.effective_bar_mode
    end
    assert_not report(bar_mode: 'invalid').valid?
  end

  def test_matrix_matches_visible_filtered_issues_for_each_cell
    [User.find(1), User.find(2)].each do |user|
      User.current = user
      query = QueryExt.new(name: 'Matrix', project: Project.find(1), group_by: 'status',
                           filters: {'status_id' => {operator: 'o', values: ['']}})
      expected = Hash.new(0)
      query.base_scope.includes(:status, :assigned_to).each do |issue|
        expected[[issue.status, issue.assigned_to]] += 1
      end
      assert_equal expected, query.report_matrix_counts('status', 'assigned_to')
    end
  end

  def test_string_custom_field_and_empty_values_work_on_second_axis
    field = IssueCustomField.create!(name: 'Matrix field', field_format: 'string',
                                    is_for_all: true, tracker_ids: Tracker.pluck(:id))
    issue = Issue.find(1)
    issue.custom_field_values = {field.id.to_s => 'Alpha'}
    issue.save!
    query = QueryExt.new(name: 'Matrix', project: issue.project, group_by: 'status', filters: {})
    matrix = query.report_matrix_counts('status', "cf_#{field.id}")
    assert_operator matrix.fetch([issue.status, 'Alpha']), :>=, 1
    assert_equal query.base_scope.distinct.count, matrix.values.sum
    transposed = query.report_matrix_counts("cf_#{field.id}", 'status')
    assert_equal matrix, transposed.each_with_object({}) { |(key, value), h| h[key.reverse] = value }
  end

  def test_invalid_or_equal_dimensions_are_rejected
    assert_not report(column_by: 'status').valid?
    assert_not report(column_by: 'missing').valid?
    query = report.series.first.query
    assert_raises(ArgumentError) { query.report_matrix_counts('status', 'issues.id); DROP TABLE issues') }
  end

  def test_legacy_chart_removed_and_heatmap_supported
    assert_not_includes CustomReport::CHART_TYPES, 'undev_pie'
    assert report(chart_type: 'heatmap').valid?
  end

  def test_table_totals_and_zero_filled_cells
    r = report
    assert r.valid?, r.errors.full_messages.join(', ')
    data = r.tables.first
    assert_equal r.series.first.query.base_scope.distinct.count, data[:values].flatten.sum
    assert data[:values].all? { |row| row.size == data[:columns].size }
    assert_equal false, data[:overlapping]
  end

  def test_series_table_marks_overlap_instead_of_claiming_unique_total
    r = report(column_by: '')
    r.series.build(name: 'Same filter', filters: {})
    data = r.tables.first
    assert_equal true, data[:overlapping]
    assert_equal r.series.first.query.issue_count * 2, data[:values].flatten.sum
  end

  def test_false_is_not_a_missing_group_value
    row = report.series.first
    assert_equal 'false', row.data([], {false => 3})[:values].first[:label]
  end

  def test_dense_matrix_size_guard
    assert_raises(QueryExt::ReportTooLarge) { report.send(:ensure_table_size, 201, 100) }
  end
end
