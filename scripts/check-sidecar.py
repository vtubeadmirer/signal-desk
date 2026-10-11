"""Exercise the frozen sidecar so missing embedded learning data fails CI."""
import json
import os
import subprocess
import sys
from pathlib import Path

binary=Path(sys.argv[1]).resolve(strict=True)
request={'op':'collect','stream':'news','sources':[], 'negative_rules':[{'kind':'topic','terms':['football_live'],'weight':40,'stream':'news'}]}
result=subprocess.run([str(binary)],input=json.dumps(request)+'\n',capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=30,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
if result.returncode:
    raise RuntimeError('Packaged sidecar failed: '+result.stderr[-2000:])
response=json.loads(result.stdout.strip())
if not response.get('ok') or response.get('candidates') != [] or response.get('negative_stats') != {'suppressed':0,'demoted':0}:
    raise RuntimeError('Unexpected packaged sidecar response: '+repr(response))
print('Packaged sidecar IPC and embedded learning dictionary passed.')
