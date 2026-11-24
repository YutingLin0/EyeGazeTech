    const phraseTiles=Array.from(board.children);
    const scoreEl=document.getElementById('score');
    const sceneEl=document.getElementById('scene');
    const clueEl=document.getElementById('clue');
    const roundEl=document.getElementById('round-number');
    const feedback=document.getElementById('feedback');
    const FEEDBACK_MS=2200;
    let roundIndex=0, score=0, answered=false, answerInFlight=false;

    function showRound() {
      const round=rounds[roundIndex];
      sceneEl.textContent=round.scene;
      clueEl.textContent=round.clue;
      roundEl.textContent='Round '+(roundIndex+1)+' of '+rounds.length;
      feedback.textContent='Select the message that fits.';
      answered=false;
      phraseTiles.forEach(tile=>{
        tile.disabled=false;
        tile.classList.remove('correct','incorrect');
      });
    }
    function restoreRound(player) {
      roundIndex=player.round;
      score=player.score;
      scoreEl.textContent=score;
      showRound();
    }
    async function choose(index) {
      if (appState!=='tracking'||answered||answerInFlight) return;
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
      feedback.textContent=final?'Your score '+score+' / '+(rounds.length*100)+'. Loading class results…':
        result.points===null?'Answer recorded. Next prompt in a moment.':
          'Message delivered! +'+result.points+' points. Next prompt in a moment.';
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
