    const here=id=>document.getElementById(id);
    const classroomApi=CLASSROOM_API;
    const sessionKey='eye-gaze-activity-room';
    const codeField=here('class-code');
    const nameField=here('class-name');
    const entry=here('class-entry');
    const panel=here('room-panel');
    const results=here('class-results');
    const startRoomButton=here('start-room');
    const copyRoomButton=here('copy-room');
    const classError=here('class-error');
    let membership=null, roomView=null, pollBusy=false, activityOpened=false;
    let entryBusy=false,pollTimer=null;
    const invitedCode=new URL(location.href).searchParams.get('room')?.toUpperCase()??'';
    if (/^[A-Z2-9]{6}$/.test(invitedCode)) codeField.value=invitedCode;
    try {
      const saved=JSON.parse(sessionStorage.getItem(sessionKey));
      if (saved?.code&&saved.token&&(!invitedCode||saved.code===invitedCode)) membership=saved;
    } catch {}

    function setMembership(value) {
      membership=value;
      roomView=null;
      activityOpened=false;
      try {
        if(value) sessionStorage.setItem(sessionKey,JSON.stringify(value));
        else sessionStorage.removeItem(sessionKey);
      } catch {}
    }
    async function roomRequest(action,data={}) {
      const response=await fetch(classroomApi,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...membership,action,...data})
      });
      const result=await response.json().catch(()=>null);
      if (!response.ok||!result) {
        throw Object.assign(new Error(result?.error??'Could not reach the class. Try again.'),{status:response.status});
      }
      return result;
    }
    function setClassError(error) {classError.textContent=error?.message??'';}
    function showRanking(leaders) {
      const list=here('leader-list');
      list.replaceChildren();
      let rank=0, previous;
      for (const [index,player] of leaders.entries()) {
        if (player.score!==previous) rank=index+1;
        previous=player.score;
        const item=document.createElement('li');
        const name=document.createElement('span');
        const total=document.createElement('strong');
        name.textContent=rank+'. '+player.nickname;
        total.textContent=player.score+' pts';
        item.append(name,total);
        list.append(item);
      }
      const winners=leaders.filter(player=>player.score===leaders[0]?.score).map(player=>player.nickname);
      here('class-winner').textContent=winners.length>1?'Tie for first · '+winners.join(', '):'Winner · '+(winners[0]??'');
    }
    function renderRoom(view) {
      roomView=view;
      entry.hidden=!!view;
      panel.hidden=!view;
      if (!view) return;
      here('room-code-text').textContent=view.code;
      here('room-role').textContent=view.host?'Host view':'Player view';
      startRoomButton.hidden=!view.host||view.phase!=='waiting';
      startRoomButton.disabled=!view.total;
      copyRoomButton.hidden=!view.host||view.phase!=='waiting';
      results.hidden=view.phase!=='finished';
      const leave=here('leave-room');
      leave.hidden=view.phase==='playing';
      leave.textContent=view.host&&view.phase==='waiting'?'Close room':'Leave room';
      if (view.phase==='waiting') {
        here('room-progress').textContent=view.total+' joined · '+(view.host?'Start when everyone has entered a name.':'Waiting for the host to start.');
        here('room-names').textContent=(view.names??[]).join(' · ');
      } else {
        here('room-names').textContent='';
        here('room-progress').textContent=view.finished+' of '+view.total+' finished';
      }
      if (view.phase==='finished') showRanking(view.leaders);
      if (view.phase==='playing'&&!view.host&&view.me.round<rounds.length&&!activityOpened) {
        activityOpened=true;
        restoreRound(view.me);
        clearInterval(pollTimer);
        pollTimer=null;
        setState('welcome');
      }
    }
    async function refreshRoom() {
      if (!membership||pollBusy||appState!=='classroom') return;
      const current=membership;
      pollBusy=true;
      try {
        const view=await roomRequest('view');
        if (membership===current) {
          if (roomView?.phase==='playing'&&view.phase==='waiting') return;
          renderRoom(view);
        }
      } catch (error) {
        if (membership!==current) return;
        if ([403,404].includes(error.status)) {setMembership(null);renderRoom(null);}
        setClassError(error);
      } finally {pollBusy=false;}
    }
    function openClassroom() {
      stopCamera();
      setState('classroom');
      entry.hidden=!!membership;
      panel.hidden=!membership;
      refreshRoom();
      pollTimer??=setInterval(refreshRoom,2000);
    }
    async function enter(action,data) {
      if (entryBusy) return;
      entryBusy=true;
      setClassError();
      try {
        setMembership(await roomRequest(action,data));
        await refreshRoom();
      } catch (error) {setClassError(error);}
      finally {entryBusy=false;}
    }
    here('join-room').onsubmit=event=>{
      event.preventDefault();
      enter('join',{code:codeField.value.trim().toUpperCase(),nickname:nameField.value});
    };
    here('create-room').onclick=()=>enter('create');
    startRoomButton.onclick=async()=>{
      startRoomButton.disabled=true;
      try {renderRoom(await roomRequest('start'));}
      catch(error){setClassError(error);startRoomButton.disabled=false;}
    };
    copyRoomButton.onclick=async()=>{
      const link=new URL(location.href);
      link.search='';
      link.searchParams.set('room',membership.code);
      try {await navigator.clipboard.writeText(link.href);setClassError({message:'Join link copied.'});}
      catch {setClassError({message:link.href});}
    };
    here('leave-room').onclick=async()=>{
      if (roomView?.phase==='playing') return;
      if (roomView?.phase==='waiting') {
        if (roomView.host&&!confirm('Close this room for everyone?')) return;
        try {await roomRequest('leave');}
        catch(error){setClassError(error);return;}
      }
      setMembership(null);
      setClassError();
      renderRoom(null);
    };
    openClassroom();
