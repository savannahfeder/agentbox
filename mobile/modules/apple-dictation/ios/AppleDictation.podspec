Pod::Spec.new do |s|
  s.name           = 'AppleDictation'
  s.version        = '1.0.0'
  s.summary        = "Live dictation with Apple's on-device SpeechAnalyzer"
  s.description    = "Live dictation with Apple's on-device SpeechAnalyzer, on iOS 26 and newer iPhones."
  s.license        = 'MIT'
  s.author         = 'Agentbox'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.frameworks     = 'Speech', 'AVFoundation'

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
