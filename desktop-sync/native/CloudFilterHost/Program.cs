// CloudFilterHost — programa auxiliar em C# chamado pelo programa Electron
// principal, porque a API de "unidade de sincronização" do Windows
// (Windows.Storage.Provider) só existe em C++/C#, não em JavaScript.
//
// ATENÇÃO: este código NÃO foi compilado nem testado ainda — o ambiente
// onde foi escrito não tem acesso ao Windows nem ao NuGet pra validar.
// A primeira vez que ele roda de verdade é na máquina de quem for testar.
//
// ETAPA 1 (este arquivo): só registrar/desregistrar uma pasta como
// "unidade de sincronização" com nome e ícone próprios — sem ainda criar
// arquivo placeholder nenhum (isso é a próxima etapa, só depois de
// confirmar que esta parte funciona).
//
// Uso:
//   CloudFilterHost.exe check
//   CloudFilterHost.exe register <caminho-da-pasta> <nome-de-exibicao>
//   CloudFilterHost.exe unregister

using Windows.Storage;
using Windows.Storage.Provider;

// Fixo por enquanto — uma conta só. Se um dia o programa precisar
// sincronizar mais de uma conta/contrato como unidades separadas, cada
// uma precisa do seu próprio Id.
const string SyncRootId = "SupportMining.GestaoNuvem!ContaPadrao";

if (args.Length == 0)
{
    Console.WriteLine("Uso: CloudFilterHost.exe <check|register|unregister> [argumentos]");
    return 1;
}

string command = args[0].ToLowerInvariant();

try
{
    switch (command)
    {
        case "check":
        {
            bool supported = StorageProviderSyncRootManager.IsSupported();
            Console.WriteLine(supported ? "OK: suportado" : "ERRO: este Windows não suporta unidade de sincronização");
            return supported ? 0 : 1;
        }

        case "register":
        {
            if (args.Length < 3)
            {
                Console.WriteLine("Uso: CloudFilterHost.exe register <caminho-da-pasta> <nome-de-exibicao>");
                return 1;
            }
            string folderPath = args[1];
            string displayName = args[2];

            if (!Directory.Exists(folderPath))
            {
                Console.WriteLine($"ERRO: a pasta não existe: {folderPath}");
                return 1;
            }

            if (!StorageProviderSyncRootManager.IsSupported())
            {
                Console.WriteLine("ERRO: este Windows não suporta unidade de sincronização.");
                return 1;
            }

            var storageFolder = await StorageFolder.GetFolderFromPathAsync(folderPath);

            var info = new StorageProviderSyncRootInfo
            {
                // Identificador fixo — se mudar entre uma execução e outra,
                // o Windows entende que é uma unidade DIFERENTE.
                Id = SyncRootId,
                Path = storageFolder,
                DisplayNameResource = displayName,
                // Ícone próprio do sistema, copiado junto do .exe na
                // publicação — referenciado por caminho relativo ao
                // próprio executável (AppContext.BaseDirectory), pra
                // funcionar não importa onde o programa for instalado.
                // ",0" no final = primeiro ícone dentro do arquivo .ico.
                IconResource = Path.Combine(AppContext.BaseDirectory, "icon.ico") + ",0",
                Version = "1.0.0",
                // Por enquanto, sem placeholder — baixa tudo de verdade,
                // igual o programa já faz hoje. Só a aparência de "unidade
                // separada" muda nesta etapa.
                PopulationPolicy = StorageProviderPopulationPolicy.AlwaysFull,
                InSyncPolicy = StorageProviderInSyncPolicy.FileCreationTime
                    | StorageProviderInSyncPolicy.DirectoryCreationTime,
                HydrationPolicy = StorageProviderHydrationPolicy.Full,
                HydrationPolicyModifier = StorageProviderHydrationPolicyModifier.None,
                ShowSiblingsAsGroup = false,
            };

            StorageProviderSyncRootManager.Register(info);
            Console.WriteLine("OK: pasta registrada como unidade de sincronização.");
            return 0;
        }

        case "unregister":
        {
            // Usa o Id fixo direto, sem precisar procurar a partir da
            // pasta — GetSyncRootInformationForFolder exige marcações no
            // sistema de arquivos que só a etapa de placeholder (ainda não
            // implementada) cria; nesta etapa (só registro), a busca por
            // pasta falha mesmo com o registro tendo funcionado.
            StorageProviderSyncRootManager.Unregister(SyncRootId);
            Console.WriteLine("OK: unidade de sincronização removida.");
            return 0;
        }

        default:
            Console.WriteLine($"Comando desconhecido: {command}");
            return 1;
    }
}
catch (Exception ex)
{
    // Imprime o tipo exato da exceção, o código de erro do Windows em
    // hexadecimal (HResult) e a mensagem — o HResult é o que realmente
    // identifica o erro quando (como aconteceu) a mensagem vem vazia.
    Console.WriteLine($"ERRO: {ex.GetType().FullName} (HResult 0x{ex.HResult:X8}): {ex.Message}");
    if (ex.InnerException != null)
    {
        Console.WriteLine(
            $"CAUSA INTERNA: {ex.InnerException.GetType().FullName} (HResult 0x{ex.InnerException.HResult:X8}): {ex.InnerException.Message}"
        );
    }
    return 1;
}
