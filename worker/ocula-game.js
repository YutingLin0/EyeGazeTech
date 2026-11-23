    const rounds = [
      {phrase:5, scene:'After recess', clue:'You’ve just finished a game and you’re thirsty. Ask for a drink.'},
      {phrase:4, scene:'Stuck zipper', clue:'Your backpack won’t open. Ask someone to assist you.'},
      {phrase:3, scene:'A new classmate', clue:'Someone new joins your table. Greet them.'},
      {phrase:2, scene:'A kind gesture', clue:'A classmate picks up the pencil you dropped. Show your appreciation.'},
      {phrase:6, scene:'A long day', clue:'You’re running low on energy. Tell your partner how you feel.'},
      {phrase:7, scene:'Time to go home', clue:'You need to reach someone at home. Ask your teacher to contact them.'}
    ];
    const phraseTiles=Array.from(board.children);
    const scoreEl=document.getElementById('score');
    const sceneEl=document.getElementById('scene');
    const clueEl=document.getElementById('clue');
    const roundEl=document.getElementById('round-number');
    const feedback=document.getElementById('feedback');
    const advance=document.getElementById('advance');
    let roundIndex=0, score=0, missed=false, answered=false;

    function showRound() {
      const round=rounds[roundIndex];
      sceneEl.textContent=round.scene;
      clueEl.textContent=round.clue;
      roundEl.textContent='Round '+(roundIndex+1)+' of '+rounds.length;
      feedback.textContent='Select the message that fits.';
      advance.hidden=true;
      answered=missed=false;
      phraseTiles.forEach(tile=>{
        tile.disabled=false;
        tile.classList.remove('correct','incorrect');
      });
    }
    function choose(index) {
      if (appState!=='tracking' || answered) return;
      speak(PHRASES[index].phrase);
      const tile=phraseTiles[index];
      if (rounds[roundIndex].phrase!==index) {
        missed=true;
        tile.classList.add('incorrect');
        tile.disabled=true;
        feedback.textContent='That message doesn’t fit this situation. Try another tile.';
        return;
      }
      answered=true;
      const points=missed ? 50 : 100;
      score+=points;
      scoreEl.textContent=score;
      tile.classList.add('correct');
      phraseTiles.forEach(option=>{option.disabled=true;});
      const final=roundIndex===rounds.length-1;
      feedback.textContent=final ? 'Final score '+score+' / '+(rounds.length*100)+'. Swap roles and play again.' :
        'Message delivered! +'+points+' points.';
      advance.textContent=final?'Play again':'Next round';
      advance.hidden=false;
    }
    phraseTiles.forEach((tile,index)=>{tile.onclick=()=>choose(index);});
    advance.onclick=()=>{
      if (!answered) return;
      roundIndex++;
      if (roundIndex===rounds.length) {
        roundIndex=score=0;
        scoreEl.textContent='0';
      }
      showRound();
      resetCursor();
    };
    showRound();
