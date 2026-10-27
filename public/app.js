const $=id=>document.getElementById(id);
const socket=io({autoConnect:false});
let account=null;
let library=[],selected=null,room=null,hostKey=null,invite=null,isHost=false,remote=false,lastSent=0,expectedTime=0,expectedPlaying=false,lastSyncAt=Date.now();
const say=s=>{$('notice').textContent=s;};
async function api(url,options){const res=await fetch(url,options);const data=await res.json();if(!res.ok)throw Error(data.error||'Request failed');return data;}
function addMsg(m){const el=document.createElement('div');el.className='msg';const who=document.createElement('b');who.textContent=m.name+': ';const body=document.createElement('span');body.textContent=m.text;const time=document.createElement('small');time.textContent=new Date(m.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});el.append(who,time,document.createElement('br'),body);$('messages').append(el);$('messages').scrollTop=$('messages').scrollHeight;}
async function loadMovies(){try{library=await api('/api/movies');$('movies').replaceChildren();if(!library.length){$('movies').textContent='No movies yet. Add an MP4 or WebM file to media/ and refresh.';return;}library.forEach(m=>{const b=document.createElement('button');b.className='movie'+(selected===m.id?' active':'');b.textContent='🎞️ '+m.title;b.onclick=()=>{selected=m.id;loadMovies();};$('movies').append(b);});if(!selected)selected=library[0].id;}catch(e){say(e.message);}}
async function create(){try{if(!account)throw Error('Sign in first.');if(!selected)throw Error('Add a movie to your library first.');const r=await api('/api/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({movie:selected,title:$('title').value,public:$('public').checked})});hostKey=r.hostKey;invite=r.invite;joinRoom(r.room,r.invite);}catch(e){say(e.message);}}
function joinRoom(id,ticket){if(!account){say('Sign in to join a room.');return;}if(room){say('Refresh to switch rooms.');return;}if(!socket.connected){say('Connecting to server...');return;}socket.emit('room:join',{room:id,ticket,hostKey,name:$('name').value},async reply=>{if(reply.error){say(reply.error);return;}room=id;isHost=reply.room.host;$('saveSettings').disabled=!isHost;$('roomTitle').textContent=reply.room.title;$('role').textContent=isHost?'You are the host · Playback controls enabled':'Guest · Playback follows host';$('copy').disabled=false;$('message').disabled=false;$('send').disabled=false;$('empty').style.display='none';$('video').src='/api/stream/'+encodeURIComponent(reply.room.movie);$('video').controls=true; /* Native volume/mute is available to everyone. */ remote=true;$('video').currentTime=reply.room.time;remote=false;reply.room.messages.forEach(addMsg);if(reply.room.playing)$('video').play().catch(()=>say('Press play to enable video playback.'));history.replaceState({},'',`?room=${encodeURIComponent(room)}${ticket?'&ticket='+encodeURIComponent(ticket):''}`);say('Connected!');});}
function parseJoin(){try{const input=$('roomInput').value.trim();const url=new URL(input,location.href);const rid=url.searchParams.get('room')||input;const ticket=url.searchParams.get('ticket');if(!/^[a-f0-9-]{36}$/i.test(rid))throw Error('Enter a valid room ID or invite link.');joinRoom(rid,ticket);}catch(e){say(e.message);}}
function sync(state){if(!room)return;const v=$('video');remote=true;const drift=Math.abs(v.currentTime-state.time);if(Number.isFinite(state.time)){expectedTime=state.time;expectedPlaying=state.playing;lastSyncAt=Date.now();}if(drift>1.7 && Number.isFinite(state.time))v.currentTime=state.time;if(state.playing&&v.paused)v.play().catch(()=>say('Click the video to allow playback.'));if(!state.playing&&!v.paused)v.pause();remote=false;$('viewers').textContent=state.viewers+' viewers';}
function sendState(){if(!isHost||!room||remote)return;const now=Date.now();if(now-lastSent<350)return;lastSent=now;socket.emit('playback:update',{playing:!$('video').paused,time:$('video').currentTime});}
$('refresh').onclick=loadMovies;$('create').onclick=create;$('join').onclick=parseJoin;
$('copy').onclick=async()=>{const url=new URL(location.href);url.searchParams.set('room',room);if(invite)url.searchParams.set('ticket',invite);try{await navigator.clipboard.writeText(url.toString());say('Invite link copied!');}catch{say(url.toString());}};
$('chatForm').onsubmit=e=>{e.preventDefault();const text=$('message').value.trim();if(!text)return;socket.emit('chat:send',{text},ack=>{if(ack?.error)say(ack.error);});$('message').value='';};
socket.on('connect',()=>{$('status').textContent='● Online';const qs=new URLSearchParams(location.search);if(qs.get('room')&&!room)joinRoom(qs.get('room'),qs.get('ticket'));});
socket.on('disconnect',()=>{$('status').textContent='● Reconnecting...';});
socket.on('connect_error',e=>say('Connection failed: '+e.message));
socket.on('room:settings',data=>{$('roomTitle').textContent=data.title;$('title').value=data.title;$('public').checked=data.public;});
socket.on('chat:message',addMsg);
socket.on('room:state',sync);
socket.on('room:members',members=>{$('members').replaceChildren(...members.map(m=>{const e=document.createElement('span');e.className='member';e.textContent=(m.host?'👑 ':'👤 ')+m.name;return e;}));});
socket.on('room:promoted',()=>{isHost=true;$('video').controls=true;$('role').textContent='You are now host · Playback controls enabled';$('saveSettings').disabled=false;say('You are now host.');});
// Volume and mute are deliberately never broadcast: every viewer owns their audio level.
for(const evt of ['play','pause','seeked'])$('video').addEventListener(evt,()=>{
 if(isHost){sendState();return;}
 if(remote||!room)return;
 // Guests can adjust volume, but transport controls remain host-authoritative.
 const v=$('video');
 if(evt==='seeked'){
   remote=true;
   const target=expectedTime+(expectedPlaying?(Date.now()-lastSyncAt)/1000:0);
   if(Math.abs(v.currentTime-target)>1.5)v.currentTime=target;
   remote=false;
 }
 if(evt==='pause'&&expectedPlaying){remote=true;v.play().catch(()=>{});remote=false;}
 if(evt==='play'&&!expectedPlaying){remote=true;v.pause();remote=false;}
});
$('video').addEventListener('timeupdate',()=>{if(isHost&&!remote&&Date.now()-lastSent>12000)sendState();});
loadMovies();

// Match the theater to the actual video's dimensions (16:9, 4:3, ultrawide, portrait).
// object-fit: contain guarantees the full frame remains visible.
$('video').addEventListener('loadedmetadata', () => {
  const v = $('video');
  if (v.videoWidth > 0 && v.videoHeight > 0) {
    document.querySelector('.screen').style.setProperty('--movie-aspect', `${v.videoWidth} / ${v.videoHeight}`);
  }
});

async function loadHistory(){if(!account)return;try{const entries=await api('/api/history');$('history').textContent=entries.length?'Recently watched: '+entries.slice(0,5).map(x=>x.movie+' ('+Math.floor(x.position/60)+'m)').join(' · '):'No watch history yet.';}catch(e){say(e.message);}}
function showAccount(user){account=user;$('accountState').textContent=user?'Signed in as '+user.username:'Sign in to create or join watch parties';$('authUser').hidden=!!user;$('authPass').hidden=!!user;$('register').hidden=!!user;$('login').hidden=!!user;$('logout').hidden=!user;if(user){socket.connect();loadHistory();}else{$('history').textContent='';socket.disconnect();}}
async function auth(action){try{const user=await api('/api/auth/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:$('authUser').value.trim(),password:$('authPass').value})});$('authPass').value='';showAccount(user);say('Welcome, '+user.username+'!');}catch(e){say(e.message);}}
$('register').onclick=()=>auth('register');$('login').onclick=()=>auth('login');
$('logout').onclick=async()=>{try{await api('/api/auth/logout',{method:'POST'});location.reload();}catch(e){say(e.message);}};
$('saveSettings').onclick=async()=>{if(!room||!isHost)return;try{const updated=await api('/api/rooms/'+encodeURIComponent(room),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:$('title').value,public:$('public').checked})});say('Room settings saved.');}catch(e){say(e.message);}};
api('/api/auth/me').then(showAccount).catch(()=>showAccount(null));
