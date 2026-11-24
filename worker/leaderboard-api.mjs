const ACTIVITY_ROUTE='/api/classroom';
const PAGES_ORIGIN='https://yutinglin0.github.io';
const MAX_AGE=12*60*60*1000;
const ROOM_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function respond(data,status,origin) {
  const headers={'Cache-Control':'no-store','Vary':'Origin'};
  if (origin===PAGES_ORIGIN) headers['Access-Control-Allow-Origin']=origin;
  return Response.json(data,{status,headers});
}

async function roomView(db,room,token) {
  const {results:players}=await db.prepare(
    'SELECT nickname, round, score, missed, token = ? AS is_self FROM activity_players WHERE room_code = ? ORDER BY score DESC, nickname COLLATE NOCASE'
  ).bind(token,room.code).all();
  const me=players.find(player=>player.is_self);
  const host=room.host_token===token;
  if (!host&&!me) return null;
  const finished=players.filter(player=>player.round===rounds.length).length;
  const phase=!room.started?'waiting':room.ended||finished===players.length?'finished':'playing';
  return {
    code:room.code,host,phase,finished,total:players.length,ended:!!room.ended,
    me:me&&{round:me.round,score:me.score,missed:!!me.missed},
    ...(phase==='waiting'?{names:players.map(player=>player.nickname)}:{}),
    ...(host&&phase!=='finished'?{roster:players.map(({nickname,round,score})=>({nickname,round,score}))}:{}),
    ...(phase==='finished'?{leaders:players.map(({nickname,score})=>({nickname,score}))}:{})
  };
}

