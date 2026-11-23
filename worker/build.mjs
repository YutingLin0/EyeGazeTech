import {mkdir, readFile, writeFile} from 'node:fs/promises';

const read = name => readFile(new URL(name, import.meta.url), 'utf8');
const [simple, classActivity] = await Promise.all(['simple.html','ocula-game.js'].map(read));
const board = simple.replace('// OCULA CLASS GAME', () => classActivity);

await mkdir(new URL('../dist/server/',import.meta.url), {recursive:true});
await writeFile(new URL('../dist/server/index.js',import.meta.url), `
const board = ${JSON.stringify(board)};
export default {
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/match' || (url.pathname === '/' && url.searchParams.has('join'))) {
      return Response.redirect(new URL('/', url), 302);
    }
    if (url.pathname !== '/') return new Response('Not found',{status:404});
    return new Response(board,{
      headers:{
        'Content-Type':'text/html; charset=utf-8',
        'Referrer-Policy':'no-referrer',
        'X-Content-Type-Options':'nosniff'
      }
    });
  }
};
`);
