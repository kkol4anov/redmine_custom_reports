# Keep the historical class name for existing plugin installations.
class QueryExt < IssueQuery
  validate :supported_report_filters
  # Redmine 4 uses group_by_statement rather than the groupable attribute
  # for custom fields. Extend only this query's column instances.
  module StringGrouping
    def group_by_statement
      custom_field.order_statement
    end
  end

  def available_columns
    super.each do |column|
      next unless column.is_a?(QueryCustomFieldColumn)
      field = column.custom_field
      if field.field_format == 'string' && !field.multiple?
        column.extend(StringGrouping) unless column.is_a?(StringGrouping)
      end
    end
  end

  private

  # A removed field or an unsupported operator must not silently widen a report.
  def supported_report_filters
    (filters || {}).each_key do |field|
      type = type_for(field)
      unless type && Array(Query.operators_by_filter_type[type]).include?(operator_for(field))
        errors.add(:filters, :invalid)
      end
    end
  end
end
