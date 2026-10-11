'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os');
const skills=require('./lib/skill-packages.cjs');
const day=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function bounded(url,fetcher,limit){const r=await fetcher(url,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'laoyu-skill-updater','Accept':'application/vnd.github+json'},cache:'no-store'});if(!r.ok)throw Error('Update HTTP '+r.status);let size=0;const chunks=[];for await(const chunk of r.body){size+=chunk.length;if(size>limit)throw Error('Update response too large');chunks.push(Buffer.from(chunk));}return Buffer.concat(chunks);}
async function runUpdate(directory,{fetcher=fetch,force=false,date=day()}={}){
 const spec=Object.entries(skills.SPECS).find(([,s])=>s.directory===path.basename(directory));if(!spec)throw Error('Unregistered Skill');const [id,s]=spec,root=path.dirname(directory);
 if(fs.existsSync(path.join(directory,'.git')))return {status:'checkout'};
 skills.recover(id,root);const state=skills.updateState(id,root);if(state.enabled===false)return {status:'disabled'};if(!force&&state.lastAttemptDay===date)return {status:'already-checked'};
 skills.updateState(id,root,{lastAttemptDay:date,lastStatus:'checking'});
 let temp;
 try{
  const marker=path.join(directory,'.laoyu-skill.json');if(!fs.existsSync(marker)){
   const manifest=JSON.parse(fs.readFileSync(path.join(directory,'skill-package.json'),'utf8'));
   if(manifest.directory!==s.directory||manifest.repository!==s.repo||manifest.schemaVersion!==1)throw Error('Unmanaged package');
   const files={...manifest.files,'skill-package.json':hash(fs.readFileSync(path.join(directory,'skill-package.json')))},old={schemaVersion:1,id,repository:s.repo,directory:s.directory,version:manifest.version,sha256:files['skill-package.json'],files};skills.verifyLocal(id,directory,old);fs.writeFileSync(marker,JSON.stringify(old),{flag:'wx'});
  }
  const old=JSON.parse(fs.readFileSync(marker,'utf8'));skills.verifyLocal(id,directory,old);
  const release=JSON.parse((await bounded('https://api.github.com/repos/'+s.repo+'/releases/latest',fetcher,512*1024)).toString());
  if(release.draft||release.prerelease||!/^v?\d+\.\d+\.\d+$/.test(release.tag_name))throw Error('Invalid formal release');
  const version=release.tag_name.replace(/^v/,''),a=version.split('.').map(Number),b=old.version.split('.').map(Number);let newer=false;for(let i=0;i<3;i++){if(a[i]!==b[i]){newer=a[i]>b[i];break;}}
  if(!newer){skills.updateState(id,root,{lastSuccessDay:date,lastStatus:'current'});return {status:'current'};}
  const matches=release.assets.filter(a=>a.name===s.asset);if(matches.length!==1)throw Error('Missing unique stable asset');const asset=matches[0],sha=asset.digest?.replace(/^sha256:/,'');
  const url='https://github.com/'+s.repo+'/releases/download/'+release.tag_name+'/'+s.asset;
  if(!/^[a-f0-9]{64}$/.test(sha||'')||asset.browser_download_url!==url||asset.size>8*1024*1024)throw Error('Invalid asset identity or hash');
  const bytes=await bounded(url,fetcher,8*1024*1024);if(hash(bytes)!==sha||bytes.length!==asset.size)throw Error('SHA-256 or size mismatch');
  temp=fs.mkdtempSync(path.join(os.tmpdir(),'laoyu-skill-download-'));const file=path.join(temp,s.asset);fs.writeFileSync(file,bytes);
  const result=await skills.install(id,{file,version,sha256:sha},root);skills.updateState(id,root,{lastSuccessDay:date,lastStatus:'updated',version});return {status:'updated',version,backup:result.backup};
 }catch(error){skills.updateState(id,root,{lastStatus:'kept-old'});return {status:'kept-old',reason:error.message};}
 finally{if(temp)fs.rmSync(temp,{recursive:true,force:true});}
}
module.exports={runUpdate};
if(require.main===module){const directory=path.resolve(__dirname,'..');const id=Object.keys(skills.SPECS).find(id=>skills.SPECS[id].directory===path.basename(directory));if(process.argv.includes('--disable')||process.argv.includes('--enable')){skills.updateState(id,path.dirname(directory),{enabled:process.argv.includes('--enable')});}else if(process.argv.includes('--rollback')){skills.rollback(id,path.dirname(directory)).then(r=>console.log('ROLLED BACK '+r.version)).catch(e=>{console.error(e.message);process.exitCode=1;});}else runUpdate(directory,{force:process.argv.includes('--force')}).then(r=>{if(r.status==='updated')console.log('UPDATED '+r.version);if(process.argv.includes('--verbose'))console.log(JSON.stringify(r));}).catch(()=>{});}
