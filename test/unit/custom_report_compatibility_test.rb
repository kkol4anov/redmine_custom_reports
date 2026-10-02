require File.expand_path('../test_helper', __dir__)

class CustomReportCompatibilityTest < ActiveSupport::TestCase
  fixtures :projects, :users, :issues, :issue_statuses, :trackers,
           :enumerations, :projects_trackers, :enabled_modules,
           :custom_fields, :custom_fields_projects, :custom_fields_trackers,
           :custom_values

  def setup
    User.current = User.find(1)
  end

  def teardown
    User.current = nil
  end

  def test_string_custom_field_grouping_uses_redmine_4_sql
    field = IssueCustomField.create!(name: 'Report grouping', field_format: 'string',
                                    is_for_all: true, tracker_ids: Tracker.pluck(:id))
    issue = Issue.find(1)
    issue.custom_field_values = { field.id.to_s => 'Alpha' }
    issue.save!
    query = QueryExt.new(name: 'Report', project: issue.project, filters: {},
                         group_by: "cf_#{field.id}")
    column = query.group_by_column
    assert column
    assert column.groupable?
    assert_equal field.order_statement, column.group_by_statement
    assert_operator query.result_count_by_group.fetch('Alpha'), :>=, 1
    ordinary = IssueQuery.new(project: issue.project).available_columns.find do |c|
      c.name == column.name
    end
    assert_not ordinary.groupable?, 'Plugin must not change ordinary issue queries'
  end

  def test_counts_match_core_query_visibility
    project = Project.find(1)
    plugin = QueryExt.new(name: 'Plugin', project: project, filters: {}, group_by: 'status')
    core = IssueQuery.new(name: 'Core', project: project, filters: {}, group_by: 'status')
    assert_equal core.result_count_by_group, plugin.result_count_by_group
  end

  def test_multiple_series_use_identical_group_order_and_fill_missing_values
    row = CustomReportSeries.new(name: 'Row')
    data = row.data(['Alpha', 'Beta', 'Gamma'], {'Beta' => 3, 'Alpha' => 2})
    assert_equal ['Alpha', 'Beta', 'Gamma'], data[:values].map { |v| v[:label] }
    assert_equal [2, 3, 0], data[:values].map { |v| v[:value] }
  end

  def test_unsupported_filters_do_not_execute_a_broader_query
    query = QueryExt.new(name: 'Report', project: Project.find(1),
                         filters: {'missing_field' => {operator: '=', values: ['1']}})
    assert_not query.valid?
  end
end