async function activityApi(request,db) {
  const origin=request.headers.get('Origin');
  const allowed=!origin||origin===new URL(request.url).origin||origin===PAGES_ORIGIN;
  const reply=(data,status=200)=>respond(data,status,origin);
  if (!allowed) return reply({error:'Open the activity from its class link.'},403);
  if (request.method==='OPTIONS') return new Response(null,{status:204,headers:{
    'Access-Control-Allow-Origin':origin??PAGES_ORIGIN,
    'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin'
  }});
  if (request.method!=='POST') return reply({error:'Method unavailable.'},405);
  if (Number(request.headers.get('Content-Length'))>4096) return reply({error:'Request too large.'},413);
  const payload=await request.json().catch(()=>null);
  if (!payload||typeof payload.action!=='string') return reply({error:'Invalid request.'},400);
  const now=Date.now();
  if (payload.action==='create') {
    await db.prepare('DELETE FROM activity_rooms WHERE created_at < ?').bind(now-MAX_AGE).run();
    const token=crypto.randomUUID();
    for (let attempt=0;attempt<5;attempt++) {
      const code=Array.from(crypto.getRandomValues(new Uint8Array(6)),b=>ROOM_ALPHABET[b%ROOM_ALPHABET.length]).join('');
      const result=await db.prepare('INSERT OR IGNORE INTO activity_rooms (code,host_token,created_at) VALUES (?,?,?)').bind(code,token,now).run();
      if (result.meta.changes) return reply({code,token},201);
    }
    return reply({error:'Could not create a room. Try again.'},503);
  }
  const {code,token,action}=payload;
  if (typeof code!=='string'||!/^[A-Z2-9]{6}$/.test(code)) return reply({error:'Enter the six-character room code.'},400);
  const room=await db.prepare('SELECT * FROM activity_rooms WHERE code=? AND created_at>=?').bind(code,now-MAX_AGE).first();
  if (!room) return reply({error:'Room not found or expired. Check the code with your host.'},404);
  if (action==='join') {
    const name=typeof payload.nickname==='string'?payload.nickname.trim().replace(/\s+/g,' '):'';
    if (!name||name.length>24||/[\p{C}]/u.test(name)) return reply({error:'Enter a name of 1 to 24 characters.'},400);
    if (room.started) return reply({error:'This round set has already started.'},409);
    const playerToken=crypto.randomUUID();
    const result=await db.prepare(
      'INSERT OR IGNORE INTO activity_players (room_code,token,nickname) SELECT code,?,? FROM activity_rooms WHERE code=? AND started=0 AND (SELECT COUNT(*) FROM activity_players WHERE room_code=?) < 60'
    ).bind(playerToken,name,code,code).run();
    if (!result.meta.changes) return reply({error:'That name is in use, or the room closed. Try a different name before play starts.'},409);
    return reply({code,token:playerToken},201);
  }
  if (typeof token!=='string'||token.length!==36) return reply({error:'Join the room first.'},403);
  if (action==='view') {
    const view=await roomView(db,room,token);
    return view?reply(view):reply({error:'Session unavailable. Join the room again.'},403);
  }
  if (action==='start') {
    if (room.host_token!==token) return reply({error:'Only the host can start the activity.'},403);
    if (room.started) return reply(await roomView(db,room,token));
    const result=await db.prepare(
      'UPDATE activity_rooms SET started=1 WHERE code=? AND EXISTS (SELECT 1 FROM activity_players WHERE room_code=?)'
    ).bind(code,code).run();
    if (!result.meta.changes) return reply({error:'Wait for at least one player.'},409);
    return reply(await roomView(db,{...room,started:1},token));
  }
  if (action==='end') {
    if (room.host_token!==token) return reply({error:'Only the host can end the game.'},403);
    if (!room.started) return reply({error:'Start the activity before ending the game.'},409);
    if (room.ended) return reply(await roomView(db,room,token));
    await db.prepare('UPDATE activity_rooms SET ended=1 WHERE code=? AND started=1').bind(code).run();
    return reply(await roomView(db,{...room,ended:1},token));
  }
  if (action==='leave') {
    if (room.started) return reply({error:'The activity has started. Stay in the room until scores are shown.'},409);
    const result=room.host_token===token
      ? await db.prepare('DELETE FROM activity_rooms WHERE code=? AND host_token=? AND started=0').bind(code,token).run()
      : await db.prepare('DELETE FROM activity_players WHERE room_code=? AND token=? AND EXISTS (SELECT 1 FROM activity_rooms WHERE code=? AND started=0)').bind(code,token,code).run();
    if (!result.meta.changes) return reply({error:'The room changed. Refresh and try again.'},409);
    return reply({left:true});
  }
  if (action==='answer') {
    const player=await db.prepare('SELECT round, score, missed FROM activity_players WHERE room_code=? AND token=?').bind(code,token).first();
    if (!player) return reply({error:'Join the room as a player first.'},403);
    if (!room.started) return reply({error:'Wait for your host to start.'},409);
    const stopMessage={error:'The host ended the game. Scores are final.',ended:true};
    if (room.ended) return reply(stopMessage,409);
    const {round,choice}=payload;
    if (!Number.isInteger(round)||!rounds[round]||!Number.isInteger(choice)||choice<0||choice>7) return reply({error:'Invalid answer.'},400);
    if (player.round>round) return reply({correct:true,round:player.round,score:player.score,points:null});
    if (player.round!==round) return reply({error:'This prompt is out of date. Refresh the activity.'},409);
    const correct=rounds[round].phrase===choice;
    if (correct) {
      const updated=await db.prepare(
        'UPDATE activity_players SET round=round+1, score=score+CASE WHEN missed=1 THEN 50 ELSE 100 END, missed=0 WHERE room_code=? AND token=? AND round=? AND EXISTS (SELECT 1 FROM activity_rooms WHERE code=? AND ended=0) RETURNING round, score'
      ).bind(code,token,round,code).first();
      if (!updated && (await db.prepare('SELECT ended FROM activity_rooms WHERE code=?').bind(code).first())?.ended) return reply(stopMessage,409);
      const latest=updated??await db.prepare('SELECT round,score FROM activity_players WHERE room_code=? AND token=?').bind(code,token).first();
      return reply({correct:true,round:latest.round,score:latest.score,points:updated?latest.score-player.score:null});
    }
    const updated=await db.prepare('UPDATE activity_players SET missed=1 WHERE room_code=? AND token=? AND round=? AND EXISTS (SELECT 1 FROM activity_rooms WHERE code=? AND ended=0)').bind(code,token,round,code).run();
    if (!updated.meta.changes) {
      if ((await db.prepare('SELECT ended FROM activity_rooms WHERE code=?').bind(code).first())?.ended) return reply(stopMessage,409);
      const latest=await db.prepare('SELECT round,score FROM activity_players WHERE room_code=? AND token=?').bind(code,token).first();
      return reply({correct:true,round:latest.round,score:latest.score,points:null});
    }
    return reply({correct:false,round,score:player.score});
  }
  return reply({error:'Unknown room action.'},404);
}
