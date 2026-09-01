# Sincronização com a Nuvem — programa de desktop (Windows)

Programa separado, roda sozinho (sem navegador), que sincroniza uma pasta
do computador com a Nuvem do sistema "Gestão de Controle dos Contratos".
Fica com ícone na bandeja do sistema (perto do relógio) e sincroniza a
cada 20 segundos, enquanto o computador estiver ligado.

## Estrutura

- `src/sync-engine.js` — a lógica de sincronização em si (mesma lógica já
  usada na versão do navegador, adaptada pra usar arquivo de verdade do
  Windows em vez da API do navegador). Tem testes automatizados.
- `src/api-client.js` — fala com o servidor (login, listar/baixar/enviar
  arquivo da Nuvem), sem depender de nenhum pacote do tRPC.
- `src/store.js` — guarda as configurações e o token de acesso, este
  último criptografado com a API de segurança do Windows (a mesma que
  protege senhas salvas no navegador).
- `src/main.js` — processo principal do Electron: ícone da bandeja, ciclo
  de sincronização, abre as janelas.
- `src/login.html` / `src/settings.html` (+ seus `-preload.js` e
  `-renderer.js`) — as duas telas do programa.

## Rodar em desenvolvimento

```
cd desktop-sync
npm install
npm start
```

## Rodar os testes

```
cd desktop-sync
npm test
```

## Gerar o instalador do Windows

```
cd desktop-sync
npm install
npm run build:win
```

O instalador sai em `dist-installer/Sincronização com a Nuvem Setup
X.X.X.exe`. **Sem assinatura digital** (custa dinheiro e exige processo à
parte) — o Windows vai avisar "protegido pelo computador" na primeira
instalação; é preciso clicar em "Mais informações" → "Executar assim
mesmo".

### Gerando no Linux (como foi feito aqui)

O `electron-builder` precisa do Wine pra editar o ícone/versão do `.exe`
mesmo gerando pra Windows a partir do Linux:

```
apt-get install -y --no-install-recommends wine64
dpkg --add-architecture i386 && apt-get update
apt-get install -y --no-install-recommends wine32:i386
```

## O que ainda falta / ideias pra próxima etapa

- Sincronizar exclusão de arquivo (hoje não sincroniza de propósito, pra
  evitar perda de dado por engano)
- Descer em subpastas (hoje só sincroniza os arquivos direto dentro da
  pasta escolhida)
- Assinatura digital do instalador (elimina o aviso do Windows)
- Atualização automática do programa (hoje precisa reinstalar na mão pra
  atualizar)
- Um jeito de revogar um token de sincronização específico antes dos 30
  dias (hoje só trocando o `SESSION_SECRET` do servidor inteiro, o que
  derruba todas as sessões de uma vez)
