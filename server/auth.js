import crypto from 'node:crypto';
import {promisify} from 'node:util';
import {query} from './db.js';
const scrypt=promisify(crypto.scrypt);
const cookieName='reel_session';
const hashToken=token=>crypto.createHash('sha256').update(token).digest('hex');
const cookieValue=header=>(header||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
export async function hashPassword(password){const salt=crypto.randomBytes(16).toString('hex');const key=await scrypt(password,salt,64);return `${salt}:${key.toString('hex')}`;}
export async function verifyPassword(password,stored){const [salt,expected]=stored.split(':');if(!salt||!expected)return false;const actual=await scrypt(password,salt,64),target=Buffer.from(expected,'hex');return target.length===actual.length&&crypto.timingSafeEqual(target,actual);}
export async function findUser(cookieHeader){const token=cookieValue(cookieHeader);if(!token||!/^[a-f0-9]{64}$/.test(token))return null;const {rows}=await query(`SELECT u.id,u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`,[hashToken(token)]);return rows[0]||null;}
export async function createSession(res,userId){const token=crypto.randomBytes(32).toString('hex');await query(`INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 days')`,[hashToken(token),userId]);res.cookie(cookieName,token,{httpOnly:true,sameSite:'lax',secure:process.env.COOKIE_SECURE==='true',path:'/',maxAge:30*86400_000});}
export async function clearSession(req,res){const token=cookieValue(req.headers.cookie);if(token)await query('DELETE FROM sessions WHERE token_hash=$1',[hashToken(token)]);res.clearCookie(cookieName,{path:'/',sameSite:'lax',secure:process.env.COOKIE_SECURE==='true'});}
export async function requireUser(req,res,next){try{req.user=await findUser(req.headers.cookie);if(!req.user)return res.status(401).json({error:'Sign in first'});next();}catch(e){next(e);}}
