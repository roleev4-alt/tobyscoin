import { useState, useMemo, useRef } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from "recharts";

const C = {
  bg:"#0D2218", bgDark:"#081610", bgMid:"#122B1E", card:"#163324", cardHover:"#1C4030",
  border:"rgba(255,255,255,0.12)", borderAcc:"rgba(255,255,255,0.25)",
  cream:"#F5EDD8", creamMid:"#E8D9B8", amber:"#D4943A", amberLight:"#F0B55A",
  green:"#5DBF8A", red:"#E07070", blue:"#6AABCC", purple:"#A888CC",
  text:"#F0E8D5", textMuted:"rgba(240,232,213,0.55)",
  semGreen:"#4CAF7D", semYellow:"#F0C040", semRed:"#E05555",
};

const fmt = n => "L " + Number(n).toLocaleString("es-HN",{minimumFractionDigits:2,maximumFractionDigits:2});
const today = () => new Date().toISOString().slice(0,10);
const TIPO_CUENTA = ["Activo","Pasivo","Capital","Ingreso","Gasto"];
const PIE_COLORS = [C.amber,C.blue,C.green,"#B07AC8","#E09A60","#6ABEAA","#E07090"];

const initCuentas = [
  {id:1,codigo:"1001",nombre:"Caja",tipo:"Activo"},
  {id:2,codigo:"1002",nombre:"Banco",tipo:"Activo"},
  {id:3,codigo:"1003",nombre:"Fondo de Emergencia",tipo:"Activo"},
  {id:4,codigo:"2001",nombre:"Préstamos",tipo:"Pasivo"},
  {id:5,codigo:"3001",nombre:"Capital Personal",tipo:"Capital"},
  {id:6,codigo:"4001",nombre:"Salario",tipo:"Ingreso"},
  {id:7,codigo:"4002",nombre:"Ingresos Extra",tipo:"Ingreso"},
  {id:8,codigo:"5001",nombre:"Alimentación",tipo:"Gasto"},
  {id:9,codigo:"5002",nombre:"Transporte",tipo:"Gasto"},
  {id:10,codigo:"5003",nombre:"Servicios",tipo:"Gasto"},
  {id:11,codigo:"5004",nombre:"Entretenimiento",tipo:"Gasto"},
  {id:12,codigo:"5005",nombre:"Suscripciones",tipo:"Gasto"},
];

const initAsientos = [
  {id:1,fecha:"2025-05-01",descripcion:"Salario mayo",jobId:null,lineas:[{cuentaId:2,debe:25000,haber:0},{cuentaId:6,debe:0,haber:25000}]},
  {id:2,fecha:"2025-05-03",descripcion:"Víveres supermercado",jobId:null,lineas:[{cuentaId:8,debe:1800,haber:0},{cuentaId:2,debe:0,haber:1800}]},
  {id:3,fecha:"2025-05-05",descripcion:"Netflix",jobId:null,lineas:[{cuentaId:12,debe:250,haber:0},{cuentaId:2,debe:0,haber:250}]},
  {id:4,fecha:"2025-05-10",descripcion:"Spotify",jobId:null,lineas:[{cuentaId:12,debe:100,haber:0},{cuentaId:2,debe:0,haber:100}]},
  {id:5,fecha:"2025-05-12",descripcion:"Transporte mensual",jobId:null,lineas:[{cuentaId:9,debe:600,haber:0},{cuentaId:2,debe:0,haber:600}]},
  {id:6,fecha:"2025-05-15",descripcion:"Servicios básicos",jobId:null,lineas:[{cuentaId:10,debe:950,haber:0},{cuentaId:2,debe:0,haber:950}]},
  {id:7,fecha:"2025-05-20",descripcion:"Ingresos freelance",jobId:null,lineas:[{cuentaId:2,debe:6000,haber:0},{cuentaId:7,debe:0,haber:6000}]},
  {id:8,fecha:"2025-06-01",descripcion:"Salario junio",jobId:null,lineas:[{cuentaId:2,debe:25000,haber:0},{cuentaId:6,debe:0,haber:25000}]},
  {id:9,fecha:"2025-06-03",descripcion:"Netflix",jobId:null,lineas:[{cuentaId:12,debe:250,haber:0},{cuentaId:2,debe:0,haber:250}]},
  {id:10,fecha:"2025-06-04",descripcion:"Spotify",jobId:null,lineas:[{cuentaId:12,debe:100,haber:0},{cuentaId:2,debe:0,haber:100}]},
  {id:11,fecha:"2025-06-05",descripcion:"Víveres semana 1",jobId:null,lineas:[{cuentaId:8,debe:1200,haber:0},{cuentaId:2,debe:0,haber:1200}]},
  {id:12,fecha:"2025-06-08",descripcion:"Transporte",jobId:null,lineas:[{cuentaId:9,debe:600,haber:0},{cuentaId:2,debe:0,haber:600}]},
];

const initJobs = [
  {id:1,nombre:"Viaje a la Playa",presupuesto:15000,fechaInicio:"2025-06-01",fechaFin:"2025-06-30",activo:false,color:"#6AABCC"},
  {id:2,nombre:"Navidad 2025",presupuesto:20000,fechaInicio:"2025-11-01",fechaFin:"2025-12-31",activo:false,color:"#E07070"},
];

const initCuotas = [
  {id:1,nombre:"Arreglo Tarjeta Visa",saldoTotal:60000,cuotaMensual:3000,proximoPago:"2025-07-05",frecuencia:"mensual",pagosRealizados:2,color:"#6AABCC"},
  {id:2,nombre:"Tarjeta Mastercard",saldoTotal:25000,cuotaMensual:2000,proximoPago:"2025-07-10",frecuencia:"mensual",pagosRealizados:1,color:"#E07070"},
];

const initTarjetas = [
  {id:1,nombre:"Visa Banpais",limite:50000,saldoActual:18000,fechaCorte:18,fechaPago:28,color:"#6AABCC"},
  {id:2,nombre:"Mastercard BAC",limite:35000,saldoActual:12500,fechaCorte:10,fechaPago:25,color:"#E07070"},
];

