# AtlasCatch — demonstração

Protótipo navegável de uma aplicação de pesca desportiva em barragens de Portugal e Espanha: descobrir barragens, preparar jornadas, registar capturas, rankings, provas e comunidade (reports com mapa de pings, chat global de subscritores, marketplace e giveaway).

> Demonstração — dados ilustrativos. Perfis, capturas de terceiros, provas, rankings e condições meteorológicas são fictícios. As imagens das barragens são ilustrações SVG geradas no código, e não fotografias.

## Executar localmente

```bash
npm install
npm run dev        # http://localhost:5173
npm run lint
npm run typecheck
npm run build      # gera dist/
npm run preview    # serve dist/ em http://localhost:4173
```

Requer Node 20 ou superior (testado com Node 22).

## Publicar na Vercel

O `vercel.json` define o build (`npm run build`), a pasta `dist` e o rewrite de SPA. Ligando o repositório a um projeto Vercel, cada push para `master` publica uma nova versão.

## Publicar na Netlify

O `netlify.toml` já define o build (`npm run build`), a pasta `dist` e o rewrite de SPA (`/* → /index.html`), para que as rotas internas abram diretamente.

```bash
npx netlify-cli login
npx netlify-cli deploy            # preview
npx netlify-cli deploy --prod     # produção
```

Em alternativa, pode ligar o repositório em app.netlify.com: as definições são lidas do `netlify.toml`.

## Versão num único ficheiro

`npm run build:artifact` gera `dist-artifact/atlascatch.html`, um ficheiro com tudo incluído, router em hash e sem service worker. Abre em qualquer navegador sem servidor.

## Estrutura

- `src/config/brand.ts` — nome, assinatura, etiqueta de demonstração, giveaway (mensal/semanal) e subscrição (substituir aqui).
- `src/data/` — barragens, espécies, perfis, capturas e provas de demonstração.
- `src/lib/` — datas, formatação, meteorologia simulada, regras de sugestão, rankings e fotografias (IndexedDB).
- `src/state/` — estado global persistido em `localStorage` e toasts.
- `src/components/` — componentes reutilizáveis (navegação, cartões, gráficos, mapa esquemático, ilustrações).
- `src/screens/` — ecrãs.
- `public/` — manifesto PWA, ícones e service worker (cache básico do shell).

## Notas

- As datas são relativas ao dia em que a demonstração é aberta. Numa nova sessão do navegador avançam para o dia corrente.
- As fotografias são comprimidas (até 1400 px, JPEG) e guardadas em IndexedDB. Os restantes dados ficam em `localStorage`.
- O mapa é esquemático (Portugal e Península Ibérica), com posições aproximadas, e não serve para navegação. Os pings dos reports usam uma posição aproximada dentro da barragem.
- A subscrição é simulada: não há pagamentos. O chat, os anúncios e os reports de terceiros são fictícios; os do utilizador ficam apenas no navegador.
- Os ícones PNG foram gerados com `scripts/make-icons.mjs` (Playwright).
