class CustomReportSeries < ActiveRecord::Base
  serialize :filters, Hash

  belongs_to :custom_report, inverse_of: :series

  validates :name, presence: true
  validate :valid_filters

  def query
    build_query
  end

  def data(data_keys = [], counts = data_hash)
    keys = data_keys.empty? ? counts.keys : data_keys
    {
      key: name,
      values: keys.map do |key|
        { label: data_label_text(key), value: counts.fetch(key, 0) }
      end
    }
  end

  def data_hash
    report_query = query
    return {} unless report_query.valid?

    report_query.result_count_by_group || {}
  end

  # Only normalized filter parameters reach this virtual attribute.
  def flt=(attributes)
    attributes = attributes.with_indifferent_access
    report_query = query
    report_query.filters = {}
    report_query.add_filters(attributes[:f], attributes[:op], attributes[:v])
    self.filters = report_query.filters
  end

  private

  def build_query
    QueryExt.new(
      name: name.presence || 'Custom report',
      filters: (filters || {}).deep_dup,
      group_by: custom_report.try(:group_by),
      project: custom_report.try(:project))
  end

  def valid_filters
    report_query = query
    unless report_query.valid?
      report_query.errors.full_messages.each { |message| errors.add(:base, message) }
    end
  end

  def data_label_text(label)
    (label.present? ? label : custom_report.null_text).to_s
  end
end
