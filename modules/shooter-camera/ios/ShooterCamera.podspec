Pod::Spec.new do |s|
  s.name           = 'ShooterCamera'
  s.version        = '0.1.0'
  s.summary        = 'Native camera engine for Shooter.'
  s.description    = 'AVFoundation-backed camera preview, manual controls, capability discovery, and RAW capture for Shooter.'
  s.author         = 'Aera Labs'
  s.homepage       = 'https://github.com/CLIdaho/Shooter'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => 'https://github.com/CLIdaho/Shooter.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,mm,swift}'
  s.swift_version = '5.9'
end
