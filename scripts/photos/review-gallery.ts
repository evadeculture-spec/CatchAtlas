// Gera photos/review/index.html: galeria de revisão (local, não publicada) com candidatos,
// candidatos manuais, pistas da pesquisa web e motivo de cada pendente.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { DAMS } from '../../src/data/dams'
import type { PhotoCatalog } from '../../src/data/photos/types'
import type { Candidate } from './pipeline'

const root = new URL('../../photos/', import.meta.url)
const read = <T,>(f: string, d: T): T => (existsSync(new URL(f, root)) ? JSON.parse(readFileSync(new URL(f, root), 'utf8')) : d)
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

const { candidates } = read<{ candidates: Candidate[] }>('candidates.json', { candidates: [] })
const manual = read<{ candidates: { damId: string; file: string; provenance: string; rights: string; identityBasis: string; visualNotes: string }[] }>('manual-candidates.json', { candidates: [] })
const leads = read<{ leads: { damId: string; url: string | null; note: string }[] }>('web-leads.json', { leads: [] })
const pending = read<{ pending: { damId: string; reason: string }[] }>('pending.json', { pending: [] })
const catalog = JSON.parse(readFileSync(new URL('../src/data/photos/catalog.json', root), 'utf8')) as PhotoCatalog

const sections = DAMS.map((d) => {
  const cs = candidates.filter((c) => c.damId === d.id)
  const pub = catalog.links.filter((l) => l.damId === d.id)
  const man = manual.candidates.filter((m) => m.damId === d.id)
  const ld = leads.leads.filter((l) => l.damId === d.id)
  const reason = pending.pending.find((p) => p.damId === d.id)?.reason
  const status = pub.some((l) => l.role === 'capa') ? '<b class="ok">Com capa publicada</b>' : `<b class="warn">Pendente</b> — ${esc(reason ?? 'Ainda não processada')}`
  const cards = cs
    .map(
      (c) => `<figure><img loading="lazy" src="${esc(c.originalFileUrl)}" alt="${esc(c.title)}"><figcaption>
      <b>${esc(c.title)}</b><br>${esc(c.source)} · <a href="${esc(c.sourcePageUrl)}" target="_blank" rel="noopener">página original</a><br>
      ${esc(c.author)} · ${esc(c.licenseName)} (${esc(c.auto.rights)})<br>
      Identidade: ${esc(c.auto.identity)} (${c.auto.identityScore}) — ${esc(c.auto.identityEvidence.join('; '))}<br>
      Capa: ${c.suitability.score} — ${esc(c.suitability.notes.join(', '))}<br>Captada: ${esc(c.capturedAt ?? 'não documentado')} · ${c.width}×${c.height}<br><code>${esc(c.key)}</code></figcaption></figure>`,
    )
    .join('')
  const manualHtml = man.map((m) => `<li>Candidato manual (${esc(m.file)}): ${esc(m.provenance)} <i>Direitos: ${esc(m.rights)}.</i> ${esc(m.visualNotes)}</li>`).join('')
  const leadsHtml = ld.map((l) => `<li>${l.url ? `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.url)}</a> — ` : ''}${esc(l.note)}</li>`).join('')
  return `<section id="${d.id}"><h2>${esc(d.name)} <small>${esc(d.place)} · ${esc(d.river)} · ${d.country}</small></h2><p>${status}</p>
    ${cards ? `<div class="grid">${cards}</div>` : ''}${manualHtml || leadsHtml ? `<ul>${manualHtml}${leadsHtml}</ul>` : ''}</section>`
})

const html = `<!doctype html><html lang="pt-PT"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Revisão de fotografias — CatchAtlas</title>
<style>body{font:14px/1.45 system-ui,sans-serif;margin:0 auto;max-width:1200px;padding:16px;color:#172c36;background:#f4f7f8}
h1{font-size:24px}h2{font-size:18px;margin:28px 0 4px}small{font-weight:400;color:#566a73}.ok{color:#0b7a6c}.warn{color:#7d5200}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}figure{margin:0;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px #0002}
img{width:100%;aspect-ratio:3/2;object-fit:cover;background:#dde5e8;display:block}figcaption{padding:8px 10px;font-size:12px}code{font-size:11px}</style>
<h1>Revisão de fotografias — ${DAMS.length} barragens</h1>
<p>Galeria local para curadoria. Nada aqui está publicado. Para aprovar, registar a decisão em <code>photos/curation.json</code> com a chave do candidato.</p>
${sections.join('\n')}</html>`
mkdirSync(new URL('review/', root), { recursive: true })
writeFileSync(new URL('review/index.html', root), html)
console.log(`photos/review/index.html: ${DAMS.length} barragens, ${candidates.length} candidatos, ${manual.candidates.length} manuais, ${leads.leads.length} pistas`)
