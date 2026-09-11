const $ = id => document.getElementById(id);
const colors = ['#e35d4f','#276f9e','#8e5caf','#d68c25','#23856c','#ba4b82'];
let pixels, imageWidth, imageHeight, strips = [], results = [], baselinePoints = [], nextId = 1;
const sourceCanvas = document.createElement('canvas');
const sourceContext = sourceCanvas.getContext('2d', {willReadFrequently:true});

function loadImage(file) {
  const image = new Image();
  image.onload = () => {
    const scale = Math.min(1, 1200 / image.width);
    imageWidth = sourceCanvas.width = Math.round(image.width * scale);
    imageHeight = sourceCanvas.height = Math.round(image.height * scale);
    $('startY').max = Math.max(0, imageHeight - 2);
    $('endY').max = imageHeight - 1;
    $('startY').value = 0;
    $('endY').value = imageHeight - 1;
    sourceContext.drawImage(image, 0, 0, imageWidth, imageHeight);
    pixels = sourceContext.getImageData(0, 0, imageWidth, imageHeight).data;
    strips = []; results = []; baselinePoints = []; renderImage(); renderTable();
  };
  image.src = URL.createObjectURL(file);
}
function grayPixel(index) {
  return .299 * pixels[index] + .587 * pixels[index + 1] + .114 * pixels[index + 2];
}
function pixelIntensity(index) {
  const gray = grayPixel(index);
  return $('invert').checked ? 255 - gray : gray;
}
function rangeY() {
  const start = Math.max(0, Math.min(imageHeight - 2, +$('startY').value || 0));
  const end = Math.max(start + 1, Math.min(imageHeight - 1, +$('endY').value || imageHeight - 1));
  return {start, end};
}
function slope() { return Math.tan((+$('stripAngle').value || 0) * Math.PI / 180); }
function renderImage() {
  if (!pixels) return;
  const out = document.createElement('canvas'), ctx = out.getContext('2d');
  out.width=imageWidth; out.height=imageHeight;
  const data=ctx.createImageData(imageWidth,imageHeight);
  for(let i=0;i<pixels.length;i+=4) { const v=grayPixel(i); data.data[i]=data.data[i+1]=data.data[i+2]=v; data.data[i+3]=255; }
  ctx.putImageData(data,0,0);
  $('imageArea').className='';
  $('imageArea').innerHTML='<div id="imageWrap"><canvas id="imageCanvas" width="'+imageWidth+'" height="'+imageHeight+'"></canvas><div id="overlay"></div></div><p class="canvas-note">グレースケールプレビューです。クリックして短冊を配置できます。</p>';
  $('imageCanvas').getContext('2d').drawImage(out,0,0);
  $('imageCanvas').onclick=e=>{const r=e.currentTarget.getBoundingClientRect(), x=(e.clientX-r.left)*imageWidth/r.width, y=(e.clientY-r.top)*imageHeight/r.height; addStrip(x-y*slope()+rangeY().start*slope())};
  renderStrips(); drawChart();
}
function addStrip(x) {
  if(!pixels) return;
  const width=+$('stripWidth').value;
  x=Math.max(width/2,Math.min(imageWidth-width/2,x));
  if(strips.some(s=>Math.abs(s.x-x)<+$('minDist').value)) return;
  strips.push({id:nextId++,x,width,selected:true}); renderStrips(); drawChart();
}
function renderStrips() {
  const overlay=$('overlay'); if(!overlay) return; overlay.innerHTML='';
  const {start:y0,end:y1}=rangeY(), m=slope();
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('viewBox',`0 0 ${imageWidth} ${imageHeight}`); svg.setAttribute('preserveAspectRatio','none'); svg.style.cssText='width:100%;height:100%;position:absolute;inset:0';
  svg.innerHTML=`<line x1="0" y1="${y0}" x2="${imageWidth}" y2="${y0}" stroke="#172018" stroke-width="1.5" stroke-dasharray="5 4"/><text x="5" y="${Math.max(12,y0-4)}" fill="#172018" font-size="11" font-weight="700">始点</text><line x1="0" y1="${y1}" x2="${imageWidth}" y2="${y1}" stroke="#172018" stroke-width="1.5" stroke-dasharray="5 4"/><text x="5" y="${Math.max(12,y1-4)}" fill="#172018" font-size="11" font-weight="700">終点</text>`;
  strips.forEach((s,n)=>{const c=colors[n%colors.length],a=s.x-s.width/2,b=s.x+s.width/2, da=(y1-y0)*m; svg.innerHTML+=`<polygon points="${a},${y0} ${b},${y0} ${b+da},${y1} ${a+da},${y1}" fill="${c}" fill-opacity=".22" stroke="${c}" stroke-width="2"/><text x="${s.x+4}" y="${Math.min(imageHeight-6,y0+14)}" fill="${c}" font-size="12" font-weight="700">${n+1}</text>`});
  overlay.appendChild(svg);
  $('stripList').innerHTML=strips.map((s,n)=>`<label class="strip-row"><input type="checkbox" data-strip="${s.id}" ${s.selected?'checked':''}><i class="dot" style="background:${colors[n%colors.length]}"></i><span>短冊 ${n+1} <small>(${Math.round(s.x-s.width/2)}–${Math.round(s.x+s.width/2)} px)</small></span><button class="icon" data-remove="${s.id}">×</button></label>`).join('');
  document.querySelectorAll('[data-strip]').forEach(el=>el.onchange=()=>{strips.find(s=>s.id==el.dataset.strip).selected=el.checked;drawChart()});
  document.querySelectorAll('[data-remove]').forEach(el=>el.onclick=()=>{strips=strips.filter(s=>s.id!=el.dataset.remove);renderStrips();drawChart()});
}
function profile(strip) {
  const values=[], {start,end}=rangeY(), y0=Math.ceil(start), y1=Math.floor(end), m=slope();
  for(let y=y0;y<=y1;y++){let sum=0, center=strip.x+(y-start)*m, left=Math.max(0,Math.floor(center-strip.width/2)),right=Math.min(imageWidth,Math.ceil(center+strip.width/2));for(let x=left;x<right;x++)sum+=pixelIntensity((y*imageWidth+x)*4);values.push(sum)}
  return values;
}
function drawChart() {
  const canvas=$('chart'),ctx=canvas.getContext('2d'),W=canvas.width,H=canvas.height,p={l:54,r:18,t:18,b:36};
  ctx.clearRect(0,0,W,H); const selected=strips.filter(s=>s.selected), data=selected.map(profile), max=Math.max(1,...data.flat());
  ctx.font='12px system-ui';ctx.fillStyle='#687169';ctx.strokeStyle='#d8ddd5';
  for(let k=0;k<=4;k++){const y=p.t+(H-p.t-p.b)*k/4;ctx.beginPath();ctx.moveTo(p.l,y);ctx.lineTo(W-p.r,y);ctx.stroke();ctx.fillText(Math.round(max*(1-k/4)),6,y+4)}
  data.forEach((values,n)=>{const color=colors[strips.indexOf(selected[n])%colors.length];ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();values.forEach((v,i)=>{const x=p.l+i*(W-p.l-p.r)/(values.length-1),y=H-p.b-v/max*(H-p.t-p.b);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();results.filter(r=>r.strip===strips.indexOf(selected[n])+1).forEach(r=>{ctx.save();ctx.setLineDash([6,4]);ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();values.forEach((_,i)=>{const z=(i-r.mu)/r.fwhm,shape=r.model==='gaussian'?Math.exp(-4*Math.LN2*z*z):1/(1+4*z*z),v=r.base+r.amp*shape,x=p.l+i*(W-p.l-p.r)/(values.length-1),y=H-p.b-v/max*(H-p.t-p.b);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();ctx.restore()})});
  if(!selected.length){ctx.textAlign='center';ctx.fillText('短冊を選択してください',W/2,H/2);ctx.textAlign='left'}
}
function detectPeaks(values) {
  const min=Math.min(...values),max=Math.max(...values), threshold=min+(max-min)*(+$('peakThreshold').value/100), distance=+$('peakDistance').value, peaks=[];
  for(let i=1;i<values.length-1;i++) if(values[i]>=threshold&&values[i]>=values[i-1]&&values[i]>values[i+1]) { if(!peaks.length||i-peaks.at(-1)>distance)peaks.push(i); else if(values[i]>values[peaks.at(-1)])peaks[peaks.length-1]=i; }
  return peaks;
}
function fitPeak(values, peak, model) {
  const baseline=Math.min(...values), height=values[peak]-baseline;let l=peak,r=peak,half=baseline+height/2;
  while(l>0&&values[l]>half)l--;while(r<values.length-1&&values[r]>half)r++;
  const fwhm=Math.max(2,r-l), from=Math.max(0,Math.floor(peak-2.2*fwhm)),to=Math.min(values.length-1,Math.ceil(peak+2.2*fwhm));
  let n=0,sf=0,sff=0,sy=0,sfy=0, points=[];
  for(let x=from;x<=to;x++){const z=(x-peak)/fwhm,f=model==='gaussian'?Math.exp(-4*Math.LN2*z*z):1/(1+4*z*z);points.push([x,f]);n++;sf+=f;sff+=f*f;sy+=values[x];sfy+=f*values[x]}
  const amp=(n*sfy-sf*sy)/(n*sff-sf*sf), base=(sy-amp*sf)/n, mean=sy/n;let sse=0,sst=0;
  points.forEach(([x,f])=>{sse+=(values[x]-base-amp*f)**2;sst+=(values[x]-mean)**2});
  return {mu:peak,amp,base,fwhm,area:amp*fwhm*(model==='gaussian'?1.064467:Math.PI/2),r2:sst?1-sse/sst:1};
}
function runFit() {
  results=[]; const model=$('model').value, selected=strips.filter(s=>s.selected);
  selected.forEach(s=>{const values=profile(s);detectPeaks(values).forEach(peak=>results.push({strip:strips.indexOf(s)+1,model,...fitPeak(values,peak,model)}))});
  $('fitStatus').textContent=`${selected.length} 本の短冊から ${results.length} ピークを検出しました。破線でフィット曲線を表示しています。`; renderTable(); drawChart();
}
function renderTable() {
  if(!results.length){$('tableArea').className='status';$('tableArea').textContent='フィット結果がここに表示されます。';return}
  $('tableArea').className='';$('tableArea').innerHTML='<table><thead><tr><th>短冊</th><th>位置 (px)</th><th>Rf*</th><th>高さ</th><th>FWHM</th><th>面積</th><th>R²</th><th>関数</th></tr></thead><tbody>'+results.map(r=>`<tr><td>${r.strip}</td><td class="num">${r.mu.toFixed(1)}</td><td class="num">${(r.mu/(profile(strips[r.strip-1]).length-1)).toFixed(3)}</td><td class="num">${r.amp.toFixed(1)}</td><td class="num">${r.fwhm.toFixed(1)}</td><td class="num">${r.area.toFixed(1)}</td><td class="num">${r.r2.toFixed(3)}</td><td>${r.model}</td></tr>`).join('')+'</tbody></table>';
}
function baselineAt(i, length, values) {
  if (!baselinePoints.length) return Math.min(...values);
  const t = i / Math.max(1, length - 1), points = [...baselinePoints].sort((a,b)=>a.t-b.t);
  if (t <= points[0].t) return points[0].value;
  if (t >= points.at(-1).t) return points.at(-1).value;
  const right = points.findIndex(p=>p.t>=t), a=points[right-1], b=points[right];
  return a.value + (b.value-a.value) * (t-a.t) / (b.t-a.t);
}
function solveLinear(matrix, vector) {
  const n=vector.length, a=matrix.map((row,i)=>[...row,vector[i]]);
  for(let col=0;col<n;col++) { let pivot=col; for(let r=col+1;r<n;r++)if(Math.abs(a[r][col])>Math.abs(a[pivot][col]))pivot=r; if(Math.abs(a[pivot][col])<1e-9)return Array(n).fill(0); [a[col],a[pivot]]=[a[pivot],a[col]]; const d=a[col][col]; for(let j=col;j<=n;j++)a[col][j]/=d; for(let r=0;r<n;r++)if(r!==col){const f=a[r][col];for(let j=col;j<=n;j++)a[r][j]-=f*a[col][j]} }
  return a.map(row=>row[n]);
}
function mixtureEvaluation(values, centers, widths) {
  const n=centers.length, gram=Array.from({length:n},()=>Array(n).fill(0)), rhs=Array(n).fill(0), shapes=[];
  for(let i=0;i<values.length;i++){const row=centers.map((mu,k)=>Math.exp(-4*Math.LN2*((i-mu)/widths[k])**2)), target=values[i]-baselineAt(i,values.length,values); shapes.push(row); for(let j=0;j<n;j++){rhs[j]+=row[j]*target;for(let k=0;k<n;k++)gram[j][k]+=row[j]*row[k]}}
  const amplitudes=solveLinear(gram,rhs).map(v=>Math.max(0,v)); let sse=0,mean=values.reduce((a,b)=>a+b,0)/values.length,sst=0;
  const fitted=values.map((v,i)=>{const f=baselineAt(i,values.length,values)+shapes[i].reduce((sum,x,k)=>sum+x*amplitudes[k],0);sse+=(v-f)**2;sst+=(v-mean)**2;return f});
  return {amplitudes,fitted,sse,r2:sst?1-sse/sst:1};
}
function fitGaussianMixture(values, count, minimumDistance) {
  const baseline=values.map((_,i)=>baselineAt(i,values.length,values)), candidates=[];
  for(let i=1;i<values.length-1;i++)if(values[i]-baseline[i]>=values[i-1]-baseline[i-1]&&values[i]-baseline[i]>values[i+1]-baseline[i+1])candidates.push(i);
  candidates.sort((a,b)=>(values[b]-baseline[b])-(values[a]-baseline[a]));
  const centers=[]; for(const peak of candidates){if(centers.length===count)break;if(centers.every(c=>Math.abs(c-peak)>Math.max(2,minimumDistance)))centers.push(peak)}
  while(centers.length<count) centers.push((centers.length+1)*values.length/(count+1)); centers.sort((a,b)=>a-b);
  const widths=Array(count).fill(Math.max(3,values.length/(count*5))); let best=mixtureEvaluation(values,centers,widths), step=Math.max(2,values.length/(count*8));
  for(let iter=0;iter<18;iter++){for(let k=0;k<count;k++){for(const delta of [-step,step]){const trial=[...centers];trial[k]=Math.max(0,Math.min(values.length-1,trial[k]+delta));const score=mixtureEvaluation(values,trial,widths);if(score.sse<best.sse){centers.splice(0,count,...trial);best=score}} for(const delta of [-step,step]){const trial=[...widths];trial[k]=Math.max(2,Math.min(values.length/1.5,trial[k]+delta));const score=mixtureEvaluation(values,centers,trial);if(score.sse<best.sse){widths.splice(0,count,...trial);best=score}}} step*=.65}
  best=mixtureEvaluation(values,centers,widths);
  return {components:centers.map((mu,k)=>({mu,amp:best.amplitudes[k],fwhm:widths[k],area:best.amplitudes[k]*widths[k]*1.064467})).sort((a,b)=>a.mu-b.mu),fitted:best.fitted,r2:best.r2};
}
function drawChart() {
  const canvas=$('chart'),ctx=canvas.getContext('2d'),W=canvas.width,H=canvas.height,p={l:54,r:18,t:18,b:36},selected=strips.filter(s=>s.selected),data=selected.map(profile),max=Math.max(1,...data.flat());
  ctx.clearRect(0,0,W,H);ctx.font='12px system-ui';ctx.fillStyle='#687169';ctx.strokeStyle='#d8ddd5';
  for(let k=0;k<=4;k++){const y=p.t+(H-p.t-p.b)*k/4;ctx.beginPath();ctx.moveTo(p.l,y);ctx.lineTo(W-p.r,y);ctx.stroke();ctx.fillText(Math.round(max*(1-k/4)),6,y+4)}
  const xAt=i=>p.l+i*(W-p.l-p.r)/Math.max(1,data[0]?.length-1), yAt=v=>H-p.b-v/max*(H-p.t-p.b);
  if(data.length&&baselinePoints.length){ctx.strokeStyle='#39443e';ctx.setLineDash([3,3]);ctx.beginPath();data[0].forEach((_,i)=>{const x=xAt(i),y=yAt(baselineAt(i,data[0].length,data[0]));i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();ctx.setLineDash([]);baselinePoints.forEach(point=>{ctx.fillStyle='#39443e';ctx.beginPath();ctx.arc(p.l+point.t*(W-p.l-p.r),yAt(point.value),4,0,Math.PI*2);ctx.fill()})}
  data.forEach((values,n)=>{const stripNumber=strips.indexOf(selected[n])+1,color=colors[stripNumber-1%colors.length],fit=results.find(r=>r.strip===stripNumber);ctx.strokeStyle=colors[(stripNumber-1)%colors.length];ctx.lineWidth=2;ctx.beginPath();values.forEach((v,i)=>{const x=xAt(i),y=yAt(v);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();if(fit){ctx.save();ctx.setLineDash([6,4]);ctx.strokeStyle=colors[(stripNumber-1)%colors.length];ctx.beginPath();fit.fitted.forEach((v,i)=>{const x=xAt(i),y=yAt(v);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();ctx.restore()}});
  if(!selected.length){ctx.textAlign='center';ctx.fillText('短冊を選択してください',W/2,H/2);ctx.textAlign='left'}
}
function runFit() {
  const count=Math.max(1,Math.min(8,Math.round(+$('gaussianCount').value||1))),distance=Math.max(1,+$('peakDistance').value||1),selected=strips.filter(s=>s.selected);results=[];
  selected.forEach(s=>results.push({strip:strips.indexOf(s)+1,...fitGaussianMixture(profile(s),count,distance)}));
  $('fitStatus').textContent=`${selected.length} 本の短冊を ${count} 個の Gaussian の和で最適化しました。`;renderTable();drawChart();
}
function renderTable() {
  if(!results.length){$('tableArea').className='status';$('tableArea').textContent='フィット結果がここに表示されます。';return}
  const rows=results.flatMap(fit=>fit.components.map((c,i)=>`<tr><td>${fit.strip}</td><td>${i+1}</td><td class="num">${c.mu.toFixed(1)}</td><td class="num">${(c.mu/(fit.fitted.length-1)).toFixed(3)}</td><td class="num">${c.amp.toFixed(1)}</td><td class="num">${c.fwhm.toFixed(1)}</td><td class="num">${c.area.toFixed(1)}</td><td class="num">${fit.r2.toFixed(3)}</td></tr>`)).join('');
  $('tableArea').className='';$('tableArea').innerHTML=`<table><thead><tr><th>短冊</th><th>Gaussian</th><th>位置 (px)</th><th>Rf*</th><th>係数</th><th>FWHM</th><th>面積</th><th>全体 R²</th></tr></thead><tbody>${rows}</tbody></table>`;
}
$('file').onchange=e=>e.target.files[0]&&loadImage(e.target.files[0]);
$('invert').onchange=()=>{renderImage(); results=[]; renderTable()};
$('stripAngle').oninput=$('startY').oninput=$('endY').oninput=()=>{results=[]; renderTable(); renderImage()};
$('addStrip').onclick=()=>addStrip(imageWidth/2); $('clearStrips').onclick=()=>{strips=[];results=[];renderStrips();drawChart();renderTable()}; $('fit').onclick=runFit;
$('chart').onclick=e=>{
  const selected=strips.filter(s=>s.selected); if(!selected.length)return;
  const values=profile(selected[0]),canvas=e.currentTarget,r=canvas.getBoundingClientRect(),W=canvas.width,H=canvas.height,p={l:54,r:18,t:18,b:36},max=Math.max(1,...selected.map(profile).flat());
  const x=(e.clientX-r.left)*W/r.width,y=(e.clientY-r.top)*H/r.height,t=Math.max(0,Math.min(1,(x-p.l)/(W-p.l-p.r))),value=Math.max(0,(H-p.b-y)/(H-p.t-p.b)*max);
  baselinePoints.push({t,value}); baselinePoints.sort((a,b)=>a.t-b.t); results=[]; renderTable(); drawChart();
};
$('clearBaseline').onclick=()=>{baselinePoints=[];results=[];renderTable();drawChart()};
$('csv').onclick=()=>{if(!results.length)return;const rows=['Strip,Gaussian,Position_px,Rf,Coefficient,FWHM_px,Area,Overall_R2',...results.flatMap(fit=>fit.components.map((c,i)=>[fit.strip,i+1,c.mu.toFixed(2),(c.mu/(fit.fitted.length-1)).toFixed(4),c.amp.toFixed(2),c.fwhm.toFixed(2),c.area.toFixed(2),fit.r2.toFixed(4)].join(',')))],a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+rows.join('\n')],{type:'text/csv'}));a.download='tlc_gaussian_mixture_fit.csv';a.click()};
