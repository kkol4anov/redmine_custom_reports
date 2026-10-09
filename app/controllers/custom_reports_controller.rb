class CustomReportsController < ApplicationController
  before_action :find_project_by_project_id
  before_action :authorize
  before_action :find_custom_reports, only: [:index, :show, :new, :create, :edit, :update]
  before_action :find_custom_report, only: [:show, :edit, :update, :destroy]
  before_action :authorize_to_manage, only: [:edit, :update, :destroy]

  helper :queries
  include QueriesHelper

  def index
  end

  def show
    if @custom_report.table? && @custom_report.valid?
      @report_tables = @custom_report.tables
    end
  rescue QueryExt::ReportTooLarge
    @report_error = l(:label_report_too_large)
  end

  def new
    @custom_report = @project.custom_reports.build
    if params[:copy_from].present?
      source = @project.custom_reports.visible.find(params[:copy_from])
      @custom_report.assign_attributes(source.attributes.slice(
        'name', 'description', 'chart_type', 'group_by', 'null_text',
        'show_values', 'bar_mode', 'column_by'))
      @custom_report.is_public = source.is_public? &&
        User.current.allowed_to?(:manage_public_custom_reports, @project)
      source.series.each do |series|
        @custom_report.series.build(name: series.name, filters: series.filters.deep_dup)
      end
    end
    @custom_report.series.build if @custom_report.series.empty?
  end

  def create
    @custom_report = @project.custom_reports.build(custom_report_params)
    @custom_report.user = User.current

    if @custom_report.save
      redirect_to url_for(
        controller: 'custom_reports',
        action:     'show', project_id: @project, id: @custom_report.id),
        notice: l(:message_custom_reports_created)
    else
      render action: 'new'
    end
  end

  def edit
    @custom_report.series.build if @custom_report.series.empty?
  end

  def update
    if @custom_report.update(custom_report_params)
      redirect_to url_for(
        controller: 'custom_reports',
        action:     'show', project_id: @project, id: @custom_report.id),
        notice: l(:message_custom_reports_updated)
    else
      render action: 'edit'
    end
  end

  def destroy
    if @custom_report.destroy
      flash[:notice] = l(:message_custom_reports_destroyed)
    else
      flash[:alert] = l(:message_custom_reports_not_destroyed)
    end
    redirect_to project_custom_reports_url(@project)
  end

  private

  def custom_report_params
    input = params.require(:custom_report)
    attrs = input.permit(:name, :description, :chart_type, :group_by, :null_text,
                         :show_values, :bar_mode, :column_by).to_h
    if User.current.allowed_to?(:manage_public_custom_reports, @project)
      attrs[:is_public] = input[:is_public] if input.key?(:is_public)
    end

    # Filter names are dynamic (custom fields), but their structure is fixed.
    # Do not permit raw serialized filters, user_id or project_id.
    nested = input[:series_attributes]
    if nested.is_a?(ActionController::Parameters)
      # Rails 5.2 Parameters#each_pair requires a block, unlike Hash#each_pair.
      series_attributes = {}
      nested.each_pair do |key, row|
        next unless row.is_a?(ActionController::Parameters)
        item = row.permit(:id, :name, :_destroy).to_h
        flt = row[:flt]
        if flt.is_a?(ActionController::Parameters)
          fields = flt.permit(f: [])[:f] || []
          operators = flt[:op]
          values = flt[:v]
          item[:flt] = {f: fields, op: {}, v: {}}
          fields.each do |field|
            next unless operators.is_a?(ActionController::Parameters)
            operator = operators[field]
            next unless operator.is_a?(String)
            item[:flt][:op][field] = operator
            value = values.is_a?(ActionController::Parameters) ? values[field] : nil
            item[:flt][:v][field] = Array(value).select { |v| v.is_a?(String) }
          end
        end
        series_attributes[key] = item
      end
      attrs[:series_attributes] = series_attributes
    end
    attrs
  end

  def find_custom_reports
    @custom_reports = @project.custom_reports.visible.by_name
    grouped_reports = @custom_reports.group_by(&:is_public)
    @own_custom_reports = grouped_reports[false]
    @public_custom_reports = grouped_reports[true]
  end

  def find_custom_report
    @custom_report = @project.custom_reports.visible.find(params[:id])
  end

  def authorize_to_manage
    @custom_report.allowed_to_manage? || deny_access
  end
end
