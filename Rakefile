task :default => [:restart]

task :restart do
  sh "meteor deploy livebus.meteor.com --delete && meteor deploy livebus.meteor.com"
end
