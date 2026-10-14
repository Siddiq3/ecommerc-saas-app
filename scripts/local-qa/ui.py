# Lists visible UI elements (text / content-desc) with their tap centre.
# Deletes the old dump first (a failed dump must never return stale text) and retries: uiautomator fails while the UI
# animates. On a busy screen it can still fail; then tap by position from a screenshot instead.
import re, subprocess, time
xml = ''
for _ in range(8):
    subprocess.run(['adb', 'shell', 'rm', '-f', '/sdcard/ui.xml'], capture_output=True)
    subprocess.run(['adb', 'shell', 'uiautomator', 'dump', '/sdcard/ui.xml'], capture_output=True, timeout=20)
    xml = subprocess.run(['adb', 'shell', 'cat', '/sdcard/ui.xml'], capture_output=True, text=True).stdout
    if '<node' in xml: break
    time.sleep(1)
for node in re.findall(r'<node [^>]*>', xml):
    a = dict(re.findall(r'([\w-]+)="([^"]*)"', node))
    label = a.get('text') or a.get('content-desc')
    if not label: continue
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', a['bounds']))
    print(f"({(x1+x2)//2},{(y1+y2)//2}) {a.get('class','').split('.')[-1]}: {label[:90]}")
