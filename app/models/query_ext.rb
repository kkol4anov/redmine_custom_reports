# Keep the historical class name for existing plugin installations.
class QueryExt < IssueQuery
  MAX_REPORT_CELLS = 20_000
  class ReportTooLarge < StandardError; end
  REPORT_DIMENSIONS = %w(project tracker status priority author assigned_to category fixed_version
                         start_date due_date done_ratio created_on updated_on closed_on).freeze

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

  def report_groupable_columns
    groupable_columns.select do |column|
      if column.is_a?(QueryCustomFieldColumn)
        !column.custom_field.multiple?
      else
        REPORT_DIMENSIONS.include?(column.name.to_s)
      end
    end
  end

  # Aggregate two dimensions in SQL, preserving Issue.visible and query filters.
  # Only Redmine column definitions supply SQL; request strings are never SQL.
  def report_matrix_counts(row_name, column_name)
    raise ArgumentError, 'Invalid report filters' unless valid?
    columns = [row_name, column_name].map do |name|
      report_groupable_columns.detect { |column| column.name.to_s == name.to_s }
    end
    if columns.any?(&:nil?) || row_name == column_name || columns.any? { |c| c.is_a?(QueryCustomFieldColumn) && c.custom_field.multiple? }
      raise ArgumentError, 'Invalid report dimensions'
    end
    associations = {'project' => Project, 'tracker' => Tracker, 'status' => IssueStatus,
                    'priority' => IssuePriority, 'author' => User, 'assigned_to' => Principal,
                    'category' => IssueCategory, 'fixed_version' => Version}
    expressions = columns.map do |column|
      name = column.name.to_s
      associations.key?(name) ? "#{Issue.table_name}.#{name}_id" :
        (column.is_a?(QueryCustomFieldColumn) || column.is_a?(TimestampQueryColumn) ?
          column.group_by_statement : "#{Issue.table_name}.#{name}")
    end
    scope = base_scope.joins(joins_for_order_statement(expressions.join(',')))
    columns.grep(QueryCustomFieldColumn).each do |column|
      scope = scope.where(column.custom_field.visibility_by_project_condition)
    end
    raw = scope.group(*expressions).limit(MAX_REPORT_CELLS + 1).distinct.count("#{Issue.table_name}.id")
    raise ReportTooLarge if raw.size > MAX_REPORT_CELLS
    lookups = columns.each_with_index.map do |column, index|
      model = associations[column.name.to_s]
      model ? model.where(id: raw.keys.map { |key| key[index] }.compact.uniq).index_by(&:id) : nil
    end
    raw.each_with_object(Hash.new(0)) do |(keys, count), result|
      cast = keys.each_with_index.map do |key, index|
        column = columns[index]
        if lookups[index]
          lookups[index][key]
        elsif column.is_a?(QueryCustomFieldColumn)
          column.custom_field.cast_value(key)
        else
          key
        end
      end
      result[cast] += count
    end
  rescue ::ActiveRecord::StatementInvalid => e
    raise ::Query::StatementInvalid.new(e.message)
  end

  private

  # A removed field or an unsupported operator must not silently widen a report.
  def supported_report_filters
    (filters || {}).each_key do |field|
      type = type_for(field)
      unless type && Array(::Query.operators_by_filter_type[type]).include?(operator_for(field))
        errors.add(:filters, :invalid)
      end
    end
  end
end
