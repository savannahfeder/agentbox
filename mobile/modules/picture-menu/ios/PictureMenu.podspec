Pod::Spec.new do |s|
  s.name           = 'PictureMenu'
  s.version        = '1.0.0'
  s.summary        = "iOS's own menu on a held picture"
  s.description    = "Save to Photos, Copy and Share on a held picture, through UIContextMenuInteraction."
  s.license        = 'MIT'
  s.author         = 'Agentbox'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
