require File.expand_path(File.dirname(__FILE__) + '/../test_helper')

class CustomReportsControllerTest < ActionController::TestCase
  fixtures :projects, :trackers, :issue_statuses, :issues,
    :enumerations, :users, :issue_categories,
    :projects_trackers,
    :roles,
    :member_roles,
    :members

  def setup
    @project = Project.find(1)
    @project.enable_module! :custom_reports

    # admin
    @user        = User.find(1)
    User.current = @user

    @request.session[:user_id] = @user.id

    @custom_report = @project.custom_reports.create!(
      name:              'name',
      description:       'description',
      group_by:          'status',
      user_id:           @user.id,
      is_public:         true,
      chart_type:        'pie',
      series_attributes: [{
        name:    'series1',
        filters: {}
      }]
    )
  end

  def test_show_all_custom_reports
    get :index, params: { project_id: @project.identifier }
    assert_response :success
  end

  def test_show_custom_report
    get :show, params: { project_id: @project.identifier, id: @custom_report.id }
    assert_response :success
  end

  def test_show_new_custom_report
    get :new, params: { project_id: @project.identifier }
    assert_response :success
  end

  def test_create_custom_report
    series_name    = 'series2-1'
    series_filters = { 'status_id' => { operator: '=', values: ['1'] } }
    attrs          = {
      name:              'name2',
      description:       'description2',
      group_by:          'status',
      user_id:           @user.id,
      is_public:         true,
      chart_type:        'donut',
      series_attributes: {
        0 => {
          name: series_name,
          flt:  {
            f:  ['status_id'],
            op: { status_id: '=' },
            v:  { status_id: ['1'] }
          }
        }
      }
    }
    post :create, params: { project_id: @project.identifier, custom_report: attrs }
    assert_response :redirect
    custom_report = @project.custom_reports.find_by_name(attrs[:name])
    assert custom_report
    assert_equal attrs[:description], custom_report.description
    assert_equal attrs[:group_by], custom_report.group_by
    assert_equal attrs[:user_id], custom_report.user_id
    assert_equal attrs[:is_public], custom_report.is_public
    assert_equal attrs[:chart_type], custom_report.chart_type

    assert_equal 1, custom_report.series.count
    series = custom_report.series.first
    assert_equal series_name, series.name
    assert_equal series_filters, series.filters
  end

  def test_show_edit_custom_report
    get :edit, params: { project_id: @project.identifier, id: @custom_report.id }
    assert_response :success
  end

  def test_update_custom_report
    old_series     = @custom_report.series.first
    series_name    = 'series2-1'
    series_filters = { 'status_id' => { operator: '=', values: ['1'] } }
    attrs          = {
      name:              'name2',
      description:       'description2',
      group_by:          'status',
      user_id:           @user.id,
      is_public:         true,
      chart_type:        'donut',
      series_attributes: {
        0 => {
          id:       old_series.id,
          _destroy: true
        },
        1 => {
          name: series_name,
          flt:  {
            f:  ['status_id'],
            op: { status_id: '=' },
            v:  { status_id: ['1'] }
          }
        }
      }
    }
    put :update, params: { project_id: @project.identifier, id: @custom_report.id, custom_report: attrs }
    assert_response :redirect
    @custom_report.reload
    assert_equal attrs[:description], @custom_report.description
    assert_equal attrs[:group_by], @custom_report.group_by
    assert_equal attrs[:user_id], @custom_report.user_id
    assert_equal attrs[:is_public], @custom_report.is_public
    assert_equal attrs[:chart_type], @custom_report.chart_type

    assert_equal 1, @custom_report.series.count
    series = @custom_report.series.first
    assert_equal series_name, series.name
    assert_equal series_filters, series.filters
  end

  def test_destroy_custom_report
    delete :destroy, params: { project_id: @project.identifier, id: @custom_report.id }
    assert_response :redirect
    custom_report = CustomReport.find_by_id @custom_report.id
    assert_nil custom_report
    assert_equal 0, CustomReportSeries.where(custom_report_id: @custom_report.id).count
  end

  # Mirrors the request that raised LocalJumpError on Rails 5.2:
  # nested series, status '*', empty trailing field and no values hash.
  def test_create_with_valueless_filter
    attributes = {
      name: 'All statuses', chart_type: 'stacked_bar', group_by: 'status',
      null_text: 'Null', is_public: '0',
      series_attributes: {
        '0' => { name: 'All', _destroy: 'false',
                 flt: { f: ['status_id', ''], op: { status_id: '*' } } }
      }
    }
    assert_difference 'CustomReport.count', 1 do
      post :create, params: { project_id: @project.identifier, custom_report: attributes }
    end
    assert_response :redirect
    report = @project.custom_reports.order(:id).last
    assert_equal 1, report.series.count
    assert_equal({'status_id' => {operator: '*', values: []}}, report.series.first.filters)
  end

  def test_update_with_valueless_filter
    row = @custom_report.series.first
    put :update, params: {
      project_id: @project.identifier, id: @custom_report.id,
      custom_report: { series_attributes: {
        '0' => { id: row.id, name: 'All',
                 flt: { f: ['status_id', ''], op: { status_id: '*' } } }
      } }
    }
    assert_response :redirect
    assert_equal({'status_id' => {operator: '*', values: []}}, row.reload.filters)
  end

  def test_multi_series_chart_is_rendered
    @custom_report.update!(chart_type: 'stacked_bar')
    get :show, params: { project_id: @project.identifier, id: @custom_report.id }
    assert_response :success
    assert_select '.custom-report-chart svg', 1
  end

  def test_invalid_create_renders_errors_and_sidebar
    assert_no_difference 'CustomReport.count' do
      post :create, params: { project_id: @project.identifier,
                             custom_report: { name: '', chart_type: 'pie' } }
    end
    assert_response :success
    assert_select '#errorExplanation'
  end

  def test_owner_and_project_cannot_be_reassigned
    put :update, params: { project_id: @project.identifier, id: @custom_report.id,
                          custom_report: { name: 'Renamed', user_id: 2, project_id: 2 } }
    assert_response :redirect
    assert_equal @user.id, @custom_report.reload.user_id
    assert_equal @project.id, @custom_report.project_id
  end

  def test_cannot_destroy_last_series
    put :update, params: {
      project_id: @project.identifier, id: @custom_report.id,
      custom_report: { series_attributes: {
        '0' => { id: @custom_report.series.first.id, _destroy: '1' }
      } }
    }
    assert_response :success
    assert_select '#errorExplanation'
    assert_equal 1, @custom_report.reload.series.count
  end

  def test_public_flag_requires_permission_on_update
    user = User.find(2)
    role = Role.generate!(permissions: [:view_custom_reports, :manage_custom_reports, :view_issues])
    member = Member.find_or_initialize_by(project: @project, user: user)
    member.roles = [role]
    member.save!
    @custom_report.update!(user: user, is_public: false)
    @request.session[:user_id] = user.id
    User.current = user

    put :update, params: { project_id: @project.identifier, id: @custom_report.id,
                          custom_report: { name: 'Still private', is_public: '1' } }
    assert_response :redirect
    assert_equal false, @custom_report.reload.is_public
    assert_equal 'Still private', @custom_report.name
  end
end
