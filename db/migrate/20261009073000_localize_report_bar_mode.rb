class LocalizeReportBarMode < ActiveRecord::Migration[4.2]
  def up
    # Preserve explicit report choices; old inherited values now mean Stacked.
    execute "UPDATE custom_reports SET bar_mode = 'stacked' WHERE bar_mode IS NULL OR bar_mode = ''"
    change_column_default :custom_reports, :bar_mode, 'stacked'
  end

  def down
    change_column_default :custom_reports, :bar_mode, ''
  end
end
