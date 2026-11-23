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

// Express each iris position in its own eye's axes to reduce head-roll and distance effects.
function irisPosition(mesh, iris, outer, inner, upper, lower) {
  const [p,a,b,u,v] = [iris,outer,inner,upper,lower].map(index => mesh?.[index]);
  if (!p || !a || !b || !u || !v) return null;
  const dx=b.x-a.x, dy=b.y-a.y, width=Math.hypot(dx,dy);
  if (width < .018 || Math.hypot(u.x-v.x,u.y-v.y) / width < .095) return null;
  const x=p.x-(a.x+b.x)/2, y=p.y-(a.y+b.y)/2;
  const ix=(x*dx+y*dy)/(width*width), iy=(y*dx-x*dy)/(width*width);
  return Number.isFinite(ix) && Number.isFinite(iy) ? {x:ix,y:iy} : null;
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
  const mesh=result.faceLandmarks?.[0];
  const a=irisPosition(mesh,468,33,133,159,145);
  const b=irisPosition(mesh,473,362,263,386,374);
  const iris=a && b ? {x:(a.x+b.x)/2,y:(a.y+b.y)/2} : null;
  return {x:eyesX+yaw*.7, y:eyesY+pitch*.7, iris, blink};
}

function median(values) {
  const sorted = [...values].sort((a,b) => a-b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle-1]+sorted[middle])/2;
}
function medianPoint(points) {
  const irises=points.map(point=>point.iris).filter(Boolean);
  return {
    x:median(points.map(p=>p.x)),y:median(points.map(p=>p.y)),
    iris:irises.length >= points.length*.75 && irises.length ? {
      x:median(irises.map(p=>p.x)),y:median(irises.map(p=>p.y))
    } : null
  };
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
function adjustSignal(point, center, baseline) {
  if (!center) return point;
  return {
    x:point.x-center.x+baseline.x, y:point.y-center.y+baseline.y,
    iris:point.iris && center.iris && baseline.iris ? {
      x:point.iris.x-center.iris.x+baseline.iris.x,
      y:point.iris.y-center.iris.y+baseline.iris.y
    } : point.iris
  };
}

const baseFeatures = point => [point.x,point.y];
const irisFeatures = point => point.iris ? [point.iris.x,point.iris.y,point.x,point.y] : null;

function fitMap(points, features, curve) {
  const inputs=points.map(features);
  if (inputs.some(input=>!input)) return null;
  const columns=inputs[0].map((_,i)=>inputs.map(row=>row[i]));
  const origins=columns.map(median);
  const scales=columns.map(values=>Math.max(.018,Math.max(...values)-Math.min(...values)));
  // A set with no appreciable gaze movement cannot describe a usable screen map.
  if (columns.every(values=>Math.max(...values)-Math.min(...values)<.018)) return null;
  function terms(input) {
    const values=input.map((value,i)=>(value-origins[i])/scales[i]);
    const [x,y]=values;
    return curve ? [1,...values,x*y,x*x,y*y] : [1,...values];
  }
  const rows=inputs.map(terms);
  const penalty=curve ? .016 : features===irisFeatures ? .014 : .003;
  const px=solve(rows,points.map(p=>p.u),penalty);
  const py=solve(rows,points.map(p=>p.v),penalty);
  if (!px || !py) return null;
  return point => {
    const input=features(point);
    if (!input) return null;
    const values=terms(input);
    const project=coefficients=>coefficients.reduce((sum,value,i)=>sum+value*values[i],0);
    return {x:project(px),y:project(py)};
  };
}
function fitCalibration(points) {
  // Choose the feature set and curve using held-out target errors, including edge misses.
  const models=[];
  for (const features of [baseFeatures,irisFeatures]) {
    for (const curve of [false,true]) {
      const map=fitMap(points,features,curve);
      if (!map) continue;
      const errors=points.map((point,i)=>{
        const trial=fitMap(points.filter((_,k)=>k!==i),features,curve);
        const guess=trial?.(point);
        return guess ? Math.hypot(guess.x-point.u,guess.y-point.v) : Infinity;
      }).sort((a,b)=>a-b);
      const middle=median(errors), upper=errors[Math.ceil(.75*errors.length)-1];
      if (middle>.19 || upper>.31) continue;
      models.push({map,error:middle*.55+upper*.45+(curve ? .008 : 0)});
    }
  }
  return models.sort((a,b)=>a.error-b.error)[0]?.map ?? null;
}
