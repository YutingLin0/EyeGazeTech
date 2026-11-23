import {mkdir, readFile, writeFile} from 'node:fs/promises';
const read = name => readFile(new URL(name, import.meta.url), 'utf8');
const [html, api, lobby, game] = await Promise.all(['index.html','api.mjs','lobby.html','game.js'].map(read));
const page = html.replace('<!-- CLASSROOM LOBBY -->', () => lobby).replace('// CLASSROOM GAME', () => game);
await mkdir(new URL('../dist/server/',import.meta.url), {recursive:true});
await writeFile(new URL('../dist/server/index.js',import.meta.url), `
${api}
const page = ${JSON.stringify(page)};
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/')) {
      try { return await api(request, env.DB); }
      catch (cause) {
        console.error('Room request failed', cause);
        return Response.json({error:'The room service is temporarily unavailable.'},{status:503});
      }
    }
    if (path !== '/') return new Response('Not found',{status:404});
    return new Response(page,{headers:{'Content-Type':'text/html; charset=utf-8','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
  }
};
`);
