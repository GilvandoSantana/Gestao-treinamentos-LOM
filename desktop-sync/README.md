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

**Toda vez que baixar o projeto de novo do zero** (ZIP novo do GitHub —
`npm install` e a publicação do CloudFilterHost não vêm junto, só o
código-fonte):

```
cd desktop-sync
npm install
npm start
```

O `npm install` já publica o CloudFilterHost sozinho automaticamente
(via um passo chamado "postinstall") — não precisa mais rodar nada
separado. Se por algum motivo isso falhar (por exemplo, o .NET 8 SDK
não estiver instalado), o `npm install` mesmo assim termina normal, só
avisa — nesse caso, instale o .NET e rode:

```
npm run publish-cloudfilterhost
```

**Dica pra evitar ter que repetir isso toda vez**: se instalar o Git no
computador e usar `git clone` uma vez (em vez de baixar o ZIP), depois
só precisa de `git pull` pra atualizar — a pasta continua a mesma, e só
precisa rodar `npm install` de novo se `package.json` ou o código do
CloudFilterHost tiverem mudado.

## Rodar os testes

```
cd desktop-sync
npm test
```

## Publicar uma versão nova (pra atualização automática funcionar)

O programa já instalado confere sozinho, ao abrir e a cada 6 horas, se
existe uma versão mais nova publicada — e se existir, baixa e instala
sozinho (perguntando antes de reiniciar). Isso só funciona se a versão
nova for publicada do jeito certo:

1. Aumente o número da versão em `desktop-sync/package.json` (campo
   `"version"`) — por exemplo, de `"1.0.0"` pra `"1.1.0"`.
2. Gere o instalador de novo (numa máquina Windows, como sempre):
   ```
   cd desktop-sync
   npm install
   npm run build:win
   ```
3. Na pasta `dist-installer/`, vão aparecer (entre outros) estes três
   arquivos — são os que importam:
   - `Sincronização com a Nuvem Setup X.Y.Z.exe`
   - `Sincronização com a Nuvem Setup X.Y.Z.exe.blockmap`
   - `latest.yml`
4. No GitHub, vá em **Releases** (na página principal do repositório) →
   **Draft a new release**. Crie uma tag no formato `vX.Y.Z` (com o "v"
   na frente, batendo com a versão do `package.json` — por exemplo,
   `v1.1.0`), escreva um título/descrição curta do que mudou, e
   **anexe os três arquivos do passo 3** (arraste pra caixa de anexos).
5. Clique em **Publish release**.

A partir daí, qualquer instalação já existente do programa vai
encontrar essa versão na próxima checagem (na hora, se a pessoa reabrir
o programa, ou em até 6 horas se já estiver aberto) e se atualizar
sozinha. **Sem os três arquivos anexados certinho** (principalmente o
`latest.yml`), a atualização automática não encontra nada — o Release
sozinho, sem os arquivos, não é o suficiente.

## Gerar o instalador do Windows

```
cd desktop-sync
npm install
npm run build:win
```

Como o `npm install` já publica o CloudFilterHost sozinho (via
postinstall), e a configuração do instalador já sabe pegar esse arquivo
publicado e colocar dentro do pacote final (`extraResources` no
`package.json`), rodando esses três comandos nessa ordem, **numa
máquina Windows de verdade**, o instalador gerado já sai com tudo
funcionando — incluindo o modo "arquivo aparece na hora, baixa quando
abre" — sem precisar de nenhum passo manual extra.

**Importante**: gere o instalador final sempre numa máquina Windows de
verdade (não aqui no ambiente de desenvolvimento) — só lá o
`dotnet publish` produz o `CloudFilterHost.exe` de verdade, pronto pra
ir dentro do instalador.

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

- Assinatura digital do instalador (elimina o aviso do Windows na
  instalação) — exige processo pago à parte, fora do escopo por agora
- Um jeito de revogar um token de sincronização específico antes dos 30
  dias (hoje só trocando o `SESSION_SECRET` do servidor inteiro, o que
  derruba todas as sessões de uma vez)

### Já resolvido (histórico, pra referência)

Unidade de sincronização com ícone próprio; arquivo aparece na hora e
baixa quando abre (placeholder de verdade via CfAPI do Windows);
estrutura inteira de pastas (inclusive vazias e restritas a grupo);
atualização periódica pra pegar mudança de outra pessoa; criar/editar
arquivo ou pasta local sobe sozinho pra Nuvem; sincronizar exclusão nos
dois sentidos (com freio de emergência contra exclusão em massa);
empacotamento do CloudFilterHost.exe dentro do instalador final;
atualização automática do programa via Releases do GitHub.
