# Rails reloads application models in development; reattach associations once.
Rails.application.config.to_prepare do
  require_dependency 'project'
  require_dependency 'user'
  require_dependency 'redmine_custom_reports/project_patch'
  require_dependency 'redmine_custom_reports/user_patch'

  unless Project.included_modules.include?(RedmineCustomReports::ProjectPatch)
    Project.send :include, RedmineCustomReports::ProjectPatch
  end
  unless User.included_modules.include?(RedmineCustomReports::UserPatch)
    User.send :include, RedmineCustomReports::UserPatch
  end
end
