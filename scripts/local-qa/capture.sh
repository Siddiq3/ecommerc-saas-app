#!/bin/zsh
# capture.sh <name> <shots> <tab-index> <tab-y>: tap a bottom tab (0-based, of 6 evenly spaced), scroll to the top,
# then save <shots> screenshots while scrolling down, to mobile/.local-qa/shots/<name>_N.png.
export PATH=$PATH:~/Library/Android/sdk/platform-tools
Q=${0:A:h}; S=${Q:h:h}/.local-qa/shots; mkdir -p $S
name=$1; shots=${2:-4}; tab=${3:-1}; tab_y=$4
read W H <<< $(adb shell wm size | tail -1 | sed -E 's/.*: ([0-9]+)x([0-9]+).*/\1 \2/')
[ -n "$tab_y" ] && { adb shell input tap $(( W * (2*tab+1) / 12 )) $tab_y; sleep 3; }
for i in 1 2 3 4 5; do adb shell input swipe $((W/2)) $((H/4)) $((W/2)) $((H*9/10)) 120; done; sleep 2
for n in $(seq 1 $shots); do
  adb exec-out screencap -p > $S/${name}_$n.png; sips -Z 900 $S/${name}_$n.png >/dev/null
  adb shell input swipe $((W/2)) $((H*8/10)) $((W/2)) $((H*3/10)) 700; sleep 1.5
done
echo "saved $shots shots to $S (${W}x${H})"