const s = {
  app:{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'Segoe UI',sans-serif"},
  nav:{background:C.bgDark,borderBottom:`1px solid ${C.border}`,padding:"0 1rem",display:"flex",alignItems:"center",gap:"0.3rem",height:50,flexWrap:"wrap"},
  navTitle:{color:C.amberLight,fontWeight:700,fontSize:14,marginRight:"1rem",whiteSpace:"nowrap"},
  navBtn:a=>({background:a?C.card:"transparent",color:a?C.cream:C.textMuted,border:a?`1px solid ${C.borderAcc}`:"1px solid transparent",borderRadius:6,padding:"4px 11px",cursor:"pointer",fontSize:12}),
  main:{padding:"1rem 1.25rem"},
  grid4:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:"0.65rem",marginBottom:"1rem"},
  mCard:acc=>({background:C.card,border:`1px solid ${C.border}`,borderLeft:`3px solid ${acc}`,borderRadius:10,padding:"0.8rem 1rem"}),
  mLabel:{fontSize:10,color:C.textMuted,marginBottom:3,textTransform:"uppercase",letterSpacing:0.6},
  mValue:{fontSize:19,fontWeight:700},
  sec:{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"1rem 1.15rem",marginBottom:"0.85rem"},
  sTitle:{fontWeight:600,fontSize:12,marginBottom:"0.8rem",color:C.amberLight,textTransform:"uppercase",letterSpacing:0.7},
  table:{width:"100%",borderCollapse:"collapse",fontSize:12},
  th:{textAlign:"left",padding:"5px 8px",borderBottom:`1px solid ${C.border}`,color:C.textMuted,fontWeight:500,fontSize:11},
  td:{padding:"6px 8px",borderBottom:`1px solid rgba(255,255,255,0.05)`,color:C.text},
  badge:tipo=>{const m={Activo:[C.blue],Pasivo:[C.red],Capital:[C.amberLight],Ingreso:[C.green],Gasto:["#C08A5A"]};const[bg]=m[tipo]||[C.card];return{background:bg+"33",color:bg,border:`1px solid ${bg}55`,borderRadius:4,padding:"2px 7px",fontSize:10,fontWeight:600};},
  input:{background:"rgba(0,0,0,0.25)",border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 9px",color:C.cream,fontSize:12,width:"100%",boxSizing:"border-box"},
  select:{background:C.bgMid,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 9px",color:C.cream,fontSize:12,width:"100%"},
  btn:(v="primary")=>({background:v==="primary"?C.amber:v==="danger"?C.red:v==="green"?C.semGreen:C.cardHover,color:v==="primary"?C.bgDark:C.cream,border:"none",borderRadius:6,padding:"6px 15px",cursor:"pointer",fontWeight:600,fontSize:12}),
  btnSm:(v="default")=>({background:v==="danger"?"rgba(224,112,112,0.15)":v==="green"?"rgba(76,175,125,0.15)":C.cardHover,color:v==="danger"?C.red:v==="green"?C.green:C.textMuted,border:"none",borderRadius:4,padding:"3px 9px",cursor:"pointer",fontSize:11}),
  label:{fontSize:11,color:C.textMuted,display:"block",marginBottom:3},
  msg:t=>({background:t==="error"?"rgba(224,112,112,0.12)":"rgba(93,191,138,0.12)",border:`1px solid ${t==="error"?C.red:C.green}`,borderRadius:6,padding:"7px 11px",fontSize:12,color:t==="error"?C.red:C.green,marginTop:"0.65rem"}),
  toggle:on=>({width:38,height:20,borderRadius:10,background:on?C.semGreen:"rgba(255,255,255,0.15)",border:"none",cursor:"pointer",position:"relative",transition:"background .2s",flexShrink:0}),
  toggleDot:on=>({position:"absolute",top:3,left:on?19:3,width:14,height:14,borderRadius:"50%",background:"white",transition:"left .2s"}),
  TOOLTIP:{contentStyle:{background:C.bgDark,border:`1px solid ${C.border}`,color:C.cream,fontSize:11},formatter:v=>fmt(v)},
};

const SEM_COLOR = {green:C.semGreen,yellow:C.semYellow,red:C.semRed};
const TABS=[
  {id:"dashboard",label:"Dashboard"},{id:"jobs",label:"Proyectos"},
  {id:"asiento",label:"Nuevo Asiento"},{id:"diario",label:"Libro Diario"},
  {id:"cuentas",label:"Cuentas"},{id:"balance",label:"Balances"},
  {id:"tools",label:"Herramientas"},{id:"calendario",label:"📅 Calendario"},
];

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [cuentas, setCuentas] = useState(initCuentas);
  const [asientos, setAsientos] = useState(initAsientos);
  const [jobs, setJobs] = useState(initJobs);
  const [cuotas, setCuotas] = useState(initCuotas);
  const [tarjetas, setTarjetas] = useState(initTarjetas);

  const [newCuenta, setNewCuenta] = useState({codigo:"",nombre:"",tipo:"Activo"});
  const [cMsg, setCMsg] = useState(null);
  const [editingCuenta, setEditingCuenta] = useState(null);
  const [editVals, setEditVals] = useState({codigo:"",nombre:"",tipo:"Activo"});

  const [newA, setNewA] = useState({fecha:today(),descripcion:"",lineas:[{cuentaId:"",debe:0,haber:0},{cuentaId:"",debe:0,haber:0}]});
  const [aMsg, setAMsg] = useState(null);

  const [newJob, setNewJob] = useState({nombre:"",presupuesto:"",fechaInicio:"",fechaFin:"",color:"#6AABCC"});
  const [jMsg, setJMsg] = useState(null);

  const [newCuota, setNewCuota] = useState({nombre:"",saldoTotal:"",cuotaMensual:"",proximoPago:"",frecuencia:"mensual",color:"#6AABCC"});
  const [newTarjeta, setNewTarjeta] = useState({nombre:"",limite:"",saldoActual:"",fechaCorte:"",fechaPago:"",color:"#5DBF8A"});
  const [cqMsg, setCqMsg] = useState(null);
  const [ctMsg, setCtMsg] = useState(null);
  const [calMes, setCalMes] = useState(()=>{ const d=new Date(); return{y:d.getFullYear(),m:d.getMonth()}; });

  const [whatIfMonto, setWhatIfMonto] = useState("");
  const [whatIfDesc, setWhatIfDesc] = useState("");
  const [whatIfResult, setWhatIfResult] = useState(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanMsg, setScanMsg] = useState(null);
  const fileRef = useRef();
  const [showNotif, setShowNotif] = useState(false);

  const jobActivo = useMemo(()=>jobs.find(j=>j.activo)||null,[jobs]);

  const saldos = useMemo(()=>{
    const m={}; cuentas.forEach(c=>m[c.id]=0);
    asientos.forEach(a=>a.lineas.forEach(l=>{ if(m[l.cuentaId]!==undefined) m[l.cuentaId]+=(l.debe-l.haber); }));
    return m;
  },[cuentas,asientos]);

  const totales = useMemo(()=>{
    let ingresos=0,gastos=0,activos=0;
    cuentas.forEach(c=>{ const v=saldos[c.id]||0;
      if(c.tipo==="Ingreso") ingresos+=Math.abs(v);
      if(c.tipo==="Gasto") gastos+=v;
      if(c.tipo==="Activo") activos+=v;
    });
    return{ingresos,gastos,activos,neto:ingresos-gastos};
  },[cuentas,saldos]);

  const gastosPorCuenta = useMemo(()=>
    cuentas.filter(c=>c.tipo==="Gasto").map(c=>({name:c.nombre,value:Math.max(0,saldos[c.id]||0)})).filter(x=>x.value>0)
  ,[cuentas,saldos]);

  const mesData = useMemo(()=>{
    const m={};
    asientos.forEach(a=>{ const mes=a.fecha.slice(0,7); if(!m[mes]) m[mes]={mes,ingresos:0,gastos:0};
      a.lineas.forEach(l=>{ const c=cuentas.find(x=>x.id===l.cuentaId); if(!c) return;
        if(c.tipo==="Ingreso") m[mes].ingresos+=l.haber;
        if(c.tipo==="Gasto") m[mes].gastos+=l.debe;
      });
    });
    return Object.values(m).sort((a,b)=>a.mes.localeCompare(b.mes));
  },[asientos,cuentas]);

  const proyeccionMes = useMemo(()=>{
    const ahora=new Date(); const mesActual=ahora.toISOString().slice(0,7);
    const mesesPasados=mesData.filter(m=>m.mes<mesActual);
    if(mesesPasados.length===0) return null;
    const avgGasto=mesesPasados.reduce((s,m)=>s+m.gastos,0)/mesesPasados.length;
    const avgIngreso=mesesPasados.reduce((s,m)=>s+m.ingresos,0)/mesesPasados.length;
    const diaActual=ahora.getDate(); const diasMes=new Date(ahora.getFullYear(),ahora.getMonth()+1,0).getDate();
    const pct=diaActual/diasMes;
    const gastoActualMes=mesData.find(m=>m.mes===mesActual)?.gastos||0;
    const gastoProyectado=gastoActualMes+(avgGasto-avgGasto*pct);
    const saldoProyectado=totales.activos+(avgIngreso-gastoProyectado);
    return{gastoProyectado,saldoProyectado,pct:Math.round(pct*100),avgGasto,gastoActualMes};
  },[mesData,totales]);

  const suscripciones = useMemo(()=>{
    const map={};
    asientos.forEach(a=>{ const key=a.descripcion.trim().toLowerCase();
      a.lineas.forEach(l=>{ const c=cuentas.find(x=>x.id===l.cuentaId);
        if(c&&c.tipo==="Gasto"&&l.debe>0){ if(!map[key]) map[key]={desc:a.descripcion,monto:l.debe,count:0,total:0}; map[key].count++; map[key].total+=l.debe; }
      });
    });
    return Object.values(map).filter(x=>x.count>=2).sort((a,b)=>b.total-a.total);
  },[asientos,cuentas]);

  const jobsConGasto = useMemo(()=>jobs.map(j=>{
    const gastoJob=asientos.filter(a=>a.jobId===j.id).reduce((s,a)=>s+a.lineas.reduce((ss,l)=>{ const c=cuentas.find(x=>x.id===l.cuentaId); return ss+(c&&c.tipo==="Gasto"?l.debe:0); },0),0);
    const pctGasto=j.presupuesto>0?(gastoJob/j.presupuesto)*100:0;
    const hoy=new Date(); const inicio=new Date(j.fechaInicio); const fin=new Date(j.fechaFin);
    const totalDias=(fin-inicio)/(1000*60*60*24); const diasPasados=Math.max(0,(hoy-inicio)/(1000*60*60*24));
    const pctTiempo=Math.min(100,(diasPasados/totalDias)*100);
    const ratio=pctTiempo>0?pctGasto/pctTiempo:0;
    let semaforo="green",alerta=null;
    if(pctGasto>=100){semaforo="red";alerta="¡Presupuesto agotado!";}
    else if(ratio>1.4){semaforo="red";alerta=`Alerta: Vas ${Math.round((ratio-1)*100)}% más rápido de lo planeado`;}
    else if(ratio>1.1||pctGasto>80){semaforo="yellow";alerta=`Precaución: ${Math.round(pctGasto)}% del presupuesto con ${Math.round(pctTiempo)}% del tiempo`;}
    return{...j,gastoJob,pctGasto:Math.min(100,pctGasto),pctTiempo,semaforo,alerta};
  }),[jobs,asientos,cuentas]);

  const calEventos = useMemo(()=>{
    const ev={};
    const addEv=(dia,tipo,label,color)=>{ const key=`${calMes.y}-${String(calMes.m+1).padStart(2,"0")}-${String(dia).padStart(2,"0")}`; if(!ev[key]) ev[key]=[]; ev[key].push({tipo,label,color}); };
    cuotas.forEach(c=>{ const d=new Date(c.proximoPago+"T12:00:00"); if(d.getFullYear()===calMes.y&&d.getMonth()===calMes.m) addEv(d.getDate(),"cuota",`Cuota: ${c.nombre}`,c.color); });
    tarjetas.forEach(t=>{ addEv(t.fechaCorte,"corte",`Corte: ${t.nombre}`,t.color); addEv(t.fechaPago,"pago",`Pago: ${t.nombre}`,t.color); });
    return ev;
  },[cuotas,tarjetas,calMes]);

  const notifCount = useMemo(()=>{
    const n=[]; const hoy=new Date(); hoy.setHours(0,0,0,0);
    jobsConGasto.forEach(j=>{ if(j.alerta) n.push({tipo:j.semaforo,msg:`${j.nombre}: ${j.alerta}`}); });
    if(proyeccionMes&&proyeccionMes.gastoActualMes>proyeccionMes.avgGasto*0.7) n.push({tipo:"yellow",msg:`Proyección: podrías gastar ${fmt(proyeccionMes.gastoProyectado)} este mes`});
    cuotas.forEach(c=>{ const d=new Date(c.proximoPago+"T12:00:00"); const diff=Math.round((d-hoy)/(1000*60*60*24));
      if(diff<=5&&diff>=0) n.push({tipo:"red",msg:`⏰ Cuota "${c.nombre}": vence en ${diff===0?"HOY":diff+" día(s)"} — ${fmt(c.cuotaMensual)}`});
      else if(diff<=10) n.push({tipo:"yellow",msg:`Cuota "${c.nombre}" vence el ${c.proximoPago}`});
    });
    tarjetas.forEach(t=>{ const dh=hoy.getDate(); const diffCorte=((t.fechaCorte-dh+31)%31); const diffPago=((t.fechaPago-dh+31)%31);
      if(diffCorte<=3) n.push({tipo:"yellow",msg:`✂ Corte ${t.nombre} en ${diffCorte===0?"HOY":diffCorte+" día(s)"} — Saldo: ${fmt(t.saldoActual)}`});
      if(diffPago<=5) n.push({tipo:"red",msg:`💳 Pago ${t.nombre} en ${diffPago===0?"HOY":diffPago+" día(s)"}`});
    });
    return n;
  },[jobsConGasto,proyeccionMes,cuotas,tarjetas]);

  function toggleJob(id){ setJobs(js=>js.map(j=>({...j,activo:j.id===id?!j.activo:false}))); }
  function addJob(){
    if(!newJob.nombre.trim()||!newJob.presupuesto||!newJob.fechaInicio||!newJob.fechaFin){setJMsg({t:"error",msg:"Todos los campos son requeridos."}); return;}
    setJobs([...jobs,{...newJob,id:Date.now(),presupuesto:parseFloat(newJob.presupuesto),activo:false}]);
    setNewJob({nombre:"",presupuesto:"",fechaInicio:"",fechaFin:"",color:"#6AABCC"});
    setJMsg({t:"success",msg:"Proyecto creado."}); setTimeout(()=>setJMsg(null),2000);
  }
  function addLinea(){ setNewA(a=>({...a,lineas:[...a.lineas,{cuentaId:"",debe:0,haber:0}]})); }
  function removeLinea(i){ setNewA(a=>({...a,lineas:a.lineas.filter((_,idx)=>idx!==i)})); }
  function updLinea(i,f,v){ setNewA(a=>{const ls=[...a.lineas];ls[i]={...ls[i],[f]:f==="cuentaId"?Number(v):parseFloat(v)||0};return{...a,lineas:ls};}); }
  function saveAsiento(){
    if(!newA.fecha||!newA.descripcion.trim()){setAMsg({t:"error",msg:"Fecha y descripción requeridos."}); return;}
    const td=newA.lineas.reduce((s,l)=>s+l.debe,0),th=newA.lineas.reduce((s,l)=>s+l.haber,0);
    if(Math.abs(td-th)>0.01){setAMsg({t:"error",msg:`No cuadra: Debe ${fmt(td)} ≠ Haber ${fmt(th)}`}); return;}
    if(newA.lineas.some(l=>!l.cuentaId)){setAMsg({t:"error",msg:"Todas las líneas requieren cuenta."}); return;}
    setAsientos([...asientos,{...newA,descripcion:newA.descripcion.trim(),jobId:jobActivo?.id||null,id:Date.now()}]);
    setNewA({fecha:today(),descripcion:"",lineas:[{cuentaId:"",debe:0,haber:0},{cuentaId:"",debe:0,haber:0}]});
    setAMsg({t:"success",msg:`Asiento guardado${jobActivo?` → "${jobActivo.nombre}"`:""}. `}); setTimeout(()=>setAMsg(null),3000);
  }
  function addCuenta(){
    if(!newCuenta.codigo.trim()||!newCuenta.nombre.trim()){setCMsg({t:"error",msg:"Código y nombre requeridos."}); return;}
    if(cuentas.find(c=>c.codigo===newCuenta.codigo.trim())){setCMsg({t:"error",msg:"Código ya existe."}); return;}
    setCuentas([...cuentas,{...newCuenta,codigo:newCuenta.codigo.trim(),nombre:newCuenta.nombre.trim(),id:Date.now()}]);
    setNewCuenta({codigo:"",nombre:"",tipo:"Activo"});
    setCMsg({t:"success",msg:"Cuenta creada."}); setTimeout(()=>setCMsg(null),2000);
  }
  function startEdit(c){ setEditingCuenta(c.id); setEditVals({codigo:c.codigo,nombre:c.nombre,tipo:c.tipo}); }
  function saveEdit(id){
    if(!editVals.codigo.trim()||!editVals.nombre.trim()){setCMsg({t:"error",msg:"Código y nombre requeridos."}); return;}
    if(cuentas.find(c=>c.codigo===editVals.codigo.trim()&&c.id!==id)){setCMsg({t:"error",msg:"Ese código ya está en uso."}); return;}
    setCuentas(cc=>cc.map(c=>c.id===id?{...c,...editVals,codigo:editVals.codigo.trim(),nombre:editVals.nombre.trim()}:c));
    setEditingCuenta(null); setCMsg({t:"success",msg:"Cuenta actualizada."}); setTimeout(()=>setCMsg(null),2000);
  }
  function cancelEdit(){ setEditingCuenta(null); }
  function addCuota(){
    if(!newCuota.nombre||!newCuota.saldoTotal||!newCuota.cuotaMensual||!newCuota.proximoPago){setCqMsg({t:"error",msg:"Todos los campos son requeridos."}); return;}
    setCuotas([...cuotas,{...newCuota,id:Date.now(),saldoTotal:parseFloat(newCuota.saldoTotal),cuotaMensual:parseFloat(newCuota.cuotaMensual),pagosRealizados:0}]);
    setNewCuota({nombre:"",saldoTotal:"",cuotaMensual:"",proximoPago:"",frecuencia:"mensual",color:"#6AABCC"});
    setCqMsg({t:"success",msg:"Cuota registrada."}); setTimeout(()=>setCqMsg(null),2000);
  }
  function addTarjeta(){
    if(!newTarjeta.nombre||!newTarjeta.limite||!newTarjeta.fechaCorte||!newTarjeta.fechaPago){setCtMsg({t:"error",msg:"Todos los campos son requeridos."}); return;}
    setTarjetas([...tarjetas,{...newTarjeta,id:Date.now(),limite:parseFloat(newTarjeta.limite),saldoActual:parseFloat(newTarjeta.saldoActual||0),fechaCorte:parseInt(newTarjeta.fechaCorte),fechaPago:parseInt(newTarjeta.fechaPago)}]);
    setNewTarjeta({nombre:"",limite:"",saldoActual:"",fechaCorte:"",fechaPago:"",color:"#5DBF8A"});
    setCtMsg({t:"success",msg:"Tarjeta registrada."}); setTimeout(()=>setCtMsg(null),2000);
  }
  function marcarPagada(id){
    setCuotas(cs=>cs.map(c=>{
      if(c.id!==id) return c;
      const d=new Date(c.proximoPago+"T12:00:00");
      if(c.frecuencia==="mensual") d.setMonth(d.getMonth()+1);
      else if(c.frecuencia==="quincenal") d.setDate(d.getDate()+15);
      else d.setDate(d.getDate()+7);
      return{...c,proximoPago:d.toISOString().slice(0,10),pagosRealizados:c.pagosRealizados+1,saldoTotal:Math.max(0,c.saldoTotal-c.cuotaMensual)};
    }));
  }
  async function scanFactura(e){
    const file=e.target.files?.[0]; if(!file) return;
    setScanLoading(true); setScanMsg(null);
    try{
      const b64=await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result.split(",")[1]); r.onerror=rej; r.readAsDataURL(file); });
      const resp=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:500,
          messages:[{role:"user",content:[
            {type:"image",source:{type:"base64",media_type:file.type||"image/jpeg",data:b64}},
            {type:"text",text:`Analiza esta factura. Responde SOLO JSON sin markdown: {"descripcion":"nombre negocio/concepto","fecha":"YYYY-MM-DD o ${today()}","monto":número,"proveedor":"nombre proveedor"}`}
          ]}]})});
      const data=await resp.json();
      const txt=data.content?.map(x=>x.text||"").join("").replace(/```json|```/g,"").trim();
      const parsed=JSON.parse(txt);
      setNewA(a=>({...a,fecha:parsed.fecha||today(),descripcion:parsed.descripcion||"",lineas:[{cuentaId:"",debe:parsed.monto||0,haber:0},{cuentaId:"",debe:0,haber:parsed.monto||0}]}));
      setScanMsg({t:"success",msg:`✓ Extraído: ${parsed.proveedor||parsed.descripcion} — ${fmt(parsed.monto||0)}`});
    }catch(err){ setScanMsg({t:"error",msg:"No se pudo extraer. Intenta con imagen más clara."}); }
    setScanLoading(false); e.target.value="";
  }
  function runWhatIf(){
    const monto=parseFloat(whatIfMonto);
    if(!monto||monto<=0){setWhatIfResult({error:"Ingresa un monto válido."}); return;}
    const fondoEmerg=cuentas.find(c=>c.nombre.toLowerCase().includes("emergencia"));
    const saldoFondo=fondoEmerg?(saldos[fondoEmerg.id]||0):0;
    const gastoMensualProm=mesData.length>0?mesData.reduce((s,m)=>s+m.gastos,0)/mesData.length:1;
    const mesesEmerg=gastoMensualProm>0?(saldoFondo-monto)/gastoMensualProm:0;
    const jobsImpacto=jobsConGasto.filter(j=>j.presupuesto>0).map(j=>{
      const restante=j.presupuesto-j.gastoJob;
      if(restante>0&&monto>0){ const mesesRetraso=Math.ceil((monto*0.3)/((j.presupuesto-j.gastoJob)/3)); return{nombre:j.nombre,retraso:mesesRetraso}; }
      return null;
    }).filter(Boolean);
    setWhatIfResult({monto,saldoNuevo:totales.activos-monto,mesesEmerg:Math.max(0,mesesEmerg),jobsImpacto,pctSaldo:Math.round((monto/totales.activos)*100)});
  }

  return (
    <div style={s.app}>
      <nav style={s.nav}>
        <span style={s.navTitle}>🐱 Toby's Coin</span>
        {TABS.map(t=><button key={t.id} style={s.navBtn(tab===t.id)} onClick={()=>setTab(t.id)}>{t.label}</button>)}
        <div style={{marginLeft:"auto",position:"relative"}}>
          <button style={{...s.btn("secondary"),padding:"4px 12px"}} onClick={()=>setShowNotif(n=>!n)}>
            🔔{notifCount.length>0&&<span style={{background:C.red,color:"white",borderRadius:"50%",fontSize:9,padding:"1px 4px",marginLeft:4}}>{notifCount.length}</span>}
          </button>
          {showNotif&&<div style={{position:"absolute",right:0,top:32,background:C.bgDark,border:`1px solid ${C.border}`,borderRadius:8,width:290,zIndex:100,padding:"0.5rem"}}>
            {notifCount.length===0?<p style={{fontSize:11,color:C.textMuted,padding:"4px 8px",margin:0}}>Sin alertas activas</p>:
            notifCount.map((n,i)=><div key={i} style={{fontSize:11,padding:"6px 8px",borderRadius:6,marginBottom:4,background:n.tipo==="red"?"rgba(224,112,112,0.15)":"rgba(240,192,64,0.15)",color:n.tipo==="red"?C.red:C.semYellow}}>{n.msg}</div>)}
          </div>}
        </div>
      </nav>

      {jobActivo&&<div style={{background:`${jobActivo.color}22`,borderBottom:`1px solid ${jobActivo.color}55`,padding:"5px 1.25rem",fontSize:11,display:"flex",alignItems:"center",gap:8}}>
        <span style={{width:8,height:8,borderRadius:"50%",background:C.semGreen,display:"inline-block"}}></span>
        <span style={{color:jobActivo.color}}>Modo activo:</span>
        <strong style={{color:C.cream}}>{jobActivo.nombre}</strong>
        <span style={{color:C.textMuted}}>— Asientos se etiquetarán automáticamente</span>
        <button style={{...s.btnSm("danger"),marginLeft:"auto"}} onClick={()=>setJobs(jj=>jj.map(j=>({...j,activo:false})))}>Desactivar</button>
      </div>}

      <main style={s.main}>

        {tab==="dashboard"&&<>
          <div style={s.grid4}>
            {[{label:"Ingresos Totales",value:totales.ingresos,acc:C.green},{label:"Gastos Totales",value:totales.gastos,acc:C.red},{label:"Resultado Neto",value:totales.neto,acc:totales.neto>=0?C.green:C.red},{label:"Total Activos",value:totales.activos,acc:C.amber}].map(mc=>(
              <div key={mc.label} style={s.mCard(mc.acc)}>
                <div style={s.mLabel}>{mc.label}</div>
                <div style={{...s.mValue,color:mc.acc}}>{fmt(mc.value)}</div>
              </div>
            ))}
          </div>
          {proyeccionMes&&<div style={{...s.sec,borderLeft:`3px solid ${C.blue}`}}>
            <div style={s.sTitle}>📈 Proyección fin de mes</div>
            <div style={{display:"flex",gap:"1.5rem",flexWrap:"wrap",alignItems:"center"}}>
              <div><div style={s.mLabel}>Gasto proyectado</div><div style={{fontSize:16,fontWeight:700,color:C.red}}>{fmt(proyeccionMes.gastoProyectado)}</div></div>
              <div><div style={s.mLabel}>Saldo estimado</div><div style={{fontSize:16,fontWeight:700,color:proyeccionMes.saldoProyectado>=0?C.green:C.red}}>{fmt(proyeccionMes.saldoProyectado)}</div></div>
              <div><div style={s.mLabel}>Mes transcurrido</div><div style={{fontSize:16,fontWeight:700,color:C.amberLight}}>{proyeccionMes.pct}%</div></div>
              <div style={{flex:1,minWidth:120}}>
                <div style={s.mLabel}>Gasto actual vs promedio</div>
                <div style={{background:"rgba(255,255,255,0.08)",borderRadius:4,height:6,marginTop:4}}>
                  <div style={{background:proyeccionMes.gastoActualMes>proyeccionMes.avgGasto?C.red:C.green,height:6,borderRadius:4,width:`${Math.min(100,(proyeccionMes.gastoActualMes/proyeccionMes.avgGasto)*100)}%`}}></div>
                </div>
                <div style={{fontSize:10,color:C.textMuted,marginTop:2}}>{fmt(proyeccionMes.gastoActualMes)} / {fmt(proyeccionMes.avgGasto)} prom.</div>
              </div>
            </div>
          </div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.85rem",marginBottom:"0.85rem"}}>
            <div style={s.sec}>
              <div style={s.sTitle}>Ingresos vs Gastos</div>
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={mesData} margin={{top:0,right:5,left:-18,bottom:0}}>
                  <XAxis dataKey="mes" tick={{fill:C.textMuted,fontSize:10}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fill:C.textMuted,fontSize:10}} axisLine={false} tickLine={false}/>
                  <Tooltip {...s.TOOLTIP}/><Bar dataKey="ingresos" name="Ingresos" fill={C.green} radius={[3,3,0,0]}/><Bar dataKey="gastos" name="Gastos" fill={C.red} radius={[3,3,0,0]}/>
                  <Legend wrapperStyle={{fontSize:10,color:C.textMuted}}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={s.sec}>
              <div style={s.sTitle}>Distribución de Gastos</div>
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie data={gastosPorCuenta} cx="50%" cy="50%" outerRadius={68} innerRadius={28} dataKey="value" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={9}>
                    {gastosPorCuenta.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                  </Pie><Tooltip {...s.TOOLTIP}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div style={s.sec}>
            <div style={s.sTitle}>Semáforo de Proyectos</div>
            {jobsConGasto.length===0?<p style={{fontSize:11,color:C.textMuted}}>No hay proyectos.</p>:
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:"0.65rem"}}>
              {jobsConGasto.map(j=>(
                <div key={j.id} style={{background:C.bgMid,border:`1px solid ${SEM_COLOR[j.semaforo]}55`,borderRadius:8,padding:"0.75rem"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                    <span style={{width:10,height:10,borderRadius:"50%",background:SEM_COLOR[j.semaforo],flexShrink:0}}></span>
                    <span style={{fontWeight:600,fontSize:12,color:j.color}}>{j.nombre}</span>
                  </div>
                  <div style={{background:"rgba(255,255,255,0.08)",borderRadius:4,height:5,marginBottom:4}}>
                    <div style={{background:SEM_COLOR[j.semaforo],height:5,borderRadius:4,width:`${j.pctGasto}%`}}></div>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.textMuted}}>
                    <span>{fmt(j.gastoJob)} / {fmt(j.presupuesto)}</span><span>{Math.round(j.pctGasto)}%</span>
                  </div>
                  {j.alerta&&<div style={{fontSize:10,color:SEM_COLOR[j.semaforo],marginTop:4,background:`${SEM_COLOR[j.semaforo]}15`,borderRadius:4,padding:"3px 6px"}}>{j.alerta}</div>}
                </div>
              ))}
            </div>}
          </div>
        </>}

        {tab==="jobs"&&<>
          <div style={s.sec}>
            <div style={s.sTitle}>Nuevo Proyecto</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 120px 130px 130px 60px auto",gap:"0.6rem",alignItems:"end"}}>
              <div><label style={s.label}>Nombre</label><input style={s.input} value={newJob.nombre} onChange={e=>setNewJob({...newJob,nombre:e.target.value})} placeholder="Viaje a la playa"/></div>
              <div><label style={s.label}>Presupuesto</label><input type="number" style={s.input} value={newJob.presupuesto} onChange={e=>setNewJob({...newJob,presupuesto:e.target.value})}/></div>
              <div><label style={s.label}>Inicio</label><input type="date" style={s.input} value={newJob.fechaInicio} onChange={e=>setNewJob({...newJob,fechaInicio:e.target.value})}/></div>
              <div><label style={s.label}>Fin</label><input type="date" style={s.input} value={newJob.fechaFin} onChange={e=>setNewJob({...newJob,fechaFin:e.target.value})}/></div>
              <div><label style={s.label}>Color</label><input type="color" style={{...s.input,padding:2,height:32}} value={newJob.color} onChange={e=>setNewJob({...newJob,color:e.target.value})}/></div>
              <button style={s.btn()} onClick={addJob}>+ Crear</button>
            </div>
            {jMsg&&<div style={s.msg(jMsg.t)}>{jMsg.msg}</div>}
          </div>
          <div style={s.sec}>
            <div style={s.sTitle}>Mis Proyectos</div>
            {jobsConGasto.map(j=>(
              <div key={j.id} style={{border:`1px solid ${j.activo?j.color+"88":C.border}`,borderRadius:8,padding:"0.85rem",marginBottom:"0.65rem",background:j.activo?`${j.color}10`:C.bgMid}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                  <span style={{width:12,height:12,borderRadius:"50%",background:SEM_COLOR[j.semaforo]}}></span>
                  <span style={{fontWeight:600,fontSize:13,color:j.color,flex:1}}>{j.nombre}</span>
                  <span style={{fontSize:10,color:C.textMuted}}>{j.fechaInicio} → {j.fechaFin}</span>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:10,color:C.textMuted}}>{j.activo?"Activo":""}</span>
                    <button style={s.toggle(j.activo)} onClick={()=>toggleJob(j.id)}><div style={s.toggleDot(j.activo)}></div></button>
                  </div>
                  <button style={s.btnSm("danger")} onClick={()=>setJobs(jj=>jj.filter(x=>x.id!==j.id))}>Eliminar</button>
                </div>
                <div style={{background:"rgba(255,255,255,0.07)",borderRadius:4,height:6,marginBottom:5}}>
                  <div style={{background:SEM_COLOR[j.semaforo],height:6,borderRadius:4,width:`${j.pctGasto}%`}}></div>
                </div>
                <div style={{display:"flex",gap:"1.5rem",fontSize:11}}>
                  <span style={{color:C.textMuted}}>Gastado: <strong style={{color:C.cream}}>{fmt(j.gastoJob)}</strong></span>
                  <span style={{color:C.textMuted}}>Presupuesto: <strong style={{color:C.amberLight}}>{fmt(j.presupuesto)}</strong></span>
                  <span style={{color:C.textMuted}}>Restante: <strong style={{color:j.presupuesto-j.gastoJob>=0?C.green:C.red}}>{fmt(Math.max(0,j.presupuesto-j.gastoJob))}</strong></span>
                  <span style={{color:C.textMuted}}>Tiempo: <strong style={{color:C.blue}}>{Math.round(j.pctTiempo)}%</strong></span>
                </div>
                {j.alerta&&<div style={{fontSize:11,color:SEM_COLOR[j.semaforo],marginTop:6,background:`${SEM_COLOR[j.semaforo]}15`,borderRadius:4,padding:"4px 8px"}}>⚠ {j.alerta}</div>}
              </div>
            ))}
          </div>
        </>}

        {tab==="asiento"&&(
          <div style={s.sec}>
            <div style={s.sTitle}>Nuevo Asiento Contable</div>
            {jobActivo&&<div style={{fontSize:11,background:`${jobActivo.color}22`,border:`1px solid ${jobActivo.color}44`,borderRadius:6,padding:"5px 10px",marginBottom:"0.65rem",color:jobActivo.color}}>
              ● Este asiento se etiquetará en: <strong>{jobActivo.nombre}</strong>
            </div>}
            <div style={{border:`1px solid ${C.border}`,borderRadius:8,padding:"0.75rem",marginBottom:"0.75rem",background:"rgba(0,0,0,0.15)"}}>
              <div style={{...s.sTitle,marginBottom:"0.5rem"}}>📷 Escanear Factura con IA</div>
              <div style={{display:"flex",gap:"0.65rem",alignItems:"center",flexWrap:"wrap"}}>
                <button style={s.btn("secondary")} onClick={()=>fileRef.current.click()} disabled={scanLoading}>{scanLoading?"Analizando...":"📎 Subir imagen de factura"}</button>
                <span style={{fontSize:11,color:C.textMuted}}>La IA extrae fecha, monto y proveedor</span>
                <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={scanFactura}/>
              </div>
              {scanMsg&&<div style={s.msg(scanMsg.t)}>{scanMsg.msg}</div>}
            </div>
            {aMsg&&<div style={s.msg(aMsg.t)}>{aMsg.msg}</div>}
            <div style={{display:"grid",gridTemplateColumns:"150px 1fr",gap:"0.65rem",marginBottom:"0.65rem"}}>
              <div><label style={s.label}>Fecha</label><input type="date" style={s.input} value={newA.fecha} onChange={e=>setNewA({...newA,fecha:e.target.value})}/></div>
              <div><label style={s.label}>Descripción</label><input style={s.input} value={newA.descripcion} onChange={e=>setNewA({...newA,descripcion:e.target.value})} placeholder="Concepto del asiento"/></div>
            </div>
            <div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden",marginBottom:"0.65rem"}}>
              <table style={s.table}>
                <thead><tr style={{background:"rgba(0,0,0,0.2)"}}>
                  <th style={s.th}>Cuenta</th><th style={{...s.th,textAlign:"right"}}>Debe</th><th style={{...s.th,textAlign:"right"}}>Haber</th><th style={s.th}></th>
                </tr></thead>
                <tbody>
                  {newA.lineas.map((l,i)=>(
                    <tr key={i}>
                      <td style={s.td}><select style={{...s.select,width:"100%"}} value={l.cuentaId||""} onChange={e=>updLinea(i,"cuentaId",e.target.value)}>
                        <option value="">— Seleccionar —</option>
                        {cuentas.map(c=><option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
                      </select></td>
                      <td style={s.td}><input type="number" style={{...s.input,textAlign:"right"}} min="0" step="0.01" value={l.debe||""} onChange={e=>updLinea(i,"debe",e.target.value)} placeholder="0.00"/></td>
                      <td style={s.td}><input type="number" style={{...s.input,textAlign:"right"}} min="0" step="0.01" value={l.haber||""} onChange={e=>updLinea(i,"haber",e.target.value)} placeholder="0.00"/></td>
                      <td style={s.td}><button style={s.btnSm("danger")} onClick={()=>removeLinea(i)}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr style={{background:"rgba(0,0,0,0.15)"}}>
                  <td style={{...s.td,fontWeight:600,color:C.amberLight}}>Totales</td>
                  <td style={{...s.td,textAlign:"right",fontWeight:700,color:C.green}}>{fmt(newA.lineas.reduce((s,l)=>s+l.debe,0))}</td>
                  <td style={{...s.td,textAlign:"right",fontWeight:700,color:C.red}}>{fmt(newA.lineas.reduce((s,l)=>s+l.haber,0))}</td>
                  <td style={s.td}></td>
                </tr></tfoot>
              </table>
            </div>
            <div style={{display:"flex",gap:"0.65rem"}}>
              <button style={s.btn("secondary")} onClick={addLinea}>+ Añadir línea</button>
              <button style={s.btn()} onClick={saveAsiento}>Guardar Asiento</button>
            </div>
          </div>
        )}

        {tab==="diario"&&(
          <div style={s.sec}>
            <div style={s.sTitle}>Libro Diario</div>
            {asientos.length===0&&<p style={{fontSize:11,color:C.textMuted}}>Sin asientos.</p>}
            {[...asientos].reverse().map(a=>{
              const job=jobs.find(j=>j.id===a.jobId);
              return(
                <div key={a.id} style={{border:`1px solid ${C.border}`,borderRadius:8,marginBottom:"0.6rem",overflow:"hidden"}}>
                  <div style={{background:"rgba(0,0,0,0.22)",padding:"6px 10px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{color:C.amberLight,fontSize:11,fontFamily:"monospace"}}>{a.fecha}</span>
                      <span style={{fontWeight:600,fontSize:12,color:C.cream}}>{a.descripcion}</span>
                      {job&&<span style={{fontSize:10,background:`${job.color}33`,color:job.color,border:`1px solid ${job.color}55`,borderRadius:4,padding:"1px 6px"}}>{job.nombre}</span>}
                    </div>
                    <button style={s.btnSm("danger")} onClick={()=>setAsientos(aa=>aa.filter(x=>x.id!==a.id))}>Eliminar</button>
                  </div>
                  <table style={s.table}><tbody>
                    {a.lineas.map((l,i)=>{ const c=cuentas.find(x=>x.id===l.cuentaId);
                      return<tr key={i}>
                        <td style={{...s.td,paddingLeft:l.haber>0?"2rem":"0.75rem",color:C.creamMid}}>{c?`${c.codigo} — ${c.nombre}`:"Cuenta eliminada"}</td>
                        <td style={{...s.td,textAlign:"right",color:C.green,width:120}}>{l.debe>0?fmt(l.debe):""}</td>
                        <td style={{...s.td,textAlign:"right",color:C.red,width:120}}>{l.haber>0?fmt(l.haber):""}</td>
                      </tr>;
                    })}
                  </tbody></table>
                </div>
              );
            })}
          </div>
        )}

        {tab==="cuentas"&&<>
          <div style={s.sec}>
            <div style={s.sTitle}>Nueva Cuenta</div>
            <div style={{display:"grid",gridTemplateColumns:"110px 1fr 130px auto",gap:"0.6rem",alignItems:"end"}}>
              <div><label style={s.label}>Código</label><input style={s.input} value={newCuenta.codigo} onChange={e=>setNewCuenta({...newCuenta,codigo:e.target.value})} placeholder="ej. 1003"/></div>
              <div><label style={s.label}>Nombre</label><input style={s.input} value={newCuenta.nombre} onChange={e=>setNewCuenta({...newCuenta,nombre:e.target.value})} placeholder="Nombre de la cuenta"/></div>
              <div><label style={s.label}>Tipo</label><select style={s.select} value={newCuenta.tipo} onChange={e=>setNewCuenta({...newCuenta,tipo:e.target.value})}>{TIPO_CUENTA.map(t=><option key={t}>{t}</option>)}</select></div>
              <button style={s.btn()} onClick={addCuenta}>+ Agregar</button>
            </div>
            {cMsg&&<div style={s.msg(cMsg.t)}>{cMsg.msg}</div>}
          </div>
          <div style={s.sec}>
            <div style={s.sTitle}>Catálogo de Cuentas</div>
            <table style={s.table}>
              <thead><tr><th style={s.th}>Código</th><th style={s.th}>Nombre</th><th style={s.th}>Tipo</th><th style={s.th}>Saldo</th><th style={s.th}></th></tr></thead>
              <tbody>{cuentas.map(c=>{
                const editing=editingCuenta===c.id;
                return<tr key={c.id} style={{background:editing?"rgba(212,148,58,0.07)":"transparent"}}>
                  <td style={{...s.td,fontFamily:"monospace",color:C.amberLight}}>{editing?<input style={{...s.input,width:70,fontFamily:"monospace"}} value={editVals.codigo} onChange={e=>setEditVals({...editVals,codigo:e.target.value})}/>:c.codigo}</td>
                  <td style={s.td}>{editing?<input style={s.input} value={editVals.nombre} onChange={e=>setEditVals({...editVals,nombre:e.target.value})}/>:c.nombre}</td>
                  <td style={s.td}>{editing?<select style={s.select} value={editVals.tipo} onChange={e=>setEditVals({...editVals,tipo:e.target.value})}>{TIPO_CUENTA.map(t=><option key={t}>{t}</option>)}</select>:<span style={s.badge(c.tipo)}>{c.tipo}</span>}</td>
                  <td style={{...s.td,color:(saldos[c.id]||0)>=0?C.green:C.red}}>{fmt(Math.abs(saldos[c.id]||0))}</td>
                  <td style={s.td}><div style={{display:"flex",gap:4}}>
                    {editing?<><button style={s.btnSm("green")} onClick={()=>saveEdit(c.id)}>✓ Guardar</button><button style={s.btnSm()} onClick={cancelEdit}>Cancelar</button></>:<><button style={s.btnSm()} onClick={()=>startEdit(c)}>✏ Editar</button><button style={s.btnSm("danger")} onClick={()=>setCuentas(cc=>cc.filter(x=>x.id!==c.id))}>Eliminar</button></>}
                  </div></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        </>}

        {tab==="balance"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.85rem"}}>
            <div style={s.sec}>
              <div style={s.sTitle}>Balance General</div>
              {["Activo","Pasivo","Capital"].map(tipo=>(
                <div key={tipo} style={{marginBottom:"0.9rem"}}>
                  <div style={{fontSize:10,color:C.textMuted,borderBottom:`1px solid ${C.border}`,paddingBottom:3,marginBottom:5,letterSpacing:0.8}}>{tipo.toUpperCase()}</div>
                  {cuentas.filter(c=>c.tipo===tipo).map(c=>(
                    <div key={c.id} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"2px 0",color:C.creamMid}}>
                      <span>{c.nombre}</span><span style={{color:(saldos[c.id]||0)>=0?C.green:C.red}}>{fmt(Math.abs(saldos[c.id]||0))}</span>
                    </div>
                  ))}
                  <div style={{display:"flex",justifyContent:"space-between",fontWeight:600,fontSize:12,borderTop:`1px solid ${C.border}`,marginTop:4,paddingTop:4}}>
                    <span style={{color:C.cream}}>Total {tipo}</span>
                    <span style={{color:C.amberLight}}>{fmt(cuentas.filter(c=>c.tipo===tipo).reduce((s,c)=>s+Math.abs(saldos[c.id]||0),0))}</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={s.sec}>
              <div style={s.sTitle}>Estado de Resultados</div>
              {["Ingreso","Gasto"].map(tipo=>(
                <div key={tipo} style={{marginBottom:"0.9rem"}}>
                  <div style={{fontSize:10,color:C.textMuted,borderBottom:`1px solid ${C.border}`,paddingBottom:3,marginBottom:5,letterSpacing:0.8}}>{tipo.toUpperCase()}S</div>
                  {cuentas.filter(c=>c.tipo===tipo).map(c=>(
                    <div key={c.id} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"2px 0",color:C.creamMid}}>
                      <span>{c.nombre}</span><span style={{color:tipo==="Ingreso"?C.green:C.red}}>{fmt(Math.abs(saldos[c.id]||0))}</span>
                    </div>
                  ))}
                  <div style={{display:"flex",justifyContent:"space-between",fontWeight:600,fontSize:12,borderTop:`1px solid ${C.border}`,marginTop:4,paddingTop:4}}>
                    <span style={{color:C.cream}}>Total {tipo}s</span>
                    <span style={{color:C.amberLight}}>{fmt(cuentas.filter(c=>c.tipo===tipo).reduce((s,c)=>s+Math.abs(saldos[c.id]||0),0))}</span>
                  </div>
                </div>
              ))}
              <div style={{background:"rgba(0,0,0,0.22)",border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 12px",display:"flex",justifyContent:"space-between",fontWeight:700,fontSize:14}}>
                <span style={{color:C.cream}}>Resultado Neto</span>
                <span style={{color:totales.neto>=0?C.green:C.red}}>{fmt(totales.neto)}</span>
              </div>
            </div>
          </div>
        )}

        {tab==="tools"&&<>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.85rem"}}>
            <div style={s.sec}>
              <div style={s.sTitle}>🤔 Simulador What-If</div>
              <p style={{fontSize:11,color:C.textMuted,marginBottom:"0.75rem"}}>Introduce un gasto futuro y ve el impacto real en tus finanzas.</p>
              <div style={{marginBottom:"0.65rem"}}><label style={s.label}>Descripción</label><input style={s.input} value={whatIfDesc} onChange={e=>setWhatIfDesc(e.target.value)} placeholder="ej. Laptop nueva"/></div>
              <div style={{marginBottom:"0.75rem"}}><label style={s.label}>Monto (L)</label><input type="number" style={s.input} value={whatIfMonto} onChange={e=>setWhatIfMonto(e.target.value)} placeholder="0.00"/></div>
              <button style={s.btn()} onClick={runWhatIf}>Simular impacto</button>
              {whatIfResult&&!whatIfResult.error&&<div style={{marginTop:"0.85rem",background:"rgba(0,0,0,0.2)",border:`1px solid ${C.border}`,borderRadius:8,padding:"0.85rem"}}>
                <div style={{fontSize:12,fontWeight:600,color:C.amberLight,marginBottom:8}}>Impacto de {fmt(whatIfResult.monto)}{whatIfDesc?` en "${whatIfDesc}"`:""}:</div>
                <div style={{display:"grid",gap:6}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}><span style={{color:C.textMuted}}>Saldo activos después:</span><span style={{color:whatIfResult.saldoNuevo>=0?C.green:C.red,fontWeight:600}}>{fmt(whatIfResult.saldoNuevo)}</span></div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}><span style={{color:C.textMuted}}>% de activos comprometido:</span><span style={{color:whatIfResult.pctSaldo>50?C.red:C.semYellow,fontWeight:600}}>{whatIfResult.pctSaldo}%</span></div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}><span style={{color:C.textMuted}}>Fondo de emergencia:</span><span style={{color:whatIfResult.mesesEmerg<3?C.red:whatIfResult.mesesEmerg<6?C.semYellow:C.green,fontWeight:600}}>{whatIfResult.mesesEmerg.toFixed(1)} meses</span></div>
                  {whatIfResult.jobsImpacto.map(j=>(<div key={j.nombre} style={{display:"flex",justifyContent:"space-between",fontSize:12}}><span style={{color:C.textMuted}}>Proyecto "{j.nombre}":</span><span style={{color:C.red,fontWeight:600}}>~{j.retraso} mes(es) retraso</span></div>))}
                </div>
                <div style={{fontSize:11,marginTop:8,color:whatIfResult.saldoNuevo<0?C.red:whatIfResult.mesesEmerg<3?C.semYellow:C.green,background:"rgba(255,255,255,0.05)",borderRadius:4,padding:"5px 8px"}}>
                  {whatIfResult.saldoNuevo<0?"⛔ Este gasto excede tus activos disponibles.":whatIfResult.mesesEmerg<3?"⚠ Fondo de emergencia quedaría bajo 3 meses.":"✓ Gasto viable, revisa el impacto en proyectos."}
                </div>
              </div>}
              {whatIfResult?.error&&<div style={s.msg("error")}>{whatIfResult.error}</div>}
            </div>
            <div style={s.sec}>
              <div style={s.sTitle}>🔁 Análisis de Suscripciones</div>
              <p style={{fontSize:11,color:C.textMuted,marginBottom:"0.75rem"}}>Gastos repetitivos detectados automáticamente.</p>
              {suscripciones.length===0?<p style={{fontSize:11,color:C.textMuted}}>No se detectaron cargos repetitivos.</p>:<>
                <div style={{background:"rgba(0,0,0,0.2)",borderRadius:8,padding:"8px 12px",marginBottom:"0.65rem",display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontSize:12,color:C.textMuted}}>Total anual estimado:</span>
                  <span style={{fontSize:14,fontWeight:700,color:C.red}}>{fmt(suscripciones.reduce((s,x)=>s+x.monto*12,0))}</span>
                </div>
                <table style={s.table}>
                  <thead><tr><th style={s.th}>Descripción</th><th style={{...s.th,textAlign:"right"}}>Monto</th><th style={{...s.th,textAlign:"right"}}>Veces</th><th style={{...s.th,textAlign:"right"}}>Anual</th></tr></thead>
                  <tbody>{suscripciones.map((x,i)=>(
                    <tr key={i}><td style={s.td}>{x.desc}</td><td style={{...s.td,textAlign:"right"}}>{fmt(x.monto)}</td><td style={{...s.td,textAlign:"right",color:C.textMuted}}>{x.count}x</td><td style={{...s.td,textAlign:"right",color:C.red,fontWeight:600}}>{fmt(x.monto*12)}</td></tr>
                  ))}</tbody>
                </table>
              </>}
            </div>
          </div>
        </>}

        {tab==="calendario"&&<>
          <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:"0.85rem",marginBottom:"0.85rem"}}>
            <div style={s.sec}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"0.85rem"}}>
                <div style={s.sTitle}>📅 Calendario de Pagos</div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <button style={s.btnSm()} onClick={()=>setCalMes(c=>{ const d=new Date(c.y,c.m-1,1); return{y:d.getFullYear(),m:d.getMonth()}; })}>‹</button>
                  <span style={{fontSize:12,color:C.cream,minWidth:110,textAlign:"center"}}>{new Date(calMes.y,calMes.m,1).toLocaleString("es-HN",{month:"long",year:"numeric"})}</span>
                  <button style={s.btnSm()} onClick={()=>setCalMes(c=>{ const d=new Date(c.y,c.m+1,1); return{y:d.getFullYear(),m:d.getMonth()}; })}>›</button>
                </div>
              </div>
              {(()=>{
                const diasSem=["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
                const primerDia=new Date(calMes.y,calMes.m,1).getDay();
                const diasMes=new Date(calMes.y,calMes.m+1,0).getDate();
                const hoy=new Date(); const esHoy=d=>hoy.getFullYear()===calMes.y&&hoy.getMonth()===calMes.m&&hoy.getDate()===d;
                const celdas=[];
                for(let i=0;i<primerDia;i++) celdas.push(null);
                for(let d=1;d<=diasMes;d++) celdas.push(d);
                while(celdas.length%7!==0) celdas.push(null);
                return<>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
                    {diasSem.map(d=><div key={d} style={{textAlign:"center",fontSize:10,color:C.textMuted,padding:"3px 0"}}>{d}</div>)}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
                    {celdas.map((d,i)=>{
                      if(!d) return<div key={i} style={{minHeight:52}}></div>;
                      const key=`${calMes.y}-${String(calMes.m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
                      const evs=calEventos[key]||[];
                      return<div key={i} style={{minHeight:52,background:esHoy(d)?"rgba(212,148,58,0.2)":evs.length>0?"rgba(255,255,255,0.04)":"rgba(0,0,0,0.15)",border:esHoy(d)?`1px solid ${C.amber}`:`1px solid ${C.border}`,borderRadius:6,padding:"3px 4px"}}>
                        <div style={{fontSize:10,fontWeight:esHoy(d)?700:400,color:esHoy(d)?C.amberLight:C.textMuted,marginBottom:2}}>{d}</div>
                        {evs.slice(0,2).map((ev,ei)=><div key={ei} style={{fontSize:9,background:`${ev.color}33`,color:ev.color,borderRadius:2,padding:"1px 3px",marginBottom:1,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{ev.tipo==="corte"?"✂":ev.tipo==="pago"?"💳":"📅"} {ev.label.split(":")[1]?.trim()}</div>)}
                        {evs.length>2&&<div style={{fontSize:9,color:C.textMuted}}>+{evs.length-2} más</div>}
                      </div>;
                    })}
                  </div>
                </>;
              })()}
              <div style={{display:"flex",gap:12,marginTop:10,flexWrap:"wrap"}}>
                {[{color:C.amberLight,icon:"✂",label:"Corte"},{color:C.green,icon:"💳",label:"Pago tarjeta"},{color:C.blue,icon:"📅",label:"Cuota"}].map(l=>(
                  <div key={l.label} style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:C.textMuted}}><span style={{color:l.color}}>{l.icon}</span>{l.label}</div>
                ))}
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:"0.85rem"}}>
              <div style={s.sec}>
                <div style={s.sTitle}>Próximos eventos</div>
                {(()=>{
                  const hoy=new Date(); hoy.setHours(0,0,0,0);
                  const eventos=[];
                  cuotas.forEach(c=>{ const d=new Date(c.proximoPago+"T12:00:00"); const diff=Math.round((d-hoy)/(1000*60*60*24)); if(diff>=0&&diff<=30) eventos.push({diff,label:c.nombre,sub:`Cuota: ${fmt(c.cuotaMensual)}`,color:c.color,tipo:"cuota",id:c.id}); });
                  tarjetas.forEach(t=>{ const dh=hoy.getDate(); const dCorte=((t.fechaCorte-dh+31)%31)||31; const dPago=((t.fechaPago-dh+31)%31)||31;
                    eventos.push({diff:dCorte,label:t.nombre,sub:`Corte — saldo: ${fmt(t.saldoActual)}`,color:t.color,tipo:"corte",id:t.id});
                    eventos.push({diff:dPago,label:t.nombre,sub:"Fecha límite pago",color:t.color,tipo:"pago",id:t.id});
                  });
                  eventos.sort((a,b)=>a.diff-b.diff);
                  if(eventos.length===0) return<p style={{fontSize:11,color:C.textMuted}}>Sin eventos próximos.</p>;
                  return eventos.slice(0,6).map((ev,i)=>(
                    <div key={i} style={{display:"flex",gap:8,alignItems:"flex-start",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
                      <div style={{minWidth:32,textAlign:"center"}}>
                        <div style={{fontSize:14,fontWeight:700,color:ev.diff<=3?C.red:ev.diff<=7?C.semYellow:C.amberLight}}>{ev.diff===0?"HOY":ev.diff}</div>
                        {ev.diff>0&&<div style={{fontSize:9,color:C.textMuted}}>días</div>}
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:11,fontWeight:600,color:ev.color}}>{ev.tipo==="corte"?"✂ ":ev.tipo==="pago"?"💳 ":"📅 "}{ev.label}</div>
                        <div style={{fontSize:10,color:C.textMuted}}>{ev.sub}</div>
                      </div>
                      {ev.tipo==="cuota"&&<button style={s.btnSm("green")} onClick={()=>marcarPagada(ev.id)}>✓</button>}
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
          <div style={s.sec}>
            <div style={s.sTitle}>Arreglos de Pago y Cuotas</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 110px 110px 140px 110px 50px auto",gap:"0.5rem",alignItems:"end",marginBottom:"0.65rem"}}>
              <div><label style={s.label}>Concepto</label><input style={s.input} value={newCuota.nombre} onChange={e=>setNewCuota({...newCuota,nombre:e.target.value})} placeholder="Arreglo Visa"/></div>
              <div><label style={s.label}>Saldo total</label><input type="number" style={s.input} value={newCuota.saldoTotal} onChange={e=>setNewCuota({...newCuota,saldoTotal:e.target.value})}/></div>
              <div><label style={s.label}>Cuota</label><input type="number" style={s.input} value={newCuota.cuotaMensual} onChange={e=>setNewCuota({...newCuota,cuotaMensual:e.target.value})}/></div>
              <div><label style={s.label}>Próx. pago</label><input type="date" style={s.input} value={newCuota.proximoPago} onChange={e=>setNewCuota({...newCuota,proximoPago:e.target.value})}/></div>
              <div><label style={s.label}>Frecuencia</label><select style={s.select} value={newCuota.frecuencia} onChange={e=>setNewCuota({...newCuota,frecuencia:e.target.value})}><option value="mensual">Mensual</option><option value="quincenal">Quincenal</option><option value="semanal">Semanal</option></select></div>
              <div><label style={s.label}>Color</label><input type="color" style={{...s.input,padding:2,height:32}} value={newCuota.color} onChange={e=>setNewCuota({...newCuota,color:e.target.value})}/></div>
              <button style={s.btn()} onClick={addCuota}>+ Agregar</button>
            </div>
            {cqMsg&&<div style={s.msg(cqMsg.t)}>{cqMsg.msg}</div>}
            <table style={s.table}>
              <thead><tr><th style={s.th}>Concepto</th><th style={s.th}>Saldo</th><th style={s.th}>Cuota</th><th style={s.th}>Próx. pago</th><th style={s.th}>Frecuencia</th><th style={s.th}>Pagos</th><th style={s.th}>Progreso</th><th style={s.th}></th></tr></thead>
              <tbody>{cuotas.map(c=>{
                const hoy=new Date(); hoy.setHours(0,0,0,0);
                const d=new Date(c.proximoPago+"T12:00:00"); const diff=Math.round((d-hoy)/(1000*60*60*24));
                return<tr key={c.id}>
                  <td style={{...s.td,color:c.color,fontWeight:600}}>{c.nombre}</td>
                  <td style={{...s.td,color:C.red}}>{fmt(c.saldoTotal)}</td>
                  <td style={{...s.td,color:C.amberLight}}>{fmt(c.cuotaMensual)}</td>
                  <td style={s.td}><span style={{color:diff<=5?C.red:diff<=10?C.semYellow:C.cream,fontWeight:diff<=5?700:400}}>{c.proximoPago}{diff===0?" (HOY)":diff<=5?` (${diff}d)`:""}</span></td>
                  <td style={{...s.td,color:C.textMuted}}>{c.frecuencia}</td>
                  <td style={{...s.td,color:C.blue}}>{c.pagosRealizados}</td>
                  <td style={s.td}><div style={{background:"rgba(255,255,255,0.08)",borderRadius:3,height:5,width:80}}><div style={{background:C.green,height:5,borderRadius:3,width:`${Math.min(100,c.pagosRealizados>0?Math.round((c.cuotaMensual*c.pagosRealizados/(c.cuotaMensual*c.pagosRealizados+c.saldoTotal))*100):0)}%`}}></div></div></td>
                  <td style={s.td}><div style={{display:"flex",gap:4}}><button style={s.btnSm("green")} onClick={()=>marcarPagada(c.id)}>✓ Pagar</button><button style={s.btnSm("danger")} onClick={()=>setCuotas(cc=>cc.filter(x=>x.id!==c.id))}>✕</button></div></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          <div style={s.sec}>
            <div style={s.sTitle}>Tarjetas de Crédito</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 100px 110px 80px 80px 50px auto",gap:"0.5rem",alignItems:"end",marginBottom:"0.65rem"}}>
              <div><label style={s.label}>Nombre</label><input style={s.input} value={newTarjeta.nombre} onChange={e=>setNewTarjeta({...newTarjeta,nombre:e.target.value})} placeholder="Visa Banpais"/></div>
              <div><label style={s.label}>Límite</label><input type="number" style={s.input} value={newTarjeta.limite} onChange={e=>setNewTarjeta({...newTarjeta,limite:e.target.value})}/></div>
              <div><label style={s.label}>Saldo actual</label><input type="number" style={s.input} value={newTarjeta.saldoActual} onChange={e=>setNewTarjeta({...newTarjeta,saldoActual:e.target.value})}/></div>
              <div><label style={s.label}>Día corte</label><input type="number" style={s.input} min="1" max="31" value={newTarjeta.fechaCorte} onChange={e=>setNewTarjeta({...newTarjeta,fechaCorte:e.target.value})}/></div>
              <div><label style={s.label}>Día pago</label><input type="number" style={s.input} min="1" max="31" value={newTarjeta.fechaPago} onChange={e=>setNewTarjeta({...newTarjeta,fechaPago:e.target.value})}/></div>
              <div><label style={s.label}>Color</label><input type="color" style={{...s.input,padding:2,height:32}} value={newTarjeta.color} onChange={e=>setNewTarjeta({...newTarjeta,color:e.target.value})}/></div>
              <button style={s.btn()} onClick={addTarjeta}>+ Agregar</button>
            </div>
            {ctMsg&&<div style={s.msg(ctMsg.t)}>{ctMsg.msg}</div>}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:"0.75rem"}}>
              {tarjetas.map(t=>{
                const uso=(t.saldoActual/t.limite)*100;
                const hoy=new Date().getDate();
                const diasCorte=((t.fechaCorte-hoy+31)%31)||31;
                const diasPago=((t.fechaPago-hoy+31)%31)||31;
                const estrategia=diasCorte<=7?"⚡ Paga antes del corte para reducir el saldo reportado":diasPago<=7?"🔴 Fecha límite próxima — paga el mínimo ya":"✅ Buen momento para abonar a capital";
                return<div key={t.id} style={{background:C.bgMid,border:`2px solid ${t.color}55`,borderRadius:10,padding:"0.85rem"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <span style={{fontWeight:700,fontSize:13,color:t.color}}>💳 {t.nombre}</span>
                    <button style={s.btnSm("danger")} onClick={()=>setTarjetas(tt=>tt.filter(x=>x.id!==t.id))}>✕</button>
                  </div>
                  <div style={{background:"rgba(255,255,255,0.07)",borderRadius:4,height:6,marginBottom:5}}>
                    <div style={{background:uso>80?C.red:uso>50?C.semYellow:C.green,height:6,borderRadius:4,width:`${Math.min(100,uso)}%`}}></div>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:6}}>
                    <span style={{color:C.textMuted}}>Saldo: <strong style={{color:C.red}}>{fmt(t.saldoActual)}</strong></span>
                    <span style={{color:C.textMuted}}>Límite: <strong style={{color:C.amberLight}}>{fmt(t.limite)}</strong></span>
                    <span style={{color:C.textMuted}}>Uso: <strong style={{color:uso>80?C.red:uso>50?C.semYellow:C.green}}>{Math.round(uso)}%</strong></span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:6}}>
                    <div style={{background:`${t.color}18`,border:`1px solid ${t.color}44`,borderRadius:6,padding:"5px 8px",textAlign:"center"}}>
                      <div style={{fontSize:9,color:C.textMuted,marginBottom:1}}>✂ CORTE DÍA {t.fechaCorte}</div>
                      <div style={{fontSize:13,fontWeight:700,color:diasCorte<=3?C.red:C.amberLight}}>{diasCorte===0?"HOY":diasCorte+" días"}</div>
                    </div>
                    <div style={{background:`${t.color}18`,border:`1px solid ${t.color}44`,borderRadius:6,padding:"5px 8px",textAlign:"center"}}>
                      <div style={{fontSize:9,color:C.textMuted,marginBottom:1}}>💳 PAGO DÍA {t.fechaPago}</div>
                      <div style={{fontSize:13,fontWeight:700,color:diasPago<=5?C.red:C.green}}>{diasPago===0?"HOY":diasPago+" días"}</div>
                    </div>
                  </div>
                  <div style={{fontSize:10,color:diasCorte<=7||diasPago<=7?C.semYellow:C.green,background:"rgba(255,255,255,0.04)",borderRadius:4,padding:"4px 7px"}}>{estrategia}</div>
                </div>;
              })}
            </div>
          </div>
        </>}

      </main>
    </div>
  );
}
