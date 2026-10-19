import {test} from 'node:test';
import assert from 'node:assert/strict';
import {synthesize,responseAt,sweep,microstrip,prototype,touchstone} from '../src/engine.js';
const base={technology:'lc',type:'lowpass',family:'butterworth',order:5,impedance:50,frequency:2.4,bandwidth:.4,ripple:.1,er:3.48,height:.508,a:22.86,b:10.16};
const near=(a,b,tol=1e-6)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
test('Butterworth response matches analytic transfer for all four transformations',()=>{
 for(const type of ['lowpass','highpass','bandpass','bandstop'])for(const order of [1,2,5,8,12]){
  const d=synthesize({...base,type,order});
  for(const f of [.8,1.9,2.3,2.41,2.7,4]){
   let omega=type==='lowpass'?f/base.frequency:type==='highpass'?base.frequency/f:type==='bandpass'?Math.abs((f*f-base.frequency**2)/(base.bandwidth*f)):Math.abs(base.bandwidth*f/(f*f-base.frequency**2));
   near(responseAt(d,f).s21,Math.max(-240,-10*Math.log10(1+omega**(2*order))),1e-5);
  }
 }
});
test('Chebyshev response matches analytic ripple, including even-order unequal termination',()=>{
 for(const order of [1,2,3,4,7,10]){
  const d=synthesize({...base,family:'chebyshev',order});
  for(const ratio of [.01,.2,.6,.9,1,1.3]){
   const T=ratio<=1?Math.cos(order*Math.acos(ratio)):Math.cosh(order*Math.acosh(ratio));
   const expected=-10*Math.log10(1+(10**(.1/10)-1)*T*T);
   near(responseAt(d,base.frequency*ratio).s21,expected,1e-6);
  }
 }
});
test('lossless power is conserved across LC and distributed cascades',()=>{
 for(const technology of ['lc','microstrip','waveguide'])for(const family of ['butterworth','chebyshev']){
  const d=synthesize({...base,technology,family,...(technology==='waveguide'?{type:'bandpass',frequency:10,bandwidth:.8}:{})});
  for(const p of sweep(d,301)){near(10**(p.s21/10)+10**(p.s11/10),1,1e-8);assert.ok(Number.isFinite(p.delay));}
 }
});
test('bandpass and bandstop exact resonance limits remain finite',()=>{
 for(const type of ['bandpass','bandstop']){
  const p=responseAt(synthesize({...base,type}),2.4);assert.ok(Number.isFinite(p.s21));assert.ok(Number.isFinite(p.s11));
  if(type==='bandpass')near(p.s21,0,1e-7);else assert.ok(p.s21< -100);
 }
});
test('microstrip widths decrease with impedance and line length is positive',()=>{
 assert.ok(microstrip(25,3.48,.508).width>microstrip(100,3.48,.508).width);
 for(const l of synthesize({...base,technology:'microstrip'}).lines){assert.ok(l.length>0);assert.ok(l.effectiveEr>1&&l.effectiveEr<base.er);}
});
test('WR90 design gives TE10 cutoff, half guided wavelength and symmetric coupling',()=>{
 const d=synthesize({...base,technology:'waveguide',type:'bandpass',frequency:10,bandwidth:.8});const g=d.waveguide;
 near(g.cutoff,6.557140376,1e-6);near(g.length,19.85356,.001);near(g.qext[0],g.qext[1]);near(g.couplings[0],g.couplings.at(-1));
});
test('invalid and multimode specifications are rejected',()=>{
 for(const patch of [{order:0},{frequency:NaN},{technology:'unknown'},{type:'unknown'},{technology:'microstrip',type:'highpass'},{technology:'waveguide',type:'bandpass',frequency:5},{technology:'waveguide',type:'bandpass',frequency:15}])assert.throws(()=>synthesize({...base,...patch}));
});
test('Touchstone 2.0 includes correct port references and reciprocal lossless S matrix',()=>{
 const d=synthesize({...base,family:'chebyshev',order:4}),p=sweep(d,11),file=touchstone(d,p);
 assert.ok(file.includes(`[Reference] 50 ${d.load}`));assert.ok(file.includes('[Number of Frequencies] 11'));
 const rows=file.split('[Network Data]\n')[1].split('\n').slice(0,-1);assert.equal(rows.length,11);
 for(const row of rows){const v=row.split(' ').map(Number);assert.equal(v.length,9);near(v[3],v[5]);near(v[4],v[6]);near(v[1]**2+v[2]**2+v[3]**2+v[4]**2,1,1e-8);near(v[7]**2+v[8]**2,v[1]**2+v[2]**2,1e-8);}
});
