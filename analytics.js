let scoreChart=null, distChart=null;

export function renderScoreChart(canvas, attempts){
  const labels = attempts.map(a=> new Date(a.timestamp).toLocaleString());
  const data = attempts.map(a=> Math.round((a.score/a.total)*100));
  if(scoreChart) scoreChart.destroy();
  scoreChart = new Chart(canvas, {
    type:'line',
    data:{ labels, datasets:[{ label:'Score %', data, tension:0.3 }]},
    options:{ scales:{ y:{ min:0, max:100 } } }
  });
}

export function renderDistributionChart(canvas, attempts){
  const buckets=[0,0,0,0,0]; // 0-20,20-40,40-60,60-80,80-100
  attempts.forEach(a=>{
    const p=(a.score/a.total)*100;
    if(p>=80) buckets[4]++; else if(p>=60) buckets[3]++; else if(p>=40) buckets[2]++; else if(p>=20) buckets[1]++; else buckets[0]++;
  });
  if(distChart) distChart.destroy();
  distChart = new Chart(canvas, {
    type:'bar',
    data:{ labels:['0-20','20-40','40-60','60-80','80-100'], datasets:[{ label:'Attempts', data:buckets }]},
  });
}
