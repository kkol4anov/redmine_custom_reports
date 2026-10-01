class CustomReport < ActiveRecord::Base
  CHART_TYPES  = %w(undev_pie pie donut bar horizontal_bar stacked_bar)
  MULTI_SERIES = %w(horizontal_bar stacked_bar)

  belongs_to :project
  belongs_to :user
  has_many :series, class_name: 'CustomReportSeries',
                    inverse_of: :custom_report, dependent: :destroy

  validates_presence_of :project
  validates_presence_of :user
  validates_presence_of :name
  validates_presence_of :group_by
  validates_presence_of :null_text
  validates_inclusion_of :chart_type, in: CHART_TYPES

  validates_associated :series

  validate :valid_grouping
  validate :at_least_one_series

  accepts_nested_attributes_for :series, allow_destroy: true

  scope :visible, lambda { |*args|
    user    = args.shift || User.current
    user_id = user.logged? ? user.id : 0
    where "(#{table_name}.is_public = ? OR #{table_name}.user_id = ?)", true, user_id
  }

  scope :by_name, -> { order('name') }

  def groupable_columns
    QueryExt.new(project: project).groupable_columns
  end

  def info
    {
      chart_type:       chart_type,
      group_by_caption: group_by_column.try(:caption),
      series_count:     series.count,
      multi_series:     multi_series?
    }
  end

  def multi_series?
    MULTI_SERIES.include?(chart_type)
  end

  def data
    rows = series.to_a
    hashes = rows.map(&:data_hash)
    keys = multi_series? ? hashes.flat_map(&:keys).uniq : []
    rows.each_with_index.map { |row, index| row.data(keys, hashes[index]) }
  end

  def allowed_to_manage?(user = User.current)
    user.allowed_to?(:manage_custom_reports, project) &&
      (is_public? ? user.allowed_to?(:manage_public_custom_reports, project) : user_id == user.id)
  end

  def group_by_column
    groupable_columns.detect { |col| col.name.to_s == group_by }
  end

  private

  def valid_grouping
    errors.add(:group_by, :invalid) if group_by.present? && !group_by_column
  end

  def at_least_one_series
    if series.reject(&:marked_for_destruction?).empty?
      errors.add(:base, :custom_report_series_required)
    end
  end
end
