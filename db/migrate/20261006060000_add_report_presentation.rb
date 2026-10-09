class AddReportPresentation < ActiveRecord::Migration[4.2]
  def up
    add_column :custom_reports, :show_values, :boolean, default: false, null: false
    add_column :custom_reports, :bar_mode, :string, default: '', null: false
    add_column :custom_reports, :column_by, :string, default: '', null: false
    execute "UPDATE custom_reports SET chart_type = 'donut' WHERE chart_type = 'undev_pie'"
  end

  def down
    # Converted reports remain ordinary donuts; user data is not deleted.
    execute "UPDATE custom_reports SET chart_type = 'stacked_bar' WHERE chart_type IN ('table', 'heatmap')"
    remove_column :custom_reports, :column_by
    remove_column :custom_reports, :bar_mode
    remove_column :custom_reports, :show_values
  end
end
