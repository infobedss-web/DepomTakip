import assert from 'node:assert/strict';
const base='http://127.0.0.1:4000/api';
const health=await fetch(base+'/health');assert.equal(health.status,200);assert.equal((await health.json()).database,'PostgreSQL');
const expected={admin:'SUPER_ADMIN',bayi:'OWNER',sayim:'COUNTER',sayim2:'COUNTER',bilirkisi:'AUDITOR',misafir:'GUEST',ege:'OWNER'};
for(const [name,role] of Object.entries(expected)){
 const response=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:name+'@depomtakip.local',password:'DepomTakip!2026'})});
 assert.equal(response.status,200,name+' login');const login=await response.json();assert.equal(login.user.role,role);
 const cookie=response.headers.get('set-cookie').split(';')[0];const headers={cookie};
 assert.equal((await fetch(base+'/auth/me',{headers})).status,200);
 if(['COUNTER','AUDITOR'].includes(role)){
  for(const path of ['/stocks','/products','/dashboard','/audit-logs','/businesses','/warehouses','/locations','/users'])assert.equal((await fetch(base+path,{headers})).status,403,name+' '+path);
  const rooms=await fetch(base+'/rooms',{headers}).then(r=>r.json());
  for(const room of rooms){assert.equal((await fetch(base+'/rooms/'+room.id+'/report',{headers})).status,403);const detail=await fetch(base+'/rooms/'+room.id,{headers}).then(r=>r.json());assert.deepEqual(detail.items,[]);const progress=await fetch(base+'/count/progress/'+room.id,{headers}).then(r=>r.json());for(const payload of [room,detail,progress])assert.doesNotMatch(JSON.stringify(payload),/"(?:expected|physical|reserved|purchase_price|sale_price|unit_cost|value_difference)"/);}
 }
 assert.equal((await fetch(base+'/auth/logout',{method:'POST',headers})).status,200);
 assert.equal((await fetch(base+'/auth/me',{headers})).status,401);
 console.log('PASS '+name+'@depomtakip.local ('+role+'): login, role, logout'+(['COUNTER','AUDITOR'].includes(role)?', blind access boundaries':''));
}
console.log('PASS DepomTakip PostgreSQL health; tüm demo roller doğrulandı.');
