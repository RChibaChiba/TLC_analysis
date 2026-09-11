const $ = id => document.getElementById(id);
const colors = ['#e35d4f','#276f9e','#8e5caf','#d68c25','#23856c','#ba4b82'];
let pixels, imageWidth, imageHeight, strips = [], results = [], nextId = 1;
const sourceCanvas = document.createElement('canvas');
const sourceContext = sourceCanvas.getContext('2d', {willReadFrequently:true});

function loadImage(file) {
  const image = new Image();
  image.onload = () => {
    const scale = Math.min(1, 1200 / image.width);
    imageWidth = sourceCanvas.width = Math.round(image.width * scale);
    imageHeight = sourceCanvas.height = Math.round(image.height * scale);
    sourceContext.drawImage(image, 0, 0, imageWidth, imageHeight);
    pixels = sourceContext.getImageData(0, 0, imageWidth, imageHeight).data;
    strips = []; results = []; renderImage(); renderTable();
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
  $('imageCanvas').onclick=e=>{const r=e.currentTarget.getBoundingClientRect(); addStrip((e.clientX-r.left)*imageWidth/r.width)};
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
  strips.forEach((s,n)=>{const el=document.createElement('div'); el.className='strip'; el.style.cssText=`--c:${colors[n%colors.length]};left:${100*(s.x-s.width/2)/imageWidth}%;width:${100*s.width/imageWidth}%`; el.innerHTML='<span>'+(n+1)+'</span>'; overlay.appendChild(el)});
  $('stripList').innerHTML=strips.map((s,n)=>`<label class="strip-row"><input type="checkbox" data-strip="${s.id}" ${s.selected?'checked':''}><i class="dot" style="background:${colors[n%colors.length]}"></i><span>短冊 ${n+1} <small>(${Math.round(s.x-s.width/2)}–${Math.round(s.x+s.width/2)} px)</small></span><button class="icon" data-remove="${s.id}">×</button></label>`).join('');
  document.querySelectorAll('[data-strip]').forEach(el=>el.onchange=()=>{strips.find(s=>s.id==el.dataset.strip).selected=el.checked;drawChart()});
  document.querySelectorAll('[data-remove]').forEach(el=>el.onclick=()=>{strips=strips.filter(s=>s.id!=el.dataset.remove);renderStrips();drawChart()});
}
function profile(strip) {
  const values=[], left=Math.max(0,Math.floor(strip.x-strip.width/2)), right=Math.min(imageWidth,Math.ceil(strip.x+strip.width/2));
  for(let y=0;y<imageHeight;y++){let sum=0;for(let x=left;x<right;x++)sum+=pixelIntensity((y*imageWidth+x)*4);values.push(sum)}
  return values;
}
function drawChart() {
  const canvas=$('chart'),ctx=canvas.getContext('2d'),W=canvas.width,H=canvas.height,p={l:54,r:18,t:18,b:36};
  ctx.clearRect(0,0,W,H); const selected=strips.filter(s=>s.selected), data=selected.map(profile), max=Math.max(1,...data.flat());
  ctx.font='12px system-ui';ctx.fillStyle='#687169';ctx.strokeStyle='#d8ddd5';
  for(let k=0;k<=4;k++){const y=p.t+(H-p.t-p.b)*k/4;ctx.beginPath();ctx.moveTo(p.l,y);ctx.lineTo(W-p.r,y);ctx.stroke();ctx.fillText(Math.round(max*(1-k/4)),6,y+4)}
  data.forEach((values,n)=>{ctx.strokeStyle=colors[strips.indexOf(selected[n])%colors.length];ctx.lineWidth=2;ctx.beginPath();values.forEach((v,i)=>{const x=p.l+i*(W-p.l-p.r)/(values.length-1),y=H-p.b-v/max*(H-p.t-p.b);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke()});
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
  selected.forEach(s=>{const values=profile(s);detectPeaks(values).forEach(peak=>results.push({strip:strips.indexOf(s)+1,...fitPeak(values,peak,model)}))});
  $('fitStatus').textContent=`${selected.length} 本の短冊から ${results.length} ピークを検出しました。`; renderTable();
}
function renderTable() {
  if(!results.length){$('tableArea').className='status';$('tableArea').textContent='フィット結果がここに表示されます。';return}
  $('tableArea').className='';$('tableArea').innerHTML='<table><thead><tr><th>短冊</th><th>位置 (px)</th><th>Rf*</th><th>高さ</th><th>FWHM</th><th>面積</th><th>R²</th><th>関数</th></tr></thead><tbody>'+results.map(r=>`<tr><td>${r.strip}</td><td class="num">${r.mu.toFixed(1)}</td><td class="num">${(r.mu/(imageHeight-1)).toFixed(3)}</td><td class="num">${r.amp.toFixed(1)}</td><td class="num">${r.fwhm.toFixed(1)}</td><td class="num">${r.area.toFixed(1)}</td><td class="num">${r.r2.toFixed(3)}</td><td>${$('model').value}</td></tr>`).join('')+'</tbody></table>';
}
$('file').onchange=e=>e.target.files[0]&&loadImage(e.target.files[0]);
$('invert').onchange=()=>{renderImage(); results=[]; renderTable()};
$('addStrip').onclick=()=>addStrip(imageWidth/2); $('clearStrips').onclick=()=>{strips=[];results=[];renderStrips();drawChart();renderTable()}; $('fit').onclick=runFit;
$('csv').onclick=()=>{if(!results.length)return;const rows=['Strip,Position_px,Rf,Height,FWHM_px,Area,R2,Model',...results.map(r=>[r.strip,r.mu.toFixed(2),(r.mu/(imageHeight-1)).toFixed(4),r.amp.toFixed(2),r.fwhm.toFixed(2),r.area.toFixed(2),r.r2.toFixed(4),$('model').value].join(','))],a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+rows.join('\n')],{type:'text/csv'}));a.download='tlc_peak_fit.csv';a.click()};
