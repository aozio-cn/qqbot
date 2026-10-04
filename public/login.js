function doLogin(){
  var u=document.getElementById('username').value;
  var p=document.getElementById('password').value;
  var err=document.getElementById('error');
  err.style.display='none';
  fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})})
  .then(function(r){return r.json().then(function(d){return {ok:r.ok,d:d};});})
  .then(function(res){
    if(res.ok&&res.d.token){localStorage.setItem('token',res.d.token);location.href='/';}
    else{err.textContent=res.d.error||'登录失败';err.style.display='block';}
  })
  .catch(function(){err.textContent='网络错误';err.style.display='block';});
}
document.getElementById('password').addEventListener('keydown',function(e){if(e.key==='Enter')doLogin();});
