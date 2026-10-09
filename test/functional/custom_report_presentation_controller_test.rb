require File.expand_path('../test_helper', __dir__)

class CustomReportPresentationControllerTest < ActionController::TestCase
  tests CustomReportsController
  fixtures :projects, :users, :issues, :issue_statuses, :trackers,
           :enumerations, :projects_trackers, :enabled_modules

  def setup
    @project = Project.find(1)
    @project.enable_module! :custom_reports
    User.current = User.find(1)
    @request.session[:user_id] = User.current.id
    @report = @project.custom_reports.create!(name: 'Matrix', user: User.current,
      chart_type: 'table', group_by: 'status', column_by: 'tracker',
      series_attributes: [{name: 'All', filters: {}}])
  end

  def teardown
    User.current = nil
  end

  def test_show_table_contains_escaped_payload_without_chart
    get :show, params: {project_id: @project.identifier, id: @report.id}
    assert_response :success
    assert_select '.custom-report-table[data-table_data]', 1
    assert_select '.custom-report-chart', 0
  end

  def test_update_presentation_settings_and_copy_them
    put :update, params: {project_id: @project.identifier, id: @report.id,
      custom_report: {show_values: '1', bar_mode: 'grouped', column_by: 'assigned_to'}}
    assert_response :redirect
    assert_equal true, @report.reload.show_values
    assert_equal 'grouped', @report.bar_mode
    assert_equal 'assigned_to', @report.column_by
    get :new, params: {project_id: @project.identifier, copy_from: @report.id}
    assert_response :success
    copy = assigns(:custom_report)
    assert_equal true, copy.show_values
    assert_equal 'grouped', copy.bar_mode
    assert_equal 'assigned_to', copy.column_by
    assert copy.new_record?
  end
end
