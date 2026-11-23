const match = byId('match-status');
const joinLink = new URL(location.href);
const joinCode = joinLink.searchParams.get('join') ?? '';
if (/^[A-Z2-9]{6}$/i.test(joinCode)) byId('code').value = joinCode.toUpperCase();
const key = 'eye-gaze-classroom-room';
let member = null, state = null, offset = 0, polling = false, submitting = false;
try { member = JSON.parse(sessionStorage.getItem(key)); } catch {}
if (joinCode && member?.code !== joinCode.toUpperCase()) member = null;

function setMember(next) {
  member = next;
  try {
    if (next) sessionStorage.setItem(key, JSON.stringify(next));
    else sessionStorage.removeItem(key);
  } catch {}
}
async function roomRequest(suffix, payload) {
  const request = {headers: {'Content-Type':'application/json'}};
  if (member) request.headers.Authorization = 'Bearer ' + member.token;
  if (payload !== undefined) {
    request.method = 'POST';
    request.body = JSON.stringify(payload);
  }
  const result = await fetch('/api/rooms' + suffix, request);
  const data = await result.json();
  if (!result.ok) throw Object.assign(new Error(data.error ?? 'The room service is unavailable.'), {status:result.status});
  return data;
}
function remaining() {
  return Math.max(0, Math.ceil((state.deadline-Date.now()-offset)/1000));
}
function canPlay() {
  return state?.phase === 'playing' && !state.host && remaining() > 0 &&
    !state.players.some(player => player.me && player.current !== null);
}
function renderRoom(next) {
  if (next && state?.code === next.code && (next.round < state.round || next.now < state.now)) return;
  if (next) offset = next.now - Date.now();
  const changed = next?.round !== state?.round || (!next && state);
  state = next;
  const timer = byId('timer');
  const ranks = byId('ranks');
  const advance = byId('advance');
  const controls = byId('room-controls');
  byId('join-controls').hidden = !!next;
  controls.hidden = !next;
  ranks.hidden = !next?.players.length;
  timer.hidden = next?.phase !== 'playing';
  byId('end').hidden = !(next?.host && ['playing','results'].includes(next.phase));
  byId('copy').hidden = next?.phase !== 'lobby';
  advance.hidden = !next?.host || ['playing','finished'].includes(next.phase);
  advance.disabled = next?.phase === 'lobby' && !next.players.length;
  advance.textContent = next?.phase === 'lobby' ? 'Start match' :
    next?.round + 1 === next?.count ? 'Show final scores' : 'Start next round';
  byId('board').hidden = !!next && !canPlay() && (next.host || next.phase !== 'lobby');
  if (changed) {
    words.length = 0;
    renderMessage();
    resetDwell();
    buildTiles(next?.challenge?.tiles ?? practiceWords);
  }
  byId('speak').textContent = canPlay() ? 'Speak & submit' : 'Speak message';
  byId('challenge-text').textContent = canPlay()
    ? next.challenge.clue + ' Build “' + next.challenge.phrase + '.”'
    : 'Build and speak “I want water.”';
  if (!next) {
    byId('match-info').textContent = 'Three timed rounds. Build the phrase and select Speak & submit to score.';
    return;
  }
  const top = next.players[0]?.total;
  const winners = next.players.filter(player => player.total === top).map(player => player.nickname);
  const winnerLine = top > 0 ? winners.join(', ') + (winners.length === 1 ? ' wins!' : ' tie for first!') : 'Match complete.';
  const me = next.players.find(player => player.me);
  byId('match-info').textContent = ({
    lobby: 'Room ' + next.code + ' · ' + next.players.length + ' joined. ' +
      (next.host ? 'Share the join link and start when ready.' : 'Practice below while you wait for the host.'),
    playing: 'Round ' + (next.round+1) + ' of ' + next.count + ' · Room ' + next.code +
      (me?.current != null ? ' · You scored ' + me.current + ' points.' : ''),
    results: 'Round ' + (next.round+1) + ' complete. ' + (next.host ? 'Start the next round when everyone is ready.' : 'Waiting for the host.'),
    finished: winnerLine
  })[next.phase];
  ranks.replaceChildren(...next.players.map(player => {
    const row = document.createElement('li');
    row.textContent = player.nickname + (player.me ? ' (you)' : '') + ' · ' + player.total + ' pts';
    return row;
  }));
  if (!timer.hidden) timer.textContent = remaining() + 's';
  if (next.phase === 'finished' && mode !== 'click') setMode('click');
}
async function refresh() {
  if (!member || polling) return;
  const current = member;
  polling = true;
  try {
    const next = await roomRequest('/' + current.code);
    if (current === member) renderRoom(next);
  } catch (error) {
    if (current === member) {
      match.textContent = error.message;
      if ([403,404].includes(error.status)) { setMember(null); renderRoom(null); }
    }
  } finally { polling = false; }
}
async function joinOrHost(button, path, body) {
  button.disabled = true;
  match.textContent = '';
  try {
    setMember(await roomRequest(path, body));
    await refresh();
  } catch (error) { match.textContent = error.message; }
  finally { button.disabled = false; }
}
byId('host').onclick = event => joinOrHost(event.currentTarget,'',{});
byId('join-form').onsubmit = event => {
  event.preventDefault();
  joinOrHost(event.submitter,'/' + byId('code').value.trim().toUpperCase() + '/join',{nickname:byId('nickname').value});
};
byId('copy').onclick = async () => {
  const url = new URL(location.origin);
  url.searchParams.set('join',member.code);
  try {
    await navigator.clipboard.writeText(url.href);
    match.textContent = 'Join link copied.';
  } catch { match.textContent = 'Join link · ' + url.href; }
};
async function hostAction(action) {
  const current = member;
  byId('advance').disabled = true;
  byId('end').disabled = true;
  match.textContent = '';
  try {
    const next = await roomRequest('/' + current.code + '/' + action,{});
    if (member === current) renderRoom(next);
  } catch (error) { match.textContent = error.message; }
  finally { byId('end').disabled = false; byId('advance').disabled = false; }
}
byId('advance').onclick = () => hostAction('advance');
byId('end').onclick = () => { if (confirm('End this match and show final scores?')) hostAction('end'); };
byId('exit').onclick = () => {
  if (state?.host && state.phase !== 'finished' && !confirm('Leave the host controls for this match?')) return;
  setMember(null);
  renderRoom(null);
  setMode('click');
  match.textContent = '';
};
const speakPractice = byId('speak').onclick;
byId('speak').onclick = async () => {
  if (!state || state.phase === 'lobby') { speakPractice(); return; }
  if (!canPlay() || submitting) return;
  if (!words.length) { speechStatus.textContent = 'Add words before submitting.'; return; }
  submitting = true;
  const current = member;
  const phrase = words.join(' ');
  try {
    if (phrase === state.challenge.phrase) speakPractice();
    const score = await roomRequest('/' + current.code + '/score',{round:state.round,phrase});
    if (member !== current) return;
    match.textContent = '+' + score.points + ' points. Watch the leaderboard for the next round.';
    await refresh();
  } catch (error) { if (member === current) speechStatus.textContent = error.message; }
  finally { submitting = false; }
};
setInterval(refresh, 1800);
setInterval(() => {
  if (state?.phase === 'playing') {
    byId('timer').textContent = remaining() + 's';
    if (!remaining()) resetDwell();
  }
}, 250);
refresh();
