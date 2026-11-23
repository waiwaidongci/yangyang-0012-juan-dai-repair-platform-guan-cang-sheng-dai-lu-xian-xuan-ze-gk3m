import {h,badge,empty} from '/base.js'
export const kinds={master:'保存母版',access:'访问副本'}
export const checkStages={queued:'待核验',accepted:'质检通过',failed:'需重制'}
const packageStages={current:'现用包',replaced:'已替换',rejected:'已退回',superseded:'落选'}
const when=value=>new Date(value).toLocaleString('zh-CN',{hour12:false})
const short=digest=>h(String(digest??'').slice(0,12))+'…'

export function results(checks,reviewer) {
  return checks.map(row=>`<article class="audio-qc"><header><h3>${h(row.filename)}</h3>${badge(checkStages[row.stage])}</header>
    <p>${h(row.reel)} / 工序卡 #${row.card} · ${kinds[row.kind]}</p>
    <div class="audio-measures"><b>${h(row.sample_rate)} Hz</b><span>${h(row.channels)} 声道</span><span>${h(row.duration_seconds)} s</span><span>${row.clipped_frames} 削波帧</span></div>
    ${row.kind==='access'&&row.source_derivative?`<p class="audio-source">取用母版 ${h(row.source_filename??'#'+row.source_derivative)} · 登记源校验值 ${short(row.source_digest)}</p>`:''}
    ${row.failed_rules.length?`<ul>${row.failed_rules.map(reason=>`<li>${h(reason)}</li>`).join('')}</ul>`:''}
    <details><summary>文件校验</summary><dl><dt>登记 SHA-256</dt><dd>${h(row.expected_digest)}</dd><dt>实测 SHA-256</dt><dd>${h(row.measured_digest)}</dd>
    ${row.kind==='access'&&row.source_digest?`<dt>登记源校验值</dt><dd>${h(row.source_digest)}</dd>`:''}</dl></details>
    ${reviewer&&row.stage==='queued'?`<form data-operation="verify" data-id="${row.id}"><button>应用入档质检规则</button><p role="status"></p></form>`:''}</article>`).join('')||empty('工序卡签发后可登记首个待验派生件。')
}

export function currentPackages(packs) {
  return packs.filter(row=>row.stage==='current').map(row=>`<article class="package-card">
    <header><h3>${h(row.reel)} · 包 #${row.id}</h3>${badge(packageStages.current)}</header>
    <div class="package-pair"><section><h4>保存母版</h4><p><strong>${h(row.master_filename)}</strong></p>
      <p>出自工序样段 ${h(row.master_excerpt)}</p><dl><dt>实测 SHA-256</dt><dd>${h(row.master_digest)}</dd></dl></section>
    <section><h4>访问副本</h4><p><strong>${h(row.copy_filename)}</strong></p>
      <p>出自工序样段 ${h(row.copy_excerpt)}</p><dl><dt>实测 SHA-256</dt><dd>${h(row.copy_digest)}</dd>
      <dt>取用母版</dt><dd>${h(row.source_filename??'—')}</dd><dt>登记源校验值</dt><dd>${h(row.source_digest??'—')}</dd></dl></section></div>
    <p class="package-meta">${h(row.requested_by)} · ${when(row.requested_at)} 整包切换生效</p></article>`).join('')
    ||empty('尚无现用归档包。母版与访问副本双双通过质检后可发起换包。')
}

export function packageHistory(packs) {
  return packs.map(row=>`<article class="package-card compact">
    <header><h3>${h(row.reel)} · 包 #${row.id}</h3>${badge(packageStages[row.stage])}</header>
    <p>母版 ${h(row.master_filename)} ＋ 副本 ${h(row.copy_filename)}</p>
    <p class="package-meta">基于${row.base_package?`包 #${row.base_package}`:'空档'} · ${h(row.requested_by)} · ${when(row.requested_at)}</p>
    ${row.conclusion?`<p class="package-conclusion">${h(row.conclusion)}</p>`:''}</article>`).join('')
    ||empty('尚无换包申请。')
}
