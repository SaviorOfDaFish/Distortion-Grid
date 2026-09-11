import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);

const app=express();
const port=process.env.PORT||3000;

app.use(cors());
app.use(express.json());

app.get('/api/health',(req,res)=>res.json({ok:true,service:'distortion-grid'}));
app.get('/api/leaderboard/today',(req,res)=>res.json([]));
app.post('/api/attempts/start',(req,res)=>res.json({ok:true,studySeconds:15}));
app.post('/api/attempts/complete',(req,res)=>res.json({ok:true,message:'Prototype endpoint'}));

const distPath=path.resolve(__dirname,'../dist');
app.use(express.static(distPath));

app.use((req,res,next)=>{
  if(req.method!=='GET')return next();
  res.sendFile(path.join(distPath,'index.html'));
});

app.listen(port,()=>console.log(`Distortion Grid listening on ${port}`));
