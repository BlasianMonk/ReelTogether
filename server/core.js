import crypto from 'node:crypto';
export const id = () => crypto.randomUUID();
export const clean = (s, n=80) => String(s ?? '').trim().slice(0,n).replace(/[<>]/g,'');
export const validId = s => typeof s === 'string' && /^[a-f0-9-]{36}$/i.test(s);
export const safeFile = s => String(s||'').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,120);
export function makeTicket(room,secret) {
 const data=Buffer.from(JSON.stringify({room,exp:Date.now()+86400000})).toString('base64url');
 return `${data}.${crypto.createHmac('sha256',secret).update(data).digest('base64url')}`;
}
export function verifyTicket(ticket,secret) {
 if(typeof ticket!=='string')return null;
 const bits=ticket.split('.'); if(bits.length!==2)return null;
 const [data,sig]=bits;
 const expected=crypto.createHmac('sha256',secret).update(data).digest('base64url');
 if(sig.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null;
 try { const parsed=JSON.parse(Buffer.from(data,'base64url').toString()); return parsed.exp>Date.now()&&validId(parsed.room)?parsed.room:null; }catch{return null;}
}
export function clampTime(t,duration=Infinity) { const n=Number(t);return Number.isFinite(n)?Math.max(0,Math.min(n,duration)):0; }
