# CloudFilterHost — etapa experimental (unidade de sincronização estilo Drive)

**Aviso importante**: este código nunca foi compilado nem testado. Eu
(Claude) não tenho acesso a Windows nem ao repositório de pacotes NuGet no
ambiente onde escrevo código — cheguei até confirmar que a estrutura do
projeto está correta (compila até o ponto de baixar pacotes), mas a partir
daí só dá pra continuar testando na sua máquina Windows de verdade.

Isso é bem diferente do resto do programa (`desktop-sync/`), que testei
várias vezes antes de te entregar. Aqui, cada etapa vai exigir você
compilar, rodar, e me contar exatamente o que apareceu — inclusive erros.

## O que esta etapa faz (e o que ainda NÃO faz)

Registra uma pasta como "unidade de sincronização" do Windows — o mesmo
mecanismo que faz o Google Drive aparecer como unidade separada em "Este
Computador". **Não baixa sob demanda ainda** (isso é uma etapa futura, só
depois de confirmar que esta parte funciona) — por enquanto baixa tudo
igual o programa já faz hoje, só muda a aparência.

## Pré-requisitos na sua máquina

1. **.NET 8 SDK** — baixe em https://dotnet.microsoft.com/download/dotnet/8.0
   (escolha "SDK", não só "Runtime"). Depois de instalar, abra o
   PowerShell e confirme com `dotnet --version` (deve mostrar `8.0.x`).
2. Windows 10 versão 2004 (build 19041, "atualização de maio de 2020") ou
   mais novo, ou Windows 11 — confirmado após o primeiro teste real
   (versões mais antigas não têm a API `IsSupported()` que o programa usa).

## Como testar

1. Baixe/copie a pasta `desktop-sync/native/CloudFilterHost/` pro seu
   computador (junto com o resto do projeto, do GitHub).
2. Abra o PowerShell **dentro dessa pasta** (`cd caminho\para\CloudFilterHost`).
3. Rode:
   ```
   dotnet build
   ```
4. **Me mande exatamente o que aparecer.** Se der erro, copie a mensagem
   inteira — não resuma, quero o texto exato.
5. Se compilar sem erro, rode:
   ```
   dotnet run -- check
   ```
   Isso só confirma se o seu Windows suporta o recurso. Deve responder
   `OK: suportado`.
6. Se der `OK`, teste o registro de verdade com uma pasta de teste
   qualquer (crie uma pasta vazia só pra esse teste, tipo
   `C:\TesteNuvem`):
   ```
   dotnet run -- register C:\TesteNuvem "Teste Nuvem"
   ```
7. Depois do comando, **abra o Explorador de Arquivos e veja se
   `C:\TesteNuvem` aparece na barra lateral esquerda**, com o nome "Teste
   Nuvem" e um ícone diferente de pasta comum (deve aparecer um ícone
   parecido com nuvem, ainda o genérico do Windows por enquanto).
8. Me conte o que apareceu — funcionou, não apareceu nada, deu erro,
   apareceu mas diferente do esperado, etc. Quanto mais detalhe (inclusive
   uma captura de tela, se possível), mais rápido eu consigo ajustar.

## Para desfazer o teste

```
dotnet run -- unregister
```

## Próximas etapas (só depois desta funcionar)

1. ~~Trocar o ícone genérico pelo ícone próprio do programa~~ — confirmado
   funcionando (você já viu o ícone laranja aparecer).
2. **Etapa atual — arquivo "placeholder" (aparece sem estar baixado,
   baixa quando abre)**. Esta é de longe a parte mais arriscada de todo o
   projeto — usa um pacote de terceiros (Vanara.PInvoke.CldApi, não é da
   Microsoft) pra falar com uma API do Windows bem mais complexa. É bem
   provável que precise de várias rodadas de ajuste.

   **Antes de testar, use uma pasta totalmente NOVA** (não `C:\TesteNuvem` de novo — essa pasta já foi registrada/desregistrada várias vezes com configurações diferentes ao longo dos nossos testes, e pode ter ficado algum estado antigo em cache no Windows atrapalhando). Faça assim, do zero:
   ```
   dotnet run -- unregister
   mkdir C:\TesteNuvem2
   dotnet run -- register C:\TesteNuvem2 "Teste Nuvem"
   dotnet run -- placeholder-test C:\TesteNuvem2
   ```

   O programa vai:
   - Tentar se conectar à pasta como "fornecedor" de sincronização
   - Criar um arquivo chamado `arquivo-de-teste-da-nuvem.txt` dentro dela
   - Ficar esperando (não feche a janela do PowerShell ainda)

   **Aí você testa**: abra esse arquivo (pode ser com clique duplo, abre
   no Bloco de Notas) e veja se aparece um texto de teste em inglês
   dizendo que veio do callback de hidratação. Volte no PowerShell e veja
   se apareceu a linha `--> Callback FETCH_DATA disparado!`.

   **Me mande**: a saída completa do PowerShell (do `dotnet run` até
   você apertar Enter pra sair), se o arquivo abriu com o texto certo ou
   deu erro/veio vazio, e se possível uma captura de tela do arquivo
   aberto.
3. Só depois de tudo isso funcionar: conectar de verdade com os arquivos
   da Nuvem (em vez do texto fixo de teste), e integrar ao programa
   Electron principal.

## Etapa 3 — arquivo de verdade da Nuvem (confirmado: etapa 2 funcionou!)

A etapa 2 (placeholder com texto fixo) **já foi confirmada funcionando**
na sua máquina. Agora vamos testar a mesma coisa, mas baixando um
arquivo de verdade da Nuvem, em vez de um texto fixo de mentira.

1. Baixe a atualização.
2. Rode o script que busca um arquivo de verdade da sua Nuvem (na pasta
   `desktop-sync/scripts`, não na `CloudFilterHost`):
   ```
   cd ..\..\scripts
   node get-real-file-for-test.js https://gestao-treinamentos-lom.up.railway.app "" "sua-senha-aqui"
   ```
   (deixe as aspas vazias `""` no lugar do usuário se você usa o acesso
   mestre; senão, coloque seu usuário entre as aspas)
3. O script vai imprimir um comando pronto, algo como:
   ```
   dotnet run -- placeholder-real-test C:\TesteNuvem2 "nome-do-arquivo.pdf" 123456 "https://..."
   ```
4. Copie e cole esse comando **de volta na pasta CloudFilterHost**
   (`cd ..\native\CloudFilterHost` antes de rodar).
5. Abra o arquivo que aparecer em `C:\TesteNuvem2` e confira se o
   conteúdo bate com o arquivo de verdade que está na Nuvem (mesmo
   conteúdo, mesmo tamanho, abre normal).
6. Me conta o resultado — funcionou, o arquivo abriu certo, ou deu erro
   (nesse caso, a saída completa de novo).
