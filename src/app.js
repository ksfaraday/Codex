import {synthesize,sweep,responseAt,formatPart,touchstone} from './engine.js';
const $=id=>document.getElementById(id);
const types={lowpass:'Low-pass',highpass:'High-pass',bandpass:'Band-pass',bandstop:'Band-stop'};
const techNames={lc:'LC',microstrip:'Microstrip',waveguide:'Waveguide'};
let technology='lc',design,points,plotMode='magnitude',lastTable=[],toastTimer;
const numeric=['order','impedance','frequency','bandwidth','ripple','er','height','a','b'];
function spec(){return {technology,type:$('type').value,family:$('family').value,...Object.fromEntries(numeric.map(k=>[k,Number($(k).value)]))};}
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2600);}
function sync(){
 const t=$('type');
 [...t.options].forEach(o=>o.disabled=technology==='microstrip'?o.value!=='lowpass':technology==='waveguide'?o.value!=='bandpass':false);
 if(t.selectedOptions[0].disabled)t.value=technology==='waveguide'?'bandpass':'lowpass';
 $('bandwidth-field').hidden=!t.value.startsWith('band');
 $('ripple-field').hidden=$('family').value!=='chebyshev';
 $('substrate-fields').hidden=technology!=='microstrip';$('waveguide-fields').hidden=technology!=='waveguide';
 $('frequency-label').firstChild.textContent=t.value.startsWith('band')?'중심 주파수':'차단 주파수';
 document.querySelectorAll('[data-tech]').forEach(b=>{b.classList.toggle('active',b.dataset.tech===technology);b.setAttribute('aria-pressed',b.dataset.tech===technology);});
}
function compute(){
 try{const next=synthesize(spec()),samples=sweep(next);if(samples.some(p=>![p.s21,p.s11,p.delay].every(Number.isFinite)))throw new Error('계산이 수렴하지 않았습니다. 사양을 확인하세요.');design=next;points=samples;$('error').hidden=true;render();return true;}
 catch(e){$('error').textContent=e.message;$('error').hidden=false;return false;}
}
function render(){
 const s=design.spec,wg=design.waveguide;
 $('design-title').textContent=`${techNames[s.technology]} ${types[s.type]} Filter`;
 $('design-subtitle').textContent=`${s.family==='butterworth'?'Butterworth':'Chebyshev I'} · ${s.order}차 · ${s.impedance} Ω 기준`;
 $('model-badge').textContent=s.technology==='lc'?'IDEAL LUMPED':s.technology==='microstrip'?'QUASI-TEM MODEL':'COUPLED RESONATOR';
 $('metric-frequency-label').textContent=s.type.startsWith('band')?'중심 주파수':'차단 주파수';
 $('metric-frequency').innerHTML=`${s.frequency.toFixed(3)} <em>GHz</em>`;
 $('metric-frequency-note').textContent=s.type.startsWith('band')?`대역폭 ${s.bandwidth.toFixed(3)} GHz`:s.family==='butterworth'?'원형 필터 −3.01 dB 기준':`원형 필터 −${s.ripple} dB 기준`;
 $('metric-order').innerHTML=`${s.order} <em>poles</em>`;
 $('metric-order-note').textContent=s.family==='butterworth'?'최대 평탄 응답':`등리플 ${s.ripple} dB`;
 const r=responseAt(design,s.frequency);
 $('metric-response').innerHTML=`${r.s21.toFixed(2)} <em>dB</em>`;
 $('metric-response-note').textContent=`@ ${s.frequency.toFixed(3)} GHz · ${s.technology==='waveguide'?'이상 합성 목표':'무손실 모델'}`;
 $('metric-extra-label').textContent=wg?'TE10 차단 주파수':'부하 임피던스';
 $('metric-extra').innerHTML=wg?`${wg.cutoff.toFixed(3)} <em>GHz</em>`:`${design.load.toFixed(2)} <em>Ω</em>`;
 $('metric-extra-note').textContent=wg?`상위 모드 ${wg.nextCutoff.toFixed(3)} GHz`:`소스 ${s.impedance} Ω · g${s.order+1} = ${design.g.at(-1).toFixed(4)}`;
 $('geometry-title').textContent=s.technology==='lc'?'합성 회로':s.technology==='microstrip'?'마이크로스트립 평면도':'도파관 공진기 배치';
 $('model-note').textContent=s.technology==='lc'?'이상적인 무손실 L/C 소자를 ABCD 행렬로 계산합니다. 실제 설계에서는 소자 Q, 자기 공진 주파수, 기생 성분 및 허용오차 검증이 필요합니다.':s.technology==='microstrip'?'준정적 유효 유전율과 균일 전송선 ABCD 모델입니다. 선로 길이는 짧은 선로 근사 합성값이며 실제 응답은 이 근사의 오차와 주기성을 포함합니다. 도체·유전체 손실, 분산, 접합 불연속, 상호 결합은 제외됩니다.':'공기 충전 TE10의 λg/2 공진기 초기 길이와 원형 필터 기반 Qe / 결합계수 M을 제공합니다. 그래프는 이상 LC 등가회로의 합성 목표이며 도파관 EM 응답이 아닙니다. 아이리스 개구 치수와 공진기 길이 보정은 3D EM 추출·최적화가 필요합니다.';
 renderPlot();renderGeometry();renderTable();
 $('computed-at').textContent='계산 완료 · '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
 $('computed-at').classList.remove('stale');
 document.querySelectorAll('[data-plot]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.plot===plotMode));
}
function renderPlot(){
 const W=900,H=310,L=58,R=23,T=30,B=42;
 const x=f=>L+(f-points[0].f)/(points.at(-1).f-points[0].f)*(W-L-R);
 const vals=points.map(p=>p.delay);let low=plotMode==='magnitude'?-100:Math.min(0,...vals),high=plotMode==='magnitude'?0:Math.max(.01,...vals);
 if(plotMode==='delay'){const pad=(high-low)*.08;low-=pad;high+=pad;}
 const y=v=>T+(high-Math.max(low,Math.min(high,v)))/(high-low)*(H-T-B);
 let grid='';for(let i=0;i<=5;i++){const v=low+(high-low)*i/5,Y=y(v);grid+=`<line x1="${L}" y1="${Y}" x2="${W-R}" y2="${Y}" stroke="#263542" stroke-dasharray="3 5"/><text x="${L-12}" y="${Y+4}" text-anchor="end">${plotMode==='magnitude'?v.toFixed(0):v.toFixed(2)}</text>`;}
 for(let i=0;i<=6;i++){const f=points[0].f+(points.at(-1).f-points[0].f)*i/6,X=x(f);grid+=`<line x1="${X}" y1="${T}" x2="${X}" y2="${H-B}" stroke="#202e3b"/><text x="${X}" y="${H-B+23}" text-anchor="middle">${f.toFixed(2)}</text>`;}
 const path=key=>points.map((p,i)=>`${i?'L':'M'}${x(p.f).toFixed(2)},${y(p[key]).toFixed(2)}`).join(' ');
 const target=design.spec.frequency;
 const path21=path(plotMode==='magnitude'?'s21':'delay');
 $('plot').innerHTML=`<svg id="response-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${plotMode==='magnitude'?'S21 및 S11 크기, dB':'군지연, ns'} 대 주파수 GHz"><defs><linearGradient id="plot-fill" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#79e8b5" stop-opacity=".1"/><stop offset="1" stop-color="#79e8b5" stop-opacity="0"/></linearGradient><clipPath id="plot-clip"><rect x="${L}" y="${T}" width="${W-L-R}" height="${H-T-B}"/></clipPath></defs>${grid}<text x="${L}" y="15">${plotMode==='magnitude'?'Magnitude (dB)':'Group delay (ns)'}</text><text x="${W-R}" y="${H-3}" text-anchor="end">Frequency (GHz)</text><g clip-path="url(#plot-clip)"><line x1="${x(target)}" y1="${T}" x2="${x(target)}" y2="${H-B}" stroke="#668477" stroke-dasharray="4 5"/><path d="${path21} L${W-R},${H-B} L${L},${H-B} Z" fill="url(#plot-fill)"/><path d="${path21}" fill="none" stroke="#79e8b5" stroke-width="2"/>${plotMode==='magnitude'?`<path d="${path('s11')}" fill="none" stroke="#b1a0f6" stroke-width="1.7"/>`:''}<line id="cursor-line" x1="0" x2="0" y1="${T}" y2="${H-B}" stroke="#cfdae1" stroke-dasharray="2 3" visibility="hidden"/></g><text x="${Math.min(x(target)+7,W-100)}" y="${T+13}" fill="#9db8aa">f₀ ${target} GHz</text></svg>`;
 $('legend').innerHTML=plotMode==='magnitude'?'<span><i class="legend-line green"></i>S21 · 전달</span><span><i class="legend-line purple"></i>S11 · 반사</span>':'<span><i class="legend-line green"></i>S21 · 군지연</span>';
 const svg=$('response-svg');
 svg.addEventListener('pointermove',e=>{const box=svg.getBoundingClientRect(),X=(e.clientX-box.left)/box.width*W;const index=Math.max(0,Math.min(points.length-1,Math.round((X-L)/(W-L-R)*(points.length-1))));const p=points[index];const line=$('cursor-line');line.setAttribute('x1',x(p.f));line.setAttribute('x2',x(p.f));line.setAttribute('visibility','visible');$('cursor-readout').textContent=`${p.f.toFixed(4)} GHz   |   S21 ${p.s21.toFixed(2)} dB   |   S11 ${p.s11.toFixed(2)} dB   |   τ ${p.delay.toFixed(3)} ns`;});
 svg.addEventListener('pointerleave',()=>$('cursor-line').setAttribute('visibility','hidden'));
}
const text=(x,y,t,color='#94aab9',size=11,anchor='middle')=>`<text x="${x}" y="${y}" fill="${color}" font-size="${size}" text-anchor="${anchor}">${t}</text>`;
const wire=(x1,y1,x2,y2)=>`<path d="M${x1},${y1} L${x2},${y2}" fill="none" stroke="#a5d5c1" stroke-width="1.6"/>`;
function ground(x,y){return wire(x,y,x,y+7)+wire(x-9,y+7,x+9,y+7)+wire(x-6,y+11,x+6,y+11)+wire(x-3,y+15,x+3,y+15);}
function symbol(p,x,y,vertical=false){
 let shape;
 if(p.kind==='C')shape=`<path d="M-23,0 H-4 M4,0 H23 M-4,-11 V11 M4,-11 V11"/>`;
 else shape=`<path d="M-23,0 H-17 C-17,-15 -8,-15 -8,0 C-8,-15 1,-15 1,0 C1,-15 10,-15 10,0 C10,-15 19,-15 19,0 H23"/>`;
 return `<g transform="translate(${x} ${y})${vertical?' rotate(90)':''}" stroke="#79e8b5" fill="none" stroke-width="1.8">${shape}</g>`;
}
function renderGeometry(){
 const s=design.spec,n=s.order,W=Math.max(820,n*125+120);let content='';
 if(s.technology==='lc'){
  const left=60,right=W-60,step=(right-left)/(n+1),Y=80;
  content+=text(24,35,'PORT 1','#607f92',9,'start')+text(W-24,35,'PORT 2','#607f92',9,'end');
  content+=text(24,57,`${design.source} Ω`,'#a2b4c0',10,'start')+text(W-24,57,`${design.load.toFixed(2)} Ω`,'#a2b4c0',10,'end');
  let last=25;
  for(const t of design.stages){const x=left+t.index*step;
   const pair=t.parts.length===2;
   if(t.series){
    const width=pair&&t.topology==='series'?50:24;
    content+=wire(last,Y,x-width,Y);last=x+width;
    if(!pair)content+=symbol(t.parts[0],x,Y);
    else if(t.topology==='series'){content+=symbol(t.parts[0],x-25,Y)+symbol(t.parts[1],x+25,Y)+wire(x-2,Y,x+2,Y);}
    else{content+=wire(x-24,Y,x-24,Y-22)+wire(x+24,Y,x+24,Y-22)+wire(x-24,Y,x-24,Y+22)+wire(x+24,Y,x+24,Y+22)+symbol(t.parts[0],x,Y-22)+symbol(t.parts[1],x,Y+22);}
    content+=text(x,32,`${t.parts.map((p,i)=>p.kind+(t.index)+(pair?String.fromCharCode(97+i):'')).join(' / ')}`,'#d4e7de',11);
    t.parts.forEach((p,i)=>content+=text(x,136+i*16,formatPart(p),'#8ba69a',10));
   }else{
    content+=wire(last,Y,x,Y)+`<circle cx="${x}" cy="${Y}" r="3" fill="#79e8b5"/>`;last=x;
    if(!pair){content+=wire(x,Y,x,92)+symbol(t.parts[0],x,115,true)+ground(x,138);}
    else if(t.topology==='parallel'){content+=wire(x,Y,x,90)+wire(x-19,90,x+19,90)+wire(x-19,90,x-19,94)+wire(x+19,90,x+19,94)+symbol(t.parts[0],x-19,117,true)+symbol(t.parts[1],x+19,117,true)+wire(x-19,140,x+19,140)+ground(x,140);}
    else{content+=symbol(t.parts[0],x,105,true)+symbol(t.parts[1],x,151,true)+ground(x,174);}
    content+=text(x,43,t.parts.map(p=>p.kind+t.index).join(' / '),'#d4e7de',11);
    t.parts.forEach((p,i)=>content+=text(x+32,106+i*16,formatPart(p),'#8ba69a',9,'start'));
   }
  }
  content+=wire(last,Y,W-25,Y)+`<circle cx="25" cy="${Y}" r="4" fill="#0e161f" stroke="#79e8b5"/><circle cx="${W-25}" cy="${Y}" r="4" fill="#0e161f" stroke="#79e8b5"/>`;
 }else if(s.technology==='microstrip'){
  const start=70,space=(W-140)/n,maxw=Math.max(...design.lines.map(l=>l.width));
  content+=`<rect x="30" y="37" width="${W-60}" height="130" rx="7" fill="#1d3538" fill-opacity=".7" stroke="#39615b"/>`;
  content+=wire(12,102,start,102)+wire(W-start,102,W-12,102);
  for(const l of design.lines){const x=start+(l.index-1)*space,h=12+42*l.width/maxw;content+=`<rect x="${x}" y="${102-h/2}" width="${space}" height="${h}" fill="#bc9b54" stroke="#edcc80" stroke-width=".7"/>`+text(x+space/2,65,`TL${l.index} · ${l.impedance} Ω`,'#e7d4a1',10)+text(x+space/2,143,`${l.length.toFixed(2)} mm`,'#b9d8ce',11)+text(x+space/2,158,`W ${l.width.toFixed(3)}`,'#829d94',9);}
  content+=text(W/2,194,`εr ${s.er}   ·   h ${s.height} mm   ·   비축척 평면도`,'#6f8b96',10);
 }else{
  const g=design.waveguide,space=(W-140)/n,start=70;
  content+=wire(12,100,start,100)+wire(W-start,100,W-12,100);
  for(let i=0;i<n;i++){
   const x=start+i*space;
   content+=`<rect x="${x}" y="47" width="${space}" height="108" fill="#263b53" stroke="#80a9d0" stroke-width="1.5"/>`+text(x+space/2,84,`CAVITY ${i+1}`,'#789fc6',9)+text(x+space/2,108,`${g.length.toFixed(2)} mm`,'#c2d9ed',12)+text(x+space/2,129,'λg / 2','#7796b2',9);
   if(i<n-1)content+=`<path d="M${x+space},47 V79 M${x+space},123 V155" stroke="#b6cde3" stroke-width="7"/>`+text(x+space,181,`M${i+1},${i+2} ${g.couplings[i].toFixed(4)}`,'#84b1c9',9);
  }
  content+=text(25,34,`Qe ${g.qext[0].toFixed(2)}`,'#80c4aa',10,'start')+text(W-25,34,`Qe ${g.qext[1].toFixed(2)}`,'#80c4aa',10,'end')+text(W/2,202,`a ${s.a} × b ${s.b} mm · 아이리스는 위치만 표시 · 치수 미합성`,'#7991a5',10);
 }
 $('geometry').innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 215" role="img" aria-label="${$('geometry-title').textContent}"><rect width="${W}" height="215" fill="#0e161f" fill-opacity=".5"/>${content}</svg>`;
}
function renderTable(){
 const s=design.spec;
 let head,rows;
 if(s.technology==='lc'){
  $('table-title').textContent='소자 값';head=['소자','접속','구성','설계 값','원형 g'];
  rows=design.stages.flatMap(t=>t.parts.map((p,i)=>[p.kind+t.index+(t.parts.length>1?String.fromCharCode(97+i):''),t.series?'Series':'Shunt',t.topology==='single'?'단일 소자':t.topology==='series'?'직렬 공진':'병렬 공진',formatPart(p),t.g.toFixed(5)]));
 }else if(s.technology==='microstrip'){
  $('table-title').textContent='전송선 설계 치수';head=['선로','임피던스','선폭 W (mm)','길이 L (mm)','εeff','전기 길이'];
  rows=design.lines.map(l=>['TL'+l.index,`${l.impedance} Ω`,l.width.toFixed(4),l.length.toFixed(4),l.effectiveEr.toFixed(4),(l.theta*180/Math.PI).toFixed(2)+'°']);
 }else{
  $('table-title').textContent='공진기 및 결합 합성 목표';head=['항목','설계 값','단위','비고'];const g=design.waveguide;
  rows=[['Qe,in',g.qext[0].toFixed(5),'—','입력 외부 Q'],...design.stages.map(t=>['Cavity '+t.index,g.length.toFixed(4),'mm','비결합 λg/2 초기 길이']),...g.couplings.map((m,i)=>[`M${i+1},${i+2}`,m.toFixed(6),'—','인접 공진기 결합계수']),['Qe,out',g.qext[1].toFixed(5),'—','출력 외부 Q']];
 }
 lastTable=[head,...rows];
 $('table-head').innerHTML='<tr>'+head.map(c=>`<th>${c}</th>`).join('')+'</tr>';
 $('table-body').innerHTML=rows.map(row=>'<tr>'+row.map(c=>`<td>${c}</td>`).join('')+'</tr>').join('');
}
function download(name,data,type){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(name+' 내보내기 완료');}
function fileStem(){return `filter-${design.spec.technology}-${design.spec.type}-${design.spec.frequency}GHz`;}
function ensureCurrent(){if(!compute()){toast('입력 오류를 먼저 수정하세요.');return false;}return true;}
$('spec-form').addEventListener('submit',e=>{e.preventDefault();if(compute())toast('합성과 응답 계산을 완료했습니다.');});
$('spec-form').addEventListener('input',()=>{$('computed-at').textContent='사양 변경됨 · 합성 및 분석을 눌러 적용';$('computed-at').classList.add('stale');});
$('type').addEventListener('change',sync);$('family').addEventListener('change',sync);
$('wg-preset').addEventListener('change',()=>{if($('wg-preset').value==='wr90'){$('a').value=22.86;$('b').value=10.16;$('frequency').value=10;$('bandwidth').value=.8;}if($('wg-preset').value==='wr75'){$('a').value=19.05;$('b').value=9.525;$('frequency').value=12;$('bandwidth').value=1;}});
for(const id of ['a','b'])$(id).addEventListener('input',()=>$('wg-preset').value='custom');
document.querySelectorAll('[data-tech]').forEach(b=>b.addEventListener('click',()=>{const was=technology;technology=b.dataset.tech;if(technology==='waveguide'&&was!=='waveguide'){$('frequency').value=10;$('bandwidth').value=.8;$('a').value=22.86;$('b').value=10.16;$('wg-preset').value='wr90';}else if(was==='waveguide'&&technology!=='waveguide'){$('frequency').value=2.4;$('bandwidth').value=.4;}sync();compute();}));
document.querySelectorAll('[data-plot]').forEach(b=>b.addEventListener('click',()=>{plotMode=b.dataset.plot;document.querySelectorAll('[data-plot]').forEach(el=>{el.classList.toggle('active',el===b);el.setAttribute('aria-pressed',el===b);});renderPlot();}));
$('save').addEventListener('click',()=>{if(ensureCurrent())download(fileStem()+'.json',JSON.stringify({format:'filter-studio',version:1,spec:design.spec},null,2),'application/json');});
$('import').addEventListener('click',()=>$('file').click());
$('file').addEventListener('change',async()=>{
 const file=$('file').files[0];if(!file)return;
 try{if(file.size>100000)throw Error('100 KB 이하의 프로젝트 파일을 선택하세요.');const data=JSON.parse(await file.text());if(data.format!=='filter-studio'||data.version!==1)throw Error('Filter Studio v1 프로젝트가 아닙니다.');const next=synthesize(data.spec);technology=next.spec.technology;for(const k of numeric)$(k).value=next.spec[k];$('type').value=next.spec.type;$('family').value=next.spec.family;$('wg-preset').value='custom';sync();if(compute())toast('프로젝트를 불러왔습니다.');}catch(e){$('error').textContent='불러오기 실패: '+e.message;$('error').hidden=false;}$('file').value='';
});
$('export-csv').addEventListener('click',()=>{if(ensureCurrent())download(fileStem()+'.csv','\uFEFF'+lastTable.map(row=>row.map(c=>'"'+String(c).replaceAll('"','""')+'"').join(',')).join('\r\n'),'text/csv;charset=utf-8');});
$('export-s2p').addEventListener('click',()=>{if(ensureCurrent())download(fileStem()+'.s2p',touchstone(design,points),'text/plain');});
$('export-svg').addEventListener('click',()=>{if(ensureCurrent())download(fileStem()+'.svg',$('geometry').querySelector('svg').outerHTML,'image/svg+xml');});
sync();compute();
// Expose a compact read-only summary for automated browser smoke checks.
window.filterStudio={get summary(){return {technology:design?.spec.technology,type:design?.spec.type,stages:design?.stages.length,points:points?.length,error:$('error').hidden?null:$('error').textContent};}};
