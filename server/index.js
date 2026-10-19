import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { randomInt } from 'node:crypto';

const app = express();
const httpServer = createServer(app);
const allowed = (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map(x => x.trim());
app.use(cors({ origin: allowed, credentials: true }));
app.get('/health', (_req, res) => res.json({ ok: true, service: 'Bloquiz' }));
const io = new Server(httpServer, { cors: { origin: allowed, methods: ['GET','POST'] } });
const rooms = new Map();
const clean = (s, max=50) => String(s ?? '').replace(/[<>]/g,'').trim().slice(0,max);
const publicRoom = room => ({ pin: room.pin, status: room.status, players: [...room.players.values()].map(({id,nickname,score,streak})=>({id,nickname,score,streak})), questionIndex: room.questionIndex, total: room.questions.length });
const emitState = room => io.to(room.pin).emit('room:state', publicRoom(room));
const clientQuestion = q => ({ text:q.text, answers:q.answers.map(a=>a.text), duration:q.duration, type:q.type });
function sendQuestion(room) {
  clearTimeout(room.timer);
  if (room.questionIndex >= room.questions.length) {
    room.status='finished'; io.to(room.pin).emit('game:podium', [...room.players.values()].sort((a,b)=>b.score-a.score).slice(0,3).map(p=>({nickname:p.nickname,score:p.score}))); emitState(room); return;
  }
  room.status='question'; room.answers.clear();
  const q=room.questions[room.questionIndex]; room.startedAt=Date.now();
  io.to(room.pin).emit('game:question', {index:room.questionIndex+1,total:room.questions.length,question:clientQuestion(q),endsAt:room.startedAt+q.duration*1000});
  emitState(room);
  room.timer=setTimeout(()=>showResults(room),q.duration*1000);
}
function showResults(room) {
  if(room.status!=='question') return;
  clearTimeout(room.timer); room.status='results';
  const q=room.questions[room.questionIndex]; const counts=q.answers.map((_,i)=>[...room.answers.values()].filter(a=>a.choice===i).length);
  const top=[...room.players.values()].sort((a,b)=>b.score-a.score).slice(0,5).map(p=>({nickname:p.nickname,score:p.score,streak:p.streak}));
  io.to(room.pin).emit('game:results',{correctIndex:q.correctIndex,counts,top,questionIndex:room.questionIndex+1,total:room.questions.length}); emitState(room);
}
io.on('connection', socket => {
  socket.on('room:create',(payload,ack=()=>{})=>{
    const questions=Array.isArray(payload?.questions)?payload.questions.slice(0,50).map(q=>({text:clean(q.text,240),answers:Array.isArray(q.answers)?q.answers.slice(0,4).map(a=>({text:clean(typeof a==='string'?a:a.text,100)})):[],correctIndex:Number(q.correctIndex)||0,duration:[10,20,30,60].includes(Number(q.duration))?Number(q.duration):20,type:q.type==='tf'?'tf':'choice'})).filter(q=>q.text&&q.answers.length>=2&&q.correctIndex<q.answers.length):[];
    if(!questions.length) return ack({error:'Agrega al menos una pregunta válida.'});
    let pin; do {pin=String(randomInt(100000,1000000));} while(rooms.has(pin));
    const room={pin,hostId:socket.id,questions,players:new Map(),status:'lobby',questionIndex:0,answers:new Map(),timer:null}; rooms.set(pin,room); socket.join(pin); socket.data.pin=pin; socket.data.role='host'; ack({pin}); emitState(room);
  });
  socket.on('room:join',(payload,ack=()=>{})=>{
    const pin=clean(payload?.pin,6), nickname=clean(payload?.nickname,20); const room=rooms.get(pin);
    if(!room) return ack({error:'No encontramos esa sala. Revisa el PIN.'});
    if(room.status!=='lobby') return ack({error:'La partida ya comenzó.'});
    if(!nickname) return ack({error:'Escribe un apodo.'});
    if([...room.players.values()].some(p=>p.nickname.toLowerCase()===nickname.toLowerCase())) return ack({error:'Ese apodo ya está en uso.'});
    const player={id:socket.id,nickname,score:0,streak:0}; room.players.set(socket.id,player); socket.join(pin); socket.data.pin=pin; socket.data.role='player'; ack({ok:true,nickname}); emitState(room);
  });
  socket.on('game:start',(_data,ack=()=>{})=>{const r=rooms.get(socket.data.pin);if(!r||r.hostId!==socket.id)return ack({error:'No autorizado.'});if(r.status!=='lobby')return; if(!r.players.size)return ack({error:'Necesitas al menos un jugador para empezar.'}); r.questionIndex=0;sendQuestion(r);ack({ok:true});});
  socket.on('game:answer',({choice},ack=()=>{})=>{const r=rooms.get(socket.data.pin);if(!r||r.status!=='question'||socket.data.role!=='player')return ack({error:'La pregunta no está abierta.'}); if(r.answers.has(socket.id))return ack({error:'Ya respondiste.'}); const player=r.players.get(socket.id); if(!player)return; const q=r.questions[r.questionIndex], elapsed=(Date.now()-r.startedAt)/1000; const correct=Number(choice)===q.correctIndex; r.answers.set(socket.id,{choice:Number(choice),correct}); player.streak=correct?player.streak+1:0; if(correct)player.score+=Math.max(100,Math.round(1000*(1-Math.min(elapsed,q.duration)/q.duration))+Math.min(player.streak-1,5)*50); socket.emit('answer:ack',{correct,score:player.score,streak:player.streak}); ack({ok:true}); if(r.answers.size===r.players.size)showResults(r);});
  socket.on('game:next',(_data,ack=()=>{})=>{const r=rooms.get(socket.data.pin);if(!r||r.hostId!==socket.id)return ack({error:'No autorizado.'});if(r.status!=='results')return; r.questionIndex++;sendQuestion(r);ack({ok:true});});
  socket.on('disconnect',()=>{const pin=socket.data.pin,r=rooms.get(pin);if(!r)return;if(socket.data.role==='player'){r.players.delete(socket.id);r.answers.delete(socket.id);emitState(r);}else if(r.hostId===socket.id){clearTimeout(r.timer);io.to(pin).emit('room:closed');rooms.delete(pin);}});
});
const port=process.env.PORT||3001; httpServer.listen(port,'0.0.0.0',()=>console.log(`Bloquiz server on ${port}`));
