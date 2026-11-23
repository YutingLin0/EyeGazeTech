const visionBase = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18';
const faceModel = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
let vision;

async function createFaceTracker() {
  vision ??= import(visionBase + '/vision_bundle.mjs')
    .then(async ({FaceLandmarker, FilesetResolver}) => ({
      FaceLandmarker, files: await FilesetResolver.forVisionTasks(visionBase + '/wasm')
    }))
    .catch(error => { vision = null; throw error; });
  const {FaceLandmarker, files} = await vision;
  const create = delegate => FaceLandmarker.createFromOptions(files, {
    baseOptions: {modelAssetPath: faceModel, delegate},
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true
  });
  try { return await create('GPU'); }
  catch { return create('CPU'); }
}

// Iris combines eye-look blendshapes and a smaller head-pose contribution.
function attention(result) {
  const categories = result.faceBlendshapes?.[0]?.categories;
  if (!categories?.length) return null;
  const scores = Object.fromEntries(categories.map(({categoryName, score}) => [categoryName, score]));
  const score = name => scores[name] ?? 0;
  const blink = Math.max(score('eyeBlinkLeft'), score('eyeBlinkRight')) > .55;
  const eyesX = (score('eyeLookInLeft') + score('eyeLookOutRight') - score('eyeLookOutLeft') - score('eyeLookInRight')) / 2;
  const eyesY = (score('eyeLookUpLeft') + score('eyeLookUpRight') - score('eyeLookDownLeft') - score('eyeLookDownRight')) / 2;
  const pose = result.facialTransformationMatrixes?.[0]?.data;
  const yaw = pose?.length >= 16 ? Math.atan2(pose[8], pose[10]) : 0;
  const pitch = pose?.length >= 16 ? Math.asin(Math.max(-1, Math.min(1, -pose[9]))) : 0;
  return {x: eyesX + yaw * .7, y: eyesY + pitch * .7, blink};
}

function median(values) {
  const sorted = values.toSorted((a,b) => a-b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle-1]+sorted[middle])/2;
}
function medianPoint(points) {
  return {x: median(points.map(p => p.x)), y: median(points.map(p => p.y))};
}
function solve(rows, values, penalty) {
  const n = rows[0].length;
  const matrix = Array.from({length:n}, (_,i) => {
    const row = Array.from({length:n}, (_,j) => rows.reduce((sum,r) => sum+r[i]*r[j], i===j && i>0 ? penalty : 0));
    return [...row, rows.reduce((sum,r,k) => sum+r[i]*values[k],0)];
  });
  for (let col=0; col<n; col++) {
    let pivot = col;
    for (let i=col+1; i<n; i++) if (Math.abs(matrix[i][col]) > Math.abs(matrix[pivot][col])) pivot=i;
    if (Math.abs(matrix[pivot][col]) < 1e-9) return null;
    [matrix[col],matrix[pivot]] = [matrix[pivot],matrix[col]];
    const divisor = matrix[col][col];
    matrix[col] = matrix[col].map(value => value/divisor);
    for (let i=0; i<n; i++) {
      if (i===col) continue;
      const factor=matrix[i][col];
      matrix[i] = matrix[i].map((value,j) => value-factor*matrix[col][j]);
    }
  }
  return matrix.map(row => row[n]);
}
function fitMap(points, curve) {
  const origin = medianPoint(points);
  const scaleX = Math.max(...points.map(p=>p.x)) - Math.min(...points.map(p=>p.x));
  const scaleY = Math.max(...points.map(p=>p.y)) - Math.min(...points.map(p=>p.y));
  if (scaleX < .015 || scaleY < .015) return null;
  function terms(point) {
    const x = (point.x-origin.x)/scaleX, y = (point.y-origin.y)/scaleY;
    return curve ? [1,x,y,x*y,x*x,y*y] : [1,x,y];
  }
  const rows=points.map(terms);
  const px=solve(rows,points.map(p=>p.u),curve ? .012 : .002);
  const py=solve(rows,points.map(p=>p.v),curve ? .012 : .002);
  if (!px || !py) return null;
  return point => {
    const features=terms(point);
    const project=coefficients => coefficients.reduce((sum,value,i)=>sum+value*features[i],0);
    return {x:project(px), y:project(py)};
  };
}
function fitCalibration(points) {
  // Select the map against unseen target positions, rather than its training error.
  const score = curve => median(points.map((point,i) => {
    const map = fitMap(points.filter((_,k) => k!==i),curve);
    if (!map) return Number.POSITIVE_INFINITY;
    const guess=map(point);
    return Math.hypot(guess.x-point.u,guess.y-point.v);
  }));
  const linear = score(false), curved = score(true);
  if (Math.min(linear, curved) > .21) return null;
  return fitMap(points, curved + .01 < linear);
}
