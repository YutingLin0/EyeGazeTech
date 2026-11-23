const rounds = [
  { clue: 'Ask for something to drink.', phrase: 'I want water', tiles: ['water','help','I','need','please','want'], seconds: 45 },
  { clue: 'Ask someone to assist you politely.', phrase: 'I need help please', tiles: ['please','more','want','help','I','water','need','yes','thanks'], seconds: 55 },
  { clue: 'Ask for a little longer to finish, then thank your partner.', phrase: 'I need more time thanks', tiles: ['thanks','time','help','more','I','please','need','want','water'], seconds: 65 }
];
const lifetime = 3 * 60 * 60 * 1000;
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const json = (data, status = 200) => Response.json(data, {status, headers: {'Cache-Control':'no-store'}});
const error = (message, status) => json({error:message}, status);

async function snapshot(db, code, token) {
  const queries = await db.batch([
    db.prepare('SELECT * FROM rooms WHERE code = ?').bind(code),
    db.prepare('SELECT nickname, COALESCE(SUM(points),0) AS total, MAX(CASE WHEN s.round = r.round THEN points END) AS current, p.token = ? AS me FROM players p JOIN rooms r ON r.code=p.room LEFT JOIN scores s ON s.room=p.room AND s.token=p.token WHERE p.room=? GROUP BY p.token ORDER BY total DESC, p.nickname').bind(token, code)
  ]);
  const room = queries[0].results[0];
  const players = queries[1].results;
  const now = Date.now();
  if (!room || room.created < now - lifetime) return error('Room expired or unavailable.',404);
  const host = room.host === token;
  if (!host && !players.some(player => player.me)) return error('Join this room first.',403);
  const phase = room.round < 0 ? 'lobby' : room.round >= rounds.length ? 'finished' : now < room.deadline ? 'playing' : 'results';
  const challenge = rounds[room.round];
  return json({code, host, phase, round:room.round, count:rounds.length, now, deadline:room.deadline, players,
    challenge: challenge && {...challenge}});
}

export async function api(request, db) {
  const path = new URL(request.url).pathname;
  const token = request.headers.get('Authorization')?.replace(/^Bearer /,'') ?? '';
  const now = Date.now();
  if (path === '/api/rooms' && request.method === 'POST') {
    const roomToken = crypto.randomUUID();
    await db.prepare('DELETE FROM rooms WHERE created < ?').bind(now - lifetime).run();
    for (let attempt=0; attempt<5; attempt++) {
      const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), byte => alphabet[byte % alphabet.length]).join('');
      const result = await db.prepare('INSERT OR IGNORE INTO rooms (code,host,created) VALUES (?,?,?)').bind(code,roomToken,now).run();
      if (result.meta.changes) return json({code, token:roomToken},201);
    }
    return error('Could not create a room. Try again.',503);
  }
  const route = path.match(/^\/api\/rooms\/([A-Z2-9]{6})(?:\/(join|advance|end|score))?$/);
  if (!route) return error('Unknown room action.',404);
  const [,code,action] = route;
  if (!action && request.method === 'GET') return snapshot(db,code,token);
  if (request.method !== 'POST') return error('Method unavailable.',405);
  const room = await db.prepare('SELECT * FROM rooms WHERE code=? AND created>=?').bind(code,now-lifetime).first();
  if (!room) return error('Room not found. Check the code with your host.',404);

  if (action === 'join') {
    const body = await request.json().catch(() => null);
    const name = typeof body?.nickname === 'string' ? body.nickname.trim() : '';
    if (name.length < 1 || name.length > 20 || /[\p{C}]/u.test(name)) return error('Enter a nickname of 1 to 20 characters.',400);
    if (room.round !== -1) return error('This match has already started.',409);
    const playerToken = crypto.randomUUID();
    const joined = await db.prepare('INSERT OR IGNORE INTO players (room,token,nickname) SELECT code,?,? FROM rooms WHERE code=? AND round=-1 AND (SELECT COUNT(*) FROM players WHERE room=?)<60').bind(playerToken,name,code,code).run();
    if (!joined.meta.changes) return error('That nickname is taken, the match started, or the room is full.',409);
    return json({code, token:playerToken},201);
  }
  if (action === 'advance' || action === 'end') {
    if (room.host !== token) return error('Only the host controls the match.',403);
    if (room.round >= rounds.length) return snapshot(db,code,token);
    if (action === 'end' && room.round < 0) return error('Start the match before ending it.',409);
    if (action === 'advance' && room.deadline > now) return error('The current round is still running.',409);
    if (action === 'advance' && room.round === -1 && !(await db.prepare('SELECT 1 AS joined FROM players WHERE room=? LIMIT 1').bind(code).first())) return error('Wait for at least one player to join.',409);
    const next = action === 'end' ? rounds.length : room.round + 1;
    await db.prepare('UPDATE rooms SET round=?, deadline=? WHERE code=? AND round=?').bind(next,rounds[next] ? now + rounds[next].seconds*1000 : 0,code,room.round).run();
    return snapshot(db,code,token);
  }
  if (action === 'score') {
    const player = await db.prepare('SELECT 1 AS joined FROM players WHERE room=? AND token=?').bind(code,token).first();
    if (!player) return error('Join this room first.',403);
    const body = await request.json().catch(() => null);
    if (!Number.isInteger(body?.round) || body.round !== room.round || !rounds[room.round] || now >= room.deadline) return error('This round is closed.',409);
    const challenge = rounds[room.round];
    if (body.phrase !== challenge.phrase) return error('Check the order of your words and try again.',422);
    const remaining = Math.max(0, room.deadline-now);
    const points = 100 + Math.min(30, Math.floor(remaining / (challenge.seconds*1000) * 30));
    const saved = await db.prepare('INSERT OR IGNORE INTO scores (room,token,round,points) SELECT code,?,?,? FROM rooms WHERE code=? AND round=? AND deadline>?').bind(token,room.round,points,code,room.round,Date.now()).run();
    if (!saved.meta.changes) return error('Your score is already recorded or the round has closed.',409);
    return json({points});
  }
  return error('Unknown room action.',404);
}
