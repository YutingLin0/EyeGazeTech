    const phraseTiles=Array.from(board.children);
    const scoreEl=document.getElementById('score');
    const sceneEl=document.getElementById('scene');
    const clueEl=document.getElementById('clue');
    const roundEl=document.getElementById('round-number');
    const feedback=document.getElementById('feedback');
    const FEEDBACK_MS=2200;
    let roundIndex=0, score=0, answered=false, answerInFlight=false;
    let promptReady=false, preparingPrompt=false;

    function showRound() {
      sceneEl.textContent='Getting ready…';
      clueEl.textContent='';
      roundEl.textContent='Round '+(roundIndex+1)+' of '+rounds.length;
      feedback.textContent='';
      answered=false;
      promptReady=false;
      phraseTiles.forEach(tile=>{
        tile.disabled=true;
        tile.classList.remove('correct','incorrect');
      });
      prepareRound();
    }
    async function prepareRound() {
      if (appState!=='tracking'||answered||promptReady||preparingPrompt) return;
      const selectedRound=roundIndex;
      preparingPrompt=true;
      try {
        await roomRequest('prompt',{round:selectedRound});
        if (appState!=='tracking'||roundIndex!==selectedRound) return;
        const round=rounds[roundIndex];
        sceneEl.textContent=round.scene;
        clueEl.textContent=round.clue;
        feedback.textContent='Select the message that fits. Faster correct answers earn bonus points.';
        phraseTiles.forEach(tile=>{tile.disabled=false;});
        promptReady=true;
      } catch (error) {
        if (error.ended) {refreshRoom();return;}
        feedback.textContent=error.message;
        if (!error.status||error.status>=500) {
          setTimeout(()=>{if(roundIndex===selectedRound) prepareRound();},1300);
        }
      } finally {preparingPrompt=false;}
    }
    function restoreRound(player) {
      roundIndex=player.round;
      score=player.score;
      scoreEl.textContent=score;
      showRound();
    }
    async function choose(index) {
      if (appState!=='tracking'||!promptReady||answered||answerInFlight) return;
      answerInFlight=true;
      const tile=phraseTiles[index];
      const selectedRound=roundIndex;
      let result;
      try {
        result=await roomRequest('answer',{round:roundIndex,choice:index});
      } catch (error) {
        if (error.ended) refreshRoom();
        else feedback.textContent=error.message;
        return;
      } finally {answerInFlight=false;}
      if (appState!=='tracking') return;
      speak(PHRASES[index].phrase);
      if (!result.correct) {
        tile.classList.add('incorrect');
        tile.disabled=true;
        feedback.textContent='That message doesn’t fit this situation. Try another tile.';
        return;
      }
      answered=true;
      score=result.score;
      scoreEl.textContent=score;
      tile.classList.add('correct');
      phraseTiles.forEach(option=>{option.disabled=true;});
      const final=result.round===rounds.length;
      const award=result.points===null?'Answer recorded.':
        'Message delivered! +'+result.points+' points'+(result.bonus?' ('+result.bonus+' speed bonus)':'')+'.';
      feedback.textContent=award+(final?' Final score: '+score+' / '+(rounds.length*150)+'.':' Next prompt in a moment.');
      if (gazedEl===tile) locked=tile;
      clearDwell();
      setTimeout(()=>{
        if (appState!=='tracking'||roundIndex!==selectedRound) return;
        if (final) {openClassroom();return;}
        roundIndex=result.round;
        clearDwell();
        showRound();
      },FEEDBACK_MS);
    }
    phraseTiles.forEach((tile,index)=>{tile.onclick=()=>choose(index);});
    showRound();
