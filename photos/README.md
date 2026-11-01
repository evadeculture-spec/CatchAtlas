# Fotografias das albufeiras

Importador em lote: `scripts/photos/pipeline.ts`. Corre num ambiente com acesso às fontes.

## Fontes

| Fonte | Chave | Licenças aceites |
|---|---|---|
| Wikimedia Commons | não | CC0, domínio público, CC BY, CC BY-SA |
| Openverse | não | só `commercial,modification` |
| Flickr | `FLICKR_API_KEY` (variável de ambiente, nunca no código) | CC BY 2.0, CC BY-SA 2.0, sem restrições conhecidas, CC0, PDM |

Licenças NC, ND, GFDL-only ou desconhecidas são excluídas automaticamente.

## Comandos

```bash
NODE_USE_ENV_PROXY=1 npm run photos -- discover --dam orellana        # amostra
NODE_USE_ENV_PROXY=1 npm run photos -- discover                       # todas as barragens
NODE_USE_ENV_PROXY=1 npm run photos -- discover --resume              # retomar (salta fontes já concluídas)
npm run photos -- discover --sources commons,openverse --limit 20     # fontes e lote
npm run photos:gallery                                                # galeria de revisão em photos/review/index.html
# curadoria humana em photos/curation.json (chave do candidato)
npm run photos -- derive && npm run photos -- publish && npm run photos -- audit
npm run photos -- pending                                             # atualiza photos/pending.json
```

`NODE_USE_ENV_PROXY=1` só é necessário atrás de um proxy HTTPS.

## Ficheiros

- `candidates.json`: candidatos com fonte, autor, licença, página original, data de captação documentada, coordenadas, setor (só quando indicado pela fonte), adequação como capa e sugestão de identidade. Gravado a cada barragem; não duplica.
- `progress.json`: estado por barragem e fonte (permite retomar).
- `pending.json`: barragens sem capa publicada e o motivo.
- `curation.json`: decisões humanas; nunca sobrescrito.
- `manual-candidates.json`, `web-leads.json`: candidatos fornecidos e pistas da pesquisa web, por verificar.
- `review/index.html`: galeria de revisão, regenerável com `npm run photos:gallery`.
- `runs/`: registo de cada execução.

Nada é publicado sem identidade confirmada, direitos aprovados e publicação marcados na curadoria. A capa privilegia fotografias horizontais da água e da margem; paredões, vistas aéreas, ecrãs e texto são penalizados.
