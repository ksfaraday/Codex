// All public frequencies are GHz; all component values and internal arithmetic use SI.
export const C0=299792458;
const pi=Math.PI;
export const cx=(r=0,i=0)=>({r,i});
const add=(a,b)=>cx(a.r+b.r,a.i+b.i);
const mul=(a,b)=>cx(a.r*b.r-a.i*b.i,a.r*b.i+a.i*b.r);
const scale=(a,s)=>cx(a.r*s,a.i*s);
const div=(a,b)=>{const d=b.r*b.r+b.i*b.i;return cx((a.r*b.r+a.i*b.i)/d,(a.i*b.r-a.r*b.i)/d);};
const mag=a=>Math.hypot(a.r,a.i);
const db=a=>20*Math.log10(Math.max(a,1e-12));
export function validate(s){
 const errors=[];
 if(!['lc','microstrip','waveguide'].includes(s.technology))errors.push('지원하지 않는 설계 방식입니다.');
 if(!['lowpass','highpass','bandpass','bandstop'].includes(s.type))errors.push('지원하지 않는 필터 응답입니다.');
 if(!['butterworth','chebyshev'].includes(s.family))errors.push('지원하지 않는 근사 함수입니다.');
 if(!Number.isInteger(s.order)||s.order<1||s.order>12)errors.push('차수는 1–12 사이의 정수여야 합니다.');
 for(const [k,label,min,max] of [['frequency','기준 주파수',0.001,1000],['impedance','기준 임피던스',1,1000],['ripple','리플',0.001,3],['bandwidth','대역폭',0.000001,1000],['er','유전율',1.01,30],['height','기판 두께',0.01,10],['a','도파관 폭 a',0.1,1000],['b','도파관 높이 b',0.1,1000]])if(!Number.isFinite(s[k])||s[k]<min||s[k]>max)errors.push(`${label}: ${min}–${max} 범위를 입력하세요.`);
 if(s.type.startsWith('band')&&s.bandwidth>=2*s.frequency)errors.push('대역폭은 중심 주파수의 2배보다 작아야 합니다.');
 if(s.technology==='microstrip'&&s.type!=='lowpass')errors.push('마이크로스트립은 stepped-impedance 저역통과 합성을 지원합니다.');
 if(s.technology==='waveguide'&&s.type!=='bandpass')errors.push('도파관은 결합 공진기 대역통과 합성을 지원합니다.');
 if(s.technology==='waveguide'){
  if(s.b>=s.a)errors.push('TE10 기준 도파관은 b < a여야 합니다.');
  const lo=Math.sqrt(s.frequency*s.frequency+s.bandwidth*s.bandwidth/4)-s.bandwidth/2;
  const hi=lo+s.bandwidth;
  const fc=C0/(2*s.a*1e-3)/1e9;
  const next=Math.min(C0/(s.a*1e-3),C0/(2*s.b*1e-3))/1e9;
  if(lo<=fc)errors.push(`통과대역 하한이 TE10 차단 주파수 ${fc.toFixed(3)} GHz보다 높아야 합니다.`);
  if(hi>=next)errors.push(`통과대역 상한이 고차 모드 차단 ${next.toFixed(3)} GHz보다 낮아야 합니다.`);
 }
 if(errors.length)throw new Error(errors.join('\n'));
}
export function prototype(n,family,ripple){
 if(family==='butterworth')return [1,...Array.from({length:n},(_,i)=>2*Math.sin((2*i+1)*pi/(2*n))),1];
 const beta=Math.log(1/Math.tanh(ripple/17.371779276));
 const gamma=Math.sinh(beta/(2*n));
 const a=k=>Math.sin((2*k-1)*pi/(2*n));
 const b=k=>gamma*gamma+Math.sin(k*pi/n)**2;
 const g=[1,2*a(1)/gamma];
 for(let k=2;k<=n;k++)g[k]=4*a(k-1)*a(k)/(b(k-1)*g[k-1]);
 g[n+1]=n%2?1:1/Math.tanh(beta/4)**2;
 return g;
}
export function synthesize(s){
 validate(s);const g=prototype(s.order,s.family,s.ripple),w=2*pi*s.frequency*1e9,d=2*pi*s.bandwidth*1e9,R=s.impedance;
 const stages=[];
 for(let k=1;k<=s.order;k++){
  const series=k%2===1;let topology='single',parts;
  if(s.type==='lowpass')parts=[{kind:series?'L':'C',value:series?R*g[k]/w:g[k]/(R*w)}];
  if(s.type==='highpass')parts=[{kind:series?'C':'L',value:series?1/(R*w*g[k]):R/(w*g[k])}];
  if(s.type==='bandpass'){
   topology=series?'series':'parallel';
   const L=series?R*g[k]/d:R*d/(g[k]*w*w);
   parts=[{kind:'L',value:L},{kind:'C',value:1/(L*w*w)}];
  }
  if(s.type==='bandstop'){
   topology=series?'parallel':'series';
   const L=series?R*g[k]*d/(w*w):R/(g[k]*d);
   parts=[{kind:'L',value:L},{kind:'C',value:1/(L*w*w)}];
  }
  stages.push({index:k,series,topology,g:g[k],parts});
 }
 const design={spec:{...s},g,stages,load:R*g[s.order+1],source:R};
 if(s.technology==='microstrip')design.lines=stages.map(t=>{
  const z=t.series?100:25;
  const geo=microstrip(z,s.er,s.height);
  const theta=t.g*R/z*(t.series?1:z*z/(R*R));
  return {...geo,index:t.index,role:t.series?'High-Z / L':'Low-Z / C',theta,length:theta*C0/(w*Math.sqrt(geo.effectiveEr))*1000};
 });
 if(s.technology==='waveguide'){
  const fc=C0/(2*s.a*1e-3)/1e9;
  const lambda=C0/(s.frequency*1e9*Math.sqrt(1-(fc/s.frequency)**2))*1000;
  const fbw=s.bandwidth/s.frequency;
  const qext=[g[0]*g[1]/fbw,g[s.order]*g[s.order+1]/fbw];
  const couplings=Array.from({length:s.order-1},(_,i)=>fbw/Math.sqrt(g[i+1]*g[i+2]));
  design.waveguide={cutoff:fc,nextCutoff:Math.min(C0/(s.a*1e-3),C0/(2*s.b*1e-3))/1e9,lambda,length:lambda/2,qext,couplings};
 }
 return design;
}
// Quasi-static Hammerstad width inversion, zero conductor thickness.
export function microstrip(z,er,h){
 const calc=u=>{
  const ee=(er+1)/2+(er-1)/2*(1/Math.sqrt(1+12/u)+(u<1?0.04*(1-u)**2:0));
  const Z=u<=1?60/Math.sqrt(ee)*Math.log(8/u+u/4):120*pi/(Math.sqrt(ee)*(u+1.393+0.667*Math.log(u+1.444)));
  return {Z,ee};
 };
 let lo=.0001,hi=1000;
 for(let i=0;i<90;i++){const mid=(lo+hi)/2;if(calc(mid).Z>z)lo=mid;else hi=mid;}
 const u=(lo+hi)/2;return {impedance:z,width:u*h,effectiveEr:calc(u).ee};
}
function cascade(m,n){return [add(mul(m[0],n[0]),mul(m[1],n[2])),add(mul(m[0],n[1]),mul(m[1],n[3])),add(mul(m[2],n[0]),mul(m[3],n[2])),add(mul(m[2],n[1]),mul(m[3],n[3]))];}
function partZ(p,w){return p.kind==='L'?cx(0,w*p.value):cx(0,-1/(w*p.value));}
export function responseAt(design,f){
 const w=2*pi*f*1e9;
 let m=[cx(1),cx(),cx(),cx(1)];
 if(design.spec.technology==='microstrip'){
  for(const line of design.lines){const t=line.theta*f/design.spec.frequency,c=Math.cos(t),s=Math.sin(t);m=cascade(m,[cx(c),cx(0,line.impedance*s),cx(0,s/line.impedance),cx(c)]);}
 }else{
  for(const stage of design.stages){
   let z=partZ(stage.parts[0],w);
   if(stage.parts.length===2){const z2=partZ(stage.parts[1],w);z=stage.topology==='series'?add(z,z2):div(mul(z,z2),add(z,z2));}
   // At an ideal resonance the exact open/short limit is evaluated nearby.
   if(!Number.isFinite(z.r)||!Number.isFinite(z.i))return responseAt(design,f*(1+1e-10));
   const n=stage.series?[cx(1),z,cx(),cx(1)]:[cx(1),cx(),div(cx(1),z),cx(1)];
   if(n.some(a=>!Number.isFinite(a.r)||!Number.isFinite(a.i)))return responseAt(design,f*(1+1e-10));
   m=cascade(m,n);
  }
 }
 const rs=design.source,rl=design.load;
 const a=scale(m[0],rl),b=m[1],c=scale(m[2],rs*rl),d=scale(m[3],rs);
 const den=add(add(a,b),add(c,d));
 const s21=div(cx(2*Math.sqrt(rs*rl)),den);
 const s11=div(add(add(a,b),scale(add(c,d),-1)),den);
 return {f,s21:db(mag(s21)),s11:db(mag(s11)),phase:Math.atan2(s21.i,s21.r),complex21:s21,complex11:s11};
}
export function sweep(design,count=801){
 const s=design.spec;const band=s.type.startsWith('band');
 const min=band?Math.max(s.frequency-s.bandwidth*2.5,s.frequency*.05):s.frequency*.05;
 const max=band?s.frequency+s.bandwidth*2.5:s.frequency*3;
 const points=Array.from({length:count},(_,i)=>responseAt(design,min+(max-min)*i/(count-1)));
 let phase=points[0].phase;
 for(let i=0;i<points.length;i++){
  let p=points[i].phase;
  while(p-phase>pi)p-=2*pi;while(p-phase< -pi)p+=2*pi;
  points[i].unwrapped=p;phase=p;
 }
 for(let i=0;i<points.length;i++){
  const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
  points[i].delay=-(b.unwrapped-a.unwrapped)/(2*pi*(b.f-a.f)); // ns
 }
 return points;
}
export function formatPart(p){return p.kind==='L'?`${(p.value*1e9).toPrecision(5)} nH`:`${(p.value*1e12).toPrecision(5)} pF`;}
export function touchstone(design,points){return ['! Filter Studio — ideal lossless model; unequal port reference impedances in ohms',`! Z1=${design.source} Z2=${design.load}`,'[Version] 2.0','# GHz S RI R '+design.source,'[Number of Ports] 2','[Number of Frequencies] '+points.length,`[Reference] ${design.source} ${design.load}`,'[Network Data]',...points.map(p=>{
 // For a reciprocal lossless network, S22 = -conj(S11)*S21/conj(S21).
 const s22=scale(mul(cx(p.complex11.r,-p.complex11.i),div(p.complex21,cx(p.complex21.r,-p.complex21.i))),-1);
 return [p.f,p.complex11.r,p.complex11.i,p.complex21.r,p.complex21.i,p.complex21.r,p.complex21.i,s22.r,s22.i].map(v=>v.toExponential(10)).join(' ');
}),'[End]'].join('\n');}
