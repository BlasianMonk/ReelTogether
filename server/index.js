import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import {Server} from 'socket.io';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {id,clean,validId,safeFile,makeTicket,verifyTicket,clampTime} from './core.js';
import {query,migrate,saveHistory} from './db.js';
import {hashPassword,verifyPassword,findUser,createSession,clearSession,requireUser} from './auth.js';

const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mediaDir=path.join(base,'media');fs.mkdirSync(mediaDir,{recursive:true});
const app=express(),server=http.createServer(app);
const io=new Server(server,{maxHttpBufferSize:12_000, cors:{origin:false}});
const secret=process.env.APP_SECRET;
if(!secret||secret.length<32)throw Error('Set APP_SECRET to at least 32 characters in .env');
const port=Number(process.env.PORT)||3000;
const host=process.env.HOST||'127.0.0.1';
app.disable('x-powered-by');
app.use(helmet({contentSecurityPolicy:false}));
app.use(express.json({limit:'32kb'}));
app.use('/api',rateLimit({windowMs:60_000,limit:180,standardHeaders:'draft-7',legacyHeaders:false}));
app.use(express.static(path.join(base,'public')));
const extensions=new Set(['.mp4','.webm','.m4v','.ogv']);
const rooms=new Map(); // Active Socket.IO presence; room metadata is persisted in PostgreSQL.
function fromRow(r){return {id:r.id,title:r.title,movie:r.movie,public:r.public,hostKey:r.host_key,ownerId:r.owner_id,members:new Map(),playing:r.playing,time:Number(r.position),updated:new Date(r.updated_at).getTime(),messages:[]};}
async function getRoom(roomId){if(rooms.has(roomId))return rooms.get(roomId);const {rows}=await query('SELECT * FROM rooms WHERE id=$1',[roomId]);if(!rows[0])return null;const room=fromRow(rows[0]);rooms.set(room.id,room);return room;}
async function persistPlayback(room){await query('UPDATE rooms SET playing=$2,position=$3,updated_at=now() WHERE id=$1',[room.id,room.playing,room.time]);}
function movies(){
 return fs.readdirSync(mediaDir,{withFileTypes:true}).filter(f=>f.isFile()&&extensions.has(path.extname(f.name).toLowerCase())).map(f=>({id:f.name,title:path.parse(f.name).name.replace(/[_-]/g,' '),size:fs.statSync(path.join(mediaDir,f.name)).size})).sort((a,b)=>a.title.localeCompare(b.title));
}
const movieById=name=>movies().find(m=>m.id===name);
app.get('/api/health',async(_,res)=>{await query('SELECT 1');res.json({ok:true,rooms:rooms.size,database:'connected'});});
app.post('/api/auth/register',async(req,res)=>{
 const username=clean(req.body?.username,32),password=req.body?.password;
 if(!/^[a-zA-Z0-9_]{3,32}$/.test(username)||typeof password!=='string'||password.length<10||password.length>128)return res.status(400).json({error:'Username: 3–32 letters/numbers/underscores; password: 10–128 characters'});
 const passwordHash=await hashPassword(password),userId=id();
 try{await query('INSERT INTO users(id,username,password_hash) VALUES($1,$2,$3)',[userId,username,passwordHash]);}catch(e){if(e.code==='23505')return res.status(409).json({error:'Username already exists'});throw e;}
 await createSession(res,userId);res.status(201).json({id:userId,username});
});
app.post('/api/auth/login',async(req,res)=>{
 const username=String(req.body?.username||''),password=req.body?.password;
 if(typeof password!=='string')return res.status(401).json({error:'Invalid credentials'});
 const {rows}=await query('SELECT * FROM users WHERE username=$1',[username]);
 if(!rows[0]||!await verifyPassword(password,rows[0].password_hash))return res.status(401).json({error:'Invalid credentials'});
 await createSession(res,rows[0].id);res.json({id:rows[0].id,username:rows[0].username});
});
app.get('/api/auth/me',requireUser,(req,res)=>res.json(req.user));
app.post('/api/auth/logout',async(req,res)=>{await clearSession(req,res);res.json({ok:true});});
app.get('/api/history',requireUser,async(req,res)=>{const {rows}=await query('SELECT movie,position,last_watched FROM watch_history WHERE user_id=$1 ORDER BY last_watched DESC LIMIT 50',[req.user.id]);res.json(rows);});
app.get('/api/movies',(_,res)=>res.json(movies()));
app.get('/api/rooms',async(_,res)=>{const {rows}=await query('SELECT id,title,movie FROM rooms WHERE public=true ORDER BY created_at DESC LIMIT 100');res.json(rows.map(r=>({...r,viewers:rooms.get(r.id)?.members.size||0})));});
app.post('/api/rooms',requireUser,async(req,res)=>{
 const movie=clean(req.body?.movie,120),title=clean(req.body?.title||'Movie Night',70);
 if(!movieById(movie))return res.status(400).json({error:'Select a movie from your library'});
 const room={id:id(),ownerId:req.user.id,title,movie,public:req.body?.public!==false,hostKey:crypto.randomBytes(24).toString('hex'),members:new Map(),playing:false,time:0,updated:Date.now(),messages:[]};
 await query('INSERT INTO rooms(id,owner_id,title,movie,public,host_key) VALUES($1,$2,$3,$4,$5,$6)',[room.id,room.ownerId,title,movie,room.public,room.hostKey]);
 rooms.set(room.id,room);res.status(201).json({room:room.id,hostKey:room.hostKey,invite:makeTicket(room.id,secret)});
});
app.get('/api/rooms/:room',async(req,res)=>{
 const room=await getRoom(req.params.room);if(!room)return res.status(404).json({error:'Room not found'});
 if(!room.public&&verifyTicket(req.query.ticket,secret)!==room.id)return res.status(403).json({error:'Invite required'});
 res.json({id:room.id,title:room.title,movie:room.movie,playing:room.playing,time:currentTime(room),viewers:room.members.size,invite:makeTicket(room.id,secret)});
});
app.patch('/api/rooms/:room',requireUser,async(req,res)=>{
 const room=await getRoom(req.params.room);if(!room)return res.sendStatus(404);
 if(room.ownerId!==req.user.id)return res.sendStatus(403);
 const title=clean(req.body?.title||room.title,70),publicRoom=typeof req.body?.public==='boolean'?req.body.public:room.public;
 if(!title)return res.status(400).json({error:'Title is required'});
 await query('UPDATE rooms SET title=$2,public=$3 WHERE id=$1',[room.id,title,publicRoom]);
 room.title=title;room.public=publicRoom;io.to(room.id).emit('room:settings',{title,public:publicRoom});res.json({title,public:publicRoom});
});
function currentTime(r){return r.playing?clampTime(r.time+(Date.now()-r.updated)/1000):r.time;}
app.get('/api/stream/:name',(req,res)=>{
 const name=req.params.name;
 if(!movieById(name))return res.sendStatus(404);
 const full=path.join(mediaDir,name),size=fs.statSync(full).size,ext=path.extname(name).toLowerCase();
 const mime={'.mp4':'video/mp4','.m4v':'video/mp4','.webm':'video/webm','.ogv':'video/ogg'}[ext];
 res.setHeader('Accept-Ranges','bytes');
 res.setHeader('Content-Type',mime);
 res.setHeader('Cache-Control','private, max-age=3600');
 const range=req.headers.range;
 if(range){
   const match=/^bytes=(\d*)-(\d*)$/.exec(range);
   if(!match)return res.status(416).set('Content-Range',`bytes */${size}`).end();
   let start=match[1]?Number(match[1]):0,end=match[2]?Number(match[2]):size-1;
   if(!match[1]&&match[2]){const suffix=Number(match[2]);start=Math.max(0,size-suffix);end=size-1;}
   if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||start>end)return res.status(416).set('Content-Range',`bytes */${size}`).end();
   end=Math.min(end,size-1);
   res.status(206).set({'Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':String(end-start+1)});
   fs.createReadStream(full,{start,end}).pipe(res);
 } else {res.setHeader('Content-Length',String(size));fs.createReadStream(full).pipe(res);}
});
const upload=multer({storage:multer.diskStorage({
 destination:(_,__,cb)=>cb(null,mediaDir),
 filename:(_,file,cb)=>cb(null,`${Date.now()}-${crypto.randomBytes(5).toString('hex')}-${safeFile(file.originalname)}`)
}),limits:{fileSize:Math.max(1,Number(process.env.MAX_UPLOAD_MB)||2048)*1024*1024},fileFilter:(_,file,cb)=>cb(null,extensions.has(path.extname(file.originalname).toLowerCase()))});
app.post('/api/upload',(req,res)=>{
 if(!process.env.UPLOAD_KEY)return res.status(403).json({error:'Uploads disabled; add UPLOAD_KEY in .env'});
 const key=req.headers['x-upload-key'];
 if(typeof key!=='string'||key.length!==process.env.UPLOAD_KEY.length||!crypto.timingSafeEqual(Buffer.from(key),Buffer.from(process.env.UPLOAD_KEY)))return res.sendStatus(403);
 upload.single('movie')(req,res,err=>{
  if(err)return res.status(400).json({error:err.message});
  if(!req.file)return res.status(400).json({error:'Supported video: MP4, WebM, M4V, OGV'});
  res.status(201).json({id:req.file.filename});
 });
});
function broadcastRoom(room){
 io.to(room.id).emit('room:state',{playing:room.playing,time:currentTime(room),movie:room.movie,viewers:room.members.size,serverTime:Date.now()});
 io.to(room.id).emit('room:members',[...room.members.values()].map(m=>({name:m.name,host:m.host})));
}
io.use(async(socket,next)=>{try{socket.data.user=await findUser(socket.handshake.headers.cookie);if(!socket.data.user)return next(new Error('Sign in first'));next();}catch(e){next(e);}});
io.on('connection',socket=>{
 let joined=null,username='Guest',isHost=false;
 socket.on('room:join',async(data,reply=()=>{})=>{
 try{
  if(joined)return reply({error:'Already joined a room'});
  const room=await getRoom(data?.room);
  if(!room)return reply({error:'Room not found'});
  if(!room.public&&verifyTicket(data?.ticket,secret)!==room.id)return reply({error:'Invite required'});
  username=clean(data?.name||'Guest',24)||'Guest';
  isHost=socket.data.user.id===room.ownerId || (typeof data?.hostKey==='string'&&data.hostKey===room.hostKey);
  joined=room;room.members.set(socket.id,{name:username,host:isHost});socket.join(room.id);
  reply({ok:true,room:{id:room.id,title:room.title,movie:room.movie,playing:room.playing,time:currentTime(room),host:isHost,messages:room.messages}});
  broadcastRoom(room);await saveHistory(socket.data.user.id,room.movie,currentTime(room));
 }catch(e){reply({error:'Could not join room'});console.error(e);}
 });
 socket.on('chat:send',(data,reply=()=>{})=>{
  if(!joined)return reply({error:'Join a room first'});
  const msg=clean(data?.text,400);
  if(!msg)return reply({error:'Message is empty'});
  const message={id:id(),name:username,text:msg,at:Date.now()};
  joined.messages.push(message);if(joined.messages.length>100)joined.messages.shift();
  io.to(joined.id).emit('chat:message',message);reply({ok:true});
 });
 socket.on('playback:update',async(data,reply=()=>{})=>{
  if(!joined||!isHost)return reply({error:'Only the host can control playback'});
  if(typeof data?.playing!=='boolean')return reply({error:'Invalid playback state'});
  joined.time=clampTime(data.time);joined.playing=data.playing;joined.updated=Date.now();
  try{await persistPlayback(joined);await saveHistory(socket.data.user.id,joined.movie,joined.time);broadcastRoom(joined);reply({ok:true});}catch(e){console.error(e);reply({error:'Could not save playback'});}
 });
 socket.on('disconnect',()=>{
  if(!joined)return;
  joined.members.delete(socket.id);
  if(isHost&&joined.members.size){const [nextId,next]=joined.members.entries().next().value;next.host=true;io.to(nextId).emit('room:promoted');}
  broadcastRoom(joined);
  if(joined.members.size===0)setTimeout(()=>{if(joined.members.size===0)rooms.delete(joined.id)},30*60_000).unref();
 });
});
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'Server error'});});
await migrate();
server.listen(port,host,()=>console.log(`WatchParty running at http://${host}:${port}`));
