#!/usr/bin/env python3
"""Compare official two-circle photographic rectification to earlier ellipse-only Charlie v0 estimate.
No optical writes; this does not fit track pitch or certify a physical Charlie calibration."""
import json,math,sys
from pathlib import Path
import numpy as np
root=Path(__file__).resolve().parent
raw=json.loads(Path(sys.argv[1]).read_text())
legacy=json.loads((root/'legacy-ellipse-comparison.json').read_text())
rr=np.arange(34.,48.001,.5)
def series(points,side):
    p=np.array(points,dtype=float)
    r=np.hypot(p[:,0],p[:,1])
    theta=np.unwrap(np.arctan2(p[:,1],p[:,0]))
    offset=-np.pi/2 if side=='top' else np.pi/2
    theta=np.unwrap(theta-offset)
    idx=np.argsort(r)
    r,theta=r[idx],theta[idx]
    if min(r)>34 or max(r)<48:
        raise RuntimeError(f"Boundary {side} does not span 34..48mm (actual {min(r):.2f}..{max(r):.2f})")
    return np.rad2deg(np.interp(rr,r,theta)-np.interp(45,r,theta))
rep={'radiusMm':list(map(float,rr)),'source':'DiscImageStudio CalibrationPhotoRectifier.Fit','photographsPublished':False,'photoRectificationOnly':True,'discs':{}}
for n in ('Alpha','Bravo'):
    d=raw[n]
    if d['outerRmsPx']>18 or d['holeRmsPx']>18:
        raise RuntimeError(f"{n} source contours do not support a stable photo correction: {d['outerRmsPx']:.2f}, {d['holeRmsPx']:.2f}px")
    top=series(d['boundaryMm']['top'],'top')
    bottom=series(d['boundaryMm']['bottom'],'bottom')
    mean=(top+bottom)*.5
    x=legacy[n]
    old=np.interp(rr,np.array(x['r']),np.array(x['relative']))
    diff=float(np.sqrt(np.mean((mean-old)**2)))
    asym=float(np.sqrt(np.mean((top-bottom)**2)))
    rep['discs'][n]={'rimRmsPx':d['outerRmsPx'],'holeRmsPx':d['holeRmsPx'],'topDeg':top.tolist(),'bottomDeg':bottom.tolist(),'officialRelativeDeg':mean.tolist(),'ellipseRelativeDeg':old.tolist(),'ossVsEllipseRmsDeg':diff,'topBottomDisagreementRmsDeg':asym}
    print(f"{n}: official two-circle fit rim={d['outerRmsPx']:.2f}px hole={d['holeRmsPx']:.2f}px; vs prior ellipse RMS={diff:.3f}deg; top-bottom discrepancy={asym:.3f}deg")
a=np.array(rep['discs']['Alpha']['officialRelativeDeg'])
b=np.array(rep['discs']['Bravo']['officialRelativeDeg'])
rep['twoDiscOfficialPhoto']={'correlation':float(np.corrcoef(a,b)[0,1]),'rmsDifferenceDeg':float(np.sqrt(np.mean((a-b)**2)))}
rep['previousEllipsePhoto']={'correlation':.9665966910975796,'rmsDifferenceDeg':.43353069933969646}
rep['warning']='Fitting the source photograph plane is not the same as independently fitting disc geometry and pitch. The boundary trace and ring/hole point selection are provisional; no Charlie write claimed.'
out=Path(sys.argv[2]);out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps(rep,indent=2,ensure_ascii=False)+'\n')
with (out.parent/'comparison.csv').open('w') as f:
 f.write('radius_mm,alpha_upstream_rectified_deg,bravo_upstream_rectified_deg,alpha_prior_ellipse_deg,bravo_prior_ellipse_deg\n')
 for i,r in enumerate(rr):f.write(f"{r:.1f},{a[i]:.6f},{b[i]:.6f},{rep['discs']['Alpha']['ellipseRelativeDeg'][i]:.6f},{rep['discs']['Bravo']['ellipseRelativeDeg'][i]:.6f}\n")
# Compare official photo-rectification-based angular residual to the
# prior conservative Charlie v0 additional correction. These are both
# provisional; neither is a physically validated pitch calibration.
v0={34:-.0196,35:-.226,36:-.455,37:-.545,38:-.590,39:-.593,40:-.553,
    41:-.475,42:-.368,43:-.246,44:-.121,45:0.,46:.110,47:.201,48:.195}
comp=[]
for radius in (34,35,36,38,40,42,45,47,48):
    i=int(round((radius-34)*2))
    prior=float(v0[radius])
    shared=float(.65*a[i]+.35*b[i])
    proposed=.65*shared
    comp.append({'radiusMm':radius,'alphaOssResidualDeg':round(float(a[i]),4),
      'bravoOssResidualDeg':round(float(b[i]),4),'ossProvisionalDelta65Deg':round(proposed,4),
      'charlieV0DeltaDeg':prior,'differenceOssVsV0Deg':round(proposed-prior,4)})
rep['selectedRadiusComparison']=comp
out.write_text(json.dumps(rep,indent=2,ensure_ascii=False)+'\n')
print('RADIUS   ALPHA-OSS  BRAVO-OSS  OSS-DELTA65  CHARLIE-V0  DIFF',flush=True)
for v in comp:
    print(f"{v['radiusMm']:>3} mm  {v['alphaOssResidualDeg']:>+9.4f}  {v['bravoOssResidualDeg']:>+9.4f}   {v['ossProvisionalDelta65Deg']:>+9.4f}   {v['charlieV0DeltaDeg']:>+9.4f}  {v['differenceOssVsV0Deg']:>+9.4f}",flush=True)
print('OSS_COMPARISON_COMPLETE',rep['twoDiscOfficialPhoto'])
