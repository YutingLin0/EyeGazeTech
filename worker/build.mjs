import {mkdir,readFile,writeFile} from 'node:fs/promises';

const read=name=>readFile(new URL(name,import.meta.url),'utf8');
const [simple,activity,client,roundSource,api]=await Promise.all(
  ['simple.html','ocula-game.js','classroom.js','rounds.mjs','leaderboard-api.mjs'].map(read)
);
const rounds=roundSource.replace('export const rounds','const rounds');
function render(endpoint) {
  return simple
    .replace('// ACTIVITY ROUNDS',()=>rounds)
    .replace('// OCULA CLASS GAME',()=>activity)
    .replace('// CLASSROOM CLIENT',()=>client.replace('CLASSROOM_API',JSON.stringify(endpoint)));
}

await mkdir(new URL('../dist/server/',import.meta.url),{recursive:true});
await writeFile(new URL('../dist/server/index.js',import.meta.url),`
${rounds}
${api}
const publicActivity='https://yutinglin0.github.io/EyeGazeTech/';
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if (url.pathname===ACTIVITY_ROUTE) {
      try {return await activityApi(request,env.DB);}
      catch(error) {
        console.error('Classroom request failed',error);
        return respond({error:'The classroom is temporarily unavailable.'},503,request.headers.get('Origin'));
      }
    }
    if (url.pathname!=='/' && url.pathname!=='/match') return new Response('Not found',{status:404});
    const link=new URL(publicActivity);
    const code=url.searchParams.get('room');
    if (code && /^[A-Z2-9]{6}$/i.test(code)) link.searchParams.set('room',code.toUpperCase());
    return Response.redirect(link,302);
  }
};
`);
if (process.argv[2]==='--pages') {
  const backend=new URL(process.argv[3]);
  if (backend.protocol!=='https:') throw new Error('The classroom API needs HTTPS.');
  await mkdir(new URL('../docs/',import.meta.url),{recursive:true});
  await writeFile(new URL('../docs/index.html',import.meta.url),render(new URL('/api/classroom',backend).href));
}
