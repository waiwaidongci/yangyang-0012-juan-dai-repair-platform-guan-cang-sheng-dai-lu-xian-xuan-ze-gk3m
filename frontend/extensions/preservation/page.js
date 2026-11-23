import {api,h} from '/base.js'
import {option,wireForms} from '/workflow-ui.js'
import {kinds,checkStages,results,currentPackages,packageHistory} from './quality-sheet.js'

const endpoint='/api/tape-preservation'
const note=flash=>flash?`<p role="status" data-type="${flash.failure?'error':'success'}">${h(flash.text??flash)}</p>`:''

export async function render(outlet,user,flash='') {
  const {work,checks,packages:packs}=await api(endpoint)
  if (!outlet.isConnected) return
  const authorised=work.filter(row=>row.stage==='authorised')
  const accepted=checks.filter(row=>row.stage==='accepted')
  const masters=accepted.filter(row=>row.kind==='master')
  const copies=accepted.filter(row=>row.kind==='access')
  const switchReels=[...new Set(masters.map(row=>row.reel))].filter(reel=>copies.some(row=>row.reel===reel))
  const canSwitch=(user.role==='operator'||user.role==='reviewer')&&switchReels.length>0
  outlet.innerHTML=`${note(flash)}<h1>派生件入档质检</h1><p>把离线采集清单、实测文件指标与已签工序卡绑定。母版与访问副本分开质检，双双通过后整包一次性切换。</p>
    <div class="package-grid"><section><h2>现用归档包</h2>${currentPackages(packs)}</section>
    <aside class="audio-intake"><h2>发起换包</h2>${canSwitch?`<form data-operation="switch">
    <label>馆藏卷<select name="reel">${switchReels.map(reel=>option(reel,reel)).join('')}</select></label>
    <label>保存母版<select name="master"></select></label>
    <label>访问副本<select name="access_copy"></select></label>
    <input type="hidden" name="base_package"><p class="muted" data-base-note></p>
    <button>提交换包申请</button><p role="status"></p></form>`:'<p>同卷母版与访问副本均通过质检后，可在此申请整包切换。基于同一现用包的并发申请只生效一份，落选与退回均留结论。</p>'}</aside></div>
    <section class="package-trail"><h2>换包记录</h2>${packageHistory(packs)}</section>
    <div class="audio-grid"><section><h2>入档检验簿</h2>${results(checks,user.role==='reviewer')}</section>
    <aside class="audio-intake"><h2>录入检测清单</h2>${user.role==='operator'&&authorised.length?`<form data-operation="add">
    <label>工序卡<select name="card">${authorised.map(row=>option(row.id,row.excerpt+' · '+row.target_seconds+' s / '+row.target_channels+' 声道')).join('')}</select></label>
    <label>入档用途<select name="kind">${Object.entries(kinds).map(([key,label])=>option(key,label)).join('')}</select></label>
    <div data-source-fields hidden><label>取用母版<select name="source_derivative"></select></label>
    <label>登记源校验值<input name="source_digest" pattern="[a-f0-9]{64}"></label></div>
    <label>数字文件名<input name="filename" placeholder="YT26_V2.wav" required></label>
    <div class="audio-settings"><label>时长秒数<input type="number" name="duration_seconds" step=".01" min=".01" required></label>
    <label>采样率<select name="sample_rate">${[44100,48000,96000,192000].map(n=>option(n,n)).join('')}</select></label>
    <label>声道<select name="channels"><option>1</option><option>2</option></select></label><label>削波帧<input type="number" min="0" name="clipped_frames" value="0" required></label></div>
    <label>预期校验值<input name="expected_digest" pattern="[a-f0-9]{64}" required></label><label>实测校验值<input name="measured_digest" pattern="[a-f0-9]{64}" required></label>
    <button>提交质检</button><p role="status"></p></form>`:'<p>具有采集规格的工序卡签发后，由录入员补录检测结果。质检的母版与访问副本采用各自采样率政策，副本送检须登记取用的母版及校验值。</p>'}</aside></div>`
  const addForm=outlet.querySelector('form[data-operation=add]')
  if (addForm) {
    const kindPicker=addForm.elements.kind
    const sourceFields=addForm.querySelector('[data-source-fields]')
    const sourcePicker=addForm.elements.source_derivative
    const digestInput=addForm.elements.source_digest
    const fillDigest=()=>{
      const picked=checks.find(row=>row.id===Number(sourcePicker.value))
      digestInput.value=picked?picked.measured_digest:''
    }
    const refreshSource=()=>{
      const access=kindPicker.value==='access'
      sourceFields.hidden=!access
      sourcePicker.required=access
      digestInput.required=access
      const reel=work.find(row=>row.id===Number(addForm.elements.card.value))?.reel
      const pool=checks.filter(row=>row.kind==='master'&&row.reel===reel)
      sourcePicker.innerHTML=pool.map(row=>option(row.id,`${row.filename} · ${checkStages[row.stage]}`)).join('')||'<option value="">该卷暂无母版记录</option>'
      fillDigest()
    }
    kindPicker.onchange=refreshSource
    addForm.elements.card.onchange=refreshSource
    sourcePicker.onchange=fillDigest
    refreshSource()
  }
  const switchForm=outlet.querySelector('form[data-operation=switch]')
  if (switchForm) {
    const masterPicker=switchForm.elements.master
    const copyPicker=switchForm.elements.access_copy
    const baseInput=switchForm.elements.base_package
    const baseNote=switchForm.querySelector('[data-base-note]')
    const refreshSwitch=()=>{
      const reel=switchForm.elements.reel.value
      masterPicker.innerHTML=masters.filter(row=>row.reel===reel).map(row=>option(row.id,`${row.filename} · 实测 ${row.measured_digest.slice(0,12)}…`)).join('')
      copyPicker.innerHTML=copies.filter(row=>row.reel===reel).map(row=>option(row.id,`${row.filename} · 源 ${String(row.source_digest).slice(0,12)}…`)).join('')
      const current=packs.find(row=>row.reel===reel&&row.stage==='current')
      baseInput.value=current?current.id:''
      baseNote.textContent=current?`基于现用包 #${current.id}`:'该卷尚无现用包，两件通过质检后此申请将建立首包'
    }
    switchForm.elements.reel.onchange=refreshSwitch
    refreshSwitch()
  }
  wireForms(outlet,next=>render(outlet,user,next),{
    add: values=>{
      const body={...values,channels:Number(values.channels),sample_rate:Number(values.sample_rate)}
      if (body.kind==='access') body.source_derivative=Number(body.source_derivative)
      else {delete body.source_derivative;delete body.source_digest}
      return {path:endpoint+'/derivatives',body}
    },
    verify: (_values,form)=>({path:`${endpoint}/derivatives/${form.dataset.id}/verify`,body:{}}),
    switch: values=>({path:endpoint+'/switches',
      body:{reel:values.reel,master:Number(values.master),access_copy:Number(values.access_copy),
        base_package:values.base_package?Number(values.base_package):null},
      flash: row=>row.stage==='current'?'两件均通过质检，已整包切换为现用包。':{text:`未切换：${row.conclusion}`,failure:true}})
  })
}
