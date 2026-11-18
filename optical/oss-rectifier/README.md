# Alpha / Bravo: upstream DiscImageStudio photographic correction comparison

Runs the **unmodified** open-source `DiscImageStudio.Core.Calibration.CalibrationPhotoRectifier.Fit` on coordinate-only inputs. Upstream commit pinned to `28310c8700646808bffa434feb2db68ab2c26a50`.

The input JSON archives only pixel coordinates of the two DVDs: 20 detected outer physical-rim points, 20 physical 15mm hole points, and sampled upper/lower black-white boundary traces per disc. It also includes the earlier ellipse-based Charlie v0 relative-angle trace. Original photographs with hands/background are **not published**.

1. Official fitting jointly rectifies outer circle (physical radius 60mm) and center bore (radius 7.5mm) to disc coordinates.
2. Using the same measured boundary pixels for each disc, calculate upper and lower boundary angle relative to 45mm radius over r=34..48mm.
3. Compare official homography to previous ellipse-only approximation, per-disc upper/lower agreement and Alpha/Bravo correlation.
4. Fail closed when upstream fitting fails or geometric RMS exceeds 18 pixels; do not claim media geometry or correction success.

**Important:** This tests upstream **photo rectification** only, not official `CalibrationBoundaryFitter` for a matching reference target. Alpha/Bravo used a custom pattern, not the upstream `WavyBoundary` or `ReferenceCross` calibration target. No radii/pitch coefficients are automatically updated. The coordinate extraction is provisional (reflections and centering can bias it), and the photographic samples are correlated.

The GitHub-hosted runner has no optical drive; the workflow never opens or writes a disc.
