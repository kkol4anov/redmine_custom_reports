class CustomReport < ActiveRecord::Base
  CHART_TYPES  = %w(pie donut bar horizontal_bar stacked_bar table heatmap)
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

  validates_inclusion_of :bar_mode, in: ['', 'stacked', 'grouped']
  validate :valid_table_columns

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
      show_values:      show_values?,
      bar_mode:         effective_bar_mode,
      labels:           %w(stacked grouped values total empty rows columns swap table overlap heatmap layout series).each_with_object({}) { |key, h| h[key] = I18n.t("label_report_#{key}") },
      group_by_caption: group_by_column.try(:caption),
      series_count:     series.count,
      multi_series:     multi_series?
    }
  end

  def effective_bar_mode
    bar_mode == 'grouped' ? 'grouped' : 'stacked'
  end

  def table?
    %w(table heatmap).include?(chart_type)
  end

  def table_columns
    QueryExt.new(project: project).report_groupable_columns
  end

  def tables
    if column_by.present?
      series.map do |row|
        counts = row.query.report_matrix_counts(group_by, column_by)
        row_keys = counts.keys.map(&:first).uniq
        column_keys = counts.keys.map(&:last).uniq
        ensure_table_size(row_keys.size, column_keys.size)
        {
          name: row.name,
          row_caption: group_by_column.caption,
          column_caption: table_columns.detect { |c| c.name.to_s == column_by }.caption,
          rows: axis_labels(row_keys), columns: axis_labels(column_keys),
          values: row_keys.map { |r| column_keys.map { |c| counts.fetch([r, c], 0) } },
          overlapping: false
        }
      end
    else
      rows = series.to_a
      hashes = rows.map(&:data_hash)
      keys = hashes.flat_map(&:keys).uniq
      ensure_table_size(keys.size, rows.size)
      [{name: name, row_caption: group_by_column.caption,
        column_caption: I18n.t(:field_series_name), rows: axis_labels(keys),
        columns: rows.map(&:name),
        values: keys.map { |key| hashes.map { |h| h.fetch(key, 0) } },
        overlapping: rows.size > 1}]
    end
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

  def ensure_table_size(rows, columns)
    raise QueryExt::ReportTooLarge if rows * columns > QueryExt::MAX_REPORT_CELLS
  end

  def axis_labels(keys)
    labels = keys.map { |key| key.nil? || key == '' ? null_text : key.to_s }
    frequencies = labels.each_with_object(Hash.new(0)) { |label, h| h[label] += 1 }
    labels.each_with_index.map do |label, i|
      frequencies[label] > 1 ? "#{label} [#{keys[i].respond_to?(:id) ? keys[i].id : i + 1}]" : label
    end
  end

  def valid_table_columns
    return unless table?
    names = table_columns.map { |column| column.name.to_s }
    errors.add(:group_by, :invalid) unless names.include?(group_by)
    if column_by.present? && (!names.include?(column_by) || column_by == group_by)
      errors.add(:column_by, :invalid)
    end
  end

  def valid_grouping
    errors.add(:group_by, :invalid) if group_by.present? && !group_by_column
  end

  def at_least_one_series
    if series.reject(&:marked_for_destruction?).empty?
      errors.add(:base, :custom_report_series_required)
    end
  end
end
