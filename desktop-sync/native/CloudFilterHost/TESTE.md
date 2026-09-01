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
dotnet run -- unregister C:\TesteNuvem
```

## Próximas etapas (só depois desta funcionar)

1. ~~Trocar o ícone genérico pelo ícone próprio do programa~~ — feito,
   ainda não testado. Pra ver o resultado: rode
   `dotnet run -- unregister C:\TesteNuvem` e depois
   `dotnet run -- register C:\TesteNuvem "Teste Nuvem"` de novo (o
   Explorador às vezes guarda o ícone antigo em cache, então desregistrar
   e registrar de novo garante que ele busca o ícone atualizado). Veja se
   agora aparece o ícone de nuvem laranja do sistema, em vez do genérico
   do Windows.
2. Implementar os arquivos "placeholder" (aparecem na pasta sem estar
   baixados de verdade, baixam sozinhos quando abertos — a parte que
   falta pra ficar 100% igual ao Drive)
3. Integrar isso ao programa Electron principal (por enquanto, teste como
   um programa separado, de propósito, pra isolar problemas)
