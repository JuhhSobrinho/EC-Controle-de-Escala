/* ── AuthController: splash/login leve ──
   Verifica usuário/senha chamando a função login_check (RPC) no Supabase, que roda a
   comparação dentro do banco (SECURITY DEFINER) e devolve só true/false — a senha nunca
   é lida de volta pelo cliente, e a tabela `users` fica travada por RLS pro papel anon.
   Isso é uma trava de UI (impede abrir o app sem logar), não uma proteção real dos dados:
   quem chamar a API do Supabase direto com a anon key ainda tem acesso normal às tabelas
   `tecnicos`/`escala`, que não mudaram. Login persiste no navegador (localStorage) até
   clicar em Sair. */
var AUTH_KEY = 'ec_auth_user';

function isLoggedIn(){
  return !!localStorage.getItem(AUTH_KEY);
}

function showLoginSplash(){
  document.getElementById('loginSplash').classList.add('open');
  document.getElementById('loginUser').focus();
}
function hideLoginSplash(){
  document.getElementById('loginSplash').classList.remove('open');
}

async function doLogin(){
  var user=document.getElementById('loginUser').value.trim();
  var pass=document.getElementById('loginPass').value;
  var errEl=document.getElementById('loginError');
  var btn=document.getElementById('loginBtn');
  errEl.textContent='';
  if(!user||!pass){ errEl.textContent='Preencha usuário e senha'; return; }

  btn.disabled=true; btn.textContent='Entrando...';
  try{
    var res=await supabaseClient.rpc('login_check',{p_nome_user:user,p_password:pass});
    if(res.error) throw res.error;
    if(res.data===true){
      localStorage.setItem(AUTH_KEY,user);
      hideLoginSplash();
      document.getElementById('loginPass').value='';
      bootApp();
    }else{
      errEl.textContent='Usuário ou senha incorretos';
    }
  }catch(e){
    console.error('doLogin',e);
    errEl.textContent='Erro ao verificar login: '+e.message;
  }finally{
    btn.disabled=false; btn.textContent='Entrar';
  }
}

function logout(){
  localStorage.removeItem(AUTH_KEY);
  location.reload();
}

function initAuth(){
  if(isLoggedIn()) bootApp();
  else showLoginSplash();
}
