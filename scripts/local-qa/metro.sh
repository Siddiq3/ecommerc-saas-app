#!/bin/zsh
# Restart Metro with a clean cache and reopen the app in Expo Go on the emulator.
# Metro's file watcher did not pick up edits on this machine, so restart after every change you want to see.
Q=${0:A:h}; M=${Q:h:h}; D=$M/.local-qa; mkdir -p $D; export PATH=$PATH:~/Library/Android/sdk/platform-tools
pkill -f "expo start" ; sleep 2
(cd $M && CI=1 nohup npx expo start --localhost --port 8081 --clear > $D/metro.log 2>&1 &)
sleep 15; for p in 8081 8795 3004; do adb reverse tcp:$p tcp:$p >/dev/null; done
adb shell am force-stop host.exp.exponent; sleep 1
adb shell am start -a android.intent.action.VIEW -d "exp://localhost:8081" host.exp.exponent >/dev/null
for i in $(seq 1 40); do grep -q "Bundled" $D/metro.log && break; sleep 3; done
grep "Bundled" $D/metro.log | tail -1 | cut -c1-90
