#!/bin/zsh
# Switch the emulator to one cell of the Android test matrix, then reopen the app.
# Usage: matrix.sh small|small-large|standard|standard-large|default|tablet|tablet-landscape|reset
export PATH=$PATH:~/Library/Android/sdk/platform-tools
case $1 in
  small)            size=720x1280;  dpi=360; font=1.0 ;;  # 320 x 569 dp
  small-large)      size=720x1280;  dpi=360; font=1.3 ;;  # worst case
  standard)         size=reset;     dpi=480; font=1.0 ;;  # 360 dp wide
  standard-large)   size=reset;     dpi=480; font=1.3 ;;
  default)          size=reset;     dpi=reset; font=1.0 ;; # 411 dp (Medium Phone AVD)
  tablet)           size=1600x2560; dpi=320; font=1.0 ;;  # 800 x 1280 dp
  tablet-landscape) size=2560x1600; dpi=320; font=1.0 ;;  # Android 16 ignores portrait locks on large screens
  reset)            size=reset;     dpi=reset; font=1.0 ;;
  *) echo "usage: $0 small|small-large|standard|standard-large|default|tablet|tablet-landscape|reset"; exit 1 ;;
esac
adb shell wm size $size; adb shell wm density $dpi; adb shell settings put system font_scale $font
sleep 6; for p in 8081 8795 3004; do adb reverse tcp:$p tcp:$p >/dev/null; done
adb shell am start -a android.intent.action.VIEW -d "exp://localhost:8081" host.exp.exponent >/dev/null
adb shell wm size | tail -1; adb shell wm density | tail -1; echo "font_scale $font"
