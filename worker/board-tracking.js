/*
Portions adapted from OCULA, https://github.com/revolutionarybukhari/ocula
Source revision 7b0d9495564161b37f114cec4205975549d34603

MIT License

Copyright (c) 2026 Husnain Bukhari

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
const faceMeshBase='https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619';
let faceMeshScript;

function loadFaceMesh() {
  if (window.FaceMesh) return Promise.resolve(window.FaceMesh);
  faceMeshScript ??= new Promise((resolve,reject) => {
    const script=document.createElement('script');
    script.src=faceMeshBase+'/face_mesh.js';
    script.crossOrigin='anonymous';
    script.onload=()=>window.FaceMesh ? resolve(window.FaceMesh) : reject(new Error('Face Mesh unavailable'));
    script.onerror=()=>reject(new Error('Face Mesh unavailable'));
    document.head.append(script);
  }).catch(error=>{faceMeshScript=null; throw error;});
  return faceMeshScript;
}

async function createFaceTracker(onGaze) {
  const FaceMesh=await loadFaceMesh();
  const tracker=new FaceMesh({locateFile:file=>faceMeshBase+'/'+file});
  try {
    tracker.setOptions({
      maxNumFaces:1, refineLandmarks:true,
      minDetectionConfidence:.5, minTrackingConfidence:.5
    });
    tracker.onResults(result=>{
      const mesh=result.multiFaceLandmarks?.[0];
      const raw=mesh && gazeFromLandmarks(mesh);
      // Match the horizontal sign used by OCULA before applying calibration.
      const valid=Number.isFinite(raw?.x) && Number.isFinite(raw?.y);
      onGaze(valid ? {x:-raw.x,y:raw.y} : null);
    });
    await tracker.initialize();
    return tracker;
  } catch (error) {
    await tracker.close();
    throw error;
  }
}

function sampleMedian(samples) {
  const median=values=>{
    const sorted=values.sort((a,b)=>a-b);
    const i=Math.floor(sorted.length/2);
    return sorted.length%2 ? sorted[i] : (sorted[i-1]+sorted[i])/2;
  };
  return {x:median(samples.map(sample=>sample.x)),y:median(samples.map(sample=>sample.y))};
}

function gazeFromLandmarks(lm) {
  const eye = (outerIdx, innerIdx, topIdx, botIdx, irisIdx) => {
    const outer = lm[outerIdx], inner = lm[innerIdx];
    const top   = lm[topIdx],   bot   = lm[botIdx];
    const iris  = lm[irisIdx];
    if (!iris) return null;
    // eye center = midpoint of inner/outer corners
    const cx = (outer.x + inner.x) / 2;
    const cy = (top.y + bot.y) / 2;
    const w  = Math.hypot(outer.x - inner.x, outer.y - inner.y) || 1;
    const h  = Math.hypot(top.y - bot.y, top.x - bot.x) || 1;
    // iris position relative to eye center, normalized to eye size
    return {
      x: (iris.x - cx) / w,
      y: (iris.y - cy) / h,
    };
  };
  const g1 = eye(33,  133, 159, 145, 468);
  const g2 = eye(263, 362, 386, 374, 473);
  if (!g1 || !g2) return null;
  return { x: (g1.x + g2.x) / 2, y: (g1.y + g2.y) / 2 };
}

function fitAffine(points) {
  // Build sums for normal equations (3x3 symmetric matrix)
  let m00 = 0, m01 = 0, m02 = 0, m11 = 0, m12 = 0, m22 = 0;
  let bx0 = 0, bx1 = 0, bx2 = 0, by0 = 0, by1 = 0, by2 = 0;
  for (const p of points) {
    const gx = p.gaze.x, gy = p.gaze.y;
    const sx = p.screen.x, sy = p.screen.y;
    m00 += gx * gx; m01 += gx * gy; m02 += gx;
                    m11 += gy * gy; m12 += gy;
                                    m22 += 1;
    bx0 += gx * sx; bx1 += gy * sx; bx2 += sx;
    by0 += gx * sy; by1 += gy * sy; by2 += sy;
  }
  const det3 = (a, b, c, d, e, f, g, h, i) =>
    a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  const D = det3(m00, m01, m02, m01, m11, m12, m02, m12, m22);
  if (Math.abs(D) < 1e-10) return null;

  const ax = det3(bx0, m01, m02, bx1, m11, m12, bx2, m12, m22) / D;
  const bx = det3(m00, bx0, m02, m01, bx1, m12, m02, bx2, m22) / D;
  const cx = det3(m00, m01, bx0, m01, m11, bx1, m02, m12, bx2) / D;
  const ay = det3(by0, m01, m02, by1, m11, m12, by2, m12, m22) / D;
  const by = det3(m00, by0, m02, m01, by1, m12, m02, by2, m22) / D;
  const cy = det3(m00, m01, by0, m01, m11, by1, m02, m12, by2) / D;

  return (gx, gy) => ({
    x: ax * gx + bx * gy + cx,
    y: ay * gx + by * gy + cy,
  });
}

