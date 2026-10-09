Redmine::Plugin.register :redmine_custom_reports do
  name 'Redmine Custom Reports (with charts) plugin'
  author 'Restream / Konstantin Kolchanov'
  description 'Redmine plugin for custom reports with charts'
  version '0.2.0.rc1'
  requires_redmine version_or_higher: '4.2.0'
  url 'https://github.com/kkol4anov/redmine_custom_reports'
  author_url 'https://github.com/Restream'

  settings default: {'bar_mode' => 'stacked'}, partial: 'settings/custom_reports'

  project_module :custom_reports do
    permission :manage_custom_reports,
                { custom_reports: [:new, :create, :edit, :update, :destroy] }
    permission :view_custom_reports, { custom_reports: [:index, :show] }
    permission :manage_public_custom_reports, {}
  end

  menu :project_menu,
       :custom_reports,
       { controller: 'custom_reports', action: 'index' },
       param:  :project_id,
       before: :settings
end

# Require plugin after register
require 'redmine_custom_reports'
